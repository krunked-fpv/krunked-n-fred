import {
  PHYSICS,
  type LevelData,
  type PenguinState,
  type SimState,
  type TronchoState,
} from '../contracts';
import { addCameraShake } from './camera';

const EPS = 1e-6;

const PENGUIN_HALF_W = PHYSICS.PENGUIN_BOX_W * 0.5;
const PENGUIN_FEET_OFFSET_Y = PHYSICS.PENGUIN_BOX_OFFSET_Y - PHYSICS.PENGUIN_BOX_H * 0.5;
const PENGUIN_TOP_OFFSET_Y = PHYSICS.PENGUIN_BOX_OFFSET_Y + PHYSICS.PENGUIN_BOX_H * 0.5;

const JEFF_HALF_W = PHYSICS.JEFF_BOX_W * 0.5;
const JEFF_FEET_OFFSET_Y = PHYSICS.JEFF_BOX_OFFSET_Y - PHYSICS.JEFF_BOX_H * 0.5;
const JEFF_TOP_OFFSET_Y = PHYSICS.JEFF_BOX_OFFSET_Y + PHYSICS.JEFF_BOX_H * 0.5;

const TRONCHO_EXTEND_SPEED = 4.5; // t units / sec
const TRONCHO_RETRACT_SPEED = 2.0; // t units / sec
const TRONCHO_MIN_LAUNCH_VY = 2.0;
const TRONCHO_MIN_LAUNCH_IMPULSE = 18.0;

const LASER_COOLDOWN_SEC = 0.65;
const LASER_BEAM_RADIUS = 0.1;
const BUTTON_FOOT_TOLERANCE = 0.08;

export interface RectBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Exact Liang-Barsky line segment vs AABB intersection test (pure, deterministic).
 */
export function segmentIntersectsAABB(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  box: RectBounds,
  pad = 0,
): boolean {
  const minX = box.minX - pad;
  const maxX = box.maxX + pad;
  const minY = box.minY - pad;
  const maxY = box.maxY + pad;

  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;

  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-9) {
      return q >= 0;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };

  if (
    clip(-dx, x1 - minX) &&
    clip(dx, maxX - x1) &&
    clip(-dy, y1 - minY) &&
    clip(dy, maxY - y1)
  ) {
    return t1 >= t0;
  }
  return false;
}

function getPenguinRect(p: PenguinState): RectBounds {
  const cx = p.x + PHYSICS.PENGUIN_BOX_OFFSET_X;
  return {
    minX: cx - PENGUIN_HALF_W,
    maxX: cx + PENGUIN_HALF_W,
    minY: p.y + PENGUIN_FEET_OFFSET_Y,
    maxY: p.y + PENGUIN_TOP_OFFSET_Y,
  };
}

function overlapsButton(
  actor: RectBounds,
  btnX: number,
  btnY: number,
  btnW: number,
  btnH: number,
): boolean {
  const effH = Math.max(btnH, 0.4);
  return (
    actor.maxX > btnX &&
    actor.minX < btnX + btnW &&
    actor.maxY >= btnY - BUTTON_FOOT_TOLERANCE &&
    actor.minY <= btnY + effH
  );
}

function isAnyActorOnButton(
  state: SimState,
  btnX: number,
  btnY: number,
  btnW: number,
  btnH: number,
): boolean {
  if (overlapsButton(getPenguinRect(state.p1), btnX, btnY, btnW, btnH)) {
    return true;
  }
  if (
    state.mode !== 'solo_jeff' &&
    overlapsButton(getPenguinRect(state.p2), btnX, btnY, btnW, btnH)
  ) {
    return true;
  }
  const j = state.jeff;
  if (j.active && !j.heldByP1) {
    const jx = j.x + PHYSICS.JEFF_BOX_OFFSET_X;
    const jeffRect: RectBounds = {
      minX: jx - JEFF_HALF_W,
      maxX: jx + JEFF_HALF_W,
      minY: j.y + JEFF_FEET_OFFSET_Y,
      maxY: j.y + JEFF_TOP_OFFSET_Y,
    };
    if (overlapsButton(jeffRect, btnX, btnY, btnW, btnH)) {
      return true;
    }
  }
  return false;
}

function isPenguinStandingOnTroncho(
  p: PenguinState,
  tr: TronchoState,
  prevX: number,
  prevY: number,
  nextX: number,
  nextY: number,
): boolean {
  if (p.action === 'Grab' || p.action === 'Grabbed') {
    return false;
  }
  if (p.grounded && p.platformEntityId === tr.id) {
    return true;
  }

  const minX = Math.min(prevX, nextX);
  const maxX = Math.max(prevX, nextX) + tr.w;
  if (p.x + PENGUIN_HALF_W <= minX || p.x - PENGUIN_HALF_W >= maxX) {
    return false;
  }

  const feetY = p.y + PENGUIN_FEET_OFFSET_Y;
  const prevTopY = prevY + tr.h;
  const nextTopY = nextY + tr.h;
  const loTop = Math.min(prevTopY, nextTopY) - 0.18;
  const hiTop = Math.max(prevTopY, nextTopY) + 0.18;

  return feetY >= loTop && feetY <= hiTop && p.vy <= tr.vy + 2.0;
}

function applyLaserKnockback(
  state: SimState,
  p: PenguinState,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  laserId: string,
): void {
  const segDx = x2 - x1;
  const segDy = y2 - y1;
  const segLenSq = segDx * segDx + segDy * segDy;

  let nx = 0;
  let ny = 1;
  if (segLenSq > EPS) {
    const tRaw = ((p.x - x1) * segDx + (p.y - y1) * segDy) / segLenSq;
    const t = tRaw < 0 ? 0 : tRaw > 1 ? 1 : tRaw;
    const closestX = x1 + segDx * t;
    const closestY = y1 + segDy * t;
    const offX = p.x - closestX;
    const offY = p.y - closestY;
    const dist = Math.hypot(offX, offY);
    if (dist > 0.02) {
      nx = offX / dist;
      ny = offY / dist;
    } else if (Math.abs(segDx) < Math.abs(segDy)) {
      nx = p.vx > 0.1 ? -1 : p.vx < -0.1 ? 1 : -p.facing;
      ny = 0.45;
    } else {
      nx = -p.facing * 0.5;
      ny = p.vy < 0 ? 1 : -0.8;
    }
  }

  if (Math.abs(segDx) < Math.abs(segDy) * 0.5) {
    // Vertical laser gate: crisp horizontal repel + small hop
    const pushSign = nx >= 0 ? 1 : -1;
    p.vx = pushSign * 9.5;
    p.vy = Math.max(p.vy, 6.8);
  } else if (Math.abs(segDy) < Math.abs(segDx) * 0.5) {
    // Horizontal laser beam: clear vertical knock + slight lateral shove
    const lateral = nx !== 0 ? Math.sign(nx) : -p.facing;
    p.vx = lateral * 5.5;
    p.vy = ny >= 0 ? 8.5 : -6.0;
  } else {
    // Diagonal beam: push along normal
    const nLen = Math.hypot(nx, ny) || 1;
    p.vx = (nx / nLen) * 9.5;
    p.vy = Math.max(5.8, (ny / nLen) * 9.5);
  }

  p.grounded = false;
  p.platformEntityId = null;
  p.wallSide = 0;
  p.wallEntityId = null;
  p.wallTerrain = 'DEFAULT';
  p.grabRedTint = 0;
  p.coyoteTimer = 0;
  p.fallTimer = 0;
  p.dragForce = 0;
  p.dragNoWallTimer = 0;
  p.swingAngleDeg = 0;
  p.action = 'Fall';

  addCameraShake(state.camera, 0.22, 0.22);
  state.events.push({
    type: 'laser_zap',
    id: laserId,
    who: p.id,
    x: p.x,
    y: p.y,
  });
}

/**
 * Deterministic Laboratory circuit engine: evaluates buttons (switch / pressure / timed),
 * propagates circuit power, updates colorPlatforms, pneumatic Troncho pistons (including
 * upward launch impulse >= 18.0 u/s), and active Laser beams with knockback & cooldown.
 */
export function updateCircuits(state: SimState, _level: LevelData, dt: number): void {
  if (
    state.buttons.length === 0 &&
    state.circuits.length === 0 &&
    state.colorPlatforms.length === 0 &&
    state.tronchos.length === 0 &&
    state.lasers.length === 0
  ) {
    return;
  }

  // 1. Evaluate circuit buttons (switch / pressure / timed)
  const changedButtonIndices: number[] = [];
  for (let i = 0; i < state.buttons.length; i++) {
    const btn = state.buttons[i];
    const prevPressed = btn.pressed;
    const stepped = isAnyActorOnButton(state, btn.x, btn.y, btn.w, btn.h);

    if (btn.kind === 'switch') {
      if (stepped && !btn.wasStepped) {
        btn.pressed = !btn.pressed;
      }
    } else if (btn.kind === 'pressure') {
      btn.pressed = stepped;
    } else {
      // 'timed'
      if (stepped) {
        btn.pressed = true;
        btn.timer = Math.max(0.02, btn.duration);
      } else if (btn.pressed) {
        btn.timer = Math.max(0, btn.timer - dt);
        if (btn.timer <= EPS) {
          btn.timer = 0;
          btn.pressed = false;
        }
      }
    }

    btn.wasStepped = stepped;
    if (btn.pressed !== prevPressed) {
      changedButtonIndices.push(i);
    }
  }

  // 2. Propagate power to circuits (OR across all buttons bound to circuitId)
  const poweredByCircuit = new Map<string, boolean>();
  for (let i = 0; i < state.buttons.length; i++) {
    const btn = state.buttons[i];
    if (btn.pressed) {
      poweredByCircuit.set(btn.circuitId, true);
    } else if (!poweredByCircuit.has(btn.circuitId)) {
      poweredByCircuit.set(btn.circuitId, false);
    }
  }

  for (let i = 0; i < state.circuits.length; i++) {
    const c = state.circuits[i];
    c.powered = poweredByCircuit.get(c.id) ?? false;
  }

  // Emit button_press events with resolved circuit power state
  for (let k = 0; k < changedButtonIndices.length; k++) {
    const btn = state.buttons[changedButtonIndices[k]];
    state.events.push({
      type: 'button_press',
      id: btn.id,
      circuitId: btn.circuitId,
      powered: poweredByCircuit.get(btn.circuitId) ?? btn.pressed,
      x: btn.x,
      y: btn.y,
    });
  }

  // 3. Update owner-exclusive ColorPlatforms
  for (let i = 0; i < state.colorPlatforms.length; i++) {
    const cp = state.colorPlatforms[i];
    const nextActive = cp.circuitId ? (poweredByCircuit.get(cp.circuitId) ?? false) : true;
    cp.active = nextActive;
    if (!nextActive) {
      if (state.p1.platformEntityId === cp.id) {
        state.p1.platformEntityId = null;
        state.p1.grounded = false;
      }
      if (state.p2.platformEntityId === cp.id) {
        state.p2.platformEntityId = null;
        state.p2.grounded = false;
      }
      if (state.jeff.platformEntityId === cp.id) {
        state.jeff.platformEntityId = null;
        state.jeff.grounded = false;
      }
    }
  }

  // 4. Update pneumatic Troncho pistons & upward launches
  const activePenguins: PenguinState[] =
    state.mode === 'solo_jeff' && state.jeff.active ? [state.p1] : [state.p1, state.p2];

  for (let i = 0; i < state.tronchos.length; i++) {
    const tr = state.tronchos[i];
    const prevX = tr.x;
    const prevY = tr.y;
    tr.prevX = prevX;
    tr.prevY = prevY;

    const powered = tr.circuitId ? (poweredByCircuit.get(tr.circuitId) ?? false) : false;
    const targetT = powered ? 1 : 0;

    if (targetT > tr.t) {
      tr.t = Math.min(1, tr.t + TRONCHO_EXTEND_SPEED * dt);
    } else if (targetT < tr.t) {
      tr.t = Math.max(0, tr.t - TRONCHO_RETRACT_SPEED * dt);
    }

    const nextX = tr.baseX + (tr.extX - tr.baseX) * tr.t;
    const nextY = tr.baseY + (tr.extY - tr.baseY) * tr.t;
    tr.vx = dt > 0 ? (nextX - prevX) / dt : 0;
    tr.vy = dt > 0 ? (nextY - prevY) / dt : 0;
    tr.x = nextX;
    tr.y = nextY;
    tr.extended = tr.t >= 0.98;

    // Rapid upward extension launches riders standing on top!
    if (tr.vy > TRONCHO_MIN_LAUNCH_VY) {
      const launchVel = Math.max(TRONCHO_MIN_LAUNCH_IMPULSE, tr.launchImpulse);
      const newTopY = nextY + tr.h;

      for (let pIdx = 0; pIdx < activePenguins.length; pIdx++) {
        const p = activePenguins[pIdx];
        if (
          p.vy < launchVel * 0.6 &&
          isPenguinStandingOnTroncho(p, tr, prevX, prevY, nextX, nextY)
        ) {
          p.y = Math.max(p.y, newTopY - PENGUIN_FEET_OFFSET_Y + 0.02);
          p.vy = Math.max(p.vy, launchVel);
          if (Math.abs(tr.vx) > 0.5) {
            p.vx += tr.vx * 0.4;
          }
          p.grounded = false;
          p.platformEntityId = null;
          p.coyoteTimer = 0;
          p.fallTimer = 0;
          p.dragForce = 0;
          p.dragNoWallTimer = 0;
          p.swingAngleDeg = 0;
          p.action = 'Jump';

          state.events.push({
            type: 'troncho_launch',
            id: tr.id,
            who: p.id,
            x: p.x,
            y: p.y,
          });
        }
      }

      // Also launch Jeff if standing on top in Solo Jeff mode
      const j = state.jeff;
      if (state.mode === 'solo_jeff' && j.active && !j.heldByP1 && j.vy < launchVel * 0.6) {
        const jx = j.x + PHYSICS.JEFF_BOX_OFFSET_X;
        const jFeetY = j.y + JEFF_FEET_OFFSET_Y;
        const minX = Math.min(prevX, nextX);
        const maxX = Math.max(prevX, nextX) + tr.w;
        const standing =
          (j.grounded && j.platformEntityId === tr.id) ||
          (jx + JEFF_HALF_W > minX &&
            jx - JEFF_HALF_W < maxX &&
            jFeetY >= Math.min(prevY, nextY) + tr.h - 0.18 &&
            jFeetY <= newTopY + 0.18);
        if (standing) {
          j.y = Math.max(j.y, newTopY - JEFF_FEET_OFFSET_Y + 0.02);
          j.vy = Math.max(j.vy, launchVel * 0.85);
          j.grounded = false;
          j.anchored = false;
          j.platformEntityId = null;
        }
      }
    }
  }

  // 5. Update Laser hazard beams & knockback collisions
  for (let i = 0; i < state.lasers.length; i++) {
    const laser = state.lasers[i];
    const powered = laser.circuitId ? (poweredByCircuit.get(laser.circuitId) ?? false) : false;
    laser.active = laser.invertPower ? !powered : powered;

    if (laser.cooldown > 0) {
      laser.cooldown = Math.max(0, laser.cooldown - dt);
    }
    if (!laser.active || laser.cooldown > 0) {
      continue;
    }

    let zappedAny = false;
    for (let pIdx = 0; pIdx < activePenguins.length; pIdx++) {
      const p = activePenguins[pIdx];
      if (p.action === 'Grabbed') continue;
      if (
        segmentIntersectsAABB(
          laser.x1,
          laser.y1,
          laser.x2,
          laser.y2,
          getPenguinRect(p),
          LASER_BEAM_RADIUS,
        )
      ) {
        applyLaserKnockback(state, p, laser.x1, laser.y1, laser.x2, laser.y2, laser.id);
        zappedAny = true;
      }
    }

    if (zappedAny) {
      laser.cooldown = LASER_COOLDOWN_SEC;
    }
  }
}
