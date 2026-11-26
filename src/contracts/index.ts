// ============================================================================
// Krunked & Fred — Canonical Contracts & Ground-Truth Constants
// Single Source of Truth shared by sim, data, render, assets, audio, input, net, ui, app, and verifiers.
// ============================================================================

export type ProvenanceTag = 'extracted' | 'measured';

export const PHYSICS = {
  // Engine & Timing (extracted)
  SIM_HZ: 50,
  FIXED_DT: 0.02,
  MAX_ALLOWED_TIMESTEP: 0.1,
  GRAVITY_Y: -9.81,
  PENGUIN_GRAVITY_SCALE: 5.0,
  EFFECTIVE_GRAVITY_Y: -49.05, // -9.81 * 5.0 u/s^2 (-784.8 px/s^2)
  VELOCITY_ITERATIONS: 8,
  POSITION_ITERATIONS: 20,
  MAX_LINEAR_CORRECTION: 20,
  DEFAULT_CONTACT_OFFSET: 0.01,

  // Logical Resolution & Units (extracted)
  LOGICAL_WIDTH: 480,
  LOGICAL_HEIGHT: 270,
  CAMERA_ORTHO_SIZE: 8.4375,
  PPU: 16,
  TILE_SIZE: 16,
  VIEWPORT_TILES_X: 30,
  VIEWPORT_TILES_Y: 16.875,

  // Rigidbodies & Colliders (extracted)
  PENGUIN_MASS: 0.5,
  PENGUIN_BOX_W: 0.62,
  PENGUIN_BOX_H: 0.8681,
  PENGUIN_BOX_OFFSET_X: 0,
  PENGUIN_BOX_OFFSET_Y: -0.1272,

  JEFF_MASS: 0.5,
  JEFF_BOX_W: 0.4975,
  JEFF_BOX_H: 0.6379,
  JEFF_BOX_OFFSET_X: -0.001,
  JEFF_BOX_OFFSET_Y: -0.2423,

  // Rope DistanceJoint2D & Visual Verlet (extracted)
  ROPE_MAX_DISTANCE: 2.5, // 40 px
  ROPE_SEGMENTS: 35,
  ROPE_SEG_LEN: 0.25,
  ROPE_LINE_WIDTH: 0.1,
  ROPE_CONSTRAINT_ITERATIONS: 10,
  ROPE_GRAVITY_Y: -1.0,
  ROPE_ATTACH_OFFSET_Y: -0.12,

  // Movement & Ground Detection (extracted)
  WALK_SPEED: 5.0,
  GROUND_DETECTION_RANGE: 0.3,
  DETECT_GROUND_OFFSET: 0.01551,
  WALL_MARGIN: 0.4,
  ICE_ACCEL_TIME: 0.5,
  ICE_AIR_ACCEL_TIME: 0.1,

  // Jump & Fall (extracted; LAND_HARD_STUN_TIME measured)
  JUMP_FORCE: 18.0,
  JUMP_COOLDOWN: 0.08,
  JUMP_BUFFER_TIME: 0.1,
  PEAK_JUMP_HEIGHT: (18.0 * 18.0) / (2 * 49.05), // 3.30275 u
  COYOTE_TIME: 0.1, // 5 ticks
  FALL_HARD_TIME: 0.6, // 30 ticks
  FALL_HARD_TIME_ONLINE: 0.7, // 35 ticks
  LAND_HARD_STUN_TIME: 0.45, // measured

  // Wall Grab / Cling (extracted)
  GRAB_TIMER: 15.0,
  GRAB_TIMER_BETTER: 30.0,
  GRAB_RANGE: 0.8,
  GRAB_RANGE_BETTER: 1.2,

  // Jeff Grab / Fall (extracted)
  GRAB_JEFF_TIMER: 7.5,
  GRAB_JEFF_RANGE: 0.8,
  GRAB_JEFF_BOTTOM_MARGIN: 0.5,
  GRAB_JEFF_FALL_SPEED: 2.5,
  GRAB_JEFF_PRECISION: 0.05,
  GRAB_JEFF_PLATFORM_CHECK_RANGE: 3.0,

  // Anchor & Ice Wind (extracted)
  ICE_ANCHOR_WIND_FORCE: 0.2,

  // Pendulum Swing (extracted)
  SWING_FORCE: 5.0,
  SWING_FORCE_JEFF: 6.0,
  SWING_ADDITIVE_FORCE: 0.01,
  SWING_TIME: 0.5,
  SWING_REST_TIME: 0.75,
  SWING_TIME_BEFORE_FALLING: 1.0,
  SWING_NEUTRAL_DAMPING_DIV: 4.0,
  SWING_RADIAL_CLAMP: 23.0,

  // Drag Escalation (extracted)
  DRAG_BASE_FORCE: 1.0,
  DRAG_ESCALATION_PER_SEC: 1.5,
  DRAG_PULL_FORCE: 2.5,
  DRAG_NO_WALL_TIME: 0.2,

  // Assist Rope Pull & Charlie Checkpoint (extracted)
  PULL_ROPE_MIN_DIST: 0.05,
  PULL_ROPE_TIME_COOP: 2.5,
  PULL_ROPE_TIME_JEFF: 1.5,
  CALL_CHARLIE_HOLD_TIME: 1.5,

  // Hazards: Wind, FallingBlocks, SwingPlatforms (extracted)
  WIND_FORCE_GROUND: 0.65,
  WIND_FORCE_AIR: 1.4,
  WIND_FORCE_ICE: 1.2,
  WIND_FORCE_ANCHOR_ICE: 0.2,
  WIND_ACTIVE_TIME: 5.0,
  WIND_WAIT_TIME: 5.0,
  WIND_TELEGRAPH_TIME: 0.6,

  FALLING_BLOCK_HOLD_TIME: 1.0,
  FALLING_BLOCK_RECOVER_TIME: 2.0,

  SWING_PLATFORM_MIN_DISP: 8.43,
  SWING_PLATFORM_MAX_DISP: 9.78,
  SWING_PLATFORM_MIN_RADIUS: 12.12,
  SWING_PLATFORM_MAX_RADIUS: 12.5,
  SWING_PLATFORM_MIN_TIME: 1.0,
  SWING_PLATFORM_MAX_TIME: 1.5,
} as const;

export const WORLD = {
  VILLAGE_Y: 0,
  ZONE1_START_Y: 0,
  ZONE1_END_Y: 91,
  ZONE2_START_Y: 91,
  ZONE2_DARK_START_Y: 103,
  ZONE2_END_Y: 217,
  ZONE3_START_Y: 217,
  ZONE3_END_Y: 395,
  ZONE4_START_Y: 395,
  COOP_SUMMIT_Y: 498,
  SOLO_SUMMIT_Y: 497,
  LAB_SUMMIT_Y: 661,
} as const;

export const PALETTE = {
  // Character & Outline (extracted)
  OUTLINE: '#222034',
  BODY_DARK: '#312e4e',
  BODY_MAIN: '#3f3f74',
  BELLY_WHITE: '#ffffff',
  BELLY_SHADE: '#cbdbfc',
  BEAK_BRIGHT: '#df7126',
  BEAK_MID: '#8f563b',
  BEAK_DARK: '#663931',
  BEAK_DEEP: '#45283c',
  ROPE_BASE: '#9badb7',
  KRUNKED_SCARF: '#d11651',
  KRUNKED_SCARF_DARK: '#810b3d',
  FRED_SCARF: '#25af7c',
  FRED_SCARF_DARK: '#1a412d',

  // Snow / Cliff / Ice (extracted)
  SNOW_BRIGHT: '#ffffff',
  SNOW_LIGHT: '#cbdbfc',
  ICE_LIGHT: '#cadafb',
  ICE_MID: '#b6aaf0',
  ICE_TINT: '#d7b7ed',
  CLIFF_MID: '#6d58b7',
  CLIFF_DARK: '#3f3f74',
  NIGHT_PURPLE: '#2b1d41',
  SKY_DEEP: '#13123a',
  PINE_MOSS: '#40cc8c',

  // Dark Mines (extracted)
  MINE_BRICK: '#663941',
  MINE_WOOD: '#7a4537',
  MINE_DIRT: '#55342e',
  MINE_PLUM: '#45283c',
  MINE_SHADOW: '#342337',
  MINE_DEEP: '#312134',
  MINE_VOID: '#1f1321',
  MINE_SLATE: '#543b58',
  MINE_ROCK: '#432d47',

  // Laboratory (measured harmonized)
  LAB_DEEP: '#141e2e',
  LAB_WALL: '#1f3347',
  LAB_STEEL: '#5d7285',
  LAB_HIGHLIGHT: '#9badb7',
  LAB_CYAN: '#38e8ff',
  LAB_AMBER: '#ffb830',
  LAB_KRUNKED: '#d11651',
  LAB_FRED: '#25af7c',
} as const;

export const ANIM_FRAMES = {
  Idle: 2,
  Walk: 8,
  WalkWind: 8,
  Jump: 1,
  Fall: 2,
  Grab: 6,
  Swing: 2,
  Anchor: 3,
  Drag: 6,
  PullRope: 5,
  PlaceFlag: 6,
  CallCharlie: 5,
  Clap: 12,
  RPS: 5,
} as const;

export type ActionState =
  | 'None'
  | 'Idle'
  | 'Walk'
  | 'Anchor'
  | 'Drag'
  | 'Fall'
  | 'FallHard'
  | 'Grab'
  | 'Jump'
  | 'LandHard'
  | 'PullRope'
  | 'Swing'
  | 'Grabbed';

export const ACTION_STATES: readonly ActionState[] = [
  'None',
  'Idle',
  'Walk',
  'Anchor',
  'Drag',
  'Fall',
  'FallHard',
  'Grab',
  'Jump',
  'LandHard',
  'PullRope',
  'Swing',
  'Grabbed',
] as const;

export const PenguinFlag = {
  None: 0,
  Immobile: 1,
  OnMovablePlatform: 2,
  OnWind: 4,
  OnIce: 8,
  OnDestructableBlock: 16,
  OnSlope: 32,
} as const;

export const TERRAIN_TYPES = [
  'SNOW',
  'PLATFORM',
  'DIRT',
  'MOVABLE',
  'ICE',
  'BELL_HOUSE',
  'WORKSHOP',
  'LAB',
  'LAB_PLATFORM',
  'LAB_PLATFORM2',
  'TRONCHO',
  'LAB2',
  'MUD',
  'DEFAULT',
] as const;

export type TerrainType = (typeof TERRAIN_TYPES)[number];

export const NON_GRABBABLE_TERRAINS: ReadonlySet<TerrainType> = new Set<TerrainType>([
  'ICE',
  'PLATFORM',
  'MOVABLE',
  'LAB_PLATFORM',
  'LAB_PLATFORM2',
]);

export type TileKind =
  | 'SOLID'
  | 'ICE'
  | 'ONE_WAY'
  | 'SLOPE_LEFT'
  | 'SLOPE_RIGHT'
  | 'KRUNKED_ONLY'
  | 'FRED_ONLY';

export type MovablePlatformType =
  | 'CONTINUE'
  | 'ENDS_STOP'
  | 'START_STOP'
  | 'FINISH_STOP'
  | 'STEP_STOP';

export type BiomeId =
  | 'village'
  | 'foothills'
  | 'mines'
  | 'crags'
  | 'summit'
  | 'lab'
  | 'boss';

export type GameMode =
  | 'coop_mountain'
  | 'solo_jeff'
  | 'solo_ai'
  | 'lab_dlc'
  | 'time_trial'
  | 'online_coop';

export type MenuScreen =
  | 'title'
  | 'play_menu'
  | 'playing'
  | 'paused'
  | 'options'
  | 'skin_closet'
  | 'assist_menu'
  | 'album'
  | 'manual'
  | 'jukebox'
  | 'achievements'
  | 'time_trials'
  | 'online_lobby'
  | 'controls_remap'
  | 'victory';

export type EmoteType = 'none' | 'clap' | 'rps_rock' | 'rps_paper' | 'rps_scissors';
export type MedalTier = 'none' | 'bronze' | 'silver' | 'gold' | 'platinum';
export type TouchMode = 'auto' | 'off' | 'on';
export type PackSource = 'builtin' | 'custom';
export type InputGlyphStyle = 'keyboard' | 'xbox' | 'playstation' | 'switch' | 'touch';
export type TargetFps = 30 | 60 | 120;

export interface TimeTrialMedalDef {
  id: string;
  index: number;
  name: string;
  biome: BiomeId;
  bronze: number;
  silver: number;
  gold: number;
  platinum: number;
}

export const TIME_TRIAL_MEDALS: readonly TimeTrialMedalDef[] = [
  { id: 'TT1', index: 1, name: 'Foothills Sprint', biome: 'foothills', bronze: 190, silver: 150, gold: 100, platinum: 70 },
  { id: 'TT2', index: 2, name: 'Pine Ledge Dash', biome: 'foothills', bronze: 190, silver: 150, gold: 100, platinum: 80 },
  { id: 'TT3', index: 3, name: 'Minecart Shaft', biome: 'mines', bronze: 120, silver: 90, gold: 60, platinum: 50 },
  { id: 'TT4', index: 4, name: 'Headlamp Chasm', biome: 'mines', bronze: 155, silver: 120, gold: 90, platinum: 65 },
  { id: 'TT5', index: 5, name: 'Gale Pendulum', biome: 'crags', bronze: 150, silver: 115, gold: 85, platinum: 60 },
  { id: 'TT6', index: 6, name: 'Crumble Spire', biome: 'crags', bronze: 135, silver: 90, gold: 75, platinum: 55 },
  { id: 'TT7', index: 7, name: 'Glacier Slip', biome: 'summit', bronze: 165, silver: 135, gold: 90, platinum: 70 },
  { id: 'TT8', index: 8, name: 'Summit Tempest', biome: 'summit', bronze: 180, silver: 150, gold: 100, platinum: 60 },
  { id: 'TT9', index: 9, name: 'Circuit Piston Run', biome: 'lab', bronze: 155, silver: 120, gold: 80, platinum: 50 },
  { id: 'TT10', index: 10, name: 'Laser Gauntlet', biome: 'lab', bronze: 135, silver: 90, gold: 70, platinum: 57 },
] as const;

export const COOP_SKINS = [
  'Default',
  'Knight',
  'Robot',
  'Pot',
  'Skeleton',
  'Bread',
  'Inverted',
  'Fish',
  'Box',
  'Fruit',
  'Animals',
  'SuperHero',
  'Christmas',
  'Detective',
  'Halloween',
  'Nuclear',
] as const;
export type CoopSkinId = (typeof COOP_SKINS)[number];

export const JEFF_SKINS = [
  'Default',
  'Bowling',
  'Headless',
  'Prisoner',
  'Dwarf',
  'Scuba',
] as const;
export type JeffSkinId = (typeof JEFF_SKINS)[number];

export const ROPE_SKINS = [
  'Default',
  'Animals',
  'Box',
  'Bread',
  'Fish',
  'Fruit',
  'Inverted',
  'Knight',
  'Pot',
  'Robot',
  'Skeleton',
  'Super',
] as const;
export type RopeSkinId = (typeof ROPE_SKINS)[number];

export const JUKEBOX_TRACKS = [
  'Base',
  'Bits',
  'Track1',
  'Track2',
  'Track3',
  'Track4',
  'Track5',
  'Track6',
  'Remix1',
  'Remix2',
  'Random',
] as const;
export type JukeboxTrackId = (typeof JUKEBOX_TRACKS)[number];

export const PHOTO_IDS = [
  'Photo1',
  'Photo2',
  'Photo3',
  'Photo4',
  'Photo5',
  'Photo6',
  'Photo7',
  'Photo8',
  'Photo9',
  'Photo10',
  'Photo11',
  'Photo12',
] as const;
export type PhotoId = (typeof PHOTO_IDS)[number];

export const MANUAL_PAGE_IDS = [
  'Swing',
  'Grab',
  'Mines',
  'Ice',
  'Wind',
  'Assist',
  'Emotes',
] as const;
export type ManualPageId = (typeof MANUAL_PAGE_IDS)[number];

export const ACHIEVEMENT_IDS = [
  'FirstSteps',
  'FirstSwing',
  'WallClimber',
  'RunOutStamina',
  'HardLanding',
  'DraggedDown',
  'EnterMines',
  'RescueSeal',
  'WindRider',
  'FrozenSummit',
  'ReachPeakCoop',
  'ReachPeakSolo',
  'GameCompletedNoAssist',
  'CallCharlie',
  'RopePullRescue',
  'PhotoCollectorHalf',
  'PhotoCollectorAll',
  'ManualScholar',
  'FashionPenguin',
  'ClapTogether',
  'RpsChampion',
  'EnterLab',
  'TronchoFlyer',
  'DefeatBachicha',
  'TimeTrialBronze',
  'TimeTrialPlatinum',
] as const;
export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

export const CATALOG_COUNTS = {
  COOP_SKINS: 16,
  JEFF_SKINS: 6,
  ROPE_SKINS: 12,
  JUKEBOX_TRACKS: 11,
  PHOTOS: 12,
  MANUAL_PAGES: 7,
  ACHIEVEMENTS: 26,
  TIME_TRIALS: 10,
  TERRAIN_TYPES: 14,
  ACTION_STATES: 13,
} as const;

// ============================================================================
// Core Geometry & Input Contracts
// ============================================================================

export interface Vec2 {
  x: number;
  y: number;
}

export interface PlayerInput {
  moveX: number; // -1, 0, or 1 (analog deadzoned & snapped/clamped)
  moveY: number; // -1, 0, or 1
  jump: boolean;
  jumpPressed: boolean;
  grab: boolean;
  anchor: boolean;
  pull: boolean;
  flag: boolean;
  callCharlie: boolean;
  emote: EmoteType;
}

export interface InputFrame {
  tick: number;
  p1: PlayerInput;
  p2: PlayerInput;
}

export function createEmptyPlayerInput(): PlayerInput {
  return {
    moveX: 0,
    moveY: 0,
    jump: false,
    jumpPressed: false,
    grab: false,
    anchor: false,
    pull: false,
    flag: false,
    callCharlie: false,
    emote: 'none',
  };
}

export function createEmptyInputFrame(tick = 0): InputFrame {
  return {
    tick,
    p1: createEmptyPlayerInput(),
    p2: createEmptyPlayerInput(),
  };
}

// ============================================================================
// Entity & Simulation State Contracts
// ============================================================================

export interface PenguinState {
  id: 'p1' | 'p2';
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  action: ActionState;
  flags: number;
  grounded: boolean;
  groundTerrain: TerrainType;
  wallSide: -1 | 0 | 1;
  wallTerrain: TerrainType;
  wallEntityId: string | null;
  platformEntityId: string | null;
  coyoteTimer: number;
  jumpCooldown: number;
  jumpBufferTimer: number;
  fallTimer: number;
  landHardTimer: number;
  grabStamina: number;
  grabMaxStamina: number;
  grabRedTint: number;
  swingTimer: number;
  swingRestTimer: number;
  swingFallTimer: number;
  swingAdditive: number;
  swingAngleDeg: number;
  dragForce: number;
  dragNoWallTimer: number;
  iceVelX: number;
  iceLerpT: number;
  pullRopeTimer: number;
  callCharlieTimer: number;
  emote: EmoteType;
  emoteTimer: number;
  animTime: number;
  scarfNodes: Vec2[];
  carryingJeff: boolean;
  jumpsUsed: number;
  stepDistAccum: number;
  lastJumpHeld: boolean;
}

export interface JeffState {
  active: boolean;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  grounded: boolean;
  groundTerrain: TerrainType;
  heldByP1: boolean;
  grabbedWallSide: -1 | 0 | 1;
  grabTimer: number;
  fallingSlow: boolean;
  anchored: boolean;
  platformEntityId: string | null;
  tossCooldown: number;
}

export interface RopeNode {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
}

export interface RopeState {
  maxDistance: number;
  currentDistance: number;
  taut: boolean;
  tension: number;
  wasTaut: boolean;
  nodes: RopeNode[];
}

export interface AssistSettings {
  infiniteJumps: boolean;
  pullingRope: boolean;
  checkPoints: boolean;
  betterGrab: boolean;
}

export interface CheckpointFlagState {
  placed: boolean;
  x: number;
  y: number;
  charlieActive: boolean;
  charlieProgress: number;
  charlieStartX: number;
  charlieStartY: number;
}

export interface TileCell {
  tx: number;
  ty: number;
  kind: TileKind;
  terrain: TerrainType;
  grabbable: boolean;
  mask: number; // 4-bit cardinal bitmask: N=1, E=2, S=4, W=8
}

export interface SlopeDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  dir: 'left' | 'right'; // 'right' rises left->right; 'left' rises right->left
  terrain: TerrainType;
}

export interface FallingBlockDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  terrain: TerrainType;
}

export interface FallingBlockState extends FallingBlockDef {
  state: 'intact' | 'shaking' | 'crumbled';
  timer: number;
}

export interface MovablePlatformDef {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  w: number;
  h: number;
  speed: number;
  mode: MovablePlatformType;
  terrain: TerrainType;
}

export interface MovablePlatformState extends MovablePlatformDef {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  t: number;
  dir: 1 | -1;
  active: boolean;
  pauseTimer: number;
}

export interface SwingPlatformDef {
  id: string;
  pivotX: number;
  pivotY: number;
  w: number;
  h: number;
  radius: number;
  maxDisplacement: number;
  swingTime: number;
  windDriven: boolean;
}

export interface SwingPlatformState extends SwingPlatformDef {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  angle: number;
  targetAngle: number;
  angularVel: number;
}

export interface WindZoneDef {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  dir: 1 | -1;
  activeTime: number;
  waitTime: number;
  constant: boolean;
  strength: number;
}

export interface WindZoneState extends WindZoneDef {
  phase: 'wait' | 'telegraph' | 'active';
  timer: number;
}

export interface CircuitDef {
  id: string;
  nodes: Vec2[];
}

export interface CircuitState extends CircuitDef {
  powered: boolean;
}

export interface CircuitButtonDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'switch' | 'pressure' | 'timed';
  circuitId: string;
  duration: number;
}

export interface CircuitButtonState extends CircuitButtonDef {
  pressed: boolean;
  timer: number;
  wasStepped: boolean;
}

export interface LaserDef {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  circuitId: string;
  invertPower: boolean;
}

export interface LaserState extends LaserDef {
  active: boolean;
  cooldown: number;
}

export interface TronchoDef {
  id: string;
  baseX: number;
  baseY: number;
  extX: number;
  extY: number;
  w: number;
  h: number;
  circuitId: string;
  launchImpulse: number;
  grabbable: boolean;
  terrain: TerrainType;
}

export interface TronchoState extends TronchoDef {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  t: number;
  extended: boolean;
}

export interface ColorPlatformDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  owner: 'krunked' | 'fred';
  circuitId?: string;
}

export interface ColorPlatformState extends ColorPlatformDef {
  active: boolean;
}

export interface CollectibleDef {
  id: string;
  kind: 'photo' | 'manual' | 'seal' | 'npc';
  x: number;
  y: number;
  label: string;
  zone: BiomeId;
}

export interface CollectibleState extends CollectibleDef {
  collected: boolean;
}

export interface BossChainState {
  id: 'left_arm' | 'right_arm' | 'left_leg' | 'right_leg';
  broken: boolean;
  buttonId: string;
  x: number;
  y: number;
}

export interface BossState {
  active: boolean;
  defeated: boolean;
  phaseIndex: number;
  phaseOrder: number[];
  chains: BossChainState[];
  laserSweepAngle: number;
  attackTimer: number;
  celebrationTimer: number;
}

export interface SignDef {
  x: number;
  y: number;
  title: string;
  text: string;
}

export interface DarkZoneDef {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface LevelData {
  id: string;
  name: string;
  mode: GameMode;
  timeTrialIndex?: number;
  spawnP1: Vec2;
  spawnP2: Vec2;
  summitY: number;
  summitZone: { x: number; y: number; w: number; h: number };
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  tiles: Map<string, TileCell>;
  tileList: TileCell[];
  slopes: SlopeDef[];
  fallingBlocks: FallingBlockDef[];
  movablePlatforms: MovablePlatformDef[];
  swingPlatforms: SwingPlatformDef[];
  windZones: WindZoneDef[];
  darkZones: DarkZoneDef[];
  circuits: CircuitDef[];
  buttons: CircuitButtonDef[];
  lasers: LaserDef[];
  tronchos: TronchoDef[];
  colorPlatforms: ColorPlatformDef[];
  collectibles: CollectibleDef[];
  signs: SignDef[];
  bossArena?: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    chains: BossChainState[];
  };
  waypoints: Vec2[];
}

export interface CameraState {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  targetX: number;
  targetY: number;
  shakeTimer: number;
  shakeMag: number;
  darknessAlpha: number;
}

export type SimEvent =
  | { type: 'jump'; who: 'p1' | 'p2'; x: number; y: number }
  | { type: 'land'; who: 'p1' | 'p2' | 'jeff'; x: number; y: number; terrain: TerrainType; impactVy: number }
  | { type: 'land_hard'; who: 'p1' | 'p2'; x: number; y: number; terrain: TerrainType }
  | { type: 'footstep'; who: 'p1' | 'p2'; x: number; y: number; terrain: TerrainType }
  | { type: 'grab_start'; who: 'p1' | 'p2' | 'jeff'; x: number; y: number; terrain: TerrainType }
  | { type: 'grab_stamina_out'; who: 'p1' | 'p2'; x: number; y: number }
  | { type: 'anchor_set'; who: 'p1' | 'p2'; x: number; y: number; terrain: TerrainType }
  | { type: 'swing_pump'; who: 'p1' | 'p2'; x: number; y: number; speed: number }
  | { type: 'swing_launch'; who: 'p1' | 'p2'; x: number; y: number; speed: number }
  | { type: 'rope_taut'; x: number; y: number; tension: number }
  | { type: 'rope_pull_start'; who: 'p1' | 'p2'; x: number; y: number }
  | { type: 'block_shake'; id: string; x: number; y: number }
  | { type: 'block_crumble'; id: string; x: number; y: number }
  | { type: 'block_recover'; id: string; x: number; y: number }
  | { type: 'wind_telegraph'; dir: 1 | -1 }
  | { type: 'wind_start'; dir: 1 | -1 }
  | { type: 'wind_stop' }
  | { type: 'flag_place'; x: number; y: number }
  | { type: 'charlie_pickup'; x: number; y: number }
  | { type: 'collect_photo'; id: string; label: string; x: number; y: number }
  | { type: 'collect_manual'; id: string; label: string; x: number; y: number }
  | { type: 'rescue_seal'; id: string; x: number; y: number }
  | { type: 'button_press'; id: string; circuitId: string; powered: boolean; x: number; y: number }
  | { type: 'troncho_launch'; id: string; who: 'p1' | 'p2'; x: number; y: number }
  | { type: 'laser_zap'; id: string; who: 'p1' | 'p2'; x: number; y: number }
  | { type: 'boss_chain_break'; chainId: BossChainState['id']; remaining: number; x: number; y: number }
  | { type: 'boss_defeated'; timeSec: number }
  | { type: 'summit_reached'; mode: GameMode; timeSec: number; noAssist: boolean }
  | { type: 'time_trial_finish'; trialId: string; timeSec: number; medal: MedalTier }
  | { type: 'emote'; who: 'p1' | 'p2'; emote: EmoteType; x: number; y: number }
  | { type: 'rps_result'; winner: 'p1' | 'p2' | 'draw'; p1Move: EmoteType; p2Move: EmoteType }
  | { type: 'achievement_unlock'; id: AchievementId };

export interface SimState {
  tick: number;
  seed: number;
  rngState: number;
  levelId: string;
  mode: GameMode;
  timeTrialIndex: number | null;
  elapsedSec: number;
  isOnline: boolean;
  aiBuddyEnabled: boolean;
  assist: AssistSettings;
  assistEverUsedInRun: boolean;
  p1: PenguinState;
  p2: PenguinState;
  jeff: JeffState;
  rope: RopeState;
  checkpoint: CheckpointFlagState;
  camera: CameraState;
  altitude: number;
  maxAltitude: number;
  fallsCount: number;
  jumpsCount: number;
  currentBiome: BiomeId;
  windActive: boolean;
  windDir: 1 | -1;
  windPhase: 'wait' | 'telegraph' | 'active';
  fallingBlocks: FallingBlockState[];
  movablePlatforms: MovablePlatformState[];
  swingPlatforms: SwingPlatformState[];
  windZones: WindZoneState[];
  circuits: CircuitState[];
  buttons: CircuitButtonState[];
  lasers: LaserState[];
  tronchos: TronchoState[];
  colorPlatforms: ColorPlatformState[];
  collectibles: CollectibleState[];
  boss: BossState;
  completed: boolean;
  completionTimeSec: number;
  completionMedal: MedalTier;
  events: SimEvent[];
}

// ============================================================================
// Settings, Persistence, Net Sync, Asset Pack & Debug Bridge Contracts
// ============================================================================

export interface RenderSettings {
  targetFps: TargetFps;
  classic50HzSnap: boolean;
  screenShake: boolean;
  packSource: PackSource;
  touchMode: TouchMode;
  showFps: boolean;
}

export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
  jukeboxTrack: JukeboxTrackId;
}

export interface KeybindProfile {
  p1Left: string;
  p1Right: string;
  p1Up: string;
  p1Down: string;
  p1Jump: string;
  p1Grab: string;
  p1Anchor: string;
  p1Pull: string;
  p2Left: string;
  p2Right: string;
  p2Up: string;
  p2Down: string;
  p2Jump: string;
  p2Grab: string;
  p2Anchor: string;
  p2Pull: string;
  flag: string;
  charlie: string;
  emote: string;
}

export const DEFAULT_KEYBINDS: KeybindProfile = {
  p1Left: 'KeyA',
  p1Right: 'KeyD',
  p1Up: 'KeyW',
  p1Down: 'KeyS',
  p1Jump: 'Space',
  p1Grab: 'ShiftLeft',
  p1Anchor: 'KeyC',
  p1Pull: 'KeyQ',
  p2Left: 'ArrowLeft',
  p2Right: 'ArrowRight',
  p2Up: 'ArrowUp',
  p2Down: 'ArrowDown',
  p2Jump: 'Enter',
  p2Grab: 'ShiftRight',
  p2Anchor: 'Slash',
  p2Pull: 'Period',
  flag: 'KeyF',
  charlie: 'KeyR',
  emote: 'KeyE',
};

export interface SaveData {
  version: 1;
  render: RenderSettings;
  audio: AudioSettings;
  assist: AssistSettings;
  skins: {
    p1: CoopSkinId;
    p2: CoopSkinId;
    jeff: JeffSkinId;
    rope: RopeSkinId;
  };
  unlockedPhotos: PhotoId[];
  unlockedManual: ManualPageId[];
  unlockedAchievements: AchievementId[];
  timeTrialBest: Record<string, { timeSec: number; medal: MedalTier }>;
  bestAltitudeCoop: number;
  bestAltitudeSolo: number;
  bestAltitudeLab: number;
  summitsCleared: number;
  noAssistCleared: boolean;
  labBossCleared: boolean;
  sealsRescued: number;
  keybinds: KeybindProfile;
  gamepadSplitMode: boolean;
  grabToggleMode: boolean;
}

export type NetSyncPacket =
  | { type: 'hello'; role: 'host' | 'client'; seed: number; mode: GameMode; levelId: string }
  | { type: 'input'; tick: number; role: 'host' | 'client'; input: PlayerInput; hash: string }
  | { type: 'state_ack'; tick: number; hash: string }
  | { type: 'state_resync'; tick: number; snapshot: Partial<SimState> }
  | { type: 'ping'; ts: number }
  | { type: 'pong'; ts: number };

export interface AssetPackManifest {
  packName: string;
  version: string;
  source: PackSource;
  extractedAt?: string;
  sprites: Record<string, string>;
  audio: Record<string, string>;
  localization: Record<string, string>;
}

export interface DebugMetrics {
  fps: number;
  targetFps: TargetFps;
  simHz: number;
  tick: number;
  altitude: number;
  maxAltitude: number;
  biome: BiomeId;
  entities: number;
  packSource: PackSource;
  touchVisible: boolean;
  gamepadCount: number;
  onlineState: string;
}

export interface DebugBridge {
  getState(): SimState;
  getHash(): string;
  getMetrics(): DebugMetrics;
  getScreen(): MenuScreen;
  setScreen(screen: MenuScreen): void;
  startMode(mode: GameMode, timeTrialIndex?: number): void;
  warpTo(x: number, y: number): void;
  warpToZone(zone: BiomeId): void;
  setAssist(partial: Partial<AssistSettings>): void;
  setTargetFps(fps: TargetFps): void;
  setClassicSnap(enabled: boolean): void;
  setSkins(partial: Partial<SaveData['skins']>): void;
  setPackSource(source: PackSource): void;
  setInputOverride(p1?: Partial<PlayerInput>, p2?: Partial<PlayerInput>): void;
  clearInputOverride(): void;
  stepTicks(count: number, p1?: Partial<PlayerInput>, p2?: Partial<PlayerInput>): string;
  triggerBossChainBreak(chainIndex?: number): void;
  resetSave(): void;
  getTouchVisible(): boolean;
  openOnlineCoop(role: 'host' | 'client', channelName?: string): void;
  toggleDrawer(open?: boolean): void;
}

// ============================================================================
// Spliceable Cross-Module Ports (Hexagonal Composition Contracts)
// ============================================================================

export interface WindSample {
  active: boolean;
  dir: 1 | -1;
  strength: number;
}

export interface SimHooks {
  updateHazards?: (state: SimState, level: LevelData, dt: number) => void;
  getWindAt?: (state: SimState, x: number, y: number) => WindSample;
  updateCircuits?: (state: SimState, level: LevelData, dt: number) => void;
  updateBoss?: (state: SimState, level: LevelData, dt: number) => void;
  updateProgression?: (state: SimState, level: LevelData, events: SimEvent[]) => void;
}

export interface CreateSimOptions {
  seed?: number;
  assist?: Partial<AssistSettings>;
  isOnline?: boolean;
  aiBuddyEnabled?: boolean;
}

export interface SimModulePort {
  createSimState(level: LevelData, options?: CreateSimOptions): SimState;
  stepSim(state: SimState, level: LevelData, input: InputFrame, hooks?: SimHooks): SimEvent[];
  warpPlayers(state: SimState, x: number, y: number): void;
  hashSimState(state: SimState): string;
}

export interface WorldModulePort {
  getLevelByMode(mode: GameMode, timeTrialIndex?: number): LevelData;
  getZoneWarpTarget(level: LevelData, zone: BiomeId): Vec2;
  createSimHooks(): SimHooks;
}

export interface RendererModulePort {
  getCanvas(): HTMLCanvasElement;
  resize(width: number, height: number): void;
  consumeEvents(events: SimEvent[], state: SimState): void;
  render(
    state: SimState,
    level: LevelData,
    interpAlpha: number,
    settings: RenderSettings,
    skins: SaveData['skins'],
    dt: number,
    fps?: number
  ): void;
  setPackSource(source: PackSource): Promise<PackSource>;
  getPackSource(): PackSource;
  hasCustomPack(): boolean;
  loadCustomPackFromFiles?(files: FileList | File[]): Promise<boolean>;
  dispose(): void;
}

export interface AudioModulePort {
  unlock(): void;
  applySettings(settings: AudioSettings): void;
  consumeEvents(events: SimEvent[], state: SimState): void;
  playUiSound(kind: 'move' | 'confirm' | 'cancel' | 'toggle'): void;
  update(state: SimState, dt: number): void;
  setCustomAudioPack?(urls: Record<string, string>): void;
  dispose(): void;
}

export interface AppDeps {
  sim: SimModulePort;
  world: WorldModulePort;
  renderer: RendererModulePort;
  audio: AudioModulePort;
}

declare global {
  interface Window {
    __KRUNKED_DEBUG__?: DebugBridge;
  }
}
