import type {
  BiomeId,
  GameMode,
  LevelData,
  SimHooks,
  Vec2,
  WorldModulePort,
} from '../contracts';
import { breakBossChain, updateBoss } from '../sim/boss';
import { updateCircuits } from '../sim/circuits';
import { getWindAt, updateHazards } from '../sim/hazards';
import { gradeTimeTrialMedal, resolveBiomeAt } from '../sim/modes';
import { evaluateSaveAchievements, updateProgression } from '../sim/progression';
import { buildCoopMountainLevel, COOP_ZONE_WARPS } from './coopMountainLevel';
import { buildLabDlcLevel, LAB_ZONE_WARPS } from './labDlcLevel';
import { buildSoloJeffLevel, SOLO_ZONE_WARPS } from './soloJeffLevel';
import { buildTimeTrialLevel } from './timeTrialLevels';

const levelCache = new Map<string, LevelData>();

/**
 * Returns the canonical LevelData for the given mode (and optional 1..10 Time Trial index).
 * Cached by mode/index for zero-allocation reloads.
 */
export function getLevelByMode(mode: GameMode, timeTrialIndex?: number): LevelData {
  const ttIdx = mode === 'time_trial' ? Math.max(1, Math.min(10, timeTrialIndex ?? 1)) : undefined;
  const key = mode === 'time_trial' ? `${mode}:${ttIdx}` : mode;
  let cached = levelCache.get(key);
  if (!cached) {
    switch (mode) {
      case 'solo_jeff':
        cached = buildSoloJeffLevel();
        break;
      case 'lab_dlc':
        cached = buildLabDlcLevel();
        break;
      case 'time_trial':
        cached = buildTimeTrialLevel(ttIdx ?? 1);
        break;
      case 'coop_mountain':
      case 'solo_ai':
      case 'online_coop':
      default:
        cached = buildCoopMountainLevel(mode);
        break;
    }
    levelCache.set(key, cached);
  }
  return cached;
}

/**
 * Returns a safe, grounded world-space warp target (Y-UP tiles) for any BiomeId on the given level.
 */
export function getZoneWarpTarget(level: LevelData, zone: BiomeId): Vec2 {
  if (level.mode === 'lab_dlc') {
    return { ...LAB_ZONE_WARPS[zone] };
  }
  if (level.mode === 'solo_jeff') {
    return { ...SOLO_ZONE_WARPS[zone] };
  }
  if (level.mode === 'time_trial') {
    if (zone === 'summit' || zone === 'boss') {
      return {
        x: level.summitZone.x + level.summitZone.w * 0.5,
        y: level.summitZone.y + 0.6,
      };
    }
    return { x: level.spawnP1.x, y: level.spawnP1.y };
  }
  return { ...COOP_ZONE_WARPS[zone] };
}

/**
 * Builds the complete SimHooks connecting hazards, circuits, Bachicha boss, and progression/achievements.
 */
export function createSimHooks(): SimHooks {
  return {
    updateHazards,
    getWindAt,
    updateCircuits,
    updateBoss,
    updateProgression,
  };
}

export const worldModule: WorldModulePort = {
  getLevelByMode,
  getZoneWarpTarget,
  createSimHooks,
};

export * from './catalogs';
export * from './tileBuilder';
export * from './coopMountainLevel';
export * from './soloJeffLevel';
export * from './labDlcLevel';
export * from './timeTrialLevels';
export * from './verticalSliceLevel';
export { getWindAt, updateHazards } from '../sim/hazards';
export { updateCircuits } from '../sim/circuits';
export { breakBossChain, updateBoss } from '../sim/boss';
export { gradeTimeTrialMedal, resolveBiomeAt } from '../sim/modes';
export { evaluateSaveAchievements, updateProgression } from '../sim/progression';
