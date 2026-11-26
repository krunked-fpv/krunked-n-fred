import {
  PHYSICS,
  type LevelData,
  type PenguinState,
  type SimState,
} from '../contracts';
import { addCameraShake } from './camera';
import { segmentIntersectsAABB, type RectBounds } from './circuits';
import { nextRand } from './prng';

const PENGUIN_HALF_W = PHYSICS.PENGUIN_BOX_W * 0.5;
const PENGUIN_FEET_OFFSET_Y = PHYSICS.PENGUIN_BOX_OFFSET_Y - PHYSICS.PENGUIN_BOX_H * 0.5;
const PENGUIN_TOP_OFFSET_Y = PHYSICS.PENGUIN_BOX_OFFSET_Y + PHYSICS.PENGUIN_BOX_H * 0.5;

const BOSS_LASER_LENGTH = 15.0;
const BOSS_LASER_ZAP_COOLDOWN_TICKS = 35; // 0.70s at 50 Hz
const TWO_PI = Math.PI * 2;

const bossLaserZapTickByState = new WeakMap<SimState, { p1: number; p2: number }>();

function getZapTracker(state: SimState): { p1: number; p2: number } {
  let tracker = bossLaserZapTickByState.get(state);
  if (!tracker) {
    tracker = { p1: -999, p2: -999 };
    bossLaserZapTickByState.set(state, tracker);
  }
  return tracker;
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

function isPointInArena(
  x: number,
  y: number,
  arena: NonNullable<LevelData['bossArena']>,
): boolean {
  return x >= arena.minX && x <= arena.maxX && y >= arena.minY && y <= arena.maxY;
}

function countBrokenChains(state: SimState): number {
  let broken = 0;
  for (let i = 0; i < state.boss.chains.length; i++) {
    if (state.boss.chains[i].broken) broken += 1;
  }
  return broken;
}

function getActiveChainIndex(state: SimState): number {
  const boss = state.boss;
  if (boss.chains.length === 0) return -1;

  for (let i = boss.phaseIndex; i < boss.phaseOrder.length; i++) {
    const idx = boss.phaseOrder[i];
    if (idx >= 0 && idx < boss.chains.length && !boss.chains[idx].broken) {
      return idx;
    }
  }
  for (let i = 0; i < boss.phaseOrder.length; i++) {
    const idx = boss.phaseOrder[i];
    if (idx >= 0 && idx < boss.chains.length && !boss.chains[idx].broken) {
      return idx;
    }
  }
  for (let i = 0; i < boss.chains.length; i++) {
    if (!boss.chains[i].broken) return i;
  }
  return -1;
}

function shufflePhaseOrder(state: SimState, count: number): number[] {
  const order: number[] = [];
  for (let i = 0; i < count; i++) {
    order.push(i);
  }
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand(state) * (i + 1));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  return order;
}

/**
 * Breaks either the specified boss chain or the active phase's chain.
 * Emits `boss_chain_break`, advances `phaseIndex`, escalates `laserSweepAngle` / `attackTimer`,
 * and defeats Mech-Boss Bachicha once all 4 chains are broken.
 */
export function breakBossChain(state: SimState, chainIndex?: number): boolean {
  const boss = state.boss;
  if (!boss || boss.chains.length === 0 || boss.defeated) {
    return false;
  }

  let targetIdx: number;
  if (chainIndex !== undefined) {
    if (chainIndex < 0 || chainIndex >= boss.chains.length) {
      return false;
    }
    targetIdx = chainIndex;
  } else {
    targetIdx = getActiveChainIndex(state);
    if (targetIdx < 0) {
      return false;
    }
  }

  const chain = boss.chains[targetIdx];
  if (!chain || chain.broken) {
    return false;
  }

  boss.active = true;
  chain.broken = true;

  const brokenCount = countBrokenChains(state);
  const remaining = boss.chains.length - brokenCount;
  boss.phaseIndex = brokenCount;

  // Escalate laser sweep angle & attack cadence on every broken chain
  boss.laserSweepAngle = boss.laserSweepAngle + 0.45 + brokenCount * 0.2;
  boss.attackTimer = 2.2 + brokenCount * 0.55;

  addCameraShake(state.camera, 0.35, 0.35);
  state.events.push({
    type: 'boss_chain_break',
    chainId: chain.id,
    remaining,
    x: chain.x,
    y: chain.y,
  });

  if (remaining === 0) {
    boss.defeated = true;
    boss.attackTimer = 0;
    boss.celebrationTimer = 0;
    state.completed = true;
    state.completionTimeSec = state.elapsedSec;
    state.events.push({
      type: 'boss_defeated',
      timeSec: state.completionTimeSec,
    });
  }

  return true;
}

/**
 * Deterministic Mech-Boss Bachicha 4-Chain Arena update:
 * activates & deterministically shuffles `phaseOrder` via `nextRand(state)` when P1/P2 enter,
 * illuminates the active chain's guide circuit, monitors active chain button release,
 * and sweeps Bachicha's escalating cyclops laser beam.
 */
export function updateBoss(state: SimState, level: LevelData, dt: number): void {
  const arena = level.bossArena;
  if (!arena) return;

  const boss = state.boss;
  if (boss.chains.length === 0 && arena.chains.length > 0) {
    boss.chains = arena.chains.map((c) => ({ ...c }));
  }

  if (boss.defeated) {
    boss.attackTimer = 0;
    boss.celebrationTimer += dt;
    return;
  }

  // Activate boss arena once P1 or P2 enters `level.bossArena`
  if (!boss.active) {
    const p1In = isPointInArena(state.p1.x, state.p1.y, arena);
    const p2In = state.mode !== 'solo_jeff' && isPointInArena(state.p2.x, state.p2.y, arena);
    if (!p1In && !p2In) {
      return;
    }

    boss.active = true;
    boss.phaseIndex = 0;
    boss.phaseOrder = shufflePhaseOrder(state, boss.chains.length);
    boss.laserSweepAngle = -Math.PI * 0.5;
    boss.attackTimer = 2.0;
    boss.celebrationTimer = 0;
  }

  // Find active phase's chain and check its linked release button
  const activeIdx = getActiveChainIndex(state);
  if (activeIdx >= 0) {
    const activeChain = boss.chains[activeIdx];
    const linkedButton = state.buttons.find((b) => b.id === activeChain.buttonId);

    // Highlight the active chain's visual guide circuit wire in cyan so players see the target!
    if (linkedButton) {
      for (let i = 0; i < state.circuits.length; i++) {
        const c = state.circuits[i];
        if (c.id === linkedButton.circuitId) {
          c.powered = true;
        }
      }

      if (linkedButton.pressed) {
        breakBossChain(state, activeIdx);
        if (boss.defeated) {
          return;
        }
      }
    }
  }

  // Advance Bachicha's escalating sweeping laser beam
  const brokenCount = countBrokenChains(state);
  const sweepSpeed = 0.65 + brokenCount * 0.28; // rad/s
  const cooldownDuration = Math.max(0.6, 1.8 - brokenCount * 0.3);
  const fireDuration = 2.2 + brokenCount * 0.55;

  boss.attackTimer -= dt;
  if (boss.attackTimer <= -cooldownDuration) {
    boss.attackTimer = fireDuration;
  }

  if (boss.attackTimer > 0) {
    boss.laserSweepAngle += sweepSpeed * dt;
    if (boss.laserSweepAngle > Math.PI) {
      boss.laserSweepAngle -= TWO_PI;
    }

    const bossX = (arena.minX + arena.maxX) * 0.5;
    const bossY = arena.minY + (arena.maxY - arena.minY) * 0.55;
    const endX = bossX + Math.cos(boss.laserSweepAngle) * BOSS_LASER_LENGTH;
    const endY = bossY + Math.sin(boss.laserSweepAngle) * BOSS_LASER_LENGTH;

    const tracker = getZapTracker(state);
    const activePenguins: PenguinState[] =
      state.mode === 'solo_jeff' && state.jeff.active ? [state.p1] : [state.p1, state.p2];

    for (let i = 0; i < activePenguins.length; i++) {
      const p = activePenguins[i];
      if (p.action === 'Grabbed') continue;
      if (!isPointInArena(p.x, p.y, arena)) continue;

      const lastTick = p.id === 'p1' ? tracker.p1 : tracker.p2;
      if (state.tick - lastTick < BOSS_LASER_ZAP_COOLDOWN_TICKS) continue;

      if (segmentIntersectsAABB(bossX, bossY, endX, endY, getPenguinRect(p), 0.12)) {
        const pushSign = p.x >= bossX ? 1 : -1;
        p.vx = pushSign * 8.5;
        p.vy = 6.5;
        p.grounded = false;
        p.platformEntityId = null;
        p.wallSide = 0;
        p.wallEntityId = null;
        p.grabRedTint = 0;
        p.action = 'Fall';
        p.fallTimer = 0;

        if (p.id === 'p1') {
          tracker.p1 = state.tick;
        } else {
          tracker.p2 = state.tick;
        }

        addCameraShake(state.camera, 0.25, 0.24);
        state.events.push({
          type: 'laser_zap',
          id: 'boss_sweep_laser',
          who: p.id,
          x: p.x,
          y: p.y,
        });
      }
    }
  }
}
