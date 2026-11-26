// ============================================================================
// Krunked & Fred — Fixed 512-Slot Zero-Allocation Particle Pool
// Handles falling snow, wall-cling sweat drops, footstep/land puffs, wind
// telegraph streaks & gale lines, crumbling debris, hard-land stars, confetti.
// ============================================================================

import { PALETTE, PHYSICS, type TerrainType } from '../contracts';

export const MAX_PARTICLES = 512;

export type ParticleKind =
  | 'snow'
  | 'sweat'
  | 'puff'
  | 'wind_telegraph'
  | 'wind_gale'
  | 'debris'
  | 'star'
  | 'confetti'
  | 'spark';

interface ParticleSlot {
  active: boolean;
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravityScale: number;
  screenSpace: boolean;
  phase: number;
}

const CONFETTI_COLORS = [
  PALETTE.KRUNKED_SCARF,
  PALETTE.FRED_SCARF,
  PALETTE.LAB_AMBER,
  PALETTE.LAB_CYAN,
  PALETTE.SNOW_BRIGHT,
  PALETTE.CLIFF_MID,
] as const;

export class ParticlePool {
  private readonly slots: ParticleSlot[];
  private cursor = 0;
  private rng = 0x51a7c3d9;
  private activeCount = 0;

  constructor() {
    this.slots = new Array<ParticleSlot>(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.slots[i] = {
        active: false,
        kind: 'snow',
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 1,
        color: PALETTE.SNOW_BRIGHT,
        gravityScale: 0,
        screenSpace: false,
        phase: 0,
      };
    }
  }

  getActiveCount(): number {
    return this.activeCount;
  }

  clear(): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.slots[i].active = false;
    }
    this.activeCount = 0;
  }

  private rand(): number {
    // Fast visual-only xorshift32 (never touches SimState.rngState)
    let x = this.rng | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rng = x;
    return ((x >>> 0) & 0x7fffffff) / 0x80000000;
  }

  private randRange(min: number, max: number): number {
    return min + (max - min) * this.rand();
  }

  /**
   * Allocates a slot from the fixed 512-slot ring buffer with ZERO heap allocs.
   */
  spawn(
    kind: ParticleKind,
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    color: string,
    gravityScale: number,
    screenSpace = false
  ): void {
    let slot: ParticleSlot | null = null;
    for (let n = 0; n < MAX_PARTICLES; n++) {
      const idx = (this.cursor + n) & (MAX_PARTICLES - 1);
      if (!this.slots[idx].active) {
        slot = this.slots[idx];
        this.cursor = (idx + 1) & (MAX_PARTICLES - 1);
        break;
      }
    }
    // If pool is saturated, recycle oldest slot cleanly (still zero allocation!)
    if (!slot) {
      slot = this.slots[this.cursor];
      this.cursor = (this.cursor + 1) & (MAX_PARTICLES - 1);
    }

    slot.active = true;
    slot.kind = kind;
    slot.x = x;
    slot.y = y;
    slot.vx = vx;
    slot.vy = vy;
    slot.life = life;
    slot.maxLife = life > 0.001 ? life : 0.001;
    slot.size = size;
    slot.color = color;
    slot.gravityScale = gravityScale;
    slot.screenSpace = screenSpace;
    slot.phase = this.rand() * Math.PI * 2;
  }

  private terrainDustColor(terrain: TerrainType): string {
    switch (terrain) {
      case 'ICE':
        return PALETTE.ICE_LIGHT;
      case 'DIRT':
      case 'MUD':
        return PALETTE.MINE_WOOD;
      case 'PLATFORM':
      case 'MOVABLE':
      case 'BELL_HOUSE':
      case 'WORKSHOP':
        return PALETTE.BEAK_MID;
      case 'LAB':
      case 'LAB2':
      case 'LAB_PLATFORM':
      case 'LAB_PLATFORM2':
      case 'TRONCHO':
        return PALETTE.LAB_HIGHLIGHT;
      default:
        return PALETTE.SNOW_BRIGHT;
    }
  }

  emitFootstep(x: number, y: number, terrain: TerrainType, dirHint = 0): void {
    const col = this.terrainDustColor(terrain);
    const feetY = y - 0.52;
    for (let i = 0; i < 3; i++) {
      this.spawn(
        'puff',
        x + this.randRange(-0.18, 0.18),
        feetY,
        -dirHint * this.randRange(0.4, 1.4) + this.randRange(-0.6, 0.6),
        this.randRange(0.5, 1.8),
        this.randRange(0.22, 0.38),
        i === 0 ? 2 : 1,
        col,
        0.08,
        false
      );
    }
  }

  emitJump(x: number, y: number): void {
    const feetY = y - 0.52;
    for (let i = 0; i < 5; i++) {
      const spread = (i - 2) * 0.7;
      this.spawn(
        'puff',
        x + this.randRange(-0.22, 0.22),
        feetY,
        spread + this.randRange(-0.3, 0.3),
        this.randRange(0.4, 1.6),
        this.randRange(0.25, 0.42),
        2,
        i % 2 === 0 ? PALETTE.SNOW_BRIGHT : PALETTE.SNOW_LIGHT,
        0.06,
        false
      );
    }
  }

  emitLand(x: number, y: number, terrain: TerrainType, hard: boolean): void {
    const col = this.terrainDustColor(terrain);
    const feetY = y - 0.52;
    const count = hard ? 12 : 6;
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      this.spawn(
        'puff',
        x + side * this.randRange(0.05, 0.32),
        feetY,
        side * this.randRange(hard ? 1.4 : 0.6, hard ? 4.2 : 2.2),
        this.randRange(0.6, hard ? 3.2 : 1.7),
        this.randRange(0.28, hard ? 0.58 : 0.42),
        hard ? 3 : 2,
        i % 3 === 0 ? PALETTE.SNOW_BRIGHT : col,
        0.18,
        false
      );
    }
    if (hard) {
      for (let s = 0; s < 6; s++) {
        const ang = (s / 6) * Math.PI * 2 + this.randRange(-0.2, 0.2);
        const spd = this.randRange(2.4, 4.4);
        this.spawn(
          'star',
          x,
          y + 0.1,
          Math.cos(ang) * spd,
          Math.sin(ang) * spd + 1.4,
          this.randRange(0.45, 0.72),
          3,
          s % 2 === 0 ? PALETTE.LAB_AMBER : PALETTE.SNOW_BRIGHT,
          0.22,
          false
        );
      }
    }
  }

  emitSweat(x: number, y: number, wallSide: -1 | 0 | 1, redTint: number): void {
    const away = wallSide !== 0 ? -wallSide : this.rand() < 0.5 ? -1 : 1;
    const col = redTint > 0.65 && this.rand() < 0.35 ? PALETTE.SNOW_BRIGHT : PALETTE.LAB_CYAN;
    this.spawn(
      'sweat',
      x + away * this.randRange(0.15, 0.35),
      y + this.randRange(0.1, 0.38),
      away * this.randRange(1.0, 2.4 + redTint * 1.4),
      this.randRange(1.5, 3.2),
      this.randRange(0.32, 0.52),
      2,
      col,
      0.32,
      false
    );
  }

  emitDebris(x: number, y: number, w: number, h: number, count: number, color?: string): void {
    for (let i = 0; i < count; i++) {
      const col =
        color ??
        (i % 3 === 0
          ? PALETTE.MINE_BRICK
          : i % 3 === 1
            ? PALETTE.MINE_WOOD
            : PALETTE.MINE_ROCK);
      this.spawn(
        'debris',
        x + this.randRange(0, w),
        y + this.randRange(0, h),
        this.randRange(-3.2, 3.2),
        this.randRange(0.5, 4.4),
        this.randRange(0.45, 0.85),
        i % 2 === 0 ? 3 : 2,
        col,
        0.48,
        false
      );
    }
  }

  emitSparkles(x: number, y: number, count: number, color: string): void {
    for (let i = 0; i < count; i++) {
      const ang = this.randRange(0, Math.PI * 2);
      const spd = this.randRange(1.2, 3.8);
      this.spawn(
        'star',
        x + this.randRange(-0.2, 0.2),
        y + this.randRange(-0.2, 0.2),
        Math.cos(ang) * spd,
        Math.sin(ang) * spd + 0.8,
        this.randRange(0.35, 0.68),
        3,
        i % 3 === 0 ? PALETTE.SNOW_BRIGHT : color,
        0.12,
        false
      );
    }
  }

  emitSparks(x: number, y: number, count: number, color: string): void {
    for (let i = 0; i < count; i++) {
      const ang = this.randRange(0, Math.PI * 2);
      const spd = this.randRange(1.8, 5.2);
      this.spawn(
        'spark',
        x,
        y,
        Math.cos(ang) * spd,
        Math.sin(ang) * spd,
        this.randRange(0.16, 0.35),
        2,
        i % 2 === 0 ? PALETTE.SNOW_BRIGHT : color,
        0.2,
        false
      );
    }
  }

  emitConfetti(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const col = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      this.spawn(
        'confetti',
        x + this.randRange(-0.6, 0.6),
        y + this.randRange(-0.2, 0.5),
        this.randRange(-4.5, 4.5),
        this.randRange(3.2, 7.8),
        this.randRange(1.0, 1.8),
        2,
        col,
        0.14,
        false
      );
    }
  }

  emitAmbientSnow(windActive: boolean, windDir: 1 | -1): void {
    const startX = windActive
      ? windDir > 0
        ? this.randRange(-24, 380)
        : this.randRange(100, 504)
      : this.randRange(0, PHYSICS.LOGICAL_WIDTH);
    const vx = windActive ? windDir * this.randRange(85, 160) : this.randRange(-12, 12);
    const vy = this.randRange(24, 52); // screen-space Y-down px/s
    this.spawn(
      'snow',
      startX,
      -4,
      vx,
      vy,
      this.randRange(5.5, 9.5),
      this.rand() < 0.35 ? 2 : 1,
      this.rand() < 0.5 ? PALETTE.SNOW_BRIGHT : PALETTE.SNOW_LIGHT,
      0,
      true
    );
  }

  emitWindStreak(dir: 1 | -1, isTelegraph: boolean): void {
    const startX = dir > 0 ? -24 : PHYSICS.LOGICAL_WIDTH + 24;
    const startY = this.randRange(12, PHYSICS.LOGICAL_HEIGHT - 12);
    const speed = isTelegraph ? this.randRange(210, 310) : this.randRange(420, 640);
    const len = isTelegraph ? this.randRange(6, 12) : this.randRange(12, 26);
    this.spawn(
      isTelegraph ? 'wind_telegraph' : 'wind_gale',
      startX,
      startY,
      dir * speed,
      this.randRange(-14, 14),
      isTelegraph ? 1.8 : 1.1,
      len,
      isTelegraph ? PALETTE.ICE_LIGHT : PALETTE.SNOW_BRIGHT,
      0,
      true
    );
  }

  update(dt: number): void {
    const clampedDt = dt > 0.05 ? 0.05 : dt;
    let count = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.slots[i];
      if (!p.active) continue;

      p.life -= clampedDt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }

      if (p.screenSpace) {
        p.x += p.vx * clampedDt;
        p.y += p.vy * clampedDt;
        if (p.kind === 'snow') {
          p.phase += clampedDt * 2.6;
          p.x += Math.sin(p.phase) * 14 * clampedDt;
        }
        if (
          p.y > PHYSICS.LOGICAL_HEIGHT + 16 ||
          p.x < -48 ||
          p.x > PHYSICS.LOGICAL_WIDTH + 48
        ) {
          p.active = false;
          continue;
        }
      } else {
        // World-space Y-UP physics
        p.vy += PHYSICS.EFFECTIVE_GRAVITY_Y * p.gravityScale * clampedDt;
        if (p.kind === 'puff') {
          p.vx *= 1 - Math.min(0.8, clampedDt * 4.5);
          p.vy *= 1 - Math.min(0.8, clampedDt * 3.0);
        } else if (p.kind === 'confetti') {
          p.phase += clampedDt * 9;
          p.vx *= 1 - Math.min(0.7, clampedDt * 2.2);
          p.x += Math.sin(p.phase) * 1.4 * clampedDt;
          if (p.vy < -2.6) p.vy = -2.6;
        }
        p.x += p.vx * clampedDt;
        p.y += p.vy * clampedDt;
      }
      count++;
    }
    this.activeCount = count;
  }

  render(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const halfW = PHYSICS.LOGICAL_WIDTH * 0.5;
    const halfH = PHYSICS.LOGICAL_HEIGHT * 0.5;
    const ppu = PHYSICS.PPU;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.slots[i];
      if (!p.active) continue;

      const sx = p.screenSpace ? Math.round(p.x) : Math.round((p.x - camX) * ppu + halfW);
      const sy = p.screenSpace ? Math.round(p.y) : Math.round(halfH - (p.y - camY) * ppu);

      if (sx < -32 || sx > PHYSICS.LOGICAL_WIDTH + 32 || sy < -32 || sy > PHYSICS.LOGICAL_HEIGHT + 32) {
        continue;
      }

      const ratio = p.life / p.maxLife;

      switch (p.kind) {
        case 'snow': {
          ctx.fillStyle = p.color;
          ctx.fillRect(sx, sy, p.size, p.size);
          break;
        }
        case 'wind_telegraph': {
          ctx.globalAlpha = Math.min(0.55, ratio * 0.7);
          ctx.fillStyle = p.color;
          ctx.fillRect(sx, sy, Math.round(p.size), 1);
          ctx.globalAlpha = 1;
          break;
        }
        case 'wind_gale': {
          const w = Math.round(p.size);
          ctx.globalAlpha = Math.min(0.85, ratio * 1.1);
          ctx.fillStyle = PALETTE.ICE_LIGHT;
          ctx.fillRect(sx, sy, w, 1);
          ctx.fillStyle = PALETTE.SNOW_BRIGHT;
          ctx.fillRect(sx + 2, sy, Math.max(2, w - 4), 1);
          ctx.globalAlpha = 1;
          break;
        }
        case 'sweat': {
          ctx.fillStyle = PALETTE.OUTLINE;
          ctx.fillRect(sx - 1, sy - 1, 3, 4);
          ctx.fillStyle = p.color;
          ctx.fillRect(sx, sy, 1, 2);
          ctx.fillStyle = PALETTE.SNOW_BRIGHT;
          ctx.fillRect(sx, sy, 1, 1);
          break;
        }
        case 'puff': {
          const s = ratio > 0.45 ? p.size : 1;
          ctx.globalAlpha = Math.min(1, ratio * 1.4);
          ctx.fillStyle = p.color;
          ctx.fillRect(sx - (s >> 1), sy - (s >> 1), s, s);
          ctx.globalAlpha = 1;
          break;
        }
        case 'debris': {
          const s = p.size;
          ctx.fillStyle = PALETTE.OUTLINE;
          ctx.fillRect(sx - 1, sy - 1, s + 2, s + 2);
          ctx.fillStyle = p.color;
          ctx.fillRect(sx, sy, s, s);
          break;
        }
        case 'star': {
          ctx.fillStyle = p.color;
          ctx.fillRect(sx, sy, 1, 1);
          if (ratio > 0.35) {
            ctx.fillRect(sx - 1, sy, 3, 1);
            ctx.fillRect(sx, sy - 1, 1, 3);
          }
          break;
        }
        case 'confetti': {
          const flip = Math.sin(p.phase) > 0;
          ctx.fillStyle = PALETTE.OUTLINE;
          ctx.fillRect(sx - 1, sy - 1, (flip ? 2 : 1) + 2, (flip ? 1 : 2) + 2);
          ctx.fillStyle = p.color;
          ctx.fillRect(sx, sy, flip ? 2 : 1, flip ? 1 : 2);
          break;
        }
        case 'spark': {
          ctx.fillStyle = p.color;
          ctx.fillRect(sx, sy, p.size, 1);
          break;
        }
      }
    }
  }
}
