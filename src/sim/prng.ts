import type { SimState } from '../contracts';

/**
 * Normalizes any numeric seed into an unsigned 32-bit integer for Mulberry32.
 */
export function normalizeSeed(seed: number): number {
  return (seed >>> 0);
}

/**
 * Deterministic Mulberry32 PRNG returning a float in [0, 1).
 * Mutates `state.rngState` in place. Zero external randomness.
 */
export function nextRand(state: Pick<SimState, 'rngState'>): number {
  let t = (state.rngState + 0x6d2b79f5) | 0;
  state.rngState = t >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Deterministic float in [min, max).
 */
export function randRange(state: Pick<SimState, 'rngState'>, min: number, max: number): number {
  return min + nextRand(state) * (max - min);
}

/**
 * Deterministic integer in [minInclusive, maxInclusive].
 */
export function randInt(
  state: Pick<SimState, 'rngState'>,
  minInclusive: number,
  maxInclusive: number,
): number {
  const lo = Math.floor(minInclusive);
  const hi = Math.floor(maxInclusive);
  if (hi <= lo) return lo;
  return lo + Math.floor(nextRand(state) * (hi - lo + 1));
}
