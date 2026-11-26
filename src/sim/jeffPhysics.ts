import {
  NON_GRABBABLE_TERRAINS,
  PHYSICS,
  type JeffState,
  type LevelData,
  type PlayerInput,
  type SimState,
  type TerrainType,
} from '../contracts';
import {
  applyCollisionConstrainedDelta,
  getBodyAABB,
  getDynamicEntityDelta,
  getFeetOffsetY,
  getTileAt,
  JEFF_BOX,
  moveAndCollide,
  probeGround,
  type SolidRect,
  type WallProbeResult,
} from './collision';

export const JEFF_PICKUP_RANGE = 1.15;
export const JEFF_CARRY_OFFSET_X = 0.2;
export const JEFF_CARRY_OFFSET_Y = 0.55;
export const JEFF_TOSS_VX = 7.2;
export const JEFF_TOSS_CARRY_VX_FACTOR = 0.45;
export const JEFF_TOSS_VY = 11.5;
export const JEFF_TOSS_COOLDOWN = 0.25;

const MAX_FALL_SPEED = 32.0;
const WALL_SNAP_MARGIN = 0.02;

function clampWindForce(windForceX: number): number {
  if (!Number.isFinite(windForceX)) return 0;
  if (windForceX > 2.0) return 2.0;
  if (windForceX < -2.0) return -2.0;
  return windForceX;
}

function collectJeffWallCandidates(
  state: SimState,
  level: LevelData,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  outRects: SolidRect[],
): void {
  outRects.length = 0;

  const tx0 = Math.floor(minX) - 1;
  const tx1 = Math.floor(maxX) + 1;
  const ty0 = Math.floor(minY) - 1;
  const ty1 = Math.floor(maxY) + 1;

  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const tile = getTileAt(level, tx, ty);
      if (!tile) continue;
      if (
        tile.kind === 'KRUNKED_ONLY' ||
        tile.kind === 'FRED_ONLY' ||
        tile.kind === 'ONE_WAY' ||
        tile.kind === 'SLOPE_LEFT' ||
        tile.kind === 'SLOPE_RIGHT'
      ) {
        continue;
      }

      const terrain: TerrainType = tile.kind === 'ICE' ? 'ICE' : tile.terrain;
      const grabbable =
        tile.kind !== 'ICE' && tile.grabbable && !NON_GRABBABLE_TERRAINS.has(terrain);

      outRects.push({
        minX: tx,
        maxX: tx + 1,
        minY: ty,
        maxY: ty + 1,
        oneWay: false,
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
}

/**
 * Probes left and right of Jeff for a grabbable cliff wall within `range` (`GRAB_JEFF_RANGE = 0.8`).
 * Rejects `ICE`, `ONE_WAY`, `NON_GRABBABLE_TERRAINS`, and grabbable surfaces hidden behind closer blockers.
 */
export function probeJeffWallForGrab(
  state: SimState,
  level: LevelData,
  j: JeffState,
  range: number = PHYSICS.GRAB_JEFF_RANGE,
  preferredSide?: 1 | -1,
  onlySide?: 1 | -1,
): WallProbeResult {
  const aabb = getBodyAABB(j.x, j.y, JEFF_BOX);
  const bodyMinY = aabb.minY + 0.06;
  const bodyMaxY = aabb.maxY - 0.06;

  const rects: SolidRect[] = [];
  collectJeffWallCandidates(
    state,
    level,
    j.x - range - 0.25,
    j.x + range + 0.25,
    bodyMinY - 0.1,
    bodyMaxY + 0.1,
    rects,
  );

  const probeSide = (side: 1 | -1): WallProbeResult | null => {
    let bestDist = Infinity;
    let bestRect: SolidRect | null = null;
    let bestWallX = 0;

    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (bodyMaxY <= r.minY + 0.04 || bodyMinY >= r.maxY - 0.04) continue;

      if (side === 1) {
        if (r.minX < aabb.maxX - 0.12) continue;
        const dist = r.minX - j.x;
        if (dist <= range && dist < bestDist) {
          bestDist = dist;
          bestRect = r;
          bestWallX = r.minX;
        }
      } else {
        if (r.maxX > aabb.minX + 0.12) continue;
        const dist = j.x - r.maxX;
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

    const desiredSnapX =
      bestWallX - side * (JEFF_BOX.halfW + WALL_SNAP_MARGIN) - JEFF_BOX.offsetX;
    const snapped = applyCollisionConstrainedDelta(
      state,
      level,
      'jeff',
      JEFF_BOX,
      j.x,
      j.y,
      desiredSnapX - j.x,
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

  if (onlySide !== undefined) {
    const exact = probeSide(onlySide);
    if (exact) return exact;
    return {
      found: false,
      side: 0,
      wallX: j.x,
      snapX: j.x,
      terrain: 'DEFAULT',
      entityId: null,
    };
  }

  const firstSide: 1 | -1 = preferredSide ?? (j.vx < -0.1 ? -1 : 1);
  const secondSide: 1 | -1 = firstSide === 1 ? -1 : 1;

  const first = probeSide(firstSide);
  if (first) return first;

  const second = probeSide(secondSide);
  if (second) return second;

  return {
    found: false,
    side: 0,
    wallX: j.x,
    snapX: j.x,
    terrain: 'DEFAULT',
    entityId: null,
  };
}

/**
 * Measures vertical clearance from Jeff's feet down to any platform/ground within
 * `GRAB_JEFF_PLATFORM_CHECK_RANGE` (3.0 u) so `GrabJeffAction` respects both
 * `GRAB_JEFF_BOTTOM_MARGIN` (0.5 u) and platform clearance checks.
 */
function checkJeffPlatformClearance(
  state: SimState,
  level: LevelData,
  j: JeffState,
): { hasBottomClearance: boolean; hasPlatformBelow: boolean; clearance: number; onMovable: boolean } {
  const probe = probeGround(
    state,
    level,
    'jeff',
    JEFF_BOX,
    j.x,
    j.y,
    -1,
    PHYSICS.GRAB_JEFF_PLATFORM_CHECK_RANGE,
  );
  if (!probe.grounded) {
    return {
      hasBottomClearance: true,
      hasPlatformBelow: false,
      clearance: PHYSICS.GRAB_JEFF_PLATFORM_CHECK_RANGE,
      onMovable: false,
    };
  }

  const feetY = j.y + getFeetOffsetY(JEFF_BOX);
  const clearance = feetY - probe.surfaceY;
  return {
    hasBottomClearance: clearance >= PHYSICS.GRAB_JEFF_BOTTOM_MARGIN,
    hasPlatformBelow: true,
    clearance,
    onMovable: probe.onMovable,
  };
}

/**
 * Checks whether a wall continues above Jeff's head (tall cliff face) vs terminating right at
 * Jeff's level as a low ledge top that an upward toss is about to clear and land on.
 */
function wallContinuesAboveJeff(
  state: SimState,
  level: LevelData,
  j: JeffState,
  side: 1 | -1,
  wallX: number,
): boolean {
  const aabb = getBodyAABB(j.x, j.y, JEFF_BOX);
  const checkY = aabb.maxY + 0.45;
  const checkX = side === 1 ? wallX + 0.15 : wallX - 0.15;

  const tile = getTileAt(level, Math.floor(checkX), Math.floor(checkY));
  if (
    tile &&
    tile.kind !== 'ONE_WAY' &&
    tile.kind !== 'KRUNKED_ONLY' &&
    tile.kind !== 'FRED_ONLY' &&
    tile.kind !== 'SLOPE_LEFT' &&
    tile.kind !== 'SLOPE_RIGHT'
  ) {
    return true;
  }

  for (let i = 0; i < state.fallingBlocks.length; i++) {
    const b = state.fallingBlocks[i];
    if (b.state === 'crumbled') continue;
    if (checkX >= b.x && checkX <= b.x + b.w && checkY >= b.y && checkY <= b.y + b.h) {
      return true;
    }
  }

  for (let i = 0; i < state.tronchos.length; i++) {
    const tr = state.tronchos[i];
    if (checkX >= tr.x && checkX <= tr.x + tr.w && checkY >= tr.y && checkY <= tr.y + tr.h) {
      return true;
    }
  }

  return false;
}

function tryStickJeffToWall(
  state: SimState,
  level: LevelData,
  j: JeffState,
  hitWallLeft: boolean,
  hitWallRight: boolean,
  preCollisionVx: number,
  preCollisionVy: number,
): boolean {
  if (j.grounded || j.heldByP1 || j.grabbedWallSide !== 0 || j.fallingSlow || j.grabTimer <= 0) {
    return false;
  }

  const clearance = checkJeffPlatformClearance(state, level, j);
  if (!clearance.hasBottomClearance) {
    return false;
  }
  if (clearance.onMovable && clearance.clearance < PHYSICS.GRAB_JEFF_BOTTOM_MARGIN + 0.25) {
    return false;
  }

  const preferredSide: 1 | -1 = hitWallRight
    ? 1
    : hitWallLeft
      ? -1
      : preCollisionVx < -0.1
        ? -1
        : 1;

  const wall = probeJeffWallForGrab(
    state,
    level,
    j,
    PHYSICS.GRAB_JEFF_RANGE,
    preferredSide,
  );
  if (!wall.found || wall.side === 0) {
    return false;
  }

  const hitThisSide =
    (wall.side === 1 && hitWallRight) || (wall.side === -1 && hitWallLeft);

  // Avoid magnetically snapping backwards onto a wall behind P1 when tossing away from it.
  if (!hitThisSide && preCollisionVx * wall.side < -0.5) {
    return false;
  }

  // Let a clean upward toss arc onto the top of a low ledge instead of snagging its side prematurely.
  if (
    !hitThisSide &&
    preCollisionVy > 1.5 &&
    !wallContinuesAboveJeff(state, level, j, wall.side, wall.wallX)
  ) {
    return false;
  }

  j.x = wall.snapX;
  j.vx = 0;
  j.vy = 0;
  j.grounded = false;
  j.groundTerrain = 'DEFAULT';
  j.anchored = false;
  j.grabbedWallSide = wall.side;
  j.grabTimer = PHYSICS.GRAB_JEFF_TIMER;
  j.fallingSlow = false;
  j.platformEntityId = wall.entityId;

  state.events.push({
    type: 'grab_start',
    who: 'jeff',
    x: j.x,
    y: j.y,
    terrain: wall.terrain,
  });
  return true;
}

/**
 * Dedicated Solo Jeff rock companion physics (`PHYSICS` parity):
 *  - Carry & Toss (pickup <= 1.15 u, snug ride at (p1.x + facing*0.2, p1.y + 0.55), toss launch)
 *  - GrabJeffAction (wall stick within 0.8 u, bottom clearance >= 0.5 u, platform check 3.0 u, 7.5s timer)
 *  - FallJeffAction (steady -2.5 u/s slow fall with 0.05 u precision until grounded)
 *  - Anchor & Counterweight (solid ground anchor + gentle wind slide on ICE)
 *  - PullRope_Jeff (1.5s reel-in when assist.pullingRope is enabled)
 *  - Swept collision, moving platform riding, and `land` events
 */
export function updateJeffPhysics(
  state: SimState,
  level: LevelData,
  p1Input: PlayerInput,
  windForceX: number,
  dt: number,
): void {
  const j = state.jeff;
  if (!j.active) return;

  const p1 = state.p1;
  const effWindX = clampWindForce(windForceX);
  j.tossCooldown = Math.max(0, j.tossCooldown - dt);

  if (state.checkpoint.charlieActive) {
    j.heldByP1 = false;
    p1.carryingJeff = false;
    j.grabbedWallSide = 0;
    j.fallingSlow = false;
    j.anchored = false;
    j.platformEntityId = null;
    return;
  }

  // --- 1. Currently Carried by P1 ---
  if (j.heldByP1) {
    // Drop Jeff cleanly if P1 entered wall-cling or Charlie pickup
    if (p1.action === 'Grab' || p1.action === 'Grabbed') {
      j.heldByP1 = false;
      p1.carryingJeff = false;
      j.tossCooldown = JEFF_TOSS_COOLDOWN;
      j.vx = p1.vx;
      j.vy = p1.vy;
      return;
    }

    j.x = p1.x + p1.facing * JEFF_CARRY_OFFSET_X;
    j.y = p1.y + JEFF_CARRY_OFFSET_Y;
    j.vx = p1.vx;
    j.vy = p1.vy;
    j.grounded = false;
    j.groundTerrain = 'DEFAULT';
    j.anchored = false;
    j.grabbedWallSide = 0;
    j.fallingSlow = false;
    j.grabTimer = PHYSICS.GRAB_JEFF_TIMER;
    j.platformEntityId = null;
    p1.carryingJeff = true;

    // Release `grab` or press `anchor` while carrying -> toss Jeff cleanly forward & upward
    if (!p1Input.grab || p1Input.anchor) {
      // Ensure toss start isn't embedded inside a wall if P1 was flush against a cliff
      const releasePos = applyCollisionConstrainedDelta(
        state,
        level,
        'jeff',
        JEFF_BOX,
        p1.x,
        p1.y,
        p1.facing * JEFF_CARRY_OFFSET_X,
        JEFF_CARRY_OFFSET_Y,
      );
      j.x = releasePos.x;
      j.y = releasePos.y;
      j.heldByP1 = false;
      p1.carryingJeff = false;
      j.tossCooldown = JEFF_TOSS_COOLDOWN;
      j.grounded = false;
      j.anchored = false;
      j.grabbedWallSide = 0;
      j.fallingSlow = false;
      j.grabTimer = PHYSICS.GRAB_JEFF_TIMER;
      j.platformEntityId = null;
      j.vx = p1.facing * JEFF_TOSS_VX + p1.vx * JEFF_TOSS_CARRY_VX_FACTOR;
      j.vy = JEFF_TOSS_VY;
    }
    return;
  }

  p1.carryingJeff = false;

  // --- 2. Pickup Check (P1 presses/holds grab near Jeff while not wall-clinging) ---
  const distToP1 = Math.hypot(p1.x - j.x, p1.y - j.y);
  if (
    j.tossCooldown <= 0 &&
    p1Input.grab &&
    !p1Input.anchor &&
    p1.action !== 'Grab' &&
    p1.action !== 'Grabbed' &&
    p1.action !== 'LandHard' &&
    p1.action !== 'PullRope' &&
    distToP1 <= JEFF_PICKUP_RANGE
  ) {
    j.heldByP1 = true;
    p1.carryingJeff = true;
    j.anchored = false;
    j.grounded = false;
    j.groundTerrain = 'DEFAULT';
    j.grabbedWallSide = 0;
    j.fallingSlow = false;
    j.grabTimer = PHYSICS.GRAB_JEFF_TIMER;
    j.platformEntityId = null;
    j.x = p1.x + p1.facing * JEFF_CARRY_OFFSET_X;
    j.y = p1.y + JEFF_CARRY_OFFSET_Y;
    j.vx = p1.vx;
    j.vy = p1.vy;
    return;
  }

  // --- 3. PullRope_Jeff (Assist Rope Reel over PULL_ROPE_TIME_JEFF = 1.5s) ---
  const pullActive = state.assist.pullingRope && (p1Input.pull || p1.action === 'PullRope');
  const p1CanReelJeff =
    pullActive &&
    (p1.grounded || p1.action === 'Anchor' || p1.action === 'Grab' || p1.action === 'PullRope');

  if (pullActive) {
    const reelSpeed =
      (PHYSICS.ROPE_MAX_DISTANCE - PHYSICS.PULL_ROPE_MIN_DIST) / PHYSICS.PULL_ROPE_TIME_JEFF;

    if (p1CanReelJeff) {
      // Un-anchor Jeff so PBD tether reels Jeff smoothly up to P1
      j.anchored = false;
      j.grabbedWallSide = 0;
      j.fallingSlow = false;
      j.platformEntityId = null;
      if (p1.action !== 'PullRope') {
        state.assistEverUsedInRun = true;
        state.rope.maxDistance = Math.max(
          PHYSICS.PULL_ROPE_MIN_DIST,
          state.rope.maxDistance - reelSpeed * dt,
        );
      }
    } else if ((j.anchored || j.grabbedWallSide !== 0) && p1.action !== 'PullRope') {
      // P1 is dangling beneath anchored/clinging Jeff and holding pull: reel P1 up toward Jeff
      state.assistEverUsedInRun = true;
      state.rope.maxDistance = Math.max(
        PHYSICS.PULL_ROPE_MIN_DIST,
        state.rope.maxDistance - reelSpeed * dt,
      );
    }
  }

  // --- 4. GrabJeffAction (Wall-Clinging State: invMass = 0 Anchor for 7.5s) ---
  if (j.grabbedWallSide !== 0) {
    // Carry Jeff if clinging to a moving grabbable entity (e.g., Troncho)
    if (j.platformEntityId) {
      const wallDelta = getDynamicEntityDelta(state, j.platformEntityId);
      if (!wallDelta || !wallDelta.exists) {
        j.grabbedWallSide = 0;
        j.platformEntityId = null;
      } else if (wallDelta.dx !== 0 || wallDelta.dy !== 0) {
        const carried = applyCollisionConstrainedDelta(
          state,
          level,
          'jeff',
          JEFF_BOX,
          j.x,
          j.y,
          wallDelta.dx,
          wallDelta.dy,
        );
        j.x = carried.x;
        j.y = carried.y;
      }
    }

    if (j.grabbedWallSide !== 0) {
      const stillThere = probeJeffWallForGrab(
        state,
        level,
        j,
        PHYSICS.GRAB_JEFF_RANGE + 0.15,
        j.grabbedWallSide,
        j.grabbedWallSide,
      );

      if (!stillThere.found) {
        j.grabbedWallSide = 0;
        j.platformEntityId = null;
      } else {
        j.platformEntityId = stillThere.entityId;
        j.vx = 0;
        j.vy = 0;
        j.grounded = false;
        j.anchored = false;
        j.fallingSlow = false;
        j.grabTimer = Math.max(0, j.grabTimer - dt);

        if (j.grabTimer <= 1e-6) {
          // Grab timer expired -> enter FallJeffAction (-2.5 u/s steady descent until grounded)
          j.grabTimer = 0;
          j.grabbedWallSide = 0;
          j.platformEntityId = null;
          j.fallingSlow = true;
          j.vx = 0;
          j.vy = -PHYSICS.GRAB_JEFF_FALL_SPEED;
        }
        return;
      }
    }
  }

  // --- 5. Moving Platform Carry (Standalone Safety without Double-Carrying after carryRiders) ---
  if (j.grounded && j.platformEntityId) {
    const delta = getDynamicEntityDelta(state, j.platformEntityId);
    if (!delta || !delta.exists) {
      j.grounded = false;
      j.platformEntityId = null;
      j.anchored = false;
    } else if (
      (delta.dx !== 0 || delta.dy !== 0) &&
      j.x === j.prevX &&
      j.y === j.prevY
    ) {
      const carried = applyCollisionConstrainedDelta(
        state,
        level,
        'jeff',
        JEFF_BOX,
        j.x,
        j.y,
        delta.dx,
        delta.dy,
      );
      j.x = carried.x;
      j.y = carried.y;
    }
  }

  // Verify grounding wasn't broken externally (e.g., by previous tick's tether pull)
  if (j.grounded) {
    const verify = probeGround(state, level, 'jeff', JEFF_BOX, j.x, j.y, j.vy, 0.08);
    if (!verify.grounded) {
      j.grounded = false;
      j.groundTerrain = 'DEFAULT';
      j.platformEntityId = null;
      j.anchored = false;
    } else {
      j.groundTerrain = verify.terrain;
      j.platformEntityId = verify.platformEntityId;
    }
  }

  const wasGrounded = j.grounded;

  // --- 6. Grounded Friction, Anchor Counterweight & Ice Wind Drift ---
  if (j.grounded) {
    j.grabTimer = PHYSICS.GRAB_JEFF_TIMER;
    j.fallingSlow = false;

    if (j.groundTerrain === 'ICE') {
      const targetIceVx = effWindX * PHYSICS.WIND_FORCE_ANCHOR_ICE;
      if (Math.abs(effWindX) > 1e-4) {
        const blend = Math.min(1, dt / PHYSICS.ICE_ACCEL_TIME);
        j.vx = j.vx + (targetIceVx - j.vx) * blend;
        if (Math.abs(j.vx - targetIceVx) < 0.01) {
          j.vx = targetIceVx;
        }
      } else {
        j.vx *= Math.exp(-3.2 * dt);
        if (Math.abs(j.vx) < 0.05) j.vx = 0;
      }
      j.anchored =
        !p1CanReelJeff &&
        (p1Input.anchor || Math.abs(j.vx) <= Math.max(0.45, Math.abs(targetIceVx) + 0.1));
    } else {
      if (p1Input.anchor && !p1CanReelJeff) {
        j.vx = 0;
      } else {
        j.vx *= Math.exp(-14 * dt);
        if (Math.abs(j.vx) < 0.1) j.vx = 0;
      }
      j.anchored = !p1CanReelJeff && (p1Input.anchor || Math.abs(j.vx) <= 0.25);
    }
  } else {
    j.anchored = false;
    if (j.fallingSlow) {
      // FallJeffAction: damped horizontal drift while descending steadily at -2.5 u/s
      j.vx *= Math.exp(-8 * dt);
      if (Math.abs(j.vx) < 0.05) j.vx = 0;
    } else if (Math.abs(effWindX) > 1e-4) {
      // Airborne wind push on tossed/falling rock
      const windAccel = effWindX * PHYSICS.WIND_FORCE_AIR * PHYSICS.WALK_SPEED * 0.45;
      const windCap = JEFF_TOSS_VX + Math.abs(effWindX) * PHYSICS.WIND_FORCE_AIR * PHYSICS.WALK_SPEED;
      const nextVx = j.vx + windAccel * dt;
      if (Math.abs(nextVx) <= windCap || Math.abs(nextVx) < Math.abs(j.vx)) {
        j.vx = nextVx;
      }
    }
  }

  // --- 7. Vertical Integration (Normal Gravity vs FallJeffAction Slow Descent) ---
  const preCollisionVx = j.vx;
  const prevVy = j.vy;
  let nextVy: number;
  let dy: number;

  if (j.fallingSlow && !j.grounded) {
    // FallJeffAction: steady -GRAB_JEFF_FALL_SPEED (-2.5 u/s) descent with GRAB_JEFF_PRECISION (0.05)
    nextVy = Math.max(-PHYSICS.GRAB_JEFF_FALL_SPEED, prevVy + PHYSICS.EFFECTIVE_GRAVITY_Y * dt);
    if (prevVy <= -PHYSICS.GRAB_JEFF_FALL_SPEED + PHYSICS.GRAB_JEFF_PRECISION) {
      nextVy = -PHYSICS.GRAB_JEFF_FALL_SPEED;
    }
    dy = nextVy * dt;
  } else {
    nextVy = prevVy + PHYSICS.EFFECTIVE_GRAVITY_Y * dt;
    if (nextVy < -MAX_FALL_SPEED) {
      nextVy = -MAX_FALL_SPEED;
    }
    dy = (prevVy + nextVy) * 0.5 * dt;
  }

  const dx = j.vx * dt;

  // --- 8. Swept AABB Collision ---
  const res = moveAndCollide(
    state,
    level,
    'jeff',
    JEFF_BOX,
    j.x,
    j.y,
    dx,
    dy,
    j.vx,
    nextVy,
    wasGrounded,
  );

  j.x = res.x;
  j.y = res.y;
  j.vx = res.vx;
  j.vy = res.vy;
  j.grounded = res.grounded;
  j.groundTerrain = res.grounded ? res.groundTerrain : 'DEFAULT';
  j.platformEntityId = res.grounded ? res.platformEntityId : null;

  // Precision landing snap during FallJeffAction (`GRAB_JEFF_PRECISION = 0.05`)
  if (!j.grounded && j.fallingSlow && j.vy <= 0) {
    const snapProbe = probeGround(
      state,
      level,
      'jeff',
      JEFF_BOX,
      j.x,
      j.y,
      j.vy,
      PHYSICS.GRAB_JEFF_PRECISION,
    );
    if (snapProbe.grounded) {
      j.y = snapProbe.surfaceY - getFeetOffsetY(JEFF_BOX);
      j.vy = 0;
      j.grounded = true;
      j.groundTerrain = snapProbe.terrain;
      j.platformEntityId = snapProbe.platformEntityId;
    }
  }

  // --- 9. Landing Transition & Event ---
  if (!wasGrounded && j.grounded) {
    j.fallingSlow = false;
    j.grabTimer = PHYSICS.GRAB_JEFF_TIMER;
    j.grabbedWallSide = 0;
    if (j.groundTerrain === 'ICE') {
      j.vx *= 0.85;
      j.anchored = !p1CanReelJeff && (p1Input.anchor || Math.abs(j.vx) <= 0.6);
    } else {
      j.vx *= 0.3;
      if (Math.abs(j.vx) < 0.15) j.vx = 0;
      j.anchored = !p1CanReelJeff;
    }

    state.events.push({
      type: 'land',
      who: 'jeff',
      x: j.x,
      y: j.y,
      terrain: j.groundTerrain,
      impactVy: Math.abs(res.impactVy || prevVy),
    });
    return;
  }

  // --- 10. Airborne Wall-Stick Check (`GrabJeffAction`) ---
  if (!j.grounded && !p1CanReelJeff) {
    tryStickJeffToWall(
      state,
      level,
      j,
      res.hitWallLeft,
      res.hitWallRight,
      preCollisionVx,
      prevVy,
    );
  }
}
