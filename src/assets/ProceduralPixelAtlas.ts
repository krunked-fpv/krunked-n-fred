// ============================================================================
// Krunked & Fred — Hand-Pixeled Procedural Sprite & Auto-Tile Atlas
// Pre-baked ONCE at init into compact offscreen canvases (ZERO per-frame allocs).
// Exact extracted PALETTE from src/contracts/index.ts.
// ============================================================================

import {
  ANIM_FRAMES,
  PALETTE,
  type CoopSkinId,
  type JeffSkinId,
  type TerrainType,
  type TileKind,
} from '../contracts';

export type PenguinAnimName =
  | keyof typeof ANIM_FRAMES
  | 'FallHard'
  | 'LandHard';

export const PENGUIN_ANIM_COUNTS: Record<PenguinAnimName, number> = {
  ...ANIM_FRAMES,
  FallHard: 2,
  LandHard: 2,
};

export const PENGUIN_ANIM_ORDER: readonly PenguinAnimName[] = [
  'Idle',
  'Walk',
  'WalkWind',
  'Jump',
  'Fall',
  'FallHard',
  'LandHard',
  'Grab',
  'Swing',
  'Anchor',
  'Drag',
  'PullRope',
  'PlaceFlag',
  'CallCharlie',
  'Clap',
  'RPS',
] as const;

export type TileVisualGroup =
  | 'snow'
  | 'ice'
  | 'mine'
  | 'platform'
  | 'lab'
  | 'krunked_only'
  | 'fred_only';

export interface SpriteRect {
  sheet: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PenguinSkinPalette {
  bodyMain: string;
  bodyDark: string;
  bodyShine: string;
  bellyWhite: string;
  bellyShade: string;
  beakBright: string;
  beakMid: string;
  scarfMain: string;
  scarfDark: string;
  cheek: string;
  eyeColor: string;
  hat: CoopSkinId;
}

export interface PenguinSpriteSet {
  bodySheet: HTMLCanvasElement;
  handsSheet: HTMLCanvasElement;
  frames: Record<PenguinAnimName, SpriteRect[]>;
  handFrames: Record<PenguinAnimName, SpriteRect[]>;
  palette: PenguinSkinPalette;
}

// ============================================================================
// Crisp Offscreen PixelGrid Builder (used ONLY during pre-bake!)
// ============================================================================

class PixelGrid {
  readonly w: number;
  readonly h: number;
  private readonly pixels: (string | null)[];

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.pixels = new Array<string | null>(w * h).fill(null);
  }

  clear(): void {
    this.pixels.fill(null);
  }

  set(x: number, y: number, color: string | null): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || ix >= this.w || iy < 0 || iy >= this.h) return;
    this.pixels[iy * this.w + ix] = color;
  }

  get(x: number, y: number): string | null {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return null;
    return this.pixels[y * this.w + x];
  }

  rect(x: number, y: number, w: number, h: number, color: string | null): void {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    const x1 = x0 + Math.round(w);
    const y1 = y0 + Math.round(h);
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        this.set(px, py, color);
      }
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, color: string): void {
    const x0 = Math.floor(cx - rx - 1);
    const x1 = Math.ceil(cx + rx + 1);
    const y0 = Math.floor(cy - ry - 1);
    const y1 = Math.ceil(cy + ry + 1);
    const invRx2 = rx > 0 ? 1 / (rx * rx) : 1;
    const invRy2 = ry > 0 ? 1 / (ry * ry) : 1;
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dx = px - cx;
        const dy = py - cy;
        if (dx * dx * invRx2 + dy * dy * invRy2 <= 1.0) {
          this.set(px, py, color);
        }
      }
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, color: string): void {
    let ix0 = Math.round(x0);
    let iy0 = Math.round(y0);
    const ix1 = Math.round(x1);
    const iy1 = Math.round(y1);
    const dx = Math.abs(ix1 - ix0);
    const dy = Math.abs(iy1 - iy0);
    const sx = ix0 < ix1 ? 1 : -1;
    const sy = iy0 < iy1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      this.set(ix0, iy0, color);
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

  /** Applies exact 1px 4-neighbor outline on transparent pixels bordering opaque pixels. */
  applyOutline(outlineColor: string = PALETTE.OUTLINE): void {
    const toOutline: number[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const idx = y * this.w + x;
        if (this.pixels[idx] !== null) continue;
        if (
          (x > 0 && this.pixels[idx - 1] !== null) ||
          (x < this.w - 1 && this.pixels[idx + 1] !== null) ||
          (y > 0 && this.pixels[idx - this.w] !== null) ||
          (y < this.h - 1 && this.pixels[idx + this.w] !== null)
        ) {
          toOutline.push(idx);
        }
      }
    }
    for (let i = 0; i < toOutline.length; i++) {
      this.pixels[toOutline[i]] = outlineColor;
    }
  }

  blitTo(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    for (let y = 0; y < this.h; y++) {
      let x = 0;
      while (x < this.w) {
        const col = this.pixels[y * this.w + x];
        if (col === null) {
          x++;
          continue;
        }
        const start = x;
        while (x < this.w && this.pixels[y * this.w + x] === col) x++;
        ctx.fillStyle = col;
        ctx.fillRect(ox + start, oy + y, x - start, 1);
      }
    }
  }
}

function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function get2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create 2D context for procedural atlas');
  }
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

// ============================================================================
// Skin Palette Builder (All 16 Co-Op Skins)
// ============================================================================

export function resolvePenguinSkinPalette(
  who: 'p1' | 'p2',
  skin: CoopSkinId
): PenguinSkinPalette {
  const isP1 = who === 'p1';
  const base: PenguinSkinPalette = {
    bodyMain: PALETTE.BODY_MAIN,
    bodyDark: PALETTE.BODY_DARK,
    bodyShine: PALETTE.CLIFF_MID,
    bellyWhite: PALETTE.BELLY_WHITE,
    bellyShade: PALETTE.BELLY_SHADE,
    beakBright: PALETTE.BEAK_BRIGHT,
    beakMid: PALETTE.BEAK_MID,
    scarfMain: isP1 ? PALETTE.KRUNKED_SCARF : PALETTE.FRED_SCARF,
    scarfDark: isP1 ? PALETTE.KRUNKED_SCARF_DARK : PALETTE.FRED_SCARF_DARK,
    cheek: '#ec7c98',
    eyeColor: PALETTE.OUTLINE,
    hat: skin,
  };

  switch (skin) {
    case 'Knight':
      return { ...base, bodyMain: PALETTE.LAB_STEEL, bodyDark: PALETTE.LAB_WALL, bodyShine: PALETTE.LAB_HIGHLIGHT };
    case 'Robot':
      return {
        ...base,
        bodyMain: '#4d657a',
        bodyDark: '#26384d',
        bodyShine: PALETTE.LAB_HIGHLIGHT,
        bellyWhite: '#d5e4ee',
        bellyShade: PALETTE.ROPE_BASE,
        beakBright: PALETTE.LAB_AMBER,
        eyeColor: PALETTE.LAB_CYAN,
      };
    case 'Pot':
      return { ...base, bodyMain: '#4a4768', bodyDark: '#2f2c48' };
    case 'Skeleton':
      return {
        ...base,
        bodyMain: '#28253b',
        bodyDark: '#1b182a',
        bodyShine: '#45415e',
        bellyWhite: '#ffffff',
        bellyShade: '#cadafb',
      };
    case 'Bread':
      return {
        ...base,
        bodyMain: '#c97e38',
        bodyDark: '#8f563b',
        bodyShine: '#e8a855',
        bellyWhite: '#fbe4b2',
        bellyShade: '#e3be80',
      };
    case 'Inverted':
      return {
        ...base,
        bodyMain: PALETTE.SNOW_LIGHT,
        bodyDark: PALETTE.ROPE_BASE,
        bodyShine: PALETTE.SNOW_BRIGHT,
        bellyWhite: PALETTE.BODY_MAIN,
        bellyShade: PALETTE.BODY_DARK,
      };
    case 'Fish':
      return {
        ...base,
        bodyMain: '#2b8ea8',
        bodyDark: '#1c566e',
        bodyShine: PALETTE.LAB_CYAN,
        bellyWhite: '#e6f9ff',
        bellyShade: '#a6e0f0',
      };
    case 'Box':
      return {
        ...base,
        bodyMain: '#a36b42',
        bodyDark: '#7a4537',
        bodyShine: '#c78c5d',
      };
    case 'Fruit':
      return {
        ...base,
        bodyMain: isP1 ? '#c7344f' : '#40cc8c',
        bodyDark: isP1 ? '#810b3d' : '#1a412d',
        bodyShine: isP1 ? '#f2728c' : '#89f0be',
      };
    case 'Animals':
      return {
        ...base,
        bodyMain: isP1 ? '#b86234' : '#7a5948',
        bodyDark: '#55342e',
        bodyShine: '#df7126',
        bellyWhite: '#fae9d7',
        bellyShade: '#d9bfa7',
      };
    case 'SuperHero':
      return {
        ...base,
        bodyMain: isP1 ? '#364fa3' : '#256b6e',
        bodyDark: '#232f66',
        bodyShine: '#6d58b7',
        scarfMain: isP1 ? PALETTE.KRUNKED_SCARF : PALETTE.LAB_AMBER,
        scarfDark: isP1 ? PALETTE.KRUNKED_SCARF_DARK : PALETTE.BEAK_BRIGHT,
      };
    case 'Christmas':
      return { ...base, scarfMain: '#d11651', scarfDark: '#810b3d' };
    case 'Detective':
      return { ...base, bodyMain: '#595066', bodyDark: '#383044', bodyShine: '#847896' };
    case 'Halloween':
      return {
        ...base,
        bodyMain: '#382447',
        bodyDark: '#241430',
        bodyShine: '#6d58b7',
        beakBright: PALETTE.LAB_AMBER,
        scarfMain: '#df7126',
        scarfDark: '#8f563b',
      };
    case 'Nuclear':
      return {
        ...base,
        bodyMain: '#d6a929',
        bodyDark: '#8f6916',
        bodyShine: '#ffe169',
        bellyWhite: '#26384d',
        bellyShade: '#141e2e',
        eyeColor: PALETTE.LAB_CYAN,
      };
    case 'Default':
    default:
      return base;
  }
}

// ============================================================================
// Hand-Pixeled 32x32 Penguin Sprite & Hands Renderer
// Feet sit cleanly on row y = 24..25 so world feet (y - 0.56125) rest on tiles!
// ============================================================================

interface PenguinPose {
  cx: number;
  cy: number;
  bodyRx: number;
  bodyRy: number;
  headOffX: number;
  headOffY: number;
  headRx: number;
  headRy: number;
  leanX: number;
  leftFootX: number;
  leftFootY: number;
  rightFootX: number;
  rightFootY: number;
  eyeStyle: 'normal' | 'blink' | 'determined' | 'wide' | 'dizzy' | 'happy';
  beakOpen: boolean;
  handMode:
    | 'side'
    | 'walk'
    | 'raised'
    | 'flap'
    | 'grab'
    | 'anchor'
    | 'pull'
    | 'flag'
    | 'call'
    | 'clap'
    | 'rps_rock'
    | 'rps_paper'
    | 'rps_scissors'
    | 'splat';
  handPhase: number;
  dizzyStars?: boolean;
  sparkle?: boolean;
}

function buildPose(anim: PenguinAnimName, frame: number, isP2: boolean): PenguinPose {
  const fredPlump = isP2 ? 0.45 : 0;
  const base: PenguinPose = {
    cx: 16,
    cy: 19,
    bodyRx: 5.5 + fredPlump,
    bodyRy: 5.2,
    headOffX: 0,
    headOffY: -6,
    headRx: 4.8 + fredPlump * 0.5,
    headRy: 4.2,
    leanX: 0,
    leftFootX: 13,
    leftFootY: 24,
    rightFootX: 18,
    rightFootY: 24,
    eyeStyle: 'normal',
    beakOpen: false,
    handMode: 'side',
    handPhase: frame,
  };

  switch (anim) {
    case 'Idle': {
      const bob = frame === 1 ? 1 : 0;
      return {
        ...base,
        cy: 19 + bob * 0.4,
        bodyRx: base.bodyRx + bob * 0.3,
        bodyRy: base.bodyRy - bob * 0.25,
        headOffY: -6 + bob,
        eyeStyle: frame === 1 && isP2 ? 'normal' : 'normal',
      };
    }
    case 'Walk': {
      const phase = (frame / 8) * Math.PI * 2;
      const stride = Math.sin(phase) * 3.2;
      const liftL = Math.max(0, Math.cos(phase)) * 1.8;
      const liftR = Math.max(0, -Math.cos(phase)) * 1.8;
      const bob = Math.abs(Math.sin(phase)) * -1.2;
      return {
        ...base,
        cy: 19 + bob,
        headOffX: 0.6,
        headOffY: -6 + bob * 0.5,
        leanX: 0.8,
        leftFootX: 15 - stride,
        leftFootY: 24 - liftL,
        rightFootX: 16 + stride,
        rightFootY: 24 - liftR,
        handMode: 'walk',
        handPhase: frame,
      };
    }
    case 'WalkWind': {
      const phase = (frame / 8) * Math.PI * 2;
      const stride = Math.sin(phase) * 2.8;
      const bob = Math.abs(Math.sin(phase)) * -0.9;
      return {
        ...base,
        cx: 16,
        cy: 19.5 + bob,
        bodyRy: 4.8,
        headOffX: 2.3,
        headOffY: -5.2 + bob * 0.5,
        leanX: 2.2,
        leftFootX: 14 - stride,
        leftFootY: 24,
        rightFootX: 17 + stride,
        rightFootY: 24 - Math.max(0, -Math.cos(phase)) * 1.3,
        eyeStyle: 'determined',
        handMode: 'walk',
        handPhase: frame,
      };
    }
    case 'Jump': {
      return {
        ...base,
        cy: 18,
        bodyRx: 4.8 + fredPlump * 0.6,
        bodyRy: 5.8,
        headOffX: 0.5,
        headOffY: -6.8,
        leftFootX: 13.5,
        leftFootY: 24.5,
        rightFootX: 17.5,
        rightFootY: 23.5,
        eyeStyle: 'happy',
        beakOpen: true,
        handMode: 'raised',
      };
    }
    case 'Fall': {
      const kick = frame === 0 ? 1.5 : -1.5;
      return {
        ...base,
        cy: 18.5,
        bodyRx: 5.3 + fredPlump,
        bodyRy: 5.2,
        headOffY: -5.8,
        leftFootX: 12.5 + kick,
        leftFootY: 24.5 - (frame === 0 ? 1 : 0),
        rightFootX: 18.5 - kick,
        rightFootY: 24.5 - (frame === 1 ? 1 : 0),
        eyeStyle: 'wide',
        handMode: 'flap',
        handPhase: frame,
      };
    }
    case 'FallHard': {
      const kick = frame === 0 ? 2 : -2;
      return {
        ...base,
        cy: 18.2,
        bodyRx: 5.6 + fredPlump,
        bodyRy: 4.9,
        headOffX: frame === 0 ? -0.6 : 0.6,
        headOffY: -5.4,
        leftFootX: 12 + kick,
        leftFootY: 23.5,
        rightFootX: 19 - kick,
        rightFootY: 24.5,
        eyeStyle: 'wide',
        beakOpen: true,
        handMode: 'flap',
        handPhase: frame,
      };
    }
    case 'LandHard': {
      // Hilarious squashed belly-flop pancake with dizzy stars
      return {
        ...base,
        cx: 16,
        cy: 22.2,
        bodyRx: 7.4 + fredPlump * 0.5,
        bodyRy: 3.1,
        headOffX: 3.2,
        headOffY: -2.2,
        headRx: 4.4,
        headRy: 3.3,
        leanX: 1.5,
        leftFootX: 9.5,
        leftFootY: 24,
        rightFootX: 12.5,
        rightFootY: 24.5,
        eyeStyle: 'dizzy',
        handMode: 'splat',
        handPhase: frame,
        dizzyStars: true,
      };
    }
    case 'Grab': {
      const strain = frame % 2 === 0 ? 0 : 0.5;
      return {
        ...base,
        cx: 16.5,
        cy: 19 + strain,
        bodyRx: 5.0 + fredPlump * 0.7,
        bodyRy: 5.3,
        headOffX: 1.0,
        headOffY: -6.0 + strain,
        leanX: 1.2,
        leftFootX: 14,
        leftFootY: 24,
        rightFootX: 19,
        rightFootY: 23.2 - (frame % 3 === 0 ? 0.7 : 0),
        eyeStyle: 'determined',
        handMode: 'grab',
        handPhase: frame,
      };
    }
    case 'Swing': {
      const sway = frame === 0 ? -0.8 : 0.8;
      return {
        ...base,
        cx: 16,
        cy: 18.5,
        bodyRx: 5.0 + fredPlump * 0.6,
        bodyRy: 5.4,
        headOffX: sway * 0.5,
        headOffY: -6.0,
        leftFootX: 13.5 - sway,
        leftFootY: 24.5,
        rightFootX: 18 - sway,
        rightFootY: 24.5,
        eyeStyle: 'happy',
        handMode: 'raised',
        handPhase: frame,
      };
    }
    case 'Anchor': {
      const brace = frame === 1 ? 0.5 : 0;
      return {
        ...base,
        cx: 16,
        cy: 20.6 + brace * 0.4,
        bodyRx: 6.5 + fredPlump,
        bodyRy: 4.3,
        headOffX: 0.4,
        headOffY: -4.8 + brace,
        leftFootX: 11.5,
        leftFootY: 24.3,
        rightFootX: 20.5,
        rightFootY: 24.3,
        eyeStyle: 'determined',
        handMode: 'anchor',
        handPhase: frame,
      };
    }
    case 'Drag': {
      const tug = Math.sin((frame / 6) * Math.PI * 2) * 1.1;
      return {
        ...base,
        cx: 15.2 - tug * 0.4,
        cy: 20.0,
        bodyRx: 5.6 + fredPlump,
        bodyRy: 4.7,
        headOffX: -2.2,
        headOffY: -5.3,
        leanX: -2.4,
        leftFootX: 13,
        leftFootY: 24.2,
        rightFootX: 18.5,
        rightFootY: 24.2,
        eyeStyle: 'wide',
        beakOpen: frame % 2 === 0,
        handMode: 'pull',
        handPhase: frame,
      };
    }
    case 'PullRope': {
      const heave = Math.sin((frame / 5) * Math.PI * 2) * 1.8;
      return {
        ...base,
        cx: 15.5 - heave * 0.5,
        cy: 19.8,
        bodyRx: 5.7 + fredPlump,
        bodyRy: 4.9,
        headOffX: -1.4 - heave * 0.4,
        headOffY: -5.5,
        leanX: -1.6,
        leftFootX: 12.5,
        leftFootY: 24.2,
        rightFootX: 18.5,
        rightFootY: 24.2,
        eyeStyle: 'determined',
        handMode: 'pull',
        handPhase: frame,
      };
    }
    case 'PlaceFlag': {
      const lift = frame >= 2 && frame <= 4 ? -1.0 : 0;
      return {
        ...base,
        cy: 19 + lift * 0.5,
        headOffY: -6 + lift,
        eyeStyle: 'happy',
        handMode: 'flag',
        handPhase: frame,
        sparkle: frame >= 4,
      };
    }
    case 'CallCharlie': {
      const hop = frame % 2 === 1 ? -1.2 : 0;
      return {
        ...base,
        cy: 18.8 + hop,
        headOffX: 0.4,
        headOffY: -6.4 + hop,
        eyeStyle: 'happy',
        beakOpen: true,
        handMode: 'call',
        handPhase: frame,
      };
    }
    case 'Clap': {
      const hop = frame % 4 < 2 ? -1.4 : 0;
      return {
        ...base,
        cy: 19 + hop,
        headOffY: -6 + hop,
        eyeStyle: 'happy',
        beakOpen: frame % 4 === 1,
        handMode: 'clap',
        handPhase: frame,
        sparkle: frame % 4 === 1,
      };
    }
    case 'RPS': {
      const mode =
        frame <= 1 ? 'clap' : frame === 2 ? 'rps_rock' : frame === 3 ? 'rps_paper' : 'rps_scissors';
      const bob = frame === 1 ? -1.4 : 0;
      return {
        ...base,
        cy: 19 + bob,
        headOffY: -6 + bob,
        eyeStyle: 'determined',
        handMode: mode,
        handPhase: frame,
      };
    }
  }
}

function drawSkinHat(
  grid: PixelGrid,
  hx: number,
  hy: number,
  who: 'p1' | 'p2',
  pal: PenguinSkinPalette
): void {
  const isP1 = who === 'p1';
  switch (pal.hat) {
    case 'Default': {
      if (isP1) {
        // Krunked: crisp crimson headband + energetic spiky crown tuft!
        grid.rect(hx - 4, hy - 2, 9, 2, pal.scarfMain);
        grid.rect(hx - 4, hy - 1, 9, 1, pal.scarfDark);
        // Little headband knot at back
        grid.set(hx - 5, hy - 2, pal.scarfMain);
        grid.set(hx - 6, hy - 1, pal.scarfDark);
        // Spiky tuft
        grid.set(hx - 1, hy - 5, pal.bodyMain);
        grid.set(hx, hy - 5, pal.bodyShine);
        grid.set(hx + 1, hy - 4, pal.bodyMain);
      } else {
        // Fred: plumper cozy rounded crest + emerald accent tuft
        grid.rect(hx - 2, hy - 5, 4, 2, pal.bodyMain);
        grid.set(hx - 1, hy - 5, pal.bodyShine);
        grid.set(hx + 1, hy - 5, pal.scarfMain);
        grid.set(hx, hy - 6, pal.scarfMain);
      }
      break;
    }
    case 'Knight': {
      grid.rect(hx - 4, hy - 5, 9, 3, PALETTE.LAB_HIGHLIGHT);
      grid.rect(hx - 3, hy - 3, 7, 1, PALETTE.LAB_STEEL);
      // Plume
      grid.rect(hx - 2, hy - 7, 4, 2, isP1 ? PALETTE.KRUNKED_SCARF : PALETTE.FRED_SCARF);
      grid.set(hx - 3, hy - 6, isP1 ? PALETTE.KRUNKED_SCARF_DARK : PALETTE.FRED_SCARF_DARK);
      break;
    }
    case 'Robot': {
      // Antenna + cyan bulb
      grid.line(hx, hy - 4, hx, hy - 7, PALETTE.LAB_HIGHLIGHT);
      grid.set(hx, hy - 8, PALETTE.LAB_CYAN);
      grid.set(hx - 1, hy - 7, PALETTE.LAB_CYAN);
      // Visor stripe
      grid.rect(hx - 1, hy - 1, 5, 2, PALETTE.LAB_CYAN);
      break;
    }
    case 'Pot': {
      grid.rect(hx - 5, hy - 6, 10, 4, '#6d7a88');
      grid.rect(hx - 6, hy - 3, 12, 1, '#9badb7');
      grid.rect(hx - 2, hy - 7, 4, 1, '#9badb7');
      break;
    }
    case 'Skeleton': {
      // Crisp white skull dome
      grid.ellipse(hx, hy - 1, 4.2, 3.6, '#ffffff');
      grid.rect(hx - 1, hy + 1, 3, 1, '#cadafb');
      break;
    }
    case 'Bread': {
      grid.rect(hx - 4, hy - 5, 9, 2, '#e8a855');
      grid.set(hx - 2, hy - 4, '#8f563b');
      grid.set(hx + 1, hy - 4, '#8f563b');
      break;
    }
    case 'Inverted': {
      grid.rect(hx - 3, hy - 5, 6, 2, PALETTE.BODY_MAIN);
      grid.set(hx, hy - 6, PALETTE.CLIFF_MID);
      break;
    }
    case 'Fish': {
      grid.rect(hx - 2, hy - 6, 4, 2, PALETTE.LAB_CYAN);
      grid.set(hx - 3, hy - 5, '#2b8ea8');
      break;
    }
    case 'Box': {
      grid.rect(hx - 5, hy - 5, 11, 7, '#b57b4c');
      grid.rect(hx - 5, hy - 5, 11, 2, '#c78c5d');
      grid.rect(hx - 4, hy - 1, 9, 1, '#7a4537');
      break;
    }
    case 'Fruit': {
      grid.line(hx, hy - 4, hx, hy - 7, '#663931');
      grid.rect(hx + 1, hy - 7, 3, 2, PALETTE.PINE_MOSS);
      break;
    }
    case 'Animals': {
      grid.rect(hx - 4, hy - 6, 2, 3, pal.bodyMain);
      grid.rect(hx + 2, hy - 6, 2, 3, pal.bodyMain);
      grid.set(hx - 3, hy - 5, pal.cheek);
      grid.set(hx + 3, hy - 5, pal.cheek);
      break;
    }
    case 'SuperHero': {
      grid.rect(hx - 3, hy - 2, 8, 2, pal.scarfMain);
      break;
    }
    case 'Christmas': {
      grid.rect(hx - 4, hy - 4, 9, 2, '#ffffff');
      grid.rect(hx - 3, hy - 6, 6, 2, '#d11651');
      grid.rect(hx - 2, hy - 7, 3, 1, '#d11651');
      grid.rect(hx - 4, hy - 7, 2, 2, '#ffffff');
      break;
    }
    case 'Detective': {
      grid.rect(hx - 6, hy - 3, 12, 1, '#8f563b');
      grid.rect(hx - 4, hy - 6, 8, 3, '#a87048');
      grid.rect(hx - 4, hy - 4, 8, 1, '#45283c');
      break;
    }
    case 'Halloween': {
      grid.rect(hx - 6, hy - 3, 12, 1, '#312134');
      grid.rect(hx - 4, hy - 5, 8, 2, '#45283c');
      grid.rect(hx - 2, hy - 7, 4, 2, '#45283c');
      grid.rect(hx - 4, hy - 4, 8, 1, PALETTE.LAB_AMBER);
      break;
    }
    case 'Nuclear': {
      grid.rect(hx - 4, hy - 5, 9, 3, '#ffe169');
      grid.rect(hx - 1, hy - 2, 5, 2, '#141e2e');
      grid.set(hx + 1, hy - 2, PALETTE.LAB_CYAN);
      break;
    }
  }
}

function bakePenguinFrame(
  bodyCtx: CanvasRenderingContext2D,
  handsCtx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  who: 'p1' | 'p2',
  anim: PenguinAnimName,
  frame: number,
  pal: PenguinSkinPalette
): void {
  const isP2 = who === 'p2';
  const pose = buildPose(anim, frame, isP2);
  const body = new PixelGrid(32, 32);
  const hands = new PixelGrid(32, 32);

  const bx = pose.cx;
  const by = pose.cy;
  const hx = pose.cx + pose.headOffX;
  const hy = pose.cy + pose.headOffY;

  // 1. Webbed orange feet (drawn first so torso overlaps ankle cleanly)
  const drawFoot = (fx: number, fy: number) => {
    body.rect(fx - 1, fy, 4, 2, pal.beakBright);
    body.set(fx - 1, fy + 1, pal.beakMid);
    body.set(fx + 2, fy + 1, pal.beakMid);
  };
  drawFoot(pose.leftFootX, pose.leftFootY);
  drawFoot(pose.rightFootX, pose.rightFootY);

  // 2. Back flipper (behind torso)
  if (pose.handMode === 'raised' || pose.handMode === 'call') {
    body.line(bx - 4, by - 2, bx - 8, by - 6, pal.bodyDark);
    body.line(bx - 4, by - 1, bx - 7, by - 5, pal.bodyMain);
  } else if (pose.handMode === 'flap') {
    const dy = pose.handPhase % 2 === 0 ? -4 : 1;
    body.line(bx - 5, by - 1, bx - 9, by + dy, pal.bodyDark);
    body.line(bx - 5, by, bx - 8, by + dy + 1, pal.bodyMain);
  } else if (pose.handMode === 'walk') {
    const swing = Math.sin((pose.handPhase / 8) * Math.PI * 2) * 2.5;
    body.line(bx - 4, by - 1, bx - 6 - swing * 0.5, by + 2, pal.bodyDark);
  }

  // 3. Cute little tail tuft at back
  body.rect(bx - pose.bodyRx - 1, by + 1, 2, 2, pal.bodyDark);

  // 4. Plump penguin torso (shaded navy feathers)
  body.ellipse(bx, by, pose.bodyRx, pose.bodyRy, pal.bodyDark);
  body.ellipse(bx + 0.4, by - 0.5, pose.bodyRx - 0.6, pose.bodyRy - 0.6, pal.bodyMain);

  // 5. Chubby white/pale-blue belly
  body.ellipse(
    bx + 1.3 + pose.leanX * 0.25,
    by + 0.6,
    Math.max(2.6, pose.bodyRx - 2.1),
    Math.max(2.0, pose.bodyRy - 1.3),
    pal.bellyShade
  );
  body.ellipse(
    bx + 1.6 + pose.leanX * 0.25,
    by + 0.2,
    Math.max(2.1, pose.bodyRx - 2.6),
    Math.max(1.7, pose.bodyRy - 1.9),
    pal.bellyWhite
  );

  // Skeleton skin rib lines
  if (pal.hat === 'Skeleton') {
    body.rect(bx - 1, by - 1, 4, 1, PALETTE.OUTLINE);
    body.rect(bx - 1, by + 1, 4, 1, PALETTE.OUTLINE);
  }

  // 6. Round expressive head
  body.ellipse(hx, hy, pose.headRx, pose.headRy, pal.bodyDark);
  body.ellipse(hx + 0.3, hy - 0.4, pose.headRx - 0.5, pose.headRy - 0.6, pal.bodyMain);
  // Subtle forehead shine
  body.rect(hx - 1, hy - pose.headRy + 1, 3, 1, pal.bodyShine);

  // White face patch around eyes/cheeks
  if (pal.hat !== 'Box') {
    body.ellipse(hx + 1.4, hy + 0.6, 2.8, 2.3, pal.bellyWhite);
  }

  // 7. Hat / Character crown accent (Krunked crimson headband+tuft, Fred plump crest, or Skin hat)
  drawSkinHat(body, Math.round(hx), Math.round(hy), who, pal);

  // 8. Scarf collar around neck (visual anchor for the animated 5-node scarf!)
  const neckY = Math.round((by - pose.bodyRy * 0.6 + (hy + pose.headRy * 0.7)) * 0.5);
  body.rect(hx - 4, neckY, 9, 2, pal.scarfMain);
  body.rect(hx - 4, neckY + 1, 9, 1, pal.scarfDark);
  // Little front scarf knot fold
  body.rect(hx + 1, neckY + 1, 2, 2, pal.scarfMain);

  // 9. Orange Beak (facing right; flipped on render when facing === -1)
  const beakX = Math.round(hx + pose.headRx - 1);
  const beakY = Math.round(hy + 0.5);
  body.rect(beakX, beakY, 3, 2, pal.beakBright);
  body.set(beakX + 3, beakY + 1, pal.beakBright);
  body.rect(beakX, beakY + 1, 3, 1, pal.beakMid);
  if (pose.beakOpen) {
    body.rect(beakX, beakY + 2, 2, 1, PALETTE.BEAK_DARK);
    body.set(beakX + 2, beakY + 2, pal.beakMid);
  }

  // 10. Shiny dark eyes with 1px white highlight + rosy cheek pixel
  const eyeX = Math.round(hx + 1.5);
  const eyeY = Math.round(hy - 0.5);
  if (pose.eyeStyle === 'dizzy') {
    body.set(eyeX, eyeY - 1, PALETTE.OUTLINE);
    body.set(eyeX + 2, eyeY - 1, PALETTE.OUTLINE);
    body.set(eyeX + 1, eyeY, PALETTE.OUTLINE);
    body.set(eyeX, eyeY + 1, PALETTE.OUTLINE);
    body.set(eyeX + 2, eyeY + 1, PALETTE.OUTLINE);
  } else if (pose.eyeStyle === 'happy') {
    body.set(eyeX, eyeY, PALETTE.OUTLINE);
    body.set(eyeX + 1, eyeY - 1, PALETTE.OUTLINE);
    body.set(eyeX + 2, eyeY, PALETTE.OUTLINE);
    body.set(eyeX - 1, eyeY + 1, pal.cheek);
  } else if (pose.eyeStyle === 'wide') {
    body.rect(eyeX, eyeY - 1, 2, 3, pal.eyeColor);
    body.set(eyeX, eyeY - 1, PALETTE.BELLY_WHITE);
    body.set(eyeX - 1, eyeY + 2, pal.cheek);
  } else {
    // Normal or Determined
    body.rect(eyeX, eyeY - 1, 2, 2, pal.eyeColor);
    body.set(eyeX, eyeY - 1, PALETTE.BELLY_WHITE); // crisp 1px specular catchlight!
    if (pose.eyeStyle === 'determined') {
      body.set(eyeX, eyeY - 2, pal.bodyDark);
      body.set(eyeX + 1, eyeY - 1, pal.bodyDark);
    }
    body.set(eyeX - 1, eyeY + 1, pal.cheek); // rosy cheek pixel!
  }

  // 11. Dizzy stars above head for LandHard
  if (pose.dizzyStars) {
    const off = pose.handPhase === 0 ? 0 : 2;
    const drawMiniStar = (sx: number, sy: number, col: string) => {
      body.set(sx, sy, col);
      body.set(sx - 1, sy, col);
      body.set(sx + 1, sy, col);
      body.set(sx, sy - 1, col);
      body.set(sx, sy + 1, col);
    };
    drawMiniStar(Math.round(hx - 4 + off), Math.round(hy - 6), PALETTE.LAB_AMBER);
    drawMiniStar(Math.round(hx + 3 - off), Math.round(hy - 7), PALETTE.SNOW_BRIGHT);
  }

  // 12. Joyful sparkle for Clap / PlaceFlag
  if (pose.sparkle) {
    hands.set(Math.round(bx + 7), Math.round(by - 8), PALETTE.LAB_AMBER);
    hands.set(Math.round(bx + 8), Math.round(by - 8), PALETTE.SNOW_BRIGHT);
    hands.set(Math.round(bx + 7), Math.round(by - 9), PALETTE.SNOW_BRIGHT);
  }

  // 13. Separate Foreground Hands / Flippers Overlay!
  switch (pose.handMode) {
    case 'side': {
      hands.rect(bx - 2, by - 1, 3, 4, pal.bodyMain);
      hands.rect(bx - 2, by + 2, 2, 1, pal.bodyDark);
      break;
    }
    case 'walk': {
      const swing = Math.sin((pose.handPhase / 8) * Math.PI * 2) * 2.5;
      hands.line(bx - 1, by - 1, bx - 1 + swing, by + 3, pal.bodyMain);
      hands.line(bx, by - 1, bx + swing, by + 3, pal.bodyDark);
      break;
    }
    case 'raised': {
      hands.line(bx + 1, by - 2, bx + 6, by - 6, pal.bodyMain);
      hands.line(bx + 1, by - 1, bx + 5, by - 5, pal.bodyDark);
      break;
    }
    case 'flap': {
      const dy = pose.handPhase % 2 === 0 ? -4 : 2;
      hands.line(bx + 2, by - 1, bx + 8, by + dy, pal.bodyMain);
      hands.line(bx + 2, by, bx + 7, by + dy + 1, pal.bodyDark);
      break;
    }
    case 'grab': {
      // Gripped front & top flippers firmly pressed against wall face on right!
      hands.rect(bx + 3, by - 4, 4, 2, pal.bodyMain);
      hands.rect(bx + 6, by - 4, 2, 3, pal.bodyDark);
      hands.rect(bx + 3, by, 4, 2, pal.bodyMain);
      hands.set(bx + 7, by - 3, pal.bellyShade); // subtle grip highlight
      break;
    }
    case 'anchor': {
      // Wide planted bracing flippers digging into snow
      hands.rect(bx - 6, by, 3, 4, pal.bodyMain);
      hands.rect(bx + 4, by, 3, 4, pal.bodyMain);
      hands.set(bx - 6, by + 3, pal.bodyDark);
      hands.set(bx + 6, by + 3, pal.bodyDark);
      break;
    }
    case 'pull': {
      // Both flippers reaching forward gripping the taut rope
      const tug = pose.handPhase % 2 === 0 ? 0 : 1;
      hands.rect(bx + 1 + tug, by - 1, 5, 2, pal.bodyMain);
      hands.rect(bx + 4 + tug, by - 2, 2, 3, pal.bodyDark);
      break;
    }
    case 'flag': {
      // Holding small pole proudly upward
      hands.rect(bx + 2, by - 3, 4, 2, pal.bodyMain);
      hands.line(bx + 6, by - 10, bx + 6, by + 3, PALETTE.MINE_WOOD);
      hands.rect(bx + 7, by - 10, 4, 3, pal.scarfMain);
      break;
    }
    case 'call': {
      // Flippers waving/cupped to beak calling Charlie
      hands.rect(bx + 3, by - 4, 3, 3, pal.bodyMain);
      hands.line(bx + 5, by - 6, bx + 7, by - 8, pal.bodyMain);
      break;
    }
    case 'clap': {
      const together = pose.handPhase % 4 < 2;
      if (together) {
        hands.rect(bx + 3, by - 2, 4, 3, pal.bodyMain);
        hands.set(bx + 5, by - 3, PALETTE.SNOW_BRIGHT);
      } else {
        hands.rect(bx - 1, by - 1, 3, 3, pal.bodyMain);
        hands.rect(bx + 4, by - 3, 3, 3, pal.bodyMain);
      }
      break;
    }
    case 'rps_rock': {
      hands.rect(bx + 4, by - 2, 4, 4, pal.bodyMain);
      hands.rect(bx + 5, by - 1, 2, 2, PALETTE.ROPE_BASE);
      break;
    }
    case 'rps_paper': {
      hands.rect(bx + 4, by - 3, 5, 5, PALETTE.SNOW_BRIGHT);
      hands.rect(bx + 5, by - 2, 3, 3, PALETTE.SNOW_LIGHT);
      break;
    }
    case 'rps_scissors': {
      hands.line(bx + 3, by - 1, bx + 8, by - 4, PALETTE.LAB_AMBER);
      hands.line(bx + 3, by + 1, bx + 8, by + 3, PALETTE.LAB_AMBER);
      break;
    }
    case 'splat': {
      hands.rect(bx - 7, by + 1, 4, 2, pal.bodyMain);
      hands.rect(bx + 5, by + 1, 4, 2, pal.bodyMain);
      break;
    }
  }

  // Exact 1px #222034 outline around both body and hands!
  body.applyOutline(PALETTE.OUTLINE);
  hands.applyOutline(PALETTE.OUTLINE);

  body.blitTo(bodyCtx, ox, oy);
  hands.blitTo(handsCtx, ox, oy);
}

// ============================================================================
// 16x16 Auto-Tiled Terrain Baker (ALL 16 bitmask variants: N=1, E=2, S=4, W=8)
// ============================================================================

function bakeAutoTile(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  group: TileVisualGroup,
  mask: number
): void {
  const g = new PixelGrid(16, 16);
  const hasN = (mask & 1) !== 0;
  const hasE = (mask & 2) !== 0;
  const hasS = (mask & 4) !== 0;
  const hasW = (mask & 8) !== 0;

  if (group === 'snow') {
    // Cohesive layered alpine stone strata with smooth purple-indigo facets & pillowy white snowcaps!
    g.rect(0, 0, 16, 16, PALETTE.CLIFF_DARK);

    // Broad layered stone strata (avoids harsh checkerboard repetition)
    g.rect(0, 1, 16, 4, '#4b4785');
    g.rect(0, 6, 16, 5, PALETTE.CLIFF_DARK);
    g.rect(0, 12, 16, 4, '#363464');
    // Subtle angular cliff facets & seams
    g.rect(2, 2, 7, 2, PALETTE.CLIFF_MID);
    g.rect(10, 7, 5, 3, '#524b92');
    g.rect(1, 8, 6, 2, PALETTE.BODY_DARK);
    g.rect(6, 13, 8, 2, '#494580');

    // Fine horizontal bedding crevices
    g.line(0, 5, 10, 5, PALETTE.BODY_DARK);
    g.line(6, 11, 15, 11, PALETTE.BODY_DARK);
    g.set(11, 4, PALETTE.OUTLINE);
    g.set(4, 10, PALETTE.OUTLINE);

    // Exposed West/East cliff bevels
    if (!hasW) {
      g.rect(1, 0, 2, 16, PALETTE.CLIFF_MID);
      g.rect(0, 0, 1, 16, PALETTE.OUTLINE);
    }
    if (!hasE) {
      g.rect(13, 0, 2, 16, PALETTE.BODY_DARK);
      g.rect(15, 0, 1, 16, PALETTE.OUTLINE);
    }
    if (!hasS) {
      g.rect(0, 13, 16, 2, PALETTE.BODY_DARK);
      g.rect(0, 15, 16, 1, PALETTE.OUTLINE);
      // Little icicle/rock teeth along overhang underside
      g.set(3, 14, PALETTE.OUTLINE);
      g.set(10, 14, PALETTE.OUTLINE);
    }

    // Lush overhanging snowcap when North is exposed!
    if (!hasN) {
      g.rect(0, 0, 16, 1, PALETTE.OUTLINE);
      g.rect(hasW ? 0 : 1, 1, hasW && hasE ? 16 : hasW || hasE ? 15 : 14, 3, PALETTE.SNOW_BRIGHT);
      g.rect(hasW ? 0 : 1, 4, hasW && hasE ? 16 : hasW || hasE ? 15 : 14, 1, PALETTE.SNOW_LIGHT);
      // Scalloped hanging snow drifts
      const drifts = [2, 3, 4, 7, 8, 11, 12, 13];
      for (const dx of drifts) {
        if ((!hasW && dx === 0) || (!hasE && dx === 15)) continue;
        g.set(dx, 5, PALETTE.SNOW_LIGHT);
        g.set(dx, 6, PALETTE.OUTLINE);
      }
      g.set(3, 5, PALETTE.SNOW_BRIGHT);
      g.set(12, 5, PALETTE.SNOW_BRIGHT);
      if (!hasW) {
        g.set(0, 1, PALETTE.OUTLINE);
        g.set(0, 2, PALETTE.OUTLINE);
        g.set(0, 3, PALETTE.OUTLINE);
        g.set(0, 4, PALETTE.OUTLINE);
      }
      if (!hasE) {
        g.set(15, 1, PALETTE.OUTLINE);
        g.set(15, 2, PALETTE.OUTLINE);
        g.set(15, 3, PALETTE.OUTLINE);
        g.set(15, 4, PALETTE.OUTLINE);
      }
    }
  } else if (group === 'ice') {
    // Translucent faceted glacier ice with crisp diagonal specular glints!
    g.rect(0, 0, 16, 16, PALETTE.ICE_MID);
    g.rect(1, 1, 14, 6, PALETTE.ICE_LIGHT);
    g.rect(2, 9, 12, 5, PALETTE.ICE_TINT);

    // Diagonal crystalline specular glints
    g.line(2, 12, 11, 3, PALETTE.SNOW_BRIGHT);
    g.line(3, 12, 11, 4, PALETTE.ICE_LIGHT);
    g.line(9, 13, 13, 9, PALETTE.SNOW_BRIGHT);
    g.set(4, 4, PALETTE.SNOW_BRIGHT);
    g.set(5, 3, PALETTE.SNOW_BRIGHT);

    // Deep crystalline bevel borders
    if (!hasN) {
      g.rect(0, 0, 16, 1, PALETTE.OUTLINE);
      g.rect(1, 1, 14, 2, PALETTE.SNOW_BRIGHT);
    }
    if (!hasS) {
      g.rect(0, 14, 16, 1, PALETTE.CLIFF_MID);
      g.rect(0, 15, 16, 1, PALETTE.OUTLINE);
    }
    if (!hasW) {
      g.rect(0, 0, 1, 16, PALETTE.OUTLINE);
      g.rect(1, 1, 1, 14, PALETTE.SNOW_BRIGHT);
    }
    if (!hasE) {
      g.rect(14, 1, 1, 14, PALETTE.CLIFF_MID);
      g.rect(15, 0, 1, 16, PALETTE.OUTLINE);
    }
  } else if (group === 'mine') {
    // Dark Mines subterranean brickwork, dirt strata & timber trim
    g.rect(0, 0, 16, 16, PALETTE.MINE_PLUM);
    // Offset brick courses
    g.rect(1, 1, 6, 4, PALETTE.MINE_BRICK);
    g.rect(9, 1, 6, 4, PALETTE.MINE_DIRT);
    g.rect(0, 6, 4, 4, PALETTE.MINE_DIRT);
    g.rect(5, 6, 7, 4, PALETTE.MINE_BRICK);
    g.rect(13, 6, 3, 4, PALETTE.MINE_ROCK);
    g.rect(1, 11, 6, 4, PALETTE.MINE_ROCK);
    g.rect(8, 11, 7, 4, PALETTE.MINE_BRICK);

    // Subtle highlights & mortar grit
    g.set(2, 2, PALETTE.MINE_WOOD);
    g.set(6, 7, PALETTE.MINE_WOOD);
    g.set(10, 12, PALETTE.MINE_SLATE);
    g.rect(0, 5, 16, 1, PALETTE.MINE_SHADOW);
    g.rect(0, 10, 16, 1, PALETTE.MINE_SHADOW);

    if (!hasN) {
      // Mine top timber/gravel cap
      g.rect(0, 0, 16, 1, PALETTE.OUTLINE);
      g.rect(0, 1, 16, 2, PALETTE.MINE_WOOD);
      g.rect(0, 3, 16, 1, PALETTE.MINE_DIRT);
      g.set(3, 1, PALETTE.BEAK_MID);
      g.set(11, 1, PALETTE.BEAK_MID);
    }
    if (!hasS) {
      g.rect(0, 14, 16, 1, PALETTE.MINE_DEEP);
      g.rect(0, 15, 16, 1, PALETTE.OUTLINE);
    }
    if (!hasW) {
      g.rect(0, 0, 1, 16, PALETTE.OUTLINE);
      g.rect(1, 1, 1, 14, PALETTE.MINE_SLATE);
    }
    if (!hasE) {
      g.rect(14, 1, 1, 14, PALETTE.MINE_SHADOW);
      g.rect(15, 0, 1, 16, PALETTE.OUTLINE);
    }
  } else if (group === 'platform') {
    // Sturdy one-way wooden platform (thin top deck with support beams & iron bolts)
    g.rect(0, 0, 16, 1, PALETTE.OUTLINE);
    g.rect(0, 1, 16, 2, PALETTE.BEAK_MID);
    g.rect(0, 3, 16, 2, PALETTE.MINE_WOOD);
    g.rect(0, 5, 16, 2, PALETTE.MINE_DIRT);
    g.rect(0, 7, 16, 1, PALETTE.OUTLINE);
    // Plank seams & iron rivets
    g.set(4, 2, PALETTE.OUTLINE);
    g.set(12, 2, PALETTE.OUTLINE);
    g.set(2, 4, PALETTE.ROPE_BASE);
    g.set(13, 4, PALETTE.ROPE_BASE);
    // Support brackets at ends
    if (!hasW) {
      g.rect(0, 1, 1, 7, PALETTE.OUTLINE);
      g.rect(1, 8, 3, 3, PALETTE.MINE_DIRT);
      g.rect(0, 8, 1, 4, PALETTE.OUTLINE);
      g.line(1, 11, 4, 8, PALETTE.OUTLINE);
    }
    if (!hasE) {
      g.rect(15, 1, 1, 7, PALETTE.OUTLINE);
      g.rect(12, 8, 3, 3, PALETTE.MINE_DIRT);
      g.rect(15, 8, 1, 4, PALETTE.OUTLINE);
      g.line(14, 11, 11, 8, PALETTE.OUTLINE);
    }
  } else if (group === 'lab') {
    // Laboratory steel plating with cyan circuit inlays & rivets
    g.rect(0, 0, 16, 16, PALETTE.LAB_WALL);
    g.rect(1, 1, 14, 14, PALETTE.LAB_STEEL);
    g.rect(2, 2, 12, 12, PALETTE.LAB_WALL);
    // Subtle tech circuit groove
    g.rect(4, 7, 8, 2, PALETTE.LAB_DEEP);
    g.rect(6, 7, 4, 1, PALETTE.LAB_CYAN);
    // Corner rivets
    g.set(2, 2, PALETTE.LAB_HIGHLIGHT);
    g.set(13, 2, PALETTE.LAB_HIGHLIGHT);
    g.set(2, 13, PALETTE.LAB_HIGHLIGHT);
    g.set(13, 13, PALETTE.LAB_HIGHLIGHT);
    if (!hasN) {
      g.rect(0, 0, 16, 1, PALETTE.OUTLINE);
      g.rect(1, 1, 14, 2, PALETTE.LAB_HIGHLIGHT);
    }
    if (!hasS) g.rect(0, 15, 16, 1, PALETTE.OUTLINE);
    if (!hasW) g.rect(0, 0, 1, 16, PALETTE.OUTLINE);
    if (!hasE) g.rect(15, 0, 1, 16, PALETTE.OUTLINE);
  } else {
    // Owner-exclusive Krunked (crimson) / Fred (emerald) energy blocks
    const isKrunked = group === 'krunked_only';
    const main = isKrunked ? PALETTE.LAB_KRUNKED : PALETTE.LAB_FRED;
    const dark = isKrunked ? PALETTE.KRUNKED_SCARF_DARK : PALETTE.FRED_SCARF_DARK;
    g.rect(0, 0, 16, 16, dark);
    g.rect(1, 1, 14, 14, main);
    g.rect(2, 2, 12, 12, dark);
    // Crisp diagonal shimmer stripe
    g.line(3, 12, 12, 3, main);
    g.line(3, 11, 11, 3, PALETTE.SNOW_BRIGHT);
    if (!hasN) g.rect(0, 0, 16, 1, PALETTE.OUTLINE);
    if (!hasS) g.rect(0, 15, 16, 1, PALETTE.OUTLINE);
    if (!hasW) g.rect(0, 0, 1, 16, PALETTE.OUTLINE);
    if (!hasE) g.rect(15, 0, 1, 16, PALETTE.OUTLINE);
  }

  g.blitTo(ctx, ox, oy);
}

// ============================================================================
// ProceduralPixelAtlas Class
// ============================================================================

const TILE_GROUPS: readonly TileVisualGroup[] = [
  'snow',
  'ice',
  'mine',
  'platform',
  'lab',
  'krunked_only',
  'fred_only',
] as const;

export class ProceduralPixelAtlas {
  private readonly p1Skins = new Map<CoopSkinId, PenguinSpriteSet>();
  private readonly p2Skins = new Map<CoopSkinId, PenguinSpriteSet>();
  private readonly jeffSkins = new Map<JeffSkinId, SpriteRect>();

  readonly tilesSheet: HTMLCanvasElement;
  readonly tileRects: Record<TileVisualGroup, SpriteRect[]>;

  readonly fallingBlocks: [SpriteRect, SpriteRect, SpriteRect];
  readonly minecartLeft: SpriteRect;
  readonly minecartMid: SpriteRect;
  readonly minecartRight: SpriteRect;
  readonly minecartWheels: [SpriteRect, SpriteRect];
  readonly swingCradle: SpriteRect;
  readonly tronchoTile: SpriteRect;

  readonly charlieFrames: SpriteRect[];
  readonly flagFrames: SpriteRect[];
  readonly polaroidSprite: SpriteRect;
  readonly manualSprite: SpriteRect;
  readonly sealFrames: SpriteRect[];
  readonly signSprite: SpriteRect;
  readonly pineLarge: SpriteRect;
  readonly pineSmall: SpriteRect;
  readonly villageCabin: SpriteRect;
  readonly summitBannerFrames: SpriteRect[];
  readonly lanternFrames: SpriteRect[];

  readonly propsSheet: HTMLCanvasElement;
  readonly jeffSheet: HTMLCanvasElement;

  constructor() {
    // 1. Pre-bake Default Krunked (P1) and Fred (P2) sprite sets ONCE at init!
    this.p1Skins.set('Default', this.bakePenguinSet('p1', 'Default'));
    this.p2Skins.set('Default', this.bakePenguinSet('p2', 'Default'));

    // 2. Pre-bake ALL 16 cardinal bitmask auto-tiles for all 7 visual groups (16x16 each)
    this.tilesSheet = createCanvas(16 * 16, (TILE_GROUPS.length + 2) * 16);
    const tileCtx = get2d(this.tilesSheet);
    this.tileRects = {} as Record<TileVisualGroup, SpriteRect[]>;

    for (let row = 0; row < TILE_GROUPS.length; row++) {
      const group = TILE_GROUPS[row];
      const list: SpriteRect[] = [];
      for (let mask = 0; mask < 16; mask++) {
        const ox = mask * 16;
        const oy = row * 16;
        bakeAutoTile(tileCtx, ox, oy, group, mask);
        list.push({ sheet: this.tilesSheet, x: ox, y: oy, w: 16, h: 16 });
      }
      this.tileRects[group] = list;
    }

    // Extra dynamic tile row (row = TILE_GROUPS.length)
    const dynY = TILE_GROUPS.length * 16;
    this.fallingBlocks = [
      this.bakeFallingBlock(tileCtx, 0, dynY, 0),
      this.bakeFallingBlock(tileCtx, 16, dynY, 1),
      this.bakeFallingBlock(tileCtx, 32, dynY, 2),
    ];
    this.minecartLeft = this.bakeMinecartPart(tileCtx, 48, dynY, 'left');
    this.minecartMid = this.bakeMinecartPart(tileCtx, 64, dynY, 'mid');
    this.minecartRight = this.bakeMinecartPart(tileCtx, 80, dynY, 'right');
    this.minecartWheels = [
      this.bakeWheel(tileCtx, 96, dynY, 0),
      this.bakeWheel(tileCtx, 112, dynY, 1),
    ];
    this.swingCradle = this.bakeSwingCradle(tileCtx, 128, dynY);
    this.tronchoTile = this.bakeTronchoTile(tileCtx, 160, dynY);

    // 3. Pre-bake Jeff the Rock (all 6 skins fit on one tiny 120x20 sheet!)
    this.jeffSheet = createCanvas(120, 20);
    const jeffCtx = get2d(this.jeffSheet);
    const jeffList: readonly JeffSkinId[] = [
      'Default',
      'Bowling',
      'Headless',
      'Prisoner',
      'Dwarf',
      'Scuba',
    ];
    for (let i = 0; i < jeffList.length; i++) {
      const skin = jeffList[i];
      const ox = i * 20;
      this.bakeJeff(jeffCtx, ox, 0, skin);
      this.jeffSkins.set(skin, { sheet: this.jeffSheet, x: ox, y: 0, w: 20, h: 20 });
    }

    // 4. Pre-bake Props & Landmarks onto compact propsSheet (256 x 160)
    this.propsSheet = createCanvas(256, 160);
    const pCtx = get2d(this.propsSheet);

    // Row 0: Charlie (4 frames x 24x20), Assist Flag (3 frames x 16x24), Polaroid (16x16), Manual (16x16), Sign (16x18), Lantern (2 x 12x16)
    this.charlieFrames = [0, 1, 2, 3].map((f) => this.bakeCharlie(pCtx, f * 24, 0, f));
    this.flagFrames = [0, 1, 2].map((f) => this.bakeAssistFlag(pCtx, 96 + f * 16, 0, f));
    this.polaroidSprite = this.bakePolaroid(pCtx, 144, 0);
    this.manualSprite = this.bakeManual(pCtx, 160, 0);
    this.signSprite = this.bakeSign(pCtx, 176, 0);
    this.lanternFrames = [0, 1].map((f) => this.bakeLantern(pCtx, 192 + f * 12, 0, f));
    this.sealFrames = [0, 1].map((f) => this.bakeSeal(pCtx, 216 + f * 20, 0, f));

    // Row 1: Pines (24x36, 16x24), Village Cabin (64x48), Summit Banner (2 x 48x44)
    this.pineLarge = this.bakePine(pCtx, 0, 28, 24, 36);
    this.pineSmall = this.bakePine(pCtx, 24, 40, 16, 24);
    this.villageCabin = this.bakeVillageCabin(pCtx, 44, 28);
    this.summitBannerFrames = [0, 1].map((f) => this.bakeSummitBanner(pCtx, 112 + f * 48, 28, f));
  }

  getPenguinSet(who: 'p1' | 'p2', skin: CoopSkinId): PenguinSpriteSet {
    const cache = who === 'p1' ? this.p1Skins : this.p2Skins;
    const existing = cache.get(skin);
    if (existing) return existing;
    const baked = this.bakePenguinSet(who, skin);
    cache.set(skin, baked);
    return baked;
  }

  getJeffSprite(skin: JeffSkinId): SpriteRect {
    return this.jeffSkins.get(skin) ?? this.jeffSkins.get('Default')!;
  }

  getTileSprite(kind: TileKind, terrain: TerrainType, mask: number): SpriteRect {
    const m = mask & 15;
    if (kind === 'KRUNKED_ONLY') return this.tileRects.krunked_only[m];
    if (kind === 'FRED_ONLY') return this.tileRects.fred_only[m];
    if (kind === 'ICE' || terrain === 'ICE') return this.tileRects.ice[m];
    if (kind === 'ONE_WAY' || terrain === 'PLATFORM') return this.tileRects.platform[m];
    if (
      terrain === 'LAB' ||
      terrain === 'LAB2' ||
      terrain === 'LAB_PLATFORM' ||
      terrain === 'LAB_PLATFORM2' ||
      terrain === 'TRONCHO'
    ) {
      return this.tileRects.lab[m];
    }
    if (
      terrain === 'DIRT' ||
      terrain === 'MUD' ||
      terrain === 'BELL_HOUSE' ||
      terrain === 'WORKSHOP'
    ) {
      return this.tileRects.mine[m];
    }
    return this.tileRects.snow[m];
  }

  private bakePenguinSet(who: 'p1' | 'p2', skin: CoopSkinId): PenguinSpriteSet {
    const palette = resolvePenguinSkinPalette(who, skin);
    const maxCols = 12; // Clap has 12 frames
    const rows = PENGUIN_ANIM_ORDER.length;
    const bodySheet = createCanvas(maxCols * 32, rows * 32);
    const handsSheet = createCanvas(maxCols * 32, rows * 32);
    const bodyCtx = get2d(bodySheet);
    const handsCtx = get2d(handsSheet);

    const frames = {} as Record<PenguinAnimName, SpriteRect[]>;
    const handFrames = {} as Record<PenguinAnimName, SpriteRect[]>;

    for (let r = 0; r < PENGUIN_ANIM_ORDER.length; r++) {
      const anim = PENGUIN_ANIM_ORDER[r];
      const count = PENGUIN_ANIM_COUNTS[anim];
      const bArr: SpriteRect[] = [];
      const hArr: SpriteRect[] = [];
      for (let f = 0; f < count; f++) {
        const ox = f * 32;
        const oy = r * 32;
        bakePenguinFrame(bodyCtx, handsCtx, ox, oy, who, anim, f, palette);
        bArr.push({ sheet: bodySheet, x: ox, y: oy, w: 32, h: 32 });
        hArr.push({ sheet: handsSheet, x: ox, y: oy, w: 32, h: 32 });
      }
      frames[anim] = bArr;
      handFrames[anim] = hArr;
    }

    return { bodySheet, handsSheet, frames, handFrames, palette };
  }

  private bakeFallingBlock(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    stage: 0 | 1 | 2
  ): SpriteRect {
    const g = new PixelGrid(16, 16);
    g.rect(0, 0, 16, 16, PALETTE.OUTLINE);
    g.rect(1, 1, 14, 14, stage === 2 ? PALETTE.MINE_DIRT : PALETTE.MINE_BRICK);
    g.rect(2, 2, 12, 3, stage === 2 ? PALETTE.BEAK_MID : PALETTE.MINE_WOOD);
    g.rect(2, 12, 12, 2, PALETTE.MINE_SHADOW);
    // Subtle corner rivets
    g.set(2, 2, PALETTE.ROPE_BASE);
    g.set(13, 2, PALETTE.ROPE_BASE);

    if (stage === 0) {
      // Hairline fault crack
      g.line(7, 2, 9, 6, PALETTE.MINE_SHADOW);
      g.line(9, 6, 8, 9, PALETTE.OUTLINE);
    } else if (stage === 1) {
      // Prominent jagged crack
      g.line(6, 1, 9, 6, PALETTE.OUTLINE);
      g.line(9, 6, 5, 11, PALETTE.OUTLINE);
      g.line(5, 11, 7, 14, PALETTE.OUTLINE);
      g.line(9, 6, 13, 8, PALETTE.OUTLINE);
      g.set(8, 5, PALETTE.LAB_AMBER);
    } else {
      // Heavy fracture ready to shatter!
      g.line(4, 1, 8, 7, PALETTE.OUTLINE);
      g.line(8, 7, 3, 13, PALETTE.OUTLINE);
      g.line(8, 7, 14, 4, PALETTE.OUTLINE);
      g.line(8, 7, 12, 14, PALETTE.OUTLINE);
      g.rect(7, 6, 2, 2, PALETTE.OUTLINE);
      g.set(5, 3, PALETTE.BEAK_BRIGHT);
      g.set(11, 10, PALETTE.BEAK_BRIGHT);
    }
    g.blitTo(ctx, ox, oy);
    return { sheet: this.tilesSheet, x: ox, y: oy, w: 16, h: 16 };
  }

  private bakeMinecartPart(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    part: 'left' | 'mid' | 'right'
  ): SpriteRect {
    const g = new PixelGrid(16, 16);
    // Top rim (metallic iron bar)
    g.rect(0, 1, 16, 2, PALETTE.LAB_HIGHLIGHT);
    g.rect(0, 3, 16, 1, PALETTE.LAB_STEEL);
    // Wooden/iron cart body
    g.rect(0, 4, 16, 7, PALETTE.MINE_WOOD);
    g.rect(0, 5, 16, 1, PALETTE.MINE_DIRT);
    g.rect(0, 8, 16, 1, PALETTE.MINE_DIRT);
    g.rect(0, 11, 16, 2, PALETTE.LAB_STEEL);
    // Vertical iron reinforcement strap
    g.rect(7, 3, 2, 9, PALETTE.LAB_STEEL);
    g.set(7, 5, PALETTE.LAB_HIGHLIGHT);
    g.set(7, 9, PALETTE.LAB_HIGHLIGHT);

    // Top/bottom crisp outline
    g.rect(0, 0, 16, 1, PALETTE.OUTLINE);
    g.rect(0, 13, 16, 1, PALETTE.OUTLINE);
    if (part === 'left') {
      g.rect(0, 0, 1, 14, PALETTE.OUTLINE);
      g.rect(1, 2, 2, 10, PALETTE.LAB_STEEL);
    }
    if (part === 'right') {
      g.rect(15, 0, 1, 14, PALETTE.OUTLINE);
      g.rect(13, 2, 2, 10, PALETTE.LAB_STEEL);
    }
    g.blitTo(ctx, ox, oy);
    return { sheet: this.tilesSheet, x: ox, y: oy, w: 16, h: 16 };
  }

  private bakeWheel(ctx: CanvasRenderingContext2D, ox: number, oy: number, frame: 0 | 1): SpriteRect {
    const g = new PixelGrid(8, 8);
    g.ellipse(3.5, 3.5, 3, 3, PALETTE.LAB_STEEL);
    g.ellipse(3.5, 3.5, 1.5, 1.5, PALETTE.MINE_DEEP);
    if (frame === 0) {
      g.line(3, 1, 3, 6, PALETTE.LAB_HIGHLIGHT);
      g.line(1, 3, 6, 3, PALETTE.LAB_HIGHLIGHT);
    } else {
      g.line(2, 2, 5, 5, PALETTE.LAB_HIGHLIGHT);
      g.line(5, 2, 2, 5, PALETTE.LAB_HIGHLIGHT);
    }
    g.applyOutline(PALETTE.OUTLINE);
    g.blitTo(ctx, ox, oy);
    return { sheet: this.tilesSheet, x: ox, y: oy, w: 8, h: 8 };
  }

  private bakeSwingCradle(ctx: CanvasRenderingContext2D, ox: number, oy: number): SpriteRect {
    const g = new PixelGrid(32, 16);
    // Hanging iron rings at left/right top posts
    g.rect(1, 1, 3, 3, PALETTE.LAB_HIGHLIGHT);
    g.set(2, 2, PALETTE.OUTLINE);
    g.rect(28, 1, 3, 3, PALETTE.LAB_HIGHLIGHT);
    g.set(29, 2, PALETTE.OUTLINE);
    // Deck planks
    g.rect(1, 4, 30, 5, PALETTE.MINE_WOOD);
    g.rect(1, 4, 30, 2, PALETTE.BEAK_MID);
    g.rect(1, 9, 30, 2, PALETTE.MINE_DIRT);
    // Iron straps
    g.rect(3, 4, 2, 7, PALETTE.LAB_STEEL);
    g.rect(27, 4, 2, 7, PALETTE.LAB_STEEL);
    g.applyOutline(PALETTE.OUTLINE);
    g.blitTo(ctx, ox, oy);
    return { sheet: this.tilesSheet, x: ox, y: oy, w: 32, h: 16 };
  }

  private bakeTronchoTile(ctx: CanvasRenderingContext2D, ox: number, oy: number): SpriteRect {
    const g = new PixelGrid(16, 16);
    g.rect(0, 0, 16, 16, PALETTE.OUTLINE);
    g.rect(1, 1, 14, 14, PALETTE.LAB_STEEL);
    g.rect(2, 2, 12, 12, PALETTE.LAB_WALL);
    // Caution stripes on top
    g.rect(2, 2, 3, 2, PALETTE.LAB_AMBER);
    g.rect(7, 2, 3, 2, PALETTE.LAB_AMBER);
    g.rect(12, 2, 2, 2, PALETTE.LAB_AMBER);
    // Grabbable ribbed pads on sides
    g.rect(1, 5, 2, 6, PALETTE.LAB_CYAN);
    g.rect(13, 5, 2, 6, PALETTE.LAB_CYAN);
    g.rect(5, 7, 6, 2, PALETTE.LAB_HIGHLIGHT);
    g.blitTo(ctx, ox, oy);
    return { sheet: this.tilesSheet, x: ox, y: oy, w: 16, h: 16 };
  }

  private bakeJeff(ctx: CanvasRenderingContext2D, ox: number, oy: number, skin: JeffSkinId): void {
    const g = new PixelGrid(20, 20);
    // Main faceted rock body (bottom rests cleanly around y=17)
    let main: string = PALETTE.ROPE_BASE;
    let shade: string = PALETTE.LAB_STEEL;
    let light: string = PALETTE.SNOW_LIGHT;
    if (skin === 'Bowling') {
      main = '#2c2947';
      shade = '#1a182e';
      light = '#595385';
    } else if (skin === 'Prisoner') {
      main = '#e6e8f0';
      shade = '#9badb7';
      light = '#ffffff';
    } else if (skin === 'Dwarf') {
      main = '#8f7d8a';
      shade = '#5d505e';
    }

    g.ellipse(10, 11, 6, 5.5, shade);
    g.ellipse(9.5, 10, 5.2, 4.6, main);
    g.rect(6, 7, 4, 2, light);

    if (skin === 'Prisoner') {
      g.rect(5, 9, 10, 1, PALETTE.OUTLINE);
      g.rect(5, 12, 10, 1, PALETTE.OUTLINE);
    } else if (skin === 'Headless') {
      // Cracked open top
      g.rect(6, 5, 8, 3, null);
      g.set(7, 8, PALETTE.OUTLINE);
      g.set(12, 8, PALETTE.OUTLINE);
    } else if (skin === 'Bowling') {
      g.set(8, 7, PALETTE.OUTLINE);
      g.set(11, 7, PALETTE.OUTLINE);
      g.set(9, 9, PALETTE.OUTLINE);
    } else if (skin === 'Dwarf') {
      // Cozy orange beard + iron helm
      g.rect(5, 5, 10, 3, PALETTE.LAB_HIGHLIGHT);
      g.rect(6, 13, 8, 4, PALETTE.BEAK_BRIGHT);
      g.rect(7, 15, 6, 2, PALETTE.BEAK_MID);
    } else if (skin === 'Scuba') {
      // Cyan goggles + snorkel
      g.rect(5, 9, 10, 3, PALETTE.LAB_AMBER);
      g.rect(6, 10, 3, 1, PALETTE.LAB_CYAN);
      g.rect(11, 10, 3, 1, PALETTE.LAB_CYAN);
      g.line(16, 11, 16, 4, PALETTE.LAB_AMBER);
    }

    // Adorable googly eyes (unless Headless/Bowling)
    if (skin !== 'Headless' && skin !== 'Scuba') {
      g.rect(7, 9, 2, 2, PALETTE.SNOW_BRIGHT);
      g.set(8, 10, PALETTE.OUTLINE);
      g.rect(11, 9, 2, 2, PALETTE.SNOW_BRIGHT);
      g.set(12, 10, PALETTE.OUTLINE);
    }
    g.applyOutline(PALETTE.OUTLINE);
    g.blitTo(ctx, ox, oy);
  }

  private bakeCharlie(ctx: CanvasRenderingContext2D, ox: number, oy: number, frame: number): SpriteRect {
    const g = new PixelGrid(24, 20);
    const wingY = frame === 0 ? -4 : frame === 1 ? -1 : frame === 2 ? 3 : 0;
    // Back wing
    g.line(10, 10, 4, 10 + wingY, PALETTE.CLIFF_DARK);
    g.line(10, 11, 5, 11 + wingY, PALETTE.CLIFF_MID);
    // Plump alpine bird body
    g.ellipse(12, 11, 5, 4, PALETTE.SNOW_LIGHT);
    g.ellipse(12, 10, 4, 3, PALETTE.SNOW_BRIGHT);
    // Warm golden-amber cap & tail feathers
    g.rect(10, 6, 5, 2, PALETTE.BEAK_BRIGHT);
    g.rect(6, 11, 3, 2, PALETTE.CLIFF_MID);
    // Cute beak & shiny eye
    g.rect(17, 10, 3, 2, PALETTE.LAB_AMBER);
    g.set(15, 9, PALETTE.OUTLINE);
    g.set(15, 8, PALETTE.SNOW_BRIGHT);
    // Tiny courier crimson scarf
    g.rect(11, 12, 5, 2, PALETTE.KRUNKED_SCARF);
    // Front wing flapping
    g.line(12, 10, 18, 9 + wingY, PALETTE.CLIFF_MID);
    g.line(12, 11, 17, 10 + wingY, PALETTE.ICE_LIGHT);
    g.applyOutline(PALETTE.OUTLINE);
    g.blitTo(ctx, ox, oy);
    return { sheet: this.propsSheet, x: ox, y: oy, w: 24, h: 20 };
  }

  private bakeAssistFlag(ctx: CanvasRenderingContext2D, ox: number, oy: number, frame: number): SpriteRect {
    const g = new PixelGrid(16, 24);
    // Pole
    g.rect(4, 3, 2, 19, PALETTE.MINE_WOOD);
    g.rect(4, 3, 1, 19, PALETTE.BEAK_MID);
    // Golden finial knob
    g.rect(4, 1, 2, 2, PALETTE.LAB_AMBER);
    // Snow mound base
    g.rect(2, 21, 6, 2, PALETTE.SNOW_BRIGHT);
    // Waving pennant
    const wave = frame === 0 ? 0 : frame === 1 ? 1 : -1;
    g.rect(6, 3, 4, 5, PALETTE.KRUNKED_SCARF);
    g.rect(10, 3 + wave, 4, 4, PALETTE.KRUNKED_SCARF);
    g.rect(6, 5, 4, 1, PALETTE.LAB_AMBER);
    g.rect(10, 5 + wave, 3, 1, PALETTE.LAB_AMBER);
    g.applyOutline(PALETTE.OUTLINE);
    g.blitTo(ctx, ox, oy);
    return { sheet: this.propsSheet, x: ox, y: oy, w: 16, h: 24 };
  }

  private bakePolaroid(ctx: CanvasRenderingContext2D, ox: number, oy: number): SpriteRect {
    const g = new PixelGrid(16, 16);
    g.rect(2, 3, 12, 10, PALETTE.SNOW_BRIGHT);
    g.rect(2, 8, 12, 5, PALETTE.SNOW_LIGHT);
    // Rainbow accent stripe
    g.rect(3, 7, 3, 1, PALETTE.KRUNKED_SCARF);
    g.rect(6, 7, 3, 1, PALETTE.LAB_AMBER);
    g.rect(9, 7, 4, 1, PALETTE.FRED_SCARF);
    // Dark lens & cyan gleam
    g.rect(6, 5, 4, 4, PALETTE.BODY_DARK);
    g.rect(7, 6, 2, 2, PALETTE.LAB_CYAN);
    g.set(7, 6, PALETTE.SNOW_BRIGHT);
    // Flash bulb
    g.rect(10, 4, 2, 2, PALETTE.LAB_AMBER);
    g.applyOutline(PALETTE.OUTLINE);
    g.blitTo(ctx, ox, oy);
    return { sheet: this.propsSheet, x: ox, y: oy, w: 16, h: 16 };
  }

  private bakeManual(ctx: CanvasRenderingContext2D, ox: number, oy: number): SpriteRect {
    const g = new PixelGrid(16, 16);
    // Rolled parchment scroll
    g.rect(3, 3, 10, 10, '#f7e6c4');
    g.rect(3, 11, 10, 2, '#d9bc8c');
    g.rect(2, 2, 12, 2, '#e3c798');
    g.rect(2, 12, 12, 2, '#c4a26c');
    // Crimson ribbon tie
    g.rect(3, 7, 10, 2, PALETTE.KRUNKED_SCARF);
    g.rect(7, 6, 2, 4, PALETTE.LAB_AMBER);
    g.applyOutline(PALETTE.OUTLINE);
    g.blitTo(ctx, ox, oy);
    return { sheet: this.propsSheet, x: ox, y: oy, w: 16, h: 16 };
  }

  private bakeSign(ctx: CanvasRenderingContext2D, ox: number, oy: number): SpriteRect {
    const g = new PixelGrid(16, 18);
    g.rect(7, 9, 2, 8, PALETTE.MINE_DIRT);
    g.rect(2, 3, 12, 7, PALETTE.MINE_WOOD);
    g.rect(2, 3, 12, 2, PALETTE.BEAK_MID);
    // Snow dusting on sign top
    g.rect(3, 2, 10, 1, PALETTE.SNOW_BRIGHT);
    // Carved text lines
    g.rect(4, 6, 8, 1, PALETTE.MINE_DEEP);
    g.rect(4, 8, 6, 1, PALETTE.MINE_DEEP);
    g.applyOutline(PALETTE.OUTLINE);
    g.blitTo(ctx, ox, oy);
    return { sheet: this.propsSheet, x: ox, y: oy, w: 16, h: 18 };
  }

  private bakeLantern(ctx: CanvasRenderingContext2D, ox: number, oy: number, frame: number): SpriteRect {
    const g = new PixelGrid(12, 16);
    g.rect(5, 1, 2, 3, PALETTE.LAB_STEEL);
    g.rect(3, 4, 6, 2, PALETTE.LAB_STEEL);
    g.rect(3, 11, 6, 2, PALETTE.LAB_STEEL);
    g.rect(3, 6, 6, 5, frame === 0 ? PALETTE.LAB_AMBER : PALETTE.BEAK_BRIGHT);
    g.rect(4, 7, 4, 3, PALETTE.SNOW_BRIGHT);
    g.applyOutline(PALETTE.OUTLINE);
    g.blitTo(ctx, ox, oy);
    return { sheet: this.propsSheet, x: ox, y: oy, w: 12, h: 16 };
  }

  private bakeSeal(ctx: CanvasRenderingContext2D, ox: number, oy: number, frame: number): SpriteRect {
    const g = new PixelGrid(20, 16);
    const bob = frame === 1 ? 1 : 0;
    g.ellipse(10, 10 + bob, 7, 4, PALETTE.SNOW_LIGHT);
    g.ellipse(10, 9 + bob, 6, 3, PALETTE.SNOW_BRIGHT);
    g.ellipse(14, 7 + bob, 3.5, 3, PALETTE.SNOW_BRIGHT);
    // Flippers & tail
    g.rect(2, 11 + bob, 3, 2, PALETTE.ROPE_BASE);
    g.rect(10, 13, 4, 2, PALETTE.ROPE_BASE);
    // Cute face
    g.set(15, 6 + bob, PALETTE.OUTLINE);
    g.set(17, 8 + bob, PALETTE.OUTLINE);
    g.set(14, 8 + bob, '#ec7c98');
    g.applyOutline(PALETTE.OUTLINE);
    g.blitTo(ctx, ox, oy);
    return { sheet: this.propsSheet, x: ox, y: oy, w: 20, h: 16 };
  }

  private bakePine(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    w: number,
    h: number
  ): SpriteRect {
    const g = new PixelGrid(w, h);
    const cx = Math.floor(w / 2);
    // Trunk
    const trunkW = Math.max(2, Math.floor(w / 6));
    g.rect(cx - Math.floor(trunkW / 2), h - 6, trunkW, 5, PALETTE.MINE_DIRT);
    // 3 tiered snow-laden evergreen boughs
    const tiers = 3;
    for (let t = 0; t < tiers; t++) {
      const topY = 2 + Math.floor((t * (h - 10)) / tiers);
      const tierH = Math.floor((h - 6) / tiers) + 2;
      const maxHalf = Math.floor((w * 0.44) * ((t + 1.1) / tiers));
      for (let dy = 0; dy < tierH; dy++) {
        const half = Math.max(1, Math.round((dy / tierH) * maxHalf));
        const y = topY + dy;
        const col = dy < 2 ? PALETTE.SNOW_BRIGHT : dy === 2 ? PALETTE.SNOW_LIGHT : dy > tierH - 3 ? PALETTE.FRED_SCARF_DARK : PALETTE.FRED_SCARF;
        g.rect(cx - half, y, half * 2 + 1, 1, col);
        if (dy > 2 && dy < tierH - 2) {
          g.set(cx - half + 1, y, PALETTE.PINE_MOSS);
        }
      }
    }
    g.applyOutline(PALETTE.OUTLINE);
    g.blitTo(ctx, ox, oy);
    return { sheet: this.propsSheet, x: ox, y: oy, w, h };
  }

  private bakeVillageCabin(ctx: CanvasRenderingContext2D, ox: number, oy: number): SpriteRect {
    const g = new PixelGrid(64, 48);
    // Stone chimney
    g.rect(46, 5, 7, 16, PALETTE.CLIFF_DARK);
    g.rect(47, 6, 5, 14, PALETTE.ROPE_BASE);
    g.rect(45, 4, 9, 2, PALETTE.SNOW_BRIGHT);

    // Timber walls
    g.rect(10, 22, 44, 24, PALETTE.MINE_WOOD);
    for (let y = 24; y < 46; y += 4) {
      g.rect(10, y, 44, 1, PALETTE.MINE_DIRT);
    }
    // Corner log ends
    g.rect(8, 22, 3, 24, PALETTE.BEAK_MID);
    g.rect(53, 22, 3, 24, PALETTE.BEAK_MID);

    // Arched door
    g.rect(27, 32, 10, 14, PALETTE.MINE_DIRT);
    g.rect(28, 33, 8, 13, PALETTE.BEAK_DARK);
    g.set(34, 39, PALETTE.LAB_AMBER);

    // Warm glowing alpine windows
    const drawWindow = (wx: number, wy: number) => {
      g.rect(wx, wy, 9, 8, PALETTE.MINE_DEEP);
      g.rect(wx + 1, wy + 1, 7, 6, PALETTE.LAB_AMBER);
      g.rect(wx + 2, wy + 2, 5, 3, '#fff0a6');
      g.rect(wx + 4, wy + 1, 1, 6, PALETTE.MINE_DEEP);
      g.rect(wx + 1, wy + 4, 7, 1, PALETTE.MINE_DEEP);
    };
    drawWindow(14, 29);
    drawWindow(41, 29);

    // Steep pitched snow-covered roof
    for (let row = 0; row < 16; row++) {
      const half = 4 + Math.round(row * 1.9);
      const x0 = Math.max(2, 32 - half);
      const x1 = Math.min(61, 32 + half);
      const col = row < 10 ? PALETTE.SNOW_BRIGHT : row < 13 ? PALETTE.SNOW_LIGHT : PALETTE.MINE_BRICK;
      g.rect(x0, 8 + row, x1 - x0 + 1, 1, col);
    }

    g.applyOutline(PALETTE.OUTLINE);
    g.blitTo(ctx, ox, oy);
    return { sheet: this.propsSheet, x: ox, y: oy, w: 64, h: 48 };
  }

  private bakeSummitBanner(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    frame: number
  ): SpriteRect {
    const g = new PixelGrid(48, 44);
    // Twin sturdy timber arch poles
    g.rect(5, 6, 3, 36, PALETTE.MINE_WOOD);
    g.rect(40, 6, 3, 36, PALETTE.MINE_WOOD);
    g.rect(4, 4, 5, 3, PALETTE.LAB_AMBER);
    g.rect(39, 4, 5, 3, PALETTE.LAB_AMBER);

    // Festive summit banner cloth waving between poles
    const sag = frame === 0 ? 0 : 1;
    for (let x = 8; x < 40; x++) {
      const curve = Math.round(Math.sin(((x - 8) / 32) * Math.PI) * (2 + sag));
      g.rect(x, 8 + curve, 1, 11, PALETTE.KRUNKED_SCARF);
      g.rect(x, 8 + curve, 1, 2, PALETTE.LAB_AMBER);
      g.rect(x, 17 + curve, 1, 2, PALETTE.LAB_AMBER);
    }
    // Center emblem star
    const sy = 14 + sag;
    g.rect(22, sy - 2, 4, 4, PALETTE.SNOW_BRIGHT);
    g.set(23, sy - 3, PALETTE.LAB_AMBER);
    g.set(24, sy - 3, PALETTE.LAB_AMBER);
    g.set(21, sy, PALETTE.LAB_AMBER);
    g.set(26, sy, PALETTE.LAB_AMBER);

    // Mini pennants on top
    g.rect(11, 19 + sag, 4, 3, PALETTE.FRED_SCARF);
    g.rect(33, 19 + sag, 4, 3, PALETTE.FRED_SCARF);

    g.applyOutline(PALETTE.OUTLINE);
    g.blitTo(ctx, ox, oy);
    return { sheet: this.propsSheet, x: ox, y: oy, w: 48, h: 44 };
  }
}
