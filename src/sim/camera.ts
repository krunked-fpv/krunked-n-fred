import { PHYSICS, type CameraState, type LevelData, type SimState } from '../contracts';

const HALF_VIEW_W = PHYSICS.VIEWPORT_TILES_X * 0.5; // 15.0 u
const HALF_VIEW_H = PHYSICS.VIEWPORT_TILES_Y * 0.5; // 8.4375 u
const LOOKAHEAD_X_FACTOR = 0.16;
const LOOKAHEAD_X_MAX = 1.25;
const LOOKAHEAD_Y_FACTOR = 0.08;
const LOOKAHEAD_Y_MIN = -1.4;
const LOOKAHEAD_Y_MAX = 1.2;
const VERTICAL_BIAS = 0.85;
const FOLLOW_SPEED = 7.5;
const DARKNESS_FADE_RATE = 2.2;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function moveToward(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

function clampToLevelBounds(x: number, y: number, level: LevelData): { x: number; y: number } {
  const b = level.bounds;
  const minCamX = b.minX + HALF_VIEW_W;
  const maxCamX = b.maxX - HALF_VIEW_W;
  const clampedX =
    minCamX <= maxCamX ? clamp(x, minCamX, maxCamX) : (b.minX + b.maxX) * 0.5;

  const minCamY = b.minY + HALF_VIEW_H;
  const maxCamY = b.maxY - HALF_VIEW_H;
  const clampedY =
    minCamY <= maxCamY ? clamp(y, minCamY, maxCamY) : (b.minY + b.maxY) * 0.5;

  return { x: clampedX, y: clampedY };
}

function getFocusMidpoint(state: SimState): { x: number; y: number; vx: number; vy: number } {
  if (state.mode === 'solo_jeff' && state.jeff.active) {
    if (state.jeff.heldByP1) {
      return { x: state.p1.x, y: state.p1.y, vx: state.p1.vx, vy: state.p1.vy };
    }
    return {
      x: state.p1.x * 0.65 + state.jeff.x * 0.35,
      y: state.p1.y * 0.65 + state.jeff.y * 0.35,
      vx: state.p1.vx * 0.65 + state.jeff.vx * 0.35,
      vy: state.p1.vy * 0.65 + state.jeff.vy * 0.35,
    };
  }
  return {
    x: (state.p1.x + state.p2.x) * 0.5,
    y: (state.p1.y + state.p2.y) * 0.5,
    vx: (state.p1.vx + state.p2.vx) * 0.5,
    vy: (state.p1.vy + state.p2.vy) * 0.5,
  };
}

function isInDarkZone(level: LevelData, x: number, y: number): boolean {
  for (let i = 0; i < level.darkZones.length; i++) {
    const z = level.darkZones[i];
    if (x >= z.minX && x <= z.maxX && y >= z.minY && y <= z.maxY) {
      return true;
    }
  }
  return false;
}

export function createCameraState(level: LevelData, x: number, y: number): CameraState {
  const clamped = clampToLevelBounds(x, y + VERTICAL_BIAS, level);
  const dark = isInDarkZone(level, x, y) ? 1 : 0;
  return {
    x: clamped.x,
    y: clamped.y,
    prevX: clamped.x,
    prevY: clamped.y,
    targetX: clamped.x,
    targetY: clamped.y,
    shakeTimer: 0,
    shakeMag: 0,
    darknessAlpha: dark,
  };
}

/**
 * Adds a deterministic trauma-style screen shake impulse.
 */
export function addCameraShake(camera: CameraState, mag: number, duration: number): void {
  if (mag <= 0 || duration <= 0) return;
  camera.shakeMag = Math.max(camera.shakeMag, mag);
  camera.shakeTimer = Math.max(camera.shakeTimer, duration);
}

/**
 * Immediately snaps camera to player midpoint (used on spawn / warp).
 */
export function snapCamera(state: SimState, level: LevelData): void {
  const mid = getFocusMidpoint(state);
  const inBossArena =
    level.bossArena !== undefined && mid.y >= level.bossArena.minY - 2;
  const biasY = inBossArena ? VERTICAL_BIAS + 2.8 : VERTICAL_BIAS;
  const clamped = clampToLevelBounds(mid.x, mid.y + biasY, level);
  state.camera.x = clamped.x;
  state.camera.y = clamped.y;
  state.camera.prevX = clamped.x;
  state.camera.prevY = clamped.y;
  state.camera.targetX = clamped.x;
  state.camera.targetY = clamped.y;
  state.camera.shakeTimer = 0;
  state.camera.shakeMag = 0;
  state.camera.darknessAlpha = isInDarkZone(level, mid.x, mid.y) ? 1 : 0;
}

/**
 * Updates camera position, lookahead, bounds clamping, darkness fade, and shake decay.
 */
export function updateCamera(state: SimState, level: LevelData, dt: number): void {
  const cam = state.camera;
  cam.prevX = cam.x;
  cam.prevY = cam.y;

  const mid = getFocusMidpoint(state);
  const inBossArena =
    level.bossArena !== undefined && mid.y >= level.bossArena.minY - 2;
  const biasY = inBossArena ? VERTICAL_BIAS + 2.8 : VERTICAL_BIAS;
  const lookX = clamp(mid.vx * LOOKAHEAD_X_FACTOR, -LOOKAHEAD_X_MAX, LOOKAHEAD_X_MAX);
  const lookY = clamp(mid.vy * LOOKAHEAD_Y_FACTOR, LOOKAHEAD_Y_MIN, LOOKAHEAD_Y_MAX);

  const clampedTarget = clampToLevelBounds(mid.x + lookX, mid.y + biasY + lookY, level);
  cam.targetX = clampedTarget.x;
  cam.targetY = clampedTarget.y;

  const alpha = 1 - Math.exp(-FOLLOW_SPEED * dt);
  const nextX = cam.x + (cam.targetX - cam.x) * alpha;
  const nextY = cam.y + (cam.targetY - cam.y) * alpha;
  const clampedNow = clampToLevelBounds(nextX, nextY, level);
  cam.x = clampedNow.x;
  cam.y = clampedNow.y;

  // Smooth darkness transition when entering/leaving darkZones (e.g. Zone 2 Mines)
  const targetDark = isInDarkZone(level, mid.x, mid.y) ? 1 : 0;
  cam.darknessAlpha = moveToward(cam.darknessAlpha, targetDark, DARKNESS_FADE_RATE * dt);

  // Trauma shake decay
  if (cam.shakeTimer > 0) {
    const prevTimer = cam.shakeTimer;
    cam.shakeTimer = Math.max(0, cam.shakeTimer - dt);
    if (cam.shakeTimer <= 0) {
      cam.shakeMag = 0;
    } else {
      cam.shakeMag = cam.shakeMag * (cam.shakeTimer / prevTimer);
    }
  } else {
    cam.shakeMag = 0;
  }
}
