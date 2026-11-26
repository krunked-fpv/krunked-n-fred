import {
  PenguinFlag,
  PHYSICS,
  type JeffState,
  type LevelData,
  type PenguinState,
  type PlayerInput,
  type SimState,
  type Vec2,
  type WindSample,
} from '../contracts';
import { addCameraShake } from './camera';
import {
  applyCollisionConstrainedDelta,
  getDynamicEntityDelta,
  JEFF_BOX,
  moveAndCollide,
  PENGUIN_BOX,
  probeGround,
  probeWallForGrab,
} from './collision';

const SCARF_NODE_COUNT = 5;
const SCARF_SEG_LEN = 0.14;
const MAX_FALL_SPEED = 32.0;
const FOOTSTEP_STRIDE = 0.92;

export function smoothStep01(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

export function clampWindStrength(strength: number): number {
  if (strength <= 0) return 0;
  return strength > 2.0 ? 2.0 : strength;
}

export function createScarfNodes(x: number, y: number, facing: 1 | -1): Vec2[] {
  const nodes: Vec2[] = [];
  for (let i = 0; i < SCARF_NODE_COUNT; i++) {
    nodes.push({
      x: x - facing * (0.14 + i * SCARF_SEG_LEN),
      y: y - 0.04,
    });
  }
  return nodes;
}

export function resetScarfNodes(p: PenguinState): void {
  if (p.scarfNodes.length !== SCARF_NODE_COUNT) {
    p.scarfNodes = createScarfNodes(p.x, p.y, p.facing);
    return;
  }
  for (let i = 0; i < SCARF_NODE_COUNT; i++) {
    p.scarfNodes[i].x = p.x - p.facing * (0.14 + i * SCARF_SEG_LEN);
    p.scarfNodes[i].y = p.y - 0.04;
  }
}

export function createPenguinState(
  id: 'p1' | 'p2',
  x: number,
  y: number,
  betterGrab = false,
): PenguinState {
  const maxStamina = betterGrab ? PHYSICS.GRAB_TIMER_BETTER : PHYSICS.GRAB_TIMER;
  const facing: 1 | -1 = id === 'p1' ? 1 : -1;
  return {
    id,
    x,
    y,
    prevX: x,
    prevY: y,
    vx: 0,
    vy: 0,
    facing,
    action: 'Idle',
    flags: PenguinFlag.None,
    grounded: false,
    groundTerrain: 'DEFAULT',
    wallSide: 0,
    wallTerrain: 'DEFAULT',
    wallEntityId: null,
    platformEntityId: null,
    coyoteTimer: 0,
    jumpCooldown: 0,
    jumpBufferTimer: 0,
    fallTimer: 0,
    landHardTimer: 0,
    grabStamina: maxStamina,
    grabMaxStamina: maxStamina,
    grabRedTint: 0,
    swingTimer: 0,
    swingRestTimer: 0,
    swingFallTimer: 0,
    swingAdditive: 0,
    swingAngleDeg: 0,
    dragForce: 0,
    dragNoWallTimer: 0,
    iceVelX: 0,
    iceLerpT: 1,
    pullRopeTimer: 0,
    callCharlieTimer: 0,
    emote: 'none',
    emoteTimer: 0,
    animTime: 0,
    scarfNodes: createScarfNodes(x, y, facing),
    carryingJeff: false,
    jumpsUsed: 0,
    stepDistAccum: 0,
    lastJumpHeld: false,
  };
}

export function createJeffState(active: boolean, x: number, y: number): JeffState {
  return {
    active,
    x,
    y,
    prevX: x,
    prevY: y,
    vx: 0,
    vy: 0,
    grounded: false,
    groundTerrain: 'DEFAULT',
    heldByP1: false,
    grabbedWallSide: 0,
    grabTimer: PHYSICS.GRAB_JEFF_TIMER,
    fallingSlow: false,
    anchored: false,
    platformEntityId: null,
    tossCooldown: 0,
  };
}

/**
 * Simulates the 5-node trailing/flapping scarf behind a penguin.
 */
export function updateScarf(p: PenguinState, wind: WindSample, dt: number): void {
  const nodes = p.scarfNodes;
  if (nodes.length !== SCARF_NODE_COUNT) {
    resetScarfNodes(p);
    return;
  }

  // Anchor node 0 at the penguin's neck
  nodes[0].x = p.x - p.facing * 0.12;
  nodes[0].y = p.y - 0.04;

  const windForceX = wind.active ? wind.dir * clampWindStrength(wind.strength) * 2.2 : 0;
  const trailDirX = Math.abs(p.vx) > 0.3 ? -Math.sign(p.vx) : -p.facing;

  for (let i = 1; i < SCARF_NODE_COUNT; i++) {
    const prev = nodes[i - 1];
    const curr = nodes[i];

    const wave = Math.sin(p.animTime * 11.5 - i * 1.15) * (0.04 + (wind.active ? 0.05 : 0));
    const targetX = prev.x + (trailDirX * 0.9 + windForceX * 0.35) * SCARF_SEG_LEN;
    const targetY = prev.y - 0.025 + wave - Math.max(-0.08, Math.min(0.08, p.vy * 0.008));

    const blend = Math.min(1, 18 * dt);
    curr.x += (targetX - curr.x) * blend;
    curr.y += (targetY - curr.y) * blend;

    // Enforce exact scarf segment length
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const d = Math.hypot(dx, dy);
    if (d > 1e-5) {
      curr.x = prev.x + (dx / d) * SCARF_SEG_LEN;
      curr.y = prev.y + (dy / d) * SCARF_SEG_LEN;
    }
  }
}

/**
 * Exact incremental SmoothStep velocity convergence over `durationSec`.
 * Mathematically equivalent to `lerp(vStart, targetVx, SmoothStep(t))` without requiring a separate start velocity field.
 */
export function applySmoothStepHorizontal(
  p: PenguinState,
  targetVx: number,
  durationSec: number,
  dt: number,
): void {
  if (Math.abs(targetVx - p.iceVelX) > 0.02) {
    p.iceVelX = targetVx;
    p.iceLerpT = 0;
  }

  const prevT = p.iceLerpT;
  const nextT = Math.min(1, prevT + dt / Math.max(0.01, durationSec));
  p.iceLerpT = nextT;

  const sPrev = smoothStep01(prevT);
  const sNext = smoothStep01(nextT);
  const rem = 1 - sPrev;
  const frac = rem > 1e-5 ? (sNext - sPrev) / rem : 1;

  p.vx = p.vx + (targetVx - p.vx) * frac;
}

/**
 * Applies grounded/ice/air horizontal control + wind forces for normal movement states.
 */
export function applyStandardHorizontalPhysics(
  p: PenguinState,
  moveX: number,
  wind: WindSample,
  dt: number,
): void {
  const effWind = wind.active ? clampWindStrength(wind.strength) : 0;
  const onIce = (p.flags & PenguinFlag.OnIce) !== 0;

  if (p.grounded) {
    const windVel =
      effWind > 0
        ? wind.dir *
          (onIce ? PHYSICS.WIND_FORCE_ICE : PHYSICS.WIND_FORCE_GROUND) *
          PHYSICS.WALK_SPEED *
          effWind
        : 0;
    const targetVx = moveX * PHYSICS.WALK_SPEED + windVel;

    if (onIce) {
      applySmoothStepHorizontal(p, targetVx, PHYSICS.ICE_ACCEL_TIME, dt);
    } else {
      p.vx = targetVx;
      p.iceVelX = targetVx;
      p.iceLerpT = 1;
    }
    return;
  }

  // Airborne horizontal control (preserves high swing-launch momentum cleanly!)
  const desiredWalkVx = moveX * PHYSICS.WALK_SPEED;
  const absVx = Math.abs(p.vx);

  if (moveX === 0) {
    if (absVx > PHYSICS.WALK_SPEED) {
      // Preserve swing-launch momentum with very gentle air resistance
      p.vx *= Math.exp(-0.55 * dt);
    } else {
      applySmoothStepHorizontal(p, 0, PHYSICS.ICE_AIR_ACCEL_TIME * 2.0, dt);
    }
  } else {
    const pushingWithMomentum = Math.sign(moveX) === Math.sign(p.vx) && absVx > PHYSICS.WALK_SPEED;
    if (pushingWithMomentum) {
      // Never cap or drag down an active swing launch when holding in launch direction
      p.vx *= Math.exp(-0.25 * dt);
    } else if (absVx > PHYSICS.WALK_SPEED) {
      // Mid-air counter-steering from high launch speed
      const brakeDelta = (PHYSICS.WALK_SPEED / PHYSICS.ICE_AIR_ACCEL_TIME) * dt;
      p.vx += Math.sign(desiredWalkVx - p.vx) * Math.min(Math.abs(desiredWalkVx - p.vx), brakeDelta);
    } else {
      applySmoothStepHorizontal(p, desiredWalkVx, PHYSICS.ICE_AIR_ACCEL_TIME, dt);
    }
  }

  // Airborne wind push (`WIND_FORCE_AIR = 1.4`)
  if (effWind > 0) {
    const windAccel = wind.dir * PHYSICS.WIND_FORCE_AIR * PHYSICS.WALK_SPEED * 2.0 * effWind;
    const windCap = PHYSICS.WALK_SPEED + PHYSICS.WIND_FORCE_AIR * PHYSICS.WALK_SPEED * effWind;
    const nextVx = p.vx + windAccel * dt;
    if (Math.abs(nextVx) <= windCap || Math.abs(nextVx) < Math.abs(p.vx)) {
      p.vx = nextVx;
    }
  }
}

/**
 * Carries grounded riders on moving/swing platforms & tronchos, and wall-clinging riders on moving tronchos.
 */
export function carryRiders(state: SimState, level: LevelData): void {
  if (state.checkpoint.charlieActive) return;

  const penguins: PenguinState[] =
    state.mode === 'solo_jeff' && state.jeff.active ? [state.p1] : [state.p1, state.p2];

  for (let i = 0; i < penguins.length; i++) {
    const p = penguins[i];

    if (p.action === 'Grab' && p.wallEntityId) {
      const delta = getDynamicEntityDelta(state, p.wallEntityId);
      if (!delta || !delta.exists) {
        p.action = 'Fall';
        p.wallSide = 0;
        p.wallEntityId = null;
        p.grabRedTint = 0;
      } else if (delta.dx !== 0 || delta.dy !== 0) {
        const res = applyCollisionConstrainedDelta(
          state,
          level,
          p.id,
          PENGUIN_BOX,
          p.x,
          p.y,
          delta.dx,
          delta.dy,
        );
        p.x = res.x;
        p.y = res.y;
      }
      continue;
    }

    if (p.grounded && p.platformEntityId) {
      const delta = getDynamicEntityDelta(state, p.platformEntityId);
      if (!delta || !delta.exists) {
        p.grounded = false;
        p.platformEntityId = null;
        if (p.action === 'Anchor' || p.action === 'Idle' || p.action === 'Walk' || p.action === 'Drag') {
          p.action = 'Fall';
        }
      } else if (delta.dx !== 0 || delta.dy !== 0) {
        const res = applyCollisionConstrainedDelta(
          state,
          level,
          p.id,
          PENGUIN_BOX,
          p.x,
          p.y,
          delta.dx,
          delta.dy,
        );
        p.x = res.x;
        p.y = res.y;
      }
    }
  }

  // Carry Jeff if standing on a moving platform
  if (state.mode === 'solo_jeff' && state.jeff.active && !state.jeff.heldByP1) {
    const j = state.jeff;
    if (j.grounded && j.platformEntityId) {
      const delta = getDynamicEntityDelta(state, j.platformEntityId);
      if (!delta || !delta.exists) {
        j.grounded = false;
        j.platformEntityId = null;
        j.anchored = false;
      } else if (delta.dx !== 0 || delta.dy !== 0) {
        const res = applyCollisionConstrainedDelta(
          state,
          level,
          'jeff',
          JEFF_BOX,
          j.x,
          j.y,
          delta.dx,
          delta.dy,
        );
        j.x = res.x;
        j.y = res.y;
      }
    }
  }
}

/**
 * Integrates penguin velocity & position with exact midpoint gravity and swept AABB collision.
 * Emits `land`, `land_hard`, and `footstep` events cleanly.
 */
export function integratePenguin(
  state: SimState,
  level: LevelData,
  p: PenguinState,
  wind: WindSample,
  dt: number,
): void {
  if (p.action === 'Grabbed') {
    return;
  }

  // Clinging to wall (or pulling rope while clinging): position locked to wall (carried by carryRiders)
  if (p.action === 'Grab' || (p.action === 'PullRope' && p.wallSide !== 0)) {
    p.vx = 0;
    p.vy = 0;
    p.grounded = false;
    p.flags = wind.active ? PenguinFlag.OnWind : PenguinFlag.None;
    return;
  }

  const wasGrounded = p.grounded;
  const preLandAction = p.action;
  const preFallTimer = p.fallTimer;
  const startX = p.x;

  // Apply gravity using midpoint vertical integration so discrete jump apex hits
  // PHYSICS.PEAK_JUMP_HEIGHT = (18^2) / (2 * 49.05) = 3.30275 u accurately.
  const prevVy = p.vy;
  let nextVy = prevVy + PHYSICS.EFFECTIVE_GRAVITY_Y * dt;
  if (nextVy < -MAX_FALL_SPEED) {
    nextVy = -MAX_FALL_SPEED;
  }
  const dy = (prevVy + nextVy) * 0.5 * dt;
  const dx = p.vx * dt;

  const res = moveAndCollide(
    state,
    level,
    p.id,
    PENGUIN_BOX,
    p.x,
    p.y,
    dx,
    dy,
    p.vx,
    nextVy,
    wasGrounded,
  );

  p.x = res.x;
  p.y = res.y;
  p.vx = res.vx;
  p.vy = res.vy;
  p.grounded = res.grounded;
  p.groundTerrain = res.grounded ? res.groundTerrain : 'DEFAULT';
  p.platformEntityId = res.grounded ? res.platformEntityId : null;

  // Rebuild PenguinFlag bitmask
  let flags = PenguinFlag.None;
  if (p.action === 'LandHard' || p.action === 'Anchor' || p.action === 'PullRope') {
    flags |= PenguinFlag.Immobile;
  }
  if (res.onMovable) flags |= PenguinFlag.OnMovablePlatform;
  if (wind.active) flags |= PenguinFlag.OnWind;
  if (res.onIce) flags |= PenguinFlag.OnIce;
  if (res.onDestructible) flags |= PenguinFlag.OnDestructableBlock;
  if (res.onSlope) flags |= PenguinFlag.OnSlope;
  p.flags = flags;

  // Landing transitions & events
  if (!wasGrounded && p.grounded) {
    const fallHardThreshold = state.isOnline
      ? PHYSICS.FALL_HARD_TIME_ONLINE
      : PHYSICS.FALL_HARD_TIME;
    const isHardLanding = preLandAction === 'FallHard' || preFallTimer >= fallHardThreshold;

    p.fallTimer = 0;
    p.jumpsUsed = 0;
    p.coyoteTimer = PHYSICS.COYOTE_TIME;
    p.swingAngleDeg = 0;
    p.swingTimer = 0;
    p.swingRestTimer = 0;
    p.swingFallTimer = 0;
    p.swingAdditive = 0;
    p.grabStamina = p.grabMaxStamina;
    p.grabRedTint = 0;

    if (isHardLanding) {
      p.action = 'LandHard';
      p.landHardTimer = PHYSICS.LAND_HARD_STUN_TIME;
      p.vx *= 0.2;
      p.flags |= PenguinFlag.Immobile;
      state.fallsCount += 1;
      addCameraShake(state.camera, 0.28, 0.24);
      state.events.push({
        type: 'land_hard',
        who: p.id,
        x: p.x,
        y: p.y,
        terrain: p.groundTerrain,
      });
    } else {
      if (
        p.action === 'Fall' ||
        p.action === 'Jump' ||
        p.action === 'Swing' ||
        p.action === 'FallHard'
      ) {
        p.action = Math.abs(p.vx) > 0.2 ? 'Walk' : 'Idle';
      }
      state.events.push({
        type: 'land',
        who: p.id,
        x: p.x,
        y: p.y,
        terrain: p.groundTerrain,
        impactVy: Math.abs(res.impactVy || prevVy),
      });
    }
  } else if (p.grounded) {
    // Grounded footsteps while walking
    p.grabStamina = p.grabMaxStamina;
    p.grabRedTint = 0;
    p.coyoteTimer = PHYSICS.COYOTE_TIME;
    p.jumpsUsed = 0;

    const movedX = Math.abs(p.x - startX);
    if (p.action === 'Walk' && movedX > 0.005) {
      p.stepDistAccum += movedX;
      if (p.stepDistAccum >= FOOTSTEP_STRIDE) {
        p.stepDistAccum -= FOOTSTEP_STRIDE;
        state.events.push({
          type: 'footstep',
          who: p.id,
          x: p.x,
          y: p.y,
          terrain: p.groundTerrain,
        });
      }
    } else {
      p.stepDistAccum = 0;
    }
  }
}

/**
 * Re-checks ground contact after `solveTetherConstraint` so rope pulls onto/off floors
 * keep `grounded` and `flags` consistent on the very same tick.
 */
export function refreshPostTetherGrounding(
  state: SimState,
  level: LevelData,
  p: PenguinState,
): void {
  if (p.action === 'Grab' || p.action === 'Grabbed' || (p.action === 'PullRope' && p.wallSide !== 0)) {
    return;
  }
  const probe = probeGround(state, level, p.id, PENGUIN_BOX, p.x, p.y, p.vy, 0.06);
  p.grounded = probe.grounded;
  if (probe.grounded) {
    p.groundTerrain = probe.terrain;
    p.platformEntityId = probe.platformEntityId;
    if (probe.onIce) p.flags |= PenguinFlag.OnIce;
    else p.flags &= ~PenguinFlag.OnIce;
    if (probe.onMovable) p.flags |= PenguinFlag.OnMovablePlatform;
    else p.flags &= ~PenguinFlag.OnMovablePlatform;
    if (probe.onDestructible) p.flags |= PenguinFlag.OnDestructableBlock;
    else p.flags &= ~PenguinFlag.OnDestructableBlock;
    if (probe.onSlope) p.flags |= PenguinFlag.OnSlope;
    else p.flags &= ~PenguinFlag.OnSlope;
  } else {
    p.groundTerrain = 'DEFAULT';
    p.platformEntityId = null;
    p.flags &= ~(
      PenguinFlag.OnIce |
      PenguinFlag.OnMovablePlatform |
      PenguinFlag.OnDestructableBlock |
      PenguinFlag.OnSlope
    );
  }
}

/**
 * Solo mode Jeff rock companion physics: carry, toss, slow-fall, wall-grab, and ground anchor.
 */
export function updateJeff(
  state: SimState,
  level: LevelData,
  p1Input: PlayerInput,
  wind: WindSample,
  dt: number,
): void {
  const j = state.jeff;
  if (!j.active) return;

  const p1 = state.p1;
  j.tossCooldown = Math.max(0, j.tossCooldown - dt);

  // Pick up or toss Jeff when P1 presses anchor/grab while near Jeff
  if (j.heldByP1) {
    j.x = p1.x;
    j.y = p1.y + 0.62;
    j.vx = p1.vx;
    j.vy = p1.vy;
    j.grounded = false;
    j.anchored = false;
    j.grabbedWallSide = 0;
    j.platformEntityId = null;
    p1.carryingJeff = true;

    // Release / toss Jeff on anchor or grab release
    if (j.tossCooldown <= 0 && (p1Input.anchor || !p1Input.grab)) {
      j.heldByP1 = false;
      p1.carryingJeff = false;
      j.tossCooldown = 0.25;
      j.vx = p1.facing * 7.5 + p1.vx * 0.4;
      j.vy = 10.5;
    }
    return;
  }

  p1.carryingJeff = false;

  // Check if P1 grabs Jeff when close and not grabbing a wall
  if (
    j.tossCooldown <= 0 &&
    p1Input.grab &&
    p1.action !== 'Grab' &&
    Math.hypot(p1.x - j.x, p1.y - j.y) <= PHYSICS.GRAB_JEFF_RANGE + 0.2
  ) {
    const wall = probeWallForGrab(
      state,
      level,
      p1,
      state.assist.betterGrab ? PHYSICS.GRAB_RANGE_BETTER : PHYSICS.GRAB_RANGE,
    );
    if (!wall.found) {
      j.heldByP1 = true;
      j.anchored = false;
      j.grabbedWallSide = 0;
      j.tossCooldown = 0.2;
      p1.carryingJeff = true;
      return;
    }
  }

  // Wall-clinging Jeff countdown
  if (j.grabbedWallSide !== 0) {
    j.vx = 0;
    j.vy = 0;
    j.grabTimer = Math.max(0, j.grabTimer - dt);
    if (j.grabTimer <= 0) {
      j.grabbedWallSide = 0;
    }
    return;
  }

  const wasGrounded = j.grounded;
  if (j.grounded) {
    j.vx *= Math.exp(-12 * dt);
    if (Math.abs(j.vx) < 0.08) j.vx = 0;
    j.anchored = Math.abs(j.vx) < 0.15;
    j.grabTimer = PHYSICS.GRAB_JEFF_TIMER;
    if (wind.active && j.groundTerrain === 'ICE') {
      j.vx += wind.dir * PHYSICS.WIND_FORCE_ANCHOR_ICE * clampWindStrength(wind.strength) * dt;
    }
  } else {
    j.anchored = false;
  }

  const prevVy = j.vy;
  let nextVy = prevVy + PHYSICS.EFFECTIVE_GRAVITY_Y * dt;
  const maxFall = j.fallingSlow ? PHYSICS.GRAB_JEFF_FALL_SPEED : MAX_FALL_SPEED;
  if (nextVy < -maxFall) nextVy = -maxFall;
  const dy = (prevVy + nextVy) * 0.5 * dt;
  const dx = j.vx * dt;

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

  if (!wasGrounded && j.grounded) {
    j.anchored = true;
    state.events.push({
      type: 'land',
      who: 'jeff',
      x: j.x,
      y: j.y,
      terrain: j.groundTerrain,
      impactVy: Math.abs(res.impactVy || prevVy),
    });
  }
}
