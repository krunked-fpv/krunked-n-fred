// ============================================================================
// Krunked & Fred — Procedural Web Audio Synthesizer
// Pure Web Audio API synthesis for all 14 TerrainTypes, 32 SimEvents, UI blips,
// and chiptune/alpine/subterranean musical voices. Zero external dependencies.
// ============================================================================

import type { EmoteType, MedalTier, TerrainType } from '../contracts';

export type UiSoundKind = 'move' | 'confirm' | 'cancel' | 'toggle';

export interface VoiceHandle {
  readonly priority: number;
  readonly endTime: number;
  stop(fadeSec?: number): void;
}

export interface SynthOptions {
  pan?: number;
  volume?: number;
  pitchMult?: number;
  priority?: number;
  onVoiceEnd?: () => void;
}

interface SurfaceProfile {
  /** Base thump/body start frequency (Hz) */
  bodyStartHz: number;
  /** Base thump/body end frequency (Hz) */
  bodyEndHz: number;
  /** Body oscillator waveform */
  bodyWave: OscillatorType;
  /** Body gain contribution */
  bodyGain: number;
  /** Primary texture noise filter center frequency (Hz) */
  noiseFreq: number;
  /** Noise filter type */
  noiseFilter: BiquadFilterType;
  /** Noise filter resonance Q */
  noiseQ: number;
  /** Noise source buffer flavor */
  noiseKind: 'white' | 'pink' | 'crackle';
  /** Texture noise gain */
  noiseGain: number;
  /** Optional tonal overtone/ping frequencies (Hz) for ice/metal/wood resonance */
  pingFreqs?: readonly number[];
  /** Ping waveform */
  pingWave?: OscillatorType;
  /** Ping gain */
  pingGain?: number;
  /** Ping decay time (seconds) */
  pingDecay?: number;
  /** Optional wet/formant filter sweep end frequency (Hz) */
  noiseEndFreq?: number;
  /** Base footstep duration (seconds) */
  stepDur: number;
}

const SURFACE_PROFILES: Record<TerrainType, SurfaceProfile> = {
  SNOW: {
    bodyStartHz: 140,
    bodyEndHz: 75,
    bodyWave: 'sine',
    bodyGain: 0.22,
    noiseFreq: 1480,
    noiseEndFreq: 980,
    noiseFilter: 'bandpass',
    noiseQ: 1.9,
    noiseKind: 'crackle',
    noiseGain: 0.62,
    stepDur: 0.068,
  },
  ICE: {
    bodyStartHz: 260,
    bodyEndHz: 180,
    bodyWave: 'triangle',
    bodyGain: 0.14,
    noiseFreq: 4200,
    noiseFilter: 'highpass',
    noiseQ: 1.4,
    noiseKind: 'white',
    noiseGain: 0.24,
    pingFreqs: [2093, 3136],
    pingWave: 'sine',
    pingGain: 0.34,
    pingDecay: 0.11,
    stepDur: 0.055,
  },
  PLATFORM: {
    bodyStartHz: 235,
    bodyEndHz: 112,
    bodyWave: 'triangle',
    bodyGain: 0.52,
    noiseFreq: 760,
    noiseFilter: 'bandpass',
    noiseQ: 1.8,
    noiseKind: 'pink',
    noiseGain: 0.28,
    pingFreqs: [410],
    pingWave: 'triangle',
    pingGain: 0.16,
    pingDecay: 0.055,
    stepDur: 0.06,
  },
  MOVABLE: {
    bodyStartHz: 195,
    bodyEndHz: 98,
    bodyWave: 'triangle',
    bodyGain: 0.48,
    noiseFreq: 920,
    noiseFilter: 'bandpass',
    noiseQ: 2.2,
    noiseKind: 'pink',
    noiseGain: 0.26,
    pingFreqs: [880, 1240],
    pingWave: 'triangle',
    pingGain: 0.18,
    pingDecay: 0.065,
    stepDur: 0.062,
  },
  DIRT: {
    bodyStartHz: 122,
    bodyEndHz: 60,
    bodyWave: 'sine',
    bodyGain: 0.38,
    noiseFreq: 920,
    noiseEndFreq: 520,
    noiseFilter: 'bandpass',
    noiseQ: 1.15,
    noiseKind: 'crackle',
    noiseGain: 0.56,
    stepDur: 0.072,
  },
  MUD: {
    bodyStartHz: 155,
    bodyEndHz: 88,
    bodyWave: 'sine',
    bodyGain: 0.42,
    noiseFreq: 520,
    noiseEndFreq: 1280,
    noiseFilter: 'bandpass',
    noiseQ: 4.2,
    noiseKind: 'pink',
    noiseGain: 0.54,
    pingFreqs: [290],
    pingWave: 'sine',
    pingGain: 0.2,
    pingDecay: 0.075,
    stepDur: 0.085,
  },
  BELL_HOUSE: {
    bodyStartHz: 315,
    bodyEndHz: 185,
    bodyWave: 'triangle',
    bodyGain: 0.48,
    noiseFreq: 1020,
    noiseFilter: 'bandpass',
    noiseQ: 2.4,
    noiseKind: 'pink',
    noiseGain: 0.22,
    pingFreqs: [630, 1760],
    pingWave: 'sine',
    pingGain: 0.2,
    pingDecay: 0.13,
    stepDur: 0.064,
  },
  WORKSHOP: {
    bodyStartHz: 275,
    bodyEndHz: 150,
    bodyWave: 'triangle',
    bodyGain: 0.52,
    noiseFreq: 1180,
    noiseFilter: 'bandpass',
    noiseQ: 2.6,
    noiseKind: 'white',
    noiseGain: 0.26,
    pingFreqs: [540],
    pingWave: 'triangle',
    pingGain: 0.24,
    pingDecay: 0.052,
    stepDur: 0.056,
  },
  LAB: {
    bodyStartHz: 195,
    bodyEndHz: 115,
    bodyWave: 'triangle',
    bodyGain: 0.26,
    noiseFreq: 2800,
    noiseFilter: 'highpass',
    noiseQ: 1.5,
    noiseKind: 'white',
    noiseGain: 0.22,
    pingFreqs: [1320, 1985],
    pingWave: 'triangle',
    pingGain: 0.34,
    pingDecay: 0.09,
    stepDur: 0.052,
  },
  LAB2: {
    bodyStartHz: 162,
    bodyEndHz: 84,
    bodyWave: 'triangle',
    bodyGain: 0.36,
    noiseFreq: 2150,
    noiseFilter: 'bandpass',
    noiseQ: 2.0,
    noiseKind: 'white',
    noiseGain: 0.24,
    pingFreqs: [915, 1460],
    pingWave: 'square',
    pingGain: 0.18,
    pingDecay: 0.1,
    stepDur: 0.06,
  },
  LAB_PLATFORM: {
    bodyStartHz: 245,
    bodyEndHz: 155,
    bodyWave: 'triangle',
    bodyGain: 0.24,
    noiseFreq: 3200,
    noiseFilter: 'bandpass',
    noiseQ: 2.2,
    noiseKind: 'white',
    noiseGain: 0.26,
    pingFreqs: [1580, 2370],
    pingWave: 'triangle',
    pingGain: 0.3,
    pingDecay: 0.085,
    stepDur: 0.05,
  },
  LAB_PLATFORM2: {
    bodyStartHz: 265,
    bodyEndHz: 168,
    bodyWave: 'triangle',
    bodyGain: 0.22,
    noiseFreq: 3500,
    noiseFilter: 'bandpass',
    noiseQ: 2.4,
    noiseKind: 'white',
    noiseGain: 0.24,
    pingFreqs: [1760, 2640],
    pingWave: 'sine',
    pingGain: 0.32,
    pingDecay: 0.09,
    stepDur: 0.05,
  },
  TRONCHO: {
    bodyStartHz: 185,
    bodyEndHz: 86,
    bodyWave: 'sawtooth',
    bodyGain: 0.26,
    noiseFreq: 2250,
    noiseFilter: 'bandpass',
    noiseQ: 2.0,
    noiseKind: 'white',
    noiseGain: 0.3,
    pingFreqs: [780, 1245],
    pingWave: 'triangle',
    pingGain: 0.3,
    pingDecay: 0.105,
    stepDur: 0.064,
  },
  DEFAULT: {
    bodyStartHz: 175,
    bodyEndHz: 90,
    bodyWave: 'triangle',
    bodyGain: 0.4,
    noiseFreq: 1220,
    noiseFilter: 'bandpass',
    noiseQ: 1.5,
    noiseKind: 'pink',
    noiseGain: 0.34,
    stepDur: 0.06,
  },
};

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function safeFreq(hz: number, sampleRate: number): number {
  const maxHz = Math.max(4000, sampleRate * 0.45);
  return clamp(hz, 24, maxHz);
}

interface VoiceBuilder {
  readonly out: GainNode;
  readonly startTime: number;
  register(node: AudioScheduledSourceNode, endTime: number): void;
  finalize(): VoiceHandle;
}

export interface WindBedHandle {
  setDirection(dir: 1 | -1): void;
  setActive(active: boolean, intensity?: number): void;
  dispose(): void;
}

export class ProceduralSynth {
  private readonly ctx: AudioContext;
  private readonly whiteBuffer: AudioBuffer;
  private readonly pinkBuffer: AudioBuffer;
  private readonly crackleBuffer: AudioBuffer;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.whiteBuffer = this.createWhiteNoiseBuffer(2.0);
    this.pinkBuffer = this.createPinkNoiseBuffer(2.0);
    this.crackleBuffer = this.createCrackleNoiseBuffer(1.2);
  }

  private createWhiteNoiseBuffer(durationSec: number): AudioBuffer {
    const sr = this.ctx.sampleRate || 44100;
    const len = Math.max(1024, Math.floor(sr * durationSec));
    const buffer = this.ctx.createBuffer(1, len, sr);
    const data = buffer.getChannelData(0);
    let seed = 0x1a2b3c4d;
    for (let i = 0; i < len; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = (seed / 0xffffffff) * 2 - 1;
    }
    return buffer;
  }

  private createPinkNoiseBuffer(durationSec: number): AudioBuffer {
    const sr = this.ctx.sampleRate || 44100;
    const len = Math.max(1024, Math.floor(sr * durationSec));
    const buffer = this.ctx.createBuffer(1, len, sr);
    const data = buffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    let seed = 0x7f4a7c15;
    for (let i = 0; i < len; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const white = (seed / 0xffffffff) * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;
      data[i] = clamp(pink * 0.11, -1, 1);
    }
    return buffer;
  }

  private createCrackleNoiseBuffer(durationSec: number): AudioBuffer {
    const sr = this.ctx.sampleRate || 44100;
    const len = Math.max(1024, Math.floor(sr * durationSec));
    const buffer = this.ctx.createBuffer(1, len, sr);
    const data = buffer.getChannelData(0);
    let seed = 0x517cc1b7;
    for (let i = 0; i < len; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const r = seed / 0xffffffff;
      const base = (r * 2 - 1) * 0.35;
      // Sparse sharp grain impulses for snow crunch & gravel grit
      const grain = r > 0.93 ? ((r - 0.93) / 0.07) * (i % 2 === 0 ? 1 : -1) * 0.95 : 0;
      data[i] = clamp(base + grain, -1, 1);
    }
    return buffer;
  }

  private getNoiseBuffer(kind: 'white' | 'pink' | 'crackle'): AudioBuffer {
    if (kind === 'pink') return this.pinkBuffer;
    if (kind === 'crackle') return this.crackleBuffer;
    return this.whiteBuffer;
  }

  private beginVoice(dest: AudioNode, opts: SynthOptions = {}): VoiceBuilder {
    const now = this.ctx.currentTime;
    const out = this.ctx.createGain();
    const volume = clamp(opts.volume ?? 1, 0, 2);
    out.gain.setValueAtTime(volume, now);

    let panNode: StereoPannerNode | null = null;
    if (typeof this.ctx.createStereoPanner === 'function') {
      panNode = this.ctx.createStereoPanner();
      panNode.pan.setValueAtTime(clamp(opts.pan ?? 0, -0.85, 0.85), now);
      out.connect(panNode);
      panNode.connect(dest);
    } else {
      out.connect(dest);
    }

    const sources: AudioScheduledSourceNode[] = [];
    let longestSource: AudioScheduledSourceNode | null = null;
    let longestEnd = now;
    let ended = false;

    const cleanup = (): void => {
      if (ended) return;
      ended = true;
      try {
        out.disconnect();
        panNode?.disconnect();
      } catch {
        // Ignore already-disconnected errors
      }
      opts.onVoiceEnd?.();
    };

    return {
      out,
      startTime: now,
      register: (node: AudioScheduledSourceNode, endTime: number): void => {
        sources.push(node);
        if (endTime >= longestEnd || !longestSource) {
          longestEnd = endTime;
          longestSource = node;
        }
      },
      finalize: (): VoiceHandle => {
        if (longestSource) {
          longestSource.onended = cleanup;
        } else {
          cleanup();
        }
        return {
          priority: opts.priority ?? 1,
          endTime: longestEnd,
          stop: (fadeSec = 0.015): void => {
            if (ended) return;
            const t = this.ctx.currentTime;
            try {
              out.gain.cancelScheduledValues(t);
              out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), t);
              out.gain.linearRampToValueAtTime(0, t + Math.max(0.004, fadeSec));
            } catch {
              // Ignore parameter automation errors on closing context
            }
            const stopAt = t + Math.max(0.005, fadeSec) + 0.004;
            for (const src of sources) {
              try {
                src.stop(stopAt);
              } catch {
                // Already stopped
              }
            }
            cleanup();
          },
        };
      },
    };
  }

  private addTone(
    voice: VoiceBuilder,
    startOffset: number,
    duration: number,
    wave: OscillatorType,
    startHz: number,
    endHz: number,
    peakGain: number,
    attackSec = 0.005,
    target: AudioNode = voice.out
  ): void {
    const sr = this.ctx.sampleRate || 44100;
    const t0 = voice.startTime + Math.max(0, startOffset);
    const dur = Math.max(0.015, duration);
    const t1 = t0 + dur;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(safeFreq(startHz, sr), t0);
    if (Math.abs(endHz - startHz) > 0.5) {
      osc.frequency.exponentialRampToValueAtTime(safeFreq(endHz, sr), t1);
    }
    const atk = Math.min(attackSec, dur * 0.35);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(Math.max(0.0002, peakGain), t0 + atk);
    env.gain.exponentialRampToValueAtTime(0.0001, Math.max(t0 + atk + 0.005, t1 - 0.004));
    env.gain.linearRampToValueAtTime(0, t1);

    osc.connect(env);
    env.connect(target);
    osc.start(t0);
    osc.stop(t1 + 0.005);
    voice.register(osc, t1 + 0.005);
  }

  private addNoiseBurst(
    voice: VoiceBuilder,
    startOffset: number,
    duration: number,
    kind: 'white' | 'pink' | 'crackle',
    filterType: BiquadFilterType,
    startFreq: number,
    endFreq: number,
    q: number,
    peakGain: number,
    attackSec = 0.004,
    target: AudioNode = voice.out
  ): void {
    const sr = this.ctx.sampleRate || 44100;
    const t0 = voice.startTime + Math.max(0, startOffset);
    const dur = Math.max(0.015, duration);
    const t1 = t0 + dur;

    const src = this.ctx.createBufferSource();
    const buf = this.getNoiseBuffer(kind);
    src.buffer = buf;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.setValueAtTime(clamp(q, 0.2, 18), t0);
    filter.frequency.setValueAtTime(safeFreq(startFreq, sr), t0);
    if (Math.abs(endFreq - startFreq) > 1) {
      filter.frequency.exponentialRampToValueAtTime(safeFreq(endFreq, sr), t1);
    }

    const env = this.ctx.createGain();
    const atk = Math.min(attackSec, dur * 0.35);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(Math.max(0.0002, peakGain), t0 + atk);
    env.gain.exponentialRampToValueAtTime(0.0001, Math.max(t0 + atk + 0.005, t1 - 0.004));
    env.gain.linearRampToValueAtTime(0, t1);

    src.connect(filter);
    filter.connect(env);
    env.connect(target);

    const offset = Math.random() * Math.max(0.01, buf.duration - 0.05);
    src.start(t0, offset);
    src.stop(t1 + 0.005);
    voice.register(src, t1 + 0.005);
  }

  // ==========================================================================
  // Surface-Differentiated SFX (All 14 TerrainTypes)
  // ==========================================================================

  playFootstep(
    dest: AudioNode,
    terrain: TerrainType,
    who: 'p1' | 'p2',
    opts: SynthOptions = {}
  ): VoiceHandle {
    const profile = SURFACE_PROFILES[terrain] ?? SURFACE_PROFILES.DEFAULT;
    const pitch = (opts.pitchMult ?? 1) * (who === 'p2' ? 1.055 : 1.0);
    const voice = this.beginVoice(dest, { ...opts, volume: (opts.volume ?? 1) * 0.34, priority: 0 });

    const dur = profile.stepDur;
    this.addTone(
      voice,
      0,
      dur * 0.85,
      profile.bodyWave,
      profile.bodyStartHz * pitch,
      profile.bodyEndHz * pitch,
      profile.bodyGain,
      0.003
    );

    this.addNoiseBurst(
      voice,
      0,
      dur,
      profile.noiseKind,
      profile.noiseFilter,
      profile.noiseFreq * pitch,
      (profile.noiseEndFreq ?? profile.noiseFreq * 0.85) * pitch,
      profile.noiseQ,
      profile.noiseGain,
      0.004
    );

    if (profile.pingFreqs) {
      const pingGain = (profile.pingGain ?? 0.2) * 0.72;
      const pingDecay = (profile.pingDecay ?? 0.08) * 0.85;
      for (let i = 0; i < profile.pingFreqs.length; i++) {
        const hz = profile.pingFreqs[i] * pitch;
        this.addTone(
          voice,
          0.002 * i,
          pingDecay,
          profile.pingWave ?? 'sine',
          hz,
          hz * 0.992,
          pingGain / (i + 1),
          0.002
        );
      }
    }

    return voice.finalize();
  }

  playLand(
    dest: AudioNode,
    terrain: TerrainType,
    who: 'p1' | 'p2' | 'jeff',
    impactVy: number,
    opts: SynthOptions = {}
  ): VoiceHandle {
    const profile = SURFACE_PROFILES[terrain] ?? SURFACE_PROFILES.DEFAULT;
    const intensity = clamp(Math.abs(impactVy) / 18, 0.32, 1.0);
    const whoPitch = who === 'jeff' ? 0.82 : who === 'p2' ? 1.04 : 1.0;
    const pitch = (opts.pitchMult ?? 1) * whoPitch;
    const voice = this.beginVoice(dest, {
      ...opts,
      volume: (opts.volume ?? 1) * (0.38 + intensity * 0.38),
      priority: 1,
    });

    const dur = profile.stepDur * (1.35 + intensity * 0.55);
    // Grounded impact weight
    this.addTone(
      voice,
      0,
      dur,
      profile.bodyWave,
      profile.bodyStartHz * 0.92 * pitch,
      profile.bodyEndHz * 0.68 * pitch,
      profile.bodyGain * 1.35,
      0.004
    );
    // Sub punch for bigger drops
    if (intensity > 0.45) {
      this.addTone(voice, 0, 0.11, 'sine', 120 * pitch, 48 * pitch, 0.34 * intensity, 0.003);
    }
    // Surface crunch / scrape
    this.addNoiseBurst(
      voice,
      0,
      dur * 1.15,
      profile.noiseKind,
      profile.noiseFilter,
      profile.noiseFreq * 0.92 * pitch,
      (profile.noiseEndFreq ?? profile.noiseFreq * 0.72) * pitch,
      profile.noiseQ * 0.9,
      profile.noiseGain * 1.15,
      0.004
    );

    if (profile.pingFreqs) {
      const pingDecay = (profile.pingDecay ?? 0.09) * (1.1 + intensity * 0.4);
      for (let i = 0; i < profile.pingFreqs.length; i++) {
        const hz = profile.pingFreqs[i] * pitch;
        this.addTone(
          voice,
          0.003 * i,
          pingDecay,
          profile.pingWave ?? 'sine',
          hz,
          hz * 0.985,
          (profile.pingGain ?? 0.24) * (0.9 + intensity * 0.35) / (i + 1),
          0.002
        );
      }
    }

    return voice.finalize();
  }

  playLandHard(
    dest: AudioNode,
    terrain: TerrainType,
    opts: SynthOptions = {}
  ): VoiceHandle {
    const profile = SURFACE_PROFILES[terrain] ?? SURFACE_PROFILES.DEFAULT;
    const pitch = opts.pitchMult ?? 1;
    const voice = this.beginVoice(dest, { ...opts, volume: (opts.volume ?? 1) * 0.85, priority: 3 });

    // 1. Punchy low sub thud
    this.addTone(voice, 0, 0.22, 'sine', 148 * pitch, 36 * pitch, 0.72, 0.003);
    this.addTone(voice, 0, 0.16, 'triangle', 105 * pitch, 32 * pitch, 0.48, 0.003);

    // 2. Surface impact burst
    this.addNoiseBurst(
      voice,
      0,
      0.19,
      profile.noiseKind,
      profile.noiseFilter,
      profile.noiseFreq * 0.85 * pitch,
      profile.noiseFreq * 0.38 * pitch,
      Math.max(0.9, profile.noiseQ * 0.8),
      0.52,
      0.003
    );

    // 3. Comical cartoon splat / pancake squish
    this.addTone(voice, 0.018, 0.12, 'sawtooth', 410 * pitch, 115 * pitch, 0.2, 0.004);
    this.addTone(voice, 0.065, 0.14, 'triangle', 195 * pitch, 82 * pitch, 0.26, 0.006);
    this.addNoiseBurst(voice, 0.015, 0.18, 'pink', 'bandpass', 1550 * pitch, 320 * pitch, 3.8, 0.45, 0.005);

    return voice.finalize();
  }

  // ==========================================================================
  // Movement, Rope, Climbing & Physics SFX
  // ==========================================================================

  playJump(dest: AudioNode, who: 'p1' | 'p2', opts: SynthOptions = {}): VoiceHandle {
    const pitch = (opts.pitchMult ?? 1) * (who === 'p2' ? 1.07 : 1.0);
    const voice = this.beginVoice(dest, { ...opts, volume: (opts.volume ?? 1) * 0.44, priority: 2 });

    // Bouncy rising triangle/sine chirp
    this.addTone(voice, 0, 0.115, 'triangle', 240 * pitch, 610 * pitch, 0.56, 0.005);
    this.addTone(voice, 0.012, 0.105, 'sine', 360 * pitch, 790 * pitch, 0.28, 0.006);
    // Soft snow/air hop puff
    this.addNoiseBurst(voice, 0, 0.045, 'pink', 'bandpass', 1100 * pitch, 1800 * pitch, 1.4, 0.16, 0.003);

    return voice.finalize();
  }

  playGrabStart(dest: AudioNode, terrain: TerrainType, opts: SynthOptions = {}): VoiceHandle {
    const profile = SURFACE_PROFILES[terrain] ?? SURFACE_PROFILES.DEFAULT;
    const pitch = opts.pitchMult ?? 1;
    const voice = this.beginVoice(dest, { ...opts, volume: (opts.volume ?? 1) * 0.45, priority: 1 });

    // Dual crisp claw scratch bursts
    this.addNoiseBurst(voice, 0, 0.042, 'crackle', 'bandpass', 2350 * pitch, 3700 * pitch, 2.8, 0.54, 0.002);
    this.addNoiseBurst(voice, 0.028, 0.048, 'white', 'bandpass', 2600 * pitch, 1750 * pitch, 2.4, 0.36, 0.003);
    // Surface bite tap
    this.addTone(
      voice,
      0.006,
      0.055,
      profile.bodyWave,
      profile.bodyStartHz * 1.15 * pitch,
      profile.bodyEndHz * 0.9 * pitch,
      0.34,
      0.003
    );

    return voice.finalize();
  }

  playGrabStaminaOut(dest: AudioNode, opts: SynthOptions = {}): VoiceHandle {
    const pitch = opts.pitchMult ?? 1;
    const voice = this.beginVoice(dest, { ...opts, volume: (opts.volume ?? 1) * 0.54, priority: 2 });

    // Descending cartoon gasp / slip wheeze
    this.addNoiseBurst(voice, 0, 0.25, 'pink', 'bandpass', 1680 * pitch, 480 * pitch, 3.2, 0.48, 0.015);
    this.addTone(voice, 0.01, 0.27, 'sine', 560 * pitch, 195 * pitch, 0.36, 0.012);
    this.addTone(voice, 0.03, 0.22, 'triangle', 420 * pitch, 165 * pitch, 0.22, 0.015);

    return voice.finalize();
  }

  playGrabStrainTick(dest: AudioNode, redTint: number, opts: SynthOptions = {}): VoiceHandle {
    const pitch = (opts.pitchMult ?? 1) * (1 + clamp(redTint, 0, 1) * 0.25);
    const voice = this.beginVoice(dest, { ...opts, volume: (opts.volume ?? 1) * 0.22, priority: 0 });
    this.addTone(voice, 0, 0.045, 'sine', 520 * pitch, 440 * pitch, 0.35, 0.004);
    this.addNoiseBurst(voice, 0, 0.03, 'pink', 'bandpass', 1800 * pitch, 1200 * pitch, 2.4, 0.18, 0.003);
    return voice.finalize();
  }

  playAnchorSet(dest: AudioNode, terrain: TerrainType, opts: SynthOptions = {}): VoiceHandle {
    const profile = SURFACE_PROFILES[terrain] ?? SURFACE_PROFILES.DEFAULT;
    const pitch = opts.pitchMult ?? 1;
    const voice = this.beginVoice(dest, { ...opts, volume: (opts.volume ?? 1) * 0.62, priority: 2 });

    // Heavy rock-plant clunk
    this.addTone(voice, 0, 0.15, 'triangle', 142 * pitch, 48 * pitch, 0.68, 0.003);
    this.addTone(voice, 0, 0.12, 'sine', 96 * pitch, 42 * pitch, 0.55, 0.003);
    // Decisive lock click
    this.addTone(voice, 0.015, 0.065, 'square', 680 * pitch, 460 * pitch, 0.14, 0.002);
    this.addNoiseBurst(
      voice,
      0,
      0.11,
      profile.noiseKind,
      profile.noiseFilter,
      profile.noiseFreq * 0.75 * pitch,
      profile.noiseFreq * 0.45 * pitch,
      1.6,
      0.46,
      0.003
    );

    return voice.finalize();
  }

  playSwingPump(dest: AudioNode, speed: number, opts: SynthOptions = {}): VoiceHandle {
    const pitch = opts.pitchMult ?? 1;
    const energy = clamp(speed / 12, 0.35, 1.0);
    const voice = this.beginVoice(dest, {
      ...opts,
      volume: (opts.volume ?? 1) * (0.26 + energy * 0.24),
      priority: 0,
    });

    this.addNoiseBurst(
      voice,
      0,
      0.16,
      'pink',
      'bandpass',
      420 * pitch,
      (980 + energy * 520) * pitch,
      2.2,
      0.56,
      0.035
    );
    this.addTone(voice, 0.02, 0.12, 'sine', 260 * pitch, (340 + energy * 110) * pitch, 0.16, 0.025);

    return voice.finalize();
  }

  playSwingLaunch(dest: AudioNode, speed: number, opts: SynthOptions = {}): VoiceHandle {
    const pitch = opts.pitchMult ?? 1;
    const energy = clamp(speed / 14, 0.45, 1.0);
    const voice = this.beginVoice(dest, {
      ...opts,
      volume: (opts.volume ?? 1) * (0.48 + energy * 0.22),
      priority: 2,
    });

    // Airy upward whoosh
    this.addNoiseBurst(voice, 0, 0.22, 'pink', 'bandpass', 520 * pitch, 2450 * pitch, 1.8, 0.58, 0.015);
    // Sparkling 2-note launch chime (D5 -> A5)
    this.addTone(voice, 0.01, 0.12, 'triangle', 587.33 * pitch, 600 * pitch, 0.36, 0.004);
    this.addTone(voice, 0.075, 0.18, 'sine', 880 * pitch, 892 * pitch, 0.34, 0.004);

    return voice.finalize();
  }

  playRopeTaut(dest: AudioNode, tension: number, opts: SynthOptions = {}): VoiceHandle {
    const pitch = opts.pitchMult ?? 1;
    const intensity = clamp(tension, 0.3, 1.0);
    const voice = this.beginVoice(dest, {
      ...opts,
      volume: (opts.volume ?? 1) * (0.28 + intensity * 0.3),
      priority: 0,
    });

    // Taut hemp rope creak
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(safeFreq(680 * pitch, this.ctx.sampleRate || 44100), voice.startTime);
    filter.Q.setValueAtTime(3.6, voice.startTime);
    filter.connect(voice.out);

    this.addTone(voice, 0, 0.11, 'sawtooth', 180 * pitch, 295 * pitch, 0.36, 0.008, filter);
    this.addTone(voice, 0.045, 0.085, 'triangle', 290 * pitch, 215 * pitch, 0.28, 0.006, filter);
    this.addNoiseBurst(voice, 0, 0.095, 'crackle', 'bandpass', 1150 * pitch, 840 * pitch, 2.5, 0.32, 0.006);

    return voice.finalize();
  }

  playRopePullStart(dest: AudioNode, opts: SynthOptions = {}): VoiceHandle {
    const pitch = opts.pitchMult ?? 1;
    const voice = this.beginVoice(dest, { ...opts, volume: (opts.volume ?? 1) * 0.44, priority: 1 });

    // Three snappy ratchet clicks rising in pitch
    const freqs = [920, 1100, 1310];
    for (let i = 0; i < freqs.length; i++) {
      const offset = i * 0.042;
      this.addTone(voice, offset, 0.028, 'square', freqs[i] * pitch, freqs[i] * 0.72 * pitch, 0.24, 0.001);
      this.addNoiseBurst(voice, offset, 0.022, 'white', 'bandpass', 2400 * pitch, 1800 * pitch, 2.2, 0.28, 0.001);
    }

    return voice.finalize();
  }

  // ==========================================================================
  // Hazards, Environment & Interactive Objects
  // ==========================================================================

  playBlockShake(dest: AudioNode, opts: SynthOptions = {}): VoiceHandle {
    const pitch = opts.pitchMult ?? 1;
    const voice = this.beginVoice(dest, { ...opts, volume: (opts.volume ?? 1) * 0.42, priority: 0 });

    this.addTone(voice, 0, 0.13, 'triangle', 105 * pitch, 72 * pitch, 0.32, 0.005);
    const hits = [0, 0.036, 0.075, 0.108];
    for (let i = 0; i < hits.length; i++) {
      const f = (950 + i * 210) * pitch;
      this.addNoiseBurst(voice, hits[i], 0.034, 'crackle', 'bandpass', f, f * 0.7, 2.2, 0.42, 0.002);
    }

    return voice.finalize();
  }

  playBlockCrumble(dest: AudioNode, opts: SynthOptions = {}): VoiceHandle {
    const pitch = opts.pitchMult ?? 1;
    const voice = this.beginVoice(dest, { ...opts, volume: (opts.volume ?? 1) * 0.68, priority: 2 });

    // Heavy fracture thud
    this.addTone(voice, 0, 0.22, 'triangle', 135 * pitch, 40 * pitch, 0.64, 0.003);
    // Cascading falling stones
    const bursts = [
      { t: 0, dur: 0.14, f0: 1550, f1: 720, g: 0.56 },
      { t: 0.07, dur: 0.16, f0: 1220, f1: 520, g: 0.48 },
      { t: 0.15, dur: 0.18, f0: 960, f1: 380, g: 0.38 },
      { t: 0.23, dur: 0.16, f0: 760, f1: 310, g: 0.26 },
    ];
    for (const b of bursts) {
      this.addNoiseBurst(voice, b.t, b.dur, 'crackle', 'bandpass', b.f0 * pitch, b.f1 * pitch, 1.5, b.g, 0.004);
    }

    return voice.finalize();
  }

  playBlockRecover(dest: AudioNode, opts: SynthOptions = {}): VoiceHandle {
    const pitch = opts.pitchMult ?? 1;
    const voice = this.beginVoice(dest, { ...opts, volume: (opts.volume ?? 1) * 0.42, priority: 1 });

    // Upward pop + crisp crystalline chime
    this.addTone(voice, 0, 0.08, 'sine', 260 * pitch, 690 * pitch, 0.42, 0.004);
    this.addTone(voice, 0.055, 0.16, 'triangle', 1046.5 * pitch, 1052 * pitch, 0.34, 0.003);

    return voice.finalize();
  }

  playWindTelegraph(dest: AudioNode, dir: 1 | -1, opts: SynthOptions = {}): VoiceHandle {
    const voice = this.beginVoice(dest, {
      ...opts,
      pan: opts.pan ?? dir * 0.32,
      volume: (opts.volume ?? 1) * 0.44,
      priority: 1,
    });

    // High whistling alpine breeze
    this.addNoiseBurst(voice, 0, 0.56, 'pink', 'bandpass', 1050, 1920, 9.5, 0.55, 0.14);
    this.addNoiseBurst(voice, 0.12, 0.44, 'white', 'bandpass', 1650, 1280, 7.5, 0.22, 0.1);
    this.addTone(voice, 0.06, 0.48, 'sine', 1320, 1680, 0.1, 0.14);

    return voice.finalize();
  }

  playWindGust(dest: AudioNode, dir: 1 | -1, opts: SynthOptions = {}): VoiceHandle {
    const voice = this.beginVoice(dest, {
      ...opts,
      pan: opts.pan ?? dir * 0.28,
      volume: (opts.volume ?? 1) * 0.55,
      priority: 2,
    });

    // Punchy initial alpine gale swell
    this.addNoiseBurst(voice, 0, 0.72, 'pink', 'bandpass', 360, 1180, 1.8, 0.64, 0.12);
    this.addNoiseBurst(voice, 0.08, 0.65, 'white', 'bandpass', 1420, 760, 2.4, 0.26, 0.1);

    return voice.finalize();
  }

  /**
   * Creates a continuous looping filtered pink+white noise wind gale bed
   * controlled smoothly by wind_start / wind_stop and state.windActive.
   */
  createWindBed(dest: AudioNode): WindBedHandle {
    const now = this.ctx.currentTime;
    const sr = this.ctx.sampleRate || 44100;

    const outGain = this.ctx.createGain();
    outGain.gain.setValueAtTime(0, now);

    let panNode: StereoPannerNode | null = null;
    if (typeof this.ctx.createStereoPanner === 'function') {
      panNode = this.ctx.createStereoPanner();
      panNode.pan.setValueAtTime(0, now);
      outGain.connect(panNode);
      panNode.connect(dest);
    } else {
      outGain.connect(dest);
    }

    const pinkSrc = this.ctx.createBufferSource();
    pinkSrc.buffer = this.pinkBuffer;
    pinkSrc.loop = true;

    const whiteSrc = this.ctx.createBufferSource();
    whiteSrc.buffer = this.whiteBuffer;
    whiteSrc.loop = true;

    const pinkFilter = this.ctx.createBiquadFilter();
    pinkFilter.type = 'bandpass';
    pinkFilter.frequency.setValueAtTime(safeFreq(540, sr), now);
    pinkFilter.Q.setValueAtTime(1.4, now);

    const whiteFilter = this.ctx.createBiquadFilter();
    whiteFilter.type = 'bandpass';
    whiteFilter.frequency.setValueAtTime(safeFreq(1480, sr), now);
    whiteFilter.Q.setValueAtTime(3.2, now);

    const whiteMix = this.ctx.createGain();
    whiteMix.gain.setValueAtTime(0.28, now);

    // Subtle slow LFO modulating wind pitch/howl
    const lfo = this.ctx.createOscillator();
    const lfoDepth = this.ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.45, now);
    lfoDepth.gain.setValueAtTime(220, now);
    lfo.connect(lfoDepth);
    lfoDepth.connect(pinkFilter.frequency);
    lfoDepth.connect(whiteFilter.frequency);

    pinkSrc.connect(pinkFilter);
    pinkFilter.connect(outGain);
    whiteSrc.connect(whiteFilter);
    whiteFilter.connect(whiteMix);
    whiteMix.connect(outGain);

    pinkSrc.start(now);
    whiteSrc.start(now, 0.37);
    lfo.start(now);

    let disposed = false;

    return {
      setDirection: (dir: 1 | -1): void => {
        if (disposed || !panNode) return;
        const t = this.ctx.currentTime;
        panNode.pan.setTargetAtTime(clamp(dir * 0.25, -0.85, 0.85), t, 0.15);
      },
      setActive: (active: boolean, intensity = 1): void => {
        if (disposed) return;
        const t = this.ctx.currentTime;
        const target = active ? clamp(intensity, 0.2, 1.0) * 0.24 : 0;
        outGain.gain.setTargetAtTime(target, t, active ? 0.16 : 0.24);
      },
      dispose: (): void => {
        if (disposed) return;
        disposed = true;
        try {
          pinkSrc.stop();
          whiteSrc.stop();
          lfo.stop();
          pinkSrc.disconnect();
          whiteSrc.disconnect();
          lfo.disconnect();
          lfoDepth.disconnect();
          pinkFilter.disconnect();
          whiteFilter.disconnect();
          whiteMix.disconnect();
          outGain.disconnect();
          panNode?.disconnect();
        } catch {
          // Safe cleanup on closing context
        }
      },
    };
  }

  playFlagPlace(dest: AudioNode, opts: SynthOptions = {}): VoiceHandle {
    const voice = this.beginVoice(dest, { ...opts, volume: (opts.volume ?? 1) * 0.56, priority: 3 });

    // Pole plant click
    this.addTone(voice, 0, 0.05, 'triangle', 220, 110, 0.36, 0.002);
    // Triumphant 2-note ding (D5 -> A5 + octave bell shimmer)
    this.addTone(voice, 0.02, 0.17, 'triangle', 587.33, 587.33, 0.44, 0.004);
    this.addTone(voice, 0.02, 0.16, 'sine', 1174.66, 1174.66, 0.2, 0.004);
    this.addTone(voice, 0.125, 0.34, 'triangle', 880, 880, 0.52, 0.004);
    this.addTone(voice, 0.125, 0.36, 'sine', 1760, 1760, 0.24, 0.004);

    return voice.finalize();
  }

  playCharliePickup(dest: AudioNode, opts: SynthOptions = {}): VoiceHandle {
    const voice = this.beginVoice(dest, { ...opts, volume: (opts.volume ?? 1) * 0.58, priority: 3 });

    // Cheerful bird chirp sequence
    this.addTone(voice, 0, 0.075, 'sine', 1480, 2120, 0.36, 0.004);
    this.addTone(voice, 0.085, 0.065, 'sine', 1980, 1620, 0.3, 0.004);
    this.addTone(voice, 0.16, 0.11, 'sine', 1760, 2520, 0.4, 0.005);
    this.addTone(voice, 0.16, 0.11, 'triangle', 880, 1260, 0.16, 0.005);

    // Rhythmic soft wing-beat flaps
    for (let i = 0; i < 3; i++) {
      const t = 0.04 + i * 0.125;
      this.addNoiseBurst(voice, t, 0.095, 'pink', 'lowpass', 780, 320, 1.2, 0.44, 0.015);
    }

    return voice.finalize();
  }

  playCollectPhoto(dest: AudioNode, opts: SynthOptions = {}): VoiceHandle {
    const voice = this.beginVoice(dest, { ...opts, volume: (opts.volume ?? 1) * 0.58, priority: 3 });

    // Quick camera shutter snap
    this.addNoiseBurst(voice, 0, 0.032, 'white', 'highpass', 2800, 1900, 1.4, 0.34, 0.002);
    // Sparkling major-7th ascending arpeggio (C5-E5-G5-B5-C6)
    const notes = [523.25, 659.25, 783.99, 987.77, 1046.5];
    for (let i = 0; i < notes.length; i++) {
      const t = 0.035 + i * 0.062;
      const dur = i === notes.length - 1 ? 0.38 : 0.15;
      this.addTone(voice, t, dur, 'triangle', notes[i], notes[i], 0.36, 0.004);
      this.addTone(voice, t, dur * 0.9, 'sine', notes[i] * 2, notes[i] * 2, 0.16, 0.004);
    }

    return voice.finalize();
  }

  playCollectManual(dest: AudioNode, opts: SynthOptions = {}): VoiceHandle {
    const voice = this.beginVoice(dest, { ...opts, volume: (opts.volume ?? 1) * 0.55, priority: 3 });

    // Paper rustle
    this.addNoiseBurst(voice, 0, 0.075, 'white', 'bandpass', 2400, 3400, 1.4, 0.22, 0.008);
    // Warm scholarly arpeggio (D5-F#5-A5-D6)
    const notes = [587.33, 739.99, 880.0, 1174.66];
    for (let i = 0; i < notes.length; i++) {
      const t = 0.04 + i * 0.068;
      const dur = i === notes.length - 1 ? 0.36 : 0.16;
      this.addTone(voice, t, dur, 'triangle', notes[i], notes[i], 0.38, 0.005);
      this.addTone(voice, t, dur, 'sine', notes[i] * 1.5, notes[i] * 1.5, 0.12, 0.005);
    }

    return voice.finalize();
  }

  playRescueSeal(dest: AudioNode, opts: SynthOptions = {}): VoiceHandle {
    const voice = this.beginVoice(dest, { ...opts, volume: (opts.volume ?? 1) * 0.62, priority: 3 });

    // Playful happy seal bark-chirp
    this.addTone(voice, 0, 0.11, 'triangle', 340, 540, 0.38, 0.008);
    this.addTone(voice, 0.09, 0.09, 'sine', 520, 390, 0.28, 0.006);
    // Sparkling rescue arpeggio (F5-A5-C6-F6)
    const notes = [698.46, 880.0, 1046.5, 1396.91];
    for (let i = 0; i < notes.length; i++) {
      const t = 0.12 + i * 0.065;
      const dur = i === notes.length - 1 ? 0.42 : 0.18;
      this.addTone(voice, t, dur, 'triangle', notes[i], notes[i], 0.36, 0.004);
      this.addTone(voice, t, dur, 'sine', notes[i] * 2, notes[i] * 2, 0.14, 0.004);
    }

    return voice.finalize();
  }

  playButtonPress(dest: AudioNode, powered: boolean, opts: SynthOptions = {}): VoiceHandle {
    const pitch = opts.pitchMult ?? 1;
    const voice = this.beginVoice(dest, { ...opts, volume: (opts.volume ?? 1) * 0.5, priority: 2 });

    // Mechanical switch click
    this.addNoiseBurst(voice, 0, 0.025, 'white', 'bandpass', 2600 * pitch, 1800 * pitch, 2.0, 0.32, 0.001);
    // Crisp circuit state confirmation chirp
    if (powered) {
      this.addTone(voice, 0.01, 0.07, 'square', 620 * pitch, 620 * pitch, 0.18, 0.002);
      this.addTone(voice, 0.06, 0.11, 'triangle', 930 * pitch, 930 * pitch, 0.34, 0.003);
    } else {
      this.addTone(voice, 0.01, 0.07, 'square', 520 * pitch, 520 * pitch, 0.16, 0.002);
      this.addTone(voice, 0.06, 0.11, 'triangle', 340 * pitch, 340 * pitch, 0.3, 0.003);
    }

    return voice.finalize();
  }

  playTronchoLaunch(dest: AudioNode, opts: SynthOptions = {}): VoiceHandle {
    const pitch = opts.pitchMult ?? 1;
    const voice = this.beginVoice(dest, { ...opts, volume: (opts.volume ?? 1) * 0.66, priority: 2 });

    // Pneumatic punch + rising mechanical spring launch
    this.addTone(voice, 0, 0.12, 'sine', 165 * pitch, 54 * pitch, 0.58, 0.003);
    this.addTone(voice, 0.015, 0.21, 'sawtooth', 190 * pitch, 880 * pitch, 0.24, 0.006);
    this.addTone(voice, 0.02, 0.19, 'triangle', 280 * pitch, 1040 * pitch, 0.34, 0.006);
    this.addNoiseBurst(voice, 0.01, 0.16, 'white', 'bandpass', 1800 * pitch, 3400 * pitch, 1.8, 0.32, 0.005);

    return voice.finalize();
  }

  playLaserZap(dest: AudioNode, opts: SynthOptions = {}): VoiceHandle {
    const pitch = opts.pitchMult ?? 1;
    const voice = this.beginVoice(dest, { ...opts, volume: (opts.volume ?? 1) * 0.62, priority: 3 });

    // Arcade sci-fi laser zap + electric sizzle
    this.addTone(voice, 0, 0.21, 'sawtooth', 1880 * pitch, 155 * pitch, 0.34, 0.002);
    this.addTone(voice, 0.008, 0.19, 'square', 1340 * pitch, 118 * pitch, 0.2, 0.002);
    this.addNoiseBurst(voice, 0, 0.18, 'white', 'highpass', 3200 * pitch, 1100 * pitch, 2.5, 0.34, 0.002);

    return voice.finalize();
  }

  playBossChainBreak(dest: AudioNode, remaining: number, opts: SynthOptions = {}): VoiceHandle {
    // Pitch escalates subtly as fewer chains remain
    const escalation = 1 + clamp(3 - remaining, 0, 3) * 0.07;
    const voice = this.beginVoice(dest, { ...opts, volume: (opts.volume ?? 1) * 0.82, priority: 4 });

    // Massive bass impact
    this.addTone(voice, 0, 0.34, 'sine', 135 * escalation, 32, 0.72, 0.003);
    this.addTone(voice, 0, 0.28, 'sawtooth', 95 * escalation, 38, 0.26, 0.004);
    // Metallic chain shatter clangs
    const clangs = [440, 622, 932, 1480];
    for (let i = 0; i < clangs.length; i++) {
      this.addTone(
        voice,
        0.01 * i,
        0.26 + i * 0.04,
        i % 2 === 0 ? 'square' : 'triangle',
        clangs[i] * escalation,
        clangs[i] * escalation * 0.94,
        0.22 / (1 + i * 0.25),
        0.002
      );
    }
    // Debris burst
    this.addNoiseBurst(voice, 0, 0.32, 'crackle', 'bandpass', 2100, 620, 1.2, 0.56, 0.003);

    return voice.finalize();
  }

  playBossDefeated(dest: AudioNode, opts: SynthOptions = {}): VoiceHandle {
    const voice = this.beginVoice(dest, { ...opts, volume: (opts.volume ?? 1) * 0.74, priority: 4 });

    // Victory explosion bass
    this.addTone(voice, 0, 0.4, 'sine', 130, 34, 0.62, 0.004);
    this.addNoiseBurst(voice, 0, 0.35, 'pink', 'lowpass', 1400, 260, 1.0, 0.42, 0.005);

    // Heroic victory fanfare (C4-E4-G4-C5 | G4-C5-E5-G5-C6)
    const melody = [
      { t: 0.14, f: 523.25, d: 0.14 },
      { t: 0.26, f: 659.25, d: 0.14 },
      { t: 0.38, f: 783.99, d: 0.14 },
      { t: 0.50, f: 1046.5, d: 0.22 },
      { t: 0.72, f: 783.99, d: 0.12 },
      { t: 0.84, f: 1046.5, d: 0.56 },
    ];
    for (const n of melody) {
      this.addTone(voice, n.t, n.d, 'triangle', n.f, n.f, 0.38, 0.006);
      this.addTone(voice, n.t, n.d, 'square', n.f * 0.5, n.f * 0.5, 0.12, 0.008);
    }
    // Final sparkle harmony
    this.addTone(voice, 0.84, 0.56, 'sine', 1318.51, 1318.51, 0.2, 0.01);
    this.addTone(voice, 0.84, 0.56, 'sine', 1567.98, 1567.98, 0.18, 0.01);

    return voice.finalize();
  }

  playSummitReached(dest: AudioNode, noAssist: boolean, opts: SynthOptions = {}): VoiceHandle {
    const voice = this.beginVoice(dest, { ...opts, volume: (opts.volume ?? 1) * 0.72, priority: 4 });

    // Grand joyous alpine victory fanfare in C major
    const notes = [
      { t: 0.0, f: 523.25, d: 0.13 },
      { t: 0.12, f: 659.25, d: 0.13 },
      { t: 0.24, f: 783.99, d: 0.15 },
      { t: 0.38, f: 1046.5, d: 0.26 },
      { t: 0.62, f: 783.99, d: 0.13 },
      { t: 0.74, f: 880.0, d: 0.13 },
      { t: 0.86, f: 1046.5, d: 0.65 },
    ];
    for (const n of notes) {
      this.addTone(voice, n.t, n.d, 'triangle', n.f, n.f, 0.42, 0.005);
      this.addTone(voice, n.t, n.d * 0.9, 'sine', n.f * 2, n.f * 2, 0.14, 0.006);
    }
    // Warm bass triad support on final cadence
    this.addTone(voice, 0.38, 0.3, 'triangle', 261.63, 261.63, 0.28, 0.01);
    this.addTone(voice, 0.86, 0.65, 'triangle', 261.63, 261.63, 0.32, 0.01);
    this.addTone(voice, 0.86, 0.65, 'sine', 659.25, 659.25, 0.24, 0.01);
    this.addTone(voice, 0.86, 0.65, 'sine', 783.99, 783.99, 0.22, 0.01);

    if (noAssist) {
      // Extra golden summit sparkle for pure no-assist clear
      this.addTone(voice, 1.0, 0.45, 'sine', 1567.98, 1567.98, 0.18, 0.006);
      this.addTone(voice, 1.12, 0.45, 'sine', 2093.0, 2093.0, 0.2, 0.006);
    }

    return voice.finalize();
  }

  playTimeTrialFinish(dest: AudioNode, medal: MedalTier, opts: SynthOptions = {}): VoiceHandle {
    const voice = this.beginVoice(dest, { ...opts, volume: (opts.volume ?? 1) * 0.64, priority: 4 });
    const highTier = medal === 'gold' || medal === 'platinum';
    const notes = highTier
      ? [783.99, 987.77, 1174.66, 1567.98, 1975.53]
      : [587.33, 739.99, 880.0, 1174.66];
    for (let i = 0; i < notes.length; i++) {
      const t = i * 0.075;
      const dur = i === notes.length - 1 ? 0.42 : 0.14;
      this.addTone(voice, t, dur, 'triangle', notes[i], notes[i], 0.38, 0.004);
      this.addTone(voice, t, dur, 'sine', notes[i] * 2, notes[i] * 2, 0.14, 0.004);
    }
    return voice.finalize();
  }

  playEmote(dest: AudioNode, emote: EmoteType, opts: SynthOptions = {}): VoiceHandle | null {
    if (emote === 'none') return null;
    const pitch = opts.pitchMult ?? 1;
    const voice = this.beginVoice(dest, { ...opts, volume: (opts.volume ?? 1) * 0.48, priority: 1 });

    if (emote === 'clap') {
      // Crisp double-transient flipper clap
      this.addNoiseBurst(voice, 0, 0.038, 'white', 'bandpass', 1550 * pitch, 1200 * pitch, 1.8, 0.56, 0.001);
      this.addNoiseBurst(voice, 0.017, 0.046, 'white', 'bandpass', 1750 * pitch, 1050 * pitch, 1.5, 0.46, 0.001);
      this.addTone(voice, 0, 0.032, 'triangle', 460 * pitch, 240 * pitch, 0.22, 0.001);
    } else {
      // RPS crisp tactile wooden/pixel ticks (rock, paper, scissors distinct pitches)
      const baseHz = emote === 'rps_rock' ? 460 : emote === 'rps_paper' ? 620 : 810;
      this.addTone(voice, 0, 0.048, 'triangle', baseHz * pitch, baseHz * 1.18 * pitch, 0.42, 0.002);
      this.addNoiseBurst(voice, 0, 0.025, 'white', 'bandpass', 2200 * pitch, 1600 * pitch, 2.2, 0.26, 0.001);
    }

    return voice.finalize();
  }

  playRpsResult(dest: AudioNode, winner: 'p1' | 'p2' | 'draw', opts: SynthOptions = {}): VoiceHandle {
    const voice = this.beginVoice(dest, { ...opts, volume: (opts.volume ?? 1) * 0.48, priority: 2 });
    if (winner === 'draw') {
      this.addTone(voice, 0, 0.08, 'triangle', 440, 440, 0.34, 0.003);
      this.addTone(voice, 0.1, 0.1, 'triangle', 440, 392, 0.32, 0.003);
    } else {
      const root = winner === 'p1' ? 587.33 : 659.25;
      this.addTone(voice, 0, 0.1, 'triangle', root, root, 0.36, 0.003);
      this.addTone(voice, 0.09, 0.22, 'triangle', root * 1.5, root * 1.5, 0.42, 0.003);
    }
    return voice.finalize();
  }

  playAchievementUnlock(dest: AudioNode, opts: SynthOptions = {}): VoiceHandle {
    const voice = this.beginVoice(dest, { ...opts, volume: (opts.volume ?? 1) * 0.56, priority: 3 });
    const notes = [659.25, 830.61, 987.77, 1318.51];
    for (let i = 0; i < notes.length; i++) {
      const t = i * 0.068;
      const dur = i === notes.length - 1 ? 0.42 : 0.15;
      this.addTone(voice, t, dur, 'triangle', notes[i], notes[i], 0.36, 0.004);
      this.addTone(voice, t, dur, 'sine', notes[i] * 2, notes[i] * 2, 0.16, 0.004);
    }
    return voice.finalize();
  }

  // ==========================================================================
  // Crisp Pixel UI Blips
  // ==========================================================================

  playUiSound(dest: AudioNode, kind: UiSoundKind, opts: SynthOptions = {}): VoiceHandle {
    const voice = this.beginVoice(dest, { ...opts, pan: 0, volume: (opts.volume ?? 1) * 0.42, priority: 3 });

    switch (kind) {
      case 'move':
        this.addTone(voice, 0, 0.036, 'triangle', 740, 880, 0.36, 0.002);
        this.addTone(voice, 0, 0.022, 'square', 1480, 1480, 0.08, 0.001);
        break;
      case 'confirm':
        this.addTone(voice, 0, 0.055, 'triangle', 587.33, 587.33, 0.42, 0.002);
        this.addTone(voice, 0, 0.045, 'square', 587.33, 587.33, 0.1, 0.002);
        this.addTone(voice, 0.048, 0.11, 'triangle', 880, 880, 0.46, 0.002);
        this.addTone(voice, 0.048, 0.095, 'sine', 1760, 1760, 0.16, 0.002);
        break;
      case 'cancel':
        this.addTone(voice, 0, 0.055, 'triangle', 466.16, 440, 0.38, 0.002);
        this.addTone(voice, 0.046, 0.095, 'triangle', 311.13, 293.66, 0.38, 0.002);
        break;
      case 'toggle':
        this.addTone(voice, 0, 0.052, 'triangle', 660, 990, 0.4, 0.002);
        this.addNoiseBurst(voice, 0, 0.018, 'white', 'highpass', 3000, 2400, 1.2, 0.14, 0.001);
        break;
    }

    return voice.finalize();
  }

  // ==========================================================================
  // Exact-Time Music Sequencer Voices (Lookahead Scheduling)
  // ==========================================================================

  scheduleMusicNote(
    dest: AudioNode,
    time: number,
    freq: number,
    duration: number,
    wave: OscillatorType,
    gain: number,
    cutoffHz = 4200,
    attackSec = 0.008
  ): void {
    const sr = this.ctx.sampleRate || 44100;
    const t0 = Math.max(this.ctx.currentTime, time);
    const dur = Math.max(0.03, duration);
    const t1 = t0 + dur;

    const osc = this.ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(safeFreq(freq, sr), t0);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(safeFreq(cutoffHz, sr), t0);
    filter.Q.setValueAtTime(0.8, t0);

    const env = this.ctx.createGain();
    const atk = Math.min(attackSec, dur * 0.3);
    const peak = Math.max(0.0002, gain);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(peak, t0 + atk);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.42), t0 + dur * 0.65);
    env.gain.exponentialRampToValueAtTime(0.0001, Math.max(t0 + atk + 0.01, t1 - 0.008));
    env.gain.linearRampToValueAtTime(0, t1);

    osc.connect(filter);
    filter.connect(env);
    env.connect(dest);

    osc.start(t0);
    osc.stop(t1 + 0.01);
    osc.onended = () => {
      try {
        osc.disconnect();
        filter.disconnect();
        env.disconnect();
      } catch {
        // Ignore cleanup errors
      }
    };
  }

  scheduleMusicBass(
    dest: AudioNode,
    time: number,
    freq: number,
    duration: number,
    gain: number,
    wave: OscillatorType = 'triangle',
    cutoffHz = 680
  ): void {
    const sr = this.ctx.sampleRate || 44100;
    const t0 = Math.max(this.ctx.currentTime, time);
    const dur = Math.max(0.04, duration);
    const t1 = t0 + dur;

    const osc = this.ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(safeFreq(freq, sr), t0);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(safeFreq(cutoffHz * 1.4, sr), t0);
    filter.frequency.exponentialRampToValueAtTime(safeFreq(cutoffHz * 0.65, sr), t1);
    filter.Q.setValueAtTime(1.8, t0);

    const env = this.ctx.createGain();
    const peak = Math.max(0.0002, gain);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(peak, t0 + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, Math.max(t0 + 0.02, t1 - 0.008));
    env.gain.linearRampToValueAtTime(0, t1);

    osc.connect(filter);
    filter.connect(env);
    env.connect(dest);

    osc.start(t0);
    osc.stop(t1 + 0.01);
    osc.onended = () => {
      try {
        osc.disconnect();
        filter.disconnect();
        env.disconnect();
      } catch {
        // Ignore
      }
    };
  }

  scheduleMusicKick(dest: AudioNode, time: number, gain: number): void {
    const t0 = Math.max(this.ctx.currentTime, time);
    const t1 = t0 + 0.11;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(118, t0);
    osc.frequency.exponentialRampToValueAtTime(42, t1);

    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t1 - 0.004);
    env.gain.linearRampToValueAtTime(0, t1);

    osc.connect(env);
    env.connect(dest);
    osc.start(t0);
    osc.stop(t1 + 0.01);
    osc.onended = () => {
      try {
        osc.disconnect();
        env.disconnect();
      } catch {
        // Ignore
      }
    };
  }

  scheduleMusicHat(dest: AudioNode, time: number, gain: number, bright = true): void {
    const sr = this.ctx.sampleRate || 44100;
    const t0 = Math.max(this.ctx.currentTime, time);
    const t1 = t0 + 0.036;
    const src = this.ctx.createBufferSource();
    src.buffer = this.whiteBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(safeFreq(bright ? 5800 : 3200, sr), t0);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, t1 - 0.003);
    env.gain.linearRampToValueAtTime(0, t1);

    src.connect(filter);
    filter.connect(env);
    env.connect(dest);
    src.start(t0, Math.random() * 0.8);
    src.stop(t1 + 0.01);
    src.onended = () => {
      try {
        src.disconnect();
        filter.disconnect();
        env.disconnect();
      } catch {
        // Ignore
      }
    };
  }

  scheduleCavernPing(dest: AudioNode, time: number, freq: number, gain: number): void {
    const sr = this.ctx.sampleRate || 44100;
    const t0 = Math.max(this.ctx.currentTime, time);
    const dur = 0.28;
    const t1 = t0 + dur;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    // Subtle droplet upward shimmer
    osc.frequency.setValueAtTime(safeFreq(freq * 0.992, sr), t0);
    osc.frequency.exponentialRampToValueAtTime(safeFreq(freq, sr), t0 + 0.025);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t1 - 0.006);
    env.gain.linearRampToValueAtTime(0, t1);

    osc.connect(env);
    env.connect(dest);
    osc.start(t0);
    osc.stop(t1 + 0.01);
    osc.onended = () => {
      try {
        osc.disconnect();
        env.disconnect();
      } catch {
        // Ignore
      }
    };
  }

  schedulePadChord(
    dest: AudioNode,
    time: number,
    freqs: readonly number[],
    duration: number,
    gain: number,
    cutoffHz = 780
  ): void {
    const sr = this.ctx.sampleRate || 44100;
    const t0 = Math.max(this.ctx.currentTime, time);
    const dur = Math.max(0.25, duration);
    const t1 = t0 + dur;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(safeFreq(cutoffHz * 0.7, sr), t0);
    filter.frequency.linearRampToValueAtTime(safeFreq(cutoffHz, sr), t0 + dur * 0.5);
    filter.frequency.linearRampToValueAtTime(safeFreq(cutoffHz * 0.65, sr), t1);
    filter.Q.setValueAtTime(1.2, t0);

    const env = this.ctx.createGain();
    const peak = Math.max(0.0002, gain / Math.max(1, freqs.length));
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(peak, t0 + dur * 0.28);
    env.gain.linearRampToValueAtTime(peak * 0.75, t0 + dur * 0.72);
    env.gain.linearRampToValueAtTime(0, t1);

    filter.connect(env);
    env.connect(dest);

    let remaining = freqs.length;
    for (const f of freqs) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(safeFreq(f, sr), t0);
      osc.connect(filter);
      osc.start(t0);
      osc.stop(t1 + 0.015);
      osc.onended = () => {
        try {
          osc.disconnect();
        } catch {
          // Ignore
        }
        remaining--;
        if (remaining <= 0) {
          try {
            filter.disconnect();
            env.disconnect();
          } catch {
            // Ignore
          }
        }
      };
    }
  }
}
