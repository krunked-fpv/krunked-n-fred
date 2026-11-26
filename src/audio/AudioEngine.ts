// ============================================================================
// Krunked & Fred — Web Audio Engine & Dynamic Alpine/Mines Music Sequencer
// Implements AudioModulePort with lazy gesture unlock, gain bus mixing,
// polyphony cap (16), per-event cooldowns, +/-6% pitch jitter, camera-relative
// stereo panning, ambient wind bed, and seamless Zone 1 <-> Zone 2 music.
// ============================================================================

import {
  PHYSICS,
  type AudioModulePort,
  type AudioSettings,
  type BiomeId,
  type JukeboxTrackId,
  type SimEvent,
  type SimState,
} from '../contracts';
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
const HALF_VIEW_TILES = PHYSICS.VIEWPORT_TILES_X * 0.5;

const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  master: 0.8,
  music: 0.65,
  sfx: 0.85,
  muted: false,
  jukeboxTrack: 'Base',
};

// ============================================================================
// Musical Patterns — Relative Major/Minor (F Major <-> D Minor)
// Sharing the exact same key signature (one flat: Bb) allows Zone 1 Snowy
// Foothills and Zone 2 Dark Mines to crossfade seamlessly with zero dissonance!
// 48-step loop in bouncy 6/8 alpine waltz feel (8 bars x 6 eighth-note steps).
// MIDI note numbers (0 = rest).
// ============================================================================

// Zone 1: Cozy Bouncy Snowy Foothills Waltz (F Major)
const ZONE1_LEAD: readonly number[] = [
  // Bar 1 (F)            // Bar 2 (C)
  77, 0, 81, 84, 0, 81,   79, 0, 76, 72, 0, 76,
  // Bar 3 (Dm)           // Bar 4 (Bb -> C)
  74, 0, 77, 81, 0, 77,   74, 77, 79, 76, 0, 0,
  // Bar 5 (F)            // Bar 6 (Bb)
  77, 0, 81, 84, 86, 84,  82, 0, 79, 74, 0, 77,
  // Bar 7 (C7)           // Bar 8 (F resolve)
  79, 81, 79, 76, 72, 76, 77, 0, 81, 77, 0, 0,
];

const ZONE1_SPARKLE: readonly number[] = [
  // Gentle icy glockenspiel sparkle on dotted-quarter accents
  89, 0, 0, 84, 0, 0,     88, 0, 0, 84, 0, 0,
  86, 0, 0, 81, 0, 0,     82, 0, 0, 84, 0, 0,
  89, 0, 0, 86, 0, 0,     86, 0, 0, 82, 0, 0,
  88, 0, 0, 84, 0, 0,     89, 0, 0, 0, 0, 0,
];

const ZONE1_BASS: readonly number[] = [
  // Bouncy alpine OOM-pa-pa (root on 0, fifth/chord on 3)
  53, 0, 60, 57, 0, 60,   48, 0, 55, 52, 0, 55,
  50, 0, 57, 53, 0, 57,   46, 0, 53, 48, 0, 55,
  53, 0, 60, 57, 0, 60,   46, 0, 53, 50, 0, 53,
  48, 0, 55, 52, 0, 55,   53, 0, 60, 53, 0, 0,
];

// Zone 2: Atmospheric Subterranean Dark Mines Pulse (D Minor / Dorian)
const ZONE2_PULSE_BASS: readonly number[] = [
  // Hypnotic low cavern pulse synced to the same 48-step grid
  38, 0, 38, 45, 0, 38,   38, 0, 41, 43, 0, 40,
  38, 0, 38, 45, 0, 41,   46, 0, 45, 43, 0, 40,
  38, 0, 38, 45, 0, 38,   41, 0, 43, 45, 0, 41,
  40, 0, 43, 45, 0, 43,   38, 0, 45, 38, 0, 0,
];

const ZONE2_CAVERN_ARP: readonly number[] = [
  // Mysterious echoing crystal/water-drop motifs
  62, 0, 0, 69, 0, 65,    0, 0, 64, 0, 0, 69,
  62, 0, 65, 0, 72, 0,    70, 0, 0, 67, 0, 0,
  62, 0, 0, 69, 74, 0,    72, 0, 69, 0, 65, 0,
  64, 0, 67, 0, 70, 0,    69, 0, 0, 62, 0, 0,
];

const ZONE2_PADS: ReadonlyArray<readonly number[] | null> = [
  [50, 57, 65], // Bar 1: Dm
  [50, 57, 64], // Bar 2: Dm(add9)
  [50, 53, 60], // Bar 3: Dm7
  [46, 53, 62], // Bar 4: Bbmaj7
  [50, 57, 65], // Bar 5: Dm
  [48, 55, 62], // Bar 6: Csus2
  [45, 52, 60], // Bar 7: Am
  [50, 57, 62], // Bar 8: D5
];

interface TrackProfile {
  stepSec: number;
  transposeSemitones: number;
  forceZone2: number | null; // null = dynamic biome crossfade
  leadWave: OscillatorType;
  bassWave: OscillatorType;
  cutoffScale: number;
}

const TRACK_PROFILES: Record<Exclude<JukeboxTrackId, 'Random'>, TrackProfile> = {
  Base: { stepSec: 0.175, transposeSemitones: 0, forceZone2: null, leadWave: 'triangle', bassWave: 'triangle', cutoffScale: 1.0 },
  Bits: { stepSec: 0.165, transposeSemitones: 0, forceZone2: null, leadWave: 'square', bassWave: 'square', cutoffScale: 0.82 },
  Track1: { stepSec: 0.178, transposeSemitones: 0, forceZone2: 0.0, leadWave: 'triangle', bassWave: 'triangle', cutoffScale: 1.05 },
  Track2: { stepSec: 0.19, transposeSemitones: -2, forceZone2: 0.15, leadWave: 'sine', bassWave: 'triangle', cutoffScale: 0.9 },
  Track3: { stepSec: 0.182, transposeSemitones: 0, forceZone2: 1.0, leadWave: 'triangle', bassWave: 'sawtooth', cutoffScale: 0.85 },
  Track4: { stepSec: 0.168, transposeSemitones: 2, forceZone2: 0.0, leadWave: 'triangle', bassWave: 'triangle', cutoffScale: 1.15 },
  Track5: { stepSec: 0.155, transposeSemitones: 3, forceZone2: 0.35, leadWave: 'square', bassWave: 'triangle', cutoffScale: 1.0 },
  Track6: { stepSec: 0.152, transposeSemitones: -1, forceZone2: 1.0, leadWave: 'sawtooth', bassWave: 'sawtooth', cutoffScale: 1.1 },
  Remix1: { stepSec: 0.148, transposeSemitones: 2, forceZone2: 0.25, leadWave: 'square', bassWave: 'sawtooth', cutoffScale: 1.1 },
  Remix2: { stepSec: 0.158, transposeSemitones: -3, forceZone2: 0.85, leadWave: 'square', bassWave: 'sawtooth', cutoffScale: 0.95 },
};

const RANDOM_TRACK_POOL: readonly Exclude<JukeboxTrackId, 'Random'>[] = [
  'Base',
  'Bits',
  'Track1',
  'Track2',
  'Track3',
  'Track4',
  'Track5',
  'Track6',
  'Remix1',
  'Remix2',
];

function midiToHz(midi: number, transpose = 0): number {
  return 440 * Math.pow(2, (midi + transpose - 69) / 12);
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function jitterPitch(range = PITCH_JITTER_RANGE): number {
  return 1 + (Math.random() * 2 - 1) * range;
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
  private sfxGain: GainNode | null = null;
  private zone1Bus: GainNode | null = null;
  private zone2Bus: GainNode | null = null;
  private windBed: WindBedHandle | null = null;

  private settings: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };
  private unlocked = false;
  private disposed = false;

  // Polyphony tracking (strictly capped at MAX_SFX_VOICES = 16)
  private activeVoices: VoiceHandle[] = [];

  // Per-event micro-cooldowns (in milliseconds on monotonic clock)
  private readonly lastEventMs = new Map<string, number>();

  // Music sequencer state
  private nextStepTime = 0;
  private stepIndex = 0;
  private zone2Blend = 0;
  private currentBiome: BiomeId = 'foothills';
  private activeRandomTrack: Exclude<JukeboxTrackId, 'Random'> = 'Track1';

  // Custom audio pack buffers (optional override with procedural fallback)
  private customUrls: Record<string, string> = {};
  private readonly customBuffers = new Map<string, AudioBuffer | null>();
  private readonly customLoading = new Set<string>();

  unlock(): void {
    if (this.disposed) return;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return;

    try {
      if (!this.ctx) {
        const ctx = new Ctor();
        this.ctx = ctx;
        this.synth = new ProceduralSynth(ctx);

        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-12, ctx.currentTime);
        compressor.knee.setValueAtTime(16, ctx.currentTime);
        compressor.ratio.setValueAtTime(6, ctx.currentTime);
        compressor.attack.setValueAtTime(0.004, ctx.currentTime);
        compressor.release.setValueAtTime(0.14, ctx.currentTime);

        const masterGain = ctx.createGain();
        const musicGain = ctx.createGain();
        const sfxGain = ctx.createGain();
        const zone1Bus = ctx.createGain();
        const zone2Bus = ctx.createGain();

        zone1Bus.gain.setValueAtTime(1, ctx.currentTime);
        zone2Bus.gain.setValueAtTime(0, ctx.currentTime);

        zone1Bus.connect(musicGain);
        zone2Bus.connect(musicGain);
        musicGain.connect(compressor);
        sfxGain.connect(compressor);
        compressor.connect(masterGain);
        masterGain.connect(ctx.destination);

        this.compressor = compressor;
        this.masterGain = masterGain;
        this.musicGain = musicGain;
        this.sfxGain = sfxGain;
        this.zone1Bus = zone1Bus;
        this.zone2Bus = zone2Bus;
        this.windBed = this.synth.createWindBed(sfxGain);

        this.nextStepTime = ctx.currentTime + 0.06;
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
      this.pickRandomTrack();
    }

    this.applyBusGains(false);
  }

  setCustomAudioPack(urls: Record<string, string>): void {
    if (this.disposed) return;
    this.customUrls = { ...urls };
    this.customBuffers.clear();
    this.customLoading.clear();
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

    if (!this.ctx || !this.synth || !this.zone1Bus || !this.zone2Bus) return;
    if (this.ctx.state !== 'running') {
      this.nextStepTime = this.ctx.currentTime + 0.05;
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

    // 2. Subtle low-stamina grab sweat/strain micro-tick (cooldown >= 260ms)
    if (!this.settings.muted && this.settings.sfx > 0.001) {
      this.checkGrabStrain(state.p1, state);
      this.checkGrabStrain(state.p2, state);
    }

    // 3. Smooth equal-power crossfade between Zone 1 Alpine & Zone 2 Dark Mines
    const profile = this.getActiveTrackProfile();
    const targetBlend =
      profile.forceZone2 !== null
        ? profile.forceZone2
        : this.biomeToZone2Target(state.currentBiome);

    const maxStep = safeDt / CROSSFADE_DURATION_SEC;
    if (this.zone2Blend < targetBlend) {
      this.zone2Blend = Math.min(targetBlend, this.zone2Blend + maxStep);
    } else if (this.zone2Blend > targetBlend) {
      this.zone2Blend = Math.max(targetBlend, this.zone2Blend - maxStep);
    }

    const now = this.ctx.currentTime;
    const z1Gain = Math.cos(this.zone2Blend * Math.PI * 0.5);
    const z2Gain = Math.sin(this.zone2Blend * Math.PI * 0.5);
    this.zone1Bus.gain.setTargetAtTime(z1Gain, now, 0.04);
    this.zone2Bus.gain.setTargetAtTime(z2Gain, now, 0.04);

    // 4. Lookahead music sequencer
    if (this.settings.muted || this.settings.music <= 0.001) {
      this.nextStepTime = now + 0.05;
      return;
    }

    // Resync gracefully after tab-background or lag spikes (never machine-gun notes)
    if (this.nextStepTime < now - 0.12) {
      this.nextStepTime = now + 0.04;
    }

    const horizon = now + LOOKAHEAD_SEC;
    let safety = 0;
    while (this.nextStepTime < horizon && safety < 8) {
      this.scheduleSequencerStep(this.stepIndex, this.nextStepTime, profile, z1Gain, z2Gain);
      this.nextStepTime += profile.stepSec;
      this.stepIndex = (this.stepIndex + 1) % ZONE1_LEAD.length;
      if (this.stepIndex === 0 && this.settings.jukeboxTrack === 'Random') {
        this.pickRandomTrack();
      }
      safety++;
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
    this.customBuffers.clear();
    this.customLoading.clear();

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
    this.sfxGain = null;
    this.zone1Bus = null;
    this.zone2Bus = null;
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
  // Internal Mixing, Panning, Cooldowns & Polyphony Cap
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
    // Find the oldest voice with strictly lower (or equal if high priority) priority to steal
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
    // Accelerates subtly from 320ms down to 160ms as stamina runs out (always >= 50ms)
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
  // Custom Audio Pack Playback (with Seamless Procedural Fallback)
  // ==========================================================================

  private tryPlayCustomSample(
    keys: readonly string[],
    pan: number,
    volume: number,
    pitchMult: number,
    priority: number
  ): boolean {
    if (!this.ctx || !this.sfxGain) return false;
    for (const key of keys) {
      const url = this.customUrls[key];
      if (!url) continue;

      const cached = this.customBuffers.get(key);
      if (cached) {
        if (!this.reserveVoiceSlot(priority)) return true;
        const now = this.ctx.currentTime;
        const src = this.ctx.createBufferSource();
        src.buffer = cached;
        src.playbackRate.setValueAtTime(clamp(pitchMult, 0.5, 2.0), now);

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
        const rate = clamp(pitchMult, 0.5, 2.0);
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
              // Ignore
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
            // Ignore
          }
          this.releaseVoice(handle);
        };
        this.trackVoice(handle);
        src.start(now);
        return true;
      }

      // Kick off lazy background decode for next play; fall back to synth right now
      if (cached === undefined && !this.customLoading.has(key) && typeof fetch === 'function') {
        this.customLoading.add(key);
        const ctxRef = this.ctx;
        fetch(url)
          .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error('HTTP error'))))
          .then((arr) => ctxRef.decodeAudioData(arr))
          .then((decoded) => {
            if (!this.disposed) this.customBuffers.set(key, decoded);
          })
          .catch(() => {
            if (!this.disposed) this.customBuffers.set(key, null);
          })
          .finally(() => {
            this.customLoading.delete(key);
          });
      }
    }
    return false;
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
        if (this.tryPlayCustomSample(['boss_defeated'], 0, 0.85, 1.0, 4)) return;
        spawn(4, (onVoiceEnd) => synth.playBossDefeated(sfx, { pan: 0, onVoiceEnd }));
        return;
      }

      case 'summit_reached': {
        if (this.tryPlayCustomSample(['summit_reached'], 0, 0.85, 1.0, 4)) return;
        spawn(4, (onVoiceEnd) => synth.playSummitReached(sfx, event.noAssist, { pan: 0, onVoiceEnd }));
        return;
      }

      case 'time_trial_finish': {
        if (this.tryPlayCustomSample(['time_trial_finish'], 0, 0.78, 1.0, 4)) return;
        spawn(4, (onVoiceEnd) => synth.playTimeTrialFinish(sfx, event.medal, { pan: 0, onVoiceEnd }));
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
        spawn(2, (onVoiceEnd) => synth.playRpsResult(sfx, event.winner, { pan: 0, onVoiceEnd }));
        return;
      }

      case 'achievement_unlock': {
        if (!this.checkCooldown(`achievement:${event.id}`, 200)) return;
        spawn(3, (onVoiceEnd) => synth.playAchievementUnlock(sfx, { pan: 0, onVoiceEnd }));
        return;
      }

      default:
        assertNever(event);
    }
  }

  // ==========================================================================
  // Dynamic Alpine <-> Subterranean Music Sequencer
  // ==========================================================================

  private biomeToZone2Target(biome: BiomeId): number {
    switch (biome) {
      case 'mines':
      case 'lab':
      case 'boss':
        return 1.0;
      case 'crags':
        return 0.18; // Subtle atmospheric undertone in windy crags while keeping alpine bounce
      case 'village':
      case 'foothills':
      case 'summit':
      default:
        return 0.0;
    }
  }

  private pickRandomTrack(): void {
    const idx = Math.floor(Math.random() * RANDOM_TRACK_POOL.length);
    this.activeRandomTrack = RANDOM_TRACK_POOL[idx] ?? 'Base';
  }

  private getActiveTrackProfile(): TrackProfile {
    const key =
      this.settings.jukeboxTrack === 'Random'
        ? this.activeRandomTrack
        : this.settings.jukeboxTrack;
    return TRACK_PROFILES[key] ?? TRACK_PROFILES.Base;
  }

  private scheduleSequencerStep(
    step: number,
    time: number,
    profile: TrackProfile,
    z1Gain: number,
    z2Gain: number
  ): void {
    if (!this.synth || !this.zone1Bus || !this.zone2Bus) return;
    const stepDur = profile.stepSec;
    const transpose = profile.transposeSemitones;
    const barIndex = Math.floor(step / 6);
    const beatInBar = step % 6;

    // ------------------------------------------------------------------------
    // Zone 1: Cozy Snowy Foothills Alpine Waltz
    // ------------------------------------------------------------------------
    if (z1Gain > 0.015) {
      const leadMidi = ZONE1_LEAD[step];
      if (leadMidi > 0) {
        const hz = midiToHz(leadMidi, transpose);
        const dur = stepDur * (beatInBar === 0 || beatInBar === 3 ? 1.55 : 0.92);
        const leadGain = profile.leadWave === 'square' ? 0.075 : 0.145;
        this.synth.scheduleMusicNote(
          this.zone1Bus,
          time,
          hz,
          dur,
          profile.leadWave,
          leadGain,
          3400 * profile.cutoffScale,
          0.008
        );
      }

      const sparkleMidi = ZONE1_SPARKLE[step];
      if (sparkleMidi > 0) {
        const hz = midiToHz(sparkleMidi, transpose);
        const sparkleBoost = this.currentBiome === 'summit' ? 1.35 : 1.0;
        this.synth.scheduleMusicNote(
          this.zone1Bus,
          time,
          hz,
          stepDur * 1.4,
          'sine',
          0.048 * sparkleBoost,
          5200 * profile.cutoffScale,
          0.004
        );
      }

      const bassMidi = ZONE1_BASS[step];
      if (bassMidi > 0) {
        const hz = midiToHz(bassMidi, transpose);
        const accent = beatInBar === 0 ? 1.15 : 0.85;
        this.synth.scheduleMusicBass(
          this.zone1Bus,
          time,
          hz,
          stepDur * (beatInBar === 0 ? 1.65 : 0.9),
          0.145 * accent,
          profile.bassWave,
          640 * profile.cutoffScale
        );
      }

      // Soft brushed alpine percussion (OOM-tick-tick)
      if (beatInBar === 0) {
        this.synth.scheduleMusicKick(this.zone1Bus, time, 0.13);
      } else if (beatInBar === 2 || beatInBar === 4) {
        this.synth.scheduleMusicHat(this.zone1Bus, time, 0.036, true);
      }
    }

    // ------------------------------------------------------------------------
    // Zone 2: Atmospheric Subterranean Dark Mines / Lab Pulse
    // ------------------------------------------------------------------------
    if (z2Gain > 0.015) {
      const isElectronic = this.currentBiome === 'lab' || this.currentBiome === 'boss';
      const pulseMidi = ZONE2_PULSE_BASS[step];
      if (pulseMidi > 0) {
        const hz = midiToHz(pulseMidi, transpose);
        const bassWave: OscillatorType = isElectronic ? 'sawtooth' : profile.bassWave === 'square' ? 'square' : 'sawtooth';
        const cutoff = (isElectronic ? 880 : 480) * profile.cutoffScale;
        this.synth.scheduleMusicBass(
          this.zone2Bus,
          time,
          hz,
          stepDur * 1.15,
          isElectronic ? 0.135 : 0.155,
          bassWave,
          cutoff
        );
      }

      // Subterranean crystal / water-drop echoing arpeggio
      const arpMidi = ZONE2_CAVERN_ARP[step];
      if (arpMidi > 0) {
        const hz = midiToHz(arpMidi, transpose);
        if (isElectronic) {
          this.synth.scheduleMusicNote(
            this.zone2Bus,
            time,
            hz,
            stepDur * 0.9,
            'square',
            0.068,
            2400 * profile.cutoffScale,
            0.005
          );
        } else {
          this.synth.scheduleCavernPing(this.zone2Bus, time, hz, 0.095);
          // Subtle ghostly cave echo 2 steps later
          this.synth.scheduleCavernPing(this.zone2Bus, time + stepDur * 2, hz, 0.036);
        }
      }

      // Slow subterranean pad chord on the start of every 6-step bar
      if (beatInBar === 0) {
        const chord = ZONE2_PADS[barIndex];
        if (chord) {
          const freqs = chord.map((m) => midiToHz(m, transpose));
          this.synth.schedulePadChord(
            this.zone2Bus,
            time,
            freqs,
            stepDur * 5.8,
            isElectronic ? 0.08 : 0.11,
            (isElectronic ? 1050 : 660) * profile.cutoffScale
          );
        }
      }

      // Deep subterranean heartbeat pulse
      if (beatInBar === 0 || (isElectronic && beatInBar === 3)) {
        this.synth.scheduleMusicKick(this.zone2Bus, time, isElectronic ? 0.16 : 0.12);
      } else if (beatInBar === 3) {
        this.synth.scheduleMusicHat(this.zone2Bus, time, 0.028, false);
      }
    }
  }
}
