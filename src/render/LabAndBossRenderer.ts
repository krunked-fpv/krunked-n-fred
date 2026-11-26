// ============================================================================
// Krunked & Fred — Laboratory DLC, Bachicha 4-Chain Boss & World NPC Renderer
// Pure 480x270 nearest-neighbor pixel art with ZERO per-frame allocations:
//   - Circuits: dormant copper/slate -> powered glowing #38e8ff energy pulses
//   - Buttons: switch lever, weighted pressure plate, amber timed plate + bar
//   - Lasers: steel emitters, flickering crimson/cyan core, impact flares
//   - Tronchos: telescoping hydraulic shaft, caution block, cyan grab pads
//   - ColorPlatforms: crimson Krunked (K) & emerald Fred (F), active/dashed
//   - Bachicha 4-Chain Boss Arena: monumental mechanical-yeti golem, 4 heavy
//     animated chains, broken stubs, sweeping laser, defeated freed celebration
//   - World NPCs: bouncing & flipper-waving Baby Seals, Dark Mines Moles,
//     and cozy Village Penguins!
// ============================================================================

import {
  PALETTE,
  PHYSICS,
  WORLD,
  type BossChainState,
  type LevelData,
  type SimState,
} from '../contracts';
import {
  drawPixelBox,
  drawPixelText,
  type ProceduralPixelAtlas,
} from '../assets';

const W = PHYSICS.LOGICAL_WIDTH; // 480
const H = PHYSICS.LOGICAL_HEIGHT; // 270
const HALF_W = W * 0.5;
const HALF_H = H * 0.5;
const PPU = PHYSICS.PPU;

interface CachedMoleSpot {
  x: number;
  y: number;
  phase: number;
}

interface CachedVillagerSpot {
  x: number;
  y: number;
  variant: 0 | 1;
  facing: 1 | -1;
}

interface CachedNpcLayout {
  key: string;
  moles: CachedMoleSpot[];
  villagers: CachedVillagerSpot[];
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

function toScreenX(worldX: number, camX: number): number {
  return Math.round((worldX - camX) * PPU + HALF_W);
}

function toScreenY(worldY: number, camY: number): number {
  return Math.round(HALF_H - (worldY - camY) * PPU);
}

function drawPixelLine(
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

export class LabAndBossRenderer {
  // Pre-baked offscreen pixel sprites allocated ONCE in constructor (ZERO per-frame allocs)
  private readonly bossBodyCanvas: HTMLCanvasElement;
  private readonly npcSheet: HTMLCanvasElement;
  private npcLayout: CachedNpcLayout | null = null;

  constructor() {
    this.bossBodyCanvas = document.createElement('canvas');
    this.bossBodyCanvas.width = 96;
    this.bossBodyCanvas.height = 88;
    const bCtx = this.bossBodyCanvas.getContext('2d');
    if (bCtx) {
      bCtx.imageSmoothingEnabled = false;
      this.bakeBachichaChassis(bCtx);
    }

    // Compact NPC sprite sheet:
    // Row 0: Peeking Moles (2 frames x 16x16 at x=0, 16) + Rescued Waving Seal (2 frames x 20x18 at x=32, 52)
    // Row 1 (y=24): Cozy Village Penguins (2 variants x 2 frames x 20x24 at x=0,20,40,60)
    this.npcSheet = document.createElement('canvas');
    this.npcSheet.width = 96;
    this.npcSheet.height = 56;
    const nCtx = this.npcSheet.getContext('2d');
    if (nCtx) {
      nCtx.imageSmoothingEnabled = false;
      this.bakeMole(nCtx, 0, 0, 0);
      this.bakeMole(nCtx, 16, 0, 1);
      this.bakeRescuedSeal(nCtx, 32, 0, 0);
      this.bakeRescuedSeal(nCtx, 52, 0, 1);
      this.bakeVillager(nCtx, 0, 24, 0, 0);
      this.bakeVillager(nCtx, 20, 24, 0, 1);
      this.bakeVillager(nCtx, 40, 24, 1, 0);
      this.bakeVillager(nCtx, 60, 24, 1, 1);
    }
  }

  // ==========================================================================
  // 1. Laboratory Circuits (Copper/Slate Dormant -> Animated Cyan Pulse Traces)
  // ==========================================================================

  renderCircuits(
    ctx: CanvasRenderingContext2D,
    state: SimState,
    camX: number,
    camY: number,
    animClock: number
  ): void {
    const circuits = state.circuits;
    for (let i = 0; i < circuits.length; i++) {
      const circuit = circuits[i];
      const nodes = circuit.nodes;
      if (nodes.length < 2) continue;

      const powered = circuit.powered;
      let pathAccum = 0;

      for (let n = 0; n < nodes.length - 1; n++) {
        const ax = toScreenX(nodes[n].x, camX);
        const ay = toScreenY(nodes[n].y, camY);
        const bx = toScreenX(nodes[n + 1].x, camX);
        const by = toScreenY(nodes[n + 1].y, camY);

        if (
          Math.max(ax, bx) < -16 ||
          Math.min(ax, bx) > W + 16 ||
          Math.max(ay, by) < -16 ||
          Math.min(ay, by) > H + 16
        ) {
          pathAccum += Math.hypot(bx - ax, by - ay);
          continue;
        }

        // Recessed industrial conduit channel
        drawPixelLine(ctx, ax, ay, bx, by, PALETTE.OUTLINE, 4);
        if (powered) {
          // Glowing cyan trace
          drawPixelLine(ctx, ax, ay, bx, by, PALETTE.LAB_CYAN, 2);

          // Animated travelling energy pulses marching along the powered trace!
          const segLen = Math.hypot(bx - ax, by - ay);
          if (segLen >= 4) {
            const spacing = 22;
            const travel = (animClock * 46 + i * 13) % spacing;
            for (let d = ((travel - (pathAccum % spacing)) + spacing) % spacing; d < segLen; d += spacing) {
              const t = d / segLen;
              const px = Math.round(ax + (bx - ax) * t);
              const py = Math.round(ay + (by - ay) * t);
              ctx.fillStyle = PALETTE.SNOW_BRIGHT;
              ctx.fillRect(px - 1, py - 1, 3, 3);
            }
          }
          pathAccum += segLen;
        } else {
          // Dormant copper/slate metallic trace
          drawPixelLine(ctx, ax, ay, bx, by, PALETTE.BEAK_DARK, 2);
          drawPixelLine(ctx, ax, ay, bx, by, PALETTE.LAB_STEEL, 1);
          pathAccum += Math.hypot(bx - ax, by - ay);
        }
      }

      // Junction node caps at every circuit vertex
      for (let n = 0; n < nodes.length; n++) {
        const nx = toScreenX(nodes[n].x, camX);
        const ny = toScreenY(nodes[n].y, camY);
        if (nx < -8 || nx > W + 8 || ny < -8 || ny > H + 8) continue;
        ctx.fillStyle = PALETTE.OUTLINE;
        ctx.fillRect(nx - 3, ny - 3, 6, 6);
        ctx.fillStyle = powered ? PALETTE.LAB_CYAN : PALETTE.LAB_STEEL;
        ctx.fillRect(nx - 2, ny - 2, 4, 4);
        ctx.fillStyle = powered ? PALETTE.SNOW_BRIGHT : PALETTE.BEAK_MID;
        ctx.fillRect(nx - 1, ny - 1, 2, 2);
      }
    }
  }

  // ==========================================================================
  // 2. Laboratory Circuit Buttons (Switch Lever, Pressure Plate, Timed Plate)
  // ==========================================================================

  renderButtons(
    ctx: CanvasRenderingContext2D,
    state: SimState,
    camX: number,
    camY: number,
    animClock: number
  ): void {
    const buttons = state.buttons;
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      const sx = toScreenX(btn.x, camX);
      const syBot = toScreenY(btn.y, camY);
      const pw = Math.max(14, Math.round(btn.w * PPU));
      if (sx + pw < -20 || sx > W + 20 || syBot < -28 || syBot > H + 24) continue;

      const cx = sx + (pw >> 1);

      if (btn.kind === 'switch') {
        // Mechanical toggle lever housing
        drawPixelBox(ctx, sx, syBot - 5, pw, 5, PALETTE.LAB_STEEL, PALETTE.OUTLINE, PALETTE.LAB_HIGHLIGHT);
        // Lever arm flips cleanly left (off) <-> right (on)
        const tipX = btn.pressed ? cx + 5 : cx - 5;
        const tipY = syBot - 12;
        drawPixelLine(ctx, cx, syBot - 5, tipX, tipY, PALETTE.OUTLINE, 4);
        drawPixelLine(ctx, cx, syBot - 5, tipX, tipY, PALETTE.LAB_HIGHLIGHT, 2);
        // Lever knob
        ctx.fillStyle = PALETTE.OUTLINE;
        ctx.fillRect(tipX - 3, tipY - 3, 6, 6);
        ctx.fillStyle = btn.pressed ? PALETTE.LAB_CYAN : PALETTE.KRUNKED_SCARF;
        ctx.fillRect(tipX - 2, tipY - 2, 4, 4);
        ctx.fillStyle = PALETTE.SNOW_BRIGHT;
        ctx.fillRect(tipX - 1, tipY - 1, 1, 1);
        // Status LED on housing
        ctx.fillStyle = btn.pressed ? PALETTE.LAB_CYAN : PALETTE.KRUNKED_SCARF_DARK;
        ctx.fillRect(cx - 1, syBot - 3, 2, 2);
      } else if (btn.kind === 'timed') {
        // Amber timed button plate + live countdown bar!
        const capH = btn.pressed ? 2 : 5;
        drawPixelBox(ctx, sx, syBot - 4, pw, 4, PALETTE.LAB_WALL, PALETTE.OUTLINE, PALETTE.LAB_STEEL);
        // Amber striped top cap
        ctx.fillStyle = PALETTE.OUTLINE;
        ctx.fillRect(sx + 1, syBot - 4 - capH - 1, pw - 2, capH + 2);
        ctx.fillStyle = btn.pressed ? PALETTE.LAB_CYAN : PALETTE.LAB_AMBER;
        ctx.fillRect(sx + 2, syBot - 4 - capH, pw - 4, capH);
        ctx.fillStyle = PALETTE.BEAK_BRIGHT;
        for (let st = 3; st < pw - 5; st += 4) {
          ctx.fillRect(sx + st, syBot - 4 - capH, 2, capH);
        }
        // Live countdown bar floating cleanly above timed button!
        if (btn.pressed && btn.duration > 0) {
          const ratio = clamp(btn.timer / btn.duration, 0, 1);
          const barW = Math.max(16, pw);
          const bx = cx - (barW >> 1);
          const by = syBot - 15;
          ctx.fillStyle = PALETTE.OUTLINE;
          ctx.fillRect(bx - 1, by - 1, barW + 2, 5);
          ctx.fillStyle = PALETTE.LAB_DEEP;
          ctx.fillRect(bx, by, barW, 3);
          const urgent = ratio < 0.28 && (Math.floor(animClock * 14) & 1) === 0;
          ctx.fillStyle = urgent
            ? PALETTE.KRUNKED_SCARF
            : ratio < 0.35
              ? PALETTE.BEAK_BRIGHT
              : PALETTE.LAB_AMBER;
          ctx.fillRect(bx, by, Math.max(1, Math.round(barW * ratio)), 3);
        }
      } else {
        // Weighted steel 'pressure' plate with twin side coil springs
        const capH = btn.pressed ? 2 : 5;
        if (!btn.pressed) {
          // Visible steel coil springs under unpressed plate
          ctx.fillStyle = PALETTE.LAB_HIGHLIGHT;
          ctx.fillRect(sx + 3, syBot - 6, 2, 3);
          ctx.fillRect(sx + pw - 5, syBot - 6, 2, 3);
        }
        drawPixelBox(ctx, sx, syBot - 4, pw, 4, PALETTE.LAB_STEEL, PALETTE.OUTLINE, PALETTE.LAB_HIGHLIGHT);
        ctx.fillStyle = PALETTE.OUTLINE;
        ctx.fillRect(sx + 1, syBot - 4 - capH - 1, pw - 2, capH + 2);
        ctx.fillStyle = btn.pressed ? PALETTE.LAB_CYAN : PALETTE.LAB_HIGHLIGHT;
        ctx.fillRect(sx + 2, syBot - 4 - capH, pw - 4, capH);
        ctx.fillStyle = btn.pressed ? PALETTE.SNOW_BRIGHT : PALETTE.LAB_STEEL;
        ctx.fillRect(sx + 3, syBot - 4 - capH, pw - 6, 1);
      }
    }
  }

  // ==========================================================================
  // 3. Laboratory Lasers (Emitters + Flickering Beam Core + Endpoint Flares)
  // ==========================================================================

  renderLasers(
    ctx: CanvasRenderingContext2D,
    state: SimState,
    camX: number,
    camY: number,
    animClock: number
  ): void {
    const lasers = state.lasers;
    for (let i = 0; i < lasers.length; i++) {
      const l = lasers[i];
      const x1 = toScreenX(l.x1, camX);
      const y1 = toScreenY(l.y1, camY);
      const x2 = toScreenX(l.x2, camX);
      const y2 = toScreenY(l.y2, camY);

      if (
        Math.max(x1, x2) < -24 ||
        Math.min(x1, x2) > W + 24 ||
        Math.max(y1, y2) < -24 ||
        Math.min(y1, y2) > H + 24
      ) {
        continue;
      }

      if (l.active) {
        const flicker = Math.sin(animClock * 32 + i * 2.7);
        const cyanFlash = flicker > 0.55;
        const outerW = flicker > 0 ? 6 : 5;

        // Soft glowing outer plasma sheath
        ctx.globalAlpha = 0.34;
        drawPixelLine(ctx, x1, y1, x2, y2, cyanFlash ? PALETTE.LAB_CYAN : PALETTE.KRUNKED_SCARF, outerW);
        ctx.globalAlpha = 1;

        // Bright crimson/cyan flickering beam core
        drawPixelLine(ctx, x1, y1, x2, y2, cyanFlash ? PALETTE.LAB_CYAN : PALETTE.KRUNKED_SCARF, 3);
        drawPixelLine(ctx, x1, y1, x2, y2, PALETTE.SNOW_BRIGHT, 1);

        // Endpoint impact flares crackling at both ends
        const flareR = 4 + (Math.floor(animClock * 20 + i) & 1) * 2;
        this.drawImpactFlare(ctx, x1, y1, flareR, cyanFlash ? PALETTE.LAB_CYAN : PALETTE.KRUNKED_SCARF);
        this.drawImpactFlare(ctx, x2, y2, flareR, cyanFlash ? PALETTE.LAB_CYAN : PALETTE.KRUNKED_SCARF);
      }

      // Steel emitter housings at both endpoints
      this.drawLaserEmitter(ctx, x1, y1, l.active);
      this.drawLaserEmitter(ctx, x2, y2, l.active);
    }
  }

  private drawLaserEmitter(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    active: boolean
  ): void {
    drawPixelBox(ctx, x - 4, y - 4, 8, 8, PALETTE.LAB_STEEL, PALETTE.OUTLINE, PALETTE.LAB_HIGHLIGHT);
    ctx.fillStyle = PALETTE.LAB_DEEP;
    ctx.fillRect(x - 2, y - 2, 4, 4);
    ctx.fillStyle = active ? PALETTE.KRUNKED_SCARF : PALETTE.LAB_WALL;
    ctx.fillRect(x - 1, y - 1, 2, 2);
    if (active) {
      ctx.fillStyle = PALETTE.LAB_AMBER;
      ctx.fillRect(x - 3, y - 3, 1, 1);
      ctx.fillRect(x + 2, y + 2, 1, 1);
    }
  }

  private drawImpactFlare(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    color: string
  ): void {
    ctx.fillStyle = color;
    ctx.fillRect(x - r, y - 1, r * 2 + 1, 2);
    ctx.fillRect(x - 1, y - r, 2, r * 2 + 1);
    ctx.fillStyle = PALETTE.SNOW_BRIGHT;
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }

  // ==========================================================================
  // 4. Laboratory Tronchos (Telescoping Hydraulic Shaft + Caution Piston + Pads)
  // ==========================================================================

  renderTronchos(
    ctx: CanvasRenderingContext2D,
    state: SimState,
    atlas: ProceduralPixelAtlas,
    alpha: number,
    camX: number,
    camY: number,
    animClock: number
  ): void {
    const tronchos = state.tronchos;
    const tile = atlas.tronchoTile;

    for (let i = 0; i < tronchos.length; i++) {
      const tr = tronchos[i];
      const tx = lerp(tr.prevX, tr.x, alpha);
      const ty = lerp(tr.prevY, tr.y, alpha);

      const baseCx = toScreenX(tr.baseX + tr.w * 0.5, camX);
      const baseCy = toScreenY(tr.baseY + tr.h * 0.5, camY);
      const headCx = toScreenX(tx + tr.w * 0.5, camX);
      const headCy = toScreenY(ty + tr.h * 0.5, camY);
      const sx = toScreenX(tx, camX);
      const syTop = toScreenY(ty + tr.h, camY);
      const pw = Math.max(PPU, Math.round(tr.w * PPU));
      const ph = Math.max(PPU, Math.round(tr.h * PPU));

      if (
        Math.max(baseCx, sx + pw) < -24 ||
        Math.min(baseCx, sx) > W + 24 ||
        Math.max(baseCy, syTop + ph) < -24 ||
        Math.min(baseCy, syTop) > H + 24
      ) {
        continue;
      }

      // 1. Anchored steel hydraulic base flange
      drawPixelBox(ctx, baseCx - 7, baseCy - 4, 14, 8, PALETTE.LAB_WALL, PALETTE.OUTLINE, PALETTE.LAB_STEEL);
      ctx.fillStyle = PALETTE.LAB_AMBER;
      ctx.fillRect(baseCx - 5, baseCy - 1, 2, 2);
      ctx.fillRect(baseCx + 3, baseCy - 1, 2, 2);

      // 2. Two-stage telescoping hydraulic shaft (base -> mid outer cylinder -> inner chrome rod)
      const midX = Math.round((baseCx + headCx) * 0.5);
      const midY = Math.round((baseCy + headCy) * 0.5);
      // Outer cylinder
      drawPixelLine(ctx, baseCx, baseCy, midX, midY, PALETTE.OUTLINE, 8);
      drawPixelLine(ctx, baseCx, baseCy, midX, midY, PALETTE.LAB_STEEL, 6);
      drawPixelLine(ctx, baseCx - 1, baseCy, midX - 1, midY, PALETTE.LAB_HIGHLIGHT, 1);
      // Inner telescoping chrome piston rod
      drawPixelLine(ctx, midX, midY, headCx, headCy, PALETTE.OUTLINE, 6);
      drawPixelLine(ctx, midX, midY, headCx, headCy, PALETTE.LAB_HIGHLIGHT, 4);
      drawPixelLine(ctx, midX - 1, midY, headCx - 1, headCy, PALETTE.SNOW_BRIGHT, 1);

      // Glowing cyan hydraulic collar ring at telescope seam
      const activeGlow = tr.extended || Math.abs(tr.vx) + Math.abs(tr.vy) > 0.2;
      ctx.fillStyle = PALETTE.OUTLINE;
      ctx.fillRect(midX - 5, midY - 2, 10, 4);
      ctx.fillStyle = activeGlow ? PALETTE.LAB_CYAN : PALETTE.LAB_STEEL;
      ctx.fillRect(midX - 4, midY - 1, 8, 2);

      // 3. Caution-striped piston head block
      const cols = Math.max(1, Math.round(tr.w));
      const rows = Math.max(1, Math.round(tr.h));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          ctx.drawImage(
            tile.sheet,
            tile.x,
            tile.y,
            tile.w,
            tile.h,
            sx + c * PPU,
            syTop + r * PPU,
            PPU,
            PPU
          );
        }
      }

      // Continuous caution header bar & glowing launch chevron if launchImpulse > 0
      if (tr.launchImpulse > 0) {
        const upPulse = Math.floor(animClock * 8) & 1;
        ctx.fillStyle = upPulse ? PALETTE.SNOW_BRIGHT : PALETTE.LAB_AMBER;
        ctx.fillRect(headCx - 1, syTop + 2, 2, 1);
        ctx.fillRect(headCx - 2, syTop + 3, 4, 1);
      }

      // 4. Glowing cyan side grab pads when grabbable!
      if (tr.grabbable) {
        const pulse = 0.72 + 0.28 * Math.sin(animClock * 7 + i);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = PALETTE.LAB_CYAN;
        ctx.fillRect(sx, syTop + 3, 2, Math.max(4, ph - 6));
        ctx.fillRect(sx + pw - 2, syTop + 3, 2, Math.max(4, ph - 6));
        ctx.fillStyle = PALETTE.SNOW_BRIGHT;
        for (let py = syTop + 4; py < syTop + ph - 4; py += 4) {
          ctx.fillRect(sx, py, 1, 2);
          ctx.fillRect(sx + pw - 1, py, 1, 2);
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  // ==========================================================================
  // 5. ColorPlatforms (Crimson Krunked 'K' & Emerald Fred 'F', Active/Dashed)
  // ==========================================================================

  renderColorPlatforms(
    ctx: CanvasRenderingContext2D,
    state: SimState,
    camX: number,
    camY: number,
    animClock: number
  ): void {
    const platforms = state.colorPlatforms;
    for (let i = 0; i < platforms.length; i++) {
      const cp = platforms[i];
      const sx = toScreenX(cp.x, camX);
      const syTop = toScreenY(cp.y + cp.h, camY);
      const pw = Math.max(PPU, Math.round(cp.w * PPU));
      const ph = Math.max(10, Math.round(cp.h * PPU));

      if (sx + pw < -12 || sx > W + 12 || syTop + ph < -12 || syTop > H + 12) continue;

      const isKrunked = cp.owner === 'krunked';
      const mainCol = isKrunked ? PALETTE.LAB_KRUNKED : PALETTE.LAB_FRED;
      const darkCol = isKrunked ? PALETTE.KRUNKED_SCARF_DARK : PALETTE.FRED_SCARF_DARK;
      const crest = isKrunked ? 'K' : 'F';
      const centerX = sx + (pw >> 1);
      const centerY = syTop + ((ph - 7) >> 1);

      if (cp.active) {
        // Powered solid energy platform with subtle harmonic glow pulse
        drawPixelBox(ctx, sx, syTop, pw, ph, darkCol, PALETTE.OUTLINE, PALETTE.SNOW_BRIGHT);
        ctx.fillStyle = mainCol;
        ctx.fillRect(sx + 2, syTop + 2, pw - 4, ph - 4);

        const pulse = 0.22 + 0.16 * Math.sin(animClock * 5 + i);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = PALETTE.SNOW_BRIGHT;
        ctx.fillRect(sx + 2, syTop + 2, pw - 4, 2);
        ctx.globalAlpha = 1;

        // Centered K / F owner crest
        drawPixelText(ctx, crest, centerX, centerY, {
          align: 'center',
          color: PALETTE.SNOW_BRIGHT,
          outlineColor: PALETTE.OUTLINE,
        });
      } else {
        // Inactive phased-out platform: translucent core + dashed pixel outline!
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = darkCol;
        ctx.fillRect(sx + 1, syTop + 1, pw - 2, ph - 2);
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = mainCol;
        for (let dx = 0; dx < pw; dx += 6) {
          const seg = Math.min(4, pw - dx);
          ctx.fillRect(sx + dx, syTop, seg, 1);
          ctx.fillRect(sx + dx, syTop + ph - 1, seg, 1);
        }
        for (let dy = 0; dy < ph; dy += 6) {
          const seg = Math.min(4, ph - dy);
          ctx.fillRect(sx, syTop + dy, 1, seg);
          ctx.fillRect(sx + pw - 1, syTop + dy, 1, seg);
        }
        ctx.globalAlpha = 0.55;
        drawPixelText(ctx, crest, centerX, centerY, {
          align: 'center',
          color: mainCol,
          outlineColor: null,
        });
        ctx.globalAlpha = 1;
      }
    }
  }

  // ==========================================================================
  // 6. Bachicha 4-Chain Boss Arena (Monumental Mechanical-Yeti Golem + 4 Chains)
  // ==========================================================================

  private getChainSocketX(id: BossChainState['id']): number {
    switch (id) {
      case 'left_arm':
        return -36;
      case 'right_arm':
        return 36;
      case 'left_leg':
        return -22;
      case 'right_leg':
        return 22;
    }
  }

  private getChainSocketY(id: BossChainState['id']): number {
    return id === 'left_arm' || id === 'right_arm' ? -4 : 28;
  }

  renderBossBackdrop(
    ctx: CanvasRenderingContext2D,
    state: SimState,
    level: LevelData,
    camX: number,
    camY: number,
    animClock: number
  ): void {
    const arena = level.bossArena;
    if (!arena) return;

    const bossWorldX = (arena.minX + arena.maxX) * 0.5;
    const bossWorldY = arena.minY + (arena.maxY - arena.minY) * 0.54;

    const sx = toScreenX(bossWorldX, camX);
    const sy = toScreenY(bossWorldY, camY);
    if (sx < -140 || sx > W + 140 || sy < -140 || sy > H + 140) return;

    const boss = state.boss;
    const defeated = boss.defeated;
    const active = boss.active;

    let intactCount = 0;
    for (let i = 0; i < boss.chains.length; i++) {
      if (!boss.chains[i].broken) intactCount++;
    }
    const fury = active && !defeated ? (4 - intactCount) * 0.35 : 0;

    // 1. Reactor chamber halo behind Bachicha
    ctx.globalAlpha = defeated ? 0.28 : active ? 0.25 + 0.1 * Math.sin(animClock * (4 + fury * 4)) : 0.14;
    ctx.fillStyle = defeated ? PALETTE.PINE_MOSS : active ? PALETTE.KRUNKED_SCARF : PALETTE.LAB_CYAN;
    ctx.fillRect(sx - 54, sy - 48, 108, 96);
    ctx.globalAlpha = 1;

    // 2. Monumental Bachicha mechanical-yeti/golem chassis
    const bob = defeated
      ? Math.round(Math.sin(animClock * 4.5) * 2) + 4
      : Math.round(Math.sin(animClock * (2.6 + fury * 2.5)) * (active ? 3 : 1));
    const bx = sx - 48;
    const by = sy - 44 + bob;

    // Freed celebratory waving mechanical arms on defeat!
    if (defeated) {
      const wave = Math.round(Math.sin(animClock * 7) * 5);
      drawPixelLine(ctx, sx - 32, sy - 6 + bob, sx - 52, sy - 26 + bob + wave, PALETTE.OUTLINE, 10);
      drawPixelLine(ctx, sx - 32, sy - 6 + bob, sx - 52, sy - 26 + bob + wave, PALETTE.LAB_STEEL, 6);
      drawPixelLine(ctx, sx + 32, sy - 6 + bob, sx + 52, sy - 26 + bob - wave, PALETTE.OUTLINE, 10);
      drawPixelLine(ctx, sx + 32, sy - 6 + bob, sx + 52, sy - 26 + bob - wave, PALETTE.LAB_STEEL, 6);
    }

    ctx.drawImage(this.bossBodyCanvas, bx, by);

    // 3. Reactive glowing visor eyes
    const visorX = sx - 16;
    const visorY = sy - 24 + bob;
    ctx.fillStyle = PALETTE.LAB_DEEP;
    ctx.fillRect(visorX, visorY, 32, 10);

    if (defeated) {
      // Serene happy emerald ^ ^ eyes!
      ctx.fillStyle = PALETTE.PINE_MOSS;
      ctx.fillRect(visorX + 4, visorY + 5, 8, 2);
      ctx.fillRect(visorX + 6, visorY + 3, 4, 2);
      ctx.fillRect(visorX + 20, visorY + 5, 8, 2);
      ctx.fillRect(visorX + 22, visorY + 3, 4, 2);
    } else if (active) {
      const eyeTrackX = Math.round(Math.cos(boss.laserSweepAngle) * 5);
      const eyeCol = boss.attackTimer > 0 ? PALETTE.SNOW_BRIGHT : PALETTE.KRUNKED_SCARF;
      ctx.fillStyle = PALETTE.KRUNKED_SCARF;
      ctx.fillRect(visorX + 2, visorY + 2, 28, 6);
      ctx.fillStyle = eyeCol;
      ctx.fillRect(visorX + 12 + eyeTrackX, visorY + 2, 8, 6);
      ctx.fillStyle = PALETTE.LAB_AMBER;
      ctx.fillRect(visorX + 14 + eyeTrackX, visorY + 3, 4, 4);
    } else {
      // Dormant cyan standby eyes
      ctx.fillStyle = PALETTE.LAB_CYAN;
      ctx.fillRect(visorX + 6, visorY + 4, 6, 2);
      ctx.fillRect(visorX + 20, visorY + 4, 6, 2);
    }

    // 4. Chest reactor core (pulses faster as chains break, turns calm cyan/emerald on defeat)
    const corePulse = Math.sin(animClock * (5 + fury * 6)) > 0;
    const coreCol = defeated
      ? PALETTE.PINE_MOSS
      : active
        ? corePulse
          ? PALETTE.LAB_AMBER
          : PALETTE.KRUNKED_SCARF
        : PALETTE.LAB_CYAN;
    ctx.fillStyle = PALETTE.OUTLINE;
    ctx.fillRect(sx - 10, sy - 4 + bob, 20, 14);
    ctx.fillStyle = coreCol;
    ctx.fillRect(sx - 8, sy - 2 + bob, 16, 10);
    ctx.fillStyle = PALETTE.SNOW_BRIGHT;
    ctx.fillRect(sx - 4, sy + 1 + bob, 8, 4);

    // 5. Four Heavy Animated Pixel Iron Chains & Arena Anchor Pillars
    const activePhaseTarget =
      active && !defeated && boss.phaseIndex < boss.phaseOrder.length
        ? boss.phaseOrder[boss.phaseIndex]
        : -1;

    for (let i = 0; i < boss.chains.length; i++) {
      const ch = boss.chains[i];
      const ax = sx + this.getChainSocketX(ch.id);
      const ay = sy + this.getChainSocketY(ch.id) + bob;
      const px = toScreenX(ch.x, camX);
      const py = toScreenY(ch.y, camY);
      const isCurrentTarget = i === activePhaseTarget;

      // Anchor pillar pylon
      drawPixelBox(
        ctx,
        px - 6,
        py - 8,
        12,
        14,
        PALETTE.LAB_WALL,
        PALETTE.OUTLINE,
        isCurrentTarget ? PALETTE.LAB_AMBER : PALETTE.LAB_STEEL
      );
      ctx.fillStyle = ch.broken
        ? PALETTE.LAB_DEEP
        : isCurrentTarget
          ? PALETTE.LAB_AMBER
          : PALETTE.LAB_CYAN;
      ctx.fillRect(px - 2, py - 4, 4, 4);

      // Pulsing target arrow over the active chain release pillar!
      if (isCurrentTarget && !ch.broken) {
        const arrowBob = Math.round(Math.sin(animClock * 9) * 2);
        ctx.fillStyle = PALETTE.LAB_AMBER;
        ctx.fillRect(px - 4, py - 18 + arrowBob, 9, 2);
        ctx.fillRect(px - 2, py - 16 + arrowBob, 5, 2);
        ctx.fillRect(px, py - 14 + arrowBob, 1, 2);
      }

      if (!ch.broken) {
        // Heavy animated pixel iron chain from Bachicha's limb socket to anchor pillar!
        const strain = active ? Math.sin(animClock * (14 + i * 3)) * 1.4 : 0;
        const steps = 11;
        for (let s = 0; s < steps; s++) {
          const t0 = s / steps;
          const t1 = (s + 1) / steps;
          const sag0 = Math.sin(t0 * Math.PI) * (5 + strain);
          const sag1 = Math.sin(t1 * Math.PI) * (5 + strain);
          const lx0 = Math.round(ax + (px - ax) * t0);
          const ly0 = Math.round(ay + (py - ay) * t0 + sag0);
          const lx1 = Math.round(ax + (px - ax) * t1);
          const ly1 = Math.round(ay + (py - ay) * t1 + sag1);

          drawPixelLine(ctx, lx0, ly0, lx1, ly1, PALETTE.OUTLINE, 5);
          drawPixelLine(
            ctx,
            lx0,
            ly0,
            lx1,
            ly1,
            (s & 1) === 0 ? PALETTE.LAB_HIGHLIGHT : PALETTE.LAB_STEEL,
            3
          );
          if ((s & 1) === 0) {
            ctx.fillStyle = PALETTE.SNOW_BRIGHT;
            ctx.fillRect(lx0 - 1, ly0 - 1, 1, 1);
          }
        }
      } else {
        // Broken dangling chain stub swaying from Bachicha's limb socket!
        const sway = Math.round(Math.sin(animClock * 4.2 + i * 1.7) * 4);
        const stubEndX = ax + sway;
        const stubEndY = ay + 15;
        drawPixelLine(ctx, ax, ay, stubEndX, stubEndY, PALETTE.OUTLINE, 5);
        drawPixelLine(ctx, ax, ay, stubEndX, stubEndY, PALETTE.LAB_STEEL, 3);
        ctx.fillStyle = PALETTE.LAB_HIGHLIGHT;
        ctx.fillRect(ax - 1, ay + 4, 2, 2);
        ctx.fillRect(stubEndX - 1, stubEndY - 2, 2, 2);

        // Short shattered chain stub on anchor pillar
        drawPixelLine(ctx, px, py - 2, px + (ax < px ? -6 : 6), py + 4, PALETTE.OUTLINE, 4);
        drawPixelLine(ctx, px, py - 2, px + (ax < px ? -6 : 6), py + 4, PALETTE.LAB_STEEL, 2);
      }
    }

    // 6. Celebratory freed sparkles & steam puffs on defeat!
    if (defeated) {
      for (let k = 0; k < 4; k++) {
        const ang = animClock * 2.2 + k * (Math.PI * 0.5);
        const spX = sx + Math.round(Math.cos(ang) * 44);
        const spY = sy - 10 + Math.round(Math.sin(ang) * 26);
        ctx.fillStyle = k % 2 === 0 ? PALETTE.LAB_AMBER : PALETTE.PINE_MOSS;
        ctx.fillRect(spX - 2, spY, 5, 1);
        ctx.fillRect(spX, spY - 2, 1, 5);
      }
    }
  }

  /**
   * Draws Bachicha's sweeping warning sightline & plasma laser beam OVER terrain
   * so players have unmistakable visual telegraphing and impact!
   */
  renderBossForeground(
    ctx: CanvasRenderingContext2D,
    state: SimState,
    level: LevelData,
    camX: number,
    camY: number,
    animClock: number
  ): void {
    const boss = state.boss;
    const arena = level.bossArena;
    if (!boss.active || boss.defeated || !arena) return;

    const bossWorldX = (arena.minX + arena.maxX) * 0.5;
    const bossWorldY = arena.minY + (arena.maxY - arena.minY) * 0.54;

    const sx = toScreenX(bossWorldX, camX);
    const sy = toScreenY(bossWorldY, camY) - 19;
    if (sx < -200 || sx > W + 200 || sy < -200 || sy > H + 200) return;

    const rad = boss.laserSweepAngle;
    const beamLen = 280;
    const ex = sx + Math.round(Math.cos(rad) * beamLen);
    const ey = sy - Math.round(Math.sin(rad) * beamLen);

    if (boss.attackTimer > 0.35) {
      // Full high-energy sweeping crimson/cyan plasma laser!
      const flicker = (Math.floor(animClock * 26) & 1) === 0;
      ctx.globalAlpha = 0.38;
      drawPixelLine(ctx, sx, sy, ex, ey, PALETTE.KRUNKED_SCARF, 8);
      ctx.globalAlpha = 1;
      drawPixelLine(ctx, sx, sy, ex, ey, flicker ? PALETTE.KRUNKED_SCARF : PALETTE.LAB_CYAN, 4);
      drawPixelLine(ctx, sx, sy, ex, ey, PALETTE.SNOW_BRIGHT, 2);
      this.drawImpactFlare(ctx, sx, sy, 7, PALETTE.LAB_AMBER);
    } else if (boss.attackTimer > 0) {
      // Telegraphing warning sightline right before laser surge
      const blink = (Math.floor(animClock * 18) & 1) === 0;
      ctx.globalAlpha = blink ? 0.7 : 0.35;
      drawPixelLine(ctx, sx, sy, ex, ey, PALETTE.LAB_AMBER, 1);
      ctx.globalAlpha = 1;
      this.drawImpactFlare(ctx, sx, sy, 4, PALETTE.LAB_AMBER);
    }
  }

  /**
   * Compact pixel Boss Chain status HUD rendered when Bachicha battle is active.
   */
  renderBossHud(ctx: CanvasRenderingContext2D, state: SimState, animClock: number): void {
    const boss = state.boss;
    if (!boss.active || boss.defeated || boss.chains.length === 0) return;

    const boxW = 136;
    const bx = Math.round(HALF_W - boxW * 0.5);
    const by = 24;
    drawPixelBox(ctx, bx, by, boxW, 18, 'rgba(20, 30, 46, 0.9)', PALETTE.OUTLINE, PALETTE.KRUNKED_SCARF);
    drawPixelText(ctx, 'BACHICHA', bx + 6, by + 6, {
      color: PALETTE.SNOW_BRIGHT,
      outlineColor: PALETTE.OUTLINE,
    });

    const startX = bx + 66;
    for (let i = 0; i < boss.chains.length; i++) {
      const ch = boss.chains[i];
      const cx = startX + i * 16;
      const cy = by + 4;
      const isTarget =
        boss.phaseIndex < boss.phaseOrder.length && boss.phaseOrder[boss.phaseIndex] === i;
      const blink = isTarget && (Math.floor(animClock * 8) & 1) === 0;

      ctx.fillStyle = PALETTE.OUTLINE;
      ctx.fillRect(cx, cy, 12, 10);
      if (ch.broken) {
        ctx.fillStyle = PALETTE.LAB_DEEP;
        ctx.fillRect(cx + 1, cy + 1, 10, 8);
        ctx.fillStyle = PALETTE.LAB_STEEL;
        ctx.fillRect(cx + 3, cy + 4, 2, 2);
        ctx.fillRect(cx + 7, cy + 4, 2, 2);
      } else {
        ctx.fillStyle = blink ? PALETTE.SNOW_BRIGHT : isTarget ? PALETTE.LAB_AMBER : PALETTE.LAB_CYAN;
        ctx.fillRect(cx + 1, cy + 1, 10, 8);
        ctx.fillStyle = PALETTE.OUTLINE;
        ctx.fillRect(cx + 4, cy + 3, 4, 4);
      }
    }
  }

  // ==========================================================================
  // 7. World NPCs (Baby Seals, Peeking Dark Mines Moles, Cozy Village Penguins)
  // ==========================================================================

  renderWorldNpcs(
    ctx: CanvasRenderingContext2D,
    state: SimState,
    level: LevelData,
    atlas: ProceduralPixelAtlas,
    camX: number,
    camY: number,
    animClock: number
  ): void {
    const layout = this.ensureNpcLayout(level);

    // 1. Cozy Village Penguins (ambient Village Hub companions)
    for (let i = 0; i < layout.villagers.length; i++) {
      const v = layout.villagers[i];
      const sx = toScreenX(v.x, camX);
      const sy = toScreenY(v.y, camY);
      if (sx < -24 || sx > W + 24 || sy < -28 || sy > H + 28) continue;

      const frame = Math.floor(animClock * 2.2 + i * 1.3) & 1;
      const srcX = (v.variant * 2 + frame) * 20;

      if (v.facing < 0) {
        ctx.save();
        ctx.translate(sx, sy - 24);
        ctx.scale(-1, 1);
        ctx.drawImage(this.npcSheet, srcX, 24, 20, 24, -10, 0, 20, 24);
        ctx.restore();
      } else {
        ctx.drawImage(this.npcSheet, srcX, 24, 20, 24, sx - 10, sy - 24, 20, 24);
      }

      // Tiny steaming cocoa wisp above villager 0
      if (v.variant === 0) {
        const steamOff = Math.floor(animClock * 4 + i) % 3;
        ctx.fillStyle = PALETTE.SNOW_LIGHT;
        ctx.fillRect(sx + (v.facing > 0 ? 5 : -6), sy - 15 - steamOff, 1, 2);
      }
    }

    // 2. Peeking Moles in Dark Mines!
    for (let i = 0; i < layout.moles.length; i++) {
      const m = layout.moles[i];
      const sx = toScreenX(m.x, camX);
      const sy = toScreenY(m.y, camY);
      if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;

      // Shy reaction if penguin stands very close; otherwise periodic curious peek cycle
      const nearP =
        Math.hypot(state.p1.x - m.x, state.p1.y - m.y) < 1.8 ||
        (!state.jeff.active && Math.hypot(state.p2.x - m.x, state.p2.y - m.y) < 1.8);
      const cycle = (animClock * 0.55 + m.phase) % 1;
      const peekRatio = nearP ? 0.15 : cycle < 0.55 ? 1 : cycle < 0.72 ? 0.5 : 0;

      if (peekRatio > 0.05) {
        const visibleH = Math.max(4, Math.round(13 * peekRatio));
        const frame = Math.floor(animClock * 3 + i) & 1;
        ctx.drawImage(
          this.npcSheet,
          frame * 16,
          0,
          16,
          visibleH,
          sx - 8,
          sy - visibleH - 2,
          16,
          visibleH
        );
      }

      // Dirt burrow mound at base
      ctx.fillStyle = PALETTE.OUTLINE;
      ctx.fillRect(sx - 7, sy - 4, 14, 4);
      ctx.fillStyle = PALETTE.MINE_DIRT;
      ctx.fillRect(sx - 6, sy - 3, 12, 3);
      ctx.fillStyle = PALETTE.MINE_WOOD;
      ctx.fillRect(sx - 4, sy - 3, 8, 1);
    }

    // 3. Collectible Seals & World NPCs from state.collectibles
    const collectibles = state.collectibles;
    for (let i = 0; i < collectibles.length; i++) {
      const c = collectibles[i];
      if (c.kind !== 'seal' && c.kind !== 'npc') continue;

      const sx = toScreenX(c.x, camX);
      const syBase = toScreenY(c.y, camY);
      if (sx < -28 || sx > W + 28 || syBase < -28 || syBase > H + 28) continue;

      if (c.kind === 'seal') {
        if (c.collected) {
          // Rescued Baby Seal stays happily on its perch WAVING its flippers with a floating heart!
          const waveFrame = Math.floor(animClock * 6.5 + i) & 1;
          const hop = waveFrame === 1 ? -1 : 0;
          ctx.drawImage(this.npcSheet, 32 + waveFrame * 20, 0, 20, 18, sx - 10, syBase - 16 + hop, 20, 18);
          // Cute floating pixel heart!
          const heartY = syBase - 22 - Math.round((animClock * 8 + i * 3) % 5);
          ctx.fillStyle = PALETTE.KRUNKED_SCARF;
          ctx.fillRect(sx - 2, heartY, 2, 2);
          ctx.fillRect(sx + 1, heartY, 2, 2);
          ctx.fillRect(sx - 1, heartY + 1, 3, 2);
          ctx.fillRect(sx, heartY + 3, 1, 1);
        } else {
          // Unrescued bouncing Baby Seal calling out gently!
          const bob = Math.round(Math.abs(Math.sin(animClock * 4.2 + i)) * -2);
          const f = Math.floor(animClock * 3 + i) & 1;
          const rect = atlas.sealFrames[f];
          ctx.drawImage(rect.sheet, rect.x, rect.y, rect.w, rect.h, sx - 10, syBase - 14 + bob, rect.w, rect.h);
          if ((Math.floor(animClock * 2.5 + i) & 1) === 0) {
            ctx.fillStyle = PALETTE.LAB_AMBER;
            ctx.fillRect(sx - 1, syBase - 21 + bob, 2, 3);
            ctx.fillRect(sx - 1, syBase - 17 + bob, 2, 1);
          }
        }
      } else {
        // Explicit 'npc' collectible entity (Mines Mole or Village Penguin)
        if (c.zone === 'mines' || c.id.toLowerCase().includes('mole')) {
          const frame = Math.floor(animClock * 3 + i) & 1;
          ctx.drawImage(this.npcSheet, frame * 16, 0, 16, 16, sx - 8, syBase - 16, 16, 16);
        } else {
          const frame = Math.floor(animClock * 2.5 + i) & 1;
          const srcX = ((i & 1) * 2 + frame) * 20;
          ctx.drawImage(this.npcSheet, srcX, 24, 20, 24, sx - 10, syBase - 24, 20, 24);
        }
      }
    }
  }

  private ensureNpcLayout(level: LevelData): CachedNpcLayout {
    const key = `${level.id}:${level.tileList.length}`;
    if (this.npcLayout && this.npcLayout.key === key) {
      return this.npcLayout;
    }

    const moles: CachedMoleSpot[] = [];
    const villagers: CachedVillagerSpot[] = [];

    // 1. Place cozy Village Penguins in Village Hub (safe exposed SNOW floor near spawn/signs)
    if (level.mode !== 'lab_dlc' && level.mode !== 'time_trial') {
      const candidates = [level.spawnP1.x - 10.5, level.spawnP1.x - 3.2];
      for (let i = 0; i < candidates.length; i++) {
        const tx = Math.floor(candidates[i]);
        const ground = level.tiles.get(`${tx},0`);
        if (ground && (ground.mask & 1) === 0 && !level.tiles.has(`${tx},1`)) {
          villagers.push({
            x: tx + 0.5,
            y: 1.0,
            variant: (i & 1) as 0 | 1,
            facing: i === 0 ? 1 : -1,
          });
        }
      }
    }

    // 2. Place peeking Moles on exposed DIRT surfaces inside Dark Mines!
    for (let i = 0; i < level.tileList.length; i++) {
      const c = level.tileList[i];
      if (c.terrain !== 'DIRT' || c.kind !== 'SOLID' || (c.mask & 1) !== 0) continue;
      if (c.ty < WORLD.ZONE2_START_Y || c.ty > WORLD.ZONE2_END_Y) continue;
      if (level.tiles.has(`${c.tx},${c.ty + 1}`)) continue;
      const h = hashInt(c.tx * 733 + c.ty * 197);
      if (h % 13 !== 0) continue;
      // Keep moles spaced apart
      let tooClose = false;
      for (let m = 0; m < moles.length; m++) {
        if (Math.hypot(moles[m].x - (c.tx + 0.5), moles[m].y - (c.ty + 1)) < 7.5) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose && moles.length < 14) {
        moles.push({
          x: c.tx + 0.5,
          y: c.ty + 1.0,
          phase: (h % 100) * 0.01,
        });
      }
    }

    this.npcLayout = { key, moles, villagers };
    return this.npcLayout;
  }

  // ==========================================================================
  // One-Time Pre-Baked Pixel Art (Bachicha Chassis, Moles, Seals, Villagers)
  // ==========================================================================

  private bakeBachichaChassis(ctx: CanvasRenderingContext2D): void {
    // 96x88 monumental mechanical-yeti / iron-golem centerpiece
    const cx = 48;

    // Heavy armored legs & snow-crushing boots
    drawPixelBox(ctx, cx - 28, 60, 18, 24, PALETTE.LAB_STEEL, PALETTE.OUTLINE, PALETTE.LAB_HIGHLIGHT);
    drawPixelBox(ctx, cx + 10, 60, 18, 24, PALETTE.LAB_STEEL, PALETTE.OUTLINE, PALETTE.LAB_HIGHLIGHT);
    ctx.fillStyle = PALETTE.LAB_WALL;
    ctx.fillRect(cx - 25, 68, 12, 12);
    ctx.fillRect(cx + 13, 68, 12, 12);

    // Massive frost-furred armored torso
    drawPixelBox(ctx, cx - 32, 24, 64, 42, PALETTE.LAB_WALL, PALETTE.OUTLINE, PALETTE.LAB_HIGHLIGHT);
    // Yeti shaggy white-blue frost fur collar across broad shoulders
    ctx.fillStyle = PALETTE.SNOW_LIGHT;
    ctx.fillRect(cx - 34, 24, 68, 10);
    ctx.fillStyle = PALETTE.SNOW_BRIGHT;
    ctx.fillRect(cx - 32, 23, 64, 5);
    // Shaggy jagged fur fringe teeth
    for (let x = cx - 30; x <= cx + 26; x += 6) {
      ctx.fillStyle = PALETTE.SNOW_LIGHT;
      ctx.fillRect(x, 34, 4, 3);
      ctx.fillStyle = PALETTE.OUTLINE;
      ctx.fillRect(x, 37, 4, 1);
    }

    // Armored shoulder pauldrons with bolts & amber vent slits
    drawPixelBox(ctx, cx - 44, 22, 16, 22, PALETTE.LAB_STEEL, PALETTE.OUTLINE, PALETTE.SNOW_LIGHT);
    drawPixelBox(ctx, cx + 28, 22, 16, 22, PALETTE.LAB_STEEL, PALETTE.OUTLINE, PALETTE.SNOW_LIGHT);
    ctx.fillStyle = PALETTE.LAB_AMBER;
    ctx.fillRect(cx - 40, 28, 8, 2);
    ctx.fillRect(cx - 40, 33, 8, 2);
    ctx.fillRect(cx + 32, 28, 8, 2);
    ctx.fillRect(cx + 32, 33, 8, 2);

    // Heavy gauntlets at chain-attachment sockets (left_arm / right_arm)
    drawPixelBox(ctx, cx - 42, 42, 14, 16, PALETTE.LAB_WALL, PALETTE.OUTLINE, PALETTE.LAB_STEEL);
    drawPixelBox(ctx, cx + 28, 42, 14, 16, PALETTE.LAB_WALL, PALETTE.OUTLINE, PALETTE.LAB_STEEL);
    ctx.fillStyle = PALETTE.LAB_HIGHLIGHT;
    ctx.fillRect(cx - 39, 54, 2, 4);
    ctx.fillRect(cx - 34, 54, 2, 4);
    ctx.fillRect(cx + 31, 54, 2, 4);
    ctx.fillRect(cx + 36, 54, 2, 4);

    // Horned mechanical-yeti head & brow plate
    drawPixelBox(ctx, cx - 22, 8, 44, 26, PALETTE.LAB_STEEL, PALETTE.OUTLINE, PALETTE.SNOW_BRIGHT);
    // Curved steel yeti horns on left & right of skull
    ctx.fillStyle = PALETTE.OUTLINE;
    ctx.fillRect(cx - 30, 5, 9, 10);
    ctx.fillRect(cx + 21, 5, 9, 10);
    ctx.fillStyle = PALETTE.SNOW_LIGHT;
    ctx.fillRect(cx - 29, 6, 7, 7);
    ctx.fillRect(cx + 22, 6, 7, 7);
    ctx.fillStyle = PALETTE.SNOW_BRIGHT;
    ctx.fillRect(cx - 28, 6, 4, 4);
    ctx.fillRect(cx + 24, 6, 4, 4);

    // Armored chin grill
    ctx.fillStyle = PALETTE.LAB_DEEP;
    ctx.fillRect(cx - 12, 30, 24, 4);
    ctx.fillStyle = PALETTE.LAB_HIGHLIGHT;
    for (let x = cx - 10; x <= cx + 8; x += 4) {
      ctx.fillRect(x, 30, 2, 3);
    }

    // Chest chassis ribs flanking central reactor socket
    ctx.fillStyle = PALETTE.LAB_STEEL;
    ctx.fillRect(cx - 26, 42, 12, 14);
    ctx.fillRect(cx + 14, 42, 12, 14);
    ctx.fillStyle = PALETTE.LAB_HIGHLIGHT;
    ctx.fillRect(cx - 24, 44, 8, 2);
    ctx.fillRect(cx - 24, 50, 8, 2);
    ctx.fillRect(cx + 16, 44, 8, 2);
    ctx.fillRect(cx + 16, 50, 8, 2);
  }

  private bakeMole(ctx: CanvasRenderingContext2D, ox: number, oy: number, frame: number): void {
    // 16x16 adorable Dark Mines peeking mole wearing a miner helmet!
    ctx.fillStyle = PALETTE.OUTLINE;
    ctx.fillRect(ox + 3, oy + 4, 10, 11);
    ctx.fillRect(ox + 4, oy + 2, 8, 3);

    // Soft brown mole fur
    ctx.fillStyle = PALETTE.MINE_DIRT;
    ctx.fillRect(ox + 4, oy + 6, 8, 8);
    ctx.fillStyle = PALETTE.BEAK_MID;
    ctx.fillRect(ox + 5, oy + 7, 6, 6);

    // Yellow miner helmet + headlamp dot
    ctx.fillStyle = PALETTE.LAB_AMBER;
    ctx.fillRect(ox + 4, oy + 3, 8, 3);
    ctx.fillStyle = PALETTE.SNOW_BRIGHT;
    ctx.fillRect(ox + 7, oy + 3, 2, 2);

    // Eyes & pink snout (glances slightly left/right by frame)
    const look = frame === 1 ? 1 : 0;
    ctx.fillStyle = PALETTE.OUTLINE;
    ctx.fillRect(ox + 5 + look, oy + 8, 1, 2);
    ctx.fillRect(ox + 9 + look, oy + 8, 1, 2);
    ctx.fillStyle = '#ec7c98';
    ctx.fillRect(ox + 7 + look, oy + 10, 2, 2);

    // Little digging paws on rim
    ctx.fillStyle = '#ec7c98';
    ctx.fillRect(ox + 3, oy + 12, 2, 2);
    ctx.fillRect(ox + 11, oy + 12, 2, 2);
  }

  private bakeRescuedSeal(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    frame: number
  ): void {
    // 20x18 happy rescued baby seal waving both flippers!
    const up = frame === 1 ? -3 : 0;
    ctx.fillStyle = PALETTE.OUTLINE;
    ctx.fillRect(ox + 3, oy + 8, 14, 8);
    ctx.fillRect(ox + 7, oy + 3, 9, 7);

    // Plump snow-white seal body & head
    ctx.fillStyle = PALETTE.SNOW_LIGHT;
    ctx.fillRect(ox + 4, oy + 9, 12, 6);
    ctx.fillStyle = PALETTE.SNOW_BRIGHT;
    ctx.fillRect(ox + 5, oy + 9, 10, 4);
    ctx.fillRect(ox + 8, oy + 4, 7, 6);

    // Waving flippers!
    ctx.fillStyle = PALETTE.OUTLINE;
    ctx.fillRect(ox + 1, oy + 8 + up, 4, 4);
    ctx.fillRect(ox + 15, oy + 8 + up, 4, 4);
    ctx.fillStyle = PALETTE.ROPE_BASE;
    ctx.fillRect(ox + 2, oy + 9 + up, 2, 2);
    ctx.fillRect(ox + 16, oy + 9 + up, 2, 2);

    // Joyful ^ ^ eyes & rosy cheeks
    ctx.fillStyle = PALETTE.OUTLINE;
    ctx.fillRect(ox + 10, oy + 6, 1, 1);
    ctx.fillRect(ox + 13, oy + 6, 1, 1);
    ctx.fillRect(ox + 11, oy + 8, 2, 1);
    ctx.fillStyle = '#ec7c98';
    ctx.fillRect(ox + 9, oy + 7, 1, 1);
    ctx.fillRect(ox + 14, oy + 7, 1, 1);
  }

  private bakeVillager(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    variant: 0 | 1,
    frame: number
  ): void {
    // 20x24 cozy scarfed Village Penguin (variant 0: amber beanie + hot cocoa, variant 1: blue pom-hat waving)
    const bob = frame === 1 ? 1 : 0;
    const scarf = variant === 0 ? PALETTE.LAB_AMBER : PALETTE.CLIFF_MID;
    const hatCol = variant === 0 ? PALETTE.BEAK_BRIGHT : PALETTE.ICE_MID;

    // Outline
    ctx.fillStyle = PALETTE.OUTLINE;
    ctx.fillRect(ox + 5, oy + 10 + bob, 10, 12);
    ctx.fillRect(ox + 6, oy + 5 + bob, 8, 6);

    // Body & cozy white belly
    ctx.fillStyle = PALETTE.BODY_MAIN;
    ctx.fillRect(ox + 6, oy + 11 + bob, 8, 10);
    ctx.fillRect(ox + 7, oy + 6 + bob, 6, 6);
    ctx.fillStyle = PALETTE.BELLY_WHITE;
    ctx.fillRect(ox + 8, oy + 13 + bob, 5, 7);
    ctx.fillRect(ox + 9, oy + 7 + bob, 4, 4);

    // Cozy knitted winter beanie + white pom-pom
    ctx.fillStyle = PALETTE.OUTLINE;
    ctx.fillRect(ox + 6, oy + 2 + bob, 8, 4);
    ctx.fillStyle = hatCol;
    ctx.fillRect(ox + 7, oy + 3 + bob, 6, 3);
    ctx.fillStyle = PALETTE.SNOW_BRIGHT;
    ctx.fillRect(ox + 9, oy + 1 + bob, 2, 2);

    // Scarf
    ctx.fillStyle = scarf;
    ctx.fillRect(ox + 6, oy + 11 + bob, 8, 2);
    ctx.fillRect(ox + 4, oy + 12 + bob, 2, 3);

    // Eye, beak & feet
    ctx.fillStyle = PALETTE.OUTLINE;
    ctx.fillRect(ox + 11, oy + 8 + bob, 1, 2);
    ctx.fillStyle = PALETTE.BEAK_BRIGHT;
    ctx.fillRect(ox + 13, oy + 9 + bob, 3, 2);
    ctx.fillRect(ox + 6, oy + 21, 3, 2);
    ctx.fillRect(ox + 11, oy + 21, 3, 2);

    if (variant === 0) {
      // Holding a warm crimson cocoa mug
      ctx.fillStyle = PALETTE.KRUNKED_SCARF;
      ctx.fillRect(ox + 14, oy + 14 + bob, 3, 3);
    } else {
      // Waving flipper cheerily
      const armY = frame === 1 ? -3 : 0;
      ctx.fillStyle = PALETTE.BODY_MAIN;
      ctx.fillRect(ox + 14, oy + 12 + bob + armY, 3, 3);
    }
  }
}
