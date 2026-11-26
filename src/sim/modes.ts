import {
  TIME_TRIAL_MEDALS,
  WORLD,
  type BiomeId,
  type LevelData,
  type MedalTier,
  type TimeTrialMedalDef,
} from '../contracts';

/**
 * Looks up the canonical Time Trial medal definition for trial index 1..10.
 */
export function getTimeTrialMedalDef(trialIndex: number): TimeTrialMedalDef | undefined {
  const idx = Math.floor(trialIndex);
  if (idx >= 1 && idx <= TIME_TRIAL_MEDALS.length) {
    return TIME_TRIAL_MEDALS[idx - 1];
  }
  return TIME_TRIAL_MEDALS.find((m) => m.index === idx);
}

/**
 * Grades a Time Trial completion time (seconds) against exact `TIME_TRIAL_MEDALS` thresholds.
 */
export function gradeTimeTrialMedal(trialIndex: number, timeSec: number): MedalTier {
  if (!Number.isFinite(timeSec) || timeSec < 0) {
    return 'none';
  }
  const def = getTimeTrialMedalDef(trialIndex);
  if (!def) {
    return 'none';
  }
  if (timeSec <= def.platinum) {
    return 'platinum';
  }
  if (timeSec <= def.gold) {
    return 'gold';
  }
  if (timeSec <= def.silver) {
    return 'silver';
  }
  if (timeSec <= def.bronze) {
    return 'bronze';
  }
  return 'none';
}

/**
 * Resolves the canonical `BiomeId` at world coordinates `(x, altitudeY)` for any level mode:
 * - `lab_dlc`: `'boss'` inside `level.bossArena`, else `'lab'`
 * - `time_trial`: `TIME_TRIAL_MEDALS[idx - 1].biome`
 * - Mountain modes: `'village'` (`Y < 6 && X < 3`), `'foothills'` (`0..91`),
 *   `'mines'` (`91..217`), `'crags'` (`217..395`), `'summit'` (`>= 395`).
 */
export function resolveBiomeAt(level: LevelData, altitudeY: number, x: number): BiomeId {
  if (level.mode === 'lab_dlc') {
    const arena = level.bossArena;
    if (
      arena &&
      altitudeY >= arena.minY &&
      altitudeY <= arena.maxY &&
      x >= arena.minX &&
      x <= arena.maxX
    ) {
      return 'boss';
    }
    return 'lab';
  }

  if (level.mode === 'time_trial') {
    const idx = level.timeTrialIndex ?? 1;
    const def = getTimeTrialMedalDef(idx);
    return def ? def.biome : 'foothills';
  }

  if (altitudeY < 6 && x < 3) {
    return 'village';
  }
  if (altitudeY < WORLD.ZONE2_START_Y) {
    return 'foothills';
  }
  if (altitudeY < WORLD.ZONE3_START_Y) {
    return 'mines';
  }
  if (altitudeY < WORLD.ZONE4_START_Y) {
    return 'crags';
  }
  return 'summit';
}
