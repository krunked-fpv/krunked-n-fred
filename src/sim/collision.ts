import {
  NON_GRABBABLE_TERRAINS,
  PHYSICS,
  type LevelData,
  type PenguinState,
  type SimState,
  type SlopeDef,
  type TerrainType,
  type TileCell,
} from '../contracts';

export type ActorId = 'p1' | 'p2' | 'jeff';

export interface BodyBox {
  halfW: number;
  halfH: number;
  offsetX: number;
  offsetY: number;
}

export const PENGUIN_BOX: BodyBox = {
  halfW: PHYSICS.PENGUIN_BOX_W * 0.5, // 0.31
  halfH: PHYSICS.PENGUIN_BOX_H * 0.5, // 0.43405
  offsetX: PHYSICS.PENGUIN_BOX_OFFSET_X, // 0
  offsetY: PHYSICS.PENGUIN_BOX_OFFSET_Y, // -0.1272
};

export const JEFF_BOX: BodyBox = {
  halfW: PHYSICS.JEFF_BOX_W * 0.5, // 0.24875
  halfH: PHYSICS.JEFF_BOX_H * 0.5, // 0.31895
  offsetX: PHYSICS.JEFF_BOX_OFFSET_X, // -0.001
  offsetY: PHYSICS.JEFF_BOX_OFFSET_Y, // -0.2423
};

export interface AABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface SolidRect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  oneWay: boolean;
  terrain: TerrainType;
  grabbable: boolean;
  entityId: string | null;
  isMovable: boolean;
  isDestructible: boolean;
  vx: number;
  vy: number;
}

export interface MoveResult {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hitFloor: boolean;
  hitCeiling: boolean;
  hitWallLeft: boolean;
  hitWallRight: boolean;
  grounded: boolean;
  groundTerrain: TerrainType;
  platformEntityId: string | null;
  onIce: boolean;
  onMovable: boolean;
  onDestructible: boolean;
  onSlope: boolean;
  impactVy: number;
}

export interface GroundProbeResult {
  grounded: boolean;
  terrain: TerrainType;
  platformEntityId: string | null;
  onIce: boolean;
  onMovable: boolean;
  onDestructible: boolean;
  onSlope: boolean;
  surfaceY: number;
}

export interface WallProbeResult {
  found: boolean;
  side: -1 | 0 | 1;
  wallX: number;
  snapX: number;
  terrain: TerrainType;
  entityId: string | null;
}

const SKIN = 0.004;
const ONE_WAY_EPS = 0.07;
const MAX_SUBSTEP_DIST = 0.14;
const MAX_SUBSTEPS = 18;
const SLOPE_STEP_EPS = 0.32;

export function getBodyAABB(x: number, y: number, box: BodyBox): AABB {
  const cx = x + box.offsetX;
  const cy = y + box.offsetY;
  return {
    minX: cx - box.halfW,
    maxX: cx + box.halfW,
    minY: cy - box.halfH,
    maxY: cy + box.halfH,
  };
}

export function getFeetOffsetY(box: BodyBox): number {
  return box.offsetY - box.halfH; // -0.56125 for both Penguin and Jeff
}

export function getTileAt(level: LevelData, tx: number, ty: number): TileCell | undefined {
  return level.tiles.get(`${tx},${ty}`);
}

function isTileActiveForActor(tile: TileCell, actor: ActorId): boolean {
  if (tile.kind === 'KRUNKED_ONLY') return actor === 'p1';
  if (tile.kind === 'FRED_ONLY') return actor === 'p2';
  return true;
}

function isColorPlatformActiveForActor(
  owner: 'krunked' | 'fred',
  actor: ActorId,
): boolean {
  if (owner === 'krunked') return actor === 'p1';
  return actor === 'p2';
}

function collectBroadphaseSolids(
  state: SimState,
  level: LevelData,
  actor: ActorId,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  outRects: SolidRect[],
  outSlopes: SlopeDef[],
): void {
  outRects.length = 0;
  outSlopes.length = 0;

  // 1. Static tile grid
  const tx0 = Math.floor(minX) - 1;
  const tx1 = Math.floor(maxX) + 1;
  const ty0 = Math.floor(minY) - 1;
  const ty1 = Math.floor(maxY) + 1;

  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const tile = getTileAt(level, tx, ty);
      if (!tile || !isTileActiveForActor(tile, actor)) continue;

      if (tile.kind === 'SLOPE_LEFT' || tile.kind === 'SLOPE_RIGHT') {
        outSlopes.push({
          id: `tile_slope_${tx}_${ty}`,
          x: tx,
          y: ty,
          w: 1,
          h: 1,
          dir: tile.kind === 'SLOPE_RIGHT' ? 'right' : 'left',
          terrain: tile.terrain,
        });
        continue;
      }

      const isOneWay = tile.kind === 'ONE_WAY';
      const terrain: TerrainType = tile.kind === 'ICE' ? 'ICE' : tile.terrain;
      const grabbable =
        !isOneWay &&
        tile.kind !== 'ICE' &&
        tile.grabbable &&
        !NON_GRABBABLE_TERRAINS.has(terrain);

      outRects.push({
        minX: tx,
        maxX: tx + 1,
        minY: ty,
        maxY: ty + 1,
        oneWay: isOneWay,
        terrain,
        grabbable,
        entityId: null,
        isMovable: false,
        isDestructible: false,
        vx: 0,
        vy: 0,
      });
    }
  }

  // 2. Explicit level slopes
  for (let i = 0; i < level.slopes.length; i++) {
    const s = level.slopes[i];
    if (s.x + s.w < minX - 1 || s.x > maxX + 1 || s.y + s.h < minY - 1 || s.y > maxY + 1) {
      continue;
    }
    outSlopes.push(s);
  }

  // 3. Non-crumbled falling blocks
  for (let i = 0; i < state.fallingBlocks.length; i++) {
    const b = state.fallingBlocks[i];
    if (b.state === 'crumbled') continue;
    if (b.x + b.w < minX - 1 || b.x > maxX + 1 || b.y + b.h < minY - 1 || b.y > maxY + 1) {
      continue;
    }
    outRects.push({
      minX: b.x,
      maxX: b.x + b.w,
      minY: b.y,
      maxY: b.y + b.h,
      oneWay: false,
      terrain: b.terrain,
      grabbable: !NON_GRABBABLE_TERRAINS.has(b.terrain),
      entityId: b.id,
      isMovable: false,
      isDestructible: true,
      vx: 0,
      vy: 0,
    });
  }

  // 4. Movable platforms
  for (let i = 0; i < state.movablePlatforms.length; i++) {
    const m = state.movablePlatforms[i];
    if (m.x + m.w < minX - 1 || m.x > maxX + 1 || m.y + m.h < minY - 1 || m.y > maxY + 1) {
      continue;
    }
    outRects.push({
      minX: m.x,
      maxX: m.x + m.w,
      minY: m.y,
      maxY: m.y + m.h,
      oneWay: false,
      terrain: m.terrain,
      grabbable: !NON_GRABBABLE_TERRAINS.has(m.terrain),
      entityId: m.id,
      isMovable: true,
      isDestructible: false,
      vx: m.vx,
      vy: m.vy,
    });
  }

  // 5. Swing platforms
  for (let i = 0; i < state.swingPlatforms.length; i++) {
    const sp = state.swingPlatforms[i];
    if (sp.x + sp.w < minX - 1 || sp.x > maxX + 1 || sp.y + sp.h < minY - 1 || sp.y > maxY + 1) {
      continue;
    }
    outRects.push({
      minX: sp.x,
      maxX: sp.x + sp.w,
      minY: sp.y,
      maxY: sp.y + sp.h,
      oneWay: false,
      terrain: 'PLATFORM',
      grabbable: false,
      entityId: sp.id,
      isMovable: true,
      isDestructible: false,
      vx: sp.vx,
      vy: sp.vy,
    });
  }

  // 6. Tronchos (lab moving piston blocks, can be grabbable!)
  for (let i = 0; i < state.tronchos.length; i++) {
    const tr = state.tronchos[i];
    if (tr.x + tr.w < minX - 1 || tr.x > maxX + 1 || tr.y + tr.h < minY - 1 || tr.y > maxY + 1) {
      continue;
    }
    outRects.push({
      minX: tr.x,
      maxX: tr.x + tr.w,
      minY: tr.y,
      maxY: tr.y + tr.h,
      oneWay: false,
      terrain: tr.terrain,
      grabbable: tr.grabbable && !NON_GRABBABLE_TERRAINS.has(tr.terrain),
      entityId: tr.id,
      isMovable: true,
      isDestructible: false,
      vx: tr.vx,
      vy: tr.vy,
    });
  }

  // 7. Active Color Platforms (Krunked-only / Fred-only)
  for (let i = 0; i < state.colorPlatforms.length; i++) {
    const cp = state.colorPlatforms[i];
    if (!cp.active || !isColorPlatformActiveForActor(cp.owner, actor)) continue;
    if (cp.x + cp.w < minX - 1 || cp.x > maxX + 1 || cp.y + cp.h < minY - 1 || cp.y > maxY + 1) {
      continue;
    }
    outRects.push({
      minX: cp.x,
      maxX: cp.x + cp.w,
      minY: cp.y,
      maxY: cp.y + cp.h,
      oneWay: false,
      terrain: 'LAB_PLATFORM',
      grabbable: false,
      entityId: cp.id,
      isMovable: false,
      isDestructible: false,
      vx: 0,
      vy: 0,
    });
  }
}

function getSlopeSurfaceY(slope: SlopeDef, sampleX: number): number {
  const tRaw = slope.w > 1e-6 ? (sampleX - slope.x) / slope.w : 0;
  const t = tRaw < 0 ? 0 : tRaw > 1 ? 1 : tRaw;
  return slope.dir === 'right' ? slope.y + t * slope.h : slope.y + (1 - t) * slope.h;
}

/**
 * Finds the displacement `(dx, dy)` of a dynamic entity (movable/swing/troncho) by id.
 * Returns null if the entity doesn't exist or crumbled.
 */
export function getDynamicEntityDelta(
  state: SimState,
  entityId: string | null,
): { dx: number; dy: number; vx: number; vy: number; exists: boolean } | null {
  if (!entityId) return null;

  for (let i = 0; i < state.movablePlatforms.length; i++) {
    const m = state.movablePlatforms[i];
    if (m.id === entityId) {
      return { dx: m.x - m.prevX, dy: m.y - m.prevY, vx: m.vx, vy: m.vy, exists: true };
    }
  }
  for (let i = 0; i < state.swingPlatforms.length; i++) {
    const sp = state.swingPlatforms[i];
    if (sp.id === entityId) {
      return { dx: sp.x - sp.prevX, dy: sp.y - sp.prevY, vx: sp.vx, vy: sp.vy, exists: true };
    }
  }
  for (let i = 0; i < state.tronchos.length; i++) {
    const tr = state.tronchos[i];
    if (tr.id === entityId) {
      return { dx: tr.x - tr.prevX, dy: tr.y - tr.prevY, vx: tr.vx, vy: tr.vy, exists: true };
    }
  }
  for (let i = 0; i < state.fallingBlocks.length; i++) {
    const fb = state.fallingBlocks[i];
    if (fb.id === entityId) {
      return { dx: 0, dy: 0, vx: 0, vy: 0, exists: fb.state !== 'crumbled' };
    }
  }
  return null;
}

/**
 * Swept, substepped AABB collision resolution against tiles, slopes, falling blocks,
 * movable platforms, swing platforms, tronchos, and active color platforms.
 */
export function moveAndCollide(
  state: SimState,
  level: LevelData,
  actor: ActorId,
  box: BodyBox,
  startX: number,
  startY: number,
  dx: number,
  dy: number,
  vx: number,
  vy: number,
  wasGrounded: boolean,
): MoveResult {
  const startAABB = getBodyAABB(startX, startY, box);
  const sweepMinX = Math.min(startAABB.minX, startAABB.minX + dx);
  const sweepMaxX = Math.max(startAABB.maxX, startAABB.maxX + dx);
  const sweepMinY = Math.min(startAABB.minY, startAABB.minY + dy) - 0.35;
  const sweepMaxY = Math.max(startAABB.maxY, startAABB.maxY + dy) + 0.1;

  const rects: SolidRect[] = [];
  const slopes: SlopeDef[] = [];
  collectBroadphaseSolids(
    state,
    level,
    actor,
    sweepMinX,
    sweepMaxX,
    sweepMinY,
    sweepMaxY,
    rects,
    slopes,
  );

  const maxDisp = Math.max(Math.abs(dx), Math.abs(dy));
  const steps = Math.max(1, Math.min(MAX_SUBSTEPS, Math.ceil(maxDisp / MAX_SUBSTEP_DIST)));
  const stepDx = dx / steps;
  const stepDy = dy / steps;

  let x = startX;
  let y = startY;
  let outVx = vx;
  let outVy = vy;
  let hitFloor = false;
  let hitCeiling = false;
  let hitWallLeft = false;
  let hitWallRight = false;
  let groundTerrain: TerrainType = 'DEFAULT';
  let platformEntityId: string | null = null;
  let onIce = false;
  let onMovable = false;
  let onDestructible = false;
  let onSlope = false;
  let impactVy = 0;

  const feetOffset = getFeetOffsetY(box);
  const headOffset = box.offsetY + box.halfH;

  for (let s = 0; s < steps; s++) {
    // --- Horizontal step ---
    if (stepDx !== 0) {
      const prevX = x;
      x += stepDx;
      const aabb = getBodyAABB(x, y, box);
      const yLo = aabb.minY + SKIN;
      const yHi = aabb.maxY - SKIN;

      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (r.oneWay) continue;
        if (yHi <= r.minY || yLo >= r.maxY) continue;
        if (aabb.maxX <= r.minX || aabb.minX >= r.maxX) continue;

        if (stepDx > 0) {
          x = r.minX - box.halfW - box.offsetX;
          hitWallRight = true;
          if (outVx > 0) outVx = 0;
        } else {
          x = r.maxX + box.halfW - box.offsetX;
          hitWallLeft = true;
          if (outVx < 0) outVx = 0;
        }
        aabb.minX = x + box.offsetX - box.halfW;
        aabb.maxX = x + box.offsetX + box.halfW;
      }

      // Check tall vertical back walls of slopes when approaching from outside
      const prevAABB = getBodyAABB(prevX, y, box);
      for (let i = 0; i < slopes.length; i++) {
        const sl = slopes[i];
        if (yHi <= sl.y || yLo >= sl.y + sl.h) continue;
        if (aabb.maxX <= sl.x || aabb.minX >= sl.x + sl.w) continue;

        if (sl.dir === 'right' && stepDx < 0 && prevAABB.minX >= sl.x + sl.w - SKIN) {
          // Hitting vertical right wall of right-rising slope from the right
          if (aabb.minY < sl.y + sl.h - SLOPE_STEP_EPS) {
            x = sl.x + sl.w + box.halfW - box.offsetX;
            hitWallLeft = true;
            if (outVx < 0) outVx = 0;
            aabb.minX = x + box.offsetX - box.halfW;
            aabb.maxX = x + box.offsetX + box.halfW;
          }
        } else if (sl.dir === 'left' && stepDx > 0 && prevAABB.maxX <= sl.x + SKIN) {
          // Hitting vertical left wall of left-rising slope from the left
          if (aabb.minY < sl.y + sl.h - SLOPE_STEP_EPS) {
            x = sl.x - box.halfW - box.offsetX;
            hitWallRight = true;
            if (outVx > 0) outVx = 0;
            aabb.minX = x + box.offsetX - box.halfW;
            aabb.maxX = x + box.offsetX + box.halfW;
          }
        }
      }
    }

    // --- Vertical step ---
    const prevY = y;
    const prevFeet = prevY + feetOffset;
    const prevHead = prevY + headOffset;
    y += stepDy;

    const aabb = getBodyAABB(x, y, box);
    const xLo = aabb.minX + SKIN;
    const xHi = aabb.maxX - SKIN;

    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (xHi <= r.minX || xLo >= r.maxX) continue;
      if (aabb.maxY <= r.minY || aabb.minY >= r.maxY) continue;

      if (r.oneWay) {
        if (stepDy <= 0 && prevFeet >= r.maxY - ONE_WAY_EPS && aabb.minY <= r.maxY) {
          y = r.maxY - feetOffset;
          if (!hitFloor && outVy < impactVy) impactVy = outVy;
          hitFloor = true;
          if (outVy < r.vy) outVy = Math.min(0, r.vy);
          groundTerrain = r.terrain;
          platformEntityId = r.entityId;
          onIce = r.terrain === 'ICE';
          onMovable = r.isMovable;
          onDestructible = r.isDestructible;
          aabb.minY = y + feetOffset;
          aabb.maxY = y + headOffset;
        }
        continue;
      }

      if (stepDy <= 0) {
        // Landing on top surface
        if (prevFeet >= r.maxY - Math.max(ONE_WAY_EPS, Math.abs(stepDy) + 0.08)) {
          y = r.maxY - feetOffset;
          if (!hitFloor && outVy < impactVy) impactVy = outVy;
          hitFloor = true;
          if (outVy < r.vy) outVy = Math.min(0, r.vy);
          groundTerrain = r.terrain;
          platformEntityId = r.entityId;
          onIce = r.terrain === 'ICE';
          onMovable = r.isMovable;
          onDestructible = r.isDestructible;
          aabb.minY = y + feetOffset;
          aabb.maxY = y + headOffset;
        } else if (prevHead <= r.minY + 0.08) {
          // Edge case: pushed upward into underside while stepDy == 0
          y = r.minY - headOffset;
          hitCeiling = true;
          if (outVy > 0) outVy = 0;
          aabb.minY = y + feetOffset;
          aabb.maxY = y + headOffset;
        }
      } else {
        // Rising into ceiling
        if (prevHead <= r.minY + Math.max(ONE_WAY_EPS, Math.abs(stepDy) + 0.08)) {
          y = r.minY - headOffset;
          hitCeiling = true;
          if (outVy > 0) outVy = 0;
          aabb.minY = y + feetOffset;
          aabb.maxY = y + headOffset;
        }
      }
    }

    // --- Slopes resolution ---
    for (let i = 0; i < slopes.length; i++) {
      const sl = slopes[i];
      const cx = x + box.offsetX;
      if (aabb.maxX <= sl.x + SKIN || aabb.minX >= sl.x + sl.w - SKIN) continue;
      if (aabb.maxY <= sl.y || aabb.minY > sl.y + sl.h + 0.05) continue;

      // Underside collision if rising from below slope base
      if (stepDy > 0 && prevHead <= sl.y + 0.08 && aabb.maxY > sl.y) {
        y = sl.y - headOffset;
        hitCeiling = true;
        if (outVy > 0) outVy = 0;
        aabb.minY = y + feetOffset;
        aabb.maxY = y + headOffset;
        continue;
      }

      const sampleX = cx < sl.x ? sl.x : cx > sl.x + sl.w ? sl.x + sl.w : cx;
      const surfaceY = getSlopeSurfaceY(sl, sampleX);

      // Stand on / walk up slope if feet cross surface from above (or within slope step-up tolerance)
      if (
        outVy <= 0.1 &&
        aabb.minY <= surfaceY + (wasGrounded ? 0.14 : 0.02) &&
        prevFeet >= surfaceY - SLOPE_STEP_EPS
      ) {
        y = surfaceY - feetOffset;
        if (!hitFloor && outVy < impactVy) impactVy = outVy;
        hitFloor = true;
        if (outVy < 0) outVy = 0;
        groundTerrain = sl.terrain;
        platformEntityId = null;
        onIce = sl.terrain === 'ICE';
        onMovable = false;
        onDestructible = false;
        onSlope = true;
        aabb.minY = y + feetOffset;
        aabb.maxY = y + headOffset;
      }
    }
  }

  // Final ground probe (handles staying grounded when dy == 0 or walking smoothly on flat/moving floors)
  let grounded = hitFloor;
  if (!grounded && outVy <= 0.25) {
    const probe = probeGround(state, level, actor, box, x, y, outVy, wasGrounded ? 0.08 : 0.035);
    if (probe.grounded) {
      grounded = true;
      groundTerrain = probe.terrain;
      platformEntityId = probe.platformEntityId;
      onIce = probe.onIce;
      onMovable = probe.onMovable;
      onDestructible = probe.onDestructible;
      onSlope = probe.onSlope;
      if (probe.onSlope && wasGrounded) {
        y = probe.surfaceY - feetOffset;
      }
    }
  }

  return {
    x,
    y,
    vx: outVx,
    vy: outVy,
    hitFloor,
    hitCeiling,
    hitWallLeft,
    hitWallRight,
    grounded,
    groundTerrain,
    platformEntityId,
    onIce,
    onMovable,
    onDestructible,
    onSlope,
    impactVy,
  };
}

/**
 * Probes slightly beneath body feet to detect standing ground surface and terrain.
 */
export function probeGround(
  state: SimState,
  level: LevelData,
  actor: ActorId,
  box: BodyBox,
  x: number,
  y: number,
  vy: number,
  probeDist = PHYSICS.DETECT_GROUND_OFFSET + 0.04,
): GroundProbeResult {
  const aabb = getBodyAABB(x, y, box);
  const rects: SolidRect[] = [];
  const slopes: SlopeDef[] = [];
  collectBroadphaseSolids(
    state,
    level,
    actor,
    aabb.minX,
    aabb.maxX,
    aabb.minY - probeDist - 0.1,
    aabb.minY + 0.15,
    rects,
    slopes,
  );

  const xLo = aabb.minX + SKIN;
  const xHi = aabb.maxX - SKIN;

  let bestTop = -Infinity;
  let bestResult: GroundProbeResult = {
    grounded: false,
    terrain: 'DEFAULT',
    platformEntityId: null,
    onIce: false,
    onMovable: false,
    onDestructible: false,
    onSlope: false,
    surfaceY: aabb.minY,
  };

  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (xHi <= r.minX || xLo >= r.maxX) continue;
    // Allow staying grounded on upward-moving platforms
    if (vy > r.vy + 0.35) continue;

    const gap = aabb.minY - r.maxY;
    if (gap >= -0.05 && gap <= probeDist) {
      if (r.maxY > bestTop) {
        bestTop = r.maxY;
        bestResult = {
          grounded: true,
          terrain: r.terrain,
          platformEntityId: r.entityId,
          onIce: r.terrain === 'ICE',
          onMovable: r.isMovable,
          onDestructible: r.isDestructible,
          onSlope: false,
          surfaceY: r.maxY,
        };
      }
    }
  }

  if (vy <= 0.25) {
    const cx = x + box.offsetX;
    for (let i = 0; i < slopes.length; i++) {
      const sl = slopes[i];
      if (aabb.maxX <= sl.x + SKIN || aabb.minX >= sl.x + sl.w - SKIN) continue;
      const sampleX = cx < sl.x ? sl.x : cx > sl.x + sl.w ? sl.x + sl.w : cx;
      const surfY = getSlopeSurfaceY(sl, sampleX);
      const gap = aabb.minY - surfY;
      if (gap >= -0.08 && gap <= probeDist + 0.12) {
        if (surfY > bestTop) {
          bestTop = surfY;
          bestResult = {
            grounded: true,
            terrain: sl.terrain,
            platformEntityId: null,
            onIce: sl.terrain === 'ICE',
            onMovable: false,
            onDestructible: false,
            onSlope: true,
            surfaceY: surfY,
          };
        }
      }
    }
  }

  return bestResult;
}

/**
 * Resolves a pure positional correction delta (used inside PBD rope iterations and rider carry)
 * without altering velocities except zeroing blocked components when requested.
 */
export function applyCollisionConstrainedDelta(
  state: SimState,
  level: LevelData,
  actor: ActorId,
  box: BodyBox,
  x: number,
  y: number,
  dx: number,
  dy: number,
): { x: number; y: number; blockedX: boolean; blockedY: boolean } {
  if (Math.abs(dx) < 1e-7 && Math.abs(dy) < 1e-7) {
    return { x, y, blockedX: false, blockedY: false };
  }
  const res = moveAndCollide(state, level, actor, box, x, y, dx, dy, 0, 0, false);
  return {
    x: res.x,
    y: res.y,
    blockedX: res.hitWallLeft || res.hitWallRight,
    blockedY: res.hitFloor || res.hitCeiling,
  };
}

/**
 * Probes left and right of a penguin for a grabbable wall within `range` units of `p.x`.
 * Rejects `NON_GRABBABLE_TERRAINS`, `ONE_WAY` tiles, `ICE`, and blocked surfaces behind
 * closer non-grabbable solids. Supports grabbable `Troncho` pistons and `FallingBlock`s.
 */
export function probeWallForGrab(
  state: SimState,
  level: LevelData,
  p: PenguinState,
  range: number,
): WallProbeResult {
  const aabb = getBodyAABB(p.x, p.y, PENGUIN_BOX);
  const torsoMinY = aabb.minY + 0.14;
  const torsoMaxY = aabb.maxY - 0.08;

  const rects: SolidRect[] = [];
  const slopes: SlopeDef[] = [];
  collectBroadphaseSolids(
    state,
    level,
    p.id,
    p.x - range - 0.2,
    p.x + range + 0.2,
    torsoMinY - 0.1,
    torsoMaxY + 0.1,
    rects,
    slopes,
  );

  const probeSide = (side: 1 | -1): WallProbeResult | null => {
    let bestDist = Infinity;
    let bestRect: SolidRect | null = null;
    let bestWallX = 0;

    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (r.oneWay) continue;
      // Must vertically overlap penguin torso
      if (torsoMaxY <= r.minY + 0.05 || torsoMinY >= r.maxY - 0.05) continue;

      if (side === 1) {
        // Wall on right: its left face r.minX is to the right of penguin center
        if (r.minX < p.x + PENGUIN_BOX.halfW - 0.08) continue;
        const dist = r.minX - p.x;
        if (dist <= range && dist < bestDist) {
          bestDist = dist;
          bestRect = r;
          bestWallX = r.minX;
        }
      } else {
        // Wall on left: its right face r.maxX is to the left of penguin center
        if (r.maxX > p.x - PENGUIN_BOX.halfW + 0.08) continue;
        const dist = p.x - r.maxX;
        if (dist <= range && dist < bestDist) {
          bestDist = dist;
          bestRect = r;
          bestWallX = r.maxX;
        }
      }
    }

    if (!bestRect || !bestRect.grabbable || NON_GRABBABLE_TERRAINS.has(bestRect.terrain)) {
      return null;
    }

    const desiredSnapX = bestWallX - side * PHYSICS.WALL_MARGIN;
    // Ensure snapX doesn't shove penguin into an opposite wall
    const snapped = applyCollisionConstrainedDelta(
      state,
      level,
      p.id,
      PENGUIN_BOX,
      p.x,
      p.y,
      desiredSnapX - p.x,
      0,
    );

    return {
      found: true,
      side,
      wallX: bestWallX,
      snapX: snapped.x,
      terrain: bestRect.terrain,
      entityId: bestRect.entityId,
    };
  };

  // Prefer the direction the penguin is currently facing; fall back to opposite side
  const primarySide: 1 | -1 = p.facing === -1 ? -1 : 1;
  const secondarySide: 1 | -1 = primarySide === 1 ? -1 : 1;

  const first = probeSide(primarySide);
  if (first) return first;

  const second = probeSide(secondarySide);
  if (second) return second;

  return {
    found: false,
    side: 0,
    wallX: p.x,
    snapX: p.x,
    terrain: 'DEFAULT',
    entityId: null,
  };
}

/**
 * Checks whether a wall still exists on `side` at `p`'s current clung position.
 */
export function hasGrabbableWallOnSide(
  state: SimState,
  level: LevelData,
  p: PenguinState,
  side: 1 | -1,
  range: number,
): WallProbeResult {
  const savedFacing = p.facing;
  p.facing = side;
  const res = probeWallForGrab(state, level, p, range);
  p.facing = savedFacing;
  if (res.found && res.side === side) {
    return res;
  }
  return {
    found: false,
    side: 0,
    wallX: p.x,
    snapX: p.x,
    terrain: 'DEFAULT',
    entityId: null,
  };
}

/**
 * Checks whether there is solid ground ahead of `(x, y)` in direction `dir` (for ledge/drag detection).
 */
export function hasGroundAhead(
  state: SimState,
  level: LevelData,
  actor: ActorId,
  x: number,
  y: number,
  dir: 1 | -1,
): boolean {
  const probe = probeGround(
    state,
    level,
    actor,
    PENGUIN_BOX,
    x + dir * (PENGUIN_BOX.halfW + 0.25),
    y,
    0,
    0.25,
  );
  return probe.grounded;
}
