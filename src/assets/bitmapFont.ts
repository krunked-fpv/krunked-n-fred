// ============================================================================
// Krunked & Fred — Crisp 5x7 Outlined Pixel Bitmap Font (480x270 Native)
// Zero per-frame allocations; precompiled horizontal run spans for fast blits.
// ============================================================================

import { PALETTE } from '../contracts';

export const GLYPH_WIDTH = 5;
export const GLYPH_HEIGHT = 7;

export interface PixelTextOptions {
  color?: string;
  outlineColor?: string | null;
  align?: 'left' | 'center' | 'right';
  scale?: number;
  letterSpacing?: number;
}

interface CompiledGlyph {
  /** Packed triples [dx, dy, width] for 1px outline (offset -1..-1 relative to glyph origin). */
  outlineSpans: Int8Array;
  /** Packed triples [dx, dy, width] for foreground pixels. */
  fgSpans: Int8Array;
}

const RAW_GLYPHS: Record<string, readonly string[]> = {
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.####', '#....', '#....', '#..##', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],

  // Clean readable lowercase glyphs
  a: ['.....', '.....', '.###.', '....#', '.####', '#...#', '.####'],
  b: ['#....', '#....', '####.', '#...#', '#...#', '#...#', '####.'],
  c: ['.....', '.....', '.####', '#....', '#....', '#....', '.####'],
  d: ['....#', '....#', '.####', '#...#', '#...#', '#...#', '.####'],
  e: ['.....', '.....', '.###.', '#...#', '#####', '#....', '.####'],
  f: ['..##.', '.#..#', '.#...', '####.', '.#...', '.#...', '.#...'],
  g: ['.....', '.####', '#...#', '#...#', '.####', '....#', '.###.'],
  h: ['#....', '#....', '####.', '#...#', '#...#', '#...#', '#...#'],
  i: ['..#..', '.....', '.##..', '..#..', '..#..', '..#..', '.###.'],
  j: ['...#.', '.....', '..##.', '...#.', '...#.', '#..#.', '.##..'],
  k: ['#....', '#....', '#..#.', '#.#..', '##...', '#.#..', '#..#.'],
  l: ['.##..', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  m: ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#...#', '#...#'],
  n: ['.....', '.....', '####.', '#...#', '#...#', '#...#', '#...#'],
  o: ['.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.'],
  p: ['.....', '####.', '#...#', '#...#', '####.', '#....', '#....'],
  q: ['.....', '.####', '#...#', '#...#', '.####', '....#', '....#'],
  r: ['.....', '.....', '#.##.', '##..#', '#....', '#....', '#....'],
  s: ['.....', '.....', '.####', '#....', '.###.', '....#', '####.'],
  t: ['..#..', '..#..', '####.', '..#..', '..#..', '..#.#', '...#.'],
  u: ['.....', '.....', '#...#', '#...#', '#...#', '#...#', '.####'],
  v: ['.....', '.....', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  w: ['.....', '.....', '#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'],
  x: ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  y: ['.....', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  z: ['.....', '.....', '#####', '...#.', '..#..', '.#...', '#####'],

  // Digits
  '0': ['.###.', '#..##', '#.#.#', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '..##.', '.#...', '#....', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['#...#', '#...#', '#...#', '#####', '....#', '....#', '....#'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '####.', '#...#', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],

  // Punctuation & HUD Symbols
  ':': ['.....', '..#..', '..#..', '.....', '..#..', '..#..', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '..#..', '..#..'],
  ',': ['.....', '.....', '.....', '.....', '..#..', '..#..', '.#...'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '..##.', '..#..', '.....', '..#..'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  '\\': ['#....', '.#...', '.#...', '..#..', '...#.', '...#.', '....#'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '[': ['.###.', '.#...', '.#...', '.#...', '.#...', '.#...', '.###.'],
  ']': ['.###.', '...#.', '...#.', '...#.', '...#.', '...#.', '.###.'],
  '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '.#.##', '#..##'],
  '&': ['.##..', '#..#.', '#.#..', '.##..', '#.#.#', '#..#.', '.##.#'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  '"': ['.#.#.', '.#.#.', '.....', '.....', '.....', '.....', '.....'],
  '_': ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '<': ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
  '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
  '#': ['.#.#.', '#####', '.#.#.', '.#.#.', '#####', '.#.#.', '.....'],
  '@': ['.###.', '#...#', '#.###', '#.#.#', '#.###', '#....', '.###.'],
  '~': ['.....', '.....', '.#.#.', '#.#.#', '.....', '.....', '.....'],
  '^': ['..#..', '.#.#.', '#...#', '.....', '.....', '.....', '.....'],
  '|': ['..#..', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  '\u2190': ['.....', '..#..', '.#...', '#####', '.#...', '..#..', '.....'],
  '\u2192': ['.....', '..#..', '...#.', '#####', '...#.', '..#..', '.....'],
  '\u2191': ['..#..', '.###.', '#.#.#', '..#..', '..#..', '..#..', '.....'],
  '\u2193': ['.....', '..#..', '..#..', '..#..', '#.#.#', '.###.', '..#..'],
  '\u2605': ['..#..', '..#..', '#####', '.###.', '.#.#.', '#...#', '.....'],
};

function compileGlyph(rows: readonly string[]): CompiledGlyph {
  const fgBits = new Uint8Array(7);
  for (let y = 0; y < 7; y++) {
    const row = rows[y] ?? '.....';
    let mask = 0;
    for (let x = 0; x < 5; x++) {
      if (row.charCodeAt(x) === 35 /* '#' */) {
        mask |= 1 << x;
      }
    }
    fgBits[y] = mask;
  }

  // 8-neighbor dilation onto a 7x9 grid (shifted by +1 in x and y)
  const outBits = new Uint8Array(9);
  for (let y = 0; y < 7; y++) {
    const rowMask = fgBits[y];
    if (rowMask === 0) continue;
    const dilatedX = (rowMask << 1) | rowMask | (rowMask << 2);
    outBits[y] |= dilatedX;
    outBits[y + 1] |= dilatedX;
    outBits[y + 2] |= dilatedX;
  }
  // Subtract foreground bits so outline only draws border pixels
  for (let y = 0; y < 7; y++) {
    outBits[y + 1] &= ~(fgBits[y] << 1);
  }

  const fgList: number[] = [];
  for (let y = 0; y < 7; y++) {
    const mask = fgBits[y];
    let x = 0;
    while (x < 5) {
      if ((mask & (1 << x)) !== 0) {
        const start = x;
        while (x < 5 && (mask & (1 << x)) !== 0) x++;
        fgList.push(start, y, x - start);
      } else {
        x++;
      }
    }
  }

  const outList: number[] = [];
  for (let y = 0; y < 9; y++) {
    const mask = outBits[y];
    let x = 0;
    while (x < 7) {
      if ((mask & (1 << x)) !== 0) {
        const start = x;
        while (x < 7 && (mask & (1 << x)) !== 0) x++;
        outList.push(start - 1, y - 1, x - start);
      } else {
        x++;
      }
    }
  }

  return {
    outlineSpans: new Int8Array(outList),
    fgSpans: new Int8Array(fgList),
  };
}

const COMPILED_GLYPHS = new Map<string, CompiledGlyph>();
for (const [ch, rows] of Object.entries(RAW_GLYPHS)) {
  COMPILED_GLYPHS.set(ch, compileGlyph(rows));
}
const FALLBACK_GLYPH = COMPILED_GLYPHS.get('?')!;
const SPACE_GLYPH = COMPILED_GLYPHS.get(' ')!;

function getGlyph(ch: string): CompiledGlyph {
  const exact = COMPILED_GLYPHS.get(ch);
  if (exact) return exact;
  const upper = COMPILED_GLYPHS.get(ch.toUpperCase());
  if (upper) return upper;
  return ch === ' ' ? SPACE_GLYPH : FALLBACK_GLYPH;
}

export function measurePixelText(
  text: string,
  scale = 1,
  letterSpacing = 1
): { width: number; height: number } {
  if (text.length === 0) return { width: 0, height: GLYPH_HEIGHT * scale };
  const s = Math.max(1, Math.round(scale));
  const step = (GLYPH_WIDTH + letterSpacing) * s;
  return {
    width: text.length * step - letterSpacing * s,
    height: GLYPH_HEIGHT * s,
  };
}

export function drawPixelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options?: PixelTextOptions
): void {
  if (!text) return;
  const color = options?.color ?? PALETTE.BELLY_WHITE;
  const outlineColor = options?.outlineColor === undefined ? PALETTE.OUTLINE : options.outlineColor;
  const align = options?.align ?? 'left';
  const s = Math.max(1, Math.round(options?.scale ?? 1));
  const letterSpacing = options?.letterSpacing ?? 1;
  const step = (GLYPH_WIDTH + letterSpacing) * s;

  let startX = Math.round(x);
  const startY = Math.round(y);
  if (align !== 'left') {
    const { width } = measurePixelText(text, s, letterSpacing);
    if (align === 'center') startX = Math.round(x - width * 0.5);
    else if (align === 'right') startX = Math.round(x - width);
  }

  // Pass 1: 1px crisp dark outline around every glyph
  if (outlineColor !== null) {
    ctx.fillStyle = outlineColor;
    let cx = startX;
    for (let i = 0; i < text.length; i++) {
      const spans = getGlyph(text[i]).outlineSpans;
      for (let j = 0; j < spans.length; j += 3) {
        ctx.fillRect(cx + spans[j] * s, startY + spans[j + 1] * s, spans[j + 2] * s, s);
      }
      cx += step;
    }
  }

  // Pass 2: crisp foreground pixels
  ctx.fillStyle = color;
  let cx = startX;
  for (let i = 0; i < text.length; i++) {
    const spans = getGlyph(text[i]).fgSpans;
    for (let j = 0; j < spans.length; j += 3) {
      ctx.fillRect(cx + spans[j] * s, startY + spans[j + 1] * s, spans[j + 2] * s, s);
    }
    cx += step;
  }
}

export function drawWrappedPixelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  options?: PixelTextOptions & { lineHeight?: number }
): number {
  const s = Math.max(1, Math.round(options?.scale ?? 1));
  const letterSpacing = options?.letterSpacing ?? 1;
  const lineHeight = options?.lineHeight ?? (GLYPH_HEIGHT + 3) * s;
  const charStep = (GLYPH_WIDTH + letterSpacing) * s;
  const maxChars = Math.max(4, Math.floor((maxWidth + letterSpacing * s) / charStep));

  const words = text.split(/\s+/);
  let line = '';
  let cy = Math.round(y);
  let linesDrawn = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const candidate = line.length === 0 ? word : `${line} ${word}`;
    if (candidate.length <= maxChars || line.length === 0) {
      line = candidate;
    } else {
      drawPixelText(ctx, line, x, cy, options);
      cy += lineHeight;
      linesDrawn++;
      line = word;
    }
  }
  if (line.length > 0) {
    drawPixelText(ctx, line, x, cy, options);
    linesDrawn++;
  }
  return linesDrawn * lineHeight;
}

export function drawPixelBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  border: string = PALETTE.OUTLINE,
  innerHighlight?: string
): void {
  const rx = Math.round(x);
  const ry = Math.round(y);
  const rw = Math.round(w);
  const rh = Math.round(h);
  if (rw < 3 || rh < 3) return;

  // Chamfered 1px pixel-art corner border
  ctx.fillStyle = border;
  ctx.fillRect(rx + 1, ry, rw - 2, rh);
  ctx.fillRect(rx, ry + 1, rw, rh - 2);

  // Inner body
  ctx.fillStyle = fill;
  ctx.fillRect(rx + 1, ry + 1, rw - 2, rh - 2);

  // Optional crisp top/left bevel highlight
  if (innerHighlight) {
    ctx.fillStyle = innerHighlight;
    ctx.fillRect(rx + 1, ry + 1, rw - 2, 1);
  }
}
