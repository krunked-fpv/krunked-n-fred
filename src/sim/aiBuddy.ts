import {
  createEmptyPlayerInput,
  PHYSICS,
  type EmoteType,
  type LevelData,
  type PenguinState,
  type PlayerInput,
  type SimState,
  type Vec2,
} from '../contracts';
import {
  applyCollisionConstrainedDelta,
  getFeetOffsetY,
  getTileAt,
  hasGroundAhead,
  PENGUIN_BOX,
  probeGround,
  probeWallForGrab,
  type BodyBox,
} from './collision';

const ANCHOR_RESCUE_MIN_DROP_Y = 0.5;
const ANCHOR_RESCUE_MIN_ROPE_DIST = 1.85;
const PULL_ROPE_DANGLE_SEC = 2.2;
const WALL_CLING_SAVE_VY = -5.5;
const LAB_COOP_SEARCH_RADIUS = 4.0;
const WALL_CLING_STABILIZE_SEC = 0.35;

/** Narrow foot-tip box used alongside `hasGroundAhead` to detect cliff drop-offs before stepping off. */
const LEADING_FOOT_BOX: BodyBox = {
  halfW: 0.05,
  halfH: PENGUIN_BOX.halfH,
  offsetX: 0,
  offsetY: PENGUIN_BOX.offsetY,
};

const RPS_CHOICES: readonly EmoteType[] = ['rps_rock', 'rps_paper', 'rps_scissors'] as const;

interface AiBuddyMemory {
  lastTick: number;
  p1DangleSec: number;
  pullingRescue: boolean;
}

/**
 * WeakMap isolated per `SimState` instance: zero cross-run leakage, zero memory leaks,
 * and 100% deterministic progression from tick 0.
 */
const aiMemoryByState = new WeakMap<SimState, AiBuddyMemory>();

function getAiMemory(state: SimState): AiBuddyMemory {
  let mem = aiMemoryByState.get(state);
  if (!mem) {
    mem = { lastTick: state.tick, p1DangleSec: 0, pullingRescue: false };
    aiMemoryByState.set(state, mem);
  }
  return mem;
}

function isRpsEmote(emote: EmoteType): boolean {
  return emote === 'rps_rock' || emote === 'rps_paper' || emote === 'rps_scissors';
}

function computeMirroredEmote(state: SimState): EmoteType {
  const p1 = state.p1;
  const p2 = state.p2;
  if (p1.emote === 'none' || p1.emoteTimer <= 0 || p2.emoteTimer > 0 || p2.action === 'LandHard') {
    return 'none';
  }
  if (p1.emote === 'clap') {
    return 'clap';
  }
  if (isRpsEmote(p1.emote)) {
    const idx = ((state.tick % 3) + 3) % 3;
    return RPS_CHOICES[idx];
  }
  return 'none';
}

function hasStepOrWallAhead(
  state: SimState,
  level: LevelData,
  p2: PenguinState,
  dir: 1 | -1,
): boolean {
  const probe = applyCollisionConstrainedDelta(
    state,
    level,
    'p2',
    PENGUIN_BOX,
    p2.x,
    p2.y,
    dir * 0.48,
    0,
  );
  return probe.blockedX;
}

function hasJumpHeadroom(state: SimState, level: LevelData, p2: PenguinState): boolean {
  const probe = applyCollisionConstrainedDelta(
    state,
    level,
    'p2',
    PENGUIN_BOX,
    p2.x,
    p2.y,
    0,
    0.55,
  );
  return !probe.blockedY;
}

interface LabCoopTarget {
  x: number;
  y: number;
  holdHere: boolean;
}

function findLabCoopTarget(state: SimState, level: LevelData): LabCoopTarget | null {
  const p1 = state.p1;
  const p2 = state.p2;
  const feetY = p2.y + getFeetOffsetY(PENGUIN_BOX);
  const ropeDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);

  // Identify active Bachicha boss chain button if the boss fight is active
  let activeBossButtonId: string | null = null;
  if (state.boss.active && !state.boss.defeated && state.boss.chains.length > 0) {
    const chainIdx = state.boss.phaseOrder[state.boss.phaseIndex] ?? state.boss.phaseIndex;
    const activeChain = state.boss.chains[chainIdx];
    if (activeChain && !activeChain.broken) {
      activeBossButtonId = activeChain.buttonId;
    }
  }

  // 1. Hold position if P2 is currently holding down a 'pressure' button while P1 is nearby
  for (let i = 0; i < state.buttons.length; i++) {
    const btn = state.buttons[i];
    if (btn.kind !== 'pressure' || !btn.pressed) continue;
    const onBtnX = p2.x >= btn.x - 0.25 && p2.x <= btn.x + btn.w + 0.25;
    const onBtnY = Math.abs(feetY - (btn.y + btn.h)) <= 0.35;
    if (onBtnX && onBtnY && ropeDist < PHYSICS.ROPE_MAX_DISTANCE - 0.15 && p1.y < p2.y + 1.8) {
      return { x: btn.x + btn.w * 0.5, y: btn.y + btn.h - getFeetOffsetY(PENGUIN_BOX), holdHere: true };
    }
  }

  // 2. Move toward nearest unpressed Lab button within 4.0 u (prioritizing active boss chain button)
  let bestBtnScore = Infinity;
  let bestBtnTarget: LabCoopTarget | null = null;

  for (let i = 0; i < state.buttons.length; i++) {
    const btn = state.buttons[i];
    if (btn.pressed) continue;

    const bx = btn.x + btn.w * 0.5;
    const by = btn.y + btn.h;
    const dist = Math.hypot(bx - p2.x, by - p2.y);
    if (dist > LAB_COOP_SEARCH_RADIUS) continue;
    if (Math.abs(by - feetY) > 3.4) continue;

    // If rope is already near taut and P1 is pulling opposite to the button, yield to P1
    if (
      ropeDist >= PHYSICS.ROPE_MAX_DISTANCE - 0.15 &&
      Math.sign(bx - p2.x) !== 0 &&
      Math.sign(bx - p2.x) !== Math.sign(p1.x - p2.x)
    ) {
      continue;
    }

    const isBossPriority = activeBossButtonId !== null && btn.id === activeBossButtonId;
    const score = isBossPriority ? dist * 0.25 : dist;
    if (score < bestBtnScore) {
      bestBtnScore = score;
      bestBtnTarget = {
        x: bx,
        y: by - getFeetOffsetY(PENGUIN_BOX),
        holdHere: false,
      };
    }
  }

  if (bestBtnTarget) {
    return bestBtnTarget;
  }

  // 3. Move toward nearby active FredGround (`colorPlatforms` with owner === 'fred') within 4.0 u
  let bestPlatDist = Infinity;
  let bestPlatTarget: LabCoopTarget | null = null;

  for (let i = 0; i < state.colorPlatforms.length; i++) {
    const cp = state.colorPlatforms[i];
    if (!cp.active || cp.owner !== 'fred') continue;

    const fx = cp.x + cp.w * 0.5;
    const fy = cp.y + cp.h;
    const dist = Math.hypot(fx - p2.x, fy - p2.y);
    if (dist > LAB_COOP_SEARCH_RADIUS) continue;
    if (fy < feetY - 1.5 || fy > feetY + 3.2) continue;

    // Already standing on this FredGround platform
    const standingOn =
      p2.grounded &&
      (p2.platformEntityId === cp.id ||
        (p2.x >= cp.x + 0.1 && p2.x <= cp.x + cp.w - 0.1 && Math.abs(feetY - fy) <= 0.3));
    if (standingOn) {
      return null;
    }

    // Avoid fighting a taut tether if P1 has moved away from the platform
    if (
      ropeDist >= PHYSICS.ROPE_MAX_DISTANCE - 0.2 &&
      Math.sign(fx - p2.x) !== 0 &&
      Math.sign(fx - p2.x) !== Math.sign(p1.x - p2.x)
    ) {
      continue;
    }

    if (dist < bestPlatDist) {
      bestPlatDist = dist;
      bestPlatTarget = {
        x: fx,
        y: fy - getFeetOffsetY(PENGUIN_BOX),
        holdHere: false,
      };
    }
  }

  if (bestPlatTarget) {
    return bestPlatTarget;
  }

  // 4. Scan nearby `FRED_ONLY` tiles within 4.0 u if P2 isn't already standing on one
  const underTile = getTileAt(level, Math.floor(p2.x), Math.floor(feetY - 0.15));
  if (p2.grounded && underTile && underTile.kind === 'FRED_ONLY') {
    return null;
  }

  const tx0 = Math.floor(p2.x - LAB_COOP_SEARCH_RADIUS);
  const tx1 = Math.floor(p2.x + LAB_COOP_SEARCH_RADIUS);
  const ty0 = Math.floor(feetY - 1.5);
  const ty1 = Math.floor(feetY + 3.0);

  let bestTileDist = Infinity;
  let bestTileTarget: LabCoopTarget | null = null;

  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const tile = getTileAt(level, tx, ty);
      if (!tile || tile.kind !== 'FRED_ONLY') continue;
      // Must be a walkable top surface (space above is open)
      if (getTileAt(level, tx, ty + 1)) continue;

      const fx = tx + 0.5;
      const fy = ty + 1.0;
      const dist = Math.hypot(fx - p2.x, fy - p2.y);
      if (dist > LAB_COOP_SEARCH_RADIUS) continue;

      if (
        ropeDist >= PHYSICS.ROPE_MAX_DISTANCE - 0.2 &&
        Math.sign(fx - p2.x) !== 0 &&
        Math.sign(fx - p2.x) !== Math.sign(p1.x - p2.x)
      ) {
        continue;
      }

      if (dist < bestTileDist) {
        bestTileDist = dist;
        bestTileTarget = {
          x: fx,
          y: fy - getFeetOffsetY(PENGUIN_BOX),
          holdHere: false,
        };
      }
    }
  }

  return bestTileTarget;
}

function findUpcomingWaypointNearP1(state: SimState, level: LevelData): Vec2 | null {
  const waypoints = level.waypoints;
  if (waypoints.length === 0) return null;

  const p1 = state.p1;
  let bestIdx = 0;
  let bestDistSq = Infinity;

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    const dx = wp.x - p1.x;
    const dy = wp.y - p1.y;
    const dSq = dx * dx + dy * dy;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestIdx = i;
    }
  }

  if (bestDistSq > 64) {
    // Nearest waypoint is > 8 u away from P1
    return null;
  }

  const nearest = waypoints[bestIdx];
  const nextIdx = Math.min(waypoints.length - 1, bestIdx + 1);
  const nextWp = waypoints[nextIdx];

  // Advance to the upcoming waypoint when P1 is close to or past the nearest waypoint
  if (nextIdx > bestIdx && (bestDistSq <= 2.25 || p1.y >= nearest.y - 0.2)) {
    return nextWp;
  }
  return nearest;
}

/**
 * 100% deterministic, tether-aware AI Companion Fred controller for `solo_ai` mode
 * (and Lab/Time Trials when AI Buddy is enabled).
 */
export function computeAiBuddyInput(state: SimState, level: LevelData): PlayerInput {
  const out = createEmptyPlayerInput();
  if (state.mode === 'solo_jeff' || state.checkpoint.charlieActive) {
    return out;
  }

  const p1 = state.p1;
  const p2 = state.p2;
  const mem = getAiMemory(state);

  // 5. Emote Mirroring (runs harmoniously alongside idle, anchor, or following)
  out.emote = computeMirroredEmote(state);

  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dist = Math.hypot(dx, dy);

  const p1Airborne = !p1.grounded && p1.action !== 'Grab' && p1.action !== 'Grabbed';
  const p1Below = p1.y < p2.y - ANCHOR_RESCUE_MIN_DROP_Y;
  const p1DanglingBelow =
    p1Airborne &&
    p1Below &&
    (dist >= ANCHOR_RESCUE_MIN_ROPE_DIST || state.rope.taut || p1.action === 'Swing');

  // Update per-state deterministic P1 dangle timer
  if (state.tick < mem.lastTick || state.tick - mem.lastTick > 10) {
    mem.p1DangleSec = 0;
    mem.pullingRescue = false;
    mem.lastTick = state.tick;
  } else if (state.tick > mem.lastTick) {
    const dtElapsed = (state.tick - mem.lastTick) * PHYSICS.FIXED_DT;
    if (p1DanglingBelow || (mem.pullingRescue && p1Airborne && p1.y < p2.y - 0.15)) {
      mem.p1DangleSec += dtElapsed;
    } else {
      mem.p1DangleSec = 0;
      mem.pullingRescue = false;
    }
    mem.lastTick = state.tick;
  }

  const effectiveDangleSec = Math.max(p1.fallTimer, mem.p1DangleSec);

  // --- 1. Anchor Rescue & PullRope Assist ---
  // Continue an active PullRope rescue cleanly until P1 reaches P2's elevation or lands
  if (
    state.assist.pullingRope &&
    (p2.action === 'PullRope' || mem.pullingRescue) &&
    (p2.grounded || p2.action === 'Grab' || p2.action === 'PullRope') &&
    p1Airborne &&
    p1.y < p2.y - 0.15 &&
    dist > 0.35
  ) {
    mem.pullingRescue = true;
    out.pull = true;
    if (p2.action === 'Grab') {
      out.grab = true;
    }
    return out;
  }
  mem.pullingRescue = false;

  const p2GroundedOrAnchored =
    p2.grounded || p2.action === 'Anchor' || p2.action === 'Drag';

  // Hold Anchor steady through P1's entire pendulum upswing so we never break P1's launch!
  if (p2GroundedOrAnchored && p2.action === 'Anchor' && p1.action === 'Swing') {
    if (state.assist.pullingRope && effectiveDangleSec > PULL_ROPE_DANGLE_SEC && p1Below) {
      mem.pullingRescue = true;
      out.pull = true;
      return out;
    }
    out.anchor = true;
    return out;
  }

  if (p2GroundedOrAnchored && p1Airborne && p1Below && (dist >= ANCHOR_RESCUE_MIN_ROPE_DIST || state.rope.taut)) {
    if (state.assist.pullingRope && effectiveDangleSec > PULL_ROPE_DANGLE_SEC) {
      mem.pullingRescue = true;
      out.pull = true;
      return out;
    }
    out.anchor = true;
    return out;
  }

  // --- 2. Wall-Cling Save & Smart Wall-Cling Handling ---
  const grabRange = state.assist.betterGrab ? PHYSICS.GRAB_RANGE_BETTER : PHYSICS.GRAB_RANGE;

  if (p2.action === 'Grab') {
    // Stay clinging if anchoring a dangling P1 below
    if (p1Airborne && p1.y < p2.y - 0.3) {
      out.grab = true;
      if (state.assist.pullingRope && effectiveDangleSec > PULL_ROPE_DANGLE_SEC) {
        mem.pullingRescue = true;
        out.pull = true;
      }
      return out;
    }

    const clungDuration = p2.grabMaxStamina - p2.grabStamina;
    // Hold briefly to stabilize after catching a fall
    if (clungDuration < WALL_CLING_STABILIZE_SEC && p2.grabStamina > 1.0) {
      out.grab = true;
      return out;
    }

    // If P1 is safely grounded below and floor is within safe drop range, drop gently
    if (p1.grounded && p1.y < p2.y - 0.6 && p2.grabStamina > 1.0) {
      const safeDrop = probeGround(state, level, 'p2', PENGUIN_BOX, p2.x, p2.y, -1, 2.8);
      if (safeDrop.grounded) {
        out.grab = false;
        return out;
      }
    }

    // Otherwise wall-jump toward P1 once P1 is safe or stamina gets low
    if ((p1.grounded || p1.action === 'Grab' || p2.grabStamina < 2.5) && p2.jumpCooldown <= 0) {
      const awayDir: 1 | -1 =
        Math.abs(dx) > 0.3 ? (dx > 0 ? 1 : -1) : p2.wallSide === 1 ? -1 : 1;
      out.grab = true;
      out.moveX = awayDir;
      out.jump = true;
      out.jumpPressed = true;
      return out;
    }

    out.grab = true;
    return out;
  }

  // Trigger Wall-Cling Save when falling fast next to a grabbable cliff wall
  if (
    !p2.grounded &&
    p2.vy < WALL_CLING_SAVE_VY &&
    p2.grabStamina > 0.5 &&
    p2.jumpCooldown <= 0
  ) {
    const wall = probeWallForGrab(state, level, p2, grabRange);
    if (wall.found) {
      out.grab = true;
      return out;
    }
  }

  // --- 3 & 4. Lab Co-Op Cooperation OR Waypoint & Partner Following ---
  const labTarget = findLabCoopTarget(state, level);
  let targetX = p1.x;
  let targetY = p1.y;
  let isLabTarget = false;

  if (labTarget) {
    if (labTarget.holdHere) {
      out.moveX = 0;
      return out;
    }
    targetX = labTarget.x;
    targetY = labTarget.y;
    isLabTarget = true;
  } else {
    const upcomingWp = findUpcomingWaypointNearP1(state, level);
    if (upcomingWp) {
      const p1Moving = Math.abs(p1.vx) > 0.5;
      const wpDxFromP1 = upcomingWp.x - p1.x;
      const wpDyFromP1 = upcomingWp.y - p1.y;

      if (dist > 1.1 || Math.abs(dy) > 0.75) {
        // Follow P1 cleanly while gently biasing toward the upcoming waypoint ledge center
        const sameDir = Math.sign(wpDxFromP1) === Math.sign(dx);
        const bias = sameDir ? Math.max(-0.45, Math.min(0.45, wpDxFromP1 * 0.25)) : 0;
        targetX = p1.x + bias;
        targetY = p1.y + (wpDyFromP1 > 0.4 ? Math.min(0.4, wpDyFromP1 * 0.25) : 0);
      } else if (p1Moving && Math.sign(p1.vx) === Math.sign(wpDxFromP1)) {
        // Move cooperatively alongside P1 toward the upcoming waypoint without over-pulling tether
        const leadX = Math.max(-0.85, Math.min(0.85, wpDxFromP1));
        targetX = p1.x + leadX;
        targetY = p1.y + Math.max(-0.5, Math.min(0.8, wpDyFromP1));
      } else {
        targetX = p1.x;
        targetY = p1.y;
      }
    }
  }

  const toTargetX = targetX - p2.x;
  const toTargetY = targetY - p2.y;
  const followDeadzone = isLabTarget
    ? 0.22
    : !p1.grounded || Math.abs(p1.vx) > 0.8 || Math.abs(toTargetY) >= 0.65
      ? 0.38
      : 0.85;

  let desiredDir: -1 | 0 | 1 =
    toTargetX > followDeadzone ? 1 : toTargetX < -followDeadzone ? -1 : 0;

  // --- Grounded Cliff-Edge Safety & Smart Step/Gap Jumping ---
  if (p2.grounded) {
    let wantJump = false;

    if (desiredDir !== 0) {
      const broadGroundAhead = hasGroundAhead(state, level, 'p2', p2.x, p2.y, desiredDir);
      const leadingFootProbe = probeGround(
        state,
        level,
        'p2',
        LEADING_FOOT_BOX,
        p2.x + desiredDir * (PENGUIN_BOX.halfW + 0.22),
        p2.y,
        0,
        0.35,
      );
      const groundAhead = broadGroundAhead && leadingFootProbe.grounded;
      const wallAhead = hasStepOrWallAhead(state, level, p2, desiredDir);

      if (!groundAhead) {
        // Check whether this drop-off is a cliff to avoid vs a jumpable gap to P1 / Lab target
        const edgeX = p2.x + desiredDir * (PENGUIN_BOX.halfW + 0.25);
        const p1AcrossGap =
          p1.grounded &&
          (desiredDir === 1 ? p1.x > edgeX + 0.4 : p1.x < edgeX - 0.4) &&
          p1.y >= p2.y - 2.0 &&
          Math.abs(p1.x - p2.x) <= 4.2;

        const p1JumpingAcross =
          !p1.grounded &&
          p1.y >= p2.y - 0.3 &&
          Math.sign(p1.x - p2.x) === desiredDir &&
          Math.abs(p1.x - p2.x) >= 0.9;

        const labTargetHasLanding =
          isLabTarget &&
          Math.abs(toTargetX) <= 3.6 &&
          toTargetY >= -1.8 &&
          toTargetY <= 3.0 &&
          probeGround(state, level, 'p2', PENGUIN_BOX, targetX, targetY, -1, 1.0).grounded;

        if (p1AcrossGap || p1JumpingAcross || labTargetHasLanding) {
          wantJump = true;
        } else if (p1.grounded) {
          // Avoid walking off cliffs while P1 is grounded!
          desiredDir = 0;
        } else {
          // P1 is airborne nearby: hold at ledge instead of blindly stepping off
          desiredDir = 0;
        }
      } else if (wallAhead && hasJumpHeadroom(state, level, p2)) {
        // Step / ledge wall directly ahead: jump up onto it
        wantJump = true;
      }
    }

    // Jump when P1 jumps nearby or when P1 / target ledge is clearly above P2
    if (!wantJump && p2.jumpCooldown <= 0 && hasJumpHeadroom(state, level, p2)) {
      const p1JumpedNearby =
        p1.action === 'Jump' && p1.vy > 4.0 && (p1.y >= p2.y - 0.15 || dist > 1.35);
      const targetAbove =
        (toTargetY > 0.65 && Math.abs(toTargetX) <= 4.2) ||
        (p1.y > p2.y + 0.7 && dist <= 3.5);

      if (p1JumpedNearby || targetAbove) {
        wantJump = true;
      }
    }

    out.moveX = desiredDir;
    if (wantJump && p2.jumpCooldown <= 0) {
      out.jump = true;
      out.jumpPressed = true;
    }
    return out;
  }

  // --- Airborne Steering Toward Partner / Target Ledge ---
  out.moveX = desiredDir;
  return out;
}
