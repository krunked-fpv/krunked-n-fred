// ============================================================================
// Krunked & Fred — Procedural Pixel Collectible Art & Skin Closet Previews
// Lazily bakes & caches crisp nearest-neighbor pixel-art PNG data URLs for:
//   - All 12 Polaroid Photos (96x72 native illustrations)
//   - All 7 Climber Field Manual Diagrams (120x64 native diagrams)
//   - All 16 Co-Op Skins, 6 Jeff Skins, and 12 Rope Skin Previews
// 100% clean-room Krunked & Fred palette & SSR-safe guards.
// ============================================================================

import {
  MANUAL_PAGE_IDS,
  PALETTE,
  PHOTO_IDS,
  type CoopSkinId,
  type JeffSkinId,
  type ManualPageId,
  type PhotoId,
  type RopeSkinId,
} from '../contracts';
import { drawPixelBox, drawPixelText } from './bitmapFont';
import { ProceduralPixelAtlas } from './ProceduralPixelAtlas';

export const POLAROID_NATIVE_W = 96;
export const POLAROID_NATIVE_H = 72;
export const MANUAL_NATIVE_W = 120;
export const MANUAL_NATIVE_H = 64;

export interface RopeSkinVisualStyle {
  primary: string;
  secondary: string;
  accent: string;
  pattern:
    | 'braid'
    | 'plush_tail'
    | 'twine_knots'
    | 'pretzel_salt'
    | 'kelp_bobbers'
    | 'berry_vine'
    | 'prism_spiral'
    | 'steel_chain'
    | 'sausage_links'
    | 'power_conduit'
    | 'spine_bones'
    | 'laser_tether';
}

export const ROPE_SKIN_STYLES: Readonly<Record<RopeSkinId, RopeSkinVisualStyle>> = {
  Default: {
    primary: PALETTE.ROPE_BASE,
    secondary: PALETTE.CLIFF_MID,
    accent: PALETTE.SNOW_LIGHT,
    pattern: 'braid',
  },
  Animals: {
    primary: '#e86f34',
    secondary: PALETTE.SNOW_BRIGHT,
    accent: '#55342e',
    pattern: 'plush_tail',
  },
  Box: {
    primary: '#d9b07c',
    secondary: '#8f563b',
    accent: '#f5dab4',
    pattern: 'twine_knots',
  },
  Bread: {
    primary: '#e8a855',
    secondary: '#9c5a22',
    accent: PALETTE.SNOW_BRIGHT,
    pattern: 'pretzel_salt',
  },
  Fish: {
    primary: '#40cc8c',
    secondary: '#257d64',
    accent: PALETTE.KRUNKED_SCARF,
    pattern: 'kelp_bobbers',
  },
  Fruit: {
    primary: '#6bd94b',
    secondary: PALETTE.FRED_SCARF_DARK,
    accent: '#e63956',
    pattern: 'berry_vine',
  },
  Inverted: {
    primary: PALETTE.KRUNKED_SCARF,
    secondary: PALETTE.FRED_SCARF,
    accent: PALETTE.SNOW_BRIGHT,
    pattern: 'prism_spiral',
  },
  Knight: {
    primary: '#b8c4d4',
    secondary: PALETTE.LAB_STEEL,
    accent: PALETTE.SNOW_BRIGHT,
    pattern: 'steel_chain',
  },
  Pot: {
    primary: '#b84b3e',
    secondary: '#df7126',
    accent: '#f7d6b0',
    pattern: 'sausage_links',
  },
  Robot: {
    primary: PALETTE.LAB_CYAN,
    secondary: PALETTE.LAB_STEEL,
    accent: PALETTE.SNOW_BRIGHT,
    pattern: 'power_conduit',
  },
  Skeleton: {
    primary: '#f2f5ff',
    secondary: '#8a8ca8',
    accent: PALETTE.SNOW_BRIGHT,
    pattern: 'spine_bones',
  },
  Super: {
    primary: PALETTE.LAB_AMBER,
    secondary: PALETTE.SNOW_BRIGHT,
    accent: PALETTE.KRUNKED_SCARF,
    pattern: 'laser_tether',
  },
};

// ============================================================================
// Lazy Singleton Caches & Crisp Canvas Helpers
// ============================================================================

const photoCache = new Map<string, string>();
const manualCache = new Map<string, string>();
const coopSkinCache = new Map<string, string>();
const jeffSkinCache = new Map<string, string>();
const ropeSkinCache = new Map<string, string>();

let sharedAtlas: ProceduralPixelAtlas | null = null;

function getSharedAtlas(override?: ProceduralPixelAtlas): ProceduralPixelAtlas {
  if (override) return override;
  if (!sharedAtlas) {
    sharedAtlas = new ProceduralPixelAtlas();
  }
  return sharedAtlas;
}

function canUseCanvas(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create 2D context for CollectibleArt');
  }
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

function upscaleToDataUrl(src: HTMLCanvasElement, scale: number): string {
  const s = Math.max(1, Math.round(scale));
  if (s === 1) {
    return src.toDataURL('image/png');
  }
  const { canvas, ctx } = makeCanvas(src.width * s, src.height * s);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

function pxLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  size = 1
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
  const half = size >> 1;
  ctx.fillStyle = color;
  for (;;) {
    ctx.fillRect(ix0 - half, iy0 - half, size, size);
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

function drawMiniPenguin(
  ctx: CanvasRenderingContext2D,
  cx: number,
  feetY: number,
  who: 'p1' | 'p2',
  facing: 1 | -1 = 1,
  pose: 'idle' | 'wave' | 'anchor' | 'swing' | 'grab' | 'clap' = 'idle'
): void {
  const x = Math.round(cx);
  const y = Math.round(feetY);
  const scarf = who === 'p1' ? PALETTE.KRUNKED_SCARF : PALETTE.FRED_SCARF;
  const scarfDark = who === 'p1' ? PALETTE.KRUNKED_SCARF_DARK : PALETTE.FRED_SCARF_DARK;
  const wide = pose === 'anchor' ? 1 : 0;

  // Outline silhouette
  ctx.fillStyle = PALETTE.OUTLINE;
  ctx.fillRect(x - 4 - wide, y - 10, 8 + wide * 2, 10);
  ctx.fillRect(x - 3, y - 13, 6, 4);

  // Body & belly
  ctx.fillStyle = PALETTE.BODY_MAIN;
  ctx.fillRect(x - 3 - wide, y - 9, 6 + wide * 2, 7);
  ctx.fillRect(x - 2, y - 12, 4, 4);

  ctx.fillStyle = PALETTE.BELLY_WHITE;
  ctx.fillRect(x - 1 + (facing > 0 ? 0 : -1), y - 8, 3, 5);
  ctx.fillRect(x - 1 + (facing > 0 ? 1 : -1), y - 11, 2, 2);

  // Scarf & trailing tail
  ctx.fillStyle = scarf;
  ctx.fillRect(x - 3, y - 9, 6, 2);
  ctx.fillStyle = scarfDark;
  ctx.fillRect(x - facing * 5, y - 9, 2, 2);
  ctx.fillStyle = scarf;
  ctx.fillRect(x - facing * 7, y - 8, 2, 1);

  // Krunked headband or Fred tuft
  if (who === 'p1') {
    ctx.fillStyle = PALETTE.KRUNKED_SCARF;
    ctx.fillRect(x - 3, y - 12, 6, 1);
  } else {
    ctx.fillStyle = PALETTE.FRED_SCARF;
    ctx.fillRect(x - 1, y - 14, 2, 1);
  }

  // Eye & beak
  ctx.fillStyle = PALETTE.OUTLINE;
  ctx.fillRect(x + (facing > 0 ? 1 : -2), y - 11, 1, 1);
  ctx.fillStyle = PALETTE.BEAK_BRIGHT;
  ctx.fillRect(x + (facing > 0 ? 3 : -5), y - 10, 2, 2);

  // Feet
  ctx.fillStyle = PALETTE.BEAK_BRIGHT;
  ctx.fillRect(x - 3 - wide, y - 1, 2, 1);
  ctx.fillRect(x + 1 + wide, y - 1, 2, 1);

  // Flipper poses
  ctx.fillStyle = PALETTE.BODY_MAIN;
  if (pose === 'wave' || pose === 'clap') {
    ctx.fillRect(x + facing * 3, y - 11, 2, 3);
    if (pose === 'clap') {
      ctx.fillStyle = PALETTE.LAB_AMBER;
      ctx.fillRect(x + facing * 4, y - 13, 1, 1);
    }
  } else if (pose === 'swing') {
    ctx.fillRect(x - 5, y - 11, 2, 3);
    ctx.fillRect(x + 3, y - 11, 2, 3);
  } else if (pose === 'grab') {
    ctx.fillRect(x + facing * 3, y - 9, 2, 2);
    ctx.fillRect(x + facing * 3, y - 6, 2, 2);
  }
}

function drawMiniPine(ctx: CanvasRenderingContext2D, cx: number, baseY: number, h: number): void {
  ctx.fillStyle = PALETTE.MINE_DIRT;
  ctx.fillRect(cx - 1, baseY - 4, 2, 4);
  for (let row = 0; row < h - 4; row++) {
    const tier = (row % 6) + Math.floor(row / 6) * 2;
    const half = Math.max(1, Math.min(7, Math.floor(tier * 0.75) + 1));
    ctx.fillStyle =
      row % 6 < 2 ? PALETTE.SNOW_BRIGHT : row % 6 === 2 ? PALETTE.SNOW_LIGHT : PALETTE.FRED_SCARF;
    ctx.fillRect(cx - half, baseY - h + row, half * 2 + 1, 1);
  }
}

function drawAlpineSky(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  variant: 'twilight' | 'crags' | 'summit'
): void {
  if (variant === 'twilight') {
    ctx.fillStyle = PALETTE.SKY_DEEP;
    ctx.fillRect(0, 0, w, Math.floor(h * 0.36));
    ctx.fillStyle = '#1b1742';
    ctx.fillRect(0, Math.floor(h * 0.36), w, Math.floor(h * 0.28));
    ctx.fillStyle = PALETTE.NIGHT_PURPLE;
    ctx.fillRect(0, Math.floor(h * 0.64), w, h);
  } else if (variant === 'crags') {
    ctx.fillStyle = '#1b1236';
    ctx.fillRect(0, 0, w, Math.floor(h * 0.34));
    ctx.fillStyle = '#331d52';
    ctx.fillRect(0, Math.floor(h * 0.34), w, Math.floor(h * 0.3));
    ctx.fillStyle = '#4e2a62';
    ctx.fillRect(0, Math.floor(h * 0.64), w, h);
  } else {
    ctx.fillStyle = '#090d26';
    ctx.fillRect(0, 0, w, Math.floor(h * 0.35));
    ctx.fillStyle = '#13204d';
    ctx.fillRect(0, Math.floor(h * 0.35), w, Math.floor(h * 0.32));
    ctx.fillStyle = '#253c78';
    ctx.fillRect(0, Math.floor(h * 0.67), w, h);
  }

  // Stars
  ctx.fillStyle = PALETTE.SNOW_BRIGHT;
  const starCoords = [
    [9, 8], [21, 14], [35, 6], [49, 12], [64, 7], [79, 15], [88, 9], [16, 22], [57, 20],
  ];
  for (let i = 0; i < starCoords.length; i++) {
    const [sx, sy] = starCoords[i];
    if (sx < w && sy < h) {
      ctx.fillStyle = i % 2 === 0 ? PALETTE.SNOW_BRIGHT : PALETTE.SNOW_LIGHT;
      ctx.fillRect(sx, sy, 1, 1);
    }
  }
}

function drawMinesWall(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = PALETTE.MINE_VOID;
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 10) {
    ctx.fillStyle = y % 20 === 0 ? PALETTE.MINE_DEEP : PALETTE.MINE_SHADOW;
    ctx.fillRect(0, y, w, 6);
    ctx.fillStyle = PALETTE.MINE_ROCK;
    ctx.fillRect(0, y + 6, w, 1);
  }
  // Timber beams
  ctx.fillStyle = PALETTE.MINE_DIRT;
  ctx.fillRect(6, 0, 5, h);
  ctx.fillRect(w - 11, 0, 5, h);
  ctx.fillStyle = PALETTE.MINE_WOOD;
  ctx.fillRect(7, 0, 2, h);
  ctx.fillRect(w - 10, 0, 2, h);
}

function drawLabWall(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = PALETTE.LAB_DEEP;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = PALETTE.LAB_WALL;
  for (let y = 2; y < h; y += 14) {
    for (let x = 2; x < w; x += 16) {
      ctx.fillRect(x, y, 14, 12);
    }
  }
  ctx.fillStyle = PALETTE.LAB_STEEL;
  ctx.fillRect(0, h - 12, w, 12);
  ctx.fillStyle = PALETTE.LAB_HIGHLIGHT;
  ctx.fillRect(0, h - 12, w, 1);
}

function drawSnowLedge(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = PALETTE.OUTLINE;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = PALETTE.CLIFF_DARK;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = PALETTE.CLIFF_MID;
  ctx.fillRect(x + 2, y + 5, Math.max(2, w - 5), 2);
  ctx.fillStyle = PALETTE.SNOW_BRIGHT;
  ctx.fillRect(x, y, w, 3);
  ctx.fillStyle = PALETTE.SNOW_LIGHT;
  ctx.fillRect(x, y + 3, w, 1);
}

function drawMountainSilhouette(
  ctx: CanvasRenderingContext2D,
  peakX: number,
  baseY: number,
  halfW: number,
  h: number,
  body: string,
  cap: string
): void {
  for (let r = 0; r < h; r++) {
    const span = Math.max(1, Math.round((r / h) * halfW));
    ctx.fillStyle = body;
    ctx.fillRect(peakX - span, baseY - h + r, span * 2, 1);
    if (r < h * 0.32) {
      ctx.fillStyle = cap;
      ctx.fillRect(peakX - span, baseY - h + r, Math.max(1, Math.round(span * 1.1)), 1);
    }
  }
}

function drawSparkle(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y - 2, 1, 5);
  ctx.fillRect(x - 2, y, 5, 1);
  ctx.fillStyle = PALETTE.SNOW_BRIGHT;
  ctx.fillRect(x, y, 1, 1);
}

// ============================================================================
// 1. All 12 Polaroid Photo Illustrations (96 x 72 native)
// ============================================================================

function drawPolaroidScene(ctx: CanvasRenderingContext2D, id: PhotoId): void {
  const w = POLAROID_NATIVE_W;
  const h = POLAROID_NATIVE_H;

  switch (id) {
    case 'Photo1': {
      // Chimney Lookout — Krunked & Fred waving from pine ledge above Foothills chimney
      drawAlpineSky(ctx, w, h, 'twilight');
      // Crescent moon
      ctx.fillStyle = PALETTE.SNOW_BRIGHT;
      ctx.fillRect(76, 9, 7, 7);
      ctx.fillStyle = PALETTE.SKY_DEEP;
      ctx.fillRect(79, 9, 5, 6);
      drawMountainSilhouette(ctx, 24, 58, 30, 26, '#231e54', PALETTE.CLIFF_MID);
      drawMountainSilhouette(ctx, 68, 58, 34, 32, '#1d193d', PALETTE.SNOW_LIGHT);
      drawSnowLedge(ctx, 18, 48, 60, 24);
      drawMiniPine(ctx, 26, 48, 20);
      drawMiniPine(ctx, 72, 48, 15);
      // Connecting rope curve
      pxLine(ctx, 44, 43, 50, 45, PALETTE.ROPE_BASE, 1);
      pxLine(ctx, 50, 45, 56, 43, PALETTE.ROPE_BASE, 1);
      drawMiniPenguin(ctx, 42, 48, 'p1', 1, 'wave');
      drawMiniPenguin(ctx, 58, 48, 'p2', -1, 'wave');
      drawSparkle(ctx, 50, 32, PALETTE.LAB_AMBER);
      break;
    }

    case 'Photo2': {
      // Minecart Crossing — Twin headlamps mid-ride over echoing cavern
      drawMinesWall(ctx, w, h);
      // Warm headlamp cones
      ctx.fillStyle = 'rgba(255, 206, 120, 0.24)';
      ctx.fillRect(54, 24, 34, 20);
      ctx.fillRect(10, 26, 32, 18);
      // Diagonal rail
      pxLine(ctx, 4, 52, 92, 40, PALETTE.OUTLINE, 3);
      pxLine(ctx, 4, 52, 92, 40, PALETTE.LAB_STEEL, 1);
      // Minecart
      drawPixelBox(ctx, 30, 36, 36, 12, PALETTE.MINE_WOOD, PALETTE.OUTLINE, PALETTE.LAB_HIGHLIGHT);
      ctx.fillStyle = PALETTE.LAB_STEEL;
      ctx.fillRect(36, 47, 5, 5);
      ctx.fillRect(55, 47, 5, 5);
      ctx.fillStyle = PALETTE.LAB_HIGHLIGHT;
      ctx.fillRect(38, 49, 1, 1);
      ctx.fillRect(57, 49, 1, 1);
      // Penguins riding with glowing headlamps
      drawMiniPenguin(ctx, 41, 37, 'p1', -1, 'idle');
      drawMiniPenguin(ctx, 55, 37, 'p2', 1, 'wave');
      ctx.fillStyle = PALETTE.LAB_AMBER;
      ctx.fillRect(36, 26, 2, 2);
      ctx.fillRect(58, 26, 2, 2);
      break;
    }

    case 'Photo3': {
      // Village Campfire — Marshmallows toasting beside starting cabin
      drawAlpineSky(ctx, w, h, 'twilight');
      drawMiniPine(ctx, 12, 54, 22);
      drawMiniPine(ctx, 84, 54, 18);
      // Cozy cabin silhouette
      drawPixelBox(ctx, 20, 30, 32, 22, PALETTE.MINE_WOOD, PALETTE.OUTLINE);
      for (let r = 0; r < 10; r++) {
        ctx.fillStyle = r < 7 ? PALETTE.SNOW_BRIGHT : PALETTE.MINE_BRICK;
        ctx.fillRect(16 + (9 - r), 20 + r, 40 - (9 - r) * 2, 1);
      }
      ctx.fillStyle = PALETTE.LAB_AMBER;
      ctx.fillRect(25, 36, 6, 6);
      ctx.fillRect(41, 36, 6, 6);
      // Chimney smoke
      ctx.fillStyle = PALETTE.SNOW_LIGHT;
      ctx.fillRect(45, 16, 3, 2);
      ctx.fillRect(47, 12, 4, 2);
      ctx.fillRect(50, 8, 3, 2);
      // Snow ground
      drawSnowLedge(ctx, 0, 52, w, 20);
      // Campfire & glow
      ctx.fillStyle = 'rgba(255, 184, 48, 0.25)';
      ctx.fillRect(42, 40, 24, 16);
      ctx.fillStyle = PALETTE.MINE_DIRT;
      ctx.fillRect(48, 52, 12, 3);
      ctx.fillStyle = PALETTE.KRUNKED_SCARF;
      ctx.fillRect(50, 47, 8, 5);
      ctx.fillStyle = PALETTE.BEAK_BRIGHT;
      ctx.fillRect(51, 45, 6, 6);
      ctx.fillStyle = PALETTE.LAB_AMBER;
      ctx.fillRect(52, 46, 4, 4);
      // Penguins roasting marshmallows
      drawMiniPenguin(ctx, 36, 52, 'p1', 1, 'idle');
      drawMiniPenguin(ctx, 71, 52, 'p2', -1, 'idle');
      pxLine(ctx, 39, 46, 49, 46, PALETTE.MINE_WOOD, 1);
      pxLine(ctx, 68, 46, 58, 46, PALETTE.MINE_WOOD, 1);
      ctx.fillStyle = PALETTE.SNOW_BRIGHT;
      ctx.fillRect(49, 45, 2, 2);
      ctx.fillRect(57, 45, 2, 2);
      break;
    }

    case 'Photo4': {
      // First Big Swing — Fred soaring while Krunked anchors snow ledge
      drawAlpineSky(ctx, w, h, 'twilight');
      drawMountainSilhouette(ctx, 56, 68, 42, 38, '#231e54', PALETTE.CLIFF_MID);
      // High anchor cliff left, target ledge right
      drawSnowLedge(ctx, 0, 26, 32, 46);
      drawSnowLedge(ctx, 74, 34, 22, 38);
      // Dotted swing arc
      for (let i = 0; i < 8; i++) {
        const a = (i / 7) * Math.PI * 0.72 + 0.15;
        const ax = Math.round(28 + Math.cos(a) * 34);
        const ay = Math.round(24 + Math.sin(a) * 28);
        ctx.fillStyle = PALETTE.ICE_LIGHT;
        ctx.fillRect(ax, ay, 2, 1);
      }
      // Taut braided rope from P1 to soaring P2
      pxLine(ctx, 27, 22, 58, 42, PALETTE.OUTLINE, 3);
      pxLine(ctx, 27, 22, 58, 42, PALETTE.LAB_AMBER, 1);
      drawMiniPenguin(ctx, 25, 26, 'p1', 1, 'anchor');
      // Sweat drops on Krunked
      ctx.fillStyle = PALETTE.LAB_CYAN;
      ctx.fillRect(19, 14, 1, 2);
      ctx.fillRect(17, 17, 1, 2);
      drawMiniPenguin(ctx, 60, 48, 'p2', 1, 'swing');
      drawSparkle(ctx, 67, 36, PALETTE.SNOW_BRIGHT);
      break;
    }

    case 'Photo5': {
      // Lantern Trestle — Wooden mine supports lit by warm amber brass lamps
      drawMinesWall(ctx, w, h);
      // Trestle bridge
      ctx.fillStyle = PALETTE.MINE_DIRT;
      ctx.fillRect(0, 44, w, 5);
      ctx.fillStyle = PALETTE.MINE_WOOD;
      ctx.fillRect(0, 44, w, 2);
      // Diagonal trestle struts
      pxLine(ctx, 18, 49, 32, 71, PALETTE.MINE_WOOD, 2);
      pxLine(ctx, 48, 49, 34, 71, PALETTE.MINE_WOOD, 2);
      pxLine(ctx, 62, 49, 76, 71, PALETTE.MINE_WOOD, 2);
      // 3 warm hanging brass lanterns
      const lampXs = [22, 48, 74];
      for (let i = 0; i < lampXs.length; i++) {
        const lx = lampXs[i];
        ctx.fillStyle = 'rgba(255, 198, 90, 0.22)';
        ctx.fillRect(lx - 11, 14, 22, 22);
        ctx.fillStyle = PALETTE.LAB_STEEL;
        ctx.fillRect(lx, 0, 1, 19);
        ctx.fillRect(lx - 2, 19, 5, 2);
        ctx.fillStyle = PALETTE.LAB_AMBER;
        ctx.fillRect(lx - 2, 21, 5, 5);
        ctx.fillStyle = PALETTE.SNOW_BRIGHT;
        ctx.fillRect(lx - 1, 22, 3, 3);
      }
      pxLine(ctx, 41, 40, 53, 40, PALETTE.ROPE_BASE, 1);
      drawMiniPenguin(ctx, 39, 44, 'p1', 1, 'idle');
      drawMiniPenguin(ctx, 56, 44, 'p2', 1, 'idle');
      break;
    }

    case 'Photo6': {
      // Deep Shaft Seal — Rescued baby seal balancing a pebble on its nose
      drawMinesWall(ctx, w, h);
      ctx.fillStyle = 'rgba(255, 200, 110, 0.2)';
      ctx.fillRect(28, 12, 40, 44);
      // Rock shelf
      drawPixelBox(ctx, 10, 50, 76, 22, PALETTE.MINE_BRICK, PALETTE.OUTLINE, PALETTE.MINE_WOOD);
      // Plump baby seal center-stage
      ctx.fillStyle = PALETTE.OUTLINE;
      ctx.fillRect(36, 35, 24, 15);
      ctx.fillRect(42, 29, 13, 8);
      ctx.fillStyle = PALETTE.SNOW_LIGHT;
      ctx.fillRect(37, 36, 22, 13);
      ctx.fillStyle = PALETTE.SNOW_BRIGHT;
      ctx.fillRect(38, 36, 20, 10);
      ctx.fillRect(43, 30, 11, 8);
      // Cute face & pebble balanced on nose!
      ctx.fillStyle = PALETTE.OUTLINE;
      ctx.fillRect(46, 33, 2, 2);
      ctx.fillRect(51, 33, 2, 2);
      ctx.fillStyle = '#ec7c98';
      ctx.fillRect(44, 35, 2, 1);
      ctx.fillRect(52, 35, 2, 1);
      ctx.fillStyle = PALETTE.ROPE_BASE;
      ctx.fillRect(47, 25, 4, 4);
      ctx.fillStyle = PALETTE.SNOW_LIGHT;
      ctx.fillRect(48, 25, 2, 1);
      // Clapping Krunked & Fred
      drawMiniPenguin(ctx, 24, 50, 'p1', 1, 'clap');
      drawMiniPenguin(ctx, 72, 50, 'p2', -1, 'clap');
      drawSparkle(ctx, 49, 19, PALETTE.LAB_AMBER);
      break;
    }

    case 'Photo7': {
      // Gale Watchtower — Scarves whipping sideways across roaring Crags bridge
      drawAlpineSky(ctx, w, h, 'crags');
      drawMountainSilhouette(ctx, 26, 62, 34, 36, '#231642', '#6d58b7');
      drawMountainSilhouette(ctx, 76, 64, 32, 38, '#1b1133', PALETTE.ICE_MID);
      // Gale wind streaks
      ctx.fillStyle = PALETTE.ICE_LIGHT;
      ctx.fillRect(6, 16, 26, 1);
      ctx.fillRect(44, 22, 34, 1);
      ctx.fillRect(14, 34, 22, 1);
      ctx.fillRect(58, 12, 28, 1);
      // Watchtower timber bridge
      ctx.fillStyle = PALETTE.MINE_WOOD;
      ctx.fillRect(0, 48, w, 5);
      ctx.fillStyle = PALETTE.MINE_DIRT;
      ctx.fillRect(12, 32, 3, 18);
      ctx.fillRect(80, 32, 3, 18);
      ctx.fillStyle = PALETTE.ROPE_BASE;
      ctx.fillRect(12, 38, 70, 1);
      // Penguins leaning into gale with super long whipping scarves
      drawMiniPenguin(ctx, 36, 48, 'p1', -1, 'anchor');
      drawMiniPenguin(ctx, 56, 48, 'p2', -1, 'anchor');
      ctx.fillStyle = PALETTE.KRUNKED_SCARF;
      ctx.fillRect(39, 39, 12, 2);
      ctx.fillRect(49, 38, 6, 2);
      ctx.fillStyle = PALETTE.FRED_SCARF;
      ctx.fillRect(59, 39, 14, 2);
      ctx.fillRect(71, 38, 6, 2);
      break;
    }

    case 'Photo8': {
      // Suspended Cradle — Catching a gust aboard hanging timber platform
      drawAlpineSky(ctx, w, h, 'crags');
      // Gale gusts
      ctx.fillStyle = PALETTE.SNOW_BRIGHT;
      ctx.fillRect(8, 22, 30, 1);
      ctx.fillRect(52, 46, 36, 1);
      ctx.fillStyle = PALETTE.ICE_LIGHT;
      ctx.fillRect(16, 56, 28, 1);
      // Pivot bolt & angled suspension chains
      ctx.fillStyle = PALETTE.LAB_AMBER;
      ctx.fillRect(36, 6, 5, 5);
      pxLine(ctx, 38, 10, 48, 44, PALETTE.OUTLINE, 3);
      pxLine(ctx, 38, 10, 48, 44, PALETTE.ROPE_BASE, 1);
      pxLine(ctx, 38, 10, 74, 40, PALETTE.OUTLINE, 3);
      pxLine(ctx, 38, 10, 74, 40, PALETTE.ROPE_BASE, 1);
      // Cradle deck
      drawPixelBox(ctx, 44, 41, 34, 8, PALETTE.MINE_WOOD, PALETTE.OUTLINE, PALETTE.BEAK_MID);
      drawMiniPenguin(ctx, 54, 41, 'p1', 1, 'wave');
      drawMiniPenguin(ctx, 68, 41, 'p2', 1, 'idle');
      break;
    }

    case 'Photo9': {
      // Mirror Glacier — Starlight reflecting off translucent violet summit ice
      drawAlpineSky(ctx, w, h, 'summit');
      // Shimmering emerald-cyan Aurora ribbons
      for (let x = 0; x < w; x += 2) {
        const wave = Math.round(Math.sin(x * 0.08) * 5);
        ctx.fillStyle = 'rgba(64, 204, 140, 0.55)';
        ctx.fillRect(x, 12 + wave, 2, 10);
        ctx.fillStyle = 'rgba(56, 232, 255, 0.35)';
        ctx.fillRect(x, 18 + wave, 2, 7);
      }
      // Translucent glacier floor with mirror sheen
      ctx.fillStyle = PALETTE.ICE_MID;
      ctx.fillRect(0, 46, w, 26);
      ctx.fillStyle = PALETTE.ICE_LIGHT;
      ctx.fillRect(0, 46, w, 6);
      ctx.fillStyle = PALETTE.ICE_TINT;
      ctx.fillRect(0, 56, w, 8);
      // Diagonal ice speculars & reflections
      pxLine(ctx, 10, 68, 30, 48, PALETTE.SNOW_BRIGHT, 1);
      pxLine(ctx, 56, 68, 76, 48, PALETTE.SNOW_BRIGHT, 1);
      // Faint flipped penguin reflections
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = PALETTE.BODY_MAIN;
      ctx.fillRect(36, 48, 6, 8);
      ctx.fillRect(54, 48, 6, 8);
      ctx.fillStyle = PALETTE.KRUNKED_SCARF;
      ctx.fillRect(36, 51, 6, 2);
      ctx.fillStyle = PALETTE.FRED_SCARF;
      ctx.fillRect(54, 51, 6, 2);
      ctx.globalAlpha = 1;
      drawMiniPenguin(ctx, 39, 46, 'p1', 1, 'idle');
      drawMiniPenguin(ctx, 57, 46, 'p2', -1, 'idle');
      break;
    }

    case 'Photo10': {
      // Above the Clouds — Valley below the Summit Banner
      drawAlpineSky(ctx, w, h, 'summit');
      // Aurora accent
      for (let x = 0; x < w; x += 3) {
        ctx.fillStyle = 'rgba(64, 204, 140, 0.4)';
        ctx.fillRect(x, 10 + Math.round(Math.sin(x * 0.09) * 3), 3, 6);
      }
      // Sea of pillowy clouds below
      ctx.fillStyle = PALETTE.SNOW_LIGHT;
      ctx.fillRect(0, 52, w, 20);
      ctx.fillStyle = PALETTE.SNOW_BRIGHT;
      for (let cx = 6; cx < w; cx += 18) {
        ctx.fillRect(cx, 48 + (cx % 3), 16, 7);
      }
      // Peak ledge
      drawSnowLedge(ctx, 20, 48, 56, 24);
      // Summit Banner Archway
      ctx.fillStyle = PALETTE.MINE_WOOD;
      ctx.fillRect(28, 22, 3, 26);
      ctx.fillRect(65, 22, 3, 26);
      ctx.fillStyle = PALETTE.KRUNKED_SCARF;
      ctx.fillRect(31, 24, 34, 8);
      ctx.fillStyle = PALETTE.LAB_AMBER;
      ctx.fillRect(31, 24, 34, 1);
      ctx.fillRect(31, 31, 34, 1);
      drawSparkle(ctx, 48, 28, PALETTE.LAB_AMBER);
      // Celebrating Krunked & Fred + confetti
      drawMiniPenguin(ctx, 40, 48, 'p1', 1, 'clap');
      drawMiniPenguin(ctx, 56, 48, 'p2', -1, 'clap');
      ctx.fillStyle = PALETTE.LAB_CYAN;
      ctx.fillRect(35, 34, 2, 2);
      ctx.fillStyle = PALETTE.LAB_AMBER;
      ctx.fillRect(49, 36, 2, 2);
      ctx.fillStyle = PALETTE.FRED_SCARF;
      ctx.fillRect(61, 34, 2, 2);
      break;
    }

    case 'Photo11': {
      // Piston Blueprint — Candid snap beside powered cyan Troncho launcher
      drawLabWall(ctx, w, h);
      // Glowing cyan floor circuit
      ctx.fillStyle = PALETTE.LAB_CYAN;
      ctx.fillRect(8, 54, 42, 2);
      ctx.fillRect(48, 42, 2, 14);
      ctx.fillStyle = PALETTE.SNOW_BRIGHT;
      ctx.fillRect(22, 54, 6, 2);
      // Telescoping hydraulic shaft & caution-striped Troncho
      ctx.fillStyle = PALETTE.LAB_STEEL;
      ctx.fillRect(45, 32, 8, 28);
      ctx.fillStyle = PALETTE.LAB_HIGHLIGHT;
      ctx.fillRect(47, 32, 3, 28);
      drawPixelBox(ctx, 37, 18, 24, 16, PALETTE.LAB_WALL, PALETTE.OUTLINE, PALETTE.LAB_STEEL);
      ctx.fillStyle = PALETTE.LAB_AMBER;
      ctx.fillRect(39, 20, 4, 3);
      ctx.fillRect(47, 20, 4, 3);
      ctx.fillRect(55, 20, 4, 3);
      // Cyan grab pads
      ctx.fillStyle = PALETTE.LAB_CYAN;
      ctx.fillRect(37, 24, 2, 7);
      ctx.fillRect(59, 24, 2, 7);
      // Penguins posing proudly
      drawMiniPenguin(ctx, 22, 60, 'p1', 1, 'wave');
      drawMiniPenguin(ctx, 74, 60, 'p2', -1, 'wave');
      drawSparkle(ctx, 49, 12, PALETTE.LAB_CYAN);
      break;
    }

    case 'Photo12': {
      // Victory Over Bachicha — High-fiving atop deactivated Lab mech
      drawLabWall(ctx, w, h);
      // Broken chain stubs on walls
      pxLine(ctx, 6, 20, 18, 32, PALETTE.LAB_STEEL, 2);
      pxLine(ctx, 90, 20, 78, 32, PALETTE.LAB_STEEL, 2);
      // Massive deactivated Bachicha golem torso
      drawPixelBox(ctx, 22, 32, 52, 34, PALETTE.LAB_STEEL, PALETTE.OUTLINE, PALETTE.LAB_HIGHLIGHT);
      ctx.fillStyle = PALETTE.LAB_WALL;
      ctx.fillRect(26, 36, 44, 26);
      // Peaceful emerald visor eyes ^ ^
      ctx.fillStyle = PALETTE.LAB_DEEP;
      ctx.fillRect(32, 40, 32, 10);
      ctx.fillStyle = PALETTE.PINE_MOSS;
      ctx.fillRect(37, 44, 5, 2);
      ctx.fillRect(39, 42, 2, 2);
      ctx.fillRect(54, 44, 5, 2);
      ctx.fillRect(56, 42, 2, 2);
      // Glowing peaceful chest reactor
      ctx.fillStyle = PALETTE.LAB_CYAN;
      ctx.fillRect(44, 54, 8, 5);
      // Krunked & Fred high-fiving on top!
      drawMiniPenguin(ctx, 42, 32, 'p1', 1, 'clap');
      drawMiniPenguin(ctx, 54, 32, 'p2', -1, 'clap');
      drawSparkle(ctx, 48, 17, PALETTE.LAB_AMBER);
      // Confetti
      ctx.fillStyle = PALETTE.KRUNKED_SCARF;
      ctx.fillRect(16, 14, 2, 2);
      ctx.fillStyle = PALETTE.LAB_AMBER;
      ctx.fillRect(78, 12, 2, 2);
      ctx.fillStyle = PALETTE.PINE_MOSS;
      ctx.fillRect(30, 12, 2, 2);
      ctx.fillStyle = PALETTE.LAB_CYAN;
      ctx.fillRect(66, 15, 2, 2);
      break;
    }
  }

  // Crisp inner Polaroid vignette border
  ctx.strokeStyle = PALETTE.OUTLINE;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
}

export function renderPolaroidPhoto(id: PhotoId, scale = 2): string {
  if (!canUseCanvas()) return '';
  const key = `${id}@${scale}`;
  const cached = photoCache.get(key);
  if (cached) return cached;

  const { canvas, ctx } = makeCanvas(POLAROID_NATIVE_W, POLAROID_NATIVE_H);
  drawPolaroidScene(ctx, id);
  const url = upscaleToDataUrl(canvas, scale);
  photoCache.set(key, url);
  return url;
}

export function getAllPolaroidUrls(scale = 2): Record<PhotoId, string> {
  const out = {} as Record<PhotoId, string>;
  for (let i = 0; i < PHOTO_IDS.length; i++) {
    const id = PHOTO_IDS[i];
    out[id] = renderPolaroidPhoto(id, scale);
  }
  return out;
}

// ============================================================================
// 2. All 7 Climber Field Manual Diagrams (120 x 64 native)
// ============================================================================

function drawManualBackdrop(ctx: CanvasRenderingContext2D, dark = false): void {
  const w = MANUAL_NATIVE_W;
  const h = MANUAL_NATIVE_H;
  ctx.fillStyle = dark ? PALETTE.SKY_DEEP : '#241f46';
  ctx.fillRect(0, 0, w, h);
  // Subtle blueprint grid dots
  ctx.fillStyle = dark ? '#1f193c' : '#2f2959';
  for (let y = 8; y < h - 4; y += 8) {
    for (let x = 8; x < w - 4; x += 8) {
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.strokeStyle = PALETTE.CLIFF_MID;
  ctx.lineWidth = 1;
  ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
}

function drawManualScene(ctx: CanvasRenderingContext2D, id: ManualPageId): void {
  const w = MANUAL_NATIVE_W;
  const h = MANUAL_NATIVE_H;
  drawManualBackdrop(ctx, id === 'Mines');

  switch (id) {
    case 'Swing': {
      // Anchor left ledge, pendulum arc underneath, launch arrow to right ledge
      drawSnowLedge(ctx, 4, 24, 30, 36);
      drawSnowLedge(ctx, 88, 28, 28, 32);
      // Dotted arc path
      for (let i = 0; i <= 10; i++) {
        const a = 0.25 + (i / 10) * 1.35;
        const ax = Math.round(30 + Math.cos(a) * 30);
        const ay = Math.round(22 + Math.sin(a) * 28);
        ctx.fillStyle = PALETTE.ICE_LIGHT;
        ctx.fillRect(ax, ay, 2, 1);
      }
      // Taut rope
      pxLine(ctx, 29, 20, 56, 44, PALETTE.OUTLINE, 3);
      pxLine(ctx, 29, 20, 56, 44, PALETTE.LAB_AMBER, 1);
      drawMiniPenguin(ctx, 26, 24, 'p1', 1, 'anchor');
      drawMiniPenguin(ctx, 58, 50, 'p2', 1, 'swing');
      // Launch arrow toward right ledge
      pxLine(ctx, 64, 42, 82, 26, PALETTE.PINE_MOSS, 2);
      ctx.fillStyle = PALETTE.PINE_MOSS;
      ctx.fillRect(78, 24, 5, 2);
      ctx.fillRect(81, 24, 2, 5);
      drawPixelText(ctx, 'ANCHOR', 6, 4, { color: PALETTE.LAB_AMBER, outlineColor: PALETTE.OUTLINE });
      drawPixelText(ctx, 'JUMP!', 78, 8, { color: PALETTE.PINE_MOSS, outlineColor: PALETTE.OUTLINE });
      break;
    }

    case 'Grab': {
      // Snow cliff wall (grabbable) vs Ice wall (X) + stamina gauge
      drawSnowLedge(ctx, 44, 12, 16, 48);
      drawMiniPenguin(ctx, 39, 36, 'p1', 1, 'grab');
      // Sweat drops
      ctx.fillStyle = PALETTE.LAB_CYAN;
      ctx.fillRect(32, 25, 1, 2);
      ctx.fillRect(30, 29, 1, 2);
      // Vertical Stamina Bar (15s)
      drawPixelBox(ctx, 18, 16, 7, 30, PALETTE.OUTLINE, PALETTE.SNOW_LIGHT);
      ctx.fillStyle = PALETTE.PINE_MOSS;
      ctx.fillRect(20, 24, 3, 10);
      ctx.fillStyle = PALETTE.LAB_AMBER;
      ctx.fillRect(20, 34, 3, 6);
      ctx.fillStyle = PALETTE.KRUNKED_SCARF;
      ctx.fillRect(20, 40, 3, 4);
      drawPixelText(ctx, '15S', 12, 49, { color: PALETTE.LAB_AMBER, outlineColor: PALETTE.OUTLINE });

      // Right side: Slick Ice block with red X (cannot grab)
      drawPixelBox(ctx, 82, 18, 22, 32, PALETTE.ICE_MID, PALETTE.OUTLINE, PALETTE.SNOW_BRIGHT);
      pxLine(ctx, 86, 23, 100, 37, PALETTE.KRUNKED_SCARF, 2);
      pxLine(ctx, 100, 23, 86, 37, PALETTE.KRUNKED_SCARF, 2);
      drawPixelText(ctx, 'NO ICE', 78, 52, { color: PALETTE.KRUNKED_SCARF, outlineColor: PALETTE.OUTLINE });
      break;
    }

    case 'Mines': {
      // Headlamp cones + 3-stage crumbling block sequence
      ctx.fillStyle = PALETTE.MINE_VOID;
      ctx.fillRect(3, 3, w - 6, h - 6);
      // Warm headlamp glow
      ctx.fillStyle = 'rgba(255, 206, 110, 0.25)';
      ctx.fillRect(10, 14, 46, 32);
      drawMiniPenguin(ctx, 20, 40, 'p1', 1, 'idle');
      ctx.fillStyle = PALETTE.LAB_AMBER;
      ctx.fillRect(24, 29, 2, 2);
      // 3 crumbling rock stages
      // Stage 1: intact
      drawPixelBox(ctx, 36, 40, 16, 12, PALETTE.MINE_BRICK, PALETTE.OUTLINE, PALETTE.MINE_WOOD);
      // Stage 2: cracked shaking
      drawPixelBox(ctx, 59, 41, 16, 12, PALETTE.MINE_DIRT, PALETTE.OUTLINE, PALETTE.LAB_AMBER);
      pxLine(ctx, 64, 42, 70, 51, PALETTE.OUTLINE, 1);
      pxLine(ctx, 69, 45, 73, 48, PALETTE.OUTLINE, 1);
      // Stage 3: crumbled debris
      ctx.fillStyle = PALETTE.MINE_BRICK;
      ctx.fillRect(86, 44, 4, 4);
      ctx.fillRect(94, 48, 5, 3);
      ctx.fillRect(90, 52, 4, 3);
      drawPixelText(ctx, '103M DARK', 6, 6, { color: PALETTE.LAB_AMBER, outlineColor: PALETTE.OUTLINE });
      drawPixelText(ctx, '1S->CRUMBLE', 50, 54, { color: PALETTE.SNOW_LIGHT, outlineColor: PALETTE.OUTLINE });
      break;
    }

    case 'Ice': {
      // Slick glacier floor + sliding speed trails + snow anchor stop at right
      drawPixelBox(ctx, 6, 40, 74, 14, PALETTE.ICE_MID, PALETTE.OUTLINE, PALETTE.SNOW_BRIGHT);
      pxLine(ctx, 14, 52, 24, 42, PALETTE.SNOW_BRIGHT, 1);
      pxLine(ctx, 44, 52, 54, 42, PALETTE.SNOW_BRIGHT, 1);
      drawSnowLedge(ctx, 80, 38, 34, 18);
      // Sliding penguin with motion lines
      ctx.fillStyle = PALETTE.ICE_LIGHT;
      ctx.fillRect(14, 32, 16, 1);
      ctx.fillRect(18, 36, 12, 1);
      drawMiniPenguin(ctx, 38, 40, 'p1', 1, 'idle');
      // Partner anchored on solid snow stop
      pxLine(ctx, 41, 35, 90, 34, PALETTE.ROPE_BASE, 1);
      drawMiniPenguin(ctx, 94, 38, 'p2', -1, 'anchor');
      drawPixelText(ctx, 'SLIDE 0.5S', 8, 8, { color: PALETTE.ICE_LIGHT, outlineColor: PALETTE.OUTLINE });
      drawPixelText(ctx, 'STOP!', 82, 14, { color: PALETTE.PINE_MOSS, outlineColor: PALETTE.OUTLINE });
      break;
    }

    case 'Wind': {
      // Cycle timing badge + gale lines pushing hanging SwingPlatform
      drawPixelText(ctx, '5S WIND / 5S REST', 8, 6, {
        color: PALETTE.LAB_CYAN,
        outlineColor: PALETTE.OUTLINE,
      });
      // Gale streaks
      ctx.fillStyle = PALETTE.SNOW_BRIGHT;
      ctx.fillRect(10, 22, 24, 1);
      ctx.fillRect(18, 30, 32, 1);
      ctx.fillRect(8, 40, 22, 1);
      // Direction arrows
      drawPixelText(ctx, '>>>', 12, 24, { color: PALETTE.LAB_AMBER, outlineColor: PALETTE.OUTLINE });
      // Hanging SwingPlatform pushed right
      ctx.fillStyle = PALETTE.LAB_AMBER;
      ctx.fillRect(68, 16, 4, 4);
      pxLine(ctx, 70, 19, 76, 44, PALETTE.ROPE_BASE, 1);
      pxLine(ctx, 70, 19, 102, 42, PALETTE.ROPE_BASE, 1);
      drawPixelBox(ctx, 73, 42, 32, 7, PALETTE.MINE_WOOD, PALETTE.OUTLINE, PALETTE.BEAK_MID);
      drawMiniPenguin(ctx, 84, 42, 'p1', 1, 'anchor');
      drawMiniPenguin(ctx, 96, 42, 'p2', 1, 'idle');
      break;
    }

    case 'Assist': {
      // Split panel: Left = Rope Pull, Right = Flag + Charlie Express
      ctx.fillStyle = PALETTE.CLIFF_MID;
      ctx.fillRect(59, 4, 1, h - 8);

      // Left: Pull Rope
      drawSnowLedge(ctx, 6, 26, 26, 32);
      pxLine(ctx, 29, 22, 42, 44, PALETTE.LAB_AMBER, 1);
      drawMiniPenguin(ctx, 24, 26, 'p1', 1, 'anchor');
      drawMiniPenguin(ctx, 43, 50, 'p2', -1, 'swing');
      drawPixelText(ctx, 'PULL', 8, 6, { color: PALETTE.LAB_AMBER, outlineColor: PALETTE.OUTLINE });
      // Up arrow
      pxLine(ctx, 49, 44, 49, 30, PALETTE.PINE_MOSS, 2);
      ctx.fillStyle = PALETTE.PINE_MOSS;
      ctx.fillRect(47, 32, 5, 1);

      // Right: Flag + Charlie Bird
      drawSnowLedge(ctx, 66, 44, 48, 14);
      // Flag
      ctx.fillStyle = PALETTE.MINE_WOOD;
      ctx.fillRect(74, 26, 2, 18);
      ctx.fillStyle = PALETTE.KRUNKED_SCARF;
      ctx.fillRect(76, 26, 8, 5);
      // Charlie flying bird carrying mini penguins
      ctx.fillStyle = PALETTE.SNOW_BRIGHT;
      ctx.fillRect(92, 16, 10, 6);
      ctx.fillStyle = PALETTE.LAB_AMBER;
      ctx.fillRect(102, 18, 3, 2);
      ctx.fillStyle = PALETTE.CLIFF_MID;
      ctx.fillRect(88, 14, 5, 3);
      ctx.fillRect(98, 13, 5, 3);
      pxLine(ctx, 97, 22, 97, 32, PALETTE.LAB_AMBER, 1);
      drawMiniPenguin(ctx, 97, 41, 'p1', 1, 'swing');
      drawPixelText(ctx, 'CHARLIE', 66, 6, { color: PALETTE.LAB_CYAN, outlineColor: PALETTE.OUTLINE });
      break;
    }

    case 'Emotes': {
      // Split panel: Left = Sync Clap, Right = Rock Paper Scissors
      ctx.fillStyle = PALETTE.CLIFF_MID;
      ctx.fillRect(59, 4, 1, h - 8);

      drawSnowLedge(ctx, 6, 46, 48, 12);
      drawMiniPenguin(ctx, 20, 44, 'p1', 1, 'clap');
      drawMiniPenguin(ctx, 40, 44, 'p2', -1, 'clap');
      drawSparkle(ctx, 30, 26, PALETTE.LAB_AMBER);
      drawPixelText(ctx, 'CLAP!', 14, 8, { color: PALETTE.LAB_AMBER, outlineColor: PALETTE.OUTLINE });

      // RPS badges
      drawPixelText(ctx, 'R-P-S', 74, 8, { color: PALETTE.LAB_CYAN, outlineColor: PALETTE.OUTLINE });
      drawPixelBox(ctx, 66, 22, 14, 14, PALETTE.ROPE_BASE, PALETTE.OUTLINE, PALETTE.SNOW_BRIGHT);
      drawPixelText(ctx, 'R', 71, 26, { color: PALETTE.OUTLINE, outlineColor: null });
      drawPixelBox(ctx, 84, 22, 14, 14, PALETTE.SNOW_BRIGHT, PALETTE.OUTLINE);
      drawPixelText(ctx, 'P', 89, 26, { color: PALETTE.OUTLINE, outlineColor: null });
      drawPixelBox(ctx, 102, 22, 14, 14, PALETTE.LAB_AMBER, PALETTE.OUTLINE, PALETTE.SNOW_BRIGHT);
      drawPixelText(ctx, 'S', 107, 26, { color: PALETTE.OUTLINE, outlineColor: null });
      drawPixelText(ctx, 'PRESS E', 68, 46, { color: PALETTE.SNOW_LIGHT, outlineColor: PALETTE.OUTLINE });
      break;
    }
  }
}

export function renderManualDiagram(id: ManualPageId, scale = 2): string {
  if (!canUseCanvas()) return '';
  const key = `${id}@${scale}`;
  const cached = manualCache.get(key);
  if (cached) return cached;

  const { canvas, ctx } = makeCanvas(MANUAL_NATIVE_W, MANUAL_NATIVE_H);
  drawManualScene(ctx, id);
  const url = upscaleToDataUrl(canvas, scale);
  manualCache.set(key, url);
  return url;
}

export function getAllManualDiagramUrls(scale = 2): Record<ManualPageId, string> {
  const out = {} as Record<ManualPageId, string>;
  for (let i = 0; i < MANUAL_PAGE_IDS.length; i++) {
    const id = MANUAL_PAGE_IDS[i];
    out[id] = renderManualDiagram(id, scale);
  }
  return out;
}

// ============================================================================
// 3. Skin Closet Preview Renderers (Co-Op Skins, Jeff Skins, 12 Rope Skins)
// ============================================================================

export function renderCoopSkinPreview(
  who: 'p1' | 'p2',
  skin: CoopSkinId,
  scale = 3,
  atlasOverride?: ProceduralPixelAtlas
): string {
  if (!canUseCanvas()) return '';
  const key = `${who}:${skin}@${scale}`;
  const cached = coopSkinCache.get(key);
  if (cached && !atlasOverride) return cached;

  const atlas = getSharedAtlas(atlasOverride);
  const set = atlas.getPenguinSet(who, skin);
  const bodyRect = set.frames.Idle[0];
  const handRect = set.handFrames.Idle[0];

  const { canvas, ctx } = makeCanvas(32, 32);
  // Subtle alpine medallion backdrop
  ctx.fillStyle = PALETTE.SKY_DEEP;
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = PALETTE.NIGHT_PURPLE;
  ctx.fillRect(2, 2, 28, 20);
  // Snow ground strip under feet
  ctx.fillStyle = PALETTE.SNOW_LIGHT;
  ctx.fillRect(2, 25, 28, 5);
  ctx.fillStyle = PALETTE.SNOW_BRIGHT;
  ctx.fillRect(2, 24, 28, 2);

  // Cute trailing scarf tail behind penguin
  pxLine(ctx, 13, 16, 6, 17, PALETTE.OUTLINE, 4);
  pxLine(ctx, 13, 16, 6, 17, set.palette.scarfMain, 2);
  ctx.fillStyle = set.palette.scarfDark;
  ctx.fillRect(6, 17, 3, 1);

  // Authentic hand-pixeled body + foreground hands overlay
  ctx.drawImage(bodyRect.sheet, bodyRect.x, bodyRect.y, 32, 32, 0, 0, 32, 32);
  ctx.drawImage(handRect.sheet, handRect.x, handRect.y, 32, 32, 0, 0, 32, 32);

  // Crisp border tinted with player accent
  ctx.strokeStyle = set.palette.scarfMain;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, 31, 31);

  const url = upscaleToDataUrl(canvas, scale);
  if (!atlasOverride) {
    coopSkinCache.set(key, url);
  }
  return url;
}

export function renderJeffSkinPreview(
  skin: JeffSkinId,
  scale = 4,
  atlasOverride?: ProceduralPixelAtlas
): string {
  if (!canUseCanvas()) return '';
  const key = `${skin}@${scale}`;
  const cached = jeffSkinCache.get(key);
  if (cached && !atlasOverride) return cached;

  const atlas = getSharedAtlas(atlasOverride);
  const rect = atlas.getJeffSprite(skin);

  const { canvas, ctx } = makeCanvas(24, 24);
  ctx.fillStyle = PALETTE.SKY_DEEP;
  ctx.fillRect(0, 0, 24, 24);
  ctx.fillStyle = PALETTE.NIGHT_PURPLE;
  ctx.fillRect(2, 2, 20, 15);
  ctx.fillStyle = PALETTE.SNOW_LIGHT;
  ctx.fillRect(2, 18, 20, 4);
  ctx.fillStyle = PALETTE.SNOW_BRIGHT;
  ctx.fillRect(2, 17, 20, 2);

  ctx.drawImage(rect.sheet, rect.x, rect.y, rect.w, rect.h, 2, 2, rect.w, rect.h);

  ctx.strokeStyle = PALETTE.ROPE_BASE;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, 23, 23);

  const url = upscaleToDataUrl(canvas, scale);
  if (!atlasOverride) {
    jeffSkinCache.set(key, url);
  }
  return url;
}

/**
 * Draws a distinct styled Verlet rope segment across a list of (x, y) pixel
 * points. Shared between CollectibleArt preview baking and GameRenderer!
 */
export function drawStyledRopePoints(
  ctx: CanvasRenderingContext2D,
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  count: number,
  skin: RopeSkinId,
  animClock: number,
  isTaut: boolean
): void {
  if (count < 2) return;
  const style = ROPE_SKIN_STYLES[skin] ?? ROPE_SKIN_STYLES.Default;

  // Pass 1: Outer dark #222034 casing (or super aura)
  const outlineWidth =
    style.pattern === 'plush_tail' || style.pattern === 'sausage_links' ? 4 : 3;
  for (let i = 0; i < count - 1; i++) {
    pxLine(ctx, xs[i], ys[i], xs[i + 1], ys[i + 1], PALETTE.OUTLINE, outlineWidth);
  }

  // Pass 2: Distinct per-skin braided / themed inner strand
  const pulseIdx = Math.floor(animClock * 22) % Math.max(2, count);
  for (let i = 0; i < count - 1; i++) {
    const ax = xs[i];
    const ay = ys[i];
    const bx = xs[i + 1];
    const by = ys[i + 1];

    switch (style.pattern) {
      case 'braid': {
        const col = isTaut
          ? (i & 1) === 0
            ? PALETTE.LAB_AMBER
            : PALETTE.SNOW_BRIGHT
          : (i & 1) === 0
            ? style.primary
            : style.secondary;
        pxLine(ctx, ax, ay, bx, by, col, 1);
        break;
      }

      case 'plush_tail': {
        // Striped fluffy orange/white woodland tail bands
        const band = ((i >> 1) & 1) === 0;
        pxLine(ctx, ax, ay, bx, by, band ? style.primary : style.secondary, 2);
        if (i % 4 === 0) {
          ctx.fillStyle = style.accent;
          ctx.fillRect(ax - 1, ay - 2, 1, 1);
          ctx.fillRect(ax + 1, ay + 1, 1, 1);
        }
        break;
      }

      case 'twine_knots': {
        // Parcel string with periodic reinforced square kraft knots
        pxLine(ctx, ax, ay, bx, by, (i & 1) === 0 ? style.primary : style.secondary, 1);
        if (i > 0 && i % 5 === 0) {
          ctx.fillStyle = PALETTE.OUTLINE;
          ctx.fillRect(ax - 2, ay - 2, 5, 5);
          ctx.fillStyle = style.secondary;
          ctx.fillRect(ax - 1, ay - 1, 3, 3);
          ctx.fillStyle = style.accent;
          ctx.fillRect(ax - 1, ay - 1, 1, 1);
        }
        break;
      }

      case 'pretzel_salt': {
        // Golden dough twist with white coarse salt crystals
        pxLine(ctx, ax, ay, bx, by, i % 3 === 0 ? style.secondary : style.primary, 2);
        if (i % 4 === 2) {
          ctx.fillStyle = style.accent;
          ctx.fillRect(ax, ay - 1, 1, 1);
        }
        break;
      }

      case 'kelp_bobbers': {
        // Sea-kelp green cord + red/white fishing bobber floats
        pxLine(ctx, ax, ay, bx, by, (i & 1) === 0 ? style.primary : style.secondary, 1);
        if (i > 1 && i % 7 === 0) {
          ctx.fillStyle = PALETTE.OUTLINE;
          ctx.fillRect(ax - 2, ay - 2, 5, 5);
          ctx.fillStyle = style.accent;
          ctx.fillRect(ax - 1, ay - 1, 3, 2);
          ctx.fillStyle = PALETTE.SNOW_BRIGHT;
          ctx.fillRect(ax - 1, ay + 1, 3, 1);
        } else if (i % 3 === 0) {
          ctx.fillStyle = style.primary;
          ctx.fillRect(ax, ay - 2, 1, 1);
        }
        break;
      }

      case 'berry_vine': {
        // Green vine with crimson berries and alternating tiny leaves
        pxLine(ctx, ax, ay, bx, by, i % 2 === 0 ? style.primary : style.secondary, 1);
        if (i > 0 && i % 5 === 0) {
          ctx.fillStyle = PALETTE.OUTLINE;
          ctx.fillRect(ax - 2, ay - 2, 4, 4);
          ctx.fillStyle = style.accent;
          ctx.fillRect(ax - 1, ay - 1, 2, 2);
          ctx.fillStyle = PALETTE.SNOW_BRIGHT;
          ctx.fillRect(ax - 1, ay - 1, 1, 1);
        } else if (i % 5 === 2) {
          ctx.fillStyle = style.primary;
          ctx.fillRect(ax, ay + ((i & 1) === 0 ? -2 : 2), 2, 1);
        }
        break;
      }

      case 'prism_spiral': {
        // High-contrast alternating Krunked crimson & Fred emerald barber-pole helix
        const phase = i % 4;
        const col =
          phase === 0 || phase === 1
            ? style.primary
            : phase === 2
              ? style.secondary
              : style.accent;
        pxLine(ctx, ax, ay, bx, by, col, 2);
        break;
      }

      case 'steel_chain': {
        // Interlocking forged iron chain links
        pxLine(ctx, ax, ay, bx, by, style.secondary, 1);
        if (i % 3 === 0) {
          ctx.fillStyle = PALETTE.OUTLINE;
          ctx.fillRect(ax - 2, ay - 2, 5, 5);
          ctx.fillStyle = style.primary;
          ctx.fillRect(ax - 1, ay - 1, 3, 3);
          ctx.fillStyle = PALETTE.OUTLINE;
          ctx.fillRect(ax, ay, 1, 1);
          ctx.fillStyle = style.accent;
          ctx.fillRect(ax - 1, ay - 1, 1, 1);
        }
        break;
      }

      case 'sausage_links': {
        // Plump reddish-brown sausage links pinched at every 5th node
        const isPinch = i % 5 === 0;
        if (isPinch) {
          pxLine(ctx, ax, ay, bx, by, style.accent, 1);
        } else {
          pxLine(ctx, ax, ay, bx, by, style.primary, 2);
          ctx.fillStyle = style.secondary;
          ctx.fillRect(ax, ay - 1, 1, 1);
        }
        break;
      }

      case 'power_conduit': {
        // Insulated lab conduit with animated travelling cyan telemetry pulses
        const distPulse = Math.abs(i - pulseIdx);
        const isPulse = distPulse <= 1 || Math.abs(i - ((pulseIdx + (count >> 1)) % count)) <= 1;
        pxLine(ctx, ax, ay, bx, by, isPulse ? style.primary : style.secondary, 1);
        if (isPulse) {
          ctx.fillStyle = style.accent;
          ctx.fillRect(ax, ay, 2, 2);
        } else if (i % 6 === 0) {
          ctx.fillStyle = style.primary;
          ctx.fillRect(ax - 1, ay - 1, 3, 3);
        }
        break;
      }

      case 'spine_bones': {
        // Pale articulated vertebrae bone links
        pxLine(ctx, ax, ay, bx, by, style.secondary, 1);
        if (i > 0 && i % 4 === 0) {
          ctx.fillStyle = PALETTE.OUTLINE;
          ctx.fillRect(ax - 2, ay - 2, 5, 5);
          ctx.fillStyle = style.primary;
          ctx.fillRect(ax - 1, ay - 1, 3, 3);
          ctx.fillStyle = style.secondary;
          ctx.fillRect(ax, ay + 1, 1, 1);
        }
        break;
      }

      case 'laser_tether': {
        // Crackling golden-amber heroic energy beam with animated sparks
        const jitter = Math.round(Math.sin(animClock * 28 + i * 2.1));
        pxLine(ctx, ax, ay, bx, by, style.accent, 3);
        pxLine(ctx, ax, ay, bx, by, style.primary, 2);
        pxLine(ctx, ax, ay + (i % 3 === 0 ? jitter : 0), bx, by, style.secondary, 1);
        break;
      }
    }

    // Crisp taut-tension glint overlay so gameplay tension always reads clearly
    if (isTaut && style.pattern !== 'braid' && ((i + Math.floor(animClock * 18)) % 6) === 0) {
      ctx.fillStyle = PALETTE.SNOW_BRIGHT;
      ctx.fillRect(ax, ay, 2, 1);
    }
  }
}

export function renderRopeSkinPreview(skin: RopeSkinId, scale = 2): string {
  if (!canUseCanvas()) return '';
  const key = `${skin}@${scale}`;
  const cached = ropeSkinCache.get(key);
  if (cached) return cached;

  const w = 64;
  const h = 24;
  const { canvas, ctx } = makeCanvas(w, h);
  const style = ROPE_SKIN_STYLES[skin] ?? ROPE_SKIN_STYLES.Default;

  // Dark alpine swatch backdrop
  ctx.fillStyle = PALETTE.SKY_DEEP;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = PALETTE.NIGHT_PURPLE;
  ctx.fillRect(2, 2, w - 4, h - 4);

  // Sample 19-point gentle catenary curve
  const count = 19;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    xs.push(Math.round(6 + t * (w - 12)));
    ys.push(Math.round(10 + Math.sin(t * Math.PI) * 5));
  }

  drawStyledRopePoints(ctx, xs, ys, count, skin, 0.35, false);

  // Brass anchor rings at both ends
  ctx.fillStyle = PALETTE.OUTLINE;
  ctx.fillRect(4, 8, 5, 5);
  ctx.fillRect(w - 9, 8, 5, 5);
  ctx.fillStyle = PALETTE.LAB_AMBER;
  ctx.fillRect(5, 9, 3, 3);
  ctx.fillRect(w - 8, 9, 3, 3);
  ctx.fillStyle = PALETTE.OUTLINE;
  ctx.fillRect(6, 10, 1, 1);
  ctx.fillRect(w - 7, 10, 1, 1);

  ctx.strokeStyle = style.primary;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

  const url = upscaleToDataUrl(canvas, scale);
  ropeSkinCache.set(key, url);
  return url;
}

export function clearCollectibleArtCache(): void {
  photoCache.clear();
  manualCache.clear();
  coopSkinCache.clear();
  jeffSkinCache.clear();
  ropeSkinCache.clear();
}
