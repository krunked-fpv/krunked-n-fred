import {
  createEmptyPlayerInput,
  PHYSICS,
  WORLD,
  type AssistSettings,
  type BiomeId,
  type BossState,
  type CreateSimOptions,
  type InputFrame,
  type LevelData,
  type PlayerInput,
  type SimEvent,
  type SimHooks,
  type SimModulePort,
  type SimState,
  type WindSample,
} from '../contracts';
import {
  updateCheckpointAndCharlie,
  updateEmotes,
  updatePenguinAction,
} from './actions';
import { createCameraState, updateCamera } from './camera';
import { hashSimState } from './hash';
import {
  carryRiders,
  createJeffState,
  createPenguinState,
  integratePenguin,
  refreshPostTetherGrounding,
  resetScarfNodes,
  updateJeff,
  updateScarf,
} from './penguinPhysics';
import { normalizeSeed } from './prng';
import {
  createInitialRopeState,
  resetVerletRope,
  solveTetherConstraint,
  updateVerletRope,
} from './ropeSolver';

const DEFAULT_SEED = 0x51a7c0de;
const DEFAULT_ASSIST: AssistSettings = {
  infiniteJumps: false,
  pullingRope: false,
  checkPoints: false,
  betterGrab: false,
};

function hasAnyAssistEnabled(assist: AssistSettings): boolean {
  return (
    assist.infiniteJumps ||
    assist.pullingRope ||
    assist.checkPoints ||
    assist.betterGrab
  );
}

function computeBiome(level: LevelData, x: number, y: number): BiomeId {
  if (level.mode === 'lab_dlc') {
    if (level.bossArena && y >= level.bossArena.minY) {
      return 'boss';
    }
    return 'lab';
  }
  if (y < 8 && x <= 3) {
    return 'village';
  }
  if (y < WORLD.ZONE2_START_Y) {
    return 'foothills';
  }
  if (y < WORLD.ZONE3_START_Y) {
    return 'mines';
  }
  if (y < WORLD.ZONE4_START_Y) {
    return 'crags';
  }
  return 'summit';
}

function sampleWindFallback(state: SimState, x: number, y: number): WindSample {
  for (let i = 0; i < state.windZones.length; i++) {
    const z = state.windZones[i];
    if (x >= z.minX && x <= z.maxX && y >= z.minY && y <= z.maxY) {
      return {
        active: z.constant || z.phase === 'active',
        dir: z.dir,
        strength: z.strength,
      };
    }
  }
  return { active: false, dir: state.windDir, strength: 0 };
}

function sampleWind(
  state: SimState,
  hooks: SimHooks | undefined,
  x: number,
  y: number,
): WindSample {
  if (hooks?.getWindAt) {
    return hooks.getWindAt(state, x, y);
  }
  return sampleWindFallback(state, x, y);
}

function isPlayerInputEmpty(inp: PlayerInput): boolean {
  return (
    inp.moveX === 0 &&
    inp.moveY === 0 &&
    !inp.jump &&
    !inp.jumpPressed &&
    !inp.grab &&
    !inp.anchor &&
    !inp.pull &&
    !inp.flag &&
    !inp.callCharlie &&
    inp.emote === 'none'
  );
}

/**
 * Lightweight deterministic AI companion controller for `solo_ai` mode when P2 has no manual input.
 */
function computeAiBuddyInput(state: SimState): PlayerInput {
  const out = createEmptyPlayerInput();
  const p1 = state.p1;
  const p2 = state.p2;
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dist = Math.hypot(dx, dy);

  // If P1 is dangling below P2 on a taut rope, anchor cleanly so P1 can swing!
  if (!p1.grounded && p1.action !== 'Grab' && p2.grounded && dy < -0.6 && dist > 1.8) {
    out.anchor = true;
    return out;
  }

  // Follow P1 horizontally once more than 1.0 u away
  if (Math.abs(dx) > 1.05) {
    out.moveX = dx > 0 ? 1 : -1;
  }

  // Hop up when P1 is above P2 and P2 is grounded
  if (p2.grounded && dy > 0.75 && p2.jumpCooldown <= 0) {
    out.jump = true;
    out.jumpPressed = true;
  }

  // Grab wall if falling fast near one
  if (!p2.grounded && p2.vy < -4.0 && p2.grabStamina > 2.0) {
    out.grab = true;
  }

  return out;
}

function createInitialBossState(level: LevelData): BossState {
  if (!level.bossArena) {
    return {
      active: false,
      defeated: false,
      phaseIndex: 0,
      phaseOrder: [0, 1, 2, 3],
      chains: [],
      laserSweepAngle: 0,
      attackTimer: 0,
      celebrationTimer: 0,
    };
  }
  return {
    active: false,
    defeated: false,
    phaseIndex: 0,
    phaseOrder: [0, 1, 2, 3],
    chains: level.bossArena.chains.map((c) => ({ ...c })),
    laserSweepAngle: 0,
    attackTimer: 0,
    celebrationTimer: 0,
  };
}

/**
 * Allocates a fresh, 100% deterministic initial simulation state for `level`.
 */
export function createSimState(level: LevelData, options?: CreateSimOptions): SimState {
  const seed = normalizeSeed(options?.seed ?? DEFAULT_SEED);
  const assist: AssistSettings = {
    ...DEFAULT_ASSIST,
    ...options?.assist,
  };
  const isOnline = options?.isOnline ?? level.mode === 'online_coop';
  const aiBuddyEnabled = options?.aiBuddyEnabled ?? level.mode === 'solo_ai';
  const isSoloJeff = level.mode === 'solo_jeff';

  const p1 = createPenguinState('p1', level.spawnP1.x, level.spawnP1.y, assist.betterGrab);
  const p2 = createPenguinState('p2', level.spawnP2.x, level.spawnP2.y, assist.betterGrab);
  const jeff = createJeffState(isSoloJeff, level.spawnP2.x, level.spawnP2.y);

  const rope = createInitialRopeState(
    p1.x,
    p1.y,
    isSoloJeff ? jeff.x : p2.x,
    isSoloJeff ? jeff.y : p2.y,
  );

  const midX = isSoloJeff ? p1.x : (p1.x + p2.x) * 0.5;
  const midY = isSoloJeff ? p1.y : (p1.y + p2.y) * 0.5;
  const startAlt = Math.max(0, midY - level.spawnP1.y);

  return {
    tick: 0,
    seed,
    rngState: seed,
    levelId: level.id,
    mode: level.mode,
    timeTrialIndex: level.timeTrialIndex ?? null,
    elapsedSec: 0,
    isOnline,
    aiBuddyEnabled,
    assist,
    assistEverUsedInRun: hasAnyAssistEnabled(assist),
    p1,
    p2,
    jeff,
    rope,
    checkpoint: {
      placed: false,
      x: level.spawnP1.x,
      y: level.spawnP1.y,
      charlieActive: false,
      charlieProgress: 0,
      charlieStartX: level.spawnP1.x,
      charlieStartY: level.spawnP1.y,
    },
    camera: createCameraState(level, midX, midY),
    altitude: startAlt,
    maxAltitude: startAlt,
    fallsCount: 0,
    jumpsCount: 0,
    currentBiome: computeBiome(level, midX, midY),
    windActive: false,
    windDir: 1,
    windPhase: 'wait',
    fallingBlocks: level.fallingBlocks.map((b) => ({
      ...b,
      state: 'intact',
      timer: 0,
    })),
    movablePlatforms: level.movablePlatforms.map((m) => ({
      ...m,
      x: m.startX,
      y: m.startY,
      prevX: m.startX,
      prevY: m.startY,
      vx: 0,
      vy: 0,
      t: 0,
      dir: 1,
      active: m.mode === 'CONTINUE' || m.mode === 'ENDS_STOP',
      pauseTimer: 0,
    })),
    swingPlatforms: level.swingPlatforms.map((sp) => {
      const initX = sp.pivotX - sp.w * 0.5;
      const initY = sp.pivotY - sp.radius - sp.h;
      return {
        ...sp,
        x: initX,
        y: initY,
        prevX: initX,
        prevY: initY,
        vx: 0,
        vy: 0,
        angle: 0,
        targetAngle: 0,
        angularVel: 0,
      };
    }),
    windZones: level.windZones.map((wz) => ({
      ...wz,
      phase: wz.constant ? 'active' : 'wait',
      timer: 0,
    })),
    circuits: level.circuits.map((c) => ({
      ...c,
      powered: false,
    })),
    buttons: level.buttons.map((b) => ({
      ...b,
      pressed: false,
      timer: 0,
      wasStepped: false,
    })),
    lasers: level.lasers.map((l) => ({
      ...l,
      active: l.invertPower,
      cooldown: 0,
    })),
    tronchos: level.tronchos.map((tr) => ({
      ...tr,
      x: tr.baseX,
      y: tr.baseY,
      prevX: tr.baseX,
      prevY: tr.baseY,
      vx: 0,
      vy: 0,
      t: 0,
      extended: false,
    })),
    colorPlatforms: level.colorPlatforms.map((cp) => ({
      ...cp,
      active: !cp.circuitId,
    })),
    collectibles: level.collectibles.map((c) => ({
      ...c,
      collected: false,
    })),
    boss: createInitialBossState(level),
    completed: false,
    completionTimeSec: 0,
    completionMedal: 'none',
    events: [],
  };
}

/**
 * Cleanly warps P1, P2 (and Jeff if active), resets rope, scarves, timers, and snaps camera.
 */
export function warpPlayers(state: SimState, x: number, y: number): void {
  const p1X = x - 0.6;
  const p2X = x + 0.6;

  const resetPenguinAt = (p: SimState['p1'], px: number, py: number): void => {
    p.x = px;
    p.y = py;
    p.prevX = px;
    p.prevY = py;
    p.vx = 0;
    p.vy = 0;
    p.action = 'Idle';
    p.flags = 0;
    p.grounded = false;
    p.groundTerrain = 'DEFAULT';
    p.wallSide = 0;
    p.wallTerrain = 'DEFAULT';
    p.wallEntityId = null;
    p.platformEntityId = null;
    p.coyoteTimer = 0;
    p.jumpCooldown = 0;
    p.jumpBufferTimer = 0;
    p.fallTimer = 0;
    p.landHardTimer = 0;
    p.grabStamina = p.grabMaxStamina;
    p.grabRedTint = 0;
    p.swingTimer = 0;
    p.swingRestTimer = 0;
    p.swingFallTimer = 0;
    p.swingAdditive = 0;
    p.swingAngleDeg = 0;
    p.dragForce = 0;
    p.dragNoWallTimer = 0;
    p.iceVelX = 0;
    p.iceLerpT = 1;
    p.pullRopeTimer = 0;
    p.callCharlieTimer = 0;
    p.carryingJeff = false;
    resetScarfNodes(p);
  };

  resetPenguinAt(state.p1, p1X, y);
  resetPenguinAt(state.p2, p2X, y);

  if (state.jeff.active) {
    state.jeff.x = p2X;
    state.jeff.y = y;
    state.jeff.prevX = p2X;
    state.jeff.prevY = y;
    state.jeff.vx = 0;
    state.jeff.vy = 0;
    state.jeff.grounded = false;
    state.jeff.heldByP1 = false;
    state.jeff.grabbedWallSide = 0;
    state.jeff.grabTimer = PHYSICS.GRAB_JEFF_TIMER;
    state.jeff.anchored = false;
    state.jeff.platformEntityId = null;
    state.jeff.tossCooldown = 0;
  }

  state.checkpoint.charlieActive = false;
  state.checkpoint.charlieProgress = 0;
  state.rope.maxDistance = PHYSICS.ROPE_MAX_DISTANCE;
  resetVerletRope(state);

  state.camera.x = x;
  state.camera.y = y + 0.85;
  state.camera.prevX = x;
  state.camera.prevY = y + 0.85;
  state.camera.targetX = x;
  state.camera.targetY = y + 0.85;
  state.camera.shakeTimer = 0;
  state.camera.shakeMag = 0;
}

/**
 * Advances the deterministic 50 Hz simulation by exactly one fixed timestep (`PHYSICS.FIXED_DT = 0.02s`).
 */
export function stepSim(
  state: SimState,
  level: LevelData,
  input: InputFrame,
  hooks?: SimHooks,
): SimEvent[] {
  const dt = PHYSICS.FIXED_DT;
  state.events = [];

  if (hasAnyAssistEnabled(state.assist)) {
    state.assistEverUsedInRun = true;
  }

  // Snapshot previous positions for smooth 60/120 FPS renderer interpolation
  state.p1.prevX = state.p1.x;
  state.p1.prevY = state.p1.y;
  state.p2.prevX = state.p2.x;
  state.p2.prevY = state.p2.y;
  if (state.jeff.active) {
    state.jeff.prevX = state.jeff.x;
    state.jeff.prevY = state.jeff.y;
  }

  // Phase 1: World hazards, circuits, and boss updates
  hooks?.updateHazards?.(state, level, dt);
  hooks?.updateCircuits?.(state, level, dt);
  hooks?.updateBoss?.(state, level, dt);

  // Phase 2: Carry riders standing on moving/swing platforms or clinging to Tronchos
  carryRiders(state, level);

  // Phase 3: Assist Checkpoint Flag, Call Charlie flight, and Emotes / RPS clash
  const p1Input = input.p1;
  const p2Input =
    state.aiBuddyEnabled && state.mode !== 'solo_jeff' && isPlayerInputEmpty(input.p2)
      ? computeAiBuddyInput(state)
      : input.p2;

  updateCheckpointAndCharlie(state, p1Input, p2Input, dt);
  updateEmotes(state, p1Input, p2Input, dt);

  // Sample wind at actors
  const wind1 = sampleWind(state, hooks, state.p1.x, state.p1.y);
  const wind2 = sampleWind(state, hooks, state.p2.x, state.p2.y);

  // Phase 4 & 5: Penguin FSM + Swept Integration (skipped while Charlie carries both penguins)
  if (!state.checkpoint.charlieActive) {
    updatePenguinAction(state, level, state.p1, p1Input, wind1, dt);
    if (state.mode !== 'solo_jeff') {
      updatePenguinAction(state, level, state.p2, p2Input, wind2, dt);
    }

    // Restore rope maxDistance smoothly when nobody is actively pulling rope
    if (
      state.p1.action !== 'PullRope' &&
      state.p2.action !== 'PullRope' &&
      state.rope.maxDistance < PHYSICS.ROPE_MAX_DISTANCE
    ) {
      state.rope.maxDistance = Math.min(
        PHYSICS.ROPE_MAX_DISTANCE,
        state.rope.maxDistance + 12.0 * dt,
      );
    }

    integratePenguin(state, level, state.p1, wind1, dt);
    if (state.mode === 'solo_jeff' && state.jeff.active) {
      const windJeff = sampleWind(state, hooks, state.jeff.x, state.jeff.y);
      updateJeff(state, level, p1Input, windJeff, dt);
      // Keep inactive P2 parked alongside Jeff for any UI/camera safety
      state.p2.x = state.jeff.x;
      state.p2.y = state.jeff.y;
      state.p2.prevX = state.jeff.prevX;
      state.p2.prevY = state.jeff.prevY;
    } else {
      integratePenguin(state, level, state.p2, wind2, dt);
    }

    // Phase 6: Unilateral 20-iteration PBD tether solver + post-tether ground sync
    solveTetherConstraint(state, level);
    refreshPostTetherGrounding(state, level, state.p1);
    if (state.mode !== 'solo_jeff') {
      refreshPostTetherGrounding(state, level, state.p2);
    }
  }

  // Phase 7: Visual 35-node Verlet rope & 5-node flapping scarves
  updateVerletRope(state);
  updateScarf(state.p1, wind1, dt);
  if (state.mode !== 'solo_jeff') {
    updateScarf(state.p2, wind2, dt);
  }

  // Phase 8: Tick, altitude, biome, camera, and progression hooks
  state.tick += 1;
  if (!state.completed) {
    state.elapsedSec = state.tick * dt;
  }

  const midX = state.mode === 'solo_jeff' ? state.p1.x : (state.p1.x + state.p2.x) * 0.5;
  const midY = state.mode === 'solo_jeff' ? state.p1.y : (state.p1.y + state.p2.y) * 0.5;
  const rawAlt = midY - 1.56125;
  state.altitude = rawAlt > 0 ? rawAlt : 0;
  if (state.altitude > state.maxAltitude) {
    state.maxAltitude = state.altitude;
  }
  state.currentBiome = computeBiome(level, midX, midY);

  updateCamera(state, level, dt);
  hooks?.updateProgression?.(state, level, state.events);

  return state.events;
}

export const simModule: SimModulePort = {
  createSimState,
  stepSim,
  warpPlayers,
  hashSimState,
};
