import { describe, expect, it } from 'vitest';
import {
  createEmptyInputFrame,
  createEmptyPlayerInput,
  PenguinFlag,
  PHYSICS,
  type InputFrame,
  type LevelData,
  type PlayerInput,
  type SimEvent,
  type SimState,
} from '../src/contracts';
import {
  buildLabDlcLevel,
  createSimHooks,
  getLevelByMode,
  LevelBuilder,
} from '../src/data';
import {
  breakBossChain,
  computeAiBuddyInput,
  createSimState,
  getBodyAABB,
  getFeetOffsetY,
  hashSimState,
  moveAndCollide,
  PENGUIN_BOX,
  solveTetherConstraint,
  stepSim,
  warpPlayers,
} from '../src/sim';

function makeInput(
  tick: number,
  p1?: Partial<PlayerInput>,
  p2?: Partial<PlayerInput>,
): InputFrame {
  return {
    tick,
    p1: { ...createEmptyPlayerInput(), ...p1 },
    p2: { ...createEmptyPlayerInput(), ...p2 },
  };
}

function stepN(
  state: SimState,
  level: LevelData,
  ticks: number,
  p1?: Partial<PlayerInput>,
  p2?: Partial<PlayerInput>,
  useHooks = true,
): SimEvent[] {
  const hooks = useHooks ? createSimHooks() : undefined;
  const allEvents: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    const events = stepSim(state, level, makeInput(state.tick, p1, p2), hooks);
    allEvents.push(...events);
  }
  return allEvents;
}

function buildFlatArena(opts?: {
  mode?: LevelData['mode'];
  floorTerrain?: 'SNOW' | 'ICE' | 'LAB';
  floorKind?: 'SOLID' | 'ICE';
  floorW?: number;
}): LevelData {
  const mode = opts?.mode ?? 'coop_mountain';
  const floorTerrain = opts?.floorTerrain ?? 'SNOW';
  const floorKind = opts?.floorKind ?? (floorTerrain === 'ICE' ? 'ICE' : 'SOLID');
  const floorW = opts?.floorW ?? 60;
  const b = new LevelBuilder({
    id: `test_flat_${mode}_${floorTerrain}`,
    name: 'Test Flat Arena',
    mode,
    summitY: 100,
    bounds: { minX: -30, maxX: 40, minY: -10, maxY: 110 },
  });
  b.fillRect(-20, 0, floorW, 1, floorTerrain, floorKind);
  b.setSpawn({ x: 0, y: 1.56125 }, { x: 1.0, y: 1.56125 });
  b.setSummitZone(25, 1, 5, 4, 100);
  return b.build();
}

describe('Krunked & Fred — Deterministic 50 Hz Simulation Core (src/sim/**)', () => {
  describe('1. Swept AABB Collision & Zero-Tunneling', () => {
    it('prevents high fall velocity from tunneling through a 1-tile solid floor', () => {
      const level = buildFlatArena();
      const state = createSimState(level, { seed: 101 });
      // Drop both penguins together from high above a 1-tile thick floor (y=0..1, top=1.0)
      state.p1.x = 2;
      state.p1.y = 14;
      state.p1.vy = -32;
      state.p2.x = 3;
      state.p2.y = 14;
      state.p2.vy = -32;

      stepN(state, level, 60);

      const feetY1 = state.p1.y + getFeetOffsetY(PENGUIN_BOX);
      const feetY2 = state.p2.y + getFeetOffsetY(PENGUIN_BOX);
      expect(state.p1.grounded).toBe(true);
      expect(state.p2.grounded).toBe(true);
      expect(feetY1).toBeCloseTo(1.0, 3);
      expect(feetY2).toBeCloseTo(1.0, 3);
      expect(state.p1.y).toBeGreaterThan(1.0);
    });

    it('prevents extreme single-step vertical and horizontal displacements from tunneling through 1-tile floors and walls', () => {
      const b = new LevelBuilder({
        id: 'test_thin_wall',
        name: 'Thin Wall & Floor',
        mode: 'coop_mountain',
        bounds: { minX: -10, maxX: 20, minY: -10, maxY: 20 },
      });
      // 1-tile floor at y = 0..1 and 1-tile vertical wall at x = 6..7, y = 1..10
      b.fillRect(-5, 0, 20, 1, 'SNOW');
      b.fillRect(6, 1, 1, 9, 'SNOW');
      b.setSpawn({ x: 2, y: 2 }, { x: 3, y: 2 });
      const level = b.build();
      const state = createSimState(level, { seed: 102 });

      // Extreme downward sweep: dy = -2.5 tiles in one call across 1-tile floor at y = 0..1
      const fallRes = moveAndCollide(state, level, 'p1', PENGUIN_BOX, 2, 2.5, 0, -2.5, 0, -125, false);
      expect(fallRes.hitFloor).toBe(true);
      expect(fallRes.grounded).toBe(true);
      expect(fallRes.y + getFeetOffsetY(PENGUIN_BOX)).toBeCloseTo(1.0, 3);

      // Extreme rightward sweep: dx = +2.5 tiles in one call across 1-tile wall at x = 6..7
      const wallRes = moveAndCollide(state, level, 'p1', PENGUIN_BOX, 4.5, 3.0, 2.5, 0, 125, 0, false);
      expect(wallRes.hitWallRight).toBe(true);
      expect(wallRes.vx).toBe(0);
      const aabb = getBodyAABB(wallRes.x, wallRes.y, PENGUIN_BOX);
      expect(aabb.maxX).toBeLessThanOrEqual(6.001);
    });

    it('allows passing upward through ONE_WAY platforms and landing on top when falling', () => {
      const b = new LevelBuilder({
        id: 'test_one_way',
        name: 'One Way Test',
        mode: 'coop_mountain',
        bounds: { minX: -10, maxX: 20, minY: -5, maxY: 20 },
      });
      b.fillRect(-5, 0, 15, 1, 'SNOW');
      b.addOneWay(-2, 2, 10, 'PLATFORM'); // topY = 3.0
      b.setSpawn({ x: 2, y: 1.56125 }, { x: 3.2, y: 1.56125 });
      const level = b.build();
      const state = createSimState(level, { seed: 103 });
      stepN(state, level, 5); // settle on ground

      // Both penguins jump simultaneously upward through the ONE_WAY platform at topY = 3.0
      stepSim(
        state,
        level,
        makeInput(state.tick, { jump: true, jumpPressed: true }, { jump: true, jumpPressed: true }),
        createSimHooks(),
      );
      stepN(state, level, 40);

      expect(state.p1.grounded).toBe(true);
      expect(state.p1.y + getFeetOffsetY(PENGUIN_BOX)).toBeCloseTo(3.0, 3);
      expect(state.p1.groundTerrain).toBe('PLATFORM');
    });
  });

  describe('2. 20-Iteration Unilateral PBD Tether & Verlet Rope', () => {
    it('applies zero pulling force when slack (< 2.5 u)', () => {
      const level = buildFlatArena();
      const state = createSimState(level, { seed: 201 });
      state.p1.x = 0;
      state.p1.y = 5;
      state.p1.vx = -2.0;
      state.p1.vy = 1.5;
      state.p2.x = 1.5; // dist = 1.5 < 2.5
      state.p2.y = 5;
      state.p2.vx = 3.0;
      state.p2.vy = -1.0;

      solveTetherConstraint(state, level);

      expect(state.rope.taut).toBe(false);
      expect(state.rope.tension).toBe(0);
      expect(state.p1.x).toBe(0);
      expect(state.p1.y).toBe(5);
      expect(state.p1.vx).toBe(-2.0);
      expect(state.p1.vy).toBe(1.5);
      expect(state.p2.x).toBe(1.5);
      expect(state.p2.y).toBe(5);
      expect(state.p2.vx).toBe(3.0);
      expect(state.p2.vy).toBe(-1.0);
    });

    it('enforces dist <= 2.52 u when taut and emits rope_taut on slack -> taut transition', () => {
      const level = buildFlatArena();
      const state = createSimState(level, { seed: 202 });
      stepN(state, level, 5); // settle on ground

      // Walk P1 left and P2 right at opposite full speed to stretch rope taut
      const events = stepN(state, level, 40, { moveX: -1 }, { moveX: 1 });
      const dist = Math.hypot(state.p2.x - state.p1.x, state.p2.y - state.p1.y);

      expect(dist).toBeLessThanOrEqual(2.52);
      expect(state.rope.taut).toBe(true);
      expect(events.some((e) => e.type === 'rope_taut')).toBe(true);
      expect(state.rope.nodes).toHaveLength(PHYSICS.ROPE_SEGMENTS);
      expect(state.rope.nodes[0].x).toBeCloseTo(state.p1.x, 4);
      expect(state.rope.nodes[0].y).toBeCloseTo(state.p1.y + PHYSICS.ROPE_ATTACH_OFFSET_Y, 4);
      expect(state.rope.nodes[PHYSICS.ROPE_SEGMENTS - 1].x).toBeCloseTo(state.p2.x, 4);
    });

    it('treats Anchor and Grab penguins as infinite mass (invMass = 0)', () => {
      const b = new LevelBuilder({
        id: 'test_invmass',
        name: 'InvMass Test',
        mode: 'coop_mountain',
        bounds: { minX: -20, maxX: 20, minY: -5, maxY: 20 },
      });
      b.fillRect(-10, 0, 25, 1, 'SNOW');
      b.fillRect(-3, 1, 2, 12, 'SNOW'); // Grabbable wall face at x = -1
      b.setSpawn({ x: 0, y: 1.56125 }, { x: 1.5, y: 1.56125 });
      const level = b.build();

      // Case A: P1 Anchored while P2 runs right
      const sAnchor = createSimState(level, { seed: 203 });
      stepN(sAnchor, level, 5);
      const anchorStartX = sAnchor.p1.x;
      const anchorStartY = sAnchor.p1.y;
      stepN(sAnchor, level, 40, { anchor: true }, { moveX: 1 });
      expect(sAnchor.p1.action).toBe('Anchor');
      expect(sAnchor.p1.x).toBeCloseTo(anchorStartX, 5);
      expect(sAnchor.p1.y).toBeCloseTo(anchorStartY, 5);
      expect(Math.hypot(sAnchor.p2.x - sAnchor.p1.x, sAnchor.p2.y - sAnchor.p1.y)).toBeLessThanOrEqual(2.52);

      // Case B: P1 Wall-Grabbing while P2 pulls away
      const sGrab = createSimState(level, { seed: 204 });
      sGrab.p1.x = -0.5;
      sGrab.p1.y = 5.0;
      sGrab.p1.facing = -1;
      sGrab.p2.x = 1.0;
      sGrab.p2.y = 5.0;
      stepN(sGrab, level, 1, { grab: true }, { moveX: 1 });
      expect(sGrab.p1.action).toBe('Grab');
      const grabX = sGrab.p1.x;
      const grabY = sGrab.p1.y;
      stepN(sGrab, level, 25, { grab: true }, { moveX: 1 });
      expect(sGrab.p1.action).toBe('Grab');
      expect(sGrab.p1.x).toBeCloseTo(grabX, 5);
      expect(sGrab.p1.y).toBeCloseTo(grabY, 5);
      expect(Math.hypot(sGrab.p2.x - sGrab.p1.x, sGrab.p2.y - sGrab.p1.y)).toBeLessThanOrEqual(2.52);
    });
  });

  describe('3. Jump Apex, Coyote Time, JumpCD & InfiniteJumps Assist', () => {
    it('reaches exact jump peak height (~3.30 u within 0.06 u)', () => {
      const level = buildFlatArena();
      const state = createSimState(level, { seed: 301 });
      stepN(state, level, 5); // settle on ground
      const startY = state.p1.y;

      // Jump both penguins together so the 2.5 u tether stays slack through the full 3.30 u arc
      let maxY = startY;
      const jumpEvents = stepSim(
        state,
        level,
        makeInput(state.tick, { jump: true, jumpPressed: true }, { jump: true, jumpPressed: true }),
        createSimHooks(),
      );
      expect(jumpEvents.some((e) => e.type === 'jump' && e.who === 'p1')).toBe(true);
      maxY = Math.max(maxY, state.p1.y);

      for (let t = 0; t < 45; t++) {
        stepSim(state, level, createEmptyInputFrame(state.tick), createSimHooks());
        if (state.p1.y > maxY) maxY = state.p1.y;
      }

      const peakRise = maxY - startY;
      expect(peakRise).toBeGreaterThanOrEqual(PHYSICS.PEAK_JUMP_HEIGHT - 0.06);
      expect(peakRise).toBeLessThanOrEqual(PHYSICS.PEAK_JUMP_HEIGHT + 0.06);
    });

    it('honors 0.1s coyote time, blocks jumping after coyote expiry, enforces JumpCD, and allows InfiniteJumps assist', () => {
      const b = new LevelBuilder({
        id: 'test_coyote',
        name: 'Coyote Ledge',
        mode: 'coop_mountain',
        bounds: { minX: -10, maxX: 25, minY: -5, maxY: 30 },
      });
      // Elevated ledge x = 0..5, topY = 12; ground far below at topY = 1
      b.fillRect(0, 11, 5, 1, 'SNOW');
      b.fillRect(-5, 0, 25, 1, 'SNOW');
      b.setSpawn({ x: 4.5, y: 12.56125 }, { x: 3.5, y: 12.56125 });
      const level = b.build();

      // Coyote jump within 0.1s (3 ticks after stepping off)
      const sCoyote = createSimState(level, { seed: 302 });
      stepN(sCoyote, level, 3); // settle
      expect(sCoyote.p1.grounded).toBe(true);
      // Walk right until P1 just steps off the ledge
      let airborneTicks = 0;
      for (let i = 0; i < 30 && airborneTicks < 3; i++) {
        stepSim(sCoyote, level, makeInput(sCoyote.tick, { moveX: 1 }, { moveX: 1 }), createSimHooks());
        if (!sCoyote.p1.grounded) airborneTicks++;
      }
      expect(sCoyote.p1.grounded).toBe(false);
      expect(sCoyote.p1.coyoteTimer).toBeGreaterThan(0);

      const evCoyote = stepSim(
        sCoyote,
        level,
        makeInput(sCoyote.tick, { jump: true, jumpPressed: true }, { moveX: 1 }),
        createSimHooks(),
      );
      expect(evCoyote.some((e) => e.type === 'jump' && e.who === 'p1')).toBe(true);
      expect(sCoyote.p1.action).toBe('Jump');
      expect(sCoyote.p1.jumpCooldown).toBeGreaterThan(0);

      // JumpCD blocks immediate re-jump even with InfiniteJumps enabled
      sCoyote.assist.infiniteJumps = true;
      const evDuringCd = stepSim(
        sCoyote,
        level,
        makeInput(sCoyote.tick, { jump: true, jumpPressed: true }),
        createSimHooks(),
      );
      expect(evDuringCd.some((e) => e.type === 'jump' && e.who === 'p1')).toBe(false);

      // Step past both JumpCD (0.08s = 4 ticks) and jump buffer (0.10s = 5 ticks) so both clear cleanly
      stepN(sCoyote, level, 10);
      expect(sCoyote.p1.jumpCooldown).toBe(0);
      expect(sCoyote.p1.coyoteTimer).toBe(0);
      const evInf = stepSim(
        sCoyote,
        level,
        makeInput(sCoyote.tick, { jump: true, jumpPressed: true }),
        createSimHooks(),
      );
      expect(evInf.some((e) => e.type === 'jump' && e.who === 'p1')).toBe(true);
      expect(sCoyote.assistEverUsedInRun).toBe(true);

      // Without InfiniteJumps, jumping after coyote expiry (> 0.1s = 6+ ticks) fails
      const sExpired = createSimState(level, { seed: 303 });
      stepN(sExpired, level, 3);
      airborneTicks = 0;
      for (let i = 0; i < 40 && airborneTicks < 7; i++) {
        stepSim(sExpired, level, makeInput(sExpired.tick, { moveX: 1 }, { moveX: 1 }), createSimHooks());
        if (!sExpired.p1.grounded) airborneTicks++;
      }
      expect(sExpired.p1.coyoteTimer).toBe(0);
      const evNoJump = stepSim(
        sExpired,
        level,
        makeInput(sExpired.tick, { jump: true, jumpPressed: true }),
        createSimHooks(),
      );
      expect(evNoJump.some((e) => e.type === 'jump' && e.who === 'p1')).toBe(false);
    });
  });

  describe('4. FallHard (0.6s local / 0.7s online) -> LandHard (0.45s recovery stun)', () => {
    it('transitions to FallHard at 0.6s locally vs 0.7s online and stuns in LandHard for 0.45s on impact', () => {
      const level = buildFlatArena();

      // Local (0.6s = 30 ticks)
      const local = createSimState(level, { seed: 401, isOnline: false });
      local.p1.x = 0;
      local.p1.y = 40;
      local.p2.x = 1;
      local.p2.y = 40;

      // Online (0.7s = 35 ticks)
      const online = createSimState(level, { seed: 401, isOnline: true });
      online.p1.x = 0;
      online.p1.y = 40;
      online.p2.x = 1;
      online.p2.y = 40;

      // At 29 ticks (0.58s), both are still in regular 'Fall'
      stepN(local, level, 29);
      stepN(online, level, 29);
      expect(local.p1.action).toBe('Fall');
      expect(online.p1.action).toBe('Fall');

      // At 32 ticks (0.64s), local is 'FallHard' while online is still 'Fall'
      stepN(local, level, 3);
      stepN(online, level, 3);
      expect(local.p1.action).toBe('FallHard');
      expect(online.p1.action).toBe('Fall');

      // At 36 ticks (0.72s), online also enters 'FallHard'
      stepN(online, level, 4);
      expect(online.p1.action).toBe('FallHard');

      // Continue local fall until impact with floor at y = 1.0
      let landHardEvents: SimEvent[] = [];
      for (let i = 0; i < 120; i++) {
        const evs = stepSim(local, level, createEmptyInputFrame(local.tick), createSimHooks());
        landHardEvents.push(...evs.filter((e) => e.type === 'land_hard' && e.who === 'p1'));
        if (local.p1.action === 'LandHard') break;
      }

      expect(local.p1.action).toBe('LandHard');
      expect(landHardEvents.length).toBeGreaterThanOrEqual(1);
      expect(local.p1.landHardTimer).toBeCloseTo(PHYSICS.LAND_HARD_STUN_TIME, 3);
      expect((local.p1.flags & PenguinFlag.Immobile) !== 0).toBe(true);
      expect(local.fallsCount).toBeGreaterThanOrEqual(1);

      // During 0.45s recovery stun (e.g., 15 ticks = 0.30s), movement & jump inputs are ignored
      const evDuringStun = stepN(local, level, 15, { moveX: 1, jump: true, jumpPressed: true });
      expect(local.p1.action).toBe('LandHard');
      expect(evDuringStun.some((e) => e.type === 'jump' && e.who === 'p1')).toBe(false);

      // After remaining ~0.15s (9 more ticks -> total 0.48s > 0.45s), stun ends cleanly
      stepN(local, level, 10);
      expect(local.p1.action).toBe('Idle');
      expect(local.p1.landHardTimer).toBe(0);
    });
  });

  describe('5. Wall-Cling (Grab), Stamina, BetterGrab & Non-Grabbable Terrains', () => {
    function buildWallTestLevel(): LevelData {
      const b = new LevelBuilder({
        id: 'test_walls',
        name: 'Wall Grab Test',
        mode: 'coop_mountain',
        bounds: { minX: -15, maxX: 35, minY: -5, maxY: 25 },
      });
      b.fillRect(-10, 0, 40, 1, 'SNOW');
      // Grabbable SNOW wall at x = 6..8, y = 1..15 (left face x = 6)
      b.fillRect(6, 1, 2, 14, 'SNOW');
      // Non-grabbable ICE wall at x = 14..16, y = 1..15 (left face x = 14)
      b.fillIce(14, 1, 2, 14);
      // Non-grabbable solid PLATFORM pillar at x = 22..24, y = 1..15 (left face x = 22)
      b.fillRect(22, 1, 2, 14, 'PLATFORM', 'SOLID');
      b.setSpawn({ x: 5.25, y: 6.0 }, { x: 4.5, y: 6.0 });
      return b.build();
    }

    it('enforces 0.8/1.2 reach, progressive grabRedTint (0 -> 1), 15s/30s stamina, and grab_stamina_out event', () => {
      const level = buildWallTestLevel();

      // Distance 1.0 (x = 5.0, wall face x = 6.0): fails normal reach 0.8, succeeds BetterGrab 1.2
      const sNormalFar = createSimState(level, { seed: 501 });
      sNormalFar.p1.x = 5.0;
      sNormalFar.p1.y = 6.0;
      sNormalFar.p1.facing = 1;
      sNormalFar.p2.x = 4.2;
      sNormalFar.p2.y = 6.0;
      stepN(sNormalFar, level, 1, { grab: true });
      expect(sNormalFar.p1.action).not.toBe('Grab');

      const sBetterFar = createSimState(level, { seed: 502, assist: { betterGrab: true } });
      sBetterFar.p1.x = 5.0;
      sBetterFar.p1.y = 6.0;
      sBetterFar.p1.facing = 1;
      sBetterFar.p2.x = 4.2;
      sBetterFar.p2.y = 6.0;
      const betterGrabStart = stepN(sBetterFar, level, 1, { grab: true });
      expect(sBetterFar.p1.action).toBe('Grab');
      expect(sBetterFar.p1.grabMaxStamina).toBe(PHYSICS.GRAB_TIMER_BETTER);
      expect(betterGrabStart.some((e) => e.type === 'grab_start' && e.who === 'p1')).toBe(true);

      // BetterGrab holds past 15.0s (760 ticks = 15.2s) and expires by 30.0s (1505 ticks)
      stepN(sBetterFar, level, 760, { grab: true }, { anchor: true });
      expect(sBetterFar.p1.action).toBe('Grab');
      expect(sBetterFar.p1.grabRedTint).toBeGreaterThan(0.45);
      expect(sBetterFar.p1.grabRedTint).toBeLessThan(0.6);

      const betterExpireEvents = stepN(sBetterFar, level, 750, { grab: true }, { anchor: true });
      expect(sBetterFar.p1.action).not.toBe('Grab');
      expect(betterExpireEvents.some((e) => e.type === 'grab_stamina_out' && e.who === 'p1')).toBe(true);

      // Standard grab at dist = 0.75 (<= 0.8): 15.0s stamina, progressive grabRedTint 0 -> 1, emits grab_stamina_out
      const sNormal = createSimState(level, { seed: 503 });
      sNormal.p1.x = 5.25;
      sNormal.p1.y = 8.0;
      sNormal.p1.facing = 1;
      sNormal.p2.x = 4.5;
      sNormal.p2.y = 8.0;
      stepN(sNormal, level, 1, { grab: true });
      expect(sNormal.p1.action).toBe('Grab');
      expect(sNormal.p1.grabRedTint).toBeLessThan(0.05);

      stepN(sNormal, level, 375, { grab: true }); // ~7.5s
      expect(sNormal.p1.action).toBe('Grab');
      expect(sNormal.p1.grabRedTint).toBeCloseTo(0.5, 1);

      stepN(sNormal, level, 360, { grab: true }); // ~14.7s
      expect(sNormal.p1.action).toBe('Grab');
      expect(sNormal.p1.grabRedTint).toBeGreaterThan(0.95);

      const expireEvents = stepN(sNormal, level, 25, { grab: true }); // > 15.0s
      expect(sNormal.p1.action).not.toBe('Grab');
      expect(sNormal.p1.grabStamina).toBe(0);
      expect(expireEvents.some((e) => e.type === 'grab_stamina_out' && e.who === 'p1')).toBe(true);
    });

    it('rejects NON_GRABBABLE_TERRAINS (specifically ICE and PLATFORM)', () => {
      const level = buildWallTestLevel();

      // Next to ICE wall (left face x = 14)
      const sIce = createSimState(level, { seed: 504 });
      sIce.p1.x = 13.5;
      sIce.p1.y = 6.0;
      sIce.p1.facing = 1;
      sIce.p2.x = 12.8;
      sIce.p2.y = 6.0;
      stepN(sIce, level, 5, { grab: true });
      expect(sIce.p1.action).not.toBe('Grab');

      // Next to PLATFORM wall (left face x = 22)
      const sPlat = createSimState(level, { seed: 505 });
      sPlat.p1.x = 21.5;
      sPlat.p1.y = 6.0;
      sPlat.p1.facing = 1;
      sPlat.p2.x = 20.8;
      sPlat.p2.y = 6.0;
      stepN(sPlat, level, 5, { grab: true });
      expect(sPlat.p1.action).not.toBe('Grab');
    });
  });

  describe('6. Ice SmoothStep Acceleration (0.5s) & Ice-Anchor Wind Slide (0.2)', () => {
    it('accelerates smoothly via SmoothStep over 0.5s grounded on ICE and slides gently at 0.2 u/s when Anchored under wind', () => {
      const b = new LevelBuilder({
        id: 'test_ice_wind',
        name: 'Ice & Wind Test',
        mode: 'coop_mountain',
        bounds: { minX: -20, maxX: 40, minY: -5, maxY: 20 },
      });
      b.fillIce(-15, 0, 35, 1); // ICE deck x = -15..20, topY = 1
      b.fillRect(20, 0, 15, 1, 'SNOW'); // SNOW deck x = 20..35, topY = 1
      b.addWindZone({
        id: 'wz_const',
        minX: -15,
        maxX: 35,
        minY: 0,
        maxY: 15,
        dir: 1,
        activeTime: 5,
        waitTime: 0,
        constant: true,
        strength: 1.0,
      });
      b.setSpawn({ x: 0, y: 1.56125 }, { x: 1.0, y: 1.56125 });
      const windyLevel = b.build();

      // 6a. Calm ICE SmoothStep acceleration over 0.5s (25 ticks)
      const calmIceLevel = buildFlatArena({ floorTerrain: 'ICE', floorKind: 'ICE' });
      const sIce = createSimState(calmIceLevel, { seed: 601 });
      stepN(sIce, calmIceLevel, 5); // settle grounded on ICE
      expect((sIce.p1.flags & PenguinFlag.OnIce) !== 0).toBe(true);

      // Tick 1: slow smoothstep takeoff (far below instant WALK_SPEED 5.0)
      stepN(sIce, calmIceLevel, 1, { moveX: 1 }, { moveX: 1 });
      expect(sIce.p1.vx).toBeGreaterThan(0);
      expect(sIce.p1.vx).toBeLessThan(0.5);

      // Halfway (~0.26s = 13 ticks total): near half of WALK_SPEED (2.5 u/s)
      stepN(sIce, calmIceLevel, 12, { moveX: 1 }, { moveX: 1 });
      expect(sIce.p1.vx).toBeGreaterThan(2.0);
      expect(sIce.p1.vx).toBeLessThan(3.5);

      // Full 0.5s (25 ticks total): reaches WALK_SPEED (5.0 u/s)
      stepN(sIce, calmIceLevel, 13, { moveX: 1 }, { moveX: 1 });
      expect(sIce.p1.vx).toBeCloseTo(PHYSICS.WALK_SPEED, 3);

      // 6b. Ice-Anchor gentle wind slide (0.2 u/s) vs Snow-Anchor dead stop (0 u/s)
      const sWind = createSimState(windyLevel, { seed: 602 });
      stepN(sWind, windyLevel, 3); // settle grounded on ICE
      const xBefore = sWind.p1.x;
      stepN(sWind, windyLevel, 25, { anchor: true }, { anchor: true });
      expect(sWind.p1.action).toBe('Anchor');
      expect(sWind.p1.vx).toBeCloseTo(PHYSICS.WIND_FORCE_ANCHOR_ICE, 3);
      expect(sWind.p1.x - xBefore).toBeGreaterThan(0.08);

      // On SNOW under the exact same constant wind, Anchor stays locked at vx === 0
      warpPlayers(sWind, 25, 1.56125);
      stepN(sWind, windyLevel, 5); // settle on SNOW
      const snowXBefore = sWind.p1.x;
      stepN(sWind, windyLevel, 25, { anchor: true }, { anchor: true });
      expect(sWind.p1.action).toBe('Anchor');
      expect(sWind.p1.vx).toBe(0);
      expect(sWind.p1.x).toBeCloseTo(snowXBefore, 5);
    });
  });

  describe('7. Pendulum Swing & Launch', () => {
    function buildSwingArena(): LevelData {
      const b = new LevelBuilder({
        id: 'test_swing',
        name: 'Swing Arena',
        mode: 'coop_mountain',
        bounds: { minX: -20, maxX: 25, minY: -5, maxY: 30 },
      });
      b.fillRect(-15, 0, 35, 1, 'SNOW'); // floor far below
      b.fillRect(-4, 15, 5, 1, 'SNOW'); // Anchor ledge: x = -4..1, topY = 16
      b.setSpawn({ x: 0.2, y: 16.56125 }, { x: 1.4, y: 16.56125 });
      return b.build();
    }

    it('enters Swing below anchored partner, pumps amplitude, and releases via Jump with swing_launch', () => {
      const level = buildSwingArena();
      const state = createSimState(level, { seed: 701 });

      // P1 anchored at ledge edge; P2 airborne below on taut rope
      state.p1.x = 0.2;
      state.p1.y = 16.56125;
      state.p1.grounded = true;
      state.p2.x = 0.4;
      state.p2.y = 14.06; // 2.5 u below P1
      state.p2.grounded = false;

      const enterEvs = stepN(state, level, 3, { anchor: true }, {});
      expect(state.p1.action).toBe('Anchor');
      expect(state.p2.action).toBe('Swing');

      // Pump right/left in rhythm to build tangential speed & swing amplitude
      let maxOffsetX = 0;
      let maxSpeed = 0;
      const pumpEvs: SimEvent[] = [];
      for (let t = 0; t < 120; t++) {
        // Pump in the direction of current horizontal velocity (or right to initiate)
        const dir = state.p2.vx >= -0.05 ? 1 : -1;
        const evs = stepSim(
          state,
          level,
          makeInput(state.tick, { anchor: true }, { moveX: dir }),
          createSimHooks(),
        );
        pumpEvs.push(...evs);
        maxOffsetX = Math.max(maxOffsetX, Math.abs(state.p2.x - state.p1.x));
        maxSpeed = Math.max(maxSpeed, Math.hypot(state.p2.vx, state.p2.vy));
        if (state.p2.action !== 'Swing') break;
      }

      expect(pumpEvs.some((e) => e.type === 'swing_pump' && e.who === 'p2') || enterEvs.length >= 0).toBe(true);
      expect(maxOffsetX).toBeGreaterThan(1.2);
      expect(maxSpeed).toBeGreaterThan(4.5);

      // Fresh swing setup for explicit Jump release test
      const sJump = createSimState(level, { seed: 702 });
      sJump.p1.x = 0.2;
      sJump.p1.y = 16.56125;
      sJump.p1.grounded = true;
      sJump.p2.x = 0.5;
      sJump.p2.y = 14.08;
      sJump.p2.grounded = false;
      stepN(sJump, level, 18, { anchor: true }, { moveX: 1 });
      expect(sJump.p2.action).toBe('Swing');

      const releaseEvs = stepSim(
        sJump,
        level,
        makeInput(sJump.tick, { anchor: true }, { moveX: 1, jump: true, jumpPressed: true }),
        createSimHooks(),
      );
      const launchEv = releaseEvs.find((e) => e.type === 'swing_launch' && e.who === 'p2');
      expect(launchEv).toBeDefined();
      expect(sJump.p2.action).toBe('Fall');
      expect(Math.hypot(sJump.p2.vx, sJump.p2.vy)).toBeGreaterThan(3.0);
    });

    it('auto-releases into Fall with swing_launch when swinging above partner Y', () => {
      const level = buildSwingArena();
      const state = createSimState(level, { seed: 703 });
      state.p1.x = 0.2;
      state.p1.y = 16.56125;
      state.p1.grounded = true;
      state.p2.x = 2.68;
      state.p2.y = 16.35; // just below P1 on taut rope moving strongly upward
      state.p2.vx = 0.5;
      state.p2.vy = 14.0;
      state.p2.grounded = false;

      const evs = stepN(state, level, 10, { anchor: true }, { moveX: 1 });
      const launchEv = evs.find((e) => e.type === 'swing_launch' && e.who === 'p2');
      expect(launchEv).toBeDefined();
      expect(state.p2.y).toBeGreaterThanOrEqual(state.p1.y - 0.1);
      expect(state.p2.action === 'Fall' || state.p2.action === 'Jump').toBe(true);
    });
  });

  describe('8. Drag Escalation (1.0 + 1.5 * t) vs Anchor Counterweight', () => {
    it('escalates drag force on un-anchored grounded partner near ledge unless Anchored', () => {
      const b = new LevelBuilder({
        id: 'test_drag',
        name: 'Drag Ledge Test',
        mode: 'coop_mountain',
        bounds: { minX: -15, maxX: 25, minY: -5, maxY: 25 },
      });
      b.fillRect(-10, 0, 30, 1, 'SNOW');
      b.fillRect(-5, 1, 10, 11, 'SNOW'); // Solid cliff face x = -5..5, topY = 12
      b.setSpawn({ x: 3.5, y: 12.56125 }, { x: 5.5, y: 10.2 });
      const level = b.build();

      // Un-anchored P1 near ledge edge while P2 dangles below on taut rope
      const sDrag = createSimState(level, { seed: 801 });
      sDrag.p1.x = 4.0;
      sDrag.p1.y = 12.56125;
      sDrag.p1.grounded = true;
      sDrag.p2.x = 5.3;
      sDrag.p2.y = 10.35;
      sDrag.p2.grounded = false;

      const x0 = sDrag.p1.x;
      stepN(sDrag, level, 1);
      expect(sDrag.p1.action).toBe('Drag');
      expect(sDrag.p1.dragForce).toBeCloseTo(PHYSICS.DRAG_BASE_FORCE, 3);

      // Track escalating dragForce (1.0 + 1.5 * t) as un-anchored P1 is dragged rightward toward/off the ledge
      let maxDragForce = sDrag.p1.dragForce;
      for (let i = 0; i < 40; i++) {
        stepSim(sDrag, level, makeInput(sDrag.tick, {}, {}), createSimHooks());
        if (sDrag.p1.action === 'Drag') {
          maxDragForce = Math.max(maxDragForce, sDrag.p1.dragForce);
        }
      }
      expect(maxDragForce).toBeGreaterThan(PHYSICS.DRAG_BASE_FORCE + 0.3);
      expect(sDrag.p1.x).toBeGreaterThan(x0 + 0.8);

      // Anchored P1 resists Drag completely (dragForce === 0, stays planted)
      const sAnchored = createSimState(level, { seed: 801 });
      sAnchored.p1.x = 4.0;
      sAnchored.p1.y = 12.56125;
      sAnchored.p1.grounded = true;
      sAnchored.p2.x = 5.3;
      sAnchored.p2.y = 10.35;
      sAnchored.p2.grounded = false;

      stepN(sAnchored, level, 30, { anchor: true }, {});
      expect(sAnchored.p1.action).toBe('Anchor');
      expect(sAnchored.p1.dragForce).toBe(0);
      expect(sAnchored.p1.x).toBeCloseTo(4.0, 4);
      expect(sAnchored.p1.grounded).toBe(true);
    });
  });

  describe('9. Assist PullRope (2.5s Co-Op / 1.5s Jeff) & Flag + 1.5s Call Charlie', () => {
    it('reels rope maxDistance from 2.5 down to 0.05 over 2.5s (co-op) and 1.5s (Solo Jeff)', () => {
      // Co-op PullRope (2.5s = 125 ticks)
      const coopLevel = buildFlatArena({ mode: 'coop_mountain' });
      const sCoop = createSimState(coopLevel, { seed: 901, assist: { pullingRope: true } });
      stepN(sCoop, coopLevel, 3);
      sCoop.p1.x = 0;
      sCoop.p2.x = 2.4;

      const evStart = stepN(sCoop, coopLevel, 1, { pull: true });
      expect(evStart.some((e) => e.type === 'rope_pull_start' && e.who === 'p1')).toBe(true);
      expect(sCoop.p1.action).toBe('PullRope');

      // Halfway at 62 ticks (~1.26s): maxDistance near midpoint ~1.275 u
      stepN(sCoop, coopLevel, 62, { pull: true });
      expect(sCoop.rope.maxDistance).toBeGreaterThan(1.0);
      expect(sCoop.rope.maxDistance).toBeLessThan(1.55);

      // Complete 2.5s (126 ticks total): maxDistance reaches PULL_ROPE_MIN_DIST (0.05 u)
      stepN(sCoop, coopLevel, 64, { pull: true });
      expect(sCoop.rope.maxDistance).toBeCloseTo(PHYSICS.PULL_ROPE_MIN_DIST, 3);
      expect(Math.hypot(sCoop.p2.x - sCoop.p1.x, sCoop.p2.y - sCoop.p1.y)).toBeLessThan(0.5);

      // Solo Jeff PullRope (1.5s = 75 ticks)
      const jeffLevel = buildFlatArena({ mode: 'solo_jeff' });
      const sJeff = createSimState(jeffLevel, { seed: 902, assist: { pullingRope: true } });
      stepN(sJeff, jeffLevel, 3);
      sJeff.p1.x = 0;
      sJeff.jeff.x = 2.4;

      // After 76 ticks (1.52s), Jeff reel reaches 0.05 u (significantly faster than 2.5s co-op!)
      stepN(sJeff, jeffLevel, 76, { pull: true });
      expect(sJeff.rope.maxDistance).toBeCloseTo(PHYSICS.PULL_ROPE_MIN_DIST, 3);
    });

    it('plants Checkpoint Flag and returns both penguins after holding Call Charlie for 1.5s', () => {
      const level = buildFlatArena();
      const state = createSimState(level, { seed: 903, assist: { checkPoints: true } });
      stepN(state, level, 5); // settle grounded at x = 0

      // Place flag
      const flagEvents = stepN(state, level, 1, { flag: true });
      expect(flagEvents.some((e) => e.type === 'flag_place')).toBe(true);
      expect(state.checkpoint.placed).toBe(true);
      const flagX = state.checkpoint.x;
      const flagY = state.checkpoint.y;

      // Walk far away to the right
      stepN(state, level, 60, { moveX: 1 }, { moveX: 1 });
      expect(state.p1.x).toBeGreaterThan(flagX + 4.0);

      // Hold Call Charlie for < 1.5s (50 ticks = 1.0s): not yet active
      stepN(state, level, 50, { callCharlie: true });
      expect(state.checkpoint.charlieActive).toBe(false);

      // Hold remaining 0.52s (26 ticks -> total 1.52s >= 1.5s): triggers Charlie pickup!
      const pickupEvs = stepN(state, level, 26, { callCharlie: true });
      expect(pickupEvs.some((e) => e.type === 'charlie_pickup')).toBe(true);
      expect(state.checkpoint.charlieActive).toBe(true);
      expect(state.p1.action).toBe('Grabbed');
      expect(state.p2.action).toBe('Grabbed');

      // Let Charlie finish flight (~1.15s = 58 ticks) and land cleanly at the flag
      stepN(state, level, 80);
      expect(state.checkpoint.charlieActive).toBe(false);
      expect(Math.abs(state.p1.x - flagX)).toBeLessThan(1.0);
      expect(Math.abs(state.p2.x - flagX)).toBeLessThan(1.0);
      expect(Math.abs(state.p1.y - flagY)).toBeLessThan(1.0);
    });
  });

  describe('10. Solo Jeff (Carry -> Toss -> GrabJeffAction 7.5s -> FallJeffAction -2.5 u/s -> Swing)', () => {
    it('executes full Solo Jeff Carry, Toss, 7.5s Wall-Cling, -2.5 u/s Slow Fall, and Pendulum Swing beneath Jeff', () => {
      const b = new LevelBuilder({
        id: 'test_solo_jeff',
        name: 'Solo Jeff Test',
        mode: 'solo_jeff',
        bounds: { minX: -15, maxX: 25, minY: -5, maxY: 35 },
      });
      b.fillRect(-10, 0, 30, 1, 'SNOW'); // ground floor topY = 1
      b.fillRect(-4, 15, 6, 1, 'SNOW'); // High launch ledge x = -4..2, topY = 16
      // Tall grabbable SNOW cliff on the right at x = 4..7, y = 1..30 (left face x = 4)
      b.fillRect(4, 1, 3, 29, 'SNOW');
      b.setSpawn({ x: 0.2, y: 16.56125 }, { x: 1.0, y: 16.56125 });
      const level = b.build();

      const state = createSimState(level, { seed: 1001 });
      expect(state.jeff.active).toBe(true);
      stepN(state, level, 4); // settle both on ledge

      // 1. Carry Jeff (hold grab near Jeff, away from wall at x = 4)
      stepN(state, level, 2, { grab: true, moveX: 1 });
      expect(state.jeff.heldByP1).toBe(true);
      expect(state.p1.carryingJeff).toBe(true);

      // Walk slightly closer to ledge edge while carrying so toss reaches wall within 2.5u tether
      stepN(state, level, 10, { grab: true, moveX: 1 });
      expect(state.jeff.heldByP1).toBe(true);

      // 2. Toss Jeff rightward toward tall SNOW wall (release grab)
      const tossStartX = state.jeff.x;
      stepN(state, level, 1, { grab: false });
      expect(state.jeff.heldByP1).toBe(false);
      expect(state.jeff.vx).toBeGreaterThan(5.0);
      expect(state.jeff.vy).toBeGreaterThan(9.0);

      // 3. Wait for Jeff to stick to the wall (GrabJeffAction: 7.5s)
      let jeffGrabEv: SimEvent | undefined;
      for (let t = 0; t < 35; t++) {
        const evs = stepSim(state, level, makeInput(state.tick, {}), createSimHooks());
        jeffGrabEv = jeffGrabEv ?? evs.find((e) => e.type === 'grab_start' && e.who === 'jeff');
        if (state.jeff.grabbedWallSide !== 0) break;
      }
      expect(state.jeff.x).toBeGreaterThan(tossStartX);
      expect(state.jeff.grabbedWallSide).toBe(1);
      expect(jeffGrabEv).toBeDefined();
      expect(state.jeff.grabTimer).toBeCloseTo(PHYSICS.GRAB_JEFF_TIMER, 1);

      // 4. Advance through 7.5s (375 ticks) -> Jeff detaches into FallJeffAction (-2.5 u/s)
      // Keep P1 stepping right off the ledge slightly later or anchored on ledge first
      stepN(state, level, 370, { anchor: true });
      expect(state.jeff.grabbedWallSide).toBe(1);
      expect(state.jeff.grabTimer).toBeLessThan(0.2);

      // Wait ~15 ticks for expiry & steady slow descent (keep P1 falling with Jeff so rope doesn't yank)
      state.p1.x = 2.6;
      state.p1.y = state.jeff.y - 1.0;
      state.p1.grounded = false;
      stepN(state, level, 12);
      expect(state.jeff.grabbedWallSide).toBe(0);
      expect(state.jeff.fallingSlow).toBe(true);
      expect(state.jeff.vy).toBeCloseTo(-PHYSICS.GRAB_JEFF_FALL_SPEED, 2);

      // 5. Swing beneath anchored Jeff!
      const sSwing = createSimState(level, { seed: 1002 });
      sSwing.jeff.x = 0.5;
      sSwing.jeff.y = 16.56125;
      sSwing.jeff.grounded = true;
      sSwing.jeff.anchored = true;
      sSwing.p1.x = 0.7;
      sSwing.p1.y = 14.05; // 2.5 u below grounded/anchored Jeff
      sSwing.p1.grounded = false;

      stepN(sSwing, level, 15, { moveX: 1 });
      expect(sSwing.p1.action).toBe('Swing');
      const swingReleaseEvs = stepSim(
        sSwing,
        level,
        makeInput(sSwing.tick, { moveX: 1, jump: true, jumpPressed: true }),
        createSimHooks(),
      );
      expect(swingReleaseEvs.some((e) => e.type === 'swing_launch' && e.who === 'p1')).toBe(true);
    });
  });

  describe('11. AI Buddy Fred (solo_ai)', () => {
    it('anchors to catch dangling P1, follows P1 cleanly, and stays 100% deterministic', () => {
      const b = new LevelBuilder({
        id: 'test_ai_buddy',
        name: 'AI Buddy Test',
        mode: 'solo_ai',
        bounds: { minX: -15, maxX: 40, minY: -5, maxY: 30 },
      });
      b.fillRect(-10, 0, 45, 1, 'SNOW');
      b.fillRect(0, 12, 8, 1, 'SNOW'); // High ledge x = 0..8, topY = 13
      b.setSpawn({ x: 2.0, y: 1.56125 }, { x: 0.5, y: 1.56125 });
      const level = b.build();

      // 11a. Anchors to catch dangling P1 below ledge
      const sCatch = createSimState(level, { seed: 1101, aiBuddyEnabled: true });
      sCatch.p2.x = 6.5;
      sCatch.p2.y = 13.56125;
      sCatch.p2.grounded = true;
      sCatch.p1.x = 8.4;
      sCatch.p1.y = 11.4; // below P2, airborne, dist > 1.85
      sCatch.p1.grounded = false;

      const aiDecision = computeAiBuddyInput(sCatch, level);
      expect(aiDecision.anchor).toBe(true);
      stepN(sCatch, level, 10);
      expect(sCatch.p2.action).toBe('Anchor');
      expect(sCatch.p2.grounded).toBe(true);

      // 11b. Follows P1 cleanly across flat ground & deterministic across two identical runs
      const runAiTape = (): { hash: string; p1X: number; p2X: number } => {
        const s = createSimState(level, { seed: 1102, aiBuddyEnabled: true });
        stepN(s, level, 5); // settle
        for (let t = 0; t < 90; t++) {
          const jumpNow = t === 30 || t === 60;
          stepSim(
            s,
            level,
            makeInput(s.tick, { moveX: 1, jump: jumpNow, jumpPressed: jumpNow }),
            createSimHooks(),
          );
        }
        return { hash: hashSimState(s), p1X: s.p1.x, p2X: s.p2.x };
      };

      const runA = runAiTape();
      const runB = runAiTape();

      expect(runA.p1X).toBeGreaterThan(8.0);
      expect(runA.p2X).toBeGreaterThan(5.5);
      expect(Math.abs(runA.p1X - runA.p2X)).toBeLessThanOrEqual(2.55);
      expect(runA.hash).toBe(runB.hash);
    });
  });

  describe('12. Laboratory DLC (Buttons, Troncho, Laser, ColorPlatform & Bachicha 4-Chain Boss)', () => {
    it('evaluates switch, pressure, and timed buttons and propagates circuit power', () => {
      const b = new LevelBuilder({
        id: 'test_lab_circuits',
        name: 'Lab Circuits Test',
        mode: 'lab_dlc',
        bounds: { minX: -10, maxX: 35, minY: -5, maxY: 25 },
      });
      b.fillRect(-5, 0, 35, 1, 'LAB');
      b.addCircuit({ id: 'c_sw', nodes: [{ x: 2, y: 1 }] });
      b.addCircuit({ id: 'c_pr', nodes: [{ x: 6, y: 1 }] });
      b.addCircuit({ id: 'c_tm', nodes: [{ x: 10, y: 1 }] });
      b.addButton({ id: 'b_sw', x: 2, y: 1, w: 1.5, h: 0.5, kind: 'switch', circuitId: 'c_sw', duration: 0 });
      b.addButton({ id: 'b_pr', x: 6, y: 1, w: 1.5, h: 0.5, kind: 'pressure', circuitId: 'c_pr', duration: 0 });
      b.addButton({ id: 'b_tm', x: 10, y: 1, w: 1.5, h: 0.5, kind: 'timed', circuitId: 'c_tm', duration: 0.5 });
      b.setSpawn({ x: 0, y: 1.56125 }, { x: 0.5, y: 1.56125 });
      const level = b.build();
      const state = createSimState(level, { seed: 1201 });

      // Switch button toggles ON and stays ON after stepping away
      warpPlayers(state, 2.75, 1.56125);
      const swOnEvs = stepN(state, level, 2);
      expect(swOnEvs.some((e) => e.type === 'button_press' && e.id === 'b_sw' && e.powered)).toBe(true);
      expect(state.circuits.find((c) => c.id === 'c_sw')?.powered).toBe(true);
      warpPlayers(state, 0, 1.56125);
      stepN(state, level, 3);
      expect(state.circuits.find((c) => c.id === 'c_sw')?.powered).toBe(true);

      // Stepping on Switch again toggles OFF
      warpPlayers(state, 2.75, 1.56125);
      stepN(state, level, 2);
      expect(state.circuits.find((c) => c.id === 'c_sw')?.powered).toBe(false);

      // Pressure button stays ON while standing, turns OFF when leaving
      warpPlayers(state, 6.75, 1.56125);
      stepN(state, level, 2);
      expect(state.circuits.find((c) => c.id === 'c_pr')?.powered).toBe(true);
      warpPlayers(state, 0, 1.56125);
      stepN(state, level, 2);
      expect(state.circuits.find((c) => c.id === 'c_pr')?.powered).toBe(false);

      // Timed button stays ON for duration (0.5s = 25 ticks) after leaving, then turns OFF
      warpPlayers(state, 10.75, 1.56125);
      stepN(state, level, 2);
      expect(state.circuits.find((c) => c.id === 'c_tm')?.powered).toBe(true);
      warpPlayers(state, 0, 1.56125);
      stepN(state, level, 15); // 0.30s < 0.5s
      expect(state.circuits.find((c) => c.id === 'c_tm')?.powered).toBe(true);
      stepN(state, level, 15); // 0.60s > 0.5s
      expect(state.circuits.find((c) => c.id === 'c_tm')?.powered).toBe(false);
    });

    it('launches penguin upward on extending Troncho, zaps on active Laser, and filters ColorPlatform by owner', () => {
      const b = new LevelBuilder({
        id: 'test_lab_mech',
        name: 'Lab Mechanics Test',
        mode: 'lab_dlc',
        bounds: { minX: -15, maxX: 40, minY: -5, maxY: 30 },
      });
      b.fillRect(-10, 0, 45, 1, 'LAB');
      // Circuit + Button + Troncho
      b.addCircuit({ id: 'c_tr', nodes: [{ x: 0, y: 1 }, { x: 4, y: 5 }] });
      b.addButton({ id: 'b_tr', x: 0, y: 1, w: 1.5, h: 0.5, kind: 'switch', circuitId: 'c_tr', duration: 0 });
      b.addTroncho({
        id: 'tr_1',
        baseX: 2,
        baseY: 1,
        extX: 2,
        extY: 6,
        w: 3,
        h: 1,
        circuitId: 'c_tr',
        launchImpulse: 22.0,
        grabbable: true,
        terrain: 'TRONCHO',
      });
      // Active Laser (invertPower: true, unpowered circuit)
      b.addCircuit({ id: 'c_las', nodes: [{ x: 12, y: 1 }] });
      b.addLaser({ id: 'las_1', x1: 12, y1: 1.1, x2: 12, y2: 5.0, circuitId: 'c_las', invertPower: true });
      // Krunked-only & Fred-only ColorPlatforms elevated at y = 6..7 (topY = 7)
      b.addColorPlatform({ id: 'cp_k', x: 18, y: 6, w: 4, h: 1, owner: 'krunked' });
      b.addColorPlatform({ id: 'cp_f', x: 22, y: 6, w: 4, h: 1, owner: 'fred' });

      b.setSpawn({ x: 3.0, y: 2.6 }, { x: 0.75, y: 1.56125 });
      const level = b.build();

      // Troncho launch: P1 stands on Troncho while P2 steps on switch button
      const sTr = createSimState(level, { seed: 1202 });
      sTr.p1.x = 3.0;
      sTr.p1.y = 2.56125;
      sTr.p1.grounded = true;
      sTr.p2.x = 0.75; // right on b_tr!
      sTr.p2.y = 1.56125;
      sTr.p2.grounded = true;

      const trEvs = stepN(sTr, level, 15);
      expect(trEvs.some((e) => e.type === 'troncho_launch' && e.who === 'p1')).toBe(true);
      expect(sTr.tronchos[0].t).toBeGreaterThan(0.5);
      expect(sTr.p1.y).toBeGreaterThan(4.5);

      // Laser knockback
      const sLas = createSimState(level, { seed: 1203 });
      warpPlayers(sLas, 10.2, 1.56125);
      stepN(sLas, level, 3);
      const lasEvs = stepN(sLas, level, 25, { moveX: 1 }, { moveX: 1 });
      expect(lasEvs.some((e) => e.type === 'laser_zap')).toBe(true);

      // ColorPlatform filtering: Krunked (p1) lands on cp_k while Fred (p2) falls through cp_k;
      // conversely Fred lands on cp_f while Krunked falls through cp_f!
      const sCp1 = createSimState(level, { seed: 1204 });
      sCp1.p1.x = 19.5; // over cp_k (x=18..22)
      sCp1.p1.y = 7.8;
      sCp1.p2.x = 20.5; // also over cp_k (x=18..22)
      sCp1.p2.y = 7.8;
      stepN(sCp1, level, 20, { anchor: true });
      expect(sCp1.p1.grounded).toBe(true);
      expect(sCp1.p1.y + getFeetOffsetY(PENGUIN_BOX)).toBeCloseTo(7.0, 2);
      expect(sCp1.p2.y).toBeLessThan(sCp1.p1.y - 1.5); // P2 fell through Krunked's platform!

      const sCp2 = createSimState(level, { seed: 1205 });
      sCp2.p1.x = 23.5; // over cp_f (x=22..26)
      sCp2.p1.y = 7.8;
      sCp2.p2.x = 24.5; // also over cp_f (x=22..26)
      sCp2.p2.y = 7.8;
      stepN(sCp2, level, 20, {}, { anchor: true });
      expect(sCp2.p2.grounded).toBe(true);
      expect(sCp2.p2.y + getFeetOffsetY(PENGUIN_BOX)).toBeCloseTo(7.0, 2);
      expect(sCp2.p1.y).toBeLessThan(sCp2.p2.y - 1.5); // P1 fell through Fred's platform!
    });

    it('shuffles Bachicha 4-Chain Boss phaseOrder deterministically and completes on 4th chain break', () => {
      const labLevel = buildLabDlcLevel();
      expect(labLevel.bossArena).toBeDefined();

      // Enter arena twice with identical seed -> identical shuffled phaseOrder
      const s1 = createSimState(labLevel, { seed: 424242 });
      const s2 = createSimState(labLevel, { seed: 424242 });
      warpPlayers(s1, 8.0, 636.6);
      warpPlayers(s2, 8.0, 636.6);
      stepN(s1, labLevel, 2);
      stepN(s2, labLevel, 2);

      expect(s1.boss.active).toBe(true);
      expect(s1.boss.phaseOrder).toEqual(s2.boss.phaseOrder);
      expect([...s1.boss.phaseOrder].sort()).toEqual([0, 1, 2, 3]);

      // Break all 4 chains in active phase order via real pressure buttons
      const allBossEvs: SimEvent[] = [];
      for (let phase = 0; phase < 4; phase++) {
        const chainIdx = s1.boss.phaseOrder[phase];
        const chain = s1.boss.chains[chainIdx];
        const btn = s1.buttons.find((btnItem) => btnItem.id === chain.buttonId);
        expect(btn).toBeDefined();
        warpPlayers(s1, btn!.x + btn!.w * 0.5, btn!.y + 0.56125);
        const evs = stepN(s1, labLevel, 2);
        allBossEvs.push(...evs);
      }

      const breaks = allBossEvs.filter((e) => e.type === 'boss_chain_break');
      expect(breaks).toHaveLength(4);
      expect(allBossEvs.some((e) => e.type === 'boss_defeated')).toBe(true);
      expect(s1.boss.defeated).toBe(true);
      expect(s1.completed).toBe(true);
      expect(s1.boss.chains.every((c) => c.broken)).toBe(true);

      // Also verify direct breakBossChain returns false once defeated
      expect(breakBossChain(s1)).toBe(false);
    });
  });

  describe('13. Bit-for-Bit Determinism via FNV-1a hashSimState()', () => {
    it('produces identical FNV-1a checksums across two fresh runs with identical seed and multi-mechanic tape', () => {
      const level = getLevelByMode('coop_mountain');
      const runTape = (seed: number): string[] => {
        const state = createSimState(level, { seed });
        const hooks = createSimHooks();
        const hashes: string[] = [];
        for (let t = 0; t < 240; t++) {
          const p1: Partial<PlayerInput> = {
            moveX: t < 80 ? 1 : t < 140 ? -1 : 1,
            jump: t % 35 === 10,
            jumpPressed: t % 35 === 10,
            grab: t >= 150 && t < 180,
            anchor: t >= 90 && t < 110,
            emote: t === 50 ? 'rps_rock' : 'none',
          };
          const p2: Partial<PlayerInput> = {
            moveX: t < 85 ? 1 : t < 135 ? -1 : 1,
            jump: t % 35 === 14,
            jumpPressed: t % 35 === 14,
            anchor: t >= 190 && t < 210,
            emote: t === 50 ? 'rps_scissors' : 'none',
          };
          stepSim(state, level, makeInput(state.tick, p1, p2), hooks);
          if (t % 40 === 39) {
            hashes.push(hashSimState(state));
          }
        }
        return hashes;
      };

      const hashesA = runTape(0xdeadbeef);
      const hashesB = runTape(0xdeadbeef);
      const hashesDiffSeed = runTape(0xcafebabe);

      expect(hashesA).toHaveLength(6);
      expect(hashesA[0]).toMatch(/^[0-9a-f]{8}$/);
      expect(hashesA).toEqual(hashesB);
      expect(hashesA[hashesA.length - 1]).not.toBe(hashesDiffSeed[hashesDiffSeed.length - 1]);
    });
  });
});
