import type {
  BiomeId,
  GameMode,
  LevelData,
  SimHooks,
  Vec2,
  WorldModulePort,
} from '../contracts';
import { getWindAt, updateHazards } from '../sim/hazards';
import { buildVerticalSliceLevel } from './verticalSliceLevel';

const levelCache = new Map<string, LevelData>();

/**
 * Returns the canonical LevelData for the given mode (and optional 1..10 Time Trial index).
 * Cached by mode/index for zero-allocation reloads.
 */
export function getLevelByMode(mode: GameMode, timeTrialIndex?: number): LevelData {
  const key = mode === 'time_trial' ? `${mode}:${timeTrialIndex ?? 1}` : mode;
  let cached = levelCache.get(key);
  if (!cached) {
    cached = buildVerticalSliceLevel(mode, mode === 'time_trial' ? timeTrialIndex ?? 1 : undefined);
    levelCache.set(key, cached);
  }
  return cached;
}

/**
 * Returns a safe, grounded world-space warp target (Y-UP tiles) for any BiomeId on the given level.
 */
export function getZoneWarpTarget(level: LevelData, zone: BiomeId): Vec2 {
  const summitCenterX = level.summitZone.x + level.summitZone.w * 0.5;
  const summitY = level.summitZone.y + 0.6;

  switch (zone) {
    case 'village':
      return { x: level.spawnP1.x, y: level.spawnP1.y };
    case 'foothills':
      return { x: 15.5, y: 19.6 };
    case 'mines':
      // Lands directly at the Y = 103 headlamp threshold deck facing the FallingBlock shaft
      return { x: 16.5, y: 103.6 };
    case 'crags':
      // Lands directly at the Wind-Draft Cavern & SwingPlatform showcase
      return { x: 0.0, y: 126.6 };
    case 'summit':
      return { x: summitCenterX, y: summitY };
    case 'lab':
      return { x: summitCenterX, y: summitY };
    case 'boss':
      if (level.bossArena) {
        return {
          x: (level.bossArena.minX + level.bossArena.maxX) * 0.5,
          y: level.bossArena.minY + 1.6,
        };
      }
      return { x: summitCenterX, y: summitY };
  }
}

/**
 * Builds the Wave 1 SimHooks connecting the pure hazards & wind engine to the core simulation.
 */
export function createSimHooks(): SimHooks {
  return {
    updateHazards,
    getWindAt,
  };
}

export const worldModule: WorldModulePort = {
  getLevelByMode,
  getZoneWarpTarget,
  createSimHooks,
};

export * from './catalogs';
export * from './tileBuilder';
export * from './verticalSliceLevel';
export { getWindAt, updateHazards } from '../sim/hazards';
