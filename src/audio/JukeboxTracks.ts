// ============================================================================
// Krunked & Fred — Complete 11-Track Jukebox Composition Library
// Distinct musical compositions (BPM, key, lead, counter-harmony, bassline,
// percussion, pads, and synth timbres) for all 11 Jukebox tracks + altitude-
// reactive biome default mapping. 100% pure data (SSR-safe, zero DOM deps).
// ============================================================================

import type { BiomeId, JukeboxTrackId } from '../contracts';

export type PlayableTrackId = Exclude<JukeboxTrackId, 'Random'>;

/**
 * Compact percussion step encoding:
 * 0 = rest
 * 1 = kick
 * 2 = snare / clap
 * 3 = closed hi-hat / brushed tick
 * 4 = open hi-hat / icy shimmer cymbal
 * 5 = kick + closed hi-hat
 * 6 = snare + closed hi-hat
 * 7 = rim / woodblock / metallic cavern tick
 */
export type PercHit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type MelodyArticulation =
  | 'celesta'
  | 'chiptune'
  | 'alpine'
  | 'marimba'
  | 'arp'
  | 'icy_bell'
  | 'electric_funk'
  | 'boss_lead'
  | 'retro_16bit'
  | 'synthwave';

export interface JukeboxTrackData {
  readonly id: JukeboxTrackId;
  readonly title: string;
  readonly subtitle: string;
  readonly biome: BiomeId;
  readonly key: string;
  readonly bpm: number;
  readonly stepsPerBeat: number;
  readonly stepsPerBar: number;
  readonly stepSec: number;
  readonly length: number;
  readonly isPlaylist?: boolean;
  readonly playlistOrder?: readonly PlayableTrackId[];
  readonly leadWave: OscillatorType;
  readonly harmonyWave: OscillatorType;
  readonly bassWave: OscillatorType;
  readonly leadCutoffHz: number;
  readonly harmonyCutoffHz: number;
  readonly bassCutoffHz: number;
  readonly padCutoffHz: number;
  readonly leadGain: number;
  readonly harmonyGain: number;
  readonly bassGain: number;
  readonly padGain: number;
  readonly percGain: number;
  readonly articulation: MelodyArticulation;
  readonly echoSteps?: number;
  readonly echoGain?: number;
  /** MIDI note numbers (0 = rest) */
  readonly lead: readonly number[];
  readonly harmony: readonly number[];
  readonly bass: readonly number[];
  readonly percussion: readonly PercHit[];
  /** Optional per-bar chord pad voicings (MIDI notes) */
  readonly pads?: ReadonlyArray<readonly number[] | null>;
}

function stepSeconds(bpm: number, stepsPerBeat: number): number {
  return 60 / (bpm * stepsPerBeat);
}

export function midiToHz(midi: number, transposeSemitones = 0): number {
  return 440 * Math.pow(2, (midi + transposeSemitones - 69) / 12);
}

// ============================================================================
// Deterministic Cycling Playlist Order for 'Random' Mode
// ============================================================================

export const RANDOM_PLAYLIST_ORDER: readonly PlayableTrackId[] = [
  'Track1',
  'Bits',
  'Track2',
  'Track3',
  'Track4',
  'Track5',
  'Remix1',
  'Track6',
  'Remix2',
  'Base',
] as const;

export function getDeterministicRandomTrack(cycleIndex: number): PlayableTrackId {
  const len = RANDOM_PLAYLIST_ORDER.length;
  const idx = ((Math.floor(cycleIndex) % len) + len) % len;
  return RANDOM_PLAYLIST_ORDER[idx];
}

// ============================================================================
// Altitude-Reactive Biome -> Default Track Mapping
// Used automatically whenever jukeboxTrack === 'Base' (auto-adaptive mode).
// ============================================================================

const BIOME_DEFAULT_TRACK_MAP: Readonly<Record<BiomeId, PlayableTrackId>> = {
  village: 'Base',
  foothills: 'Track1',
  mines: 'Track2',
  crags: 'Track3',
  summit: 'Track4',
  lab: 'Track5',
  boss: 'Track6',
};

export function getBiomeDefaultTrack(biome: BiomeId): JukeboxTrackId {
  return BIOME_DEFAULT_TRACK_MAP[biome] ?? 'Base';
}

// ============================================================================
// 1. Base — Cozy Village Hub Alpine Celesta & Warm Bass Waltz (F Major, 6/8)
// 8 bars x 6 eighth-note steps = 48 steps, 112 BPM dotted-quarter/beat feel
// ============================================================================

const BASE_TRACK: JukeboxTrackData = {
  id: 'Base',
  title: 'Krunked & Fred Theme',
  subtitle: 'Cozy Village Hub alpine celesta & warm bass waltz',
  biome: 'village',
  key: 'F Major',
  bpm: 112,
  stepsPerBeat: 3,
  stepsPerBar: 6,
  stepSec: stepSeconds(112, 3),
  length: 48,
  leadWave: 'sine',
  harmonyWave: 'triangle',
  bassWave: 'triangle',
  leadCutoffHz: 4600,
  harmonyCutoffHz: 3200,
  bassCutoffHz: 580,
  padCutoffHz: 1100,
  leadGain: 0.145,
  harmonyGain: 0.068,
  bassGain: 0.155,
  padGain: 0.065,
  percGain: 0.85,
  articulation: 'celesta',
  echoSteps: 3,
  echoGain: 0.22,
  lead: [
    // Bar 1 (F)             // Bar 2 (C/E)
    77, 0, 81, 84, 0, 81,    79, 0, 76, 72, 0, 76,
    // Bar 3 (Dm)            // Bar 4 (Bb -> C7)
    74, 0, 77, 81, 0, 77,    74, 77, 79, 76, 0, 0,
    // Bar 5 (F)             // Bar 6 (Bb)
    77, 0, 81, 84, 86, 84,   82, 0, 79, 74, 0, 77,
    // Bar 7 (C7)            // Bar 8 (F resolve)
    79, 81, 79, 76, 72, 76,  77, 0, 81, 77, 0, 0,
  ],
  harmony: [
    // Gentle celesta counter-thirds & village music-box chimes
    69, 0, 72, 77, 0, 72,    72, 0, 67, 64, 0, 67,
    65, 0, 69, 74, 0, 69,    65, 0, 70, 67, 0, 72,
    69, 0, 72, 77, 0, 77,    70, 0, 74, 69, 0, 70,
    72, 0, 70, 67, 64, 67,   69, 0, 72, 69, 0, 0,
  ],
  bass: [
    // Warm hearthside alpine OOM-pa-pa
    53, 0, 60, 57, 0, 60,    48, 0, 55, 52, 0, 55,
    50, 0, 57, 53, 0, 57,    46, 0, 53, 48, 0, 55,
    53, 0, 60, 57, 0, 60,    46, 0, 53, 50, 0, 53,
    48, 0, 55, 52, 0, 55,    53, 0, 60, 53, 0, 0,
  ],
  percussion: [
    1, 0, 3, 7, 0, 3,   1, 0, 3, 7, 0, 3,
    1, 0, 3, 7, 0, 3,   1, 0, 3, 2, 0, 3,
    1, 0, 3, 7, 0, 3,   1, 0, 3, 7, 0, 3,
    1, 0, 3, 7, 0, 3,   1, 0, 3, 1, 0, 4,
  ],
  pads: [
    [53, 57, 60],
    [52, 55, 60],
    [50, 53, 57],
    [46, 53, 58],
    [53, 57, 60],
    [46, 50, 53],
    [48, 52, 58],
    [53, 57, 60],
  ],
};

// ============================================================================
// 2. Bits — Crisp 8-Bit Chiptune Pulse/Triangle Climbing Anthem (C Major, 4/4)
// 4 bars x 16 sixteenth-note steps = 64 steps, 128 BPM
// ============================================================================

const BITS_TRACK: JukeboxTrackData = {
  id: 'Bits',
  title: '8-Bit Snowflakes',
  subtitle: 'Crisp 8-bit chiptune pulse/triangle climbing anthem',
  biome: 'foothills',
  key: 'C Major',
  bpm: 128,
  stepsPerBeat: 4,
  stepsPerBar: 16,
  stepSec: stepSeconds(128, 4),
  length: 64,
  leadWave: 'square',
  harmonyWave: 'square',
  bassWave: 'triangle',
  leadCutoffHz: 3200,
  harmonyCutoffHz: 2600,
  bassCutoffHz: 900,
  padCutoffHz: 1400,
  leadGain: 0.088,
  harmonyGain: 0.052,
  bassGain: 0.175,
  padGain: 0.0,
  percGain: 0.95,
  articulation: 'chiptune',
  lead: [
    // Bar 1 (C -> G): heroic 8-bit opening leap
    72, 0, 76, 0, 79, 0, 84, 0,  83, 0, 79, 76, 74, 0, 0, 0,
    // Bar 2 (Am -> F): energetic climb
    76, 0, 79, 0, 81, 0, 84, 83, 81, 0, 77, 0, 72, 0, 76, 0,
    // Bar 3 (C -> G): triumphant summit push
    79, 0, 84, 0, 86, 0, 88, 0,  86, 84, 83, 0, 79, 0, 74, 0,
    // Bar 4 (F -> G -> C): crisp arcade cadence
    77, 0, 81, 0, 79, 0, 83, 0,  84, 0, 88, 0, 84, 0, 0, 0,
  ],
  harmony: [
    // Classic NES 16th-note chord arpeggios
    60, 64, 67, 64, 60, 64, 67, 64,  59, 62, 67, 62, 59, 62, 67, 62,
    57, 60, 64, 60, 57, 60, 64, 60,  53, 57, 60, 57, 53, 57, 60, 57,
    60, 64, 67, 72, 67, 64, 60, 64,  59, 62, 67, 71, 67, 62, 59, 62,
    53, 57, 60, 65, 55, 59, 62, 67,  60, 64, 67, 72, 76, 0, 72, 0,
  ],
  bass: [
    // Pumping NES triangle bassline
    48, 0, 48, 55, 48, 0, 52, 55,  43, 0, 43, 50, 43, 0, 47, 50,
    45, 0, 45, 52, 45, 0, 48, 52,  41, 0, 41, 48, 41, 0, 45, 48,
    48, 0, 48, 55, 52, 0, 55, 60,  43, 0, 43, 50, 47, 0, 50, 55,
    41, 0, 45, 48, 43, 0, 47, 50,  48, 0, 55, 0, 48, 0, 0, 0,
  ],
  percussion: [
    5, 0, 3, 0, 6, 0, 3, 3,  5, 0, 3, 1, 6, 0, 3, 0,
    5, 0, 3, 0, 6, 0, 3, 3,  5, 0, 3, 1, 6, 0, 4, 0,
    5, 0, 3, 0, 6, 0, 3, 3,  5, 0, 3, 1, 6, 0, 3, 3,
    5, 0, 3, 1, 6, 0, 3, 2,  5, 0, 6, 0, 1, 0, 4, 0,
  ],
};

// ============================================================================
// 3. Track1 — Snowy Foothills Buoyant Alpine Adventure Theme (G Major, 6/8)
// 8 bars x 6 eighth-note steps = 48 steps, 122 BPM
// ============================================================================

const TRACK1_FOOTHILLS: JukeboxTrackData = {
  id: 'Track1',
  title: 'Pine Ledge Waltz',
  subtitle: 'Snowy Foothills buoyant alpine adventure theme',
  biome: 'foothills',
  key: 'G Major',
  bpm: 122,
  stepsPerBeat: 3,
  stepsPerBar: 6,
  stepSec: stepSeconds(122, 3),
  length: 48,
  leadWave: 'triangle',
  harmonyWave: 'sine',
  bassWave: 'triangle',
  leadCutoffHz: 4200,
  harmonyCutoffHz: 5400,
  bassCutoffHz: 700,
  padCutoffHz: 1400,
  leadGain: 0.155,
  harmonyGain: 0.068,
  bassGain: 0.155,
  padGain: 0.055,
  percGain: 0.9,
  articulation: 'alpine',
  lead: [
    // Bar 1 (G)             // Bar 2 (D)
    79, 0, 83, 86, 0, 83,    81, 0, 78, 74, 0, 78,
    // Bar 3 (Em)            // Bar 4 (C -> D)
    76, 0, 79, 83, 0, 79,    76, 79, 81, 78, 0, 0,
    // Bar 5 (G)             // Bar 6 (C)
    79, 81, 83, 86, 88, 86,  84, 0, 79, 76, 0, 79,
    // Bar 7 (Am -> D7)      // Bar 8 (G joyful resolve)
    81, 83, 81, 78, 74, 78,  79, 0, 83, 86, 0, 0,
  ],
  harmony: [
    // Sparkling alpine glockenspiel counter-melody
    91, 0, 0, 86, 0, 83,     90, 0, 0, 86, 0, 0,
    88, 0, 0, 83, 0, 79,     84, 0, 88, 86, 0, 0,
    91, 0, 88, 86, 0, 83,    88, 0, 0, 84, 0, 79,
    88, 0, 84, 86, 0, 81,    91, 0, 86, 91, 0, 0,
  ],
  bass: [
    // Buoyant walking-fifth alpine hike bass
    55, 0, 62, 59, 0, 62,    50, 0, 57, 54, 0, 57,
    52, 0, 59, 55, 0, 59,    48, 0, 55, 50, 0, 57,
    55, 0, 62, 59, 0, 62,    48, 0, 55, 52, 0, 55,
    45, 0, 52, 50, 0, 57,    55, 0, 62, 55, 0, 0,
  ],
  percussion: [
    5, 0, 3, 2, 0, 3,   5, 0, 3, 2, 0, 3,
    5, 0, 3, 2, 0, 3,   5, 0, 3, 6, 0, 3,
    5, 0, 3, 2, 0, 3,   5, 0, 3, 2, 0, 3,
    5, 0, 3, 6, 0, 7,   5, 0, 3, 1, 0, 4,
  ],
  pads: [
    [55, 59, 62],
    [50, 54, 57],
    [52, 55, 59],
    [48, 52, 57],
    [55, 59, 62],
    [48, 52, 55],
    [50, 54, 60],
    [55, 59, 62],
  ],
};

// ============================================================================
// 4. Track2 — Dark Mines Atmospheric Echoing Marimba & Subterranean Bass
// D Dorian, 4 bars x 16 sixteenth-note steps = 64 steps, 96 BPM
// ============================================================================

const TRACK2_MINES: JukeboxTrackData = {
  id: 'Track2',
  title: 'Lanterns in the Shaft',
  subtitle: 'Dark Mines atmospheric echoing marimba & subterranean bass',
  biome: 'mines',
  key: 'D Dorian',
  bpm: 96,
  stepsPerBeat: 4,
  stepsPerBar: 16,
  stepSec: stepSeconds(96, 4),
  length: 64,
  leadWave: 'sine',
  harmonyWave: 'triangle',
  bassWave: 'sawtooth',
  leadCutoffHz: 2800,
  harmonyCutoffHz: 1850,
  bassCutoffHz: 440,
  padCutoffHz: 620,
  leadGain: 0.13,
  harmonyGain: 0.072,
  bassGain: 0.165,
  padGain: 0.105,
  percGain: 0.82,
  articulation: 'marimba',
  echoSteps: 3,
  echoGain: 0.44,
  lead: [
    // Bar 1 (Dm9): echoing cavern marimba droplets
    62, 0, 0, 69, 0, 0, 65, 0,   0, 0, 64, 0, 69, 0, 0, 0,
    // Bar 2 (G13/D): mysterious Dorian raised 6th (B = 71)
    62, 0, 65, 0, 71, 0, 0, 69,  0, 0, 67, 0, 64, 0, 0, 0,
    // Bar 3 (Bbmaj7 -> C): lantern glow ascent
    70, 0, 0, 69, 0, 65, 0, 0,   67, 0, 0, 72, 0, 69, 0, 0,
    // Bar 4 (Am7 -> Dm): hollow shaft cadence
    64, 0, 67, 0, 69, 0, 65, 0,  62, 0, 0, 69, 0, 62, 0, 0,
  ],
  harmony: [
    // Soft low woody marimba ostinato & cavern reflections
    0, 0, 57, 0, 0, 60, 0, 0,    57, 0, 0, 0, 0, 0, 53, 0,
    0, 0, 59, 0, 0, 62, 0, 0,    59, 0, 0, 0, 57, 0, 0, 0,
    0, 0, 58, 0, 0, 62, 0, 0,    60, 0, 0, 64, 0, 0, 60, 0,
    0, 0, 57, 0, 0, 60, 0, 0,    57, 0, 0, 0, 50, 0, 0, 0,
  ],
  bass: [
    // Deep hypnotic subterranean pulse bass
    38, 0, 0, 38, 0, 0, 45, 0,   38, 0, 0, 41, 43, 0, 40, 0,
    38, 0, 0, 38, 0, 0, 47, 0,   43, 0, 0, 45, 43, 0, 40, 0,
    34, 0, 0, 34, 0, 0, 41, 0,   36, 0, 0, 36, 43, 0, 40, 0,
    33, 0, 0, 36, 40, 0, 43, 0,  38, 0, 0, 45, 38, 0, 0, 0,
  ],
  percussion: [
    1, 0, 0, 7, 0, 0, 3, 0,   1, 0, 0, 0, 7, 0, 3, 0,
    1, 0, 0, 7, 0, 0, 3, 0,   1, 0, 7, 0, 3, 0, 0, 7,
    1, 0, 0, 7, 0, 0, 3, 0,   1, 0, 0, 7, 2, 0, 3, 0,
    1, 0, 0, 7, 0, 3, 0, 7,   1, 0, 0, 0, 7, 0, 0, 0,
  ],
  pads: [
    [50, 57, 64],
    [50, 59, 65],
    [46, 53, 60],
    [45, 52, 57],
  ],
};

// ============================================================================
// 5. Track3 — Windy Crags Urgent Windswept Arpeggio & Driving Snare (A Minor)
// 4 bars x 16 sixteenth-note steps = 64 steps, 132 BPM
// ============================================================================

const TRACK3_CRAGS: JukeboxTrackData = {
  id: 'Track3',
  title: 'Pendulum Ridge',
  subtitle: 'Windy Crags urgent windswept arpeggio & driving snare',
  biome: 'crags',
  key: 'A Minor',
  bpm: 132,
  stepsPerBeat: 4,
  stepsPerBar: 16,
  stepSec: stepSeconds(132, 4),
  length: 64,
  leadWave: 'triangle',
  harmonyWave: 'sawtooth',
  bassWave: 'sawtooth',
  leadCutoffHz: 3900,
  harmonyCutoffHz: 2500,
  bassCutoffHz: 680,
  padCutoffHz: 1150,
  leadGain: 0.145,
  harmonyGain: 0.062,
  bassGain: 0.145,
  padGain: 0.06,
  percGain: 1.05,
  articulation: 'arp',
  echoSteps: 2,
  echoGain: 0.28,
  lead: [
    // Bar 1 (Am): urgent soaring cliff melody
    81, 0, 0, 79, 76, 0, 79, 0,  81, 0, 84, 0, 83, 0, 79, 0,
    // Bar 2 (F -> G): gusts rising across the chasm
    77, 0, 0, 76, 72, 0, 76, 0,  79, 0, 83, 0, 86, 0, 83, 0,
    // Bar 3 (Am -> F): heroic pendulum swing arc
    88, 0, 86, 84, 81, 0, 84, 0, 81, 0, 77, 0, 76, 0, 72, 0,
    // Bar 4 (Dm -> E7): urgent dramatic turnaround
    74, 0, 77, 0, 81, 0, 77, 0,  76, 0, 80, 0, 83, 0, 80, 0,
  ],
  harmony: [
    // Relentless 16th-note windswept arpeggios
    57, 64, 69, 72, 69, 64, 57, 64,  60, 64, 69, 76, 72, 69, 64, 60,
    53, 60, 65, 69, 65, 60, 53, 60,  55, 62, 67, 71, 67, 62, 55, 62,
    57, 64, 69, 72, 76, 72, 69, 64,  53, 60, 65, 69, 72, 69, 65, 60,
    50, 57, 62, 65, 62, 57, 50, 57,  52, 56, 59, 64, 68, 64, 59, 56,
  ],
  bass: [
    // Driving octave gale bass
    45, 45, 57, 45, 45, 0, 57, 45,   45, 45, 57, 45, 43, 0, 55, 43,
    41, 41, 53, 41, 41, 0, 53, 41,   43, 43, 55, 43, 43, 0, 55, 43,
    45, 45, 57, 45, 48, 0, 57, 45,   41, 41, 53, 41, 45, 0, 53, 41,
    38, 38, 50, 38, 38, 0, 50, 38,   40, 40, 52, 40, 44, 0, 52, 40,
  ],
  percussion: [
    // Driving windswept snare with crisp syncopated ghost hits
    5, 3, 3, 2, 6, 3, 5, 3,   5, 3, 2, 3, 6, 3, 4, 2,
    5, 3, 3, 2, 6, 3, 5, 3,   5, 3, 2, 3, 6, 3, 4, 3,
    5, 3, 3, 2, 6, 3, 5, 3,   5, 3, 2, 3, 6, 3, 4, 2,
    5, 3, 3, 2, 6, 3, 5, 2,   5, 2, 6, 2, 6, 2, 4, 2,
  ],
  pads: [
    [57, 60, 64],
    [53, 57, 62],
    [57, 60, 69],
    [52, 56, 59],
  ],
};

// ============================================================================
// 6. Track4 — Frozen Summit Crystalline Icy Bells & Heroic Peak Progression
// E Major, 4 bars x 16 sixteenth-note steps = 64 steps, 124 BPM
// ============================================================================

const TRACK4_SUMMIT: JukeboxTrackData = {
  id: 'Track4',
  title: 'Crystal Glacier',
  subtitle: 'Frozen Summit crystalline icy bells & heroic peak progression',
  biome: 'summit',
  key: 'E Major',
  bpm: 124,
  stepsPerBeat: 4,
  stepsPerBar: 16,
  stepSec: stepSeconds(124, 4),
  length: 64,
  leadWave: 'sine',
  harmonyWave: 'triangle',
  bassWave: 'triangle',
  leadCutoffHz: 6200,
  harmonyCutoffHz: 3800,
  bassCutoffHz: 640,
  padCutoffHz: 1550,
  leadGain: 0.13,
  harmonyGain: 0.088,
  bassGain: 0.155,
  padGain: 0.09,
  percGain: 0.88,
  articulation: 'icy_bell',
  echoSteps: 4,
  echoGain: 0.34,
  lead: [
    // Bar 1 (E -> B/D#): crystalline high icy bells
    88, 0, 0, 83, 88, 0, 91, 0,  95, 0, 0, 91, 88, 0, 83, 0,
    // Bar 2 (C#m7 -> A2): shimmering glacial descent & lift
    85, 0, 0, 83, 80, 0, 83, 0,  81, 0, 0, 85, 88, 0, 83, 0,
    // Bar 3 (E -> B): heroic peak climb above the clouds
    88, 0, 91, 0, 95, 0, 97, 0,  95, 0, 91, 0, 88, 0, 83, 0,
    // Bar 4 (A -> Bsus4 -> B): radiant summit resolution
    81, 0, 85, 0, 88, 0, 91, 0,  95, 0, 0, 93, 91, 0, 0, 0,
  ],
  harmony: [
    // Heroic warm horn/triangle peak counter-progression
    76, 0, 0, 0, 76, 0, 79, 0,   78, 0, 0, 0, 75, 0, 71, 0,
    73, 0, 0, 0, 76, 0, 73, 0,   69, 0, 0, 0, 73, 0, 76, 0,
    76, 0, 79, 0, 83, 0, 80, 0,  78, 0, 75, 0, 71, 0, 75, 0,
    69, 0, 73, 0, 76, 0, 73, 0,  76, 0, 78, 0, 75, 0, 71, 0,
  ],
  bass: [
    // Noble glacier progression bass (E - D# - C# - A - E - B - A - B)
    40, 0, 0, 47, 52, 0, 47, 0,  39, 0, 0, 47, 51, 0, 47, 0,
    37, 0, 0, 44, 49, 0, 44, 0,  33, 0, 0, 40, 45, 0, 40, 0,
    40, 0, 0, 47, 52, 0, 47, 0,  35, 0, 0, 42, 47, 0, 42, 0,
    33, 0, 0, 40, 45, 0, 40, 0,  35, 0, 42, 0, 47, 0, 35, 0,
  ],
  percussion: [
    5, 0, 4, 0, 2, 0, 3, 0,   5, 0, 3, 0, 2, 0, 4, 0,
    5, 0, 3, 0, 2, 0, 3, 7,   5, 0, 3, 0, 2, 0, 4, 0,
    5, 0, 4, 0, 6, 0, 3, 0,   5, 0, 3, 1, 6, 0, 4, 0,
    5, 0, 3, 0, 6, 0, 3, 7,   5, 0, 6, 0, 1, 0, 4, 0,
  ],
  pads: [
    [64, 68, 71, 75],
    [61, 64, 68, 69],
    [64, 68, 71, 78],
    [57, 64, 68, 71],
  ],
};

// ============================================================================
// 7. Track5 — Laboratory DLC Funky High-Voltage Electric Synth & Slap Bass
// E Minor Funk, 4 bars x 16 sixteenth-note steps = 64 steps, 136 BPM
// ============================================================================

const TRACK5_LAB: JukeboxTrackData = {
  id: 'Track5',
  title: 'Circuit Breaker',
  subtitle: 'Laboratory DLC funky high-voltage electric synth & slap bass',
  biome: 'lab',
  key: 'E Minor Funk',
  bpm: 136,
  stepsPerBeat: 4,
  stepsPerBar: 16,
  stepSec: stepSeconds(136, 4),
  length: 64,
  leadWave: 'sawtooth',
  harmonyWave: 'square',
  bassWave: 'sawtooth',
  leadCutoffHz: 3600,
  harmonyCutoffHz: 2400,
  bassCutoffHz: 1150,
  padCutoffHz: 1200,
  leadGain: 0.115,
  harmonyGain: 0.058,
  bassGain: 0.165,
  padGain: 0.045,
  percGain: 1.02,
  articulation: 'electric_funk',
  lead: [
    // Bar 1 (Em7): funky high-voltage syncopated electric riff
    76, 0, 79, 0, 0, 81, 82, 81,  79, 0, 76, 0, 74, 0, 76, 0,
    // Bar 2 (A9): electrified blues-funk climb
    0, 76, 79, 0, 81, 0, 85, 0,   83, 81, 79, 0, 76, 0, 0, 0,
    // Bar 3 (Cmaj7 -> D9): bouncy Troncho piston synth lead
    84, 0, 83, 0, 79, 0, 83, 0,   86, 0, 81, 0, 79, 81, 83, 0,
    // Bar 4 (B7#9): sharp chromatic circuit break
    78, 0, 81, 0, 83, 0, 86, 0,   87, 0, 83, 79, 76, 0, 0, 0,
  ],
  harmony: [
    // Funky clavinet off-beat stabs
    0, 0, 64, 0, 0, 0, 67, 0,    0, 0, 62, 0, 0, 64, 0, 0,
    0, 0, 67, 0, 0, 0, 69, 0,    0, 0, 67, 0, 0, 64, 0, 0,
    0, 0, 67, 0, 0, 0, 71, 0,    0, 0, 69, 0, 0, 66, 0, 0,
    0, 0, 66, 0, 0, 69, 0, 71,   0, 0, 69, 0, 64, 0, 0, 0,
  ],
  bass: [
    // Slap bass: thumb low E (40) + popped octaves/sevenths (52, 50, 55, 57)
    40, 0, 52, 40, 0, 50, 40, 52,  40, 0, 55, 40, 57, 0, 55, 50,
    45, 0, 57, 45, 0, 55, 45, 57,  45, 0, 52, 45, 50, 0, 47, 45,
    36, 0, 48, 36, 0, 48, 38, 50,  38, 0, 50, 38, 52, 0, 50, 45,
    35, 0, 47, 35, 47, 0, 50, 47,  35, 47, 51, 0, 40, 0, 52, 0,
  ],
  percussion: [
    // Tight electro-funk pocket
    5, 3, 3, 1, 6, 3, 3, 7,   5, 3, 1, 3, 6, 3, 4, 3,
    5, 3, 3, 1, 6, 3, 7, 3,   5, 3, 1, 3, 6, 3, 4, 7,
    5, 3, 3, 1, 6, 3, 3, 7,   5, 3, 1, 3, 6, 3, 4, 3,
    5, 3, 7, 1, 6, 3, 1, 2,   5, 2, 6, 7, 1, 0, 4, 0,
  ],
  pads: [
    [52, 55, 59, 62],
    [57, 61, 64, 67],
    [48, 55, 59, 62],
    [47, 51, 57, 62],
  ],
};

// ============================================================================
// 8. Track6 — Bachicha Boss Battle Intense 150 BPM Syncopated Boss Theme!
// F# Minor / Phrygian bite, 4 bars x 16 sixteenth-note steps = 64 steps, 150 BPM
// ============================================================================

const TRACK6_BOSS: JukeboxTrackData = {
  id: 'Track6',
  title: 'Bachicha Overdrive',
  subtitle: 'Bachicha Boss Battle intense 150 BPM syncopated boss theme!',
  biome: 'boss',
  key: 'F# Minor',
  bpm: 150,
  stepsPerBeat: 4,
  stepsPerBar: 16,
  stepSec: stepSeconds(150, 4),
  length: 64,
  leadWave: 'sawtooth',
  harmonyWave: 'square',
  bassWave: 'sawtooth',
  leadCutoffHz: 4600,
  harmonyCutoffHz: 3000,
  bassCutoffHz: 1100,
  padCutoffHz: 1400,
  leadGain: 0.125,
  harmonyGain: 0.068,
  bassGain: 0.165,
  padGain: 0.055,
  percGain: 1.12,
  articulation: 'boss_lead',
  lead: [
    // Bar 1 (F#m): fierce syncopated alarm riff
    78, 0, 78, 81, 0, 85, 84, 81,  78, 0, 79, 78, 76, 0, 78, 0,
    // Bar 2 (D -> C#7): mechanical laser sweep tension
    86, 0, 85, 81, 0, 83, 81, 78,  80, 0, 85, 0, 84, 80, 77, 0,
    // Bar 3 (F#m -> Bm): heroic counter-attack climb
    78, 0, 81, 0, 85, 0, 90, 0,    88, 86, 85, 83, 81, 0, 78, 0,
    // Bar 4 (G Phrygian -> C#7b9): ferocious turnaround!
    79, 0, 83, 86, 85, 0, 80, 77,  80, 85, 89, 85, 90, 0, 0, 0,
  ],
  harmony: [
    // Driving syncopated square power-fifth stabs
    66, 0, 0, 69, 0, 0, 73, 0,    66, 0, 67, 0, 64, 0, 66, 0,
    62, 0, 0, 66, 0, 0, 69, 0,    61, 0, 65, 0, 68, 0, 73, 0,
    66, 0, 69, 0, 73, 0, 78, 0,   71, 0, 74, 0, 71, 0, 69, 0,
    67, 0, 71, 0, 68, 0, 65, 0,   61, 65, 68, 73, 78, 0, 73, 0,
  ],
  bass: [
    // Galloping 150 BPM 16th-note boss bassline
    42, 42, 54, 42, 42, 42, 54, 42,  42, 42, 43, 42, 40, 40, 42, 0,
    38, 38, 50, 38, 38, 38, 50, 38,  37, 37, 49, 37, 41, 41, 49, 37,
    42, 42, 54, 42, 45, 45, 57, 45,  47, 47, 59, 47, 45, 45, 42, 40,
    43, 43, 55, 43, 37, 37, 49, 37,  37, 41, 44, 49, 42, 42, 54, 0,
  ],
  percussion: [
    // Aggressive syncopated boss drums (double-kicks + cracking snares)
    5, 1, 3, 5, 6, 3, 5, 2,   5, 1, 6, 1, 5, 2, 4, 2,
    5, 1, 3, 5, 6, 3, 5, 2,   5, 1, 6, 1, 6, 2, 4, 2,
    5, 1, 3, 5, 6, 3, 5, 2,   5, 1, 6, 3, 5, 2, 4, 1,
    5, 1, 6, 1, 5, 2, 6, 2,   5, 2, 6, 2, 5, 1, 4, 2,
  ],
  pads: [
    [54, 57, 61],
    [50, 54, 61],
    [54, 59, 66],
    [55, 61, 65],
  ],
};

// ============================================================================
// 9. Remix1 — Turbo 16-Bit Mountain Medley Remix (G Major, 4/4, 144 BPM)
// 4 bars x 16 sixteenth-note steps = 64 steps
// ============================================================================

const REMIX1_TRACK: JukeboxTrackData = {
  id: 'Remix1',
  title: 'Foothills Sprint Remix',
  subtitle: 'Turbo 16-bit mountain medley remix',
  biome: 'foothills',
  key: 'G Major',
  bpm: 144,
  stepsPerBeat: 4,
  stepsPerBar: 16,
  stepSec: stepSeconds(144, 4),
  length: 64,
  leadWave: 'square',
  harmonyWave: 'triangle',
  bassWave: 'sawtooth',
  leadCutoffHz: 4200,
  harmonyCutoffHz: 3400,
  bassCutoffHz: 960,
  padCutoffHz: 1500,
  leadGain: 0.095,
  harmonyGain: 0.085,
  bassGain: 0.15,
  padGain: 0.04,
  percGain: 1.05,
  articulation: 'retro_16bit',
  lead: [
    // Bar 1 (G -> D): turbo remix of Foothills alpine leap
    79, 0, 83, 86, 0, 83, 86, 91,  90, 0, 86, 81, 0, 78, 81, 0,
    // Bar 2 (Em -> C): rapid 16-bit mountain sprint run
    83, 0, 79, 83, 86, 0, 83, 79,  84, 83, 81, 79, 76, 0, 79, 0,
    // Bar 3 (G -> Bm -> C): soaring time-trial chorus
    79, 81, 83, 86, 88, 0, 91, 0,  90, 0, 86, 0, 84, 0, 88, 0,
    // Bar 4 (D7 -> G): blazing arcade finish line!
    86, 84, 83, 81, 78, 81, 86, 0, 91, 0, 86, 0, 91, 0, 0, 0,
  ],
  harmony: [
    // Sparkling 16-bit harmonic thirds & cascade arps
    67, 71, 74, 71, 67, 71, 74, 79,  66, 69, 74, 69, 66, 69, 74, 69,
    64, 67, 71, 67, 64, 67, 71, 67,  60, 64, 67, 72, 67, 64, 60, 64,
    67, 71, 74, 79, 74, 71, 67, 71,  66, 71, 74, 78, 60, 64, 67, 72,
    62, 66, 69, 74, 78, 74, 69, 66,  67, 71, 74, 79, 83, 0, 79, 0,
  ],
  bass: [
    // Pumping turbo octave synth-bass
    43, 55, 43, 55, 43, 55, 47, 55,  38, 50, 38, 50, 42, 54, 38, 50,
    40, 52, 40, 52, 43, 55, 40, 52,  36, 48, 36, 48, 40, 52, 36, 48,
    43, 55, 43, 55, 47, 59, 43, 55,  47, 59, 47, 59, 48, 60, 48, 60,
    50, 62, 45, 57, 38, 50, 42, 54,  43, 55, 47, 59, 43, 0, 55, 0,
  ],
  percussion: [
    5, 3, 5, 3, 6, 3, 5, 3,   5, 3, 1, 3, 6, 3, 4, 3,
    5, 3, 5, 3, 6, 3, 5, 3,   5, 3, 1, 3, 6, 3, 4, 2,
    5, 3, 5, 3, 6, 3, 5, 3,   5, 3, 1, 3, 6, 3, 4, 3,
    5, 3, 6, 3, 5, 2, 6, 2,   5, 1, 6, 1, 5, 0, 4, 0,
  ],
  pads: [
    [55, 59, 62],
    [52, 55, 60],
    [55, 62, 67],
    [50, 54, 60],
  ],
};

// ============================================================================
// 10. Remix2 — Dreamy Nocturnal Synthwave Summit Remix (D Minor, 4/4, 116 BPM)
// 4 bars x 16 sixteenth-note steps = 64 steps
// ============================================================================

const REMIX2_TRACK: JukeboxTrackData = {
  id: 'Remix2',
  title: 'Deep Drafts Remix',
  subtitle: 'Dreamy nocturnal synthwave summit remix',
  biome: 'summit',
  key: 'D Minor',
  bpm: 116,
  stepsPerBeat: 4,
  stepsPerBar: 16,
  stepSec: stepSeconds(116, 4),
  length: 64,
  leadWave: 'sawtooth',
  harmonyWave: 'triangle',
  bassWave: 'sawtooth',
  leadCutoffHz: 2450,
  harmonyCutoffHz: 3200,
  bassCutoffHz: 560,
  padCutoffHz: 960,
  leadGain: 0.11,
  harmonyGain: 0.064,
  bassGain: 0.16,
  padGain: 0.11,
  percGain: 0.92,
  articulation: 'synthwave',
  echoSteps: 3,
  echoGain: 0.42,
  lead: [
    // Bar 1 (Dm9): warm nostalgic midnight synthwave melody
    74, 0, 0, 0, 77, 0, 81, 0,   79, 0, 0, 77, 76, 0, 0, 0,
    // Bar 2 (Bbmaj7): starry summit glow
    74, 0, 0, 72, 70, 0, 74, 0,  77, 0, 0, 74, 72, 0, 0, 0,
    // Bar 3 (Fmaj7): wide alpine horizon swell
    81, 0, 0, 0, 84, 0, 81, 0,   79, 0, 77, 0, 76, 0, 72, 0,
    // Bar 4 (Csus4 -> C -> Am): dreamy resolving drift
    74, 0, 0, 76, 77, 0, 79, 0,  76, 0, 0, 72, 74, 0, 0, 0,
  ],
  harmony: [
    // Shimmering nocturnal 16th-note starry arpeggio
    62, 65, 69, 72, 69, 65, 62, 69,  65, 69, 72, 76, 72, 69, 65, 62,
    58, 62, 65, 69, 65, 62, 58, 65,  62, 65, 69, 74, 69, 65, 62, 58,
    53, 57, 60, 64, 60, 57, 53, 60,  57, 60, 64, 69, 64, 60, 57, 53,
    55, 60, 65, 67, 65, 60, 55, 60,  52, 55, 60, 64, 60, 55, 52, 57,
  ],
  bass: [
    // Classic rolling 8th-note outrun/synthwave bassline
    38, 0, 38, 0, 38, 0, 38, 0,  38, 0, 38, 0, 41, 0, 40, 0,
    34, 0, 34, 0, 34, 0, 34, 0,  34, 0, 34, 0, 36, 0, 38, 0,
    41, 0, 41, 0, 41, 0, 41, 0,  41, 0, 41, 0, 40, 0, 38, 0,
    36, 0, 36, 0, 36, 0, 36, 0,  33, 0, 33, 0, 36, 0, 38, 0,
  ],
  percussion: [
    // Retro punchy gated-style synthwave groove
    5, 0, 3, 0, 6, 0, 3, 0,   5, 0, 3, 1, 6, 0, 4, 0,
    5, 0, 3, 0, 6, 0, 3, 0,   5, 0, 3, 1, 6, 0, 4, 0,
    5, 0, 3, 0, 6, 0, 3, 0,   5, 0, 3, 1, 6, 0, 4, 0,
    5, 0, 3, 0, 6, 0, 3, 2,   5, 0, 3, 1, 6, 2, 4, 0,
  ],
  pads: [
    [50, 57, 60, 64],
    [46, 53, 57, 62],
    [48, 53, 57, 64],
    [48, 55, 60, 62],
  ],
};

// ============================================================================
// 11. Random — Deterministic Cycling Playlist Across All 10 Playable Tracks
// ============================================================================

const RANDOM_TRACK: JukeboxTrackData = {
  ...TRACK1_FOOTHILLS,
  id: 'Random',
  title: 'Shuffle All Tracks',
  subtitle: 'Deterministic cycling playlist across all mountain & lab tracks',
  biome: 'village',
  key: 'Multi-Key',
  isPlaylist: true,
  playlistOrder: RANDOM_PLAYLIST_ORDER,
};

// ============================================================================
// Exported Complete 11-Track Map & Lookup Helper
// ============================================================================

export const JUKEBOX_TRACK_DATA: Readonly<Record<JukeboxTrackId, JukeboxTrackData>> = {
  Base: BASE_TRACK,
  Bits: BITS_TRACK,
  Track1: TRACK1_FOOTHILLS,
  Track2: TRACK2_MINES,
  Track3: TRACK3_CRAGS,
  Track4: TRACK4_SUMMIT,
  Track5: TRACK5_LAB,
  Track6: TRACK6_BOSS,
  Remix1: REMIX1_TRACK,
  Remix2: REMIX2_TRACK,
  Random: RANDOM_TRACK,
};

export function getTrackData(trackId: JukeboxTrackId): JukeboxTrackData {
  return JUKEBOX_TRACK_DATA[trackId] ?? JUKEBOX_TRACK_DATA.Base;
}
