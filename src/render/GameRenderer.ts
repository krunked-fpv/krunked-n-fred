// ============================================================================
// Krunked & Fred — 480x270 Full-Scene Pixel-Art GameRenderer
// Implements RendererModulePort with zero per-frame canvas/texture/pool allocs:
// Parallax alpine sky -> Dark Mines strata -> Auto-tiled terrain -> Dynamic
// hazards -> 35-node braided Verlet rope -> Expressive penguins + hands +
// flapping scarves -> Pooled particles -> 2D Headlamp Lightmap -> Pixel HUD.
// ============================================================================

import {
  PALETTE,
  PHYSICS,
  PenguinFlag,
  WORLD,
  type BiomeId,
  type LevelData,
  type PackSource,
  type PenguinState,
  type RenderSettings,
  type RendererModulePort,
  type RopeSkinId,
  type SaveData,
  type SignDef,
  type SimEvent,
  type SimState,
  type TileCell,
  type Vec2,
} from '../contracts';
import {
  AssetPackManager,
  PENGUIN_ANIM_COUNTS,
  drawPixelBox,
  drawPixelText,
  drawWrappedPixelText,
  measurePixelText,
  type PenguinAnimName,
  type SpriteRect,
} from '../assets';
import { ParticlePool } from './ParticlePool';
import { WebGL2PixelBlitter } from './WebGL2PixelBlitter';

const W = PHYSICS.LOGICAL_WIDTH; // 480
const H = PHYSICS.LOGICAL_HEIGHT; // 270
const HALF_W = W * 0.5; // 240
const HALF_H = H * 0.5; // 135
const PPU = PHYSICS.PPU; // 16

const BIOME_DISPLAY: Record<BiomeId, { label: string; accent: string }> = {
  village: { label: 'VILLAGE', accent: PALETTE.PINE_MOSS },
  foothills: { label: 'FOOTHILLS', accent: PALETTE.ICE_LIGHT },
  mines: { label: 'DARK MINES', accent: PALETTE.BEAK_BRIGHT },
  crags: { label: 'WIND CRAGS', accent: PALETTE.CLIFF_MID },
  summit: { label: 'SUMMIT', accent: PALETTE.LAB_AMBER },
  lab: { label: 'LABORATORY', accent: PALETTE.LAB_CYAN },
  boss: { label: 'BOSS ARENA', accent: PALETTE.KRUNKED_SCARF },
};

const ROPE_SKIN_COLORS: Record<RopeSkinId, readonly [string, string]> = {
  Default: [PALETTE.ROPE_BASE, PALETTE.CLIFF_MID],
  Animals: ['#df7126', '#8f563b'],
  Box: ['#c78c5d', '#7a4537'],
  Bread: ['#fbe4b2', '#c97e38'],
  Fish: [PALETTE.LAB_CYAN, '#2b8ea8'],
  Fruit: [PALETTE.PINE_MOSS, PALETTE.KRUNKED_SCARF],
  Inverted: [PALETTE.BODY_MAIN, PALETTE.SNOW_BRIGHT],
  Knight: [PALETTE.LAB_HIGHLIGHT, PALETTE.LAB_STEEL],
  Pot: ['#8b9aa8', '#4a5568'],
  Robot: [PALETTE.LAB_CYAN, PALETTE.LAB_STEEL],
  Skeleton: [PALETTE.SNOW_BRIGHT, PALETTE.BODY_DARK],
  Super: [PALETTE.LAB_AMBER, PALETTE.KRUNKED_SCARF],
};

interface CachedTree {
  x: number;
  y: number;
  large: boolean;
}

interface CachedLevelIndex {
  key: string;
  rows: Map<number, TileCell[]>;
  trees: CachedTree[];
  cabinPos: Vec2 | null;
  lanterns: Vec2[];
}

interface StarDef {
  x: number;
  y: number;
  bright: boolean;
  phase: number;
}

interface CloudDef {
  x: number;
  y: number;
  w: number;
  h: number;
  speed: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hashInt(n: number): number {
  let x = (n ^ 0x45d9f3b) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}

function formatTimer(sec: number): string {
  const safe = Math.max(0, sec);
  const mins = Math.floor(safe / 60);
  const rem = safe - mins * 60;
  const wholeSec = Math.floor(rem);
  const tenths = Math.floor((rem - wholeSec) * 10);
  const mm = mins < 10 ? `0${mins}` : `${mins}`;
  const ss = wholeSec < 10 ? `0${wholeSec}` : `${wholeSec}`;
  return `${mm}:${ss}.${tenths}`;
}

function formatAltitude(alt: number): string {
  const m = Math.max(0, Math.round(alt));
  if (m < 10) return `00${m}m`;
  if (m < 100) return `0${m}m`;
  return `${m}m`;
}

export class GameRenderer implements RendererModulePort {
  private readonly blitter: WebGL2PixelBlitter;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly packs: AssetPackManager;
  private readonly particles: ParticlePool;

  // Pre-allocated offscreen scratch canvases (allocated ONCE at init!)
  private readonly lightCanvas: HTMLCanvasElement;
  private readonly lightCtx: CanvasRenderingContext2D;
  private readonly tintCanvas: HTMLCanvasElement;
  private readonly tintCtx: CanvasRenderingContext2D;

  // Pre-computed atmospheric backdrop elements
  private readonly stars: StarDef[];
  private readonly clouds: CloudDef[];

  // Per-level spatial index & grounded scenery cache
  private levelIndex: CachedLevelIndex | null = null;

  // Render-only visual animation clocks & HUD juice state
  private animClock = 0;
  private camX = 0;
  private camY = 0;
  private snowAccum = 0;
  private windParticleAccum = 0;
  private sweatAccumP1 = 0;
  private sweatAccumP2 = 0;
  private placeFlagAnimP1 = 0;
  private placeFlagAnimP2 = 0;

  private lastMaxAltitude = 0;
  private altPunchTimer = 0;
  private toastText = '';
  private toastColor: string = PALETTE.LAB_AMBER;
  private toastTimer = 0;

  private disposed = false;

  constructor(container: HTMLElement, packManager?: AssetPackManager) {
    this.blitter = new WebGL2PixelBlitter(container);
    this.ctx = this.blitter.getFramebufferContext();
    this.packs = packManager ?? new AssetPackManager();
    this.particles = new ParticlePool();

    // Pre-allocate 480x270 2D headlamp lightmap buffer ONCE
    this.lightCanvas = document.createElement('canvas');
    this.lightCanvas.width = W;
    this.lightCanvas.height = H;
    const lCtx = this.lightCanvas.getContext('2d');
    if (!lCtx) {
      throw new Error('Could not create headlamp lightmap context');
    }
    lCtx.imageSmoothingEnabled = false;
    this.lightCtx = lCtx;

    // Pre-allocate 32x32 penguin tint scratch buffer ONCE
    this.tintCanvas = document.createElement('canvas');
    this.tintCanvas.width = 32;
    this.tintCanvas.height = 32;
    const tCtx = this.tintCanvas.getContext('2d');
    if (!tCtx) {
      throw new Error('Could not create sprite tint context');
    }
    tCtx.imageSmoothingEnabled = false;
    this.tintCtx = tCtx;

    // Deterministic alpine starfield & clouds (pre-allocated ONCE)
    this.stars = [];
    for (let i = 0; i < 64; i++) {
      const h1 = hashInt(i * 73 + 17);
      const h2 = hashInt(i * 199 + 31);
      this.stars.push({
        x: h1 % W,
        y: (h2 % 155) + 4,
        bright: (h1 & 7) === 0,
        phase: (h2 % 628) * 0.01,
      });
    }
    this.clouds = [
      { x: 40, y: 46, w: 54, h: 12, speed: 4.5 },
      { x: 175, y: 74, w: 68, h: 14, speed: 3.1 },
      { x: 320, y: 38, w: 48, h: 10, speed: 5.2 },
      { x: 425, y: 92, w: 62, h: 13, speed: 3.8 },
    ];
  }

  getCanvas(): HTMLCanvasElement {
    return this.blitter.getCanvas();
  }

  getPackManager(): AssetPackManager {
    return this.packs;
  }

  resize(width: number, height: number): void {
    this.blitter.resize(width, height);
  }

  async setPackSource(source: PackSource): Promise<PackSource> {
    return this.packs.setPackSource(source);
  }

  getPackSource(): PackSource {
    return this.packs.getPackSource();
  }

  hasCustomPack(): boolean {
    return this.packs.hasCustomPack();
  }

  async loadCustomPackFromFiles(files: FileList | File[]): Promise<boolean> {
    return this.packs.loadCustomPackFromFiles(files);
  }

  consumeEvents(events: SimEvent[], state: SimState): void {
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      switch (ev.type) {
        case 'jump':
          this.particles.emitJump(ev.x, ev.y);
          break;
        case 'footstep': {
          const p = ev.who === 'p1' ? state.p1 : state.p2;
          this.particles.emitFootstep(ev.x, ev.y, ev.terrain, p.facing);
          break;
        }
        case 'land':
          this.particles.emitLand(ev.x, ev.y, ev.terrain, false);
          break;
        case 'land_hard':
          this.particles.emitLand(ev.x, ev.y, ev.terrain, true);
          break;
        case 'grab_start':
          this.particles.emitSparks(ev.x, ev.y, 4, PALETTE.SNOW_LIGHT);
          break;
        case 'grab_stamina_out':
          this.particles.emitSweat(ev.x, ev.y, 0, 1);
          this.particles.emitSweat(ev.x, ev.y, 0, 1);
          this.particles.emitSweat(ev.x, ev.y, 0, 1);
          break;
        case 'anchor_set':
          this.particles.emitLand(ev.x, ev.y, ev.terrain, false);
          break;
        case 'swing_launch':
          this.particles.emitSparkles(ev.x, ev.y, 6, PALETTE.ICE_LIGHT);
          break;
        case 'rope_taut':
          this.particles.emitSparks(ev.x, ev.y, 4, PALETTE.LAB_AMBER);
          break;
        case 'block_shake':
          this.particles.emitDebris(ev.x, ev.y, 1, 0.3, 4);
          break;
        case 'block_crumble':
          this.particles.emitDebris(ev.x, ev.y, 1, 1, 14);
          break;
        case 'block_recover':
          this.particles.emitSparkles(ev.x + 0.5, ev.y + 0.5, 5, PALETTE.SNOW_LIGHT);
          break;
        case 'flag_place':
          this.particles.emitConfetti(ev.x, ev.y + 0.8, 12);
          this.placeFlagAnimP1 = 0.55;
          this.placeFlagAnimP2 = 0.55;
          this.showToast('CHECKPOINT FLAG PLACED!', PALETTE.LAB_AMBER);
          break;
        case 'charlie_pickup':
          this.particles.emitSparkles(ev.x, ev.y + 0.6, 10, PALETTE.SNOW_BRIGHT);
          this.showToast('CHARLIE EXPRESS!', PALETTE.ICE_LIGHT);
          break;
        case 'collect_photo':
          this.particles.emitSparkles(ev.x, ev.y, 14, PALETTE.LAB_AMBER);
          this.showToast(`PHOTO: ${ev.label}`, PALETTE.LAB_AMBER);
          break;
        case 'collect_manual':
          this.particles.emitSparkles(ev.x, ev.y, 14, PALETTE.LAB_CYAN);
          this.showToast(`MANUAL: ${ev.label}`, PALETTE.LAB_CYAN);
          break;
        case 'rescue_seal':
          this.particles.emitConfetti(ev.x, ev.y + 0.5, 16);
          this.showToast('SEAL RESCUED!', PALETTE.PINE_MOSS);
          break;
        case 'button_press':
          this.particles.emitSparks(
            ev.x + 0.5,
            ev.y + 0.2,
            6,
            ev.powered ? PALETTE.LAB_CYAN : PALETTE.LAB_STEEL
          );
          break;
        case 'troncho_launch':
          this.particles.emitSparks(ev.x, ev.y, 10, PALETTE.LAB_AMBER);
          break;
        case 'laser_zap':
          this.particles.emitSparks(ev.x, ev.y, 12, PALETTE.KRUNKED_SCARF);
          break;
        case 'boss_chain_break':
          this.particles.emitDebris(ev.x - 0.5, ev.y - 0.5, 1, 1, 18, PALETTE.LAB_HIGHLIGHT);
          this.particles.emitSparkles(ev.x, ev.y, 14, PALETTE.LAB_AMBER);
          this.showToast(`CHAIN BROKEN! (${ev.remaining} LEFT)`, PALETTE.LAB_AMBER);
          break;
        case 'boss_defeated':
        case 'summit_reached':
        case 'time_trial_finish':
          this.particles.emitConfetti(state.p1.x, state.p1.y + 1.2, 40);
          if (!state.jeff.active) {
            this.particles.emitConfetti(state.p2.x, state.p2.y + 1.2, 40);
          }
          this.showToast(
            ev.type === 'boss_defeated' ? 'BACHICHA DEFEATED!' : 'SUMMIT REACHED!',
            PALETTE.LAB_AMBER
          );
          break;
        case 'emote':
          if (ev.emote === 'clap') {
            this.particles.emitConfetti(ev.x, ev.y + 0.7, 6);
          }
          break;
        case 'achievement_unlock':
          this.showToast(`UNLOCKED: ${ev.id}`, PALETTE.PINE_MOSS);
          break;
        default:
          break;
      }
    }
  }

  render(
    state: SimState,
    level: LevelData,
    interpAlpha: number,
    settings: RenderSettings,
    skins: SaveData['skins'],
    dt: number,
    fps?: number
  ): void {
    if (this.disposed) return;

    const safeDt = dt > 0 && dt < 0.1 ? dt : 0.0166;
    this.animClock += safeDt;
    if (this.toastTimer > 0) this.toastTimer = Math.max(0, this.toastTimer - safeDt);
    if (this.placeFlagAnimP1 > 0) this.placeFlagAnimP1 = Math.max(0, this.placeFlagAnimP1 - safeDt);
    if (this.placeFlagAnimP2 > 0) this.placeFlagAnimP2 = Math.max(0, this.placeFlagAnimP2 - safeDt);

    // Subtle HUD altitude scale punch whenever maxAltitude rises!
    if (state.maxAltitude > this.lastMaxAltitude + 0.25) {
      this.lastMaxAltitude = state.maxAltitude;
      this.altPunchTimer = 0.28;
    } else if (state.maxAltitude < this.lastMaxAltitude - 2) {
      // Reset detected (new run / warp)
      this.lastMaxAltitude = state.maxAltitude;
      this.altPunchTimer = 0;
    }
    if (this.altPunchTimer > 0) {
      this.altPunchTimer = Math.max(0, this.altPunchTimer - safeDt);
    }

    const levelCache = this.ensureLevelIndex(level);

    // 1. Interpolated Camera + Screen Shake
    const alpha = settings.classic50HzSnap ? 1 : clamp(interpAlpha, 0, 1);
    let cx = lerp(state.camera.prevX, state.camera.x, alpha);
    let cy = lerp(state.camera.prevY, state.camera.y, alpha);

    if (settings.screenShake && state.camera.shakeTimer > 0 && state.camera.shakeMag > 0) {
      const mag = state.camera.shakeMag * Math.min(1, state.camera.shakeTimer * 4);
      const t = this.animClock * 58;
      cx += (Math.sin(t * 1.7) * 0.65 + Math.cos(t * 3.1) * 0.35) * mag;
      cy += (Math.cos(t * 2.3) * 0.65 + Math.sin(t * 3.7) * 0.35) * mag;
    }
    this.camX = cx;
    this.camY = cy;

    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;

    // 2. Emit continuous atmospheric & wall-cling sweat particles
    this.emitContinuousParticles(state, safeDt);
    this.particles.update(safeDt);

    // 3. Layer 1: Parallax Sky & Biome Backdrop (Alpine <-> Dark Mines <-> Lab)
    this.renderBackdrop(ctx, state);

    // 4. Layer 2: World Scenery (Cabin, Pines, Lanterns, Summit Banner, Circuits, Boss)
    this.renderWorldScenery(ctx, state, level, levelCache);

    // 5. Layer 3: Auto-Tiled Terrain & Slopes
    this.renderTerrain(ctx, level, levelCache);

    // 6. Layer 4: Dynamic Hazards, Platforms, Collectibles, Checkpoint Flag & Signs
    this.renderDynamicEntities(ctx, state, level, alpha);

    // 7. Layer 5: 35-Segment Braided Verlet Rope
    this.renderVerletRope(ctx, state, skins.rope, alpha);

    // 8. Layer 6: Penguins (Krunked & Fred) or Jeff + Animated 5-Node Scarves + Hands Overlay
    const p1x = lerp(state.p1.prevX, state.p1.x, alpha);
    const p1y = lerp(state.p1.prevY, state.p1.y, alpha);
    const p2x = state.jeff.active
      ? lerp(state.jeff.prevX, state.jeff.x, alpha)
      : lerp(state.p2.prevX, state.p2.x, alpha);
    const p2y = state.jeff.active
      ? lerp(state.jeff.prevY, state.jeff.y, alpha)
      : lerp(state.p2.prevY, state.p2.y, alpha);

    if (state.jeff.active) {
      this.renderJeff(ctx, state, skins.jeff, p2x, p2y);
    } else {
      this.renderPenguin(ctx, state.p2, skins.p2, p2x, p2y, this.placeFlagAnimP2 > 0);
    }
    this.renderPenguin(ctx, state.p1, skins.p1, p1x, p1y, this.placeFlagAnimP1 > 0);

    // Charlie rescue bird flies over penguins during active pickup!
    if (state.checkpoint.charlieActive) {
      this.renderCharlieRescue(ctx, state, p1x, p1y);
    }

    // 9. Layer 7: Pooled Particles (Snow, Sweat, Puffs, Wind Gale Lines, Debris, Stars, Confetti)
    this.particles.render(ctx, this.camX, this.camY);

    // 10. Layer 8: 2D Headlamp Lightmap (Dark Mines darkness + warm headlamp cones!)
    if (state.camera.darknessAlpha > 0.01) {
      this.renderHeadlampLightmap(ctx, state, levelCache, p1x, p1y, p2x, p2y);
    }

    // 11. Layer 9: Proximity Sign Tooltips & Offscreen Partner Edge Indicator
    this.renderSignTooltip(ctx, state, level, p1x, p1y, p2x, p2y);
    this.renderOffscreenIndicators(ctx, state, p1x, p1y, p2x, p2y);

    // 12. Layer 10: Crisp Pixel HUD
    this.renderHud(ctx, state, settings, fps);

    // 13. Blit 480x270 framebuffer to nearest-neighbor WebGL2 (or 2D fallback) viewport
    this.blitter.present();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.particles.clear();
    this.packs.dispose();
    this.blitter.dispose();
  }

  // ==========================================================================
  // Coordinate Projection (Exact Y-UP -> 480x270 Nearest-Pixel Formula)
  // ==========================================================================

  private toScreenX(worldX: number): number {
    return Math.round((worldX - this.camX) * PPU + HALF_W);
  }

  private toScreenY(worldY: number): number {
    return Math.round(HALF_H - (worldY - this.camY) * PPU);
  }

  private showToast(text: string, color: string): void {
    this.toastText = text;
    this.toastColor = color;
    this.toastTimer = 2.6;
  }

  // ==========================================================================
  // Spatial Row Index & Grounded Scenery Pre-Computation (ONCE per Level)
  // ==========================================================================

  private ensureLevelIndex(level: LevelData): CachedLevelIndex {
    const key = `${level.id}:${level.tileList.length}`;
    if (this.levelIndex && this.levelIndex.key === key) {
      return this.levelIndex;
    }

    const rows = new Map<number, TileCell[]>();
    for (let i = 0; i < level.tileList.length; i++) {
      const cell = level.tileList[i];
      let bucket = rows.get(cell.ty);
      if (!bucket) {
        bucket = [];
        rows.set(cell.ty, bucket);
      }
      bucket.push(cell);
    }

    // Scan exposed snow tops for cozy ground-hugging Village Cabin & Pine Trees
    const trees: CachedTree[] = [];
    let cabinPos: Vec2 | null = null;
    const isNearSignOrSpawn = (wx: number, wy: number, minDist: number): boolean => {
      if (Math.hypot(wx - level.spawnP1.x, wy - level.spawnP1.y) < minDist) return true;
      for (let i = 0; i < level.signs.length; i++) {
        if (Math.hypot(wx - level.signs[i].x, wy - level.signs[i].y) < minDist) return true;
      }
      return false;
    };

    // Prefer flat 4-tile snow span in Village left of spawn for the Village Cabin
    for (let ty = -2; ty <= 4 && !cabinPos; ty++) {
      const row = rows.get(ty);
      if (!row) continue;
      for (let i = 0; i < row.length; i++) {
        const c = row[i];
        if (c.terrain !== 'SNOW' || c.kind !== 'SOLID' || (c.mask & 1) !== 0) continue;
        if (c.tx > level.spawnP1.x - 4 || c.tx < level.bounds.minX + 2) continue;
        // Check 3 neighbors to the right also have exposed snow tops
        const ok1 = level.tiles.get(`${c.tx + 1},${ty}`);
        const ok2 = level.tiles.get(`${c.tx + 2},${ty}`);
        const ok3 = level.tiles.get(`${c.tx + 3},${ty}`);
        if (
          ok1 && (ok1.mask & 1) === 0 &&
          ok2 && (ok2.mask & 1) === 0 &&
          ok3 && (ok3.mask & 1) === 0
        ) {
          cabinPos = { x: c.tx + 2, y: ty + 1 };
          break;
        }
      }
    }

    // Place pine trees along exposed Snow ledges in Village/Foothills (Y < 88)
    for (let i = 0; i < level.tileList.length; i++) {
      const c = level.tileList[i];
      if (c.terrain !== 'SNOW' || c.kind !== 'SOLID') continue;
      if ((c.mask & 1) !== 0) continue; // Only exposed top surfaces
      if (c.ty >= WORLD.ZONE2_START_Y - 3) continue;
      const h = hashInt(c.tx * 911 + c.ty * 353);
      if ((h % 7) !== 0) continue;
      const wx = c.tx + 0.5;
      const wy = c.ty + 1;
      if (cabinPos && Math.abs(wx - cabinPos.x) < 3.4 && Math.abs(wy - cabinPos.y) < 3) continue;
      if (isNearSignOrSpawn(wx, wy, 1.8)) continue;
      // Check enough headroom (no solid tile directly 1..2 units above)
      if (level.tiles.has(`${c.tx},${c.ty + 1}`) || level.tiles.has(`${c.tx},${c.ty + 2}`)) continue;
      trees.push({ x: wx, y: wy, large: (h & 8) !== 0 });
    }

    // Place atmospheric mine lanterns inside darkZones (near signs & spaced mine shafts)
    const lanterns: Vec2[] = [];
    for (let z = 0; z < level.darkZones.length; z++) {
      const dz = level.darkZones[z];
      for (let ly = Math.ceil(dz.minY) + 4; ly <= dz.maxY - 2; ly += 10) {
        for (let lx = Math.ceil(dz.minX) + 4; lx <= dz.maxX - 4; lx += 12) {
          // Ensure lantern is in open air (not embedded in solid rock)
          if (!level.tiles.has(`${lx},${ly}`)) {
            lanterns.push({ x: lx + 0.5, y: ly + 0.5 });
          }
        }
      }
    }

    this.levelIndex = { key, rows, trees, cabinPos, lanterns };
    return this.levelIndex;
  }

  // ==========================================================================
  // Continuous Ambient & Wall-Cling Sweat Particle Emission
  // ==========================================================================

  private emitContinuousParticles(state: SimState, dt: number): void {
    // 1. Ambient alpine snow (outside deep mines / lab)
    const inMinesOrLab =
      state.currentBiome === 'mines' ||
      state.currentBiome === 'lab' ||
      state.currentBiome === 'boss';
    if (!inMinesOrLab) {
      const snowRate = state.windPhase === 'active' ? 36 : 16;
      this.snowAccum += snowRate * dt;
      while (this.snowAccum >= 1) {
        this.snowAccum -= 1;
        this.particles.emitAmbientSnow(state.windActive, state.windDir);
      }
    }

    // 2. Wind telegraph streaks & active gale lines
    if (state.windPhase === 'telegraph') {
      this.windParticleAccum += 10 * dt;
      while (this.windParticleAccum >= 1) {
        this.windParticleAccum -= 1;
        this.particles.emitWindStreak(state.windDir, true);
      }
    } else if (state.windPhase === 'active') {
      this.windParticleAccum += 32 * dt;
      while (this.windParticleAccum >= 1) {
        this.windParticleAccum -= 1;
        this.particles.emitWindStreak(state.windDir, false);
      }
    }

    // 3. Wall-cling sweat drops: EXACT rate 2 + 6 * grabRedTint drops/sec!
    if (state.p1.action === 'Grab') {
      const rate1 = 2 + 6 * clamp(state.p1.grabRedTint, 0, 1);
      this.sweatAccumP1 += rate1 * dt;
      while (this.sweatAccumP1 >= 1) {
        this.sweatAccumP1 -= 1;
        this.particles.emitSweat(state.p1.x, state.p1.y, state.p1.wallSide, state.p1.grabRedTint);
      }
    } else {
      this.sweatAccumP1 = 0;
    }

    if (!state.jeff.active && state.p2.action === 'Grab') {
      const rate2 = 2 + 6 * clamp(state.p2.grabRedTint, 0, 1);
      this.sweatAccumP2 += rate2 * dt;
      while (this.sweatAccumP2 >= 1) {
        this.sweatAccumP2 -= 1;
        this.particles.emitSweat(state.p2.x, state.p2.y, state.p2.wallSide, state.p2.grabRedTint);
      }
    } else {
      this.sweatAccumP2 = 0;
    }
  }

  // ==========================================================================
  // Layer 1: Parallax Alpine Sky, Mountains, Clouds & Dark Mines Strata
  // ==========================================================================

  private renderBackdrop(ctx: CanvasRenderingContext2D, state: SimState): void {
    const isLab = state.currentBiome === 'lab' || state.currentBiome === 'boss';
    if (isLab) {
      this.renderLabBackdrop(ctx);
      return;
    }

    // Smooth blend into Dark Mines strata across Zone 2 (Y: 91..217)
    const enterMines = clamp((this.camY - (WORLD.ZONE2_START_Y - 6)) / 12, 0, 1);
    const exitMines = clamp((this.camY - (WORLD.ZONE3_START_Y - 6)) / 14, 0, 1);
    const minesBlend = enterMines * (1 - exitMines);

    // 1. Crisp stepped alpine twilight gradient (smooth horizon bands, no harsh mid-sky seam)
    if (minesBlend < 0.99) {
      ctx.fillStyle = PALETTE.SKY_DEEP;
      ctx.fillRect(0, 0, W, 68);
      ctx.fillStyle = '#1b1742';
      ctx.fillRect(0, 68, W, 54);
      ctx.fillStyle = PALETTE.NIGHT_PURPLE;
      ctx.fillRect(0, 122, W, 64);
      ctx.fillStyle = '#33285b';
      ctx.fillRect(0, 186, W, H - 186);

      // Subtle 1px pixel-art dither seams between sky bands
      ctx.fillStyle = '#1b1742';
      for (let x = 0; x < W; x += 4) ctx.fillRect(x, 67, 2, 1);
      ctx.fillStyle = PALETTE.NIGHT_PURPLE;
      for (let x = 2; x < W; x += 4) ctx.fillRect(x, 121, 2, 1);
      ctx.fillStyle = '#33285b';
      for (let x = 0; x < W; x += 4) ctx.fillRect(x, 185, 2, 1);

      // High-altitude aurora shimmer above Crags/Summit
      if (this.camY > WORLD.ZONE3_START_Y - 20) {
        const auroraA = clamp((this.camY - (WORLD.ZONE3_START_Y - 20)) / 40, 0, 0.25);
        ctx.globalAlpha = auroraA;
        ctx.fillStyle = PALETTE.PINE_MOSS;
        for (let i = 0; i < W; i += 8) {
          const wave = Math.round(Math.sin(i * 0.025 + this.animClock * 0.9) * 14);
          ctx.fillRect(i, 36 + wave, 8, 22);
        }
        ctx.globalAlpha = 1;
      }

      // Twinkling stars (parallax 0.04)
      for (let i = 0; i < this.stars.length; i++) {
        const s = this.stars[i];
        const sx = (((Math.round(s.x - this.camX * 0.65) % W) + W) % W);
        const sy = (((Math.round(s.y + this.camY * 0.45) % 165) + 165) % 165);
        const twinkle = Math.sin(this.animClock * 2.4 + s.phase) > 0.35;
        ctx.fillStyle = s.bright && twinkle ? PALETTE.SNOW_BRIGHT : PALETTE.SNOW_LIGHT;
        ctx.fillRect(sx, sy, s.bright && twinkle ? 2 : 1, 1);
      }

      // Crisp pixel crescent moon
      const moonX = Math.round(396 - this.camX * 0.35);
      const moonY = Math.round(34 + this.camY * 0.12);
      if (moonX > -24 && moonX < W + 24 && moonY > -24 && moonY < 180) {
        ctx.fillStyle = PALETTE.SNOW_LIGHT;
        ctx.fillRect(moonX - 7, moonY - 7, 14, 14);
        ctx.fillStyle = PALETTE.SNOW_BRIGHT;
        ctx.fillRect(moonX - 6, moonY - 8, 12, 16);
        ctx.fillRect(moonX - 8, moonY - 6, 16, 12);
        // Crescent cutout
        ctx.fillStyle = PALETTE.SKY_DEEP;
        ctx.fillRect(moonX - 2, moonY - 8, 11, 12);
        ctx.fillRect(moonX, moonY - 6, 11, 10);
      }

      // Drifting pixel clouds
      ctx.fillStyle = PALETTE.CLIFF_DARK;
      for (let i = 0; i < this.clouds.length; i++) {
        const c = this.clouds[i];
        const cx =
          ((((Math.round(c.x + this.animClock * c.speed - this.camX * 2.2) % (W + 100)) +
            (W + 100)) %
            (W + 100)) -
            50);
        const cy = Math.round(c.y + this.camY * 0.65) % 195;
        ctx.fillStyle = PALETTE.BODY_DARK;
        ctx.fillRect(cx + 4, cy + 2, c.w - 8, c.h);
        ctx.fillStyle = PALETTE.CLIFF_DARK;
        ctx.fillRect(cx, cy + 4, c.w, c.h - 4);
        ctx.fillStyle = PALETTE.CLIFF_MID;
        ctx.fillRect(cx + 8, cy, c.w - 16, 4);
      }

      // Distant Mountain Range Layer A (distinct twilight ridge, parallax 0.14)
      this.renderMountainRange(ctx, 0.14, 178, 62, 78, '#231e54', '#5c52a3');
      // Midground Mountain Range Layer B (crisp snow-crested alpine peaks, parallax 0.28)
      this.renderMountainRange(ctx, 0.28, 214, 52, 62, '#1d193d', PALETTE.SNOW_LIGHT);

      // Distant pine silhouette treeline near lower Foothills/Village
      if (this.camY < 62) {
        const baseTreeY = Math.round(258 + this.camY * 2.2);
        if (baseTreeY < H + 40) {
          const offset = Math.round(this.camX * 6.5);
          ctx.fillStyle = PALETTE.OUTLINE;
          for (let px = -((offset % 22) + 22) % 22; px < W + 22; px += 22) {
            const hVar = 18 + (hashInt(Math.floor((px + offset) / 22)) % 14);
            for (let row = 0; row < hVar; row += 2) {
              const half = Math.max(1, Math.floor((row / hVar) * 9));
              ctx.fillRect(px - half, baseTreeY - hVar + row, half * 2 + 1, 2);
            }
          }
        }
      }
    }

    // 2. Dark Mines Subterranean Strata Overlay (Zone 2, Y >= 91)
    if (minesBlend > 0.01) {
      ctx.globalAlpha = minesBlend;
      ctx.fillStyle = PALETTE.MINE_VOID;
      ctx.fillRect(0, 0, W, H);

      // Layered parallax stone strata bands
      const scrollY = Math.round(this.camY * 6);
      const scrollX = Math.round(this.camX * 5);
      for (let band = -2; band < 12; band++) {
        const by = (((band * 28 + scrollY) % (H + 56)) + (H + 56)) % (H + 56) - 28;
        ctx.fillStyle = band % 2 === 0 ? PALETTE.MINE_DEEP : PALETTE.MINE_SHADOW;
        ctx.fillRect(0, by, W, 14);
        ctx.fillStyle = PALETTE.MINE_ROCK;
        ctx.fillRect(0, by + 14, W, 2);
      }

      // Recessed timber mine support pillars & crossbeams (parallax 0.45)
      const pillarSpacing = 96;
      const startX = -((((scrollX % pillarSpacing) + pillarSpacing) % pillarSpacing));
      for (let px = startX; px < W + pillarSpacing; px += pillarSpacing) {
        ctx.fillStyle = PALETTE.MINE_PLUM;
        ctx.fillRect(px, 0, 12, H);
        ctx.fillStyle = PALETTE.MINE_DIRT;
        ctx.fillRect(px + 2, 0, 8, H);
        ctx.fillStyle = PALETTE.MINE_WOOD;
        ctx.fillRect(px + 3, 0, 2, H);
        // Horizontal crossbeams every 84 px
        const beamOff = (((scrollY % 84) + 84) % 84) - 84;
        for (let by = beamOff; by < H + 84; by += 84) {
          ctx.fillStyle = PALETTE.MINE_DIRT;
          ctx.fillRect(px, by, pillarSpacing, 8);
          ctx.fillStyle = PALETTE.MINE_WOOD;
          ctx.fillRect(px, by + 1, pillarSpacing, 2);
          ctx.fillStyle = PALETTE.OUTLINE;
          ctx.fillRect(px, by + 7, pillarSpacing, 1);
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  private renderMountainRange(
    ctx: CanvasRenderingContext2D,
    parallax: number,
    baseY: number,
    peakHeight: number,
    stepW: number,
    bodyColor: string,
    snowCapColor: string
  ): void {
    const scrollX = Math.round(this.camX * PPU * parallax);
    const yShift = Math.round(this.camY * PPU * parallax * 0.25);
    const horizonY = baseY + yShift;
    if (horizonY - peakHeight > H) return;

    const firstPeak = Math.floor(scrollX / stepW) - 1;
    const count = Math.ceil(W / stepW) + 3;

    for (let i = 0; i < count; i++) {
      const idx = firstPeak + i;
      const h = hashInt(idx * 2654435761);
      const peakH = Math.round(peakHeight * (0.55 + ((h % 100) / 100) * 0.6));
      const cx = idx * stepW - scrollX + Math.floor(stepW * 0.5);
      const halfBase = Math.round(stepW * 0.72);
      const peakTopY = horizonY - peakH;

      // Pixel-stepped mountain triangle
      for (let row = 0; row < peakH; row += 2) {
        const span = Math.round((row / peakH) * halfBase);
        const y = peakTopY + row;
        if (y > H) break;
        ctx.fillStyle = bodyColor;
        ctx.fillRect(cx - span, y, span * 2, 2);
        // Snow-dusted lit ridge on upper 28%
        if (row < peakH * 0.28) {
          ctx.fillStyle = snowCapColor;
          ctx.fillRect(cx - span, y, Math.max(2, Math.round(span * 1.15)), 2);
        }
      }
      if (horizonY < H) {
        ctx.fillStyle = bodyColor;
        ctx.fillRect(cx - halfBase, horizonY, halfBase * 2, H - horizonY);
      }
    }
  }

  private renderLabBackdrop(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = PALETTE.LAB_DEEP;
    ctx.fillRect(0, 0, W, H);

    const sx = Math.round(this.camX * 6);
    const sy = Math.round(this.camY * 6);
    const cell = 32;
    const ox = -(((sx % cell) + cell) % cell);
    const oy = (((sy % cell) + cell) % cell) - cell;

    ctx.fillStyle = PALETTE.LAB_WALL;
    for (let y = oy; y < H + cell; y += cell) {
      for (let x = ox; x < W + cell; x += cell) {
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      }
    }

    // Glowing vertical lab conduit rails
    const railStep = 120;
    const rxStart = -(((sx % railStep) + railStep) % railStep);
    for (let rx = rxStart; rx < W + railStep; rx += railStep) {
      ctx.fillStyle = PALETTE.LAB_STEEL;
      ctx.fillRect(rx, 0, 6, H);
      ctx.fillStyle = PALETTE.LAB_CYAN;
      ctx.globalAlpha = 0.35 + 0.15 * Math.sin(this.animClock * 3 + rx);
      ctx.fillRect(rx + 2, 0, 2, H);
      ctx.globalAlpha = 1;
    }
  }

  // ==========================================================================
  // Layer 2: World Scenery (Village Cabin, Pines, Lanterns, Summit, Circuits, Boss)
  // ==========================================================================

  private renderWorldScenery(
    ctx: CanvasRenderingContext2D,
    state: SimState,
    level: LevelData,
    cache: CachedLevelIndex
  ): void {
    const atlas = this.packs.getAtlas();

    // 1. Grounded Village Cabin + rising pixel chimney smoke
    if (cache.cabinPos) {
      const cx = this.toScreenX(cache.cabinPos.x);
      const cy = this.toScreenY(cache.cabinPos.y);
      if (cx > -80 && cx < W + 80 && cy > -60 && cy < H + 80) {
        this.drawSprite(ctx, atlas.villageCabin, cx - 32, cy - 46, 'village_cabin');
        // Gentle animated pixel chimney smoke puffs
        for (let s = 0; s < 3; s++) {
          const t = (this.animClock * 0.55 + s * 0.33) % 1;
          const smX = Math.round(cx + 17 + Math.sin(t * 5 + s) * 3 + t * 5);
          const smY = Math.round(cy - 46 - t * 18);
          ctx.globalAlpha = (1 - t) * 0.55;
          ctx.fillStyle = PALETTE.SNOW_LIGHT;
          ctx.fillRect(smX, smY, t > 0.5 ? 4 : 3, t > 0.5 ? 3 : 2);
          ctx.globalAlpha = 1;
        }
      }
    }

    // 2. Grounded Snow-Laden Pine Trees
    for (let i = 0; i < cache.trees.length; i++) {
      const tr = cache.trees[i];
      const tx = this.toScreenX(tr.x);
      const ty = this.toScreenY(tr.y);
      if (tx < -32 || tx > W + 32 || ty < -48 || ty > H + 48) continue;
      const rect = tr.large ? atlas.pineLarge : atlas.pineSmall;
      this.drawSprite(
        ctx,
        rect,
        tx - (rect.w >> 1),
        ty - rect.h + 1,
        tr.large ? 'pine_large' : 'pine_small'
      );
    }

    // 3. Hanging Mine Lanterns inside darkZones
    const lanternFrame = Math.floor(this.animClock * 5) & 1;
    const lanternRect = atlas.lanternFrames[lanternFrame];
    for (let i = 0; i < cache.lanterns.length; i++) {
      const l = cache.lanterns[i];
      const lx = this.toScreenX(l.x);
      const ly = this.toScreenY(l.y);
      if (lx < -24 || lx > W + 24 || ly < -24 || ly > H + 24) continue;
      this.drawSprite(ctx, lanternRect, lx - 6, ly - 8, 'mine_lantern');
    }

    // 4. Summit Banner Archway
    const sz = level.summitZone;
    const sumX = this.toScreenX(sz.x + sz.w * 0.5);
    const sumY = this.toScreenY(sz.y);
    if (sumX > -64 && sumX < W + 64 && sumY > -64 && sumY < H + 64) {
      const f = Math.floor(this.animClock * 3.5) & 1;
      this.drawSprite(
        ctx,
        atlas.summitBannerFrames[f],
        sumX - 24,
        sumY - 43,
        `summit_banner_${f}`
      );
    }

    // 5. Lab Circuit Wires
    for (let i = 0; i < state.circuits.length; i++) {
      const circuit = state.circuits[i];
      if (circuit.nodes.length < 2) continue;
      for (let n = 0; n < circuit.nodes.length - 1; n++) {
        const a = circuit.nodes[n];
        const b = circuit.nodes[n + 1];
        this.drawPixelLine(
          ctx,
          this.toScreenX(a.x),
          this.toScreenY(a.y),
          this.toScreenX(b.x),
          this.toScreenY(b.y),
          circuit.powered ? PALETTE.LAB_CYAN : PALETTE.LAB_STEEL,
          2
        );
      }
    }

    // 6. Boss Arena (Bachicha) if active
    if (state.boss.active && level.bossArena) {
      this.renderBossBackdrop(ctx, state, level);
    }
  }

  private renderBossBackdrop(
    ctx: CanvasRenderingContext2D,
    state: SimState,
    level: LevelData
  ): void {
    const arena = level.bossArena;
    if (!arena) return;
    const bossX = (arena.minX + arena.maxX) * 0.5;
    const bossY = (arena.minY + arena.maxY) * 0.55;
    const sx = this.toScreenX(bossX);
    const sy = this.toScreenY(bossY);

    // Draw unbroken glowing chains connecting boss core to anchor points
    for (let i = 0; i < state.boss.chains.length; i++) {
      const ch = state.boss.chains[i];
      if (ch.broken) continue;
      const cx = this.toScreenX(ch.x);
      const cy = this.toScreenY(ch.y);
      this.drawPixelLine(ctx, sx, sy, cx, cy, PALETTE.OUTLINE, 4);
      this.drawPixelLine(ctx, sx, sy, cx, cy, PALETTE.LAB_HIGHLIGHT, 2);
      ctx.fillStyle = PALETTE.LAB_AMBER;
      ctx.fillRect(cx - 3, cy - 3, 6, 6);
    }

    // Boss core silhouette
    const bob = Math.round(Math.sin(this.animClock * 3) * 3);
    drawPixelBox(
      ctx,
      sx - 24,
      sy - 20 + bob,
      48,
      40,
      state.boss.defeated ? PALETTE.LAB_STEEL : PALETTE.LAB_WALL,
      PALETTE.OUTLINE,
      PALETTE.LAB_HIGHLIGHT
    );
    // Glowing cyclops visor
    ctx.fillStyle = state.boss.defeated ? PALETTE.PINE_MOSS : PALETTE.KRUNKED_SCARF;
    ctx.fillRect(sx - 12, sy - 6 + bob, 24, 8);
    ctx.fillStyle = PALETTE.SNOW_BRIGHT;
    ctx.fillRect(sx - 4, sy - 4 + bob, 8, 4);

    // Sweeping laser beam when active & undefeated
    if (!state.boss.defeated && state.boss.attackTimer > 0) {
      const rad = state.boss.laserSweepAngle;
      const lx = sx + Math.round(Math.cos(rad) * 240);
      const ly = sy - Math.round(Math.sin(rad) * 240);
      this.drawPixelLine(ctx, sx, sy + bob, lx, ly, PALETTE.KRUNKED_SCARF, 4);
      this.drawPixelLine(ctx, sx, sy + bob, lx, ly, PALETTE.SNOW_BRIGHT, 2);
    }
  }

  // ==========================================================================
  // Layer 3: Auto-Tiled Terrain & Pixel-Stepped Slopes
  // ==========================================================================

  private renderTerrain(
    ctx: CanvasRenderingContext2D,
    level: LevelData,
    cache: CachedLevelIndex
  ): void {
    const atlas = this.packs.getAtlas();
    const minTx = Math.floor(this.camX - 16.5);
    const maxTx = Math.ceil(this.camX + 16.5);
    const minTy = Math.floor(this.camY - 10);
    const maxTy = Math.ceil(this.camY + 10);

    for (let ty = minTy; ty <= maxTy; ty++) {
      const row = cache.rows.get(ty);
      if (!row) continue;
      const sy = this.toScreenY(ty + 1); // Top-left pixel Y of [ty, ty+1]
      for (let i = 0; i < row.length; i++) {
        const cell = row[i];
        if (cell.tx < minTx || cell.tx > maxTx) continue;
        const sx = this.toScreenX(cell.tx);
        const rect = atlas.getTileSprite(cell.kind, cell.terrain, cell.mask);
        const customKey = `tile_${cell.terrain.toLowerCase()}_${cell.mask & 15}`;
        this.drawSprite(ctx, rect, sx, sy, customKey);
      }
    }

    // Slopes (bottom-left (x, y), width w, height h)
    for (let i = 0; i < level.slopes.length; i++) {
      const sl = level.slopes[i];
      const x0 = this.toScreenX(sl.x);
      const yBottom = this.toScreenY(sl.y);
      const pw = Math.max(1, Math.round(sl.w * PPU));
      const ph = Math.max(1, Math.round(sl.h * PPU));
      const yTop = yBottom - ph;
      if (x0 + pw < -8 || x0 > W + 8 || yBottom < -8 || yTop > H + 8) continue;

      const isIce = sl.terrain === 'ICE';
      const isMine = sl.terrain === 'DIRT' || sl.terrain === 'MUD';
      const fill = isIce ? PALETTE.ICE_MID : isMine ? PALETTE.MINE_BRICK : PALETTE.CLIFF_DARK;
      const cap = isIce ? PALETTE.SNOW_BRIGHT : isMine ? PALETTE.MINE_WOOD : PALETTE.SNOW_BRIGHT;
      const capSub = isIce ? PALETTE.ICE_LIGHT : isMine ? PALETTE.MINE_DIRT : PALETTE.SNOW_LIGHT;

      for (let dx = 0; dx < pw; dx++) {
        const t = sl.dir === 'right' ? (dx + 1) / pw : (pw - dx) / pw;
        const colH = Math.max(1, Math.round(t * ph));
        const topY = yBottom - colH;
        ctx.fillStyle = fill;
        ctx.fillRect(x0 + dx, topY, 1, colH);
        ctx.fillStyle = capSub;
        ctx.fillRect(x0 + dx, topY, 1, Math.min(colH, 4));
        ctx.fillStyle = cap;
        ctx.fillRect(x0 + dx, topY, 1, Math.min(colH, 2));
        ctx.fillStyle = PALETTE.OUTLINE;
        ctx.fillRect(x0 + dx, topY - 1, 1, 1);
      }
      // Base outline
      ctx.fillStyle = PALETTE.OUTLINE;
      ctx.fillRect(x0, yBottom - 1, pw, 1);
    }
  }

  // ==========================================================================
  // Layer 4: Dynamic Platforms, Hazards, Collectibles, Flag & Signposts
  // ==========================================================================

  private renderDynamicEntities(
    ctx: CanvasRenderingContext2D,
    state: SimState,
    level: LevelData,
    alpha: number
  ): void {
    const atlas = this.packs.getAtlas();

    // 1. In-world wooden signposts
    for (let i = 0; i < level.signs.length; i++) {
      const sign = level.signs[i];
      const sx = this.toScreenX(sign.x);
      const sy = this.toScreenY(sign.y);
      if (sx < -24 || sx > W + 24 || sy < -24 || sy > H + 24) continue;
      this.drawSprite(ctx, atlas.signSprite, sx - 8, sy - 17, 'signpost');
    }

    // 2. Crumbling FallingBlocks (3 crack stages + jitter during shake)
    for (let i = 0; i < state.fallingBlocks.length; i++) {
      const b = state.fallingBlocks[i];
      const bx = this.toScreenX(b.x);
      const byTop = this.toScreenY(b.y + b.h);
      const bw = Math.max(PPU, Math.round(b.w * PPU));
      const bh = Math.max(PPU, Math.round(b.h * PPU));
      if (bx + bw < -16 || bx > W + 16 || byTop + bh < -16 || byTop > H + 16) continue;

      if (b.state === 'crumbled') {
        // Subtle dotted respawn preview as block recovers
        if (b.timer > PHYSICS.FALLING_BLOCK_RECOVER_TIME * 0.55) {
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = PALETTE.SNOW_LIGHT;
          for (let px = 0; px < bw; px += 4) {
            ctx.fillRect(bx + px, byTop, 2, 1);
            ctx.fillRect(bx + px, byTop + bh - 1, 2, 1);
          }
          ctx.globalAlpha = 1;
        }
        continue;
      }

      const stage =
        b.state === 'intact'
          ? 0
          : b.timer > PHYSICS.FALLING_BLOCK_HOLD_TIME * 0.5
            ? 2
            : 1;
      const jitterX = b.state === 'shaking' ? (((state.tick * 5 + i * 7) % 3) - 1) : 0;
      const rect = atlas.fallingBlocks[stage];
      const cols = Math.max(1, Math.round(b.w));
      const rows = Math.max(1, Math.round(b.h));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          this.drawSprite(
            ctx,
            rect,
            bx + c * PPU + jitterX,
            byTop + r * PPU,
            `falling_block_${stage}`
          );
        }
      }
    }

    // 3. MovablePlatforms / Minecarts (with track rail + rotating iron wheels!)
    for (let i = 0; i < state.movablePlatforms.length; i++) {
      const m = state.movablePlatforms[i];
      // Track rail line between start and end
      const rStartX = this.toScreenX(m.startX + m.w * 0.5);
      const rStartY = this.toScreenY(m.startY + 0.15);
      const rEndX = this.toScreenX(m.endX + m.w * 0.5);
      const rEndY = this.toScreenY(m.endY + 0.15);
      this.drawPixelLine(ctx, rStartX, rStartY, rEndX, rEndY, PALETTE.OUTLINE, 3);
      this.drawPixelLine(ctx, rStartX, rStartY, rEndX, rEndY, PALETTE.LAB_STEEL, 1);
      // Rail stop bumpers
      ctx.fillStyle = PALETTE.LAB_HIGHLIGHT;
      ctx.fillRect(rStartX - 2, rStartY - 2, 4, 4);
      ctx.fillRect(rEndX - 2, rEndY - 2, 4, 4);

      const mx = lerp(m.prevX, m.x, alpha);
      const my = lerp(m.prevY, m.y, alpha);
      const sx = this.toScreenX(mx);
      const syTop = this.toScreenY(my + m.h);
      const pw = Math.max(PPU, Math.round(m.w * PPU));
      const ph = Math.max(8, Math.round(m.h * PPU));
      if (sx + pw < -24 || sx > W + 24 || syTop + ph < -24 || syTop > H + 24) continue;

      const cols = Math.max(1, Math.round(m.w));
      for (let c = 0; c < cols; c++) {
        const part =
          cols === 1
            ? atlas.minecartMid
            : c === 0
              ? atlas.minecartLeft
              : c === cols - 1
                ? atlas.minecartRight
                : atlas.minecartMid;
        this.drawSprite(ctx, part, sx + c * PPU, syTop, 'minecart');
      }
      // Rotating wheels underneath minecart
      const wheelPhase = Math.floor(Math.abs(mx + my) * 4) & 1;
      const wRect = atlas.minecartWheels[wheelPhase];
      this.drawSprite(ctx, wRect, sx + 3, syTop + ph - 5, 'minecart_wheel');
      if (pw >= 24) {
        this.drawSprite(ctx, wRect, sx + pw - 11, syTop + ph - 5, 'minecart_wheel');
      }
    }

    // 4. SwingPlatforms (pivot bracket + twin pixel chains + hanging cradle!)
    for (let i = 0; i < state.swingPlatforms.length; i++) {
      const sp = state.swingPlatforms[i];
      const px = lerp(sp.prevX, sp.x, alpha);
      const py = lerp(sp.prevY, sp.y, alpha);
      const pivX = this.toScreenX(sp.pivotX);
      const pivY = this.toScreenY(sp.pivotY);
      const sx = this.toScreenX(px);
      const syTop = this.toScreenY(py + sp.h);
      const pw = Math.max(24, Math.round(sp.w * PPU));

      // Twin suspension chains from pivot to top corners of cradle
      this.drawPixelLine(ctx, pivX, pivY, sx + 3, syTop + 2, PALETTE.OUTLINE, 3);
      this.drawPixelLine(ctx, pivX, pivY, sx + 3, syTop + 2, PALETTE.ROPE_BASE, 1);
      this.drawPixelLine(ctx, pivX, pivY, sx + pw - 3, syTop + 2, PALETTE.OUTLINE, 3);
      this.drawPixelLine(ctx, pivX, pivY, sx + pw - 3, syTop + 2, PALETTE.ROPE_BASE, 1);

      // Pivot bolt
      ctx.fillStyle = PALETTE.OUTLINE;
      ctx.fillRect(pivX - 3, pivY - 3, 6, 6);
      ctx.fillStyle = PALETTE.LAB_AMBER;
      ctx.fillRect(pivX - 2, pivY - 2, 4, 4);

      // Cradle platform
      ctx.drawImage(
        atlas.swingCradle.sheet,
        atlas.swingCradle.x,
        atlas.swingCradle.y,
        atlas.swingCradle.w,
        atlas.swingCradle.h,
        sx,
        syTop - 2,
        pw,
        14
      );
    }

    // 5. Lab Tronchos (pistons)
    for (let i = 0; i < state.tronchos.length; i++) {
      const tr = state.tronchos[i];
      const tx = lerp(tr.prevX, tr.x, alpha);
      const ty = lerp(tr.prevY, tr.y, alpha);
      const bx = this.toScreenX(tr.baseX + tr.w * 0.5);
      const by = this.toScreenY(tr.baseY + tr.h * 0.5);
      const cx = this.toScreenX(tx + tr.w * 0.5);
      const cy = this.toScreenY(ty + tr.h * 0.5);
      this.drawPixelLine(ctx, bx, by, cx, cy, PALETTE.OUTLINE, 6);
      this.drawPixelLine(ctx, bx, by, cx, cy, PALETTE.LAB_STEEL, 4);

      const sx = this.toScreenX(tx);
      const syTop = this.toScreenY(ty + tr.h);
      const cols = Math.max(1, Math.round(tr.w));
      const rows = Math.max(1, Math.round(tr.h));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          this.drawSprite(ctx, atlas.tronchoTile, sx + c * PPU, syTop + r * PPU, 'troncho');
        }
      }
    }

    // 6. Owner-Exclusive ColorPlatforms
    for (let i = 0; i < state.colorPlatforms.length; i++) {
      const cp = state.colorPlatforms[i];
      const sx = this.toScreenX(cp.x);
      const syTop = this.toScreenY(cp.y + cp.h);
      const pw = Math.max(PPU, Math.round(cp.w * PPU));
      const ph = Math.max(8, Math.round(cp.h * PPU));
      const col = cp.owner === 'krunked' ? PALETTE.LAB_KRUNKED : PALETTE.LAB_FRED;
      if (cp.active) {
        drawPixelBox(ctx, sx, syTop, pw, ph, col, PALETTE.OUTLINE, PALETTE.SNOW_BRIGHT);
      } else {
        ctx.globalAlpha = 0.35;
        drawPixelBox(ctx, sx, syTop, pw, ph, PALETTE.LAB_DEEP, col);
        ctx.globalAlpha = 1;
      }
    }

    // 7. Circuit Buttons
    for (let i = 0; i < state.buttons.length; i++) {
      const btn = state.buttons[i];
      const sx = this.toScreenX(btn.x);
      const syBot = this.toScreenY(btn.y);
      const pw = Math.max(12, Math.round(btn.w * PPU));
      const capH = btn.pressed ? 2 : 5;
      ctx.fillStyle = PALETTE.OUTLINE;
      ctx.fillRect(sx - 1, syBot - 4, pw + 2, 4);
      ctx.fillStyle = PALETTE.LAB_STEEL;
      ctx.fillRect(sx, syBot - 3, pw, 3);
      ctx.fillStyle = btn.pressed ? PALETTE.LAB_CYAN : PALETTE.KRUNKED_SCARF;
      ctx.fillRect(sx + 2, syBot - 3 - capH, pw - 4, capH);
    }

    // 8. Lasers
    for (let i = 0; i < state.lasers.length; i++) {
      const l = state.lasers[i];
      const x1 = this.toScreenX(l.x1);
      const y1 = this.toScreenY(l.y1);
      const x2 = this.toScreenX(l.x2);
      const y2 = this.toScreenY(l.y2);
      if (l.active) {
        const pulse = Math.sin(this.animClock * 24 + i) > 0 ? 4 : 3;
        this.drawPixelLine(ctx, x1, y1, x2, y2, PALETTE.KRUNKED_SCARF, pulse);
        this.drawPixelLine(ctx, x1, y1, x2, y2, PALETTE.SNOW_BRIGHT, 1);
      }
      // Emitters
      ctx.fillStyle = PALETTE.OUTLINE;
      ctx.fillRect(x1 - 3, y1 - 3, 6, 6);
      ctx.fillRect(x2 - 3, y2 - 3, 6, 6);
      ctx.fillStyle = l.active ? PALETTE.LAB_AMBER : PALETTE.LAB_STEEL;
      ctx.fillRect(x1 - 2, y1 - 2, 4, 4);
      ctx.fillRect(x2 - 2, y2 - 2, 4, 4);
    }

    // 9. Collectibles (Polaroids, Manual Scrolls, Arctic Seals, NPCs)
    for (let i = 0; i < state.collectibles.length; i++) {
      const c = state.collectibles[i];
      if (c.collected) continue;
      const sx = this.toScreenX(c.x);
      const bob = Math.round(Math.sin(this.animClock * 3.4 + c.x * 1.3) * 2);
      const sy = this.toScreenY(c.y) + bob;
      if (sx < -24 || sx > W + 24 || sy < -24 || sy > H + 24) continue;

      // Subtle glowing halo pixel behind collectibles
      if (c.kind === 'photo' || c.kind === 'manual') {
        const glint = Math.floor(this.animClock * 4 + i) & 1;
        ctx.fillStyle = c.kind === 'photo' ? PALETTE.LAB_AMBER : PALETTE.LAB_CYAN;
        ctx.fillRect(sx - 9 - glint, sy - 1, 2, 2);
        ctx.fillRect(sx + 8 + glint, sy - 1, 2, 2);
      }

      if (c.kind === 'photo') {
        this.drawSprite(ctx, atlas.polaroidSprite, sx - 8, sy - 8, 'collectible_photo');
      } else if (c.kind === 'manual') {
        this.drawSprite(ctx, atlas.manualSprite, sx - 8, sy - 8, 'collectible_manual');
      } else {
        const f = Math.floor(this.animClock * 2.5 + i) & 1;
        this.drawSprite(ctx, atlas.sealFrames[f], sx - 10, sy - 10, `seal_${f}`);
      }
    }

    // 10. Placed Assist Checkpoint Flag
    if (state.checkpoint.placed) {
      const fx = this.toScreenX(state.checkpoint.x);
      const fy = this.toScreenY(state.checkpoint.y);
      const fIdx = Math.floor(this.animClock * 6) % atlas.flagFrames.length;
      this.drawSprite(ctx, atlas.flagFrames[fIdx], fx - 5, fy - 22, `assist_flag_${fIdx}`);
    }
  }

  // ==========================================================================
  // Layer 5: 35-Segment Braided Verlet Rope
  // ==========================================================================

  private renderVerletRope(
    ctx: CanvasRenderingContext2D,
    state: SimState,
    ropeSkin: RopeSkinId,
    alpha: number
  ): void {
    const nodes = state.rope.nodes;
    if (nodes.length < 2) return;

    const skinPair = ROPE_SKIN_COLORS[ropeSkin] ?? ROPE_SKIN_COLORS.Default;
    const isTaut = state.rope.taut || state.rope.tension > 0.72;
    const colA = isTaut ? PALETTE.LAB_AMBER : skinPair[0];
    const colB = isTaut ? PALETTE.SNOW_BRIGHT : skinPair[1];

    // Pass 1: Crisp dark #222034 outer rope casing
    ctx.fillStyle = PALETTE.OUTLINE;
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i];
      const b = nodes[i + 1];
      const ax = this.toScreenX(lerp(a.prevX, a.x, alpha));
      const ay = this.toScreenY(lerp(a.prevY, a.y, alpha));
      const bx = this.toScreenX(lerp(b.prevX, b.x, alpha));
      const by = this.toScreenY(lerp(b.prevY, b.y, alpha));
      this.drawPixelLine(ctx, ax, ay, bx, by, PALETTE.OUTLINE, 3);
    }

    // Pass 2: Alternating braided links along all 35 Verlet segments!
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i];
      const b = nodes[i + 1];
      const ax = this.toScreenX(lerp(a.prevX, a.x, alpha));
      const ay = this.toScreenY(lerp(a.prevY, a.y, alpha));
      const bx = this.toScreenX(lerp(b.prevX, b.x, alpha));
      const by = this.toScreenY(lerp(b.prevY, b.y, alpha));
      const braidColor = (i & 1) === 0 ? colA : colB;
      this.drawPixelLine(ctx, ax, ay, bx, by, braidColor, 1);
    }
  }

  // ==========================================================================
  // Layer 6: Penguins (Krunked & Fred), Animated Scarves, Hands Overlay & Jeff
  // ==========================================================================

  private selectPenguinAnim(
    p: PenguinState,
    placingFlag: boolean
  ): { anim: PenguinAnimName; frame: number } {
    let anim: PenguinAnimName = 'Idle';
    let fps = 6;

    if (placingFlag) {
      anim = 'PlaceFlag';
      fps = 11;
    } else if (p.callCharlieTimer > 0.05) {
      anim = 'CallCharlie';
      fps = 9;
    } else if (p.emote === 'clap' && p.emoteTimer > 0) {
      anim = 'Clap';
      fps = 12;
    } else if (p.emote !== 'none' && p.emoteTimer > 0) {
      anim = 'RPS';
      const rpsFrame =
        p.emoteTimer > 0.7
          ? Math.floor(p.animTime * 8) & 1
          : p.emote === 'rps_rock'
            ? 2
            : p.emote === 'rps_paper'
              ? 3
              : 4;
      return { anim, frame: rpsFrame };
    } else {
      switch (p.action) {
        case 'Walk':
          anim = (p.flags & PenguinFlag.OnWind) !== 0 ? 'WalkWind' : 'Walk';
          fps = 12;
          break;
        case 'Jump':
          anim = 'Jump';
          fps = 1;
          break;
        case 'Fall':
          anim = 'Fall';
          fps = 10;
          break;
        case 'FallHard':
          anim = 'FallHard';
          fps = 14;
          break;
        case 'LandHard':
          anim = 'LandHard';
          fps = 7;
          break;
        case 'Grab':
        case 'Grabbed':
          anim = 'Grab';
          fps = 8 + Math.round(p.grabRedTint * 6);
          break;
        case 'Swing':
          anim = 'Swing';
          fps = 6;
          break;
        case 'Anchor':
          anim = 'Anchor';
          fps = 6;
          break;
        case 'Drag':
          anim = 'Drag';
          fps = 12;
          break;
        case 'PullRope':
          anim = 'PullRope';
          fps = 10;
          break;
        case 'Idle':
        case 'None':
        default:
          anim = 'Idle';
          fps = 3;
          break;
      }
    }

    const count = PENGUIN_ANIM_COUNTS[anim];
    const frame = count <= 1 ? 0 : Math.floor(Math.max(0, p.animTime) * fps) % count;
    return { anim, frame };
  }

  private renderPenguin(
    ctx: CanvasRenderingContext2D,
    p: PenguinState,
    skin: SaveData['skins']['p1'],
    wx: number,
    wy: number,
    placingFlag: boolean
  ): void {
    const atlas = this.packs.getAtlas();
    const spriteSet = atlas.getPenguinSet(p.id, skin);
    const sx = this.toScreenX(wx);
    const sy = this.toScreenY(wy);

    // 1. Animated 5-node Flapping Scarf (drawn behind penguin body!)
    this.renderScarf(ctx, p, spriteSet.palette.scarfMain, spriteSet.palette.scarfDark, sx, sy);

    // 2. Choose exact animation frame
    const { anim, frame } = this.selectPenguinAnim(p, placingFlag);
    const bodyRect = spriteSet.frames[anim][frame];
    const handRect = spriteSet.handFrames[anim][frame];
    const facing = p.action === 'Grab' && p.wallSide !== 0 ? p.wallSide : p.facing;
    const flipX = facing < 0;

    // Pendulum swing rotation around sprite center (negated for Y-down canvas)
    const swingRad =
      p.action === 'Swing' && Math.abs(p.swingAngleDeg) > 0.5
        ? (-p.swingAngleDeg * Math.PI) / 180
        : 0;

    const customPrefix = p.id === 'p1' ? 'krunked' : 'fred';
    const customBody = this.packs.getCustomSprite(`${customPrefix}_${anim.toLowerCase()}_${frame}`);
    const customHand = this.packs.getCustomSprite(
      `${customPrefix}_hands_${anim.toLowerCase()}_${frame}`
    );

    const drawLayered = (isHands: boolean): void => {
      const rect = isHands ? handRect : bodyRect;
      const customImg = isHands ? customHand : customBody;
      const needsRedTint = !isHands && p.action === 'Grab' && p.grabRedTint > 0.02;

      ctx.save();
      ctx.translate(sx, sy);
      if (swingRad !== 0) {
        ctx.rotate(swingRad);
      }
      if (flipX) {
        ctx.scale(-1, 1);
      }

      if (needsRedTint) {
        // Pre-allocated 32x32 tintCanvas (ZERO per-frame allocation!)
        const tCtx = this.tintCtx;
        tCtx.globalCompositeOperation = 'source-over';
        tCtx.clearRect(0, 0, 32, 32);
        if (customImg) {
          tCtx.drawImage(customImg, 0, 0, 32, 32);
        } else {
          tCtx.drawImage(rect.sheet, rect.x, rect.y, rect.w, rect.h, 0, 0, 32, 32);
        }
        tCtx.globalCompositeOperation = 'source-atop';
        const urgentPulse =
          p.grabRedTint > 0.65 ? 0.14 * Math.sin(this.animClock * 18) : 0;
        const alphaTint = clamp(p.grabRedTint * 0.68 + urgentPulse, 0, 0.82);
        tCtx.fillStyle = `rgba(209, 22, 81, ${alphaTint.toFixed(3)})`;
        tCtx.fillRect(0, 0, 32, 32);
        tCtx.globalCompositeOperation = 'source-over';
        ctx.drawImage(this.tintCanvas, -16, -16);
      } else if (customImg) {
        ctx.drawImage(customImg, -16, -16, 32, 32);
      } else {
        ctx.drawImage(rect.sheet, rect.x, rect.y, rect.w, rect.h, -16, -16, 32, 32);
      }
      ctx.restore();
    };

    // Body layer then separate Hands overlay layer!
    drawLayered(false);
    drawLayered(true);

    // 3. Wall-cling mini stamina bar right beside clinging penguin
    if (p.action === 'Grab' && p.grabMaxStamina > 0) {
      const ratio = clamp(p.grabStamina / p.grabMaxStamina, 0, 1);
      const barSide = p.wallSide !== 0 ? -p.wallSide : -facing;
      const bx = sx + barSide * 13 - 2;
      const by = sy - 10;
      const totalH = 16;
      const fillH = Math.round(totalH * ratio);
      ctx.fillStyle = PALETTE.OUTLINE;
      ctx.fillRect(bx - 1, by - 1, 5, totalH + 2);
      ctx.fillStyle = PALETTE.BODY_DARK;
      ctx.fillRect(bx, by, 3, totalH);
      const barCol =
        ratio > 0.5
          ? PALETTE.PINE_MOSS
          : ratio > 0.25
            ? PALETTE.LAB_AMBER
            : PALETTE.KRUNKED_SCARF;
      ctx.fillStyle = barCol;
      ctx.fillRect(bx, by + (totalH - fillH), 3, fillH);
    }

    // 4. Call Charlie Hold Progress Bar
    if (p.callCharlieTimer > 0.05) {
      const pct = clamp(p.callCharlieTimer / PHYSICS.CALL_CHARLIE_HOLD_TIME, 0, 1);
      const bw = 24;
      const bx = sx - 12;
      const by = sy - 22;
      ctx.fillStyle = PALETTE.OUTLINE;
      ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
      ctx.fillStyle = PALETTE.BODY_DARK;
      ctx.fillRect(bx, by, bw, 3);
      ctx.fillStyle = PALETTE.LAB_AMBER;
      ctx.fillRect(bx, by, Math.round(bw * pct), 3);
    }

    // 5. RPS Emote Callout Bubble
    if (p.emote !== 'none' && p.emote !== 'clap' && p.emoteTimer > 0 && p.emoteTimer <= 0.75) {
      const tag =
        p.emote === 'rps_rock' ? 'ROCK' : p.emote === 'rps_paper' ? 'PAPER' : 'SCIS';
      const tw = measurePixelText(tag, 1).width + 6;
      drawPixelBox(ctx, sx - (tw >> 1), sy - 26, tw, 11, PALETTE.NIGHT_PURPLE, PALETTE.OUTLINE);
      drawPixelText(ctx, tag, sx, sy - 24, {
        align: 'center',
        color: PALETTE.LAB_AMBER,
        outlineColor: PALETTE.OUTLINE,
      });
    }
  }

  private renderScarf(
    ctx: CanvasRenderingContext2D,
    p: PenguinState,
    mainColor: string,
    darkColor: string,
    sx: number,
    sy: number
  ): void {
    const nodes = p.scarfNodes;
    if (nodes && nodes.length >= 2) {
      for (let i = 0; i < nodes.length - 1; i++) {
        const a = nodes[i];
        const b = nodes[i + 1];
        const ax = this.toScreenX(a.x);
        const ay = this.toScreenY(a.y);
        const bx = this.toScreenX(b.x);
        const by = this.toScreenY(b.y);
        const thick = i < 2 ? 2 : 1;
        this.drawPixelLine(ctx, ax, ay, bx, by, PALETTE.OUTLINE, thick + 2);
      }
      for (let i = 0; i < nodes.length - 1; i++) {
        const a = nodes[i];
        const b = nodes[i + 1];
        const ax = this.toScreenX(a.x);
        const ay = this.toScreenY(a.y);
        const bx = this.toScreenX(b.x);
        const by = this.toScreenY(b.y);
        const thick = i < 2 ? 2 : 1;
        this.drawPixelLine(ctx, ax, ay, bx, by, i % 2 === 0 ? mainColor : darkColor, thick);
      }
      return;
    }

    // Fallback waving 5-node scarf tail if sim scarfNodes hasn't initialized yet
    const dir = -p.facing;
    let prevX = sx - p.facing * 2;
    let prevY = sy - 1;
    for (let i = 1; i <= 4; i++) {
      const nx = prevX + dir * 3;
      const ny = prevY + Math.round(Math.sin(this.animClock * 9 + i * 1.1) * 1.5);
      this.drawPixelLine(ctx, prevX, prevY, nx, ny, PALETTE.OUTLINE, i < 3 ? 4 : 3);
      this.drawPixelLine(
        ctx,
        prevX,
        prevY,
        nx,
        ny,
        i % 2 === 0 ? darkColor : mainColor,
        i < 3 ? 2 : 1
      );
      prevX = nx;
      prevY = ny;
    }
  }

  private renderJeff(
    ctx: CanvasRenderingContext2D,
    state: SimState,
    skin: SaveData['skins']['jeff'],
    wx: number,
    wy: number
  ): void {
    const atlas = this.packs.getAtlas();
    const rect = atlas.getJeffSprite(skin);
    const sx = this.toScreenX(wx);
    const sy = this.toScreenY(wy);
    // Align Jeff's bottom (row 17 inside 20x20) cleanly to feet (sy + 9)
    this.drawSprite(ctx, rect, sx - 10, sy - 8, `jeff_${skin.toLowerCase()}`);

    if (state.jeff.grabbedWallSide !== 0 && state.jeff.grabTimer > 0) {
      const ratio = clamp(state.jeff.grabTimer / PHYSICS.GRAB_JEFF_TIMER, 0, 1);
      ctx.fillStyle = PALETTE.OUTLINE;
      ctx.fillRect(sx - 9, sy - 14, 18, 4);
      ctx.fillStyle = ratio > 0.35 ? PALETTE.PINE_MOSS : PALETTE.KRUNKED_SCARF;
      ctx.fillRect(sx - 8, sy - 13, Math.round(16 * ratio), 2);
    }
  }

  private renderCharlieRescue(
    ctx: CanvasRenderingContext2D,
    state: SimState,
    p1x: number,
    p1y: number
  ): void {
    const atlas = this.packs.getAtlas();
    const f = Math.floor(this.animClock * 12) % atlas.charlieFrames.length;
    const cx = this.toScreenX(p1x);
    const cy = this.toScreenY(p1y + 1.1);
    const bob = Math.round(Math.sin(this.animClock * 14) * 2);
    this.drawSprite(ctx, atlas.charlieFrames[f], cx - 12, cy - 12 + bob, `charlie_${f}`);
    // Little rescue tether down to penguin
    ctx.fillStyle = PALETTE.LAB_AMBER;
    ctx.fillRect(cx, cy + 4 + bob, 1, 10);
    if (state.checkpoint.charlieProgress > 0) {
      this.particles.emitSparkles(p1x, p1y + 0.9, 1, PALETTE.SNOW_BRIGHT);
    }
  }

  // ==========================================================================
  // Layer 8: 2D Headlamp Lightmap (Dark Mines Atmospheric Lighting)
  // ==========================================================================

  private renderHeadlampLightmap(
    ctx: CanvasRenderingContext2D,
    state: SimState,
    cache: CachedLevelIndex,
    p1x: number,
    p1y: number,
    p2x: number,
    p2y: number
  ): void {
    const dark = clamp(state.camera.darknessAlpha, 0, 1);
    const lCtx = this.lightCtx;

    // 1. Fill offscreen 480x270 darkness mask
    lCtx.globalCompositeOperation = 'source-over';
    lCtx.clearRect(0, 0, W, H);
    lCtx.fillStyle = `rgba(12, 8, 24, ${(dark * 0.92).toFixed(3)})`;
    lCtx.fillRect(0, 0, W, H);

    // 2. Carve radial light cones via destination-out
    lCtx.globalCompositeOperation = 'destination-out';

    const punchLight = (sx: number, sy: number, rInner: number, rOuter: number) => {
      if (sx + rOuter < 0 || sx - rOuter > W || sy + rOuter < 0 || sy - rOuter > H) return;
      const grad = lCtx.createRadialGradient(sx, sy, rInner, sx, sy, rOuter);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.65, 'rgba(0,0,0,0.82)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      lCtx.fillStyle = grad;
      lCtx.beginPath();
      lCtx.arc(sx, sy, rOuter, 0, Math.PI * 2);
      lCtx.fill();
    };

    const flicker = Math.sin(this.animClock * 11) * 1.5;

    // Krunked (P1) body aura + forward headlamp cone
    const p1sx = this.toScreenX(p1x);
    const p1sy = this.toScreenY(p1y);
    punchLight(p1sx, p1sy - 4, 14, 68 + flicker);
    punchLight(p1sx + state.p1.facing * 26, p1sy - 6, 8, 52 + flicker);

    // Fred (P2) or Jeff aura + headlamp cone
    const p2sx = this.toScreenX(p2x);
    const p2sy = this.toScreenY(p2y);
    if (state.jeff.active) {
      punchLight(p2sx, p2sy, 8, 46);
    } else {
      punchLight(p2sx, p2sy - 4, 14, 68 - flicker);
      punchLight(p2sx + state.p2.facing * 26, p2sy - 6, 8, 52 - flicker);
    }

    // Placed Assist Flag warm beacon
    if (state.checkpoint.placed) {
      punchLight(
        this.toScreenX(state.checkpoint.x),
        this.toScreenY(state.checkpoint.y + 0.8),
        10,
        56
      );
    }

    // Mine Lanterns
    for (let i = 0; i < cache.lanterns.length; i++) {
      const l = cache.lanterns[i];
      const lx = this.toScreenX(l.x);
      const ly = this.toScreenY(l.y);
      punchLight(lx, ly, 8, 48 + Math.sin(this.animClock * 8 + i) * 2);
    }

    // 3. Composite carved darkness onto 480x270 framebuffer
    lCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.lightCanvas, 0, 0);

    // 4. Add warm golden headlamp glow halos!
    const drawWarmHalo = (sx: number, sy: number, radius: number, strength: number) => {
      if (sx + radius < 0 || sx - radius > W || sy + radius < 0 || sy - radius > H) return;
      const g = ctx.createRadialGradient(sx, sy, 2, sx, sy, radius);
      g.addColorStop(0, `rgba(255, 206, 120, ${(strength * dark).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255, 184, 48, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fill();
    };

    drawWarmHalo(p1sx + state.p1.facing * 12, p1sy - 5, 42, 0.16);
    if (!state.jeff.active) {
      drawWarmHalo(p2sx + state.p2.facing * 12, p2sy - 5, 42, 0.16);
    }
    for (let i = 0; i < cache.lanterns.length; i++) {
      const l = cache.lanterns[i];
      drawWarmHalo(this.toScreenX(l.x), this.toScreenY(l.y), 30, 0.18);
    }
  }

  // ==========================================================================
  // Layer 9: Proximity Sign Tooltips & Offscreen Partner Edge Indicators
  // ==========================================================================

  private renderSignTooltip(
    ctx: CanvasRenderingContext2D,
    state: SimState,
    level: LevelData,
    p1x: number,
    p1y: number,
    p2x: number,
    p2y: number
  ): void {
    // Keep Title backdrop & immediate spawn clean until the player moves near a sign
    if (
      state.tick < 25 ||
      (Math.abs(p1x - level.spawnP1.x) < 0.35 &&
        Math.abs(p1y - level.spawnP1.y) < 0.35 &&
        Math.abs(p2x - level.spawnP2.x) < 0.35)
    ) {
      return;
    }

    let bestSign: SignDef | null = null;
    let bestDist = 1.65;

    for (let i = 0; i < level.signs.length; i++) {
      const s = level.signs[i];
      const d1 = Math.hypot(p1x - s.x, p1y - s.y);
      const d2 = state.jeff.active ? 999 : Math.hypot(p2x - s.x, p2y - s.y);
      const d = d1 < d2 ? d1 : d2;
      if (d < bestDist) {
        bestDist = d;
        bestSign = s;
      }
    }

    if (!bestSign) return;

    // Compact bottom-center ribbon tooltip so it NEVER occludes wall-cling shafts or penguins!
    const boxW = 248;
    const innerW = boxW - 14;
    const estLines = Math.max(1, Math.min(3, Math.ceil(bestSign.text.length / Math.floor(innerW / 6))));
    const boxH = 16 + estLines * 9 + 4;

    const sx = (W - boxW) >> 1;
    const sy = H - boxH - 6;

    drawPixelBox(ctx, sx, sy, boxW, boxH, 'rgba(19, 18, 58, 0.86)', PALETTE.OUTLINE, PALETTE.CLIFF_MID);
    drawPixelText(ctx, bestSign.title.toUpperCase(), sx + 7, sy + 4, {
      color: PALETTE.LAB_AMBER,
      outlineColor: PALETTE.OUTLINE,
    });
    drawWrappedPixelText(ctx, bestSign.text, sx + 7, sy + 14, innerW, {
      color: PALETTE.SNOW_BRIGHT,
      outlineColor: PALETTE.OUTLINE,
      lineHeight: 9,
    });
  }

  private renderOffscreenIndicators(
    ctx: CanvasRenderingContext2D,
    state: SimState,
    p1x: number,
    p1y: number,
    p2x: number,
    p2y: number
  ): void {
    this.drawEdgeIndicator(ctx, p1x, p1y, 'P1', PALETTE.KRUNKED_SCARF);
    if (state.jeff.active) {
      this.drawEdgeIndicator(ctx, p2x, p2y, 'JF', PALETTE.ROPE_BASE);
    } else {
      this.drawEdgeIndicator(ctx, p2x, p2y, 'P2', PALETTE.FRED_SCARF);
    }
  }

  private drawEdgeIndicator(
    ctx: CanvasRenderingContext2D,
    wx: number,
    wy: number,
    tag: string,
    accent: string
  ): void {
    const sx = this.toScreenX(wx);
    const sy = this.toScreenY(wy);
    const margin = 10;
    if (sx >= margin && sx <= W - margin && sy >= margin && sy <= H - margin) {
      return;
    }

    const cx = clamp(sx, 16, W - 16);
    const cy = clamp(sy, 28, H - 16);
    const dx = sx - HALF_W;
    const dy = sy - HALF_H;

    let arrow = '\u2191';
    if (Math.abs(dx) > Math.abs(dy)) {
      arrow = dx > 0 ? '\u2192' : '\u2190';
    } else {
      arrow = dy > 0 ? '\u2193' : '\u2191';
    }

    drawPixelBox(ctx, cx - 12, cy - 8, 24, 15, PALETTE.SKY_DEEP, PALETTE.OUTLINE, accent);
    drawPixelText(ctx, `${tag}${arrow}`, cx, cy - 4, {
      align: 'center',
      color: PALETTE.SNOW_BRIGHT,
      outlineColor: PALETTE.OUTLINE,
    });
  }

  // ==========================================================================
  // Layer 10: Crisp Pixel HUD (Altitude, Timer, Biome, Wind, Assists, FPS)
  // ==========================================================================

  private renderHud(
    ctx: CanvasRenderingContext2D,
    state: SimState,
    settings: RenderSettings,
    fps?: number
  ): void {
    // 1. Top-Left: Altitude (000m with subtle scale/color punch on new record!) + Biome Badge
    const altStr = formatAltitude(state.altitude);
    const punching = this.altPunchTimer > 0;
    const altScale = punching && this.altPunchTimer > 0.14 ? 2 : 1;
    const altW = measurePixelText(altStr, altScale).width;

    drawPixelBox(
      ctx,
      6,
      6,
      Math.max(50, altW + 14),
      altScale === 2 ? 22 : 15,
      'rgba(19, 18, 58, 0.84)',
      PALETTE.OUTLINE,
      punching ? PALETTE.LAB_AMBER : PALETTE.CLIFF_MID
    );
    drawPixelText(ctx, altStr, 13, punching && altScale === 2 ? 10 : 10, {
      color: punching ? PALETTE.LAB_AMBER : PALETTE.SNOW_BRIGHT,
      outlineColor: PALETTE.OUTLINE,
      scale: altScale,
    });

    // Biome badge directly underneath altitude
    const biomeInfo = BIOME_DISPLAY[state.currentBiome] ?? BIOME_DISPLAY.foothills;
    const biomeY = altScale === 2 ? 30 : 23;
    const biomeW = measurePixelText(biomeInfo.label, 1).width + 10;
    drawPixelBox(
      ctx,
      6,
      biomeY,
      biomeW,
      12,
      'rgba(19, 18, 58, 0.78)',
      PALETTE.OUTLINE,
      biomeInfo.accent
    );
    drawPixelText(ctx, biomeInfo.label, 11, biomeY + 3, {
      color: biomeInfo.accent,
      outlineColor: PALETTE.OUTLINE,
    });

    // 2. Top-Right: Timer (MM:SS.d), optional FPS counter, active Assist pills
    const timeStr = formatTimer(state.elapsedSec);
    const timeW = measurePixelText(timeStr, 1).width + 12;
    drawPixelBox(
      ctx,
      W - timeW - 6,
      6,
      timeW,
      15,
      'rgba(19, 18, 58, 0.84)',
      PALETTE.OUTLINE,
      PALETTE.SNOW_LIGHT
    );
    drawPixelText(ctx, timeStr, W - 12, 10, {
      align: 'right',
      color: PALETTE.SNOW_BRIGHT,
      outlineColor: PALETTE.OUTLINE,
    });

    let rightY = 23;
    if (settings.showFps && typeof fps === 'number' && Number.isFinite(fps)) {
      const fpsStr = `${Math.round(fps)} FPS`;
      const fw = measurePixelText(fpsStr, 1).width + 10;
      drawPixelBox(ctx, W - fw - 6, rightY, fw, 12, 'rgba(19, 18, 58, 0.78)', PALETTE.OUTLINE);
      drawPixelText(ctx, fpsStr, W - 11, rightY + 3, {
        align: 'right',
        color: PALETTE.PINE_MOSS,
        outlineColor: PALETTE.OUTLINE,
      });
      rightY += 14;
    }

    // Active Assist badges (only shown when enabled)
    const assistTags: string[] = [];
    if (state.assist.infiniteJumps) assistTags.push('INF');
    if (state.assist.pullingRope) assistTags.push('PULL');
    if (state.assist.checkPoints) assistTags.push('FLAG');
    if (state.assist.betterGrab) assistTags.push('GRAB+');

    if (assistTags.length > 0) {
      let badgeX = W - 6;
      for (let i = assistTags.length - 1; i >= 0; i--) {
        const tag = assistTags[i];
        const bw = measurePixelText(tag, 1).width + 8;
        badgeX -= bw;
        drawPixelBox(
          ctx,
          badgeX,
          rightY,
          bw,
          12,
          'rgba(43, 29, 65, 0.88)',
          PALETTE.OUTLINE,
          PALETTE.LAB_AMBER
        );
        drawPixelText(ctx, tag, badgeX + 4, rightY + 3, {
          color: PALETTE.LAB_AMBER,
          outlineColor: PALETTE.OUTLINE,
        });
        badgeX -= 3;
      }
    }

    // 3. Top-Center: Wind Telegraph / Active Gale Warning Banner
    if (state.windPhase === 'telegraph' || state.windPhase === 'active') {
      const isTele = state.windPhase === 'telegraph';
      const blink = Math.floor(this.animClock * (isTele ? 8 : 12)) & 1;
      const arrows = state.windDir > 0 ? '\u2192\u2192' : '\u2190\u2190';
      const label = isTele ? `${arrows} WIND SOON ${arrows}` : `${arrows} GALE ${arrows}`;
      const lw = measurePixelText(label, 1).width + 14;
      const bx = Math.round(HALF_W - lw * 0.5);
      const accent = isTele ? PALETTE.LAB_AMBER : PALETTE.LAB_CYAN;
      drawPixelBox(
        ctx,
        bx,
        6,
        lw,
        15,
        isTele ? 'rgba(69, 40, 60, 0.9)' : 'rgba(20, 30, 46, 0.9)',
        PALETTE.OUTLINE,
        blink ? PALETTE.SNOW_BRIGHT : accent
      );
      drawPixelText(ctx, label, HALF_W, 10, {
        align: 'center',
        color: blink ? PALETTE.SNOW_BRIGHT : accent,
        outlineColor: PALETTE.OUTLINE,
      });
    }

    // 4. Bottom-Center: Discovery / Milestone Toast
    if (this.toastTimer > 0 && this.toastText.length > 0) {
      const fade = this.toastTimer < 0.45 ? this.toastTimer / 0.45 : 1;
      const tw = measurePixelText(this.toastText, 1).width + 16;
      const tx = Math.round(HALF_W - tw * 0.5);
      const ty = H - 24;
      ctx.globalAlpha = fade;
      drawPixelBox(ctx, tx, ty, tw, 15, 'rgba(19, 18, 58, 0.92)', PALETTE.OUTLINE, this.toastColor);
      drawPixelText(ctx, this.toastText, HALF_W, ty + 4, {
        align: 'center',
        color: this.toastColor,
        outlineColor: PALETTE.OUTLINE,
      });
      ctx.globalAlpha = 1;
    }
  }

  // ==========================================================================
  // Low-Level Pixel Drawing Helpers
  // ==========================================================================

  private drawSprite(
    ctx: CanvasRenderingContext2D,
    rect: SpriteRect,
    dx: number,
    dy: number,
    customKey?: string
  ): void {
    const custom = customKey ? this.packs.getCustomSprite(customKey) : null;
    if (custom) {
      ctx.drawImage(custom, Math.round(dx), Math.round(dy), rect.w, rect.h);
      return;
    }
    ctx.drawImage(
      rect.sheet,
      rect.x,
      rect.y,
      rect.w,
      rect.h,
      Math.round(dx),
      Math.round(dy),
      rect.w,
      rect.h
    );
  }

  private drawPixelLine(
    ctx: CanvasRenderingContext2D,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: string,
    thickness = 1
  ): void {
    let ix0 = Math.round(x0);
    let iy0 = Math.round(y0);
    const ix1 = Math.round(x1);
    const iy1 = Math.round(y1);
    const dx = Math.abs(ix1 - ix0);
    const dy = Math.abs(iy1 - iy0);
    const sx = ix0 < ix1 ? 1 : -1;
    const sy = iy0 < iy1 ? 1 : -1;
    let err = dx - dy;
    const half = thickness >> 1;

    ctx.fillStyle = color;
    for (;;) {
      ctx.fillRect(ix0 - half, iy0 - half, thickness, thickness);
      if (ix0 === ix1 && iy0 === iy1) break;
      const e2 = err * 2;
      if (e2 > -dy) {
        err -= dy;
        ix0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        iy0 += sy;
      }
    }
  }
}
