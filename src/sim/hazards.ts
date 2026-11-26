import {
  PHYSICS,
  TIME_TRIAL_MEDALS,
  type LevelData,
  type MedalTier,
  type MovablePlatformState,
  type PenguinState,
  type SimState,
  type SwingPlatformState,
  type WindSample,
} from '../contracts';

const EPS = 1e-6;

const PENGUIN_HALF_W = PHYSICS.PENGUIN_BOX_W * 0.5;
const PENGUIN_FEET_OFFSET_Y = PHYSICS.PENGUIN_BOX_OFFSET_Y - PHYSICS.PENGUIN_BOX_H * 0.5;
const PENGUIN_TOP_OFFSET_Y = PHYSICS.PENGUIN_BOX_OFFSET_Y + PHYSICS.PENGUIN_BOX_H * 0.5;

const JEFF_HALF_W = PHYSICS.JEFF_BOX_W * 0.5;
const JEFF_FEET_OFFSET_Y = PHYSICS.JEFF_BOX_OFFSET_Y - PHYSICS.JEFF_BOX_H * 0.5;
const JEFF_TOP_OFFSET_Y = PHYSICS.JEFF_BOX_OFFSET_Y + PHYSICS.JEFF_BOX_H * 0.5;

const FOOT_STAND_TOLERANCE = 0.15;
const COLLECTIBLE_RADIUS = 1.1;
const COLLECTIBLE_RADIUS_SQ = COLLECTIBLE_RADIUS * COLLECTIBLE_RADIUS;
const ENDS_STOP_PAUSE_SEC = 1.0;

function isPenguinStandingOnBox(
  p: PenguinState,
  boxId: string,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  platformVy = 0,
): boolean {
  if (p.grounded && p.platformEntityId === boxId) {
    return true;
  }
  const topY = boxY + boxH;
  const feetY = p.y + PENGUIN_FEET_OFFSET_Y;
  if (Math.abs(feetY - topY) > FOOT_STAND_TOLERANCE) {
    return false;
  }
  if (p.vy > platformVy + 1.5) {
    return false;
  }
  return p.x + PENGUIN_HALF_W > boxX && p.x - PENGUIN_HALF_W < boxX + boxW;
}

function isAnyRiderStandingOnBox(
  state: SimState,
  boxId: string,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  platformVy = 0,
): boolean {
  if (isPenguinStandingOnBox(state.p1, boxId, boxX, boxY, boxW, boxH, platformVy)) {
    return true;
  }
  if (
    state.mode !== 'solo_jeff' &&
    isPenguinStandingOnBox(state.p2, boxId, boxX, boxY, boxW, boxH, platformVy)
  ) {
    return true;
  }
  const jeff = state.jeff;
  if (jeff.active && !jeff.heldByP1) {
    if (jeff.grounded && jeff.platformEntityId === boxId) {
      return true;
    }
    const topY = boxY + boxH;
    const jeffX = jeff.x + PHYSICS.JEFF_BOX_OFFSET_X;
    const jeffFeetY = jeff.y + JEFF_FEET_OFFSET_Y;
    if (
      Math.abs(jeffFeetY - topY) <= FOOT_STAND_TOLERANCE &&
      jeff.vy <= platformVy + 1.5 &&
      jeffX + JEFF_HALF_W > boxX &&
      jeffX - JEFF_HALF_W < boxX + boxW
    ) {
      return true;
    }
  }
  return false;
}

function getPlayerMidpoint(state: SimState): { x: number; y: number } {
  if (state.mode === 'solo_jeff' && state.jeff.active) {
    if (state.jeff.heldByP1) {
      return { x: state.p1.x, y: state.p1.y };
    }
    return {
      x: (state.p1.x + state.jeff.x) * 0.5,
      y: (state.p1.y + state.jeff.y) * 0.5,
    };
  }
  return {
    x: (state.p1.x + state.p2.x) * 0.5,
    y: (state.p1.y + state.p2.y) * 0.5,
  };
}

/**
 * Samples active wind force vector at a given world point (Y-UP tile coordinates).
 */
export function getWindAt(state: SimState, x: number, y: number): WindSample {
  for (let i = 0; i < state.windZones.length; i++) {
    const z = state.windZones[i];
    if (x >= z.minX && x <= z.maxX && y >= z.minY && y <= z.maxY) {
      const active = z.constant || z.phase === 'active';
      return {
        active,
        dir: z.dir,
        strength: active ? z.strength : 0,
      };
    }
  }
  return { active: false, dir: 1, strength: 0 };
}

function updateWindZones(state: SimState, dt: number): void {
  const prevWindActive = state.windActive;
  const prevWindPhase = state.windPhase;

  for (let i = 0; i < state.windZones.length; i++) {
    const z = state.windZones[i];
    if (z.constant) {
      z.phase = 'active';
      z.timer = 0;
      continue;
    }

    const waitTime = Math.max(0, z.waitTime);
    const telegraphTime = Math.min(PHYSICS.WIND_TELEGRAPH_TIME, waitTime);
    const calmWaitTime = Math.max(0, waitTime - telegraphTime);
    const activeTime = Math.max(0.02, z.activeTime);

    z.timer += dt;

    if (z.phase === 'wait') {
      if (z.timer >= calmWaitTime - EPS) {
        z.timer = Math.max(0, z.timer - calmWaitTime);
        if (telegraphTime > EPS) {
          z.phase = 'telegraph';
        } else {
          z.phase = 'active';
        }
      }
    } else if (z.phase === 'telegraph') {
      if (z.timer >= telegraphTime - EPS) {
        z.timer = Math.max(0, z.timer - telegraphTime);
        z.phase = 'active';
      }
    } else {
      if (z.timer >= activeTime - EPS) {
        z.timer = Math.max(0, z.timer - activeTime);
        z.phase = 'wait';
      }
    }
  }

  // Resolve active zone enclosing player midpoint and update global wind state + events
  const mid = getPlayerMidpoint(state);
  let enclosingZone: SimState['windZones'][number] | null = null;
  for (let i = 0; i < state.windZones.length; i++) {
    const z = state.windZones[i];
    if (mid.x >= z.minX && mid.x <= z.maxX && mid.y >= z.minY && mid.y <= z.maxY) {
      enclosingZone = z;
      break;
    }
  }

  if (enclosingZone) {
    const nextPhase = enclosingZone.constant ? 'active' : enclosingZone.phase;
    const nextActive = nextPhase === 'active';
    state.windPhase = nextPhase;
    state.windActive = nextActive;
    state.windDir = enclosingZone.dir;

    if (prevWindPhase !== 'telegraph' && nextPhase === 'telegraph') {
      state.events.push({ type: 'wind_telegraph', dir: enclosingZone.dir });
    }
    if (!prevWindActive && nextActive) {
      state.events.push({ type: 'wind_start', dir: enclosingZone.dir });
    } else if (prevWindActive && !nextActive) {
      state.events.push({ type: 'wind_stop' });
    }
  } else {
    state.windPhase = 'wait';
    state.windActive = false;
    if (prevWindActive) {
      state.events.push({ type: 'wind_stop' });
    }
  }
}

function updateFallingBlocks(state: SimState, dt: number): void {
  for (let i = 0; i < state.fallingBlocks.length; i++) {
    const block = state.fallingBlocks[i];
    const cx = block.x + block.w * 0.5;
    const cy = block.y + block.h * 0.5;

    if (block.state === 'intact') {
      if (isAnyRiderStandingOnBox(state, block.id, block.x, block.y, block.w, block.h, 0)) {
        block.state = 'shaking';
        block.timer = 0;
        state.events.push({ type: 'block_shake', id: block.id, x: cx, y: cy });
      }
    } else if (block.state === 'shaking') {
      block.timer += dt;
      if (block.timer >= PHYSICS.FALLING_BLOCK_HOLD_TIME - EPS) {
        block.state = 'crumbled';
        block.timer = 0;
        if (state.p1.platformEntityId === block.id) {
          state.p1.platformEntityId = null;
        }
        if (state.p2.platformEntityId === block.id) {
          state.p2.platformEntityId = null;
        }
        if (state.jeff.platformEntityId === block.id) {
          state.jeff.platformEntityId = null;
        }
        state.events.push({ type: 'block_crumble', id: block.id, x: cx, y: cy });
      }
    } else {
      block.timer += dt;
      if (block.timer >= PHYSICS.FALLING_BLOCK_RECOVER_TIME - EPS) {
        block.state = 'intact';
        block.timer = 0;
        state.events.push({ type: 'block_recover', id: block.id, x: cx, y: cy });
      }
    }
  }
}

function updateSingleMovablePlatform(state: SimState, plat: MovablePlatformState, dt: number): void {
  plat.prevX = plat.x;
  plat.prevY = plat.y;

  const dx = plat.endX - plat.startX;
  const dy = plat.endY - plat.startY;
  const dist = Math.hypot(dx, dy);
  if (dist < EPS || dt <= 0) {
    plat.vx = 0;
    plat.vy = 0;
    return;
  }

  const dtParam = (plat.speed / dist) * dt;
  const hasRider = isAnyRiderStandingOnBox(
    state,
    plat.id,
    plat.x,
    plat.y,
    plat.w,
    plat.h,
    plat.vy,
  );

  switch (plat.mode) {
    case 'CONTINUE': {
      plat.active = true;
      plat.t += plat.dir * dtParam;
      if (plat.t >= 1) {
        plat.t = 1;
        plat.dir = -1;
      } else if (plat.t <= 0) {
        plat.t = 0;
        plat.dir = 1;
      }
      break;
    }

    case 'ENDS_STOP': {
      plat.active = true;
      if (plat.pauseTimer > 0) {
        plat.pauseTimer = Math.max(0, plat.pauseTimer - dt);
      } else {
        plat.t += plat.dir * dtParam;
        if (plat.t >= 1) {
          plat.t = 1;
          plat.dir = -1;
          plat.pauseTimer = ENDS_STOP_PAUSE_SEC;
        } else if (plat.t <= 0) {
          plat.t = 0;
          plat.dir = 1;
          plat.pauseTimer = ENDS_STOP_PAUSE_SEC;
        }
      }
      break;
    }

    case 'START_STOP': {
      if (hasRider) {
        plat.active = true;
        plat.dir = 1;
        plat.t = Math.min(1, plat.t + dtParam);
      } else if (plat.t > 0) {
        plat.active = true;
        plat.dir = -1;
        plat.t = Math.max(0, plat.t - dtParam);
        if (plat.t <= 0) {
          plat.t = 0;
          plat.active = false;
          plat.dir = 1;
        }
      } else {
        plat.active = false;
        plat.dir = 1;
      }
      break;
    }

    case 'FINISH_STOP': {
      if (hasRider && !plat.active && plat.t < 1) {
        plat.active = true;
        plat.dir = 1;
      }
      if (plat.active) {
        plat.t = Math.min(1, plat.t + dtParam);
        if (plat.t >= 1) {
          plat.t = 1;
          plat.active = false;
        }
      }
      break;
    }

    case 'STEP_STOP': {
      plat.active = hasRider;
      if (hasRider) {
        plat.t += plat.dir * dtParam;
        if (plat.t >= 1) {
          plat.t = 1;
          plat.dir = -1;
        } else if (plat.t <= 0) {
          plat.t = 0;
          plat.dir = 1;
        }
      }
      break;
    }
  }

  plat.x = plat.startX + dx * plat.t;
  plat.y = plat.startY + dy * plat.t;
  plat.vx = (plat.x - plat.prevX) / dt;
  plat.vy = (plat.y - plat.prevY) / dt;
}

function updateMovablePlatforms(state: SimState, dt: number): void {
  for (let i = 0; i < state.movablePlatforms.length; i++) {
    updateSingleMovablePlatform(state, state.movablePlatforms[i], dt);
  }
}

function updateSingleSwingPlatform(state: SimState, sp: SwingPlatformState, dt: number): void {
  sp.prevX = sp.x;
  sp.prevY = sp.y;

  const safeRadius = Math.max(0.5, sp.radius);
  const sinMax = Math.min(0.95, Math.max(0, sp.maxDisplacement / safeRadius));
  const maxAngle = Math.asin(sinMax);
  const safeSwingTime = Math.max(0.25, sp.swingTime);

  if (sp.windDriven) {
    const restSample = getWindAt(state, sp.pivotX, sp.pivotY - safeRadius);
    const currSample = getWindAt(state, sp.x + sp.w * 0.5, sp.y + sp.h * 0.5);
    const wind = restSample.active ? restSample : currSample;

    if (wind.active) {
      const strengthScale = Math.min(1, Math.max(0, wind.strength));
      sp.targetAngle = wind.dir * maxAngle * strengthScale;
    } else {
      sp.targetAngle = 0;
    }

    // Critically-damped angular response reaching targetAngle smoothly over ~swingTime
    const omega = 4.0 / safeSwingTime;
    const accel = omega * omega * (sp.targetAngle - sp.angle) - 2.0 * omega * sp.angularVel;
    sp.angularVel += accel * dt;
    sp.angle += sp.angularVel * dt;

    if (Math.abs(sp.targetAngle - sp.angle) < 1e-4 && Math.abs(sp.angularVel) < 1e-4) {
      sp.angle = sp.targetAngle;
      sp.angularVel = 0;
    }
  } else {
    const omega = Math.PI / safeSwingTime;
    const nextAngle = Math.sin(state.elapsedSec * omega) * maxAngle;
    sp.targetAngle = nextAngle;
    sp.angularVel = dt > 0 ? (nextAngle - sp.angle) / dt : 0;
    sp.angle = nextAngle;
  }

  const topCenterX = sp.pivotX + Math.sin(sp.angle) * safeRadius;
  const topCenterY = sp.pivotY - Math.cos(sp.angle) * safeRadius;
  const nextX = topCenterX - sp.w * 0.5;
  const nextY = topCenterY - sp.h;

  // Avoid an artificial first-tick velocity spike if initialized away from resting arc
  if (state.tick <= 1 && Math.hypot(nextX - sp.prevX, nextY - sp.prevY) > 1.5) {
    sp.prevX = nextX;
    sp.prevY = nextY;
    sp.x = nextX;
    sp.y = nextY;
    sp.vx = 0;
    sp.vy = 0;
    return;
  }

  sp.x = nextX;
  sp.y = nextY;
  sp.vx = dt > 0 ? (sp.x - sp.prevX) / dt : 0;
  sp.vy = dt > 0 ? (sp.y - sp.prevY) / dt : 0;
}

function updateSwingPlatforms(state: SimState, dt: number): void {
  for (let i = 0; i < state.swingPlatforms.length; i++) {
    updateSingleSwingPlatform(state, state.swingPlatforms[i], dt);
  }
}

function isWithinCollectibleRange(x1: number, y1: number, x2: number, y2: number): boolean {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return dx * dx + dy * dy <= COLLECTIBLE_RADIUS_SQ;
}

function overlapsRect(
  cx: number,
  cy: number,
  halfW: number,
  botOffsetY: number,
  topOffsetY: number,
  rect: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    cx + halfW >= rect.x &&
    cx - halfW <= rect.x + rect.w &&
    cy + topOffsetY >= rect.y &&
    cy + botOffsetY <= rect.y + rect.h
  );
}

function computeTimeTrialMedal(timeTrialIndex: number, timeSec: number): { trialId: string; medal: MedalTier } {
  const def = TIME_TRIAL_MEDALS.find((m) => m.index === timeTrialIndex);
  if (!def) {
    return { trialId: `TT${timeTrialIndex}`, medal: 'bronze' };
  }
  let medal: MedalTier = 'none';
  if (timeSec <= def.platinum) {
    medal = 'platinum';
  } else if (timeSec <= def.gold) {
    medal = 'gold';
  } else if (timeSec <= def.silver) {
    medal = 'silver';
  } else if (timeSec <= def.bronze) {
    medal = 'bronze';
  }
  return { trialId: def.id, medal };
}

function updateCollectiblesAndSummit(state: SimState, level: LevelData): void {
  // Collectibles proximity check
  for (let i = 0; i < state.collectibles.length; i++) {
    const c = state.collectibles[i];
    if (c.collected || c.kind === 'npc') {
      continue;
    }
    const p1Hit = isWithinCollectibleRange(state.p1.x, state.p1.y, c.x, c.y);
    const p2Hit =
      state.mode !== 'solo_jeff' && isWithinCollectibleRange(state.p2.x, state.p2.y, c.x, c.y);
    const jeffHit =
      state.jeff.active && isWithinCollectibleRange(state.jeff.x, state.jeff.y, c.x, c.y);

    if (p1Hit || p2Hit || jeffHit) {
      c.collected = true;
      if (c.kind === 'photo') {
        state.events.push({ type: 'collect_photo', id: c.id, label: c.label, x: c.x, y: c.y });
      } else if (c.kind === 'manual') {
        state.events.push({ type: 'collect_manual', id: c.id, label: c.label, x: c.x, y: c.y });
      } else if (c.kind === 'seal') {
        state.events.push({ type: 'rescue_seal', id: c.id, x: c.x, y: c.y });
      }
    }
  }

  // Summit zone completion check
  if (state.completed) {
    return;
  }

  const sz = level.summitZone;
  const p1InSummit = overlapsRect(
    state.p1.x,
    state.p1.y,
    PENGUIN_HALF_W,
    PENGUIN_FEET_OFFSET_Y,
    PENGUIN_TOP_OFFSET_Y,
    sz,
  );
  const p2InSummit =
    state.mode !== 'solo_jeff' &&
    overlapsRect(
      state.p2.x,
      state.p2.y,
      PENGUIN_HALF_W,
      PENGUIN_FEET_OFFSET_Y,
      PENGUIN_TOP_OFFSET_Y,
      sz,
    );
  const jeffInSummit =
    state.mode === 'solo_jeff' &&
    state.jeff.active &&
    overlapsRect(
      state.jeff.x + PHYSICS.JEFF_BOX_OFFSET_X,
      state.jeff.y,
      JEFF_HALF_W,
      JEFF_FEET_OFFSET_Y,
      JEFF_TOP_OFFSET_Y,
      sz,
    );

  if (p1InSummit || p2InSummit || jeffInSummit) {
    state.completed = true;
    state.completionTimeSec = state.elapsedSec;
    const noAssist = !state.assistEverUsedInRun;
    state.events.push({
      type: 'summit_reached',
      mode: state.mode,
      timeSec: state.completionTimeSec,
      noAssist,
    });

    if (state.mode === 'time_trial' && level.timeTrialIndex != null) {
      const { trialId, medal } = computeTimeTrialMedal(level.timeTrialIndex, state.completionTimeSec);
      state.completionMedal = medal;
      state.events.push({
        type: 'time_trial_finish',
        trialId,
        timeSec: state.completionTimeSec,
        medal,
      });
    }
  }
}

/**
 * Steps all deterministic world hazards: wind cycles, falling blocks, movable platforms,
 * swing platforms, collectible pickups, and summit completion.
 */
export function updateHazards(state: SimState, level: LevelData, dt: number): void {
  updateWindZones(state, dt);
  updateFallingBlocks(state, dt);
  updateMovablePlatforms(state, dt);
  updateSwingPlatforms(state, dt);
  updateCollectiblesAndSummit(state, level);
}
