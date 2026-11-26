// ============================================================================
// Krunked & Fred — Gate A Verification Harness (`npm run verify:assets`)
// Runs all 5 Gate A checks and exits non-zero on ANY violation:
//   1. Catalog & Built-In Pack Completeness
//   2. Custom Pack Manifest Resolution (when present)
//   3. Mechanic Oracle Parity (contracts vs ground truth & oracle.json)
//   4. TASTE_NOTES Enforcement (Touch, Gamepad, WebGL2 NEAREST 480x270, Online Co-Op)
//   5. Clean-Room IP & Binary Firewall (git ls-files + dist/)
// ============================================================================

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACHIEVEMENT_IDS,
  ACTION_STATES,
  CATALOG_COUNTS,
  COOP_SKINS,
  JEFF_SKINS,
  JUKEBOX_TRACKS,
  MANUAL_PAGE_IDS,
  PALETTE,
  PHOTO_IDS,
  PHYSICS,
  ROPE_SKINS,
  TERRAIN_TYPES,
  TIME_TRIAL_MEDALS,
  WORLD,
  type AssetPackManifest,
} from '../../src/contracts';
import {
  ACHIEVEMENT_CATALOG,
  ACHIEVEMENT_LIST,
  COOP_SKIN_CATALOG,
  COOP_SKIN_LIST,
  JEFF_SKIN_CATALOG,
  JEFF_SKIN_LIST,
  JUKEBOX_TRACK_CATALOG,
  JUKEBOX_TRACK_LIST,
  MANUAL_PAGE_CATALOG,
  MANUAL_PAGE_LIST,
  PHOTO_CATALOG,
  PHOTO_LIST,
  ROPE_SKIN_CATALOG,
  ROPE_SKIN_LIST,
} from '../../src/data/catalogs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const ASSETS_DIR = path.join(REPO_ROOT, '.krunked-n-fred-assets');
const MANIFEST_PATH = path.join(ASSETS_DIR, 'manifest.json');
const ORACLE_PATH = path.join(ASSETS_DIR, 'oracle.json');
const DIST_DIR = path.join(REPO_ROOT, 'dist');

const errors: string[] = [];

function assert(cond: boolean, message: string): void {
  if (!cond) {
    errors.push(message);
  }
}

function assertApprox(actual: number, expected: number, label: string, eps = 1e-6): void {
  if (typeof actual !== 'number' || !Number.isFinite(actual) || Math.abs(actual - expected) > eps) {
    errors.push(`[Oracle] ${label}: expected ${expected}, got ${String(actual)}`);
  }
}

function assertEq<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    errors.push(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function walkFiles(dir: string, relBase = ''): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full, rel));
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
  return out;
}

// ============================================================================
// Check 1: Catalog & Built-In Pack Completeness
// ============================================================================
function checkCatalogAndBuiltinPack(): void {
  const before = errors.length;

  assertEq(COOP_SKINS.length, 16, '[Catalog] COOP_SKINS length');
  assertEq(COOP_SKIN_LIST.length, 16, '[Catalog] COOP_SKIN_LIST length');
  assertEq(Object.keys(COOP_SKIN_CATALOG).length, 16, '[Catalog] COOP_SKIN_CATALOG keys');
  assertEq(CATALOG_COUNTS.COOP_SKINS, 16, '[Catalog] CATALOG_COUNTS.COOP_SKINS');
  assertEq(new Set(COOP_SKINS).size, 16, '[Catalog] unique COOP_SKINS');

  assertEq(JEFF_SKINS.length, 6, '[Catalog] JEFF_SKINS length');
  assertEq(JEFF_SKIN_LIST.length, 6, '[Catalog] JEFF_SKIN_LIST length');
  assertEq(Object.keys(JEFF_SKIN_CATALOG).length, 6, '[Catalog] JEFF_SKIN_CATALOG keys');
  assertEq(CATALOG_COUNTS.JEFF_SKINS, 6, '[Catalog] CATALOG_COUNTS.JEFF_SKINS');
  assertEq(new Set(JEFF_SKINS).size, 6, '[Catalog] unique JEFF_SKINS');

  assertEq(ROPE_SKINS.length, 12, '[Catalog] ROPE_SKINS length');
  assertEq(ROPE_SKIN_LIST.length, 12, '[Catalog] ROPE_SKIN_LIST length');
  assertEq(Object.keys(ROPE_SKIN_CATALOG).length, 12, '[Catalog] ROPE_SKIN_CATALOG keys');
  assertEq(CATALOG_COUNTS.ROPE_SKINS, 12, '[Catalog] CATALOG_COUNTS.ROPE_SKINS');
  assertEq(new Set(ROPE_SKINS).size, 12, '[Catalog] unique ROPE_SKINS');

  assertEq(JUKEBOX_TRACKS.length, 11, '[Catalog] JUKEBOX_TRACKS length');
  assertEq(JUKEBOX_TRACK_LIST.length, 11, '[Catalog] JUKEBOX_TRACK_LIST length');
  assertEq(Object.keys(JUKEBOX_TRACK_CATALOG).length, 11, '[Catalog] JUKEBOX_TRACK_CATALOG keys');
  assertEq(CATALOG_COUNTS.JUKEBOX_TRACKS, 11, '[Catalog] CATALOG_COUNTS.JUKEBOX_TRACKS');
  assertEq(new Set(JUKEBOX_TRACKS).size, 11, '[Catalog] unique JUKEBOX_TRACKS');

  assertEq(PHOTO_IDS.length, 12, '[Catalog] PHOTO_IDS length');
  assertEq(PHOTO_LIST.length, 12, '[Catalog] PHOTO_LIST length');
  assertEq(Object.keys(PHOTO_CATALOG).length, 12, '[Catalog] PHOTO_CATALOG keys');
  assertEq(CATALOG_COUNTS.PHOTOS, 12, '[Catalog] CATALOG_COUNTS.PHOTOS');
  assertEq(new Set(PHOTO_IDS).size, 12, '[Catalog] unique PHOTO_IDS');

  assertEq(MANUAL_PAGE_IDS.length, 7, '[Catalog] MANUAL_PAGE_IDS length');
  assertEq(MANUAL_PAGE_LIST.length, 7, '[Catalog] MANUAL_PAGE_LIST length');
  assertEq(Object.keys(MANUAL_PAGE_CATALOG).length, 7, '[Catalog] MANUAL_PAGE_CATALOG keys');
  assertEq(CATALOG_COUNTS.MANUAL_PAGES, 7, '[Catalog] CATALOG_COUNTS.MANUAL_PAGES');
  assertEq(new Set(MANUAL_PAGE_IDS).size, 7, '[Catalog] unique MANUAL_PAGE_IDS');

  assertEq(ACHIEVEMENT_IDS.length, 26, '[Catalog] ACHIEVEMENT_IDS length');
  assertEq(ACHIEVEMENT_LIST.length, 26, '[Catalog] ACHIEVEMENT_LIST length');
  assertEq(Object.keys(ACHIEVEMENT_CATALOG).length, 26, '[Catalog] ACHIEVEMENT_CATALOG keys');
  assertEq(CATALOG_COUNTS.ACHIEVEMENTS, 26, '[Catalog] CATALOG_COUNTS.ACHIEVEMENTS');
  assertEq(new Set(ACHIEVEMENT_IDS).size, 26, '[Catalog] unique ACHIEVEMENT_IDS');

  assertEq(TERRAIN_TYPES.length, 14, '[Catalog] TERRAIN_TYPES length');
  assertEq(CATALOG_COUNTS.TERRAIN_TYPES, 14, '[Catalog] CATALOG_COUNTS.TERRAIN_TYPES');
  assertEq(new Set(TERRAIN_TYPES).size, 14, '[Catalog] unique TERRAIN_TYPES');

  assertEq(ACTION_STATES.length, 13, '[Catalog] ACTION_STATES length');
  assertEq(CATALOG_COUNTS.ACTION_STATES, 13, '[Catalog] CATALOG_COUNTS.ACTION_STATES');
  assertEq(new Set(ACTION_STATES).size, 13, '[Catalog] unique ACTION_STATES');

  assertEq(TIME_TRIAL_MEDALS.length, 10, '[Catalog] TIME_TRIAL_MEDALS length');
  assertEq(CATALOG_COUNTS.TIME_TRIALS, 10, '[Catalog] CATALOG_COUNTS.TIME_TRIALS');

  for (const s of COOP_SKIN_LIST) {
    assert(s.name.length > 0 && s.description.length > 0, `[Catalog] Co-Op skin ${s.id} incomplete`);
  }
  for (const s of JEFF_SKIN_LIST) {
    assert(s.name.length > 0 && s.description.length > 0, `[Catalog] Jeff skin ${s.id} incomplete`);
  }
  for (const s of ROPE_SKIN_LIST) {
    assert(s.name.length > 0 && s.description.length > 0, `[Catalog] Rope skin ${s.id} incomplete`);
  }
  for (const t of JUKEBOX_TRACK_LIST) {
    assert(t.title.length > 0 && t.bpm > 0, `[Catalog] Track ${t.id} incomplete`);
  }
  for (const p of PHOTO_LIST) {
    assert(p.title.length > 0 && p.caption.length > 0, `[Catalog] Photo ${p.id} incomplete`);
  }
  for (const m of MANUAL_PAGE_LIST) {
    assert(m.title.length > 0 && m.tip.length > 0, `[Catalog] Manual ${m.id} incomplete`);
  }
  for (const a of ACHIEVEMENT_LIST) {
    assert(a.name.length > 0 && a.description.length > 0, `[Catalog] Achievement ${a.id} incomplete`);
  }

  for (const rel of [
    'src/assets/ProceduralPixelAtlas.ts',
    'src/assets/AssetPackManager.ts',
    'src/assets/bitmapFont.ts',
    'src/audio/ProceduralSynth.ts',
    'src/audio/AudioEngine.ts',
  ]) {
    assert(fs.existsSync(path.join(REPO_ROOT, rel)), `[BuiltInPack] Missing required file: ${rel}`);
  }

  const passed = errors.length === before;
  console.log(
    `[Gate A.1] Catalog & Built-In Pack Completeness: ${passed ? 'PASS' : 'FAIL'} (16/6/12/11/12/7/26/14/13/10)`,
  );
}

// ============================================================================
// Check 2: Custom Pack Manifest Resolution (when present)
// ============================================================================
function checkCustomPackManifest(): void {
  const before = errors.length;
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.log(
      '[Gate A.2] Custom Pack Manifest Resolution: PASS (skipped — no local .krunked-n-fred-assets/manifest.json)',
    );
    return;
  }

  let parsed: Partial<AssetPackManifest> | null = null;
  try {
    parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as Partial<AssetPackManifest>;
  } catch (err) {
    errors.push(`[CustomPack] Failed to parse manifest.json: ${String(err)}`);
    console.log('[Gate A.2] Custom Pack Manifest Resolution: FAIL');
    return;
  }

  assert(
    typeof parsed?.packName === 'string' && parsed.packName.trim().length > 0,
    '[CustomPack] manifest.packName must be a non-empty string',
  );
  assert(
    typeof parsed?.version === 'string' && parsed.version.trim().length > 0,
    '[CustomPack] manifest.version must be a non-empty string',
  );
  assert(
    parsed?.source === 'custom' || parsed?.source === 'builtin',
    `[CustomPack] manifest.source must be 'custom' or 'builtin', got ${String(parsed?.source)}`,
  );
  assert(
    parsed?.sprites !== null && typeof parsed?.sprites === 'object' && !Array.isArray(parsed?.sprites),
    '[CustomPack] manifest.sprites must be a string map',
  );
  assert(
    parsed?.audio !== null && typeof parsed?.audio === 'object' && !Array.isArray(parsed?.audio),
    '[CustomPack] manifest.audio must be a string map',
  );
  assert(
    parsed?.localization !== null &&
      typeof parsed?.localization === 'object' &&
      !Array.isArray(parsed?.localization),
    '[CustomPack] manifest.localization must be a string map',
  );

  const verifyRelativeFile = (section: string, key: string, rel: unknown): void => {
    if (typeof rel !== 'string' || rel.trim().length === 0) {
      errors.push(`[CustomPack] ${section}.${key} must be a non-empty relative path string`);
      return;
    }
    if (path.isAbsolute(rel) || rel.startsWith('http://') || rel.startsWith('https://')) {
      errors.push(`[CustomPack] ${section}.${key} must be a relative path inside .krunked-n-fred-assets/, got ${rel}`);
      return;
    }
    const resolved = path.resolve(ASSETS_DIR, rel);
    const normalizedRoot = path.resolve(ASSETS_DIR) + path.sep;
    if (!resolved.startsWith(normalizedRoot)) {
      errors.push(`[CustomPack] ${section}.${key} escapes .krunked-n-fred-assets/: ${rel}`);
      return;
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      errors.push(`[CustomPack] ${section}.${key} missing referenced file on disk: ${rel}`);
    }
  };

  let verifiedFiles = 0;
  for (const [k, v] of Object.entries(parsed?.sprites ?? {})) {
    verifyRelativeFile('sprites', k, v);
    verifiedFiles++;
  }
  for (const [k, v] of Object.entries(parsed?.audio ?? {})) {
    verifyRelativeFile('audio', k, v);
    verifiedFiles++;
  }
  for (const [k, v] of Object.entries(parsed?.localization ?? {})) {
    if (typeof v !== 'string') {
      errors.push(`[CustomPack] localization.${k} must be a string`);
      continue;
    }
    if (v.includes('/') || v.includes('\\') || /\.(json|txt)$/i.test(v)) {
      verifyRelativeFile('localization', k, v);
      verifiedFiles++;
    }
  }

  const passed = errors.length === before;
  console.log(
    `[Gate A.2] Custom Pack Manifest Resolution: ${passed ? 'PASS' : 'FAIL'} (${verifiedFiles} file refs verified)`,
  );
}

// ============================================================================
// Check 3: Mechanic Oracle Parity
// ============================================================================
function resolveContractPath(contractPath: string): unknown {
  const [rootName, prop] = contractPath.split('.');
  const roots: Record<string, Record<string, unknown>> = {
    PHYSICS: PHYSICS as unknown as Record<string, unknown>,
    WORLD: WORLD as unknown as Record<string, unknown>,
    CATALOG_COUNTS: CATALOG_COUNTS as unknown as Record<string, unknown>,
    PALETTE: PALETTE as unknown as Record<string, unknown>,
  };
  return roots[rootName]?.[prop];
}

function checkMechanicOracleParity(): void {
  const before = errors.length;

  // Engine & Timing
  assertApprox(PHYSICS.SIM_HZ, 50, 'PHYSICS.SIM_HZ');
  assertApprox(PHYSICS.FIXED_DT, 0.02, 'PHYSICS.FIXED_DT');
  assertApprox(PHYSICS.MAX_ALLOWED_TIMESTEP, 0.1, 'PHYSICS.MAX_ALLOWED_TIMESTEP');
  assertApprox(PHYSICS.GRAVITY_Y, -9.81, 'PHYSICS.GRAVITY_Y');
  assertApprox(PHYSICS.PENGUIN_GRAVITY_SCALE, 5.0, 'PHYSICS.PENGUIN_GRAVITY_SCALE');
  assertApprox(PHYSICS.EFFECTIVE_GRAVITY_Y, -49.05, 'PHYSICS.EFFECTIVE_GRAVITY_Y');
  assertApprox(PHYSICS.VELOCITY_ITERATIONS, 8, 'PHYSICS.VELOCITY_ITERATIONS');
  assertApprox(PHYSICS.POSITION_ITERATIONS, 20, 'PHYSICS.POSITION_ITERATIONS');
  assertApprox(PHYSICS.MAX_LINEAR_CORRECTION, 20, 'PHYSICS.MAX_LINEAR_CORRECTION');
  assertApprox(PHYSICS.DEFAULT_CONTACT_OFFSET, 0.01, 'PHYSICS.DEFAULT_CONTACT_OFFSET');
  assertApprox(PHYSICS.LOGICAL_WIDTH, 480, 'PHYSICS.LOGICAL_WIDTH');
  assertApprox(PHYSICS.LOGICAL_HEIGHT, 270, 'PHYSICS.LOGICAL_HEIGHT');
  assertApprox(PHYSICS.CAMERA_ORTHO_SIZE, 8.4375, 'PHYSICS.CAMERA_ORTHO_SIZE');
  assertApprox(PHYSICS.PPU, 16, 'PHYSICS.PPU');
  assertApprox(PHYSICS.TILE_SIZE, 16, 'PHYSICS.TILE_SIZE');
  assertApprox(PHYSICS.VIEWPORT_TILES_X, 30, 'PHYSICS.VIEWPORT_TILES_X');
  assertApprox(PHYSICS.VIEWPORT_TILES_Y, 16.875, 'PHYSICS.VIEWPORT_TILES_Y');

  // Hitboxes & Tether
  assertApprox(PHYSICS.PENGUIN_MASS, 0.5, 'PHYSICS.PENGUIN_MASS');
  assertApprox(PHYSICS.PENGUIN_BOX_W, 0.62, 'PHYSICS.PENGUIN_BOX_W');
  assertApprox(PHYSICS.PENGUIN_BOX_H, 0.8681, 'PHYSICS.PENGUIN_BOX_H');
  assertApprox(PHYSICS.PENGUIN_BOX_OFFSET_X, 0, 'PHYSICS.PENGUIN_BOX_OFFSET_X');
  assertApprox(PHYSICS.PENGUIN_BOX_OFFSET_Y, -0.1272, 'PHYSICS.PENGUIN_BOX_OFFSET_Y');
  assertApprox(PHYSICS.JEFF_MASS, 0.5, 'PHYSICS.JEFF_MASS');
  assertApprox(PHYSICS.JEFF_BOX_W, 0.4975, 'PHYSICS.JEFF_BOX_W');
  assertApprox(PHYSICS.JEFF_BOX_H, 0.6379, 'PHYSICS.JEFF_BOX_H');
  assertApprox(PHYSICS.JEFF_BOX_OFFSET_X, -0.001, 'PHYSICS.JEFF_BOX_OFFSET_X');
  assertApprox(PHYSICS.JEFF_BOX_OFFSET_Y, -0.2423, 'PHYSICS.JEFF_BOX_OFFSET_Y');
  assertApprox(PHYSICS.ROPE_MAX_DISTANCE, 2.5, 'PHYSICS.ROPE_MAX_DISTANCE');
  assertApprox(PHYSICS.ROPE_SEGMENTS, 35, 'PHYSICS.ROPE_SEGMENTS');
  assertApprox(PHYSICS.ROPE_SEG_LEN, 0.25, 'PHYSICS.ROPE_SEG_LEN');
  assertApprox(PHYSICS.ROPE_LINE_WIDTH, 0.1, 'PHYSICS.ROPE_LINE_WIDTH');
  assertApprox(PHYSICS.ROPE_CONSTRAINT_ITERATIONS, 10, 'PHYSICS.ROPE_CONSTRAINT_ITERATIONS');
  assertApprox(PHYSICS.ROPE_GRAVITY_Y, -1.0, 'PHYSICS.ROPE_GRAVITY_Y');
  assertApprox(PHYSICS.ROPE_ATTACH_OFFSET_Y, -0.12, 'PHYSICS.ROPE_ATTACH_OFFSET_Y');

  // Movement & Actions
  assertApprox(PHYSICS.WALK_SPEED, 5.0, 'PHYSICS.WALK_SPEED');
  assertApprox(PHYSICS.GROUND_DETECTION_RANGE, 0.3, 'PHYSICS.GROUND_DETECTION_RANGE');
  assertApprox(PHYSICS.DETECT_GROUND_OFFSET, 0.01551, 'PHYSICS.DETECT_GROUND_OFFSET');
  assertApprox(PHYSICS.WALL_MARGIN, 0.4, 'PHYSICS.WALL_MARGIN');
  assertApprox(PHYSICS.ICE_ACCEL_TIME, 0.5, 'PHYSICS.ICE_ACCEL_TIME');
  assertApprox(PHYSICS.ICE_AIR_ACCEL_TIME, 0.1, 'PHYSICS.ICE_AIR_ACCEL_TIME');
  assertApprox(PHYSICS.JUMP_FORCE, 18.0, 'PHYSICS.JUMP_FORCE');
  assertApprox(PHYSICS.JUMP_COOLDOWN, 0.08, 'PHYSICS.JUMP_COOLDOWN');
  assertApprox(PHYSICS.JUMP_BUFFER_TIME, 0.1, 'PHYSICS.JUMP_BUFFER_TIME');
  assertApprox(PHYSICS.PEAK_JUMP_HEIGHT, (18.0 * 18.0) / (2 * 49.05), 'PHYSICS.PEAK_JUMP_HEIGHT');
  assertApprox(PHYSICS.COYOTE_TIME, 0.1, 'PHYSICS.COYOTE_TIME');
  assertApprox(PHYSICS.FALL_HARD_TIME, 0.6, 'PHYSICS.FALL_HARD_TIME');
  assertApprox(PHYSICS.FALL_HARD_TIME_ONLINE, 0.7, 'PHYSICS.FALL_HARD_TIME_ONLINE');
  assertApprox(PHYSICS.LAND_HARD_STUN_TIME, 0.45, 'PHYSICS.LAND_HARD_STUN_TIME');
  assertApprox(PHYSICS.GRAB_TIMER, 15.0, 'PHYSICS.GRAB_TIMER');
  assertApprox(PHYSICS.GRAB_TIMER_BETTER, 30.0, 'PHYSICS.GRAB_TIMER_BETTER');
  assertApprox(PHYSICS.GRAB_RANGE, 0.8, 'PHYSICS.GRAB_RANGE');
  assertApprox(PHYSICS.GRAB_RANGE_BETTER, 1.2, 'PHYSICS.GRAB_RANGE_BETTER');
  assertApprox(PHYSICS.GRAB_JEFF_TIMER, 7.5, 'PHYSICS.GRAB_JEFF_TIMER');
  assertApprox(PHYSICS.GRAB_JEFF_RANGE, 0.8, 'PHYSICS.GRAB_JEFF_RANGE');
  assertApprox(PHYSICS.GRAB_JEFF_BOTTOM_MARGIN, 0.5, 'PHYSICS.GRAB_JEFF_BOTTOM_MARGIN');
  assertApprox(PHYSICS.GRAB_JEFF_FALL_SPEED, 2.5, 'PHYSICS.GRAB_JEFF_FALL_SPEED');
  assertApprox(PHYSICS.GRAB_JEFF_PRECISION, 0.05, 'PHYSICS.GRAB_JEFF_PRECISION');
  assertApprox(PHYSICS.GRAB_JEFF_PLATFORM_CHECK_RANGE, 3.0, 'PHYSICS.GRAB_JEFF_PLATFORM_CHECK_RANGE');
  assertApprox(PHYSICS.ICE_ANCHOR_WIND_FORCE, 0.2, 'PHYSICS.ICE_ANCHOR_WIND_FORCE');
  assertApprox(PHYSICS.SWING_FORCE, 5.0, 'PHYSICS.SWING_FORCE');
  assertApprox(PHYSICS.SWING_FORCE_JEFF, 6.0, 'PHYSICS.SWING_FORCE_JEFF');
  assertApprox(PHYSICS.SWING_ADDITIVE_FORCE, 0.01, 'PHYSICS.SWING_ADDITIVE_FORCE');
  assertApprox(PHYSICS.SWING_TIME, 0.5, 'PHYSICS.SWING_TIME');
  assertApprox(PHYSICS.SWING_REST_TIME, 0.75, 'PHYSICS.SWING_REST_TIME');
  assertApprox(PHYSICS.SWING_TIME_BEFORE_FALLING, 1.0, 'PHYSICS.SWING_TIME_BEFORE_FALLING');
  assertApprox(PHYSICS.SWING_NEUTRAL_DAMPING_DIV, 4.0, 'PHYSICS.SWING_NEUTRAL_DAMPING_DIV');
  assertApprox(PHYSICS.SWING_RADIAL_CLAMP, 23.0, 'PHYSICS.SWING_RADIAL_CLAMP');
  assertApprox(PHYSICS.DRAG_BASE_FORCE, 1.0, 'PHYSICS.DRAG_BASE_FORCE');
  assertApprox(PHYSICS.DRAG_ESCALATION_PER_SEC, 1.5, 'PHYSICS.DRAG_ESCALATION_PER_SEC');
  assertApprox(PHYSICS.DRAG_PULL_FORCE, 2.5, 'PHYSICS.DRAG_PULL_FORCE');
  assertApprox(PHYSICS.DRAG_NO_WALL_TIME, 0.2, 'PHYSICS.DRAG_NO_WALL_TIME');
  assertApprox(PHYSICS.PULL_ROPE_MIN_DIST, 0.05, 'PHYSICS.PULL_ROPE_MIN_DIST');
  assertApprox(PHYSICS.PULL_ROPE_TIME_COOP, 2.5, 'PHYSICS.PULL_ROPE_TIME_COOP');
  assertApprox(PHYSICS.PULL_ROPE_TIME_JEFF, 1.5, 'PHYSICS.PULL_ROPE_TIME_JEFF');
  assertApprox(PHYSICS.CALL_CHARLIE_HOLD_TIME, 1.5, 'PHYSICS.CALL_CHARLIE_HOLD_TIME');

  // Hazards & Worlds
  assertApprox(PHYSICS.WIND_FORCE_GROUND, 0.65, 'PHYSICS.WIND_FORCE_GROUND');
  assertApprox(PHYSICS.WIND_FORCE_AIR, 1.4, 'PHYSICS.WIND_FORCE_AIR');
  assertApprox(PHYSICS.WIND_FORCE_ICE, 1.2, 'PHYSICS.WIND_FORCE_ICE');
  assertApprox(PHYSICS.WIND_FORCE_ANCHOR_ICE, 0.2, 'PHYSICS.WIND_FORCE_ANCHOR_ICE');
  assertApprox(PHYSICS.WIND_ACTIVE_TIME, 5.0, 'PHYSICS.WIND_ACTIVE_TIME');
  assertApprox(PHYSICS.WIND_WAIT_TIME, 5.0, 'PHYSICS.WIND_WAIT_TIME');
  assertApprox(PHYSICS.WIND_TELEGRAPH_TIME, 0.6, 'PHYSICS.WIND_TELEGRAPH_TIME');
  assertApprox(PHYSICS.FALLING_BLOCK_HOLD_TIME, 1.0, 'PHYSICS.FALLING_BLOCK_HOLD_TIME');
  assertApprox(PHYSICS.FALLING_BLOCK_RECOVER_TIME, 2.0, 'PHYSICS.FALLING_BLOCK_RECOVER_TIME');
  assertApprox(PHYSICS.SWING_PLATFORM_MIN_DISP, 8.43, 'PHYSICS.SWING_PLATFORM_MIN_DISP');
  assertApprox(PHYSICS.SWING_PLATFORM_MAX_DISP, 9.78, 'PHYSICS.SWING_PLATFORM_MAX_DISP');
  assertApprox(PHYSICS.SWING_PLATFORM_MIN_RADIUS, 12.12, 'PHYSICS.SWING_PLATFORM_MIN_RADIUS');
  assertApprox(PHYSICS.SWING_PLATFORM_MAX_RADIUS, 12.5, 'PHYSICS.SWING_PLATFORM_MAX_RADIUS');
  assertApprox(PHYSICS.SWING_PLATFORM_MIN_TIME, 1.0, 'PHYSICS.SWING_PLATFORM_MIN_TIME');
  assertApprox(PHYSICS.SWING_PLATFORM_MAX_TIME, 1.5, 'PHYSICS.SWING_PLATFORM_MAX_TIME');

  assertApprox(WORLD.VILLAGE_Y, 0, 'WORLD.VILLAGE_Y');
  assertApprox(WORLD.ZONE1_START_Y, 0, 'WORLD.ZONE1_START_Y');
  assertApprox(WORLD.ZONE1_END_Y, 91, 'WORLD.ZONE1_END_Y');
  assertApprox(WORLD.ZONE2_START_Y, 91, 'WORLD.ZONE2_START_Y');
  assertApprox(WORLD.ZONE2_DARK_START_Y, 103, 'WORLD.ZONE2_DARK_START_Y');
  assertApprox(WORLD.ZONE2_END_Y, 217, 'WORLD.ZONE2_END_Y');
  assertApprox(WORLD.ZONE3_START_Y, 217, 'WORLD.ZONE3_START_Y');
  assertApprox(WORLD.ZONE3_END_Y, 395, 'WORLD.ZONE3_END_Y');
  assertApprox(WORLD.ZONE4_START_Y, 395, 'WORLD.ZONE4_START_Y');
  assertApprox(WORLD.COOP_SUMMIT_Y, 498, 'WORLD.COOP_SUMMIT_Y');
  assertApprox(WORLD.SOLO_SUMMIT_Y, 497, 'WORLD.SOLO_SUMMIT_Y');
  assertApprox(WORLD.LAB_SUMMIT_Y, 661, 'WORLD.LAB_SUMMIT_Y');

  // Time Trials (TT1..TT10)
  const expectedTrials: ReadonlyArray<readonly [string, number, number, number, number]> = [
    ['TT1', 190, 150, 100, 70],
    ['TT2', 190, 150, 100, 80],
    ['TT3', 120, 90, 60, 50],
    ['TT4', 155, 120, 90, 65],
    ['TT5', 150, 115, 85, 60],
    ['TT6', 135, 90, 75, 55],
    ['TT7', 165, 135, 90, 70],
    ['TT8', 180, 150, 100, 60],
    ['TT9', 155, 120, 80, 50],
    ['TT10', 135, 90, 70, 57],
  ];
  for (let i = 0; i < expectedTrials.length; i++) {
    const [id, bronze, silver, gold, platinum] = expectedTrials[i];
    const actual = TIME_TRIAL_MEDALS[i];
    assert(Boolean(actual), `[Oracle] Missing TIME_TRIAL_MEDALS[${i}] (${id})`);
    if (actual) {
      assertEq(actual.id, id, `[Oracle] TIME_TRIAL_MEDALS[${i}].id`);
      assertEq(actual.index, i + 1, `[Oracle] ${id}.index`);
      assertApprox(actual.bronze, bronze, `${id}.bronze`);
      assertApprox(actual.silver, silver, `${id}.silver`);
      assertApprox(actual.gold, gold, `${id}.gold`);
      assertApprox(actual.platinum, platinum, `${id}.platinum`);
    }
  }

  // Palette tokens
  const expectedPalette: Record<string, string> = {
    OUTLINE: '#222034',
    BODY_DARK: '#312e4e',
    BODY_MAIN: '#3f3f74',
    BELLY_WHITE: '#ffffff',
    BELLY_SHADE: '#cbdbfc',
    BEAK_BRIGHT: '#df7126',
    ROPE_BASE: '#9badb7',
    KRUNKED_SCARF: '#d11651',
    FRED_SCARF: '#25af7c',
    SKY_DEEP: '#13123a',
    MINE_VOID: '#1f1321',
    LAB_CYAN: '#38e8ff',
    LAB_AMBER: '#ffb830',
  };
  for (const [key, val] of Object.entries(expectedPalette)) {
    assertEq(
      (PALETTE as Record<string, string>)[key]?.toLowerCase(),
      val.toLowerCase(),
      `[Oracle] PALETTE.${key}`,
    );
  }
  for (const [key, val] of Object.entries(PALETTE)) {
    assert(/^#[0-9a-f]{6}$/i.test(val), `[Oracle] PALETTE.${key} invalid hex: ${val}`);
  }

  // Cross-check against .krunked-n-fred-assets/oracle.json when present
  let oracleChecked = false;
  if (fs.existsSync(ORACLE_PATH)) {
    oracleChecked = true;
    try {
      const oracle = JSON.parse(fs.readFileSync(ORACLE_PATH, 'utf8')) as {
        engineTiming?: Record<string, { value: number; provenance: string; contractPath: string }>;
        hitboxesAndTether?: Record<string, { value: number; provenance: string; contractPath: string }>;
        movementAndActions?: Record<string, { value: number; provenance: string; contractPath: string }>;
        hazardsAndWorlds?: Record<string, { value: number; provenance: string; contractPath: string }>;
        catalogCounts?: Record<string, { value: number; provenance: string; contractPath: string }>;
        palette?: Record<string, { value: string; provenance: string; contractPath: string }>;
        timeTrials?: Array<{
          id: string;
          index: number;
          bronze: number;
          silver: number;
          gold: number;
          platinum: number;
          provenance: string;
        }>;
      };

      const groups = [
        ['engineTiming', oracle.engineTiming],
        ['hitboxesAndTether', oracle.hitboxesAndTether],
        ['movementAndActions', oracle.movementAndActions],
        ['hazardsAndWorlds', oracle.hazardsAndWorlds],
        ['catalogCounts', oracle.catalogCounts],
      ] as const;

      for (const [groupName, group] of groups) {
        assert(Boolean(group && typeof group === 'object'), `[OracleFile] Missing group ${groupName}`);
        for (const [k, entry] of Object.entries(group ?? {})) {
          assert(
            entry.provenance === 'extracted' || entry.provenance === 'measured',
            `[OracleFile] ${groupName}.${k} missing valid provenance tag`,
          );
          const contractVal = resolveContractPath(entry.contractPath);
          assertApprox(
            contractVal as number,
            entry.value,
            `oracle.json:${groupName}.${k} <-> ${entry.contractPath}`,
          );
        }
      }

      for (const [k, entry] of Object.entries(oracle.palette ?? {})) {
        assert(
          entry.provenance === 'extracted' || entry.provenance === 'measured',
          `[OracleFile] palette.${k} missing valid provenance tag`,
        );
        const contractVal = resolveContractPath(entry.contractPath);
        assertEq(
          String(contractVal).toLowerCase(),
          entry.value.toLowerCase(),
          `[OracleFile] palette.${k} <-> ${entry.contractPath}`,
        );
      }

      assertEq(oracle.timeTrials?.length ?? 0, 10, '[OracleFile] timeTrials length');
      for (let i = 0; i < (oracle.timeTrials?.length ?? 0); i++) {
        const ot = oracle.timeTrials![i];
        const ct = TIME_TRIAL_MEDALS[i];
        assert(
          ot.provenance === 'extracted' || ot.provenance === 'measured',
          `[OracleFile] timeTrials[${i}] invalid provenance`,
        );
        if (ct) {
          assertEq(ct.id, ot.id, `[OracleFile] ${ot.id} id parity`);
          assertApprox(ct.bronze, ot.bronze, `oracle.json:${ot.id}.bronze`);
          assertApprox(ct.silver, ot.silver, `oracle.json:${ot.id}.silver`);
          assertApprox(ct.gold, ot.gold, `oracle.json:${ot.id}.gold`);
          assertApprox(ct.platinum, ot.platinum, `oracle.json:${ot.id}.platinum`);
        }
      }
    } catch (err) {
      errors.push(`[OracleFile] Failed to parse oracle.json: ${String(err)}`);
    }
  }

  const passed = errors.length === before;
  console.log(
    `[Gate A.3] Mechanic Oracle Parity: ${passed ? 'PASS' : 'FAIL'} (${oracleChecked ? 'contracts + oracle.json verified' : 'contracts verified'})`,
  );
}

// ============================================================================
// Check 4: TASTE_NOTES Enforcement
// ============================================================================
function checkTasteNotes(): void {
  const before = errors.length;

  // 4a. TouchOverlay.ts starts hidden & only appears on touch
  const touchPath = path.join(REPO_ROOT, 'src/input/TouchOverlay.ts');
  assert(fs.existsSync(touchPath), '[TASTE_NOTES] Missing src/input/TouchOverlay.ts');
  if (fs.existsSync(touchPath)) {
    const src = fs.readFileSync(touchPath, 'utf8');
    assert(
      /private\s+visible\s*=\s*false/.test(src) && /display\s*=\s*this\.visible\s*\?\s*['"]block['"]\s*:\s*['"]none['"]/.test(src),
      '[TASTE_NOTES] TouchOverlay.ts must start hidden (visible = false, display = none)',
    );
    assert(
      src.includes("pointerType === 'touch'") || src.includes('touchstart'),
      '[TASTE_NOTES] TouchOverlay.ts must activate only on real touch events',
    );
    assert(
      src.includes('notifyNonTouchInput'),
      '[TASTE_NOTES] TouchOverlay.ts must support auto-hiding on non-touch input',
    );
  }

  // 4b. GamepadDriver.ts implements 0.18 deadzone + rumble + menu navigation
  const gamepadPath = path.join(REPO_ROOT, 'src/input/GamepadDriver.ts');
  assert(fs.existsSync(gamepadPath), '[TASTE_NOTES] Missing src/input/GamepadDriver.ts');
  if (fs.existsSync(gamepadPath)) {
    const src = fs.readFileSync(gamepadPath, 'utf8');
    assert(
      /GAMEPAD_RADIAL_DEADZONE\s*=\s*0\.18\b/.test(src) || /deadzone\s*=\s*0\.18\b/.test(src),
      '[TASTE_NOTES] GamepadDriver.ts must implement 0.18 radial deadzone',
    );
    assert(
      src.includes('vibrationActuator') && /triggerRumble|rumble/i.test(src),
      '[TASTE_NOTES] GamepadDriver.ts must implement safe rumble',
    );
    assert(
      /drainMenuActions|onMenuNav|processMenuNav/.test(src),
      '[TASTE_NOTES] GamepadDriver.ts must implement menu navigation',
    );
  }

  // 4c. WebGL2PixelBlitter.ts uses NEAREST filtering on 480x270
  const blitterPath = path.join(REPO_ROOT, 'src/render/WebGL2PixelBlitter.ts');
  assert(fs.existsSync(blitterPath), '[TASTE_NOTES] Missing src/render/WebGL2PixelBlitter.ts');
  if (fs.existsSync(blitterPath)) {
    const src = fs.readFileSync(blitterPath, 'utf8');
    assert(
      src.includes('TEXTURE_MIN_FILTER') &&
        src.includes('TEXTURE_MAG_FILTER') &&
        src.includes('gl.NEAREST'),
      '[TASTE_NOTES] WebGL2PixelBlitter.ts must use gl.NEAREST min/mag texture filtering',
    );
    assert(
      (src.includes('LOGICAL_WIDTH') && src.includes('LOGICAL_HEIGHT')) ||
        (src.includes('480') && src.includes('270')),
      '[TASTE_NOTES] WebGL2PixelBlitter.ts must target 480x270 logical resolution',
    );
  }

  // 4d. Zero-Backend Online Co-Op modules (WebRtcCoop.ts & BroadcastCoop.ts)
  const webRtcPath = path.join(REPO_ROOT, 'src/net/WebRtcCoop.ts');
  const broadcastPath = path.join(REPO_ROOT, 'src/net/BroadcastCoop.ts');
  assert(fs.existsSync(webRtcPath), '[TASTE_NOTES] Missing src/net/WebRtcCoop.ts');
  if (fs.existsSync(webRtcPath)) {
    const src = fs.readFileSync(webRtcPath, 'utf8');
    assert(
      src.includes('RTCPeerConnection') && src.length > 100,
      '[TASTE_NOTES] src/net/WebRtcCoop.ts must implement RTCPeerConnection DataChannel co-op',
    );
  }
  assert(fs.existsSync(broadcastPath), '[TASTE_NOTES] Missing src/net/BroadcastCoop.ts');
  if (fs.existsSync(broadcastPath)) {
    const src = fs.readFileSync(broadcastPath, 'utf8');
    assert(
      src.includes('BroadcastChannel') && src.length > 100,
      '[TASTE_NOTES] src/net/BroadcastCoop.ts must implement BroadcastChannel dual-tab co-op',
    );
  }

  const passed = errors.length === before;
  console.log(`[Gate A.4] TASTE_NOTES Enforcement: ${passed ? 'PASS' : 'FAIL'}`);
}

// ============================================================================
// Check 5: Clean-Room IP & Binary Firewall
// ============================================================================
function checkIpAndBinaryFirewall(): void {
  const before = errors.length;

  // Dynamically construct banned third-party patterns (zero literal retail strings in this file)
  const BANNED_PATTERNS: ReadonlyArray<{ tag: string; regex: RegExp }> = [
    {
      tag: 'retail-title',
      regex: new RegExp(
        ['Bre', 'ad'].join('') + '\\s*(?:&amp;|&|and|n)\\s*' + ['Fr', 'ed'].join(''),
        'i',
      ),
    },
    {
      tag: 'retail-slug',
      regex: new RegExp(['bre', 'ad'].join('') + '[-_]' + ['fr', 'ed'].join(''), 'i'),
    },
    {
      tag: 'retail-studio',
      regex: new RegExp(
        ['Sand', 'Castles'].join('') + '(?:\\s*' + ['Stu', 'dio'].join('') + ')?',
        'i',
      ),
    },
    {
      tag: 'retail-publisher',
      regex: new RegExp('\\b' + ['Apo', 'gee'].join('') + '\\b', 'i'),
    },
  ];

  const FORBIDDEN_BINARY_EXTS = new Set([
    '.png',
    '.wav',
    '.ogg',
    '.mp3',
    '.assets',
    '.ress',
    '.resource',
    '.dll',
    '.exe',
    '.bundle',
  ]);

  const EXCLUDED_IP_SCAN_FILES = new Set([
    'tools/extract-assets.ts',
    'tools/oracle-dump.ts',
    'scripts/verify/verify-assets.ts',
  ]);

  const trackedOutput = execFileSync('git', ['ls-files'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const trackedFiles = trackedOutput
    .split(/\r?\n/)
    .map((s) => s.trim().replace(/\\/g, '/'))
    .filter((s) => s.length > 0);

  assert(trackedFiles.length > 0, '[Firewall] git ls-files returned empty file list');

  const isUserFacingFile = (rel: string): boolean => {
    if (EXCLUDED_IP_SCAN_FILES.has(rel)) return false;
    if (rel === 'index.html' || rel === 'README.md') return true;
    return (
      rel.startsWith('src/ui/') ||
      rel.startsWith('src/data/') ||
      rel.startsWith('src/render/') ||
      rel.startsWith('src/app/') ||
      rel.startsWith('src/assets/') ||
      rel.startsWith('src/audio/') ||
      rel.startsWith('src/input/') ||
      rel.startsWith('src/net/') ||
      rel.startsWith('src/sim/') ||
      rel.startsWith('src/contracts/') ||
      rel === 'src/main.ts'
    );
  };

  let scannedTextFiles = 0;
  for (const rel of trackedFiles) {
    const ext = path.extname(rel).toLowerCase();
    if (FORBIDDEN_BINARY_EXTS.has(ext)) {
      errors.push(`[Firewall] Forbidden retail/binary asset tracked in git: ${rel}`);
      continue;
    }

    if (isUserFacingFile(rel)) {
      const fullPath = path.join(REPO_ROOT, rel);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, 'utf8');
      scannedTextFiles++;
      for (const { tag, regex } of BANNED_PATTERNS) {
        if (regex.test(content)) {
          errors.push(`[Firewall] Banned branding (${tag}) detected in tracked file: ${rel}`);
        }
      }
    }
  }

  let distFilesCount = 0;
  if (fs.existsSync(DIST_DIR)) {
    const distFiles = walkFiles(DIST_DIR);
    distFilesCount = distFiles.length;
    for (const rel of distFiles) {
      const ext = path.extname(rel).toLowerCase();
      if (FORBIDDEN_BINARY_EXTS.has(ext)) {
        errors.push(`[Firewall] Forbidden binary asset present in dist/: ${rel}`);
        continue;
      }
      if (ext === '.html' || ext === '.js' || ext === '.css' || ext === '.json') {
        const content = fs.readFileSync(path.join(DIST_DIR, rel), 'utf8');
        for (const { tag, regex } of BANNED_PATTERNS) {
          if (regex.test(content)) {
            errors.push(`[Firewall] Banned branding (${tag}) detected in dist/${rel}`);
          }
        }
      }
    }
  }

  const passed = errors.length === before;
  console.log(
    `[Gate A.5] Clean-Room IP & Binary Firewall: ${passed ? 'PASS' : 'FAIL'} (${trackedFiles.length} tracked, ${scannedTextFiles} UI/code scanned, ${distFilesCount} dist files)`,
  );
}

function main(): void {
  console.log('=== Krunked & Fred — Gate A Verification (verify:assets) ===');
  checkCatalogAndBuiltinPack();
  checkCustomPackManifest();
  checkMechanicOracleParity();
  checkTasteNotes();
  checkIpAndBinaryFirewall();

  if (errors.length > 0) {
    console.error(`\n[Gate A] FAILED with ${errors.length} violation(s):`);
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log('\n[Gate A] ALL 5 CHECKS PASSED.');
}

main();
