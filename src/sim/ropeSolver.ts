import {
  PHYSICS,
  type LevelData,
  type PenguinState,
  type RopeNode,
  type RopeState,
  type SimState,
} from '../contracts';
import {
  applyCollisionConstrainedDelta,
  JEFF_BOX,
  PENGUIN_BOX,
  type ActorId,
  type BodyBox,
} from './collision';

interface TetherEndpoint {
  actor: ActorId;
  box: BodyBox;
  x: number;
  y: number;
  vx: number;
  vy: number;
  invMass: number;
  isSwinging: boolean;
  commit: (x: number, y: number, vx: number, vy: number) => void;
}

function getPenguinInvMass(p: PenguinState): number {
  if (p.action === 'Anchor' || p.action === 'Grab') {
    return 0;
  }
  if (p.action === 'PullRope' && (p.grounded || p.wallSide !== 0)) {
    return 0;
  }
  return 1 / PHYSICS.PENGUIN_MASS;
}

function getEndpoints(state: SimState): [TetherEndpoint, TetherEndpoint] | null {
  if (state.checkpoint.charlieActive) {
    return null;
  }

  const p1 = state.p1;
  const endA: TetherEndpoint = {
    actor: 'p1',
    box: PENGUIN_BOX,
    x: p1.x,
    y: p1.y,
    vx: p1.vx,
    vy: p1.vy,
    invMass: getPenguinInvMass(p1),
    isSwinging: p1.action === 'Swing',
    commit: (x, y, vx, vy) => {
      p1.x = x;
      p1.y = y;
      p1.vx = vx;
      p1.vy = vy;
    },
  };

  if (state.mode === 'solo_jeff' && state.jeff.active) {
    const j = state.jeff;
    if (j.heldByP1) {
      return null;
    }
    const jeffInvMass = j.anchored || j.grabbedWallSide !== 0 ? 0 : 1 / PHYSICS.JEFF_MASS;
    const endB: TetherEndpoint = {
      actor: 'jeff',
      box: JEFF_BOX,
      x: j.x,
      y: j.y,
      vx: j.vx,
      vy: j.vy,
      invMass: jeffInvMass,
      isSwinging: false,
      commit: (x, y, vx, vy) => {
        j.x = x;
        j.y = y;
        j.vx = vx;
        j.vy = vy;
      },
    };
    return [endA, endB];
  }

  const p2 = state.p2;
  const endB: TetherEndpoint = {
    actor: 'p2',
    box: PENGUIN_BOX,
    x: p2.x,
    y: p2.y,
    vx: p2.vx,
    vy: p2.vy,
    invMass: getPenguinInvMass(p2),
    isSwinging: p2.action === 'Swing',
    commit: (x, y, vx, vy) => {
      p2.x = x;
      p2.y = y;
      p2.vx = vx;
      p2.vy = vy;
    },
  };
  return [endA, endB];
}

export function createInitialRopeState(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): RopeState {
  const nodes: RopeNode[] = [];
  const count = PHYSICS.ROPE_SEGMENTS;
  const startY = ay + PHYSICS.ROPE_ATTACH_OFFSET_Y;
  const endY = by + PHYSICS.ROPE_ATTACH_OFFSET_Y;

  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0;
    const x = ax + (bx - ax) * t;
    const y = startY + (endY - startY) * t;
    nodes.push({ x, y, prevX: x, prevY: y });
  }

  const dist = Math.hypot(bx - ax, by - ay);
  return {
    maxDistance: PHYSICS.ROPE_MAX_DISTANCE,
    currentDistance: dist,
    taut: dist >= PHYSICS.ROPE_MAX_DISTANCE - 0.02,
    tension: 0,
    wasTaut: false,
    nodes,
  };
}

export function resetVerletRope(state: SimState): void {
  const ax = state.p1.x;
  const ay = state.p1.y + PHYSICS.ROPE_ATTACH_OFFSET_Y;
  const useJeff = state.mode === 'solo_jeff' && state.jeff.active;
  const bx = useJeff ? state.jeff.x : state.p2.x;
  const by = (useJeff ? state.jeff.y : state.p2.y) + PHYSICS.ROPE_ATTACH_OFFSET_Y;

  const nodes = state.rope.nodes;
  const count = nodes.length;
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    nodes[i].x = x;
    nodes[i].y = y;
    nodes[i].prevX = x;
    nodes[i].prevY = y;
  }

  const dist = Math.hypot(bx - ax, by - ay);
  state.rope.currentDistance = dist;
  state.rope.taut = dist >= state.rope.maxDistance - 0.02;
  state.rope.wasTaut = state.rope.taut;
  state.rope.tension = 0;
}

/**
 * Unilateral PBD tether solver (`PHYSICS.POSITION_ITERATIONS = 20`).
 * Zero force when slack (`dist <= maxDistance`).
 * Respects `invMass = 0` for `Anchor`, `Grab`, and grounded `PullRope` penguins.
 * Projects outward radial velocity when taut and emits `rope_taut` on slack -> taut transitions.
 */
export function solveTetherConstraint(state: SimState, level: LevelData): void {
  const rope = state.rope;
  rope.wasTaut = rope.taut;

  const pair = getEndpoints(state);
  if (!pair) {
    rope.currentDistance = 0;
    rope.taut = false;
    rope.tension = 0;
    return;
  }

  const [a, b] = pair;
  const maxDist = Math.max(PHYSICS.PULL_ROPE_MIN_DIST, rope.maxDistance);

  const initDx = b.x - a.x;
  const initDy = b.y - a.y;
  const initDist = Math.hypot(initDx, initDy);

  // Unilateral constraint: zero force when slack
  if (initDist <= maxDist) {
    rope.currentDistance = initDist;
    rope.taut = false;
    rope.tension = 0;
    return;
  }

  const wSum = a.invMass + b.invMass;
  let wA = wSum > 0 ? a.invMass / wSum : 0;
  let wB = wSum > 0 ? b.invMass / wSum : 0;

  let ax = a.x;
  let ay = a.y;
  let bx = b.x;
  let by = b.y;
  let anyBlocked = false;

  // Record pre-solve tangent speed for smooth pendulum arc conservation when single-anchored
  const preDist = initDist;
  const preNx = preDist > 1e-6 ? initDx / preDist : 1;
  const preNy = preDist > 1e-6 ? initDy / preDist : 0;
  const preTx = -preNy;
  const preTy = preNx;
  const preRelVt = (b.vx - a.vx) * preTx + (b.vy - a.vy) * preTy;

  const maxCorrPerStep = PHYSICS.MAX_LINEAR_CORRECTION * PHYSICS.FIXED_DT;

  if (wSum > 0) {
    for (let iter = 0; iter < PHYSICS.POSITION_ITERATIONS; iter++) {
      const dx = bx - ax;
      const dy = by - ay;
      const dist = Math.hypot(dx, dy);
      if (dist <= maxDist + 1e-5 || dist < 1e-6) break;

      const excess = Math.min(dist - maxDist, maxCorrPerStep);
      const nx = dx / dist;
      const ny = dy / dist;

      let moved = 0;
      let aBlocked = false;
      let bBlocked = false;

      if (wA > 0) {
        const resA = applyCollisionConstrainedDelta(
          state,
          level,
          a.actor,
          a.box,
          ax,
          ay,
          nx * excess * wA,
          ny * excess * wA,
        );
        moved += Math.hypot(resA.x - ax, resA.y - ay);
        aBlocked = resA.blockedX || resA.blockedY;
        ax = resA.x;
        ay = resA.y;
      }

      if (wB > 0) {
        const resB = applyCollisionConstrainedDelta(
          state,
          level,
          b.actor,
          b.box,
          bx,
          by,
          -nx * excess * wB,
          -ny * excess * wB,
        );
        moved += Math.hypot(resB.x - bx, resB.y - by);
        bBlocked = resB.blockedX || resB.blockedY;
        bx = resB.x;
        by = resB.y;
      }

      if (aBlocked || bBlocked) {
        anyBlocked = true;
        // If one endpoint is wedged against solid terrain, redistribute remaining pull to the free one
        if (aBlocked && !bBlocked && wB > 0) {
          wA = 0;
          wB = 1;
        } else if (bBlocked && !aBlocked && wA > 0) {
          wA = 1;
          wB = 0;
        }
      }

      if (moved < 1e-5) break;
    }
  }

  // Final normal & distance after PBD position projection
  const finalDx = bx - ax;
  const finalDy = by - ay;
  const finalDist = Math.hypot(finalDx, finalDy);
  const nx = finalDist > 1e-6 ? finalDx / finalDist : preNx;
  const ny = finalDist > 1e-6 ? finalDy / finalDist : preNy;

  let avx = a.vx;
  let avy = a.vy;
  let bvx = b.vx;
  let bvy = b.vy;

  // Project outward radial velocity (unilateral: only remove separating speed)
  const relVx = bvx - avx;
  const relVy = bvy - avy;
  const relVn = relVx * nx + relVy * ny;

  if (relVn > 0) {
    if (wSum > 0) {
      const rwA = a.invMass / wSum;
      const rwB = b.invMass / wSum;
      avx += nx * relVn * rwA;
      avy += ny * relVn * rwA;
      bvx -= nx * relVn * rwB;
      bvy -= ny * relVn * rwB;

      // Eliminate artificial explicit-Euler cosine loss on pure free pendulum arcs
      // so Swing momentum matches Box2D DistanceJoint2D energy conservation.
      if (!anyBlocked && rope.wasTaut && (a.isSwinging || b.isSwinging)) {
        const postTx = -ny;
        const postTy = nx;
        const postRelVt = (bvx - avx) * postTx + (bvy - avy) * postTy;
        if (Math.sign(postRelVt) === Math.sign(preRelVt) && Math.abs(postRelVt) < Math.abs(preRelVt)) {
          const vtBoost = preRelVt - postRelVt;
          if (rwA === 0 && rwB === 1 && b.isSwinging) {
            bvx += postTx * vtBoost;
            bvy += postTy * vtBoost;
          } else if (rwB === 0 && rwA === 1 && a.isSwinging) {
            avx -= postTx * vtBoost;
            avy -= postTy * vtBoost;
          }
        }
      }
    } else {
      // Both endpoints immobilized: remove any residual separating velocity
      avx = 0;
      avy = 0;
      bvx = 0;
      bvy = 0;
    }
  }

  a.commit(ax, ay, avx, avy);
  b.commit(bx, by, bvx, bvy);

  rope.currentDistance = finalDist;
  rope.taut = true;
  const excessStretch = Math.max(0, initDist - maxDist);
  const tension = Math.min(1, Math.max(0.15, excessStretch * 4.5 + Math.max(0, relVn) * 0.08));
  rope.tension = tension;

  // Emit rope_taut event on slack -> taut transition with meaningful snap
  if (!rope.wasTaut && (excessStretch > 0.015 || relVn > 0.8)) {
    state.events.push({
      type: 'rope_taut',
      x: (ax + bx) * 0.5,
      y: (ay + by) * 0.5 + PHYSICS.ROPE_ATTACH_OFFSET_Y,
      tension,
    });
  }
}

/**
 * Simulates the 35-node visual Verlet rope pinned to `(p1.x, p1.y - 0.12)` and `(p2.x, p2.y - 0.12)`.
 * Runs `ROPE_CONSTRAINT_ITERATIONS = 10` constraint passes with `ROPE_GRAVITY_Y = -1.0`.
 */
export function updateVerletRope(state: SimState): void {
  const rope = state.rope;
  const nodes = rope.nodes;
  const count = nodes.length;
  if (count < 2) return;

  const ax = state.p1.x;
  const ay = state.p1.y + PHYSICS.ROPE_ATTACH_OFFSET_Y;
  const useJeff = state.mode === 'solo_jeff' && state.jeff.active;
  const bx = useJeff ? state.jeff.x : state.p2.x;
  const by = (useJeff ? state.jeff.y : state.p2.y) + PHYSICS.ROPE_ATTACH_OFFSET_Y;

  const dt = PHYSICS.FIXED_DT;
  const damping = 0.92;
  const gravStep = PHYSICS.ROPE_GRAVITY_Y * dt; // -0.02 u/tick visual sag
  const windStep = state.windActive ? state.windDir * 0.008 : 0;

  // 1. Verlet integration for interior nodes
  for (let i = 1; i < count - 1; i++) {
    const n = nodes[i];
    const vx = (n.x - n.prevX) * damping;
    const vy = (n.y - n.prevY) * damping;
    n.prevX = n.x;
    n.prevY = n.y;
    n.x += vx + windStep;
    n.y += vy + gravStep;
  }

  // Segment length scaled to current rope maxDistance so rope pulls tight cleanly at maxDistance
  const targetTotalLen = Math.max(PHYSICS.PULL_ROPE_MIN_DIST, rope.maxDistance * 1.02);
  const segLen = Math.min(PHYSICS.ROPE_SEG_LEN, targetTotalLen / (count - 1));

  // 2. Pin endpoints & solve distance constraints (`ROPE_CONSTRAINT_ITERATIONS = 10`)
  for (let iter = 0; iter < PHYSICS.ROPE_CONSTRAINT_ITERATIONS; iter++) {
    nodes[0].x = ax;
    nodes[0].y = ay;
    nodes[0].prevX = ax;
    nodes[0].prevY = ay;

    nodes[count - 1].x = bx;
    nodes[count - 1].y = by;
    nodes[count - 1].prevX = bx;
    nodes[count - 1].prevY = by;

    for (let i = 0; i < count - 1; i++) {
      const n1 = nodes[i];
      const n2 = nodes[i + 1];
      const dx = n2.x - n1.x;
      const dy = n2.y - n1.y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-6) continue;

      const diff = (d - segLen) / d;
      const ox = dx * diff;
      const oy = dy * diff;

      if (i === 0) {
        n2.x -= ox;
        n2.y -= oy;
      } else if (i + 1 === count - 1) {
        n1.x += ox;
        n1.y += oy;
      } else {
        n1.x += ox * 0.5;
        n1.y += oy * 0.5;
        n2.x -= ox * 0.5;
        n2.y -= oy * 0.5;
      }
    }
  }

  // Final exact endpoint pin
  nodes[0].x = ax;
  nodes[0].y = ay;
  nodes[count - 1].x = bx;
  nodes[count - 1].y = by;

  // When rope is taut, lightly blend toward straight line to prevent visual lag at high swing speeds
  if (rope.taut) {
    for (let i = 1; i < count - 1; i++) {
      const t = i / (count - 1);
      const lx = ax + (bx - ax) * t;
      const ly = ay + (by - ay) * t;
      nodes[i].x += (lx - nodes[i].x) * 0.35;
      nodes[i].y += (ly - nodes[i].y) * 0.35;
    }
  }
}
