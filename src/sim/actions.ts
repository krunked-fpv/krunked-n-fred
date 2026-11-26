import {
  PenguinFlag,
  PHYSICS,
  type EmoteType,
  type LevelData,
  type PenguinState,
  type PlayerInput,
  type SimState,
  type WindSample,
} from '../contracts';
import { hasGrabbableWallOnSide, hasGroundAhead, probeWallForGrab } from './collision';
import {
  applyStandardHorizontalPhysics,
  clampWindStrength,
  resetScarfNodes,
} from './penguinPhysics';
import { resetVerletRope } from './ropeSolver';

const EMOTE_DURATION = 1.6;
const CHARLIE_FLIGHT_DURATION = 1.15;
const RAD_TO_DEG_RETAIL = 57.3;

function isRpsEmote(emote: EmoteType): boolean {
  return emote === 'rps_rock' || emote === 'rps_paper' || emote === 'rps_scissors';
}

function evaluateRpsWinner(p1Move: EmoteType, p2Move: EmoteType): 'p1' | 'p2' | 'draw' {
  if (p1Move === p2Move) return 'draw';
  if (
    (p1Move === 'rps_rock' && p2Move === 'rps_scissors') ||
    (p1Move === 'rps_paper' && p2Move === 'rps_rock') ||
    (p1Move === 'rps_scissors' && p2Move === 'rps_paper')
  ) {
    return 'p1';
  }
  return 'p2';
}

function getPartnerInfo(
  state: SimState,
  p: PenguinState,
): {
  x: number;
  y: number;
  grounded: boolean;
  supported: boolean;
  dangling: boolean;
} {
  if (state.mode === 'solo_jeff' && state.jeff.active && p.id === 'p1') {
    const j = state.jeff;
    const supported = !j.heldByP1 && (j.grounded || j.anchored || j.grabbedWallSide !== 0);
    return {
      x: j.x,
      y: j.y,
      grounded: j.grounded,
      supported,
      dangling: !j.heldByP1 && !supported,
    };
  }

  const other = p.id === 'p1' ? state.p2 : state.p1;
  const supported =
    other.grounded ||
    other.action === 'Anchor' ||
    other.action === 'Grab' ||
    other.action === 'PullRope';
  const dangling = !other.grounded && other.action !== 'Grab' && other.action !== 'Grabbed';

  return {
    x: other.x,
    y: other.y,
    grounded: other.grounded,
    supported,
    dangling,
  };
}

function performJump(
  state: SimState,
  p: PenguinState,
  vxOverride?: number,
  vyOverride?: number,
): void {
  const usedAirAssist = !p.grounded && p.coyoteTimer <= 0 && p.action !== 'Grab';
  if (usedAirAssist) {
    state.assistEverUsedInRun = true;
  }

  if (vxOverride !== undefined) {
    p.vx = vxOverride;
  }
  p.vy = vyOverride ?? PHYSICS.JUMP_FORCE;
  p.grounded = false;
  p.platformEntityId = null;
  p.wallSide = 0;
  p.wallEntityId = null;
  p.grabRedTint = 0;
  p.coyoteTimer = 0;
  p.jumpBufferTimer = 0;
  p.jumpCooldown = PHYSICS.JUMP_COOLDOWN;
  p.fallTimer = 0;
  p.dragForce = 0;
  p.dragNoWallTimer = 0;
  p.swingAngleDeg = 0;
  p.swingTimer = 0;
  p.swingRestTimer = 0;
  p.swingFallTimer = 0;
  p.swingAdditive = 0;
  p.action = 'Jump';
  p.jumpsUsed += 1;
  state.jumpsCount += 1;

  state.events.push({
    type: 'jump',
    who: p.id,
    x: p.x,
    y: p.y,
  });
}

function tryEnterWallGrab(
  state: SimState,
  level: LevelData,
  p: PenguinState,
  input: PlayerInput,
): boolean {
  if (!input.grab || p.grabStamina <= 0.05 || p.jumpCooldown > 0) {
    return false;
  }
  const range = state.assist.betterGrab ? PHYSICS.GRAB_RANGE_BETTER : PHYSICS.GRAB_RANGE;
  const probe = probeWallForGrab(state, level, p, range);
  if (!probe.found || probe.side === 0) {
    return false;
  }

  p.x = probe.snapX;
  p.vx = 0;
  p.vy = 0;
  p.grounded = false;
  p.platformEntityId = null;
  p.wallSide = probe.side;
  p.facing = probe.side;
  p.wallTerrain = probe.terrain;
  p.wallEntityId = probe.entityId;
  p.fallTimer = 0;
  p.dragForce = 0;
  p.dragNoWallTimer = 0;
  p.swingAngleDeg = 0;
  p.swingTimer = 0;
  p.swingRestTimer = 0;
  p.swingFallTimer = 0;
  p.swingAdditive = 0;
  p.action = 'Grab';
  p.grabRedTint = Math.min(1, Math.max(0, 1 - p.grabStamina / Math.max(0.001, p.grabMaxStamina)));

  state.events.push({
    type: 'grab_start',
    who: p.id,
    x: p.x,
    y: p.y,
    terrain: probe.terrain,
  });
  return true;
}

function releaseWallGrab(p: PenguinState): void {
  p.wallSide = 0;
  p.wallEntityId = null;
  p.wallTerrain = 'DEFAULT';
  p.grabRedTint = 0;
  p.action = 'Fall';
}

/**
 * Updates Assist Checkpoint Flag placement and Call Charlie animated flight.
 */
export function updateCheckpointAndCharlie(
  state: SimState,
  p1Input: PlayerInput,
  p2Input: PlayerInput,
  dt: number,
): void {
  const cp = state.checkpoint;

  // Active Charlie pickup flight carrying both penguins smoothly to placed flag
  if (cp.charlieActive) {
    cp.charlieProgress = Math.min(1, cp.charlieProgress + dt / CHARLIE_FLIGHT_DURATION);
    const t = cp.charlieProgress;
    // Cubic ease-in-out
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const arcY = Math.sin(t * Math.PI) * 2.4;

    const targetX = cp.x;
    const targetY = cp.y + 0.35;
    const cx = cp.charlieStartX + (targetX - cp.charlieStartX) * ease;
    const cy = cp.charlieStartY + (targetY - cp.charlieStartY) * ease + arcY;

    state.p1.x = cx - 0.45;
    state.p1.y = cy;
    state.p1.vx = 0;
    state.p1.vy = 0;
    state.p1.action = 'Grabbed';
    state.p1.grounded = false;

    state.p2.x = cx + 0.45;
    state.p2.y = cy;
    state.p2.vx = 0;
    state.p2.vy = 0;
    state.p2.action = 'Grabbed';
    state.p2.grounded = false;

    if (state.mode === 'solo_jeff' && state.jeff.active) {
      state.jeff.x = cx + 0.45;
      state.jeff.y = cy;
      state.jeff.vx = 0;
      state.jeff.vy = 0;
      state.jeff.grounded = false;
      state.jeff.heldByP1 = false;
    }

    if (cp.charlieProgress >= 1) {
      cp.charlieActive = false;
      cp.charlieProgress = 0;
      state.p1.action = 'Fall';
      state.p1.fallTimer = 0;
      state.p1.grabStamina = state.p1.grabMaxStamina;
      state.p1.grabRedTint = 0;
      state.p2.action = 'Fall';
      state.p2.fallTimer = 0;
      state.p2.grabStamina = state.p2.grabMaxStamina;
      state.p2.grabRedTint = 0;
      state.rope.maxDistance = PHYSICS.ROPE_MAX_DISTANCE;
      resetVerletRope(state);
      resetScarfNodes(state.p1);
      resetScarfNodes(state.p2);
    }
    return;
  }

  if (!state.assist.checkPoints) {
    state.p1.callCharlieTimer = 0;
    state.p2.callCharlieTimer = 0;
    return;
  }

  // Flag placement (grounded penguin presses `flag`)
  const tryPlaceFlag = (p: PenguinState, inp: PlayerInput): void => {
    if (!inp.flag || !p.grounded) return;
    if (cp.placed && Math.hypot(cp.x - p.x, cp.y - p.y) < 0.15) return;
    cp.placed = true;
    cp.x = p.x;
    cp.y = p.y;
    state.assistEverUsedInRun = true;
    state.events.push({ type: 'flag_place', x: cp.x, y: cp.y });
  };

  tryPlaceFlag(state.p1, p1Input);
  if (state.mode !== 'solo_jeff') {
    tryPlaceFlag(state.p2, p2Input);
  }

  // Call Charlie hold (`CALL_CHARLIE_HOLD_TIME = 1.5s`)
  if (!cp.placed) {
    state.p1.callCharlieTimer = 0;
    state.p2.callCharlieTimer = 0;
    return;
  }

  const updateHold = (p: PenguinState, inp: PlayerInput): boolean => {
    if (inp.callCharlie) {
      p.callCharlieTimer += dt;
      return p.callCharlieTimer >= PHYSICS.CALL_CHARLIE_HOLD_TIME;
    }
    p.callCharlieTimer = Math.max(0, p.callCharlieTimer - dt * 2.0);
    return false;
  };

  const p1Triggered = updateHold(state.p1, p1Input);
  const p2Triggered = state.mode !== 'solo_jeff' && updateHold(state.p2, p2Input);

  if (p1Triggered || p2Triggered) {
    state.assistEverUsedInRun = true;
    cp.charlieActive = true;
    cp.charlieProgress = 0;
    cp.charlieStartX =
      state.mode === 'solo_jeff' ? state.p1.x : (state.p1.x + state.p2.x) * 0.5;
    cp.charlieStartY =
      state.mode === 'solo_jeff' ? state.p1.y : (state.p1.y + state.p2.y) * 0.5;

    for (const peng of [state.p1, state.p2]) {
      peng.action = 'Grabbed';
      peng.vx = 0;
      peng.vy = 0;
      peng.grounded = false;
      peng.wallSide = 0;
      peng.wallEntityId = null;
      peng.platformEntityId = null;
      peng.fallTimer = 0;
      peng.landHardTimer = 0;
      peng.callCharlieTimer = 0;
      peng.swingAngleDeg = 0;
      peng.grabRedTint = 0;
    }

    state.events.push({
      type: 'charlie_pickup',
      x: cp.charlieStartX,
      y: cp.charlieStartY,
    });
  }
}

/**
 * Handles player emotes (`clap`, `rps_*`) and Rock-Paper-Scissors clash resolution.
 */
export function updateEmotes(
  state: SimState,
  p1Input: PlayerInput,
  p2Input: PlayerInput,
  dt: number,
): void {
  let p1StartedRps = false;
  let p2StartedRps = false;

  const tickEmote = (p: PenguinState, inp: PlayerInput): boolean => {
    if (p.emoteTimer > 0) {
      p.emoteTimer = Math.max(0, p.emoteTimer - dt);
      if (p.emoteTimer <= 0) {
        p.emote = 'none';
      }
    }
    if (inp.emote !== 'none' && p.emoteTimer <= 0 && p.action !== 'LandHard') {
      p.emote = inp.emote;
      p.emoteTimer = EMOTE_DURATION;
      state.events.push({
        type: 'emote',
        who: p.id,
        emote: p.emote,
        x: p.x,
        y: p.y,
      });
      return isRpsEmote(p.emote);
    }
    return false;
  };

  p1StartedRps = tickEmote(state.p1, p1Input);
  if (state.mode !== 'solo_jeff') {
    p2StartedRps = tickEmote(state.p2, p2Input);
  }

  // Evaluate RPS clash once both penguins display an active RPS gesture
  if (
    (p1StartedRps || p2StartedRps) &&
    isRpsEmote(state.p1.emote) &&
    isRpsEmote(state.p2.emote) &&
    state.p1.emoteTimer > 0 &&
    state.p2.emoteTimer > 0
  ) {
    const winner = evaluateRpsWinner(state.p1.emote, state.p2.emote);
    state.events.push({
      type: 'rps_result',
      winner,
      p1Move: state.p1.emote,
      p2Move: state.p2.emote,
    });
  }
}

/**
 * Full 13-state deterministic Penguin FSM update for one 50 Hz tick.
 */
export function updatePenguinAction(
  state: SimState,
  level: LevelData,
  p: PenguinState,
  input: PlayerInput,
  wind: WindSample,
  dt: number,
): void {
  p.animTime += dt;

  // Keep grab max stamina synced with BetterGrab assist toggle
  const targetMaxStamina = state.assist.betterGrab
    ? PHYSICS.GRAB_TIMER_BETTER
    : PHYSICS.GRAB_TIMER;
  if (p.grabMaxStamina !== targetMaxStamina) {
    const ratio = p.grabMaxStamina > 0 ? p.grabStamina / p.grabMaxStamina : 1;
    p.grabMaxStamina = targetMaxStamina;
    p.grabStamina = Math.min(targetMaxStamina, ratio * targetMaxStamina);
  }

  if (p.action === 'Grabbed') {
    p.lastJumpHeld = input.jump;
    return;
  }

  // Core cooldown & coyote/buffer timers
  p.jumpCooldown = Math.max(0, p.jumpCooldown - dt);
  if (p.grounded) {
    p.coyoteTimer = PHYSICS.COYOTE_TIME;
  } else {
    p.coyoteTimer = Math.max(0, p.coyoteTimer - dt);
  }

  const jumpEdge = input.jumpPressed || (input.jump && !p.lastJumpHeld);
  if (jumpEdge) {
    p.jumpBufferTimer = PHYSICS.JUMP_BUFFER_TIME;
  } else {
    p.jumpBufferTimer = Math.max(0, p.jumpBufferTimer - dt);
  }

  const moveX = input.moveX > 0.15 ? 1 : input.moveX < -0.15 ? -1 : 0;
  if (moveX !== 0 && p.action !== 'Grab' && p.action !== 'LandHard') {
    p.facing = moveX;
  }

  // --- 1. LandHard recovery stun ---
  if (p.action === 'LandHard') {
    p.landHardTimer = Math.max(0, p.landHardTimer - dt);
    const decel = (p.flags & PenguinFlag.OnIce) !== 0 ? 3.5 : 14.0;
    p.vx *= Math.exp(-decel * dt);
    if (Math.abs(p.vx) < 0.05) p.vx = 0;

    if (p.landHardTimer <= 0) {
      p.action = p.grounded ? 'Idle' : 'Fall';
    }
    p.lastJumpHeld = input.jump;
    return;
  }

  // --- 2. Assist PullRope ---
  const canPullRope =
    state.assist.pullingRope &&
    input.pull &&
    (p.grounded || p.action === 'Anchor' || p.action === 'Grab' || p.action === 'PullRope');

  if (canPullRope) {
    if (p.action !== 'PullRope') {
      p.pullRopeTimer = 0;
      state.assistEverUsedInRun = true;
      state.events.push({
        type: 'rope_pull_start',
        who: p.id,
        x: p.x,
        y: p.y,
      });
    }
    p.action = 'PullRope';
    p.vx = 0;
    if (p.wallSide !== 0) {
      p.vy = 0;
      p.grabStamina = Math.max(0, p.grabStamina - dt);
      p.grabRedTint = Math.min(1, Math.max(0, 1 - p.grabStamina / Math.max(0.001, p.grabMaxStamina)));
      if (p.grabStamina <= 0) {
        state.events.push({ type: 'grab_stamina_out', who: p.id, x: p.x, y: p.y });
        releaseWallGrab(p);
        p.lastJumpHeld = input.jump;
        return;
      }
    }

    p.pullRopeTimer += dt;
    const pullDuration =
      state.mode === 'solo_jeff' ? PHYSICS.PULL_ROPE_TIME_JEFF : PHYSICS.PULL_ROPE_TIME_COOP;
    const reelSpeed = (PHYSICS.ROPE_MAX_DISTANCE - PHYSICS.PULL_ROPE_MIN_DIST) / pullDuration;
    state.rope.maxDistance = Math.max(
      PHYSICS.PULL_ROPE_MIN_DIST,
      state.rope.maxDistance - reelSpeed * dt,
    );

    // Allow jumping to cancel PullRope cleanly
    if (p.jumpBufferTimer > 0 && p.jumpCooldown <= 0 && (p.grounded || p.wallSide !== 0)) {
      const jumpVx = p.wallSide !== 0 ? -p.wallSide * PHYSICS.WALK_SPEED : undefined;
      performJump(state, p, jumpVx);
    }

    p.lastJumpHeld = input.jump;
    return;
  } else if (p.action === 'PullRope') {
    p.pullRopeTimer = 0;
    p.action = p.wallSide !== 0 ? 'Grab' : p.grounded ? 'Idle' : 'Fall';
  }

  // --- 3. Wall Grab ---
  if (p.action === 'Grab') {
    p.vx = 0;
    p.vy = 0;
    p.grabStamina = Math.max(0, p.grabStamina - dt);
    p.grabRedTint = Math.min(1, Math.max(0, 1 - p.grabStamina / Math.max(0.001, p.grabMaxStamina)));

    // Wall jump out of Grab
    if (p.jumpBufferTimer > 0 && p.jumpCooldown <= 0) {
      const side = p.wallSide;
      const awayVx = moveX !== 0 ? moveX * PHYSICS.WALK_SPEED : -side * PHYSICS.WALK_SPEED * 0.9;
      performJump(state, p, awayVx, PHYSICS.JUMP_FORCE);
      p.facing = awayVx >= 0 ? 1 : -1;
      p.lastJumpHeld = input.jump;
      return;
    }

    // Stamina exhausted
    if (p.grabStamina <= 0) {
      state.events.push({ type: 'grab_stamina_out', who: p.id, x: p.x, y: p.y });
      releaseWallGrab(p);
      p.lastJumpHeld = input.jump;
      return;
    }

    // Released grab button
    if (!input.grab) {
      releaseWallGrab(p);
      p.lastJumpHeld = input.jump;
      return;
    }

    // Verify wall still present (e.g. FallingBlock didn't crumble or Troncho didn't slide away)
    const range = state.assist.betterGrab ? PHYSICS.GRAB_RANGE_BETTER : PHYSICS.GRAB_RANGE;
    const stillThere =
      p.wallSide !== 0
        ? hasGrabbableWallOnSide(state, level, p, p.wallSide, range + 0.15)
        : { found: false, side: 0 as const, wallX: p.x, snapX: p.x, terrain: 'DEFAULT' as const, entityId: null };

    if (!stillThere.found) {
      releaseWallGrab(p);
    } else {
      p.wallTerrain = stillThere.terrain;
      p.wallEntityId = stillThere.entityId;
    }

    p.lastJumpHeld = input.jump;
    return;
  }

  // Try entering Grab from airborne or ground if holding grab next to grabbable wall
  if (input.grab && tryEnterWallGrab(state, level, p, input)) {
    p.lastJumpHeld = input.jump;
    return;
  }

  // --- 4. Pendulum Swing ---
  const partner = getPartnerInfo(state, p);
  const ropeDist = Math.hypot(p.x - partner.x, p.y - partner.y);

  const shouldEnterSwing =
    p.action !== 'Swing' &&
    !p.grounded &&
    partner.supported &&
    p.y < partner.y - 0.15 &&
    ropeDist >= state.rope.maxDistance - 0.08 &&
    p.jumpCooldown <= 0;

  if (shouldEnterSwing) {
    p.action = 'Swing';
    p.fallTimer = 0;
    p.swingTimer = 0;
    p.swingRestTimer = 0;
    p.swingFallTimer = 0;
    p.swingAdditive = 0;
  }

  if (p.action === 'Swing') {
    const dxToPivot = partner.x - p.x;
    const dyToPivot = partner.y - p.y;
    p.swingAngleDeg = Math.atan2(dyToPivot, dxToPivot) * RAD_TO_DEG_RETAIL - 90;

    // Exit 1: landed on solid ground
    if (p.grounded) {
      p.action = moveX !== 0 ? 'Walk' : 'Idle';
      p.swingAngleDeg = 0;
      p.lastJumpHeld = input.jump;
      return;
    }

    // Exit 2: swung above partner Y -> release into Fall with full tangential launch velocity
    if (p.y >= partner.y) {
      const launchSpeed = Math.hypot(p.vx, p.vy);
      p.action = 'Fall';
      p.fallTimer = 0;
      p.swingAngleDeg = 0;
      p.jumpCooldown = 0.16;
      state.events.push({
        type: 'swing_launch',
        who: p.id,
        x: p.x,
        y: p.y,
        speed: launchSpeed,
      });
      p.lastJumpHeld = input.jump;
      return;
    }

    // Exit 3: pressing Jump releases into Fall with full tangential launch velocity
    if (p.jumpBufferTimer > 0 && p.jumpCooldown <= 0) {
      const speed = Math.hypot(p.vx, p.vy);
      if (speed < 3.5 && p.vy < 4.0) {
        // Gentle release hop if player presses jump while hanging nearly motionless
        p.vy = Math.max(p.vy + 4.5, PHYSICS.JUMP_FORCE * 0.42);
      }
      const launchSpeed = Math.hypot(p.vx, p.vy);
      p.action = 'Fall';
      p.fallTimer = 0;
      p.swingAngleDeg = 0;
      p.jumpBufferTimer = 0;
      p.jumpCooldown = 0.18;
      state.jumpsCount += 1;
      state.events.push({
        type: 'swing_launch',
        who: p.id,
        x: p.x,
        y: p.y,
        speed: launchSpeed,
      });
      p.lastJumpHeld = input.jump;
      return;
    }

    // Exit 4: partner no longer supporting or rope went slack for `SWING_TIME_BEFORE_FALLING` (1.0s)
    if (!partner.supported || ropeDist < state.rope.maxDistance - 0.55) {
      p.swingFallTimer += dt;
      if (p.swingFallTimer >= PHYSICS.SWING_TIME_BEFORE_FALLING || !partner.supported) {
        p.action = 'Fall';
        p.swingAngleDeg = 0;
        p.swingFallTimer = 0;
        p.lastJumpHeld = input.jump;
        return;
      }
    } else {
      p.swingFallTimer = 0;
    }

    // Active pendulum pumping along unit tangent `(tx, ty)` (pointing rightward along bottom arc)
    const rx = p.x - partner.x;
    const ry = p.y - partner.y;
    const rLen = Math.hypot(rx, ry);
    if (rLen > 1e-4) {
      const nx = rx / rLen;
      const ny = ry / rLen;
      const tx = -ny;
      const ty = nx;
      const vt = p.vx * tx + p.vy * ty;

      if (p.swingRestTimer > 0) {
        p.swingRestTimer = Math.max(0, p.swingRestTimer - dt);
      }

      if (moveX !== 0) {
        const pumpSign = moveX;
        const inPhase = Math.abs(vt) < 1.5 || Math.sign(vt) === pumpSign;

        if (p.swingRestTimer <= 0) {
          const baseForce =
            state.mode === 'solo_jeff' ? PHYSICS.SWING_FORCE_JEFF : PHYSICS.SWING_FORCE;
          if (inPhase) {
            p.swingAdditive = Math.min(4.0, p.swingAdditive + PHYSICS.SWING_ADDITIVE_FORCE);
          }
          const accel = (baseForce * 1.45 + p.swingAdditive * baseForce) / PHYSICS.PENGUIN_MASS;

          if (p.swingTimer === 0) {
            state.events.push({
              type: 'swing_pump',
              who: p.id,
              x: p.x,
              y: p.y,
              speed: Math.hypot(p.vx, p.vy),
            });
          }

          p.vx += tx * pumpSign * accel * dt;
          p.vy += ty * pumpSign * accel * dt;
          p.swingTimer += dt;

          if (p.swingTimer >= PHYSICS.SWING_TIME) {
            p.swingTimer = 0;
            p.swingRestTimer = PHYSICS.SWING_REST_TIME;
          }
        }
      } else {
        // Neutral swing damping: `-vel / SWING_NEUTRAL_DAMPING_DIV` (`-vel / 4.0`)
        p.swingTimer = 0;
        p.vx -= (p.vx / PHYSICS.SWING_NEUTRAL_DAMPING_DIV) * dt;
        p.vy -= (p.vy / PHYSICS.SWING_NEUTRAL_DAMPING_DIV) * dt;
        p.swingAdditive = Math.max(0, p.swingAdditive - 0.25 * dt);
      }

      // Gentle wind sway during pendulum swing
      if (wind.active) {
        const effStr = clampWindStrength(wind.strength);
        p.vx += wind.dir * PHYSICS.WIND_FORCE_AIR * PHYSICS.WALK_SPEED * 0.55 * effStr * dt;
      }

      // Clamp swing velocity magnitude to `SWING_RADIAL_CLAMP` (23.0 u/s)
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > PHYSICS.SWING_RADIAL_CLAMP) {
        const scale = PHYSICS.SWING_RADIAL_CLAMP / speed;
        p.vx *= scale;
        p.vy *= scale;
      }
    }

    p.lastJumpHeld = input.jump;
    return;
  }

  // --- 5. Anchor (Ground Counterweight) ---
  if (p.grounded && input.anchor) {
    if (p.action !== 'Anchor') {
      p.action = 'Anchor';
      p.dragForce = 0;
      p.dragNoWallTimer = 0;
      state.events.push({
        type: 'anchor_set',
        who: p.id,
        x: p.x,
        y: p.y,
        terrain: p.groundTerrain,
      });
    }

    // Allow jumping straight out of Anchor
    if (p.jumpBufferTimer > 0 && p.jumpCooldown <= 0) {
      performJump(state, p);
      p.lastJumpHeld = input.jump;
      return;
    }

    // On normal ground: locked solid (`vx = 0`); on ice under wind: gently slides `0.2`
    const onIce = (p.flags & PenguinFlag.OnIce) !== 0;
    if (onIce && wind.active) {
      p.vx = wind.dir * PHYSICS.WIND_FORCE_ANCHOR_ICE * clampWindStrength(wind.strength);
    } else {
      p.vx = 0;
    }

    p.lastJumpHeld = input.jump;
    return;
  } else if (p.action === 'Anchor') {
    p.action = p.grounded ? 'Idle' : 'Fall';
  }

  // --- 6. Jump (Grounded / Coyote / InfiniteJumps Assist) ---
  const canJump =
    p.jumpBufferTimer > 0 &&
    p.jumpCooldown <= 0 &&
    (p.grounded || p.coyoteTimer > 0 || state.assist.infiniteJumps);

  if (canJump) {
    performJump(state, p);
    applyStandardHorizontalPhysics(p, moveX, wind, dt);
    p.lastJumpHeld = input.jump;
    return;
  }

  // --- 7. Drag (Un-anchored Grounded Penguin Pulled by Dangling Partner) ---
  if (
    p.grounded &&
    partner.dangling &&
    partner.y < p.y - 0.5 &&
    ropeDist >= state.rope.maxDistance - 0.18
  ) {
    const pullDir: 1 | -1 = partner.x >= p.x ? 1 : -1;
    const groundAhead = hasGroundAhead(state, level, p.id, p.x, p.y, pullDir);

    if (!groundAhead) {
      p.dragNoWallTimer += dt;
    } else {
      p.dragNoWallTimer = Math.max(0, p.dragNoWallTimer - dt);
    }

    if (!groundAhead || p.dragNoWallTimer >= PHYSICS.DRAG_NO_WALL_TIME || Math.abs(partner.x - p.x) > 0.35) {
      if (p.action !== 'Drag') {
        p.action = 'Drag';
        p.dragForce = PHYSICS.DRAG_BASE_FORCE; // 1.0
      } else {
        p.dragForce += PHYSICS.DRAG_ESCALATION_PER_SEC * dt; // +1.5/s
      }

      const resistVx = moveX * PHYSICS.WALK_SPEED;
      const ledgeBoost = p.dragNoWallTimer >= PHYSICS.DRAG_NO_WALL_TIME ? 1.15 : 1.0;
      const dragVx = pullDir * p.dragForce * PHYSICS.DRAG_PULL_FORCE * ledgeBoost;
      const windVx = wind.active
        ? wind.dir * PHYSICS.WIND_FORCE_GROUND * PHYSICS.WALK_SPEED * clampWindStrength(wind.strength)
        : 0;
      p.vx = resistVx + dragVx + windVx;

      p.lastJumpHeld = input.jump;
      return;
    }
  } else {
    p.dragForce = 0;
    p.dragNoWallTimer = 0;
  }

  // --- 8. Normal Walk / Idle / Jump / Fall / FallHard ---
  applyStandardHorizontalPhysics(p, moveX, wind, dt);

  if (p.grounded) {
    p.fallTimer = 0;
    p.swingAngleDeg = 0;
    p.action = moveX !== 0 || Math.abs(p.vx) > 0.25 ? 'Walk' : 'Idle';
  } else {
    p.swingAngleDeg = 0;
    if (p.vy > 0) {
      p.action = 'Jump';
      p.fallTimer = 0;
    } else {
      p.fallTimer += dt;
      const hardThreshold = state.isOnline
        ? PHYSICS.FALL_HARD_TIME_ONLINE
        : PHYSICS.FALL_HARD_TIME;
      p.action = p.fallTimer >= hardThreshold ? 'FallHard' : 'Fall';
    }
  }

  p.lastJumpHeld = input.jump;
}
