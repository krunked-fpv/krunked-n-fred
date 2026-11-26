import type { JeffState, PenguinState, SimState } from '../contracts';

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function mixByte(h: number, b: number): number {
  h ^= b & 0xff;
  return Math.imul(h, FNV_PRIME) >>> 0;
}

function mixInt32(h: number, value: number): number {
  const v = value | 0;
  h = mixByte(h, v & 0xff);
  h = mixByte(h, (v >>> 8) & 0xff);
  h = mixByte(h, (v >>> 16) & 0xff);
  h = mixByte(h, (v >>> 24) & 0xff);
  return h;
}

function mixBool(h: number, value: boolean): number {
  return mixByte(h, value ? 1 : 0);
}

function mixFloat(h: number, value: number): number {
  if (!Number.isFinite(value) || value === 0) {
    return mixInt32(h, 0);
  }
  // Quantize to 1e-4 units to stay resilient against -0 / sub-ULP noise while
  // capturing every meaningful physics, timer, and position difference.
  const scaled = Math.round(value * 10000);
  return mixInt32(h, scaled);
}

function mixString(h: number, value: string | null): number {
  if (value === null) {
    return mixByte(h, 0xff);
  }
  h = mixInt32(h, value.length);
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    h = mixByte(h, code & 0xff);
    if (code > 0xff) {
      h = mixByte(h, (code >>> 8) & 0xff);
    }
  }
  return h;
}

function hashPenguin(h: number, p: PenguinState): number {
  h = mixFloat(h, p.x);
  h = mixFloat(h, p.y);
  h = mixFloat(h, p.vx);
  h = mixFloat(h, p.vy);
  h = mixInt32(h, p.facing);
  h = mixString(h, p.action);
  h = mixInt32(h, p.flags);
  h = mixBool(h, p.grounded);
  h = mixString(h, p.groundTerrain);
  h = mixInt32(h, p.wallSide);
  h = mixString(h, p.wallEntityId);
  h = mixString(h, p.platformEntityId);
  h = mixFloat(h, p.coyoteTimer);
  h = mixFloat(h, p.jumpCooldown);
  h = mixFloat(h, p.jumpBufferTimer);
  h = mixFloat(h, p.fallTimer);
  h = mixFloat(h, p.landHardTimer);
  h = mixFloat(h, p.grabStamina);
  h = mixFloat(h, p.swingTimer);
  h = mixFloat(h, p.swingRestTimer);
  h = mixFloat(h, p.swingFallTimer);
  h = mixFloat(h, p.swingAdditive);
  h = mixFloat(h, p.dragForce);
  h = mixFloat(h, p.dragNoWallTimer);
  h = mixFloat(h, p.iceVelX);
  h = mixFloat(h, p.pullRopeTimer);
  h = mixFloat(h, p.callCharlieTimer);
  h = mixString(h, p.emote);
  h = mixFloat(h, p.emoteTimer);
  h = mixBool(h, p.carryingJeff);
  h = mixInt32(h, p.jumpsUsed);
  return h;
}

function hashJeff(h: number, j: JeffState): number {
  h = mixBool(h, j.active);
  if (!j.active) return h;
  h = mixFloat(h, j.x);
  h = mixFloat(h, j.y);
  h = mixFloat(h, j.vx);
  h = mixFloat(h, j.vy);
  h = mixBool(h, j.grounded);
  h = mixBool(h, j.heldByP1);
  h = mixInt32(h, j.grabbedWallSide);
  h = mixFloat(h, j.grabTimer);
  h = mixBool(h, j.fallingSlow);
  h = mixBool(h, j.anchored);
  h = mixString(h, j.platformEntityId);
  h = mixFloat(h, j.tossCooldown);
  return h;
}

/**
 * Stable 8-character lowercase hex FNV-1a (32-bit) checksum of deterministic simulation state.
 */
export function hashSimState(state: SimState): string {
  let h = FNV_OFFSET_BASIS;

  // Core tick, RNG, and mode
  h = mixInt32(h, state.tick);
  h = mixInt32(h, state.rngState);
  h = mixString(h, state.levelId);
  h = mixString(h, state.mode);
  h = mixBool(h, state.assistEverUsedInRun);

  // Actors
  h = hashPenguin(h, state.p1);
  h = hashPenguin(h, state.p2);
  h = hashJeff(h, state.jeff);

  // Rope tether
  h = mixFloat(h, state.rope.maxDistance);
  h = mixFloat(h, state.rope.currentDistance);
  h = mixBool(h, state.rope.taut);
  h = mixFloat(h, state.rope.tension);

  // Checkpoint / Charlie
  h = mixBool(h, state.checkpoint.placed);
  h = mixFloat(h, state.checkpoint.x);
  h = mixFloat(h, state.checkpoint.y);
  h = mixBool(h, state.checkpoint.charlieActive);
  h = mixFloat(h, state.checkpoint.charlieProgress);

  // Altitude, stats, biome, wind
  h = mixFloat(h, state.altitude);
  h = mixFloat(h, state.maxAltitude);
  h = mixInt32(h, state.fallsCount);
  h = mixInt32(h, state.jumpsCount);
  h = mixString(h, state.currentBiome);
  h = mixBool(h, state.windActive);
  h = mixInt32(h, state.windDir);
  h = mixString(h, state.windPhase);

  // Dynamic hazards & entities
  for (let i = 0; i < state.fallingBlocks.length; i++) {
    const b = state.fallingBlocks[i];
    h = mixString(h, b.state);
    h = mixFloat(h, b.timer);
  }
  for (let i = 0; i < state.movablePlatforms.length; i++) {
    const m = state.movablePlatforms[i];
    h = mixFloat(h, m.x);
    h = mixFloat(h, m.y);
    h = mixFloat(h, m.vx);
    h = mixFloat(h, m.vy);
    h = mixFloat(h, m.t);
    h = mixInt32(h, m.dir);
    h = mixBool(h, m.active);
    h = mixFloat(h, m.pauseTimer);
  }
  for (let i = 0; i < state.swingPlatforms.length; i++) {
    const s = state.swingPlatforms[i];
    h = mixFloat(h, s.x);
    h = mixFloat(h, s.y);
    h = mixFloat(h, s.angle);
    h = mixFloat(h, s.angularVel);
  }
  for (let i = 0; i < state.windZones.length; i++) {
    const w = state.windZones[i];
    h = mixString(h, w.phase);
    h = mixFloat(h, w.timer);
  }
  for (let i = 0; i < state.circuits.length; i++) {
    h = mixBool(h, state.circuits[i].powered);
  }
  for (let i = 0; i < state.buttons.length; i++) {
    const btn = state.buttons[i];
    h = mixBool(h, btn.pressed);
    h = mixFloat(h, btn.timer);
  }
  for (let i = 0; i < state.lasers.length; i++) {
    const l = state.lasers[i];
    h = mixBool(h, l.active);
    h = mixFloat(h, l.cooldown);
  }
  for (let i = 0; i < state.tronchos.length; i++) {
    const tr = state.tronchos[i];
    h = mixFloat(h, tr.x);
    h = mixFloat(h, tr.y);
    h = mixFloat(h, tr.t);
    h = mixBool(h, tr.extended);
  }
  for (let i = 0; i < state.colorPlatforms.length; i++) {
    h = mixBool(h, state.colorPlatforms[i].active);
  }
  for (let i = 0; i < state.collectibles.length; i++) {
    h = mixBool(h, state.collectibles[i].collected);
  }

  // Boss state
  h = mixBool(h, state.boss.active);
  h = mixBool(h, state.boss.defeated);
  h = mixInt32(h, state.boss.phaseIndex);
  h = mixFloat(h, state.boss.laserSweepAngle);
  h = mixFloat(h, state.boss.attackTimer);
  h = mixFloat(h, state.boss.celebrationTimer);
  for (let i = 0; i < state.boss.chains.length; i++) {
    h = mixBool(h, state.boss.chains[i].broken);
  }

  // Completion state
  h = mixBool(h, state.completed);
  h = mixFloat(h, state.completionTimeSec);
  h = mixString(h, state.completionMedal);

  return (h >>> 0).toString(16).padStart(8, '0');
}
