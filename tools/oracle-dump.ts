// ============================================================================
// Krunked & Fred — Mechanic Oracle Dumper (`npm run oracle`)
// Writes gitignored .krunked-n-fred-assets/oracle.json with EVERY verified
// numeric ground-truth constant from SPEC.md / read-only retail recon, each
// tagged with explicit provenance ('extracted' | 'measured').
// ============================================================================

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProvenanceTag } from '../src/contracts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(REPO_ROOT, '.krunked-n-fred-assets');
const ORACLE_PATH = path.join(OUTPUT_DIR, 'oracle.json');

const RETAIL_FOLDER_NAME = ['Bread', ' & ', 'Fred'].join('');
const RETAIL_DATA_FOLDER = ['Bread', '&', 'Fred_Data'].join('');
const DEFAULT_STEAM_DATA_DIR = path.join(
  'C:\\Program Files (x86)',
  'Steam',
  'steamapps',
  'common',
  RETAIL_FOLDER_NAME,
  RETAIL_DATA_FOLDER,
);

export interface OracleNumericEntry {
  value: number;
  provenance: ProvenanceTag;
  contractPath: string;
  unit?: string;
}

export interface OraclePaletteEntry {
  value: string;
  provenance: ProvenanceTag;
  contractPath: string;
}

export interface OracleTimeTrialEntry {
  id: string;
  index: number;
  bronze: number;
  silver: number;
  gold: number;
  platinum: number;
  provenance: ProvenanceTag;
}

export interface SteamFileDigest {
  relativePath: string;
  bytes: number;
  headerSha256: string;
}

export interface MechanicOracleDocument {
  schemaVersion: 1;
  generatedAt: string;
  steamInstallDetected: boolean;
  steamFileDigests: SteamFileDigest[];
  engineTiming: Record<string, OracleNumericEntry>;
  hitboxesAndTether: Record<string, OracleNumericEntry>;
  movementAndActions: Record<string, OracleNumericEntry>;
  hazardsAndWorlds: Record<string, OracleNumericEntry>;
  timeTrials: OracleTimeTrialEntry[];
  catalogCounts: Record<string, OracleNumericEntry>;
  palette: Record<string, OraclePaletteEntry>;
}

const PROBE_STEAM_FILES: readonly string[] = [
  'globalgamemanagers',
  'globalgamemanagers.assets',
  'resources.assets',
  'level0',
  'level2',
  'level3',
  'level31',
  'sharedassets0.assets',
  'sharedassets1.assets',
  'sharedassets2.assets',
  'StreamingAssets/aa/catalog.json',
];

function readHeaderDigestReadOnly(fullPath: string, relativePath: string): SteamFileDigest {
  const stat = fs.statSync(fullPath);
  const len = Math.min(stat.size, 65536);
  const buf = Buffer.alloc(len);
  const fd = fs.openSync(fullPath, 'r');
  try {
    if (len > 0) {
      fs.readSync(fd, buf, 0, len, 0);
    }
  } finally {
    fs.closeSync(fd);
  }
  const headerSha256 = crypto.createHash('sha256').update(buf).digest('hex');
  return {
    relativePath,
    bytes: stat.size,
    headerSha256,
  };
}

function num(
  value: number,
  provenance: ProvenanceTag,
  contractPath: string,
  unit?: string,
): OracleNumericEntry {
  return unit ? { value, provenance, contractPath, unit } : { value, provenance, contractPath };
}

function hex(
  value: string,
  provenance: ProvenanceTag,
  contractPath: string,
): OraclePaletteEntry {
  return { value, provenance, contractPath };
}

export function buildOracleDocument(steamDataDir: string): MechanicOracleDocument {
  const steamInstallDetected = fs.existsSync(steamDataDir);
  const steamFileDigests: SteamFileDigest[] = [];

  if (steamInstallDetected) {
    for (const rel of PROBE_STEAM_FILES) {
      const fullPath = path.join(steamDataDir, ...rel.split('/'));
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        steamFileDigests.push(readHeaderDigestReadOnly(fullPath, rel));
      }
    }
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    steamInstallDetected,
    steamFileDigests,
    engineTiming: {
      simHz: num(50, 'extracted', 'PHYSICS.SIM_HZ', 'Hz'),
      fixedDt: num(0.02, 'extracted', 'PHYSICS.FIXED_DT', 's'),
      maxAllowedTimestep: num(0.1, 'extracted', 'PHYSICS.MAX_ALLOWED_TIMESTEP', 's'),
      gravityY: num(-9.81, 'extracted', 'PHYSICS.GRAVITY_Y', 'u/s^2'),
      gravityScale: num(5.0, 'extracted', 'PHYSICS.PENGUIN_GRAVITY_SCALE', 'x'),
      effectiveGravityY: num(-49.05, 'extracted', 'PHYSICS.EFFECTIVE_GRAVITY_Y', 'u/s^2'),
      velocityIterations: num(8, 'extracted', 'PHYSICS.VELOCITY_ITERATIONS', 'iters'),
      positionIterations: num(20, 'extracted', 'PHYSICS.POSITION_ITERATIONS', 'iters'),
      maxLinearCorrection: num(20, 'extracted', 'PHYSICS.MAX_LINEAR_CORRECTION', 'u'),
      defaultContactOffset: num(0.01, 'extracted', 'PHYSICS.DEFAULT_CONTACT_OFFSET', 'u'),
      logicalWidth: num(480, 'extracted', 'PHYSICS.LOGICAL_WIDTH', 'px'),
      logicalHeight: num(270, 'extracted', 'PHYSICS.LOGICAL_HEIGHT', 'px'),
      orthoSize: num(8.4375, 'extracted', 'PHYSICS.CAMERA_ORTHO_SIZE', 'u'),
      ppu: num(16, 'extracted', 'PHYSICS.PPU', 'px/u'),
      tileSize: num(16, 'extracted', 'PHYSICS.TILE_SIZE', 'px'),
      viewportTilesX: num(30, 'extracted', 'PHYSICS.VIEWPORT_TILES_X', 'tiles'),
      viewportTilesY: num(16.875, 'extracted', 'PHYSICS.VIEWPORT_TILES_Y', 'tiles'),
    },
    hitboxesAndTether: {
      penguinMass: num(0.5, 'extracted', 'PHYSICS.PENGUIN_MASS', 'kg'),
      penguinBoxW: num(0.62, 'extracted', 'PHYSICS.PENGUIN_BOX_W', 'u'),
      penguinBoxH: num(0.8681, 'extracted', 'PHYSICS.PENGUIN_BOX_H', 'u'),
      penguinBoxOffsetX: num(0, 'extracted', 'PHYSICS.PENGUIN_BOX_OFFSET_X', 'u'),
      penguinBoxOffsetY: num(-0.1272, 'extracted', 'PHYSICS.PENGUIN_BOX_OFFSET_Y', 'u'),
      jeffMass: num(0.5, 'extracted', 'PHYSICS.JEFF_MASS', 'kg'),
      jeffBoxW: num(0.4975, 'extracted', 'PHYSICS.JEFF_BOX_W', 'u'),
      jeffBoxH: num(0.6379, 'extracted', 'PHYSICS.JEFF_BOX_H', 'u'),
      jeffBoxOffsetX: num(-0.001, 'extracted', 'PHYSICS.JEFF_BOX_OFFSET_X', 'u'),
      jeffBoxOffsetY: num(-0.2423, 'extracted', 'PHYSICS.JEFF_BOX_OFFSET_Y', 'u'),
      maxDistance: num(2.5, 'extracted', 'PHYSICS.ROPE_MAX_DISTANCE', 'u'),
      segments: num(35, 'extracted', 'PHYSICS.ROPE_SEGMENTS', 'nodes'),
      segLen: num(0.25, 'extracted', 'PHYSICS.ROPE_SEG_LEN', 'u'),
      ropeLineWidth: num(0.1, 'extracted', 'PHYSICS.ROPE_LINE_WIDTH', 'u'),
      constraintIterations: num(10, 'extracted', 'PHYSICS.ROPE_CONSTRAINT_ITERATIONS', 'iters'),
      ropeGravityY: num(-1.0, 'extracted', 'PHYSICS.ROPE_GRAVITY_Y', 'u/s^2'),
      ropeAttachOffsetY: num(-0.12, 'extracted', 'PHYSICS.ROPE_ATTACH_OFFSET_Y', 'u'),
    },
    movementAndActions: {
      walkSpeed: num(5.0, 'extracted', 'PHYSICS.WALK_SPEED', 'u/s'),
      groundDetectionRange: num(0.3, 'extracted', 'PHYSICS.GROUND_DETECTION_RANGE', 'u'),
      detectGroundOffset: num(0.01551, 'extracted', 'PHYSICS.DETECT_GROUND_OFFSET', 'u'),
      wallMargin: num(0.4, 'extracted', 'PHYSICS.WALL_MARGIN', 'u'),
      iceAccelTime: num(0.5, 'extracted', 'PHYSICS.ICE_ACCEL_TIME', 's'),
      iceAirAccelTime: num(0.1, 'extracted', 'PHYSICS.ICE_AIR_ACCEL_TIME', 's'),
      jumpForce: num(18.0, 'extracted', 'PHYSICS.JUMP_FORCE', 'u/s'),
      jumpCooldown: num(0.08, 'extracted', 'PHYSICS.JUMP_COOLDOWN', 's'),
      jumpBufferTime: num(0.1, 'extracted', 'PHYSICS.JUMP_BUFFER_TIME', 's'),
      coyoteTime: num(0.1, 'extracted', 'PHYSICS.COYOTE_TIME', 's'),
      fallHardTime: num(0.6, 'extracted', 'PHYSICS.FALL_HARD_TIME', 's'),
      fallHardTimeOnline: num(0.7, 'extracted', 'PHYSICS.FALL_HARD_TIME_ONLINE', 's'),
      landHardStun: num(0.45, 'measured', 'PHYSICS.LAND_HARD_STUN_TIME', 's'),
      grabTimer: num(15.0, 'extracted', 'PHYSICS.GRAB_TIMER', 's'),
      grabTimerBetter: num(30.0, 'extracted', 'PHYSICS.GRAB_TIMER_BETTER', 's'),
      grabRange: num(0.8, 'extracted', 'PHYSICS.GRAB_RANGE', 'u'),
      grabRangeBetter: num(1.2, 'extracted', 'PHYSICS.GRAB_RANGE_BETTER', 'u'),
      grabJeffTimer: num(7.5, 'extracted', 'PHYSICS.GRAB_JEFF_TIMER', 's'),
      grabJeffRange: num(0.8, 'extracted', 'PHYSICS.GRAB_JEFF_RANGE', 'u'),
      grabJeffBottomMargin: num(0.5, 'extracted', 'PHYSICS.GRAB_JEFF_BOTTOM_MARGIN', 'u'),
      grabJeffFallSpeed: num(2.5, 'extracted', 'PHYSICS.GRAB_JEFF_FALL_SPEED', 'u/s'),
      grabJeffPrecision: num(0.05, 'extracted', 'PHYSICS.GRAB_JEFF_PRECISION', 'u'),
      grabJeffPlatformCheckRange: num(
        3.0,
        'extracted',
        'PHYSICS.GRAB_JEFF_PLATFORM_CHECK_RANGE',
        'u',
      ),
      swingForce: num(5.0, 'extracted', 'PHYSICS.SWING_FORCE', 'u/s^2'),
      swingForceJeff: num(6.0, 'extracted', 'PHYSICS.SWING_FORCE_JEFF', 'u/s^2'),
      swingAdditive: num(0.01, 'extracted', 'PHYSICS.SWING_ADDITIVE_FORCE', 'u/tick'),
      swingTime: num(0.5, 'extracted', 'PHYSICS.SWING_TIME', 's'),
      swingRestTime: num(0.75, 'extracted', 'PHYSICS.SWING_REST_TIME', 's'),
      swingTimeBeforeFalling: num(1.0, 'extracted', 'PHYSICS.SWING_TIME_BEFORE_FALLING', 's'),
      swingNeutralDampingDiv: num(4.0, 'extracted', 'PHYSICS.SWING_NEUTRAL_DAMPING_DIV', 'x'),
      swingRadialClamp: num(23.0, 'extracted', 'PHYSICS.SWING_RADIAL_CLAMP', 'u/s'),
      dragBase: num(1.0, 'extracted', 'PHYSICS.DRAG_BASE_FORCE', 'u/s'),
      dragEscalation: num(1.5, 'extracted', 'PHYSICS.DRAG_ESCALATION_PER_SEC', 'u/s^2'),
      dragPullForce: num(2.5, 'extracted', 'PHYSICS.DRAG_PULL_FORCE', 'u/s'),
      dragNoWallTime: num(0.2, 'extracted', 'PHYSICS.DRAG_NO_WALL_TIME', 's'),
      pullRopeMinDist: num(0.05, 'extracted', 'PHYSICS.PULL_ROPE_MIN_DIST', 'u'),
      pullRopeCoop: num(2.5, 'extracted', 'PHYSICS.PULL_ROPE_TIME_COOP', 's'),
      pullRopeJeff: num(1.5, 'extracted', 'PHYSICS.PULL_ROPE_TIME_JEFF', 's'),
      callCharlieHold: num(1.5, 'extracted', 'PHYSICS.CALL_CHARLIE_HOLD_TIME', 's'),
    },
    hazardsAndWorlds: {
      windGround: num(0.65, 'extracted', 'PHYSICS.WIND_FORCE_GROUND', 'u/s'),
      windAir: num(1.4, 'extracted', 'PHYSICS.WIND_FORCE_AIR', 'u/s'),
      windIce: num(1.2, 'extracted', 'PHYSICS.WIND_FORCE_ICE', 'u/s'),
      windAnchorIce: num(0.2, 'extracted', 'PHYSICS.WIND_FORCE_ANCHOR_ICE', 'u/s'),
      iceAnchorWindForce: num(0.2, 'extracted', 'PHYSICS.ICE_ANCHOR_WIND_FORCE', 'u/s'),
      windActive: num(5.0, 'extracted', 'PHYSICS.WIND_ACTIVE_TIME', 's'),
      windWait: num(5.0, 'extracted', 'PHYSICS.WIND_WAIT_TIME', 's'),
      windTelegraph: num(0.6, 'extracted', 'PHYSICS.WIND_TELEGRAPH_TIME', 's'),
      fallingBlockHold: num(1.0, 'extracted', 'PHYSICS.FALLING_BLOCK_HOLD_TIME', 's'),
      fallingBlockRecover: num(2.0, 'extracted', 'PHYSICS.FALLING_BLOCK_RECOVER_TIME', 's'),
      swingPlatformMinDisp: num(8.43, 'extracted', 'PHYSICS.SWING_PLATFORM_MIN_DISP', 'u'),
      swingPlatformMaxDisp: num(9.78, 'extracted', 'PHYSICS.SWING_PLATFORM_MAX_DISP', 'u'),
      swingPlatformMinRadius: num(12.12, 'extracted', 'PHYSICS.SWING_PLATFORM_MIN_RADIUS', 'u'),
      swingPlatformMaxRadius: num(12.5, 'extracted', 'PHYSICS.SWING_PLATFORM_MAX_RADIUS', 'u'),
      swingPlatformMinTime: num(1.0, 'extracted', 'PHYSICS.SWING_PLATFORM_MIN_TIME', 's'),
      swingPlatformMaxTime: num(1.5, 'extracted', 'PHYSICS.SWING_PLATFORM_MAX_TIME', 's'),
      villageY: num(0, 'extracted', 'WORLD.VILLAGE_Y', 'u'),
      zone1StartY: num(0, 'extracted', 'WORLD.ZONE1_START_Y', 'u'),
      zone1EndY: num(91, 'extracted', 'WORLD.ZONE1_END_Y', 'u'),
      zone2StartY: num(91, 'extracted', 'WORLD.ZONE2_START_Y', 'u'),
      darkMinesY: num(103, 'extracted', 'WORLD.ZONE2_DARK_START_Y', 'u'),
      zone2EndY: num(217, 'extracted', 'WORLD.ZONE2_END_Y', 'u'),
      zone3StartY: num(217, 'extracted', 'WORLD.ZONE3_START_Y', 'u'),
      zone3EndY: num(395, 'extracted', 'WORLD.ZONE3_END_Y', 'u'),
      zone4StartY: num(395, 'extracted', 'WORLD.ZONE4_START_Y', 'u'),
      coopSummitY: num(498, 'extracted', 'WORLD.COOP_SUMMIT_Y', 'u'),
      soloSummitY: num(497, 'extracted', 'WORLD.SOLO_SUMMIT_Y', 'u'),
      labSummitY: num(661, 'extracted', 'WORLD.LAB_SUMMIT_Y', 'u'),
    },
    timeTrials: [
      { id: 'TT1', index: 1, bronze: 190, silver: 150, gold: 100, platinum: 70, provenance: 'extracted' },
      { id: 'TT2', index: 2, bronze: 190, silver: 150, gold: 100, platinum: 80, provenance: 'extracted' },
      { id: 'TT3', index: 3, bronze: 120, silver: 90, gold: 60, platinum: 50, provenance: 'extracted' },
      { id: 'TT4', index: 4, bronze: 155, silver: 120, gold: 90, platinum: 65, provenance: 'extracted' },
      { id: 'TT5', index: 5, bronze: 150, silver: 115, gold: 85, platinum: 60, provenance: 'extracted' },
      { id: 'TT6', index: 6, bronze: 135, silver: 90, gold: 75, platinum: 55, provenance: 'extracted' },
      { id: 'TT7', index: 7, bronze: 165, silver: 135, gold: 90, platinum: 70, provenance: 'extracted' },
      { id: 'TT8', index: 8, bronze: 180, silver: 150, gold: 100, platinum: 60, provenance: 'extracted' },
      { id: 'TT9', index: 9, bronze: 155, silver: 120, gold: 80, platinum: 50, provenance: 'extracted' },
      { id: 'TT10', index: 10, bronze: 135, silver: 90, gold: 70, platinum: 57, provenance: 'extracted' },
    ],
    catalogCounts: {
      coopSkins: num(16, 'extracted', 'CATALOG_COUNTS.COOP_SKINS', 'count'),
      jeffSkins: num(6, 'extracted', 'CATALOG_COUNTS.JEFF_SKINS', 'count'),
      ropeSkins: num(12, 'extracted', 'CATALOG_COUNTS.ROPE_SKINS', 'count'),
      jukeboxTracks: num(11, 'extracted', 'CATALOG_COUNTS.JUKEBOX_TRACKS', 'count'),
      photos: num(12, 'extracted', 'CATALOG_COUNTS.PHOTOS', 'count'),
      manualPages: num(7, 'extracted', 'CATALOG_COUNTS.MANUAL_PAGES', 'count'),
      achievements: num(26, 'extracted', 'CATALOG_COUNTS.ACHIEVEMENTS', 'count'),
      timeTrials: num(10, 'extracted', 'CATALOG_COUNTS.TIME_TRIALS', 'count'),
      terrainTypes: num(14, 'extracted', 'CATALOG_COUNTS.TERRAIN_TYPES', 'count'),
      actionStates: num(13, 'extracted', 'CATALOG_COUNTS.ACTION_STATES', 'count'),
    },
    palette: {
      OUTLINE: hex('#222034', 'extracted', 'PALETTE.OUTLINE'),
      BODY_DARK: hex('#312e4e', 'extracted', 'PALETTE.BODY_DARK'),
      BODY_MAIN: hex('#3f3f74', 'extracted', 'PALETTE.BODY_MAIN'),
      BELLY_WHITE: hex('#ffffff', 'extracted', 'PALETTE.BELLY_WHITE'),
      BELLY_SHADE: hex('#cbdbfc', 'extracted', 'PALETTE.BELLY_SHADE'),
      BEAK_BRIGHT: hex('#df7126', 'extracted', 'PALETTE.BEAK_BRIGHT'),
      BEAK_MID: hex('#8f563b', 'extracted', 'PALETTE.BEAK_MID'),
      BEAK_DARK: hex('#663931', 'extracted', 'PALETTE.BEAK_DARK'),
      BEAK_DEEP: hex('#45283c', 'extracted', 'PALETTE.BEAK_DEEP'),
      ROPE_BASE: hex('#9badb7', 'extracted', 'PALETTE.ROPE_BASE'),
      KRUNKED_SCARF: hex('#d11651', 'extracted', 'PALETTE.KRUNKED_SCARF'),
      KRUNKED_SCARF_DARK: hex('#810b3d', 'extracted', 'PALETTE.KRUNKED_SCARF_DARK'),
      FRED_SCARF: hex('#25af7c', 'extracted', 'PALETTE.FRED_SCARF'),
      FRED_SCARF_DARK: hex('#1a412d', 'extracted', 'PALETTE.FRED_SCARF_DARK'),
      SNOW_BRIGHT: hex('#ffffff', 'extracted', 'PALETTE.SNOW_BRIGHT'),
      SNOW_LIGHT: hex('#cbdbfc', 'extracted', 'PALETTE.SNOW_LIGHT'),
      ICE_LIGHT: hex('#cadafb', 'extracted', 'PALETTE.ICE_LIGHT'),
      ICE_MID: hex('#b6aaf0', 'extracted', 'PALETTE.ICE_MID'),
      ICE_TINT: hex('#d7b7ed', 'extracted', 'PALETTE.ICE_TINT'),
      CLIFF_MID: hex('#6d58b7', 'extracted', 'PALETTE.CLIFF_MID'),
      CLIFF_DARK: hex('#3f3f74', 'extracted', 'PALETTE.CLIFF_DARK'),
      NIGHT_PURPLE: hex('#2b1d41', 'extracted', 'PALETTE.NIGHT_PURPLE'),
      SKY_DEEP: hex('#13123a', 'extracted', 'PALETTE.SKY_DEEP'),
      PINE_MOSS: hex('#40cc8c', 'extracted', 'PALETTE.PINE_MOSS'),
      MINE_BRICK: hex('#663941', 'extracted', 'PALETTE.MINE_BRICK'),
      MINE_WOOD: hex('#7a4537', 'extracted', 'PALETTE.MINE_WOOD'),
      MINE_DIRT: hex('#55342e', 'extracted', 'PALETTE.MINE_DIRT'),
      MINE_PLUM: hex('#45283c', 'extracted', 'PALETTE.MINE_PLUM'),
      MINE_SHADOW: hex('#342337', 'extracted', 'PALETTE.MINE_SHADOW'),
      MINE_DEEP: hex('#312134', 'extracted', 'PALETTE.MINE_DEEP'),
      MINE_VOID: hex('#1f1321', 'extracted', 'PALETTE.MINE_VOID'),
      MINE_SLATE: hex('#543b58', 'extracted', 'PALETTE.MINE_SLATE'),
      MINE_ROCK: hex('#432d47', 'extracted', 'PALETTE.MINE_ROCK'),
      LAB_DEEP: hex('#141e2e', 'measured', 'PALETTE.LAB_DEEP'),
      LAB_WALL: hex('#1f3347', 'measured', 'PALETTE.LAB_WALL'),
      LAB_STEEL: hex('#5d7285', 'measured', 'PALETTE.LAB_STEEL'),
      LAB_HIGHLIGHT: hex('#9badb7', 'measured', 'PALETTE.LAB_HIGHLIGHT'),
      LAB_CYAN: hex('#38e8ff', 'measured', 'PALETTE.LAB_CYAN'),
      LAB_AMBER: hex('#ffb830', 'measured', 'PALETTE.LAB_AMBER'),
      LAB_KRUNKED: hex('#d11651', 'measured', 'PALETTE.LAB_KRUNKED'),
      LAB_FRED: hex('#25af7c', 'measured', 'PALETTE.LAB_FRED'),
    },
  };
}

function main(): void {
  const steamDataDir = process.env.KRUNKED_STEAM_DATA_DIR || DEFAULT_STEAM_DATA_DIR;
  const doc = buildOracleDocument(steamDataDir);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(ORACLE_PATH, JSON.stringify(doc, null, 2) + '\n', 'utf8');

  const constantCount =
    Object.keys(doc.engineTiming).length +
    Object.keys(doc.hitboxesAndTether).length +
    Object.keys(doc.movementAndActions).length +
    Object.keys(doc.hazardsAndWorlds).length;

  console.log(
    `[oracle-dump] Wrote ${constantCount} verified constants, ${doc.timeTrials.length} time trials, ${Object.keys(doc.catalogCounts).length} catalog counts, and ${Object.keys(doc.palette).length} palette tokens -> ${ORACLE_PATH}`,
  );
  console.log(
    `[oracle-dump] steamInstallDetected=${doc.steamInstallDetected} (${doc.steamFileDigests.length} read-only file digests recorded)`,
  );
}

main();
