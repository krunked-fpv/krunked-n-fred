// ============================================================================
// Krunked & Fred — Web Audio Engine, 11-Track Dual-Deck Sequencer & Stingers
// Implements AudioModulePort with lazy gesture unlock, gain bus mixing,
// polyphony cap (16), per-event cooldowns, +/-6% pitch jitter, camera-relative
// stereo panning, ambient wind bed, altitude-reactive equal-power crossfading
// across all 11 Jukebox tracks, CustomAudioLoader integration, and crisp
// celebratory stingers. Pure Web Audio API, zero external deps, SSR-safe.
// ============================================================================

import {
  PHYSICS,
  WORLD,
  type AudioModulePort,
  type AudioSettings,
  type BiomeId,
  type JukeboxTrackId,
  type MedalTier,
  type SimEvent,
  type SimState,
} from '../contracts';
import { CustomAudioLoader } from './CustomAudioLoader';
import {
  JUKEBOX_TRACK_DATA,
  RANDOM_PLAYLIST_ORDER,
  getBiomeDefaultTrack,
  getDeterministicRandomTrack,
  midiToHz,
  type JukeboxTrackData,
  type PercHit,
  type PlayableTrackId,
} from './JukeboxTracks';
import {
  ProceduralSynth,
  type UiSoundKind,
  type VoiceHandle,
  type WindBedHandle,
} from './ProceduralSynth';

const MAX_SFX_VOICES = 16;
const PITCH_JITTER_RANGE = 0.06; // +/- 6%
const LOOKAHEAD_SEC = 0.14;
const CROSSFADE_DURATION_SEC = 1.4;
const RANDOM_LOOPS_PER_TRACK = 2;
const HALF_VIEW_TILES = PHYSICS.VIEWPORT_TILES_X * 0.5;

const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  master: 0.8,
  music: 0.65,
  sfx: 0.85,
  muted: false,
  jukeboxTrack: 'Base',
};

interface MusicDeck {
  bus: GainNode;
  trackId: PlayableTrackId;
  stepIndex: number;
  nextStepTime: number;
  loopsCompleted: number;
  customSource: AudioBufferSourceNode | null;
  customTrackId: PlayableTrackId | null;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function safeFreq(hz: number, sampleRate: number): number {
  const maxHz = Math.max(4000, sampleRate * 0.45);
  return clamp(hz, 24, maxHz);
}

function jitterPitch(range = PITCH_JITTER_RANGE): number {
  return 1 + (Math.random() * 2 - 1) * range;
}

function toPlayableTrackId(id: JukeboxTrackId): PlayableTrackId {
  return id === 'Random' ? 'Track1' : id;
}

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const win = window as Window & {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return win.AudioContext ?? win.webkitAudioContext ?? null;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled SimEvent: ${JSON.stringify(value)}`);
}

export class AudioEngine implements AudioModulePort {
  private ctx: AudioContext | null = null;
  private synth: ProceduralSynth | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicDuckGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private windBed: WindBedHandle | null = null;
  private percNoiseBuffer: AudioBuffer | null = null;

  // Dual-deck A/B music architecture for seamless equal-power crossfading
  private decks: [MusicDeck, MusicDeck] | null = null;
  private activeDeckIndex: 0 | 1 = 0;
  private crossfadeT = 1.0;

  private settings: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };
  private unlocked = false;
  private disposed = false;

  // Polyphony tracking (strictly capped at MAX_SFX_VOICES = 16)
  private activeVoices: VoiceHandle[] = [];

  // Per-event micro-cooldowns (in milliseconds on monotonic clock)
  private readonly lastEventMs = new Map<string, number>();

  // Altitude-reactive & deterministic Random playlist tracking
  private currentBiome: BiomeId = 'village';
  private currentAltitude = 0;
  private currentDarkness = 0;
  private randomCycleIndex = 0;

  // Lazy custom audio pack decoder & cache
  private readonly customLoader = new CustomAudioLoader();

  unlock(): void {
    if (this.disposed) return;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return;

    try {
      if (!this.ctx) {
        const ctx = new Ctor();
        this.ctx = ctx;
        this.synth = new ProceduralSynth(ctx);
        this.customLoader.attachContext(ctx);
        this.percNoiseBuffer = this.createPercNoiseBuffer(ctx, 0.6);

        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-12, ctx.currentTime);
        compressor.knee.setValueAtTime(16, ctx.currentTime);
        compressor.ratio.setValueAtTime(6, ctx.currentTime);
        compressor.attack.setValueAtTime(0.004, ctx.currentTime);
        compressor.release.setValueAtTime(0.14, ctx.currentTime);

        const masterGain = ctx.createGain();
        const musicGain = ctx.createGain();
        const musicDuckGain = ctx.createGain();
        const sfxGain = ctx.createGain();
        const deckABus = ctx.createGain();
        const deckBBus = ctx.createGain();

        musicDuckGain.gain.setValueAtTime(1, ctx.currentTime);
        deckABus.gain.setValueAtTime(1, ctx.currentTime);
        deckBBus.gain.setValueAtTime(0, ctx.currentTime);

        deckABus.connect(musicDuckGain);
        deckBBus.connect(musicDuckGain);
        musicDuckGain.connect(musicGain);
        musicGain.connect(compressor);
        sfxGain.connect(compressor);
        compressor.connect(masterGain);
        masterGain.connect(ctx.destination);

        this.compressor = compressor;
        this.masterGain = masterGain;
        this.musicGain = musicGain;
        this.musicDuckGain = musicDuckGain;
        this.sfxGain = sfxGain;
        this.windBed = this.synth.createWindBed(sfxGain);

        const initialTrack = this.resolveInitialTrack();
        const startAt = ctx.currentTime + 0.06;
        this.decks = [
          {
            bus: deckABus,
            trackId: initialTrack,
            stepIndex: 0,
            nextStepTime: startAt,
            loopsCompleted: 0,
            customSource: null,
            customTrackId: null,
          },
          {
            bus: deckBBus,
            trackId: initialTrack,
            stepIndex: 0,
            nextStepTime: startAt,
            loopsCompleted: 0,
            customSource: null,
            customTrackId: null,
          },
        ];
        this.activeDeckIndex = 0;
        this.crossfadeT = 1.0;

        this.applyBusGains(true);
      }

      this.unlocked = true;
      if (this.ctx.state === 'suspended') {
        const p = this.ctx.resume();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            // Autoplay policy may block until a trusted user gesture; fail silently
          });
        }
      }
    } catch {
      // Never throw if audio hardware or Web Audio API is unavailable/blocked
    }
  }

  applySettings(settings: AudioSettings): void {
    if (this.disposed) return;
    const prevTrack = this.settings.jukeboxTrack;
    this.settings = {
      master: clamp(settings.master, 0, 1),
      music: clamp(settings.music, 0, 1),
      sfx: clamp(settings.sfx, 0, 1),
      muted: Boolean(settings.muted),
      jukeboxTrack: settings.jukeboxTrack,
    };

    if (settings.jukeboxTrack === 'Random' && prevTrack !== 'Random') {
      // Deterministic start / advance when entering Random playlist mode
      this.randomCycleIndex = this.randomCycleIndex % RANDOM_PLAYLIST_ORDER.length;
    }

    if (this.ctx && this.decks) {
      const target = this.resolveTargetTrackFromCachedState();
      this.ensureTrackTarget(target, this.ctx.currentTime);
    }

    this.applyBusGains(false);
  }

  setCustomAudioPack(urls: Record<string, string>): void {
    if (this.disposed) return;
    this.stopAllCustomMusicLoops();
    this.customLoader.setUrls(urls);
  }

  /**
   * Optional helper to probe /.krunked-n-fred-assets/manifest.json lazily
   * for standalone custom audio packs without throwing on 404.
   */
  probeCustomAudioPack(): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    return this.customLoader.probeServerPack();
  }

  getCustomAudioLoader(): CustomAudioLoader {
    return this.customLoader;
  }

  getActiveTrackId(): PlayableTrackId {
    if (this.decks) {
      return this.decks[this.activeDeckIndex].trackId;
    }
    return this.resolveTargetTrackFromCachedState();
  }

  getCrossfadeProgress(): number {
    return this.crossfadeT;
  }

  playUiSound(kind: UiSoundKind): void {
    if (this.disposed || !this.unlocked || !this.ctx || !this.synth || !this.sfxGain) return;
    if (this.ctx.state === 'closed' || this.settings.muted || this.settings.sfx <= 0.001) return;

    const cooldownKey = `ui:${kind}`;
    if (!this.checkCooldown(cooldownKey, 50)) return;
    if (!this.reserveVoiceSlot(3)) return;

    let handle: VoiceHandle | null = null;
    let endedEarly = false;
    const onVoiceEnd = (): void => {
      if (handle) this.releaseVoice(handle);
      else endedEarly = true;
    };
    handle = this.synth.playUiSound(this.sfxGain, kind, { onVoiceEnd });
    if (!endedEarly) this.trackVoice(handle);
  }

  consumeEvents(events: SimEvent[], state: SimState): void {
    if (this.disposed || events.length === 0) return;
    if (!this.ctx || !this.synth || !this.sfxGain) return;
    if (this.ctx.state !== 'running') return;
    if (this.settings.muted || this.settings.sfx <= 0.001) {
      // Still track wind stop state cleanly when muted
      for (const ev of events) {
        if (ev.type === 'wind_stop') this.windBed?.setActive(false);
      }
      return;
    }

    for (const event of events) {
      this.handleSimEvent(event, state);
    }
  }

  update(state: SimState, dt: number): void {
    if (this.disposed) return;
    this.currentBiome = state.currentBiome;
    this.currentAltitude = Number.isFinite(state.altitude) ? state.altitude : 0;
    this.currentDarkness = clamp(state.camera?.darknessAlpha ?? 0, 0, 1);

    if (!this.ctx || !this.synth || !this.decks) return;
    const now = this.ctx.currentTime;

    if (this.ctx.state !== 'running') {
      this.decks[0].nextStepTime = now + 0.05;
      this.decks[1].nextStepTime = now + 0.05;
      return;
    }

    const safeDt = clamp(Number.isFinite(dt) ? dt : 0.016, 0, 0.25);
    this.pruneExpiredVoices();

    // 1. Sync continuous ambient wind bed with live simulation wind state
    if (this.windBed) {
      const activeWind = state.windActive && state.windPhase === 'active' && !this.settings.muted;
      this.windBed.setDirection(state.windDir);
      this.windBed.setActive(activeWind, 1.0);
    }

    // 2. Subtle low-stamina grab sweat/strain micro-tick (cooldown >= 160ms)
    if (!this.settings.muted && this.settings.sfx > 0.001) {
      this.checkGrabStrain(state.p1, state);
      this.checkGrabStrain(state.p2, state);
    }

    // 3. Resolve altitude-reactive / jukebox target track & advance equal-power crossfade
    const targetTrack = this.resolveTargetTrack(state);
    this.ensureTrackTarget(targetTrack, now);

    if (this.crossfadeT < 1.0) {
      this.crossfadeT = Math.min(1.0, this.crossfadeT + safeDt / CROSSFADE_DURATION_SEC);
    }

    const activeDeck = this.decks[this.activeDeckIndex];
    const outgoingDeck = this.decks[this.activeDeckIndex === 0 ? 1 : 0];

    // True equal-power crossfade curves: sin^2(x) + cos^2(x) === 1.0
    const inGain = Math.sin(this.crossfadeT * Math.PI * 0.5);
    const outGain = Math.cos(this.crossfadeT * Math.PI * 0.5);

    activeDeck.bus.gain.setTargetAtTime(inGain, now, 0.035);
    outgoingDeck.bus.gain.setTargetAtTime(outGain, now, 0.035);

    // Stop outgoing custom BGM loop cleanly once crossfade completes
    if (this.crossfadeT >= 1.0 && outgoingDeck.customSource) {
      this.stopDeckCustomLoop(outgoingDeck);
    }

    // 4. Lookahead music sequencer for active (and fading-out) decks
    if (this.settings.muted || this.settings.music <= 0.001) {
      this.stopAllCustomMusicLoops();
      activeDeck.nextStepTime = now + 0.05;
      outgoingDeck.nextStepTime = now + 0.05;
      return;
    }

    const altitudeEnergy = this.computeAltitudeEnergy(state);

    this.advanceMusicDeck(activeDeck, now, inGain, altitudeEnergy, true);
    if (outGain > 0.015) {
      this.advanceMusicDeck(outgoingDeck, now, outGain, altitudeEnergy, false);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    for (const voice of [...this.activeVoices]) {
      voice.stop(0.01);
    }
    this.activeVoices = [];
    this.lastEventMs.clear();

    this.stopAllCustomMusicLoops();
    this.customLoader.dispose();

    this.windBed?.dispose();
    this.windBed = null;

    if (this.ctx) {
      try {
        if (this.ctx.state !== 'closed') {
          const p = this.ctx.close();
          if (p && typeof p.catch === 'function') {
            p.catch(() => {});
          }
        }
      } catch {
        // Ignore close errors
      }
    }

    this.ctx = null;
    this.synth = null;
    this.compressor = null;
    this.masterGain = null;
    this.musicGain = null;
    this.musicDuckGain = null;
    this.sfxGain = null;
    this.decks = null;
    this.percNoiseBuffer = null;
  }

  /** Exposed read-only diagnostics for testing / debugging */
  getActiveVoiceCount(): number {
    this.pruneExpiredVoices();
    return this.activeVoices.length;
  }

  private pruneExpiredVoices(): void {
    if (!this.ctx || this.activeVoices.length === 0) return;
    const now = this.ctx.currentTime;
    let write = 0;
    for (let i = 0; i < this.activeVoices.length; i++) {
      const v = this.activeVoices[i];
      if (now < v.endTime + 0.02) {
        this.activeVoices[write++] = v;
      }
    }
    this.activeVoices.length = write;
  }

  // ==========================================================================
  // Internal Mixing, Panning, Ducking, Cooldowns & Polyphony Cap
  // ==========================================================================

  private applyBusGains(immediate: boolean): void {
    if (!this.ctx || !this.masterGain || !this.musicGain || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const masterVal = this.settings.muted ? 0 : this.settings.master;
    const musicVal = this.settings.music;
    const sfxVal = this.settings.sfx;

    if (immediate) {
      this.masterGain.gain.setValueAtTime(masterVal, now);
      this.musicGain.gain.setValueAtTime(musicVal, now);
      this.sfxGain.gain.setValueAtTime(sfxVal, now);
    } else {
      this.masterGain.gain.setTargetAtTime(masterVal, now, 0.025);
      this.musicGain.gain.setTargetAtTime(musicVal, now, 0.025);
      this.sfxGain.gain.setTargetAtTime(sfxVal, now, 0.025);
    }
  }

  private duckMusic(duckLevel: number, holdSec: number, releaseSec = 0.65): void {
    if (!this.ctx || !this.musicDuckGain) return;
    const now = this.ctx.currentTime;
    const target = clamp(duckLevel, 0.15, 1.0);
    const param = this.musicDuckGain.gain;
    try {
      param.cancelScheduledValues(now);
      param.setValueAtTime(clamp(param.value, 0.1, 1.0), now);
      param.linearRampToValueAtTime(target, now + 0.05);
      param.setValueAtTime(target, now + 0.05 + Math.max(0.1, holdSec));
      param.linearRampToValueAtTime(1.0, now + 0.05 + Math.max(0.1, holdSec) + Math.max(0.15, releaseSec));
    } catch {
      // Ignore automation errors on closing context
    }
  }

  private panFromWorldX(worldX: number, state: SimState): number {
    const dx = worldX - state.camera.x;
    return clamp(dx / Math.max(1, HALF_VIEW_TILES), -0.85, 0.85);
  }

  private nowMs(): number {
    return this.ctx ? this.ctx.currentTime * 1000 : Date.now();
  }

  private checkCooldown(key: string, minMs: number): boolean {
    const now = this.nowMs();
    const prev = this.lastEventMs.get(key);
    if (prev !== undefined && now - prev < minMs) {
      return false;
    }
    this.lastEventMs.set(key, now);
    return true;
  }

  private reserveVoiceSlot(priority: number): boolean {
    this.pruneExpiredVoices();
    if (this.activeVoices.length < MAX_SFX_VOICES) {
      return true;
    }
    let victimIdx = -1;
    for (let i = 0; i < this.activeVoices.length; i++) {
      if (this.activeVoices[i].priority < priority) {
        victimIdx = i;
        break;
      }
    }
    if (victimIdx === -1 && priority >= 3 && this.activeVoices.length > 0) {
      victimIdx = 0;
    }
    if (victimIdx === -1) {
      return false;
    }
    const victim = this.activeVoices[victimIdx];
    this.activeVoices.splice(victimIdx, 1);
    victim.stop(0.012);
    return true;
  }

  private trackVoice(handle: VoiceHandle | null): void {
    if (!handle) return;
    this.activeVoices.push(handle);
  }

  private releaseVoice(handle: VoiceHandle): void {
    const idx = this.activeVoices.indexOf(handle);
    if (idx !== -1) {
      this.activeVoices.splice(idx, 1);
    }
  }

  private checkGrabStrain(p: SimState['p1'], state: SimState): void {
    if (!this.synth || !this.sfxGain) return;
    if (p.action !== 'Grab' || p.grabRedTint < 0.72) return;
    const intervalMs = Math.max(160, 340 - (p.grabRedTint - 0.72) * 580);
    if (!this.checkCooldown(`sweat:${p.id}`, intervalMs)) return;
    if (!this.reserveVoiceSlot(0)) return;

    let handle: VoiceHandle | null = null;
    const onVoiceEnd = (): void => {
      if (handle) this.releaseVoice(handle);
    };
    handle = this.synth.playGrabStrainTick(this.sfxGain, p.grabRedTint, {
      pan: this.panFromWorldX(p.x, state),
      pitchMult: jitterPitch(),
      onVoiceEnd,
    });
    this.trackVoice(handle);
  }

  // ==========================================================================
  // Custom Audio Pack Playback (via CustomAudioLoader + Procedural Fallback)
  // ==========================================================================

  private tryPlayCustomSample(
    keys: readonly string[],
    pan: number,
    volume: number,
    pitchMult: number,
    priority: number
  ): boolean {
    if (!this.ctx || !this.sfxGain) return false;
    const cached = this.customLoader.getBufferSync(keys);
    if (!cached) return false;

    if (!this.reserveVoiceSlot(priority)) return true;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = cached;
    const rate = clamp(pitchMult, 0.5, 2.0);
    src.playbackRate.setValueAtTime(rate, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(clamp(volume, 0, 1.5), now);

    let panNode: StereoPannerNode | null = null;
    if (typeof this.ctx.createStereoPanner === 'function') {
      panNode = this.ctx.createStereoPanner();
      panNode.pan.setValueAtTime(clamp(pan, -0.85, 0.85), now);
      src.connect(gain);
      gain.connect(panNode);
      panNode.connect(this.sfxGain);
    } else {
      src.connect(gain);
      gain.connect(this.sfxGain);
    }

    let ended = false;
    const handle: VoiceHandle = {
      priority,
      endTime: now + cached.duration / rate + 0.02,
      stop: (fadeSec = 0.015): void => {
        if (ended || !this.ctx) return;
        ended = true;
        const t = this.ctx.currentTime;
        try {
          gain.gain.linearRampToValueAtTime(0, t + Math.max(0.005, fadeSec));
          src.stop(t + Math.max(0.006, fadeSec) + 0.004);
        } catch {
          // Ignore stop errors
        }
        this.releaseVoice(handle);
      },
    };
    src.onended = () => {
      if (ended) return;
      ended = true;
      try {
        src.disconnect();
        gain.disconnect();
        panNode?.disconnect();
      } catch {
        // Ignore cleanup errors
      }
      this.releaseVoice(handle);
    };
    this.trackVoice(handle);
    src.start(now);
    return true;
  }

  // ==========================================================================
  // Crisp Celebratory Stinger Shimmer Accent Helper
  // Layers harmonic bells/sparkles cleanly inside a single VoiceHandle.
  // ==========================================================================

  private createCompositeStinger(
    baseVoice: VoiceHandle,
    shimmerNotes: readonly { offset: number; freq: number; dur: number; wave: OscillatorType; gain: number }[],
    priority: number,
    onAccentEnd: () => void
  ): VoiceHandle {
    if (!this.ctx || !this.sfxGain || shimmerNotes.length === 0) {
      onAccentEnd();
      return baseVoice;
    }

    const ctx = this.ctx;
    const sr = ctx.sampleRate || 44100;
    const tBase = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(1, tBase);
    out.connect(this.sfxGain);

    const oscs: OscillatorNode[] = [];
    let maxEnd = baseVoice.endTime;

    for (const note of shimmerNotes) {
      const t0 = tBase + Math.max(0, note.offset);
      const dur = Math.max(0.03, note.dur);
      const t1 = t0 + dur;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = note.wave;
      osc.frequency.setValueAtTime(safeFreq(note.freq, sr), t0);

      const peak = Math.max(0.0002, note.gain);
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.linearRampToValueAtTime(peak, t0 + Math.min(0.008, dur * 0.25));
      env.gain.exponentialRampToValueAtTime(0.0001, Math.max(t0 + 0.014, t1 - 0.006));
      env.gain.linearRampToValueAtTime(0, t1);

      osc.connect(env);
      env.connect(out);
      osc.start(t0);
      osc.stop(t1 + 0.01);
      oscs.push(osc);
      if (t1 + 0.01 > maxEnd) maxEnd = t1 + 0.01;
    }

    let cleaned = false;
    const cleanupAccent = (): void => {
      if (cleaned) return;
      cleaned = true;
      try {
        out.disconnect();
      } catch {
        // Ignore
      }
      onAccentEnd();
    };

    const lastOsc = oscs[oscs.length - 1];
    if (lastOsc) {
      lastOsc.onended = cleanupAccent;
    }

    return {
      priority,
      endTime: maxEnd,
      stop: (fadeSec = 0.015): void => {
        baseVoice.stop(fadeSec);
        if (cleaned) return;
        const t = ctx.currentTime;
        try {
          out.gain.cancelScheduledValues(t);
          out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), t);
          out.gain.linearRampToValueAtTime(0, t + Math.max(0.005, fadeSec));
        } catch {
          // Ignore
        }
        const stopAt = t + Math.max(0.006, fadeSec) + 0.004;
        for (const osc of oscs) {
          try {
            osc.stop(stopAt);
          } catch {
            // Already stopped
          }
        }
        cleanupAccent();
      },
    };
  }

  private playCelebratoryBossDefeated(onVoiceEnd: () => void): VoiceHandle | null {
    if (!this.synth || !this.sfxGain) return null;
    this.duckMusic(0.32, 1.35, 0.75);
    let baseDone = false;
    let accentDone = false;
    const tryFinish = (): void => {
      if (baseDone && accentDone) onVoiceEnd();
    };
    const base = this.synth.playBossDefeated(this.sfxGain, {
      pan: 0,
      onVoiceEnd: () => {
        baseDone = true;
        tryFinish();
      },
    });
    return this.createCompositeStinger(
      base,
      [
        { offset: 0.14, freq: 1046.5, dur: 0.14, wave: 'sine', gain: 0.14 },
        { offset: 0.38, freq: 1567.98, dur: 0.18, wave: 'sine', gain: 0.16 },
        { offset: 0.50, freq: 2093.0, dur: 0.24, wave: 'sine', gain: 0.15 },
        { offset: 0.84, freq: 2093.0, dur: 0.62, wave: 'sine', gain: 0.18 },
        { offset: 0.96, freq: 2637.02, dur: 0.52, wave: 'sine', gain: 0.14 },
      ],
      4,
      () => {
        accentDone = true;
        tryFinish();
      }
    );
  }

  private playCelebratorySummitReached(noAssist: boolean, onVoiceEnd: () => void): VoiceHandle | null {
    if (!this.synth || !this.sfxGain) return null;
    this.duckMusic(0.35, 1.45, 0.8);
    let baseDone = false;
    let accentDone = false;
    const tryFinish = (): void => {
      if (baseDone && accentDone) onVoiceEnd();
    };
    const base = this.synth.playSummitReached(this.sfxGain, noAssist, {
      pan: 0,
      onVoiceEnd: () => {
        baseDone = true;
        tryFinish();
      },
    });
    const shimmer = [
      { offset: 0.38, freq: 2093.0, dur: 0.28, wave: 'sine' as OscillatorType, gain: 0.12 },
      { offset: 0.86, freq: 1567.98, dur: 0.68, wave: 'triangle' as OscillatorType, gain: 0.14 },
      { offset: 0.88, freq: 2093.0, dur: 0.68, wave: 'sine' as OscillatorType, gain: 0.16 },
      ...(noAssist
        ? [
            { offset: 1.04, freq: 2637.02, dur: 0.55, wave: 'sine' as OscillatorType, gain: 0.15 },
            { offset: 1.18, freq: 3135.96, dur: 0.58, wave: 'sine' as OscillatorType, gain: 0.14 },
          ]
        : []),
    ];
    return this.createCompositeStinger(base, shimmer, 4, () => {
      accentDone = true;
      tryFinish();
    });
  }

  private playCelebratoryTimeTrialFinish(medal: MedalTier, onVoiceEnd: () => void): VoiceHandle | null {
    if (!this.synth || !this.sfxGain) return null;
    this.duckMusic(0.42, 0.9, 0.55);
    let baseDone = false;
    let accentDone = false;
    const tryFinish = (): void => {
      if (baseDone && accentDone) onVoiceEnd();
    };
    const base = this.synth.playTimeTrialFinish(this.sfxGain, medal, {
      pan: 0,
      onVoiceEnd: () => {
        baseDone = true;
        tryFinish();
      },
    });
    const shimmer =
      medal === 'platinum'
        ? [
            { offset: 0.06, freq: 1567.98, dur: 0.16, wave: 'sine' as OscillatorType, gain: 0.14 },
            { offset: 0.16, freq: 2093.0, dur: 0.2, wave: 'sine' as OscillatorType, gain: 0.15 },
            { offset: 0.28, freq: 2637.02, dur: 0.28, wave: 'sine' as OscillatorType, gain: 0.16 },
            { offset: 0.36, freq: 3135.96, dur: 0.48, wave: 'sine' as OscillatorType, gain: 0.17 },
          ]
        : medal === 'gold'
          ? [
              { offset: 0.14, freq: 1567.98, dur: 0.2, wave: 'sine' as OscillatorType, gain: 0.13 },
              { offset: 0.28, freq: 2349.32, dur: 0.42, wave: 'sine' as OscillatorType, gain: 0.15 },
            ]
          : [
              { offset: 0.22, freq: 1760.0, dur: 0.34, wave: 'sine' as OscillatorType, gain: 0.11 },
            ];
    return this.createCompositeStinger(base, shimmer, 4, () => {
      accentDone = true;
      tryFinish();
    });
  }

  private playCelebratoryRpsResult(winner: 'p1' | 'p2' | 'draw', onVoiceEnd: () => void): VoiceHandle | null {
    if (!this.synth || !this.sfxGain) return null;
    let baseDone = false;
    let accentDone = false;
    const tryFinish = (): void => {
      if (baseDone && accentDone) onVoiceEnd();
    };
    const base = this.synth.playRpsResult(this.sfxGain, winner, {
      pan: 0,
      onVoiceEnd: () => {
        baseDone = true;
        tryFinish();
      },
    });
    const shimmer =
      winner === 'draw'
        ? [
            { offset: 0.02, freq: 523.25, dur: 0.08, wave: 'sine' as OscillatorType, gain: 0.1 },
            { offset: 0.12, freq: 466.16, dur: 0.12, wave: 'sine' as OscillatorType, gain: 0.1 },
          ]
        : winner === 'p1'
          ? [
              { offset: 0.08, freq: 1174.66, dur: 0.16, wave: 'triangle' as OscillatorType, gain: 0.13 },
              { offset: 0.16, freq: 1479.98, dur: 0.26, wave: 'sine' as OscillatorType, gain: 0.15 },
            ]
          : [
              { offset: 0.08, freq: 1318.51, dur: 0.16, wave: 'triangle' as OscillatorType, gain: 0.13 },
              { offset: 0.16, freq: 1661.22, dur: 0.26, wave: 'sine' as OscillatorType, gain: 0.15 },
            ];
    return this.createCompositeStinger(base, shimmer, 2, () => {
      accentDone = true;
      tryFinish();
    });
  }

  private playCelebratoryAchievementUnlock(onVoiceEnd: () => void): VoiceHandle | null {
    if (!this.synth || !this.sfxGain) return null;
    this.duckMusic(0.55, 0.65, 0.45);
    let baseDone = false;
    let accentDone = false;
    const tryFinish = (): void => {
      if (baseDone && accentDone) onVoiceEnd();
    };
    const base = this.synth.playAchievementUnlock(this.sfxGain, {
      pan: 0,
      onVoiceEnd: () => {
        baseDone = true;
        tryFinish();
      },
    });
    return this.createCompositeStinger(
      base,
      [
        { offset: 0.14, freq: 1975.53, dur: 0.2, wave: 'sine', gain: 0.11 },
        { offset: 0.21, freq: 2637.02, dur: 0.44, wave: 'sine', gain: 0.14 },
      ],
      3,
      () => {
        accentDone = true;
        tryFinish();
      }
    );
  }

  // ==========================================================================
  // Exhaustive SimEvent Dispatch (All 32 SimEvent Types)
  // ==========================================================================

  private handleSimEvent(event: SimEvent, state: SimState): void {
    const synth = this.synth;
    const sfx = this.sfxGain;
    if (!synth || !sfx) return;

    const spawn = (priority: number, factory: (onVoiceEnd: () => void) => VoiceHandle | null): void => {
      if (!this.reserveVoiceSlot(priority)) return;
      let handle: VoiceHandle | null = null;
      let endedEarly = false;
      handle = factory(() => {
        if (handle) this.releaseVoice(handle);
        else endedEarly = true;
      });
      if (!endedEarly) this.trackVoice(handle);
    };

    switch (event.type) {
      case 'footstep': {
        if (!this.checkCooldown(`footstep:${event.who}`, 65)) return;
        const pan = this.panFromWorldX(event.x, state);
        const pitchMult = jitterPitch();
        const customKey = `footstep_${event.terrain.toLowerCase()}`;
        if (this.tryPlayCustomSample([customKey, 'footstep'], pan, 0.42, pitchMult, 0)) return;
        spawn(0, (onVoiceEnd) => synth.playFootstep(sfx, event.terrain, event.who, { pan, pitchMult, onVoiceEnd }));
        return;
      }

      case 'land': {
        if (!this.checkCooldown(`land:${event.who}`, 60)) return;
        const pan = this.panFromWorldX(event.x, state);
        const pitchMult = jitterPitch();
        const customKey = `land_${event.terrain.toLowerCase()}`;
        if (this.tryPlayCustomSample([customKey, 'land'], pan, 0.55, pitchMult, 1)) return;
        spawn(1, (onVoiceEnd) =>
          synth.playLand(sfx, event.terrain, event.who, event.impactVy, { pan, pitchMult, onVoiceEnd })
        );
        return;
      }

      case 'land_hard': {
        if (!this.checkCooldown(`land_hard:${event.who}`, 120)) return;
        const pan = this.panFromWorldX(event.x, state);
        const pitchMult = jitterPitch(0.05);
        if (this.tryPlayCustomSample(['land_hard'], pan, 0.8, pitchMult, 3)) return;
        spawn(3, (onVoiceEnd) => synth.playLandHard(sfx, event.terrain, { pan, pitchMult, onVoiceEnd }));
        return;
      }

      case 'jump': {
        if (!this.checkCooldown(`jump:${event.who}`, 55)) return;
        const pan = this.panFromWorldX(event.x, state);
        const pitchMult = jitterPitch();
        if (this.tryPlayCustomSample(['jump'], pan, 0.55, pitchMult, 2)) return;
        spawn(2, (onVoiceEnd) => synth.playJump(sfx, event.who, { pan, pitchMult, onVoiceEnd }));
        return;
      }

      case 'grab_start': {
        if (!this.checkCooldown(`grab_start:${event.who}`, 60)) return;
        const pan = this.panFromWorldX(event.x, state);
        const pitchMult = jitterPitch();
        if (this.tryPlayCustomSample(['grab_start'], pan, 0.52, pitchMult, 1)) return;
        spawn(1, (onVoiceEnd) => synth.playGrabStart(sfx, event.terrain, { pan, pitchMult, onVoiceEnd }));
        return;
      }

      case 'grab_stamina_out': {
        if (!this.checkCooldown(`grab_stamina_out:${event.who}`, 180)) return;
        const pan = this.panFromWorldX(event.x, state);
        const pitchMult = jitterPitch(0.04);
        if (this.tryPlayCustomSample(['grab_stamina_out'], pan, 0.62, pitchMult, 2)) return;
        spawn(2, (onVoiceEnd) => synth.playGrabStaminaOut(sfx, { pan, pitchMult, onVoiceEnd }));
        return;
      }

      case 'anchor_set': {
        if (!this.checkCooldown(`anchor_set:${event.who}`, 70)) return;
        const pan = this.panFromWorldX(event.x, state);
        const pitchMult = jitterPitch();
        if (this.tryPlayCustomSample(['anchor_set'], pan, 0.65, pitchMult, 2)) return;
        spawn(2, (onVoiceEnd) => synth.playAnchorSet(sfx, event.terrain, { pan, pitchMult, onVoiceEnd }));
        return;
      }

      case 'swing_pump': {
        if (!this.checkCooldown(`swing_pump:${event.who}`, 120)) return;
        const pan = this.panFromWorldX(event.x, state);
        const pitchMult = jitterPitch();
        if (this.tryPlayCustomSample(['swing_pump'], pan, 0.45, pitchMult, 0)) return;
        spawn(0, (onVoiceEnd) => synth.playSwingPump(sfx, event.speed, { pan, pitchMult, onVoiceEnd }));
        return;
      }

      case 'swing_launch': {
        if (!this.checkCooldown(`swing_launch:${event.who}`, 90)) return;
        const pan = this.panFromWorldX(event.x, state);
        const pitchMult = jitterPitch(0.04);
        if (this.tryPlayCustomSample(['swing_launch'], pan, 0.65, pitchMult, 2)) return;
        spawn(2, (onVoiceEnd) => synth.playSwingLaunch(sfx, event.speed, { pan, pitchMult, onVoiceEnd }));
        return;
      }

      case 'rope_taut': {
        if (!this.checkCooldown('rope_taut', 95)) return;
        const pan = this.panFromWorldX(event.x, state);
        const pitchMult = jitterPitch();
        if (this.tryPlayCustomSample(['rope_taut'], pan, 0.5, pitchMult, 0)) return;
        spawn(0, (onVoiceEnd) => synth.playRopeTaut(sfx, event.tension, { pan, pitchMult, onVoiceEnd }));
        return;
      }

      case 'rope_pull_start': {
        if (!this.checkCooldown(`rope_pull_start:${event.who}`, 140)) return;
        const pan = this.panFromWorldX(event.x, state);
        const pitchMult = jitterPitch(0.04);
        if (this.tryPlayCustomSample(['rope_pull_start'], pan, 0.55, pitchMult, 1)) return;
        spawn(1, (onVoiceEnd) => synth.playRopePullStart(sfx, { pan, pitchMult, onVoiceEnd }));
        return;
      }

      case 'block_shake': {
        if (!this.checkCooldown(`block_shake:${event.id}`, 90)) return;
        const pan = this.panFromWorldX(event.x, state);
        const pitchMult = jitterPitch();
        if (this.tryPlayCustomSample(['block_shake'], pan, 0.5, pitchMult, 0)) return;
        spawn(0, (onVoiceEnd) => synth.playBlockShake(sfx, { pan, pitchMult, onVoiceEnd }));
        return;
      }

      case 'block_crumble': {
        if (!this.checkCooldown(`block_crumble:${event.id}`, 80)) return;
        const pan = this.panFromWorldX(event.x, state);
        const pitchMult = jitterPitch();
        if (this.tryPlayCustomSample(['block_crumble'], pan, 0.7, pitchMult, 2)) return;
        spawn(2, (onVoiceEnd) => synth.playBlockCrumble(sfx, { pan, pitchMult, onVoiceEnd }));
        return;
      }

      case 'block_recover': {
        if (!this.checkCooldown(`block_recover:${event.id}`, 80)) return;
        const pan = this.panFromWorldX(event.x, state);
        const pitchMult = jitterPitch(0.04);
        if (this.tryPlayCustomSample(['block_recover'], pan, 0.5, pitchMult, 1)) return;
        spawn(1, (onVoiceEnd) => synth.playBlockRecover(sfx, { pan, pitchMult, onVoiceEnd }));
        return;
      }

      case 'wind_telegraph': {
        if (!this.checkCooldown('wind_telegraph', 250)) return;
        this.windBed?.setDirection(event.dir);
        spawn(1, (onVoiceEnd) => synth.playWindTelegraph(sfx, event.dir, { onVoiceEnd }));
        return;
      }

      case 'wind_start': {
        if (!this.checkCooldown('wind_start', 250)) return;
        this.windBed?.setDirection(event.dir);
        this.windBed?.setActive(true, 1.0);
        spawn(2, (onVoiceEnd) => synth.playWindGust(sfx, event.dir, { onVoiceEnd }));
        return;
      }

      case 'wind_stop': {
        this.windBed?.setActive(false);
        return;
      }

      case 'flag_place': {
        if (!this.checkCooldown('flag_place', 120)) return;
        const pan = this.panFromWorldX(event.x, state);
        if (this.tryPlayCustomSample(['flag_place'], pan, 0.65, 1.0, 3)) return;
        spawn(3, (onVoiceEnd) => synth.playFlagPlace(sfx, { pan, onVoiceEnd }));
        return;
      }

      case 'charlie_pickup': {
        if (!this.checkCooldown('charlie_pickup', 250)) return;
        const pan = this.panFromWorldX(event.x, state);
        if (this.tryPlayCustomSample(['charlie_pickup'], pan, 0.7, 1.0, 3)) return;
        spawn(3, (onVoiceEnd) => synth.playCharliePickup(sfx, { pan, onVoiceEnd }));
        return;
      }

      case 'collect_photo': {
        const pan = this.panFromWorldX(event.x, state);
        if (this.tryPlayCustomSample(['collect_photo'], pan, 0.7, 1.0, 3)) return;
        spawn(3, (onVoiceEnd) => synth.playCollectPhoto(sfx, { pan, onVoiceEnd }));
        return;
      }

      case 'collect_manual': {
        const pan = this.panFromWorldX(event.x, state);
        if (this.tryPlayCustomSample(['collect_manual'], pan, 0.68, 1.0, 3)) return;
        spawn(3, (onVoiceEnd) => synth.playCollectManual(sfx, { pan, onVoiceEnd }));
        return;
      }

      case 'rescue_seal': {
        const pan = this.panFromWorldX(event.x, state);
        if (this.tryPlayCustomSample(['rescue_seal'], pan, 0.72, 1.0, 3)) return;
        spawn(3, (onVoiceEnd) => synth.playRescueSeal(sfx, { pan, onVoiceEnd }));
        return;
      }

      case 'button_press': {
        if (!this.checkCooldown(`button_press:${event.id}`, 65)) return;
        const pan = this.panFromWorldX(event.x, state);
        const pitchMult = jitterPitch(0.04);
        if (this.tryPlayCustomSample(['button_press'], pan, 0.6, pitchMult, 2)) return;
        spawn(2, (onVoiceEnd) => synth.playButtonPress(sfx, event.powered, { pan, pitchMult, onVoiceEnd }));
        return;
      }

      case 'troncho_launch': {
        if (!this.checkCooldown(`troncho_launch:${event.id}`, 85)) return;
        const pan = this.panFromWorldX(event.x, state);
        const pitchMult = jitterPitch(0.05);
        if (this.tryPlayCustomSample(['troncho_launch'], pan, 0.72, pitchMult, 2)) return;
        spawn(2, (onVoiceEnd) => synth.playTronchoLaunch(sfx, { pan, pitchMult, onVoiceEnd }));
        return;
      }

      case 'laser_zap': {
        if (!this.checkCooldown(`laser_zap:${event.id}`, 95)) return;
        const pan = this.panFromWorldX(event.x, state);
        const pitchMult = jitterPitch(0.05);
        if (this.tryPlayCustomSample(['laser_zap'], pan, 0.72, pitchMult, 3)) return;
        spawn(3, (onVoiceEnd) => synth.playLaserZap(sfx, { pan, pitchMult, onVoiceEnd }));
        return;
      }

      case 'boss_chain_break': {
        const pan = this.panFromWorldX(event.x, state);
        if (this.tryPlayCustomSample(['boss_chain_break'], pan, 0.85, 1.0, 4)) return;
        spawn(4, (onVoiceEnd) => synth.playBossChainBreak(sfx, event.remaining, { pan, onVoiceEnd }));
        return;
      }

      case 'boss_defeated': {
        if (this.tryPlayCustomSample(['boss_defeated'], 0, 0.85, 1.0, 4)) {
          this.duckMusic(0.35, 1.3, 0.7);
          return;
        }
        spawn(4, (onVoiceEnd) => this.playCelebratoryBossDefeated(onVoiceEnd));
        return;
      }

      case 'summit_reached': {
        if (this.tryPlayCustomSample(['summit_reached'], 0, 0.85, 1.0, 4)) {
          this.duckMusic(0.38, 1.4, 0.75);
          return;
        }
        spawn(4, (onVoiceEnd) => this.playCelebratorySummitReached(event.noAssist, onVoiceEnd));
        return;
      }

      case 'time_trial_finish': {
        if (this.tryPlayCustomSample([`time_trial_finish_${event.medal}`, 'time_trial_finish'], 0, 0.78, 1.0, 4)) {
          this.duckMusic(0.45, 0.9, 0.55);
          return;
        }
        spawn(4, (onVoiceEnd) => this.playCelebratoryTimeTrialFinish(event.medal, onVoiceEnd));
        return;
      }

      case 'emote': {
        if (!this.checkCooldown(`emote:${event.who}`, 70)) return;
        const pan = this.panFromWorldX(event.x, state);
        const pitchMult = jitterPitch();
        if (this.tryPlayCustomSample([`emote_${event.emote}`, 'emote'], pan, 0.55, pitchMult, 1)) return;
        spawn(1, (onVoiceEnd) => synth.playEmote(sfx, event.emote, { pan, pitchMult, onVoiceEnd }));
        return;
      }

      case 'rps_result': {
        if (this.tryPlayCustomSample([`rps_result_${event.winner}`, 'rps_result'], 0, 0.65, 1.0, 2)) return;
        spawn(2, (onVoiceEnd) => this.playCelebratoryRpsResult(event.winner, onVoiceEnd));
        return;
      }

      case 'achievement_unlock': {
        if (!this.checkCooldown(`achievement:${event.id}`, 200)) return;
        if (
          this.tryPlayCustomSample(
            [`achievement_unlock_${event.id.toLowerCase()}`, 'achievement_unlock'],
            0,
            0.7,
            1.0,
            3
          )
        ) {
          this.duckMusic(0.55, 0.65, 0.45);
          return;
        }
        spawn(3, (onVoiceEnd) => this.playCelebratoryAchievementUnlock(onVoiceEnd));
        return;
      }

      default:
        assertNever(event);
    }
  }

  // ==========================================================================
  // Dual-Deck Altitude-Reactive & Jukebox Music Engine
  // ==========================================================================

  private resolveInitialTrack(): PlayableTrackId {
    return this.resolveTargetTrackFromCachedState();
  }

  private resolveTargetTrackFromCachedState(): PlayableTrackId {
    if (this.settings.jukeboxTrack === 'Random') {
      return getDeterministicRandomTrack(this.randomCycleIndex);
    }
    if (this.settings.jukeboxTrack === 'Base') {
      return toPlayableTrackId(getBiomeDefaultTrack(this.currentBiome));
    }
    return this.settings.jukeboxTrack;
  }

  private resolveTargetTrack(state: SimState): PlayableTrackId {
    if (this.settings.jukeboxTrack === 'Random') {
      return getDeterministicRandomTrack(this.randomCycleIndex);
    }
    if (this.settings.jukeboxTrack === 'Base') {
      const effectiveBiome: BiomeId =
        state.boss.active && !state.boss.defeated ? 'boss' : state.currentBiome;
      return toPlayableTrackId(getBiomeDefaultTrack(effectiveBiome));
    }
    // Manual Jukebox track lock
    return this.settings.jukeboxTrack;
  }

  private computeAltitudeEnergy(state: SimState): number {
    const summitRef =
      state.mode === 'lab_dlc'
        ? WORLD.LAB_SUMMIT_Y
        : state.mode === 'solo_jeff'
          ? WORLD.SOLO_SUMMIT_Y
          : WORLD.COOP_SUMMIT_Y;
    const normAlt = clamp(this.currentAltitude / Math.max(1, summitRef), 0, 1);
    const windBoost = state.windActive && state.windPhase === 'active' ? 0.1 : 0;
    const bossBoost = state.boss.active && !state.boss.defeated ? 0.14 : 0;
    return clamp(normAlt + windBoost + bossBoost, 0, 1.2);
  }

  private ensureTrackTarget(targetTrack: PlayableTrackId, now: number): void {
    if (!this.decks) return;
    const activeDeck = this.decks[this.activeDeckIndex];
    const outgoingIndex: 0 | 1 = this.activeDeckIndex === 0 ? 1 : 0;
    const outgoingDeck = this.decks[outgoingIndex];

    if (activeDeck.trackId === targetTrack) {
      return;
    }

    // If reversing mid-crossfade back to the outgoing deck's track, invert crossfade seamlessly!
    if (this.crossfadeT < 1.0 && outgoingDeck.trackId === targetTrack) {
      this.activeDeckIndex = outgoingIndex;
      this.crossfadeT = clamp(1.0 - this.crossfadeT, 0, 1);
      return;
    }

    // If crossfade is less than halfway, keep louder outgoing deck fading out and replace active deck
    if (this.crossfadeT < 0.5) {
      this.resetDeckForTrack(activeDeck, targetTrack, now);
      this.crossfadeT = 0;
      activeDeck.bus.gain.setTargetAtTime(0, now, 0.025);
      return;
    }

    // Otherwise promote current active deck to outgoing and start new track on the standby deck
    this.activeDeckIndex = outgoingIndex;
    const nextActive = this.decks[this.activeDeckIndex];
    this.resetDeckForTrack(nextActive, targetTrack, now);
    this.crossfadeT = 0;
  }

  private resetDeckForTrack(deck: MusicDeck, trackId: PlayableTrackId, now: number): void {
    this.stopDeckCustomLoop(deck);
    deck.trackId = trackId;
    deck.stepIndex = 0;
    deck.loopsCompleted = 0;
    deck.nextStepTime = now + 0.04;
  }

  private stopDeckCustomLoop(deck: MusicDeck): void {
    if (deck.customSource) {
      try {
        deck.customSource.stop();
        deck.customSource.disconnect();
      } catch {
        // Ignore already-stopped source
      }
      deck.customSource = null;
      deck.customTrackId = null;
    }
  }

  private stopAllCustomMusicLoops(): void {
    if (!this.decks) return;
    this.stopDeckCustomLoop(this.decks[0]);
    this.stopDeckCustomLoop(this.decks[1]);
  }

  private tryAttachCustomMusicLoop(deck: MusicDeck, now: number): boolean {
    if (!this.ctx) return false;
    const idLower = deck.trackId.toLowerCase();
    const customBuf = this.customLoader.getBufferSync([
      `music_${idLower}`,
      `bgm_${idLower}`,
      `jukebox_${idLower}`,
      idLower,
    ]);
    if (!customBuf) {
      if (deck.customSource) this.stopDeckCustomLoop(deck);
      return false;
    }

    if (deck.customSource && deck.customTrackId === deck.trackId) {
      return true;
    }

    this.stopDeckCustomLoop(deck);
    const src = this.ctx.createBufferSource();
    src.buffer = customBuf;
    src.loop = true;
    src.connect(deck.bus);
    src.start(now);
    deck.customSource = src;
    deck.customTrackId = deck.trackId;
    return true;
  }

  private advanceMusicDeck(
    deck: MusicDeck,
    now: number,
    deckGain: number,
    altitudeEnergy: number,
    isPrimaryActive: boolean
  ): void {
    if (deckGain <= 0.01) return;

    // Prefer custom pack BGM AudioBuffer if decoded; otherwise run procedural sequencer
    if (this.tryAttachCustomMusicLoop(deck, now)) {
      deck.nextStepTime = now + 0.05;
      return;
    }

    const track = JUKEBOX_TRACK_DATA[deck.trackId];
    if (!track || track.length <= 0) return;

    // Resync gracefully after tab-background or lag spikes (never machine-gun notes)
    if (deck.nextStepTime < now - 0.14) {
      deck.nextStepTime = now + 0.04;
    }

    const horizon = now + LOOKAHEAD_SEC;
    let safety = 0;
    while (deck.nextStepTime < horizon && safety < 8) {
      this.scheduleTrackStep(deck.bus, track, deck.stepIndex, deck.nextStepTime, altitudeEnergy);
      deck.nextStepTime += track.stepSec;
      deck.stepIndex = (deck.stepIndex + 1) % track.length;

      if (deck.stepIndex === 0) {
        deck.loopsCompleted++;
        if (
          isPrimaryActive &&
          this.settings.jukeboxTrack === 'Random' &&
          deck.loopsCompleted >= RANDOM_LOOPS_PER_TRACK
        ) {
          this.randomCycleIndex++;
          const nextRandom = getDeterministicRandomTrack(this.randomCycleIndex);
          this.ensureTrackTarget(nextRandom, deck.nextStepTime);
          break;
        }
      }
      safety++;
    }
  }

  private scheduleTrackStep(
    dest: AudioNode,
    track: JukeboxTrackData,
    step: number,
    time: number,
    altitudeEnergy: number
  ): void {
    if (!this.synth) return;

    const stepDur = track.stepSec;
    const barStep = step % track.stepsPerBar;
    const barIndex = Math.floor(step / track.stepsPerBar);

    // Subtle altitude & cave darkness timbre responsiveness
    const brightnessScale =
      (0.95 + altitudeEnergy * 0.16) * (this.currentDarkness > 0.35 ? 0.88 : 1.0);

    // ------------------------------------------------------------------------
    // 1. Lead Melody Voice
    // ------------------------------------------------------------------------
    const leadMidi = track.lead[step] ?? 0;
    if (leadMidi > 0) {
      const hz = midiToHz(leadMidi);
      const isDownbeat = barStep === 0 || barStep === Math.floor(track.stepsPerBar / 2);
      const nextLead = track.lead[(step + 1) % track.length] ?? 0;
      const sustainMult = nextLead === 0 ? (isDownbeat ? 1.7 : 1.35) : 0.9;
      const dur = stepDur * sustainMult;
      const cutoff = track.leadCutoffHz * brightnessScale;

      switch (track.articulation) {
        case 'celesta':
          this.synth.scheduleMusicNote(dest, time, hz, dur * 1.15, 'sine', track.leadGain, cutoff, 0.004);
          this.synth.scheduleMusicNote(dest, time, hz * 2, dur * 0.65, 'sine', track.leadGain * 0.28, cutoff * 1.3, 0.003);
          break;

        case 'chiptune':
          this.synth.scheduleMusicNote(dest, time, hz, stepDur * 0.88, 'square', track.leadGain, cutoff, 0.002);
          break;

        case 'alpine':
          this.synth.scheduleMusicNote(dest, time, hz, dur, 'triangle', track.leadGain, cutoff, 0.006);
          if (isDownbeat) {
            this.synth.scheduleMusicNote(dest, time, hz * 2, dur * 0.6, 'sine', track.leadGain * 0.22, cutoff * 1.25, 0.004);
          }
          break;

        case 'marimba':
          this.synth.scheduleCavernPing(dest, time, hz, track.leadGain * 0.88);
          this.synth.scheduleMusicNote(dest, time, hz * 0.5, stepDur * 0.9, 'triangle', track.leadGain * 0.32, 950, 0.003);
          break;

        case 'arp':
          this.synth.scheduleMusicNote(dest, time, hz, dur, 'triangle', track.leadGain, cutoff, 0.005);
          break;

        case 'icy_bell': {
          const summitSparkle = this.currentAltitude >= WORLD.ZONE4_START_Y ? 1.2 : 1.0;
          this.synth.scheduleMusicNote(dest, time, hz, dur * 1.25, 'sine', track.leadGain * summitSparkle, cutoff, 0.003);
          this.synth.scheduleMusicNote(
            dest,
            time,
            hz * 2,
            dur * 0.85,
            'sine',
            track.leadGain * 0.34 * summitSparkle,
            cutoff * 1.3,
            0.002
          );
          break;
        }

        case 'electric_funk':
          this.synth.scheduleMusicNote(dest, time, hz, stepDur * (nextLead === 0 ? 1.15 : 0.78), 'sawtooth', track.leadGain, cutoff, 0.004);
          break;

        case 'boss_lead':
          // Twin slightly detuned sawtooth oscillators for fierce boss presence
          this.synth.scheduleMusicNote(dest, time, hz, dur * 0.92, 'sawtooth', track.leadGain * 0.72, cutoff, 0.003);
          this.synth.scheduleMusicNote(dest, time, hz * 1.0045, dur * 0.92, 'sawtooth', track.leadGain * 0.52, cutoff * 1.1, 0.003);
          break;

        case 'retro_16bit':
          this.synth.scheduleMusicNote(dest, time, hz, stepDur * 0.9, 'square', track.leadGain, cutoff, 0.003);
          this.synth.scheduleMusicNote(dest, time, hz * 2, stepDur * 0.55, 'triangle', track.leadGain * 0.35, cutoff * 1.2, 0.002);
          break;

        case 'synthwave':
          // Warm detuned analog twin-saw lead
          this.synth.scheduleMusicNote(dest, time, hz * 0.997, dur * 1.2, 'sawtooth', track.leadGain * 0.65, cutoff, 0.014);
          this.synth.scheduleMusicNote(dest, time, hz * 1.003, dur * 1.2, 'sawtooth', track.leadGain * 0.6, cutoff * 1.08, 0.014);
          break;
      }

      // Optional atmospheric delay echo (Dark Mines marimba, Village celesta, Summit bells, Synthwave)
      if (track.echoSteps && track.echoGain && track.echoGain > 0.01) {
        const echoTime = time + stepDur * track.echoSteps;
        if (track.articulation === 'marimba') {
          this.synth.scheduleCavernPing(dest, echoTime, hz, track.leadGain * track.echoGain);
        } else {
          this.synth.scheduleMusicNote(
            dest,
            echoTime,
            hz,
            dur * 0.85,
            track.articulation === 'synthwave' ? 'triangle' : 'sine',
            track.leadGain * track.echoGain,
            cutoff * 0.75,
            0.008
          );
        }
      }
    }

    // ------------------------------------------------------------------------
    // 2. Counter-Harmony / Arpeggio Voice
    // ------------------------------------------------------------------------
    const harmonyMidi = track.harmony[step] ?? 0;
    if (harmonyMidi > 0 && track.harmonyGain > 0.001) {
      const hz = midiToHz(harmonyMidi);
      const arpFast =
        track.articulation === 'chiptune' ||
        track.articulation === 'arp' ||
        track.articulation === 'retro_16bit' ||
        track.articulation === 'synthwave';
      const dur = stepDur * (arpFast ? 0.82 : 1.25);
      this.synth.scheduleMusicNote(
        dest,
        time,
        hz,
        dur,
        track.harmonyWave,
        track.harmonyGain,
        track.harmonyCutoffHz * brightnessScale,
        arpFast ? 0.003 : 0.008
      );
    }

    // ------------------------------------------------------------------------
    // 3. Bassline Voice (with funky slap-pop accent for Laboratory DLC!)
    // ------------------------------------------------------------------------
    const bassMidi = track.bass[step] ?? 0;
    if (bassMidi > 0 && track.bassGain > 0.001) {
      const hz = midiToHz(bassMidi);
      const isAccent = barStep === 0 || (track.articulation === 'electric_funk' && bassMidi >= 48);
      const bassDur =
        track.articulation === 'electric_funk' || track.articulation === 'boss_lead'
          ? stepDur * 0.92
          : stepDur * (barStep === 0 ? 1.55 : 1.05);
      const bassCutoff =
        track.bassCutoffHz *
        brightnessScale *
        (track.articulation === 'electric_funk' && bassMidi >= 48 ? 1.85 : 1.0);

      this.synth.scheduleMusicBass(
        dest,
        time,
        hz,
        bassDur,
        track.bassGain * (isAccent ? 1.12 : 0.92),
        track.bassWave,
        bassCutoff
      );

      // Slap-bass bright thumb/pop transient on popped high notes in Track5
      if (track.articulation === 'electric_funk' && bassMidi >= 48) {
        this.synth.scheduleMusicNote(dest, time, hz * 2, 0.045, 'triangle', 0.048, 3200, 0.002);
      }
    }

    // ------------------------------------------------------------------------
    // 4. Atmospheric Bar Chord Pads
    // ------------------------------------------------------------------------
    if (barStep === 0 && track.pads && track.padGain > 0.001) {
      const chord = track.pads[barIndex % track.pads.length];
      if (chord && chord.length > 0) {
        const freqs = chord.map((m) => midiToHz(m));
        this.synth.schedulePadChord(
          dest,
          time,
          freqs,
          stepDur * (track.stepsPerBar - 0.15),
          track.padGain,
          track.padCutoffHz * brightnessScale
        );
      }
    }

    // ------------------------------------------------------------------------
    // 5. Percussive Rhythm Layer
    // ------------------------------------------------------------------------
    const hit: PercHit = track.percussion[step] ?? 0;
    if (hit !== 0 && track.percGain > 0.001) {
      this.schedulePercussionHit(dest, hit, time, track.percGain, track.articulation);
    }
  }

  private schedulePercussionHit(
    dest: AudioNode,
    hit: PercHit,
    time: number,
    gainScale: number,
    articulation: JukeboxTrackData['articulation']
  ): void {
    if (!this.synth) return;
    const isHeavy = articulation === 'boss_lead' || articulation === 'arp' || articulation === 'electric_funk';
    const brightHat = articulation !== 'marimba';

    switch (hit) {
      case 1: // Kick
        this.synth.scheduleMusicKick(dest, time, (isHeavy ? 0.165 : 0.13) * gainScale);
        break;
      case 2: // Snare
        this.scheduleMusicSnare(dest, time, (isHeavy ? 0.115 : 0.085) * gainScale, articulation === 'boss_lead' || articulation === 'arp');
        break;
      case 3: // Closed hi-hat / brush
        this.synth.scheduleMusicHat(dest, time, 0.036 * gainScale, brightHat);
        break;
      case 4: // Open hi-hat / icy shimmer cymbal
        this.scheduleMusicOpenHat(dest, time, 0.048 * gainScale, articulation === 'icy_bell');
        break;
      case 5: // Kick + closed hat
        this.synth.scheduleMusicKick(dest, time, (isHeavy ? 0.165 : 0.13) * gainScale);
        this.synth.scheduleMusicHat(dest, time, 0.032 * gainScale, brightHat);
        break;
      case 6: // Snare + closed hat
        this.scheduleMusicSnare(dest, time, (isHeavy ? 0.115 : 0.085) * gainScale, articulation === 'boss_lead' || articulation === 'arp');
        this.synth.scheduleMusicHat(dest, time, 0.03 * gainScale, brightHat);
        break;
      case 7: // Rim / woodblock / metallic cavern tick
        this.scheduleMusicRim(dest, time, 0.055 * gainScale, articulation === 'marimba');
        break;
    }
  }

  // ==========================================================================
  // Pure Web Audio Snare, Open Hat & Rimshot Percussion Voices
  // ==========================================================================

  private createPercNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const sr = ctx.sampleRate || 44100;
    const len = Math.max(1024, Math.floor(sr * durationSec));
    const buffer = ctx.createBuffer(1, len, sr);
    const data = buffer.getChannelData(0);
    let seed = 0x2f6e2b1d;
    for (let i = 0; i < len; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = (seed / 0xffffffff) * 2 - 1;
    }
    return buffer;
  }

  private scheduleMusicSnare(dest: AudioNode, time: number, gain: number, punchy: boolean): void {
    if (!this.ctx || !this.percNoiseBuffer) return;
    const ctx = this.ctx;
    const sr = ctx.sampleRate || 44100;
    const t0 = Math.max(ctx.currentTime, time);
    const dur = punchy ? 0.11 : 0.085;
    const t1 = t0 + dur;

    // 1. Snare wire noise crack
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = this.percNoiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.setValueAtTime(safeFreq(punchy ? 2600 : 2100, sr), t0);
    hp.Q.setValueAtTime(1.1, t0);

    const nEnv = ctx.createGain();
    nEnv.gain.setValueAtTime(0.0001, t0);
    nEnv.gain.linearRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.003);
    nEnv.gain.exponentialRampToValueAtTime(0.0001, t1 - 0.004);
    nEnv.gain.linearRampToValueAtTime(0, t1);

    noiseSrc.connect(hp);
    hp.connect(nEnv);
    nEnv.connect(dest);
    noiseSrc.start(t0, Math.random() * 0.25);
    noiseSrc.stop(t1 + 0.01);
    noiseSrc.onended = () => {
      try {
        noiseSrc.disconnect();
        hp.disconnect();
        nEnv.disconnect();
      } catch {
        // Ignore
      }
    };

    // 2. Snare drum body tone
    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(punchy ? 215 : 185, t0);
    body.frequency.exponentialRampToValueAtTime(108, t0 + 0.065);

    const bEnv = ctx.createGain();
    bEnv.gain.setValueAtTime(0.0001, t0);
    bEnv.gain.linearRampToValueAtTime(Math.max(0.0002, gain * 0.85), t0 + 0.002);
    bEnv.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.068);
    bEnv.gain.linearRampToValueAtTime(0, t0 + 0.072);

    body.connect(bEnv);
    bEnv.connect(dest);
    body.start(t0);
    body.stop(t0 + 0.08);
    body.onended = () => {
      try {
        body.disconnect();
        bEnv.disconnect();
      } catch {
        // Ignore
      }
    };
  }

  private scheduleMusicOpenHat(dest: AudioNode, time: number, gain: number, crystalline: boolean): void {
    if (!this.ctx || !this.percNoiseBuffer) return;
    const ctx = this.ctx;
    const sr = ctx.sampleRate || 44100;
    const t0 = Math.max(ctx.currentTime, time);
    const dur = crystalline ? 0.19 : 0.14;
    const t1 = t0 + dur;

    const src = ctx.createBufferSource();
    src.buffer = this.percNoiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(safeFreq(crystalline ? 7200 : 5400, sr), t0);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, t1 - 0.006);
    env.gain.linearRampToValueAtTime(0, t1);

    src.connect(hp);
    hp.connect(env);
    env.connect(dest);
    src.start(t0, Math.random() * 0.2);
    src.stop(t1 + 0.01);
    src.onended = () => {
      try {
        src.disconnect();
        hp.disconnect();
        env.disconnect();
      } catch {
        // Ignore
      }
    };
  }

  private scheduleMusicRim(dest: AudioNode, time: number, gain: number, resonantCavern: boolean): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const sr = ctx.sampleRate || 44100;
    const t0 = Math.max(ctx.currentTime, time);
    const dur = resonantCavern ? 0.068 : 0.042;
    const t1 = t0 + dur;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(safeFreq(resonantCavern ? 1320 : 960, sr), t0);
    osc.frequency.exponentialRampToValueAtTime(safeFreq(resonantCavern ? 880 : 520, sr), t1);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, t1 - 0.003);
    env.gain.linearRampToValueAtTime(0, t1);

    osc.connect(env);
    env.connect(dest);
    osc.start(t0);
    osc.stop(t1 + 0.008);
    osc.onended = () => {
      try {
        osc.disconnect();
        env.disconnect();
      } catch {
        // Ignore
      }
    };
  }
}
