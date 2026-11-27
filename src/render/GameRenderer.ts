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
  drawStyledRopePoints,
  drawWrappedPixelText,
  measurePixelText,
  type PenguinAnimName,
  type SpriteRect,
} from '../assets';
import { LabAndBossRenderer } from './LabAndBossRenderer';
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
  crags: { label: 'WINDY CRAGS', accent: PALETTE.CLIFF_MID },
  summit: { label: 'SUMMIT', accent: PALETTE.LAB_AMBER },
  lab: { label: 'LABORATORY', accent: PALETTE.LAB_CYAN },
  boss: { label: 'BOSS ARENA', accent: PALETTE.KRUNKED_SCARF },
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
  private readonly labBoss: LabAndBossRenderer;

  // Pre-allocated offscreen scratch canvases & light stamps (allocated ONCE at init!)
  private readonly lightCanvas: HTMLCanvasElement;
  private readonly lightCtx: CanvasRenderingContext2D;
  private readonly lightPunchCanvas: HTMLCanvasElement;
  private readonly warmHaloCanvas: HTMLCanvasElement;
  private readonly tintCanvas: HTMLCanvasElement;
  private readonly tintCtx: CanvasRenderingContext2D;

  // Pre-allocated zero-GC scratch buffers for render()
  private readonly ropeXs = new Int16Array(64);
  private readonly ropeYs = new Int16Array(64);
  private readonly animScratch: { anim: PenguinAnimName; frame: number } = {
    anim: 'Idle',
    frame: 0,
  };
  private readonly assistScratch: string[] = [];

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
    this.labBoss = new LabAndBossRenderer();

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

    // Pre-bake reusable radial light punch & warm glow stamps ONCE (ZERO per-frame gradient allocs!)
    this.lightPunchCanvas = document.createElement('canvas');
    this.lightPunchCanvas.width = 128;
    this.lightPunchCanvas.height = 128;
    const punchCtx = this.lightPunchCanvas.getContext('2d');
    if (punchCtx) {
      const grad = punchCtx.createRadialGradient(64, 64, 12, 64, 64, 64);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.65, 'rgba(0,0,0,0.82)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      punchCtx.fillStyle = grad;
      punchCtx.fillRect(0, 0, 128, 128);
    }

    this.warmHaloCanvas = document.createElement('canvas');
    this.warmHaloCanvas.width = 96;
    this.warmHaloCanvas.height = 96;
    const haloCtx = this.warmHaloCanvas.getContext('2d');
    if (haloCtx) {
      const g = haloCtx.createRadialGradient(48, 48, 2, 48, 48, 48);
      g.addColorStop(0, 'rgba(255, 206, 120, 1)');
      g.addColorStop(1, 'rgba(255, 184, 48, 0)');
      haloCtx.fillStyle = g;
      haloCtx.fillRect(0, 0, 96, 96);
    }

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

  getCustomAudioUrls(): Record<string, string> {
    return this.packs.getCustomAudioUrls();
  }

  async clearCustomPack(): Promise<void> {
    return this.packs.clearCustomPack();
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
          // Displayed cleanly via MenuManager's styled golden achievement card (avoids duplicate/overlapping toast)
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

    // 3. Layer 1: Parallax Sky & Biome Backdrop (Alpine <-> Dark Mines <-> Crags <-> Summit <-> Lab)
    this.renderBackdrop(ctx, state, level);

    // 4. Layer 2: World Scenery (Cabin, Pines, Lanterns, Summit Banner, Circuits, Boss)
    this.renderWorldScenery(ctx, state, level, levelCache);

    // 5. Layer 3: Auto-Tiled Terrain & Slopes
    this.renderTerrain(ctx, level, levelCache);

    // 6. Layer 4: Dynamic Hazards, Platforms, Collectibles, NPCs, Checkpoint Flag & Signs
    this.renderDynamicEntities(ctx, state, level, alpha);

    // 7. Layer 5: 35-Segment Styled Verlet Rope (All 12 Rope Skins!)
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

    // Bachicha Boss foreground sweeping laser beam & muzzle flare
    if (state.boss.active && !state.boss.defeated && level.bossArena) {
      this.labBoss.renderBossForeground(ctx, state, level, this.camX, this.camY, this.animClock);
    }

    // 9. Layer 7: Pooled Particles (Snow, Sweat, Puffs, Wind Gale Lines, Debris, Stars, Confetti)
    this.particles.render(ctx, this.camX, this.camY);

    // Summit blowing blizzard veil overlay (crisp atmospheric snowstorm depth)
    if (state.currentBiome === 'summit') {
      this.renderSummitBlizzardVeil(ctx, state);
    }

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
    // 1. Ambient alpine snow (outside deep mines / lab; heavier squalls in Crags & Summit!)
    const inMinesOrLab =
      state.currentBiome === 'mines' ||
      state.currentBiome === 'lab' ||
      state.currentBiome === 'boss';
    if (!inMinesOrLab) {
      const isSummit = state.currentBiome === 'summit';
      const isCrags = state.currentBiome === 'crags';
      const baseSnow = isSummit ? 42 : isCrags ? 24 : 16;
      const snowRate = state.windPhase === 'active' ? baseSnow + 24 : baseSnow;
      const blownByWind = state.windActive || isSummit;
      this.snowAccum += snowRate * dt;
      while (this.snowAccum >= 1) {
        this.snowAccum -= 1;
        this.particles.emitAmbientSnow(blownByWind, state.windDir);
      }
    }

    // 2. Wind telegraph streaks, active gale lines, & Summit ambient ice-draft streaks
    if (state.windPhase === 'telegraph') {
      this.windParticleAccum += 12 * dt;
      while (this.windParticleAccum >= 1) {
        this.windParticleAccum -= 1;
        this.particles.emitWindStreak(state.windDir, true);
      }
    } else if (state.windPhase === 'active') {
      this.windParticleAccum += (state.currentBiome === 'summit' ? 44 : 34) * dt;
      while (this.windParticleAccum >= 1) {
        this.windParticleAccum -= 1;
        this.particles.emitWindStreak(state.windDir, false);
      }
    } else if (state.currentBiome === 'summit' || state.currentBiome === 'crags') {
      this.windParticleAccum += (state.currentBiome === 'summit' ? 14 : 7) * dt;
      while (this.windParticleAccum >= 1) {
        this.windParticleAccum -= 1;
        this.particles.emitWindStreak(state.windDir, true);
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

  private renderBackdrop(ctx: CanvasRenderingContext2D, state: SimState, level: LevelData): void {
    const biome = state.currentBiome;
    const isLab = biome === 'lab' || biome === 'boss';
    if (isLab) {
      this.renderLabBackdrop(ctx, state);
      return;
    }

    // Determine Dark Mines subterranean blend (respects BOTH Time Trials and full Mountain altitude!)
    let minesBlend = 0;
    if (level.mode === 'time_trial') {
      minesBlend = biome === 'mines' ? 1 : 0;
    } else {
      const enterMines = clamp((this.camY - (WORLD.ZONE2_START_Y - 6)) / 12, 0, 1);
      const exitMines = clamp((this.camY - (WORLD.ZONE3_START_Y - 6)) / 14, 0, 1);
      minesBlend = enterMines * (1 - exitMines);
    }

    const isCrags =
      biome === 'crags' ||
      (level.mode !== 'time_trial' &&
        this.camY >= WORLD.ZONE3_START_Y - 4 &&
        this.camY < WORLD.ZONE4_START_Y - 6);
    const isSummit =
      biome === 'summit' ||
      (level.mode !== 'time_trial' && this.camY >= WORLD.ZONE4_START_Y - 6);

    // 1. Outdoor Biome Skies (Foothills Twilight vs Windy Crags Storm Dusk vs Frozen Summit Glacial Aurora)
    if (minesBlend < 0.99) {
      if (isSummit) {
        // Zone 4 Frozen Summit: deep stratospheric sapphire-glacial night sky
        ctx.fillStyle = '#070b22';
        ctx.fillRect(0, 0, W, 62);
        ctx.fillStyle = '#0f1a42';
        ctx.fillRect(0, 62, W, 56);
        ctx.fillStyle = '#1b2f66';
        ctx.fillRect(0, 118, W, 66);
        ctx.fillStyle = '#345290';
        ctx.fillRect(0, 184, W, H - 184);

        ctx.fillStyle = '#0f1a42';
        for (let x = 0; x < W; x += 4) ctx.fillRect(x, 61, 2, 1);
        ctx.fillStyle = '#1b2f66';
        for (let x = 2; x < W; x += 4) ctx.fillRect(x, 117, 2, 1);
        ctx.fillStyle = '#345290';
        for (let x = 0; x < W; x += 4) ctx.fillRect(x, 183, 2, 1);
      } else if (isCrags) {
        // Zone 3 Windy Crags: stormy violet & crimson-dusk windswept sky
        ctx.fillStyle = '#170e2e';
        ctx.fillRect(0, 0, W, 60);
        ctx.fillStyle = '#281745';
        ctx.fillRect(0, 60, W, 56);
        ctx.fillStyle = '#432056';
        ctx.fillRect(0, 116, W, 64);
        ctx.fillStyle = '#5e3263';
        ctx.fillRect(0, 180, W, H - 180);

        ctx.fillStyle = '#281745';
        for (let x = 0; x < W; x += 4) ctx.fillRect(x, 59, 2, 1);
        ctx.fillStyle = '#432056';
        for (let x = 2; x < W; x += 4) ctx.fillRect(x, 115, 2, 1);
        ctx.fillStyle = '#5e3263';
        for (let x = 0; x < W; x += 4) ctx.fillRect(x, 179, 2, 1);
      } else {
        // Village & Zone 1 Snowy Foothills: classic alpine indigo-purple twilight
        ctx.fillStyle = PALETTE.SKY_DEEP;
        ctx.fillRect(0, 0, W, 68);
        ctx.fillStyle = '#1b1742';
        ctx.fillRect(0, 68, W, 54);
        ctx.fillStyle = PALETTE.NIGHT_PURPLE;
        ctx.fillRect(0, 122, W, 64);
        ctx.fillStyle = '#33285b';
        ctx.fillRect(0, 186, W, H - 186);

        ctx.fillStyle = '#1b1742';
        for (let x = 0; x < W; x += 4) ctx.fillRect(x, 67, 2, 1);
        ctx.fillStyle = PALETTE.NIGHT_PURPLE;
        for (let x = 2; x < W; x += 4) ctx.fillRect(x, 121, 2, 1);
        ctx.fillStyle = '#33285b';
        for (let x = 0; x < W; x += 4) ctx.fillRect(x, 185, 2, 1);
      }

      // Vivid multi-ribbon Aurora Borealis curtains in Frozen Summit (subtle shimmer in upper Crags)
      if (isSummit || isCrags) {
        const auroraBase = isSummit ? 0.34 : 0.14;
        for (let i = 0; i < W; i += 6) {
          const w1 = Math.round(Math.sin(i * 0.022 + this.animClock * 1.1) * 14);
          const w2 = Math.round(Math.cos(i * 0.017 - this.animClock * 0.85) * 10);
          ctx.globalAlpha = auroraBase;
          ctx.fillStyle = PALETTE.PINE_MOSS;
          ctx.fillRect(i, 24 + w1, 6, isSummit ? 28 : 16);
          if (isSummit) {
            ctx.globalAlpha = 0.24;
            ctx.fillStyle = PALETTE.LAB_CYAN;
            ctx.fillRect(i, 42 + w2, 6, 18);
            ctx.globalAlpha = 0.16;
            ctx.fillStyle = PALETTE.ICE_MID;
            ctx.fillRect(i, 16 + w2, 6, 14);
          }
        }
        ctx.globalAlpha = 1;
      }

      // Twinkling stars (extra bright crystal starfield on Summit)
      for (let i = 0; i < this.stars.length; i++) {
        const s = this.stars[i];
        const sx = (((Math.round(s.x - this.camX * 0.65) % W) + W) % W);
        const sy = (((Math.round(s.y + this.camY * 0.45) % 165) + 165) % 165);
        const twinkle = Math.sin(this.animClock * (isSummit ? 3.8 : 2.4) + s.phase) > 0.3;
        ctx.fillStyle =
          isSummit && s.bright
            ? PALETTE.LAB_CYAN
            : s.bright && twinkle
              ? PALETTE.SNOW_BRIGHT
              : PALETTE.SNOW_LIGHT;
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
        // Crescent cutout matching current biome zenith
        ctx.fillStyle = isSummit ? '#070b22' : isCrags ? '#170e2e' : PALETTE.SKY_DEEP;
        ctx.fillRect(moonX - 2, moonY - 8, 11, 12);
        ctx.fillRect(moonX, moonY - 6, 11, 10);
      }

      // Drifting clouds (fast elongated storm shear clouds in Crags & Summit!)
      const windMul = isCrags ? 4.4 : isSummit ? 3.2 : 1.0;
      const windSign = isCrags || isSummit ? state.windDir : 1;
      for (let i = 0; i < this.clouds.length; i++) {
        const c = this.clouds[i];
        const cw = isCrags ? c.w + 34 : isSummit ? c.w + 18 : c.w;
        const ch = isCrags ? Math.max(6, c.h - 4) : c.h;
        const cx =
          ((((Math.round(c.x + this.animClock * c.speed * windMul * windSign - this.camX * 2.2) %
            (W + 130)) +
            (W + 130)) %
            (W + 130)) -
            65);
        const cy = Math.round(c.y + this.camY * 0.65) % 190;
        ctx.fillStyle = isSummit ? '#274075' : isCrags ? '#351c4d' : PALETTE.BODY_DARK;
        ctx.fillRect(cx + 4, cy + 2, cw - 8, ch);
        ctx.fillStyle = isSummit ? '#4b6ca8' : isCrags ? '#542c66' : PALETTE.CLIFF_DARK;
        ctx.fillRect(cx, cy + 4, cw, Math.max(2, ch - 4));
        ctx.fillStyle = isSummit ? PALETTE.ICE_LIGHT : isCrags ? '#874c8c' : PALETTE.CLIFF_MID;
        ctx.fillRect(cx + 8, cy, Math.max(8, cw - 16), 3);
      }

      // Sweeping mist ribbons in Windy Crags
      if (isCrags) {
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = PALETTE.ICE_TINT;
        for (let r = 0; r < 5; r++) {
          const rx =
            (((Math.round(this.animClock * (75 + r * 18) * state.windDir + r * 97) % (W + 140)) +
              (W + 140)) %
              (W + 140)) -
            70;
          const ry = 82 + r * 34;
          ctx.fillRect(rx, ry, 72 + r * 8, 2);
          ctx.fillRect(rx + 12, ry + 3, 44, 1);
        }
        ctx.globalAlpha = 1;
      }

      // Biome-specific parallax mountain silhouettes!
      if (isSummit) {
        // Gleaming crystalline glacier peaks
        this.renderMountainRange(ctx, 0.14, 174, 72, 74, '#1b2d59', PALETTE.ICE_LIGHT);
        this.renderMountainRange(ctx, 0.28, 212, 60, 56, '#263f78', PALETTE.SNOW_BRIGHT);
      } else if (isCrags) {
        // Sharp jagged windswept violet crag spires
        this.renderMountainRange(ctx, 0.16, 172, 82, 54, '#24143b', '#8757a3');
        this.renderMountainRange(ctx, 0.3, 210, 68, 44, '#1b0f2e', PALETTE.ICE_TINT);
      } else {
        // Foothills twilight ridges & snow-crested peaks
        this.renderMountainRange(ctx, 0.14, 178, 62, 78, '#231e54', '#5c52a3');
        this.renderMountainRange(ctx, 0.28, 214, 52, 62, '#1d193d', PALETTE.SNOW_LIGHT);
      }

      // Distant pine silhouette treeline near lower Foothills/Village
      if (!isCrags && !isSummit && this.camY < 62) {
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

  private renderSummitBlizzardVeil(ctx: CanvasRenderingContext2D, state: SimState): void {
    const galeBoost = state.windActive ? 1.0 : 0.45;
    const speed = state.windActive ? 220 : 110;
    const dir = state.windDir;
    ctx.fillStyle = PALETTE.SNOW_LIGHT;
    for (let i = 0; i < 6; i++) {
      const x =
        (((Math.round(this.animClock * (speed + i * 28) * dir + i * 83) % (W + 160)) +
          (W + 160)) %
          (W + 160)) -
        80;
      const y = (i * 44 + Math.round(Math.sin(this.animClock * 1.6 + i) * 8)) % H;
      ctx.globalAlpha = (0.08 + (i & 1) * 0.05) * galeBoost;
      ctx.fillRect(x, y, 78 + i * 10, 3);
      ctx.fillRect(x + 14, y + 4, 48, 2);
    }
    ctx.globalAlpha = 1;
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

  private renderLabBackdrop(ctx: CanvasRenderingContext2D, state: SimState): void {
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
        // Corner bulkhead rivets
        ctx.fillStyle = PALETTE.LAB_STEEL;
        ctx.fillRect(x + 3, y + 3, 1, 1);
        ctx.fillRect(x + cell - 4, y + 3, 1, 1);
        ctx.fillStyle = PALETTE.LAB_WALL;
      }
    }

    // Glowing vertical lab conduit rails
    const isBossAlarm =
      state.currentBiome === 'boss' && state.boss.active && !state.boss.defeated;
    const railStep = 120;
    const rxStart = -(((sx % railStep) + railStep) % railStep);
    for (let rx = rxStart; rx < W + railStep; rx += railStep) {
      ctx.fillStyle = PALETTE.LAB_STEEL;
      ctx.fillRect(rx, 0, 6, H);
      ctx.fillStyle = isBossAlarm ? PALETTE.KRUNKED_SCARF : PALETTE.LAB_CYAN;
      ctx.globalAlpha = 0.35 + 0.18 * Math.sin(this.animClock * (isBossAlarm ? 6 : 3) + rx);
      ctx.fillRect(rx + 2, 0, 2, H);
      ctx.globalAlpha = 1;
    }

    // Boss Arena subtle pulsing crimson alert wash when Bachicha is active
    if (isBossAlarm) {
      ctx.globalAlpha = 0.08 + 0.06 * Math.sin(this.animClock * 5.2);
      ctx.fillStyle = PALETTE.KRUNKED_SCARF;
      ctx.fillRect(0, 0, W, 64);
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

    // 5. Lab Circuit Wires (copper/slate dormant -> animated cyan pulse traces!)
    if (state.circuits.length > 0) {
      this.labBoss.renderCircuits(ctx, state, this.camX, this.camY, this.animClock);
    }

    // 6. Boss Arena (Bachicha 4-Chain Mechanical-Yeti Golem Centerpiece)
    if (level.bossArena) {
      this.labBoss.renderBossBackdrop(ctx, state, level, this.camX, this.camY, this.animClock);
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

    // 5. Lab Tronchos (telescoping hydraulic pistons + caution block + cyan grab pads)
    if (state.tronchos.length > 0) {
      this.labBoss.renderTronchos(ctx, state, atlas, alpha, this.camX, this.camY, this.animClock);
    }

    // 6. Owner-Exclusive ColorPlatforms (Krunked 'K' / Fred 'F' active & dashed inactive)
    if (state.colorPlatforms.length > 0) {
      this.labBoss.renderColorPlatforms(ctx, state, this.camX, this.camY, this.animClock);
    }

    // 7. Circuit Buttons (switch lever, pressure plate, timed amber plate + countdown bar)
    if (state.buttons.length > 0) {
      this.labBoss.renderButtons(ctx, state, this.camX, this.camY, this.animClock);
    }

    // 8. Lasers (steel emitters + flickering plasma core + endpoint impact flares)
    if (state.lasers.length > 0) {
      this.labBoss.renderLasers(ctx, state, this.camX, this.camY, this.animClock);
    }

    // 9. Collectibles (Polaroids & Manual Scrolls)
    for (let i = 0; i < state.collectibles.length; i++) {
      const c = state.collectibles[i];
      if (c.kind !== 'photo' && c.kind !== 'manual') continue;
      if (c.collected) continue;
      const sx = this.toScreenX(c.x);
      const bob = Math.round(Math.sin(this.animClock * 3.4 + c.x * 1.3) * 2);
      const sy = this.toScreenY(c.y) + bob;
      if (sx < -24 || sx > W + 24 || sy < -24 || sy > H + 24) continue;

      const glint = Math.floor(this.animClock * 4 + i) & 1;
      ctx.fillStyle = c.kind === 'photo' ? PALETTE.LAB_AMBER : PALETTE.LAB_CYAN;
      ctx.fillRect(sx - 9 - glint, sy - 1, 2, 2);
      ctx.fillRect(sx + 8 + glint, sy - 1, 2, 2);

      if (c.kind === 'photo') {
        this.drawSprite(ctx, atlas.polaroidSprite, sx - 8, sy - 8, 'collectible_photo');
      } else {
        this.drawSprite(ctx, atlas.manualSprite, sx - 8, sy - 8, 'collectible_manual');
      }
    }

    // 9B. World NPCs (Bouncing & Waving Baby Seals, Peeking Mines Moles, Cozy Village Penguins)
    this.labBoss.renderWorldNpcs(ctx, state, level, atlas, this.camX, this.camY, this.animClock);

    // 10. Placed Assist Checkpoint Flag
    if (state.checkpoint.placed) {
      const fx = this.toScreenX(state.checkpoint.x);
      const fy = this.toScreenY(state.checkpoint.y);
      const fIdx = Math.floor(this.animClock * 6) % atlas.flagFrames.length;
      this.drawSprite(ctx, atlas.flagFrames[fIdx], fx - 5, fy - 22, `assist_flag_${fIdx}`);
    }
  }

  // ==========================================================================
  // Layer 5: 35-Segment Styled Verlet Rope (All 12 Rope Skins — Zero Alloc)
  // ==========================================================================

  private renderVerletRope(
    ctx: CanvasRenderingContext2D,
    state: SimState,
    ropeSkin: RopeSkinId,
    alpha: number
  ): void {
    const nodes = state.rope.nodes;
    const count = Math.min(nodes.length, this.ropeXs.length);
    if (count < 2) return;

    for (let i = 0; i < count; i++) {
      const n = nodes[i];
      this.ropeXs[i] = this.toScreenX(lerp(n.prevX, n.x, alpha));
      this.ropeYs[i] = this.toScreenY(lerp(n.prevY, n.y, alpha));
    }

    const isTaut = state.rope.taut || state.rope.tension > 0.72;
    drawStyledRopePoints(ctx, this.ropeXs, this.ropeYs, count, ropeSkin, this.animClock, isTaut);
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
      this.animScratch.anim = anim;
      this.animScratch.frame = rpsFrame;
      return this.animScratch;
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
    this.animScratch.anim = anim;
    this.animScratch.frame = frame;
    return this.animScratch;
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

    // Body layer then separate Hands overlay layer (zero per-frame closures!)
    this.drawPenguinLayer(
      ctx,
      bodyRect,
      customBody,
      sx,
      sy,
      swingRad,
      flipX,
      p.action === 'Grab' && p.grabRedTint > 0.02 ? p.grabRedTint : 0
    );
    this.drawPenguinLayer(ctx, handRect, customHand, sx, sy, swingRad, flipX, 0);

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

    // 2. Carve radial light cones via destination-out using pre-baked stamp (ZERO per-frame allocs!)
    lCtx.globalCompositeOperation = 'destination-out';

    const flicker = Math.sin(this.animClock * 11) * 1.5;

    // Krunked (P1) body aura + forward headlamp cone
    const p1sx = this.toScreenX(p1x);
    const p1sy = this.toScreenY(p1y);
    this.punchLightStamp(lCtx, p1sx, p1sy - 4, 68 + flicker);
    this.punchLightStamp(lCtx, p1sx + state.p1.facing * 26, p1sy - 6, 52 + flicker);

    // Fred (P2) or Jeff aura + headlamp cone
    const p2sx = this.toScreenX(p2x);
    const p2sy = this.toScreenY(p2y);
    if (state.jeff.active) {
      this.punchLightStamp(lCtx, p2sx, p2sy, 46);
    } else {
      this.punchLightStamp(lCtx, p2sx, p2sy - 4, 68 - flicker);
      this.punchLightStamp(lCtx, p2sx + state.p2.facing * 26, p2sy - 6, 52 - flicker);
    }

    // Placed Assist Flag warm beacon
    if (state.checkpoint.placed) {
      this.punchLightStamp(
        lCtx,
        this.toScreenX(state.checkpoint.x),
        this.toScreenY(state.checkpoint.y + 0.8),
        56
      );
    }

    // Mine Lanterns
    for (let i = 0; i < cache.lanterns.length; i++) {
      const l = cache.lanterns[i];
      const lx = this.toScreenX(l.x);
      const ly = this.toScreenY(l.y);
      this.punchLightStamp(lCtx, lx, ly, 48 + Math.sin(this.animClock * 8 + i) * 2);
    }

    // 3. Composite carved darkness onto 480x270 framebuffer
    lCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.lightCanvas, 0, 0);

    // 4. Add warm golden headlamp glow halos using pre-baked stamp (ZERO per-frame allocs!)
    this.drawWarmHaloStamp(ctx, p1sx + state.p1.facing * 12, p1sy - 5, 42, 0.16 * dark);
    if (!state.jeff.active) {
      this.drawWarmHaloStamp(ctx, p2sx + state.p2.facing * 12, p2sy - 5, 42, 0.16 * dark);
    }
    for (let i = 0; i < cache.lanterns.length; i++) {
      const l = cache.lanterns[i];
      this.drawWarmHaloStamp(ctx, this.toScreenX(l.x), this.toScreenY(l.y), 30, 0.18 * dark);
    }
  }

  private punchLightStamp(
    lCtx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    rOuter: number
  ): void {
    if (sx + rOuter < 0 || sx - rOuter > W || sy + rOuter < 0 || sy - rOuter > H) return;
    lCtx.drawImage(this.lightPunchCanvas, sx - rOuter, sy - rOuter, rOuter * 2, rOuter * 2);
  }

  private drawWarmHaloStamp(
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    radius: number,
    alpha: number
  ): void {
    if (sx + radius < 0 || sx - radius > W || sy + radius < 0 || sy - radius > H) return;
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.warmHaloCanvas, sx - radius, sy - radius, radius * 2, radius * 2);
    ctx.globalAlpha = 1;
  }

  private drawPenguinLayer(
    ctx: CanvasRenderingContext2D,
    rect: SpriteRect,
    customImg: HTMLImageElement | null,
    sx: number,
    sy: number,
    swingRad: number,
    flipX: boolean,
    grabRedTint: number
  ): void {
    ctx.save();
    ctx.translate(sx, sy);
    if (swingRad !== 0) {
      ctx.rotate(swingRad);
    }
    if (flipX) {
      ctx.scale(-1, 1);
    }

    if (grabRedTint > 0.02) {
      const tCtx = this.tintCtx;
      tCtx.globalCompositeOperation = 'source-over';
      tCtx.clearRect(0, 0, 32, 32);
      if (customImg) {
        tCtx.drawImage(customImg, 0, 0, 32, 32);
      } else {
        tCtx.drawImage(rect.sheet, rect.x, rect.y, rect.w, rect.h, 0, 0, 32, 32);
      }
      tCtx.globalCompositeOperation = 'source-atop';
      const urgentPulse = grabRedTint > 0.65 ? 0.14 * Math.sin(this.animClock * 18) : 0;
      const alphaTint = clamp(grabRedTint * 0.68 + urgentPulse, 0, 0.82);
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

    // Active Assist badges (only shown when enabled — reuses scratch array!)
    const assistTags = this.assistScratch;
    assistTags.length = 0;
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

    // 3B. Bachicha 4-Chain Boss Arena Status Bar
    if (state.boss.active && !state.boss.defeated) {
      this.labBoss.renderBossHud(ctx, state, this.animClock);
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

    // 4. Top-Center (below wind banner): Discovery / Milestone Toast (never overlaps bottom sign banners!)
    if (this.toastTimer > 0 && this.toastText.length > 0) {
      const fade = this.toastTimer < 0.45 ? this.toastTimer / 0.45 : 1;
      const tw = measurePixelText(this.toastText, 1).width + 16;
      const tx = Math.round(HALF_W - tw * 0.5);
      const ty = state.windPhase === 'telegraph' || state.windPhase === 'active' || state.boss.active ? 26 : 10;
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
