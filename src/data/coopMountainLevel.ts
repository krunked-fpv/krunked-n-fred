import {
  PHYSICS,
  WORLD,
  type BiomeId,
  type GameMode,
  type LevelData,
  type MovablePlatformType,
  type TerrainType,
  type Vec2,
} from '../contracts';
import { LevelBuilder } from './tileBuilder';

/**
 * Guaranteed-grounded zone warp coordinates (Y-UP tiles) for Co-Op Mountain (0..498 u).
 * Each target sits 0.6 u above a wide (>= 8 u) flat solid deck with open headroom so
 * warpPlayers(state, x, y) places both P1 (x - 0.6) and P2 (x + 0.6) cleanly grounded.
 */
export const COOP_ZONE_WARPS: Record<BiomeId, Vec2> = {
  village: { x: 0.0, y: 1.6 },
  foothills: { x: 16.0, y: 20.6 },
  mines: { x: 18.5, y: 104.6 },
  crags: { x: -1.0, y: 225.6 },
  summit: { x: 6.5, y: 492.6 },
  lab: { x: -16.5, y: 3.6 },
  boss: { x: 6.5, y: 492.6 },
};

interface WaypointTape {
  points: Vec2[];
  /** Direct single-hop waypoint (never cuts diagonally through solid corners). */
  hop(x: number, y: number): void;
  /** Interpolates smoothly along a flat deck, slope, or moving platform track. */
  walk(toX: number, toY: number, maxStep?: number): void;
  /** Hops cleanly to entryX on a flat ledge at topY, then walks horizontally to exitX. */
  ledge(entryX: number, exitX: number, topY: number): void;
}

function createWaypointTape(startX: number, startY: number): WaypointTape {
  const points: Vec2[] = [{ x: startX, y: startY }];

  const hop = (x: number, y: number): void => {
    const rx = Math.round(x * 100) / 100;
    const ry = Math.round(y * 100) / 100;
    const prev = points[points.length - 1];
    if (Math.hypot(rx - prev.x, ry - prev.y) < 0.15) return;
    points.push({ x: rx, y: ry });
  };

  const walk = (toX: number, toY: number, maxStep = 3.2): void => {
    const prev = points[points.length - 1];
    const dx = toX - prev.x;
    const dy = toY - prev.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.15) return;
    const stepsByDist = Math.ceil(dist / maxStep);
    const stepsByRise = dy > 0 ? Math.ceil(dy / 2.2) : 1;
    const steps = Math.max(1, stepsByDist, stepsByRise);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      hop(prev.x + dx * t, prev.y + dy * t);
    }
  };

  const ledge = (entryX: number, exitX: number, topY: number): void => {
    const y = topY + 0.6;
    hop(entryX, y);
    walk(exitX, y);
  };

  return { points, hop, walk, ledge };
}

function addDeck(
  b: LevelBuilder,
  x: number,
  topY: number,
  w: number,
  terrain: TerrainType = 'SNOW',
  thickness = 1,
): void {
  if (terrain === 'ICE') {
    b.fillIce(x, topY - thickness, w, thickness);
  } else {
    b.fillRect(x, topY - thickness, w, thickness, terrain);
  }
}

function addOneWayDeck(
  b: LevelBuilder,
  x: number,
  topY: number,
  w: number,
  terrain: TerrainType = 'PLATFORM',
): void {
  b.addOneWay(x, topY - 1, w, terrain);
}

/**
 * Builds the complete Co-Op Mountain (0..498 u) for Krunked & Fred:
 *  - Village Hub (Y = 0, X: -22..6) with all 6 hub signs & smoking cabin clearing
 *  - Zone 1: Snowy Foothills (0..91 u) - slopes, chimney shafts, ice terrace, 2 pendulum chasms
 *  - Zone 2: Dark Mines (91..217 u) - darkZone (103..217), 42 movable minecarts/lifts across all
 *    5 MovablePlatformTypes, crumbling rock intro, Seal rescue, 3 friendly Mole NPCs
 *  - Zone 3: Windy Crags (217..395 u) - 8 cyclic WindZones, 8 wind-driven SwingPlatforms,
 *    127 crumbling FallingBlocks across 8 alpine gale spires
 *  - Zone 4: Frozen Summit & Peak (395..498 u) - slick ICE ledges, non-grabbable ice cliffs,
 *    constant Peak WindZone, and grand Summit Flag Celebration Plateau at Y = 498.
 */
export function buildCoopMountainLevel(mode: GameMode = 'coop_mountain'): LevelData {
  const b = new LevelBuilder({
    id: `coop_mountain_${mode}`,
    name: 'Mount Krunked - Co-Op Mountain',
    mode,
    summitY: WORLD.COOP_SUMMIT_Y,
    bounds: { minX: -24, maxX: 38, minY: -2, maxY: 512 },
  });

  // Spawn Krunked (P1) & Fred (P2) in Village Hub directly above snow ground (top Y = 1.0)
  b.setSpawn({ x: 0, y: 1.6 }, { x: 1.5, y: 1.6 });
  const wp = createWaypointTape(0, 1.6);

  // ==========================================================================
  // 0. VILLAGE HUB (Y: 0..6, X: -22..6)
  // ==========================================================================
  b.fillRect(-22, -2, 48, 3, 'SNOW'); // Wide village snow ground (topY = 1.0)
  b.fillRect(-22, 1, 2, 16, 'SNOW'); // West boundary cliff
  b.fillRect(25, 1, 3, 22, 'SNOW'); // East boundary cliff

  // Raised Village Workshop & Skin Closet deck (topY = 3.0) + timber awning (topY = 6.0)
  // Leaves X: -13..-8 as clean exposed snow so GameRenderer grounds the smoking Village Cabin!
  b.fillRect(-19, 1, 6, 2, 'BELL_HOUSE');
  addOneWayDeck(b, -20, 6, 8, 'WORKSHOP');

  // All 6 Village Hub Signs + Spawn Tutorial Sign (pure ASCII only)
  b.addSign({
    x: -18.5,
    y: 3.0,
    title: 'Lab Portal',
    text: 'Secret Lab Portal - Enter Dr. Bachicha underground workshop from the Play menu!',
  });
  b.addSign({
    x: -16.5,
    y: 3.0,
    title: 'Skin Closet',
    text: 'Swap 16 Co-Op Skins, 6 Jeff Skins, and 12 Rope Skins anytime in the Skin Closet.',
  });
  b.addSign({
    x: -14.2,
    y: 3.0,
    title: 'Jukebox',
    text: 'Spin all 11 Alpine, Cavern, and Synth tracks in the Village Jukebox!',
  });
  b.addSign({
    x: -7.5,
    y: 1.0,
    title: 'Album',
    text: 'Polaroid Album - Collect all 12 hidden Polaroids across the 4 mountain zones.',
  });
  b.addSign({
    x: -4.5,
    y: 1.0,
    title: 'Manual',
    text: 'Climber Manual - Find all 7 Manual Pages to master Swing, Grab, Ice, and Wind.',
  });
  b.addSign({
    x: -2.0,
    y: 1.0,
    title: 'Time Trials',
    text: 'Race 10 timed mountain courses (TT1-TT10) for Bronze, Silver, Gold, and Platinum!',
  });
  b.addSign({
    x: 3.5,
    y: 1.0,
    title: 'Jump & Rope',
    text: 'Climb together! Your 2.5u braided rope links Krunked & Fred - leap in rhythm.',
  });

  // ==========================================================================
  // 1. ZONE 1: SNOWY FOOTHILLS (Y: 0..91)
  // ==========================================================================

  // --- 1A. Warmup Snow Cliffs, Slopes & Emote Camp (Y: 1..20) ---
  addDeck(b, 7, 3, 6, 'SNOW', 2); // X: 7..13, topY = 3
  addDeck(b, 12, 5, 6, 'SNOW', 2); // X: 12..18, topY = 5
  addDeck(b, 16, 7, 8, 'SNOW', 2); // X: 16..24, topY = 7
  addOneWayDeck(b, 11, 9, 6, 'PLATFORM'); // X: 11..17, topY = 9
  addDeck(b, 4, 11, 8, 'SNOW', 1); // X: 4..12, topY = 11

  // Western Campfire Balcony with Manual Page: Emotes
  addDeck(b, -3, 11, 7, 'SNOW', 1); // X: -3..4, topY = 11
  b.addCollectible({
    id: 'Emotes',
    kind: 'manual',
    x: -1.0,
    y: 12.0,
    label: 'Claps & Rock-Paper-Scissors',
    zone: 'foothills',
  });
  b.addSign({
    x: 1.5,
    y: 11.0,
    title: 'Campfire Emotes',
    text: 'Press E to Clap in sync or settle who anchors next with Rock-Paper-Scissors!',
  });

  addDeck(b, 1, 13, 6, 'SNOW', 1); // X: 1..7, topY = 13
  addDeck(b, 6, 15, 5, 'SNOW', 1); // X: 6..11, topY = 15

  // Snow Slope #1 rising left-to-right (Y: 15 -> 17)
  b.addSlope({ id: 'slope_coop_1', x: 11, y: 15, w: 4, h: 2, dir: 'right', terrain: 'SNOW' });
  b.fillRect(11, 14, 4, 1, 'SNOW');
  addDeck(b, 15, 17, 7, 'SNOW', 1); // X: 15..22, topY = 17

  // Scenic Eastern Pine Lookout with Polaroid Photo1
  addDeck(b, 23, 18, 6, 'SNOW', 1); // X: 23..29, topY = 18
  b.addCollectible({
    id: 'Photo1',
    kind: 'photo',
    x: 26.0,
    y: 19.0,
    label: 'Chimney Lookout',
    zone: 'foothills',
  });

  addOneWayDeck(b, 14, 18, 4, 'PLATFORM'); // Chimney approach directly beneath ONE_WAY mouth
  // Foothills Warp & Chimney Mouth Deck (topY = 20, X: 14..18 ONE_WAY mouth between snow walls)
  addDeck(b, 10, 20, 4, 'SNOW', 1);
  addOneWayDeck(b, 14, 20, 4, 'PLATFORM');
  addDeck(b, 18, 20, 4, 'SNOW', 1);
  b.addSign({
    x: 16.0,
    y: 20.0,
    title: 'Wall Cling Chimney',
    text: 'Hold Grab (Shift) against snow cliffs to cling! Jump side-to-side up the shaft.',
  });

  wp.walk(6.0, 1.6);
  wp.ledge(8.0, 11.5, 3);
  wp.ledge(13.0, 15.5, 5);
  wp.ledge(17.5, 17.5, 7);
  wp.ledge(15.5, 12.0, 9);
  wp.ledge(10.5, 6.5, 11);
  wp.ledge(5.5, 5.5, 13);
  wp.ledge(7.0, 10.5, 15);
  wp.walk(14.5, 17.6);
  wp.ledge(16.0, 16.0, 17);
  wp.ledge(16.0, 16.0, 18);
  wp.ledge(16.0, 16.0, 20);

  // --- 1B. Wall-Cling Chimney Shaft (Y: 20..38, 4.0 u grabbable SNOW walls) ---
  b.fillRect(11, 20, 3, 18, 'SNOW'); // Left cliff X: 11..14, topY = 38
  b.fillRect(18, 20, 4, 18, 'SNOW'); // Right cliff X: 18..22, topY = 38
  for (let rungY = 22; rungY <= 36; rungY += 2) {
    const onRight = ((rungY - 22) / 2) % 2 === 0;
    const rx = onRight ? 16 : 14;
    addOneWayDeck(b, rx, rungY, 2, 'PLATFORM');
    wp.hop(rx + 1.0, rungY + 0.6);
  }

  // Chimney Crown Decks + Manual Page: Grab + Polaroid Photo2
  addDeck(b, 7, 38, 7, 'SNOW', 1); // Left exit X: 7..14, topY = 38
  addDeck(b, 18, 38, 7, 'SNOW', 1); // Right crown X: 18..25, topY = 38
  b.addCollectible({
    id: 'Grab',
    kind: 'manual',
    x: 22.5,
    y: 39.0,
    label: 'Wall Cling & Stamina',
    zone: 'foothills',
  });
  addDeck(b, 26, 40, 5, 'SNOW', 1); // Eastern scenic pine perch X: 26..31, topY = 40
  b.addCollectible({
    id: 'Photo2',
    kind: 'photo',
    x: 28.5,
    y: 41.0,
    label: 'Minecart Crossing',
    zone: 'foothills',
  });

  wp.ledge(13.0, 8.0, 38);

  // --- 1C. Slick ICE Terrace (Y: 38..54) ---
  b.addSign({
    x: 8.5,
    y: 38.0,
    title: 'Glacier Ice',
    text: 'Slick ice carries your momentum! Brake early or Anchor on snow catch blocks.',
  });
  addDeck(b, 0, 40, 7, 'ICE', 1); // X: 0..7, topY = 40
  b.fillRect(-3, 39, 3, 3, 'SNOW'); // Snow catch bumper X: -3..0, topY = 42
  addDeck(b, 1, 44, 6, 'ICE', 1); // X: 1..7, topY = 44
  addDeck(b, 8, 46, 6, 'ICE', 1); // X: 8..14, topY = 46
  addDeck(b, 14, 47, 4, 'SNOW', 2); // Snow catch X: 14..18, topY = 47
  addDeck(b, 10, 49, 5, 'SNOW', 1); // X: 10..15, topY = 49
  addDeck(b, 3, 51, 7, 'ICE', 1); // X: 3..10, topY = 51
  addDeck(b, -1, 52, 4, 'SNOW', 2); // Snow catch X: -1..3, topY = 52
  // Safe recovery floor beneath Pendulum Swing Chasm #1
  addDeck(b, 3, 54, 18, 'SNOW', 1); // X: 3..21, topY = 54

  wp.ledge(6.0, 1.0, 40);
  wp.ledge(-0.5, -0.5, 42);
  wp.ledge(2.0, 6.5, 44);
  wp.ledge(9.0, 13.0, 46);
  wp.ledge(15.0, 15.0, 47);
  wp.ledge(13.5, 11.0, 49);
  wp.ledge(9.0, 4.0, 51);
  wp.ledge(2.0, 2.0, 52);
  wp.ledge(4.0, 4.0, 54);

  // --- 1D. Signature Co-Op Pendulum Swing Chasm #1 (Y: 54..62) ---
  addDeck(b, -1, 56, 5, 'SNOW', 1); // Return step 1 X: -1..4, topY = 56
  addDeck(b, -4, 58, 5, 'SNOW', 1); // Return step 2 X: -4..1, topY = 58
  // Anchor Ledge #1 (X: 2..10, topY = 60)
  addDeck(b, 2, 60, 8, 'SNOW', 2);
  b.addSign({
    x: 6.5,
    y: 60.0,
    title: 'Anchor & Swing',
    text: 'Hold Anchor (C / Slash) at the ledge! Partner drops below, pumps Left/Right, and Jumps!',
  });

  // Upper-left perch with Manual Page: Swing
  addDeck(b, -4, 62, 5, 'SNOW', 1); // X: -4..1, topY = 62
  b.addCollectible({
    id: 'Swing',
    kind: 'manual',
    x: -1.5,
    y: 63.0,
    label: 'Anchor & Pendulum Swing',
    zone: 'foothills',
  });

  // Target Ledge #1 across 5.0 u chasm (X = 10 -> 15; recovery floor directly below at Y = 54)
  b.fillRect(15, 57, 1, 2, 'SNOW'); // Grabbable catch chin X: 15..16, topY = 59
  addDeck(b, 16, 60, 8, 'SNOW', 3); // Target Deck X: 16..24, topY = 60

  wp.ledge(2.5, 0.5, 56);
  wp.ledge(-0.5, 0.5, 58);
  wp.ledge(3.0, 9.2, 60);
  wp.hop(12.5, 60.0); // Mid-swing air point directly above Y=54 recovery floor
  wp.ledge(16.0, 22.0, 60);

  // --- 1E. Second Co-Op Pendulum Chasm & Alpine Ridge (Y: 60..76) ---
  addDeck(b, 20, 62, 6, 'SNOW', 1); // X: 20..26, topY = 62
  addOneWayDeck(b, 15, 64, 5, 'PLATFORM'); // X: 15..20, topY = 64
  // Recovery floor beneath Pendulum Chasm #2
  addDeck(b, 3, 66, 18, 'SNOW', 1); // X: 3..21, topY = 66
  addDeck(b, 19, 68, 5, 'SNOW', 1); // X: 19..24, topY = 68
  addDeck(b, 21, 70, 5, 'SNOW', 1); // X: 21..26, topY = 70
  // Anchor Ledge #2 (X: 15..22, topY = 72) - leftward pendulum swing!
  addDeck(b, 15, 72, 7, 'SNOW', 2);

  // Target Ledge #2 across 5.0 u chasm (X = 15 -> 10; recovery floor directly below at Y = 66)
  b.fillRect(9, 69, 1, 2, 'SNOW'); // Grabbable catch chin X: 9..10, topY = 71
  addDeck(b, 2, 72, 7, 'SNOW', 3); // Target Deck X: 2..9, topY = 72

  // Western Snow Overlook with Polaroid Photo3
  addDeck(b, -4, 74, 5, 'SNOW', 1); // X: -4..1, topY = 74
  b.addCollectible({
    id: 'Photo3',
    kind: 'photo',
    x: -1.5,
    y: 75.0,
    label: 'Village Campfire',
    zone: 'foothills',
  });

  wp.ledge(21.5, 21.0, 62);
  wp.ledge(19.0, 17.5, 64);
  wp.ledge(18.5, 19.5, 66);
  wp.ledge(21.0, 22.5, 68);
  wp.ledge(23.2, 23.2, 70);
  wp.ledge(21.0, 15.8, 72);
  wp.hop(12.5, 72.0); // Mid-swing air point directly above Y=66 recovery floor
  wp.ledge(9.0, 6.5, 72);

  // --- 1F. Upper Foothills Slope & Approach to Dark Mines Gate (Y: 72..91) ---
  addDeck(b, 6, 74, 6, 'SNOW', 1); // X: 6..12, topY = 74
  addDeck(b, 12, 76, 6, 'ICE', 1); // X: 12..18, topY = 76
  addDeck(b, 18, 77, 4, 'SNOW', 1); // Snow catch X: 18..22, topY = 77
  // Snow Slope #2 rising left-to-right (Y: 77 -> 79, clear of ICE deck X: 12..18!)
  b.addSlope({ id: 'slope_coop_2', x: 22, y: 77, w: 4, h: 2, dir: 'right', terrain: 'SNOW' });
  b.fillRect(22, 76, 4, 1, 'SNOW');
  addDeck(b, 26, 79, 5, 'SNOW', 1); // X: 26..31, topY = 79
  addDeck(b, 20, 81, 6, 'SNOW', 1); // X: 20..26, topY = 81
  addOneWayDeck(b, 14, 83, 6, 'PLATFORM'); // X: 14..20, topY = 83
  addDeck(b, 14, 85, 6, 'SNOW', 1); // X: 14..20, topY = 85
  addDeck(b, 10, 87, 6, 'SNOW', 1); // X: 10..16, topY = 87
  addDeck(b, 6, 89, 6, 'SNOW', 1); // X: 6..12, topY = 89

  wp.ledge(7.5, 11.0, 74);
  wp.ledge(13.0, 17.0, 76);
  wp.ledge(19.0, 21.5, 77);
  wp.hop(22.5, 77.8);
  wp.walk(25.5, 79.6);
  wp.ledge(27.0, 27.0, 79);
  wp.ledge(25.0, 21.0, 81);
  wp.ledge(19.0, 15.0, 83);
  wp.ledge(15.5, 16.0, 85);
  wp.ledge(14.5, 11.0, 87);
  wp.ledge(10.0, 9.0, 89);

  // ==========================================================================
  // 2. ZONE 2: DARK MINES (Y: 91..217)
  //    - darkZone covering Y = 103..217
  //    - EXACT 42 MovablePlatforms across all 5 MovablePlatformTypes
  //    - 6 crumbling FallingBlocks teaching mine rock, Seal Rescue, 3 Mole NPCs
  // ==========================================================================

  // Flanking subterranean cavern walls framing interior X: -10..32 (42 u wide shaft)
  b.fillRect(-14, WORLD.ZONE2_START_Y, 4, 126, 'DIRT');
  b.fillRect(32, WORLD.ZONE2_START_Y, 4, 126, 'DIRT');

  // Dark Zone covering Y = 103..217 (activates twin 2D headlamps!)
  b.addDarkZone({
    minX: -24,
    maxX: 38,
    minY: WORLD.ZONE2_DARK_START_Y,
    maxY: WORLD.ZONE2_END_Y,
  });

  // Mines Entrance Gate Plateau at topY = 91
  addDeck(b, 3, 91, 14, 'DIRT', 1);
  b.addSign({
    x: 8.0,
    y: 91.0,
    title: 'Dark Mines - 91m',
    text: 'Minecarts, crumbling rock, and dark shafts ahead! Headlamps ignite at 103m.',
  });
  wp.ledge(8.0, 4.0, 91);

  // --- 2A. Mines Gate to Headlamp Warp Deck (Y: 91..104, Movables #1 & #2 + Mole #1) ---
  addDeck(b, -4, 93, 7, 'DIRT', 1); // X: -4..3, topY = 93
  addDeck(b, -10, 95, 7, 'DIRT', 1); // X: -10..-3, topY = 95 (Mole #1 alcove)
  b.addCollectible({
    id: 'npc_mole_1',
    kind: 'npc',
    x: -7.5,
    y: 96.0,
    label: 'Barnaby the Mole',
    zone: 'mines',
  });
  b.addSign({
    x: -5.5,
    y: 95.0,
    title: 'Barnaby the Mole',
    text: 'Welcome climbers! Hop onto our minecart rails - some stop when you step off!',
  });

  // Movable #1 (CONTINUE): West dock (-10..-3, topY=95) -> Mid platform (9..14, topY=97)
  b.addMovable({
    id: 'minecart_1',
    startX: -2.5,
    startY: 94,
    endX: 5.5,
    endY: 96,
    w: 3,
    h: 1,
    speed: 3.2,
    mode: 'CONTINUE',
    terrain: 'MOVABLE',
  });
  addDeck(b, 9, 97, 5, 'DIRT', 1); // Mid dock X: 9..14, topY = 97

  // Movable #2 (ENDS_STOP): Mid platform (9..14, topY=97) -> East dock (23..30, topY=99)
  b.addMovable({
    id: 'minecart_2',
    startX: 14.5,
    startY: 96,
    endX: 19.5,
    endY: 98,
    w: 3,
    h: 1,
    speed: 3.0,
    mode: 'ENDS_STOP',
    terrain: 'MOVABLE',
  });
  addDeck(b, 23, 99, 8, 'DIRT', 1); // East dock X: 23..31, topY = 99
  addOneWayDeck(b, 25, 101, 6, 'PLATFORM'); // X: 25..31, topY = 101
  addOneWayDeck(b, 22, 103, 7, 'PLATFORM'); // X: 22..29, topY = 103
  // Wide Headlamp Threshold & Mines Warp Deck (topY = 104, X: 12..25, inside darkZone 103..217!)
  addDeck(b, 12, 104, 13, 'DIRT', 1);
  b.addSign({
    x: 15.0,
    y: 104.0,
    title: 'Headlamps On - 104m',
    text: 'Cracked mine stone shakes for 1 second before crumbling! Keep moving across.',
  });

  wp.ledge(2.0, -3.0, 93);
  wp.ledge(-4.0, -3.5, 95);
  wp.hop(-1.0, 95.6);
  wp.walk(7.0, 97.6);
  wp.ledge(10.0, 13.0, 97);
  wp.hop(16.0, 97.6);
  wp.walk(21.0, 99.6);
  wp.ledge(24.0, 27.5, 99);
  wp.ledge(27.5, 27.0, 101);
  wp.ledge(26.0, 25.5, 103);
  wp.ledge(24.0, 17.0, 104);

  // --- 2B. Crumbling Rock Bridge (6 FallingBlocks) + Manual Page: Mines (Y: 104..112) ---
  addOneWayDeck(b, -4, 103, 16, 'PLATFORM'); // Safe timber catwalk below crumbling bridge
  addDeck(b, 13, 106, 5, 'DIRT', 1); // Bridge launch step X: 13..18, topY = 106
  b.addFallingBlock({ id: 'fb_mines_1', x: 10, y: 105, w: 2, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'fb_mines_2', x: 7, y: 105, w: 2, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'fb_mines_3', x: 4, y: 105, w: 2, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'fb_mines_4', x: 1, y: 106, w: 2, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'fb_mines_5', x: -2, y: 106, w: 2, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'fb_mines_6', x: -5, y: 106, w: 2, h: 1, terrain: 'DIRT' });

  // West shaft landing deck + Manual Page: Mines
  addDeck(b, -10, 107, 4, 'DIRT', 1); // X: -10..-6, topY = 107
  b.addCollectible({
    id: 'Mines',
    kind: 'manual',
    x: -8.0,
    y: 108.0,
    label: 'Dark Mines & Crumbling Rock',
    zone: 'mines',
  });
  addOneWayDeck(b, -8, 109, 5, 'PLATFORM'); // X: -8..-3, topY = 109
  addOneWayDeck(b, -5, 110, 5, 'PLATFORM'); // X: -5..0, topY = 110 (strictly clear of X=-10..-5 dock!)

  wp.ledge(16.0, 14.0, 106);
  wp.hop(11.0, 106.6);
  wp.hop(8.0, 106.6);
  wp.hop(5.0, 106.6);
  wp.hop(2.0, 107.6);
  wp.hop(-1.0, 107.6);
  wp.hop(-4.0, 107.6);
  wp.ledge(-7.0, -7.0, 107);
  wp.ledge(-6.0, -4.5, 109);
  wp.ledge(-3.8, -4.2, 110);

  // --- 2C. 14 Subterranean Minecart & Hoist Tiers (Y: 112..210, Movables #3..#42 = 40 carts!) ---
  const tierModes: MovablePlatformType[][] = [
    ['CONTINUE', 'ENDS_STOP', 'CONTINUE'], // Tier 0 (Y=112, Right)
    ['ENDS_STOP', 'CONTINUE', 'ENDS_STOP'], // Tier 1 (Y=119, Left) -> Photo4
    ['START_STOP', 'START_STOP', 'START_STOP'], // Tier 2 (Y=126, Right)
    ['START_STOP', 'ENDS_STOP', 'START_STOP'], // Tier 3 (Y=133, Left) -> Mole #2
    ['START_STOP', 'CONTINUE', 'START_STOP'], // Tier 4 (Y=140, Right)
    ['START_STOP', 'STEP_STOP', 'STEP_STOP'], // Tier 5 (Y=147, Left)
    ['STEP_STOP', 'STEP_STOP'], // Tier 6 (Y=154, Right, 2-cart Seal Rescue Cove!)
    ['STEP_STOP', 'CONTINUE', 'STEP_STOP'], // Tier 7 (Y=161, Left)
    ['STEP_STOP', 'ENDS_STOP', 'STEP_STOP'], // Tier 8 (Y=168, Right) -> Photo5
    ['FINISH_STOP', 'CONTINUE', 'FINISH_STOP'], // Tier 9 (Y=175, Left)
    ['FINISH_STOP', 'ENDS_STOP', 'FINISH_STOP'], // Tier 10 (Y=182, Right) -> Mole #3
    ['FINISH_STOP', 'CONTINUE', 'FINISH_STOP'], // Tier 11 (Y=189, Left)
    ['FINISH_STOP', 'ENDS_STOP', 'CONTINUE'], // Tier 12 (Y=196, Right)
    ['CONTINUE', 'ENDS_STOP'], // Tier 13 (Y=203, Left, 2-cart Deep Finale!)
  ];

  let cartIdx = 3;
  for (let tier = 0; tier < tierModes.length; tier++) {
    const baseY = 112 + tier * 7;
    const goingRight = tier % 2 === 0;
    const modes = tierModes[tier];
    const speed = 2.8 + (tier % 4) * 0.35;

    if (modes.length === 3) {
      if (goingRight) {
        addDeck(b, -10, baseY, 5, 'DIRT', 1); // X: -10..-5, topY = baseY
        addDeck(b, 4, baseY + 1, 3, 'DIRT', 1); // Island 1 X: 4..7, topY = baseY + 1
        addDeck(b, 16, baseY + 2, 3, 'DIRT', 1); // Island 2 X: 16..19, topY = baseY + 2
        addDeck(b, 28, baseY + 3, 4, 'DIRT', 1); // Right dock X: 28..32, topY = baseY + 3

        const segs: ReadonlyArray<{ sx: number; sy: number; ex: number; ey: number }> = [
          { sx: -4.5, sy: baseY - 1, ex: 0.5, ey: baseY },
          { sx: 7.5, sy: baseY, ex: 12.5, ey: baseY + 1 },
          { sx: 19.5, sy: baseY + 1, ex: 24.5, ey: baseY + 2 },
        ];
        wp.ledge(-7.5, -5.8, baseY);
        for (let s = 0; s < 3; s++) {
          const seg = segs[s];
          const mType = modes[s];
          b.addMovable({
            id: `minecart_${cartIdx++}`,
            startX: seg.sx,
            startY: seg.sy,
            endX: seg.ex,
            endY: seg.ey,
            w: 3,
            h: 1,
            speed,
            mode: mType,
            terrain: 'MOVABLE',
          });
          if (mType === 'FINISH_STOP') {
            addOneWayDeck(b, Math.floor(seg.sx), seg.sy, 8, 'PLATFORM');
          }
          wp.hop(seg.sx + 1.5, seg.sy + 1.6);
          wp.walk(seg.ex + 1.5, seg.ey + 1.6);
          if (s === 0) wp.ledge(5.0, 6.2, baseY + 1);
          if (s === 1) wp.ledge(17.0, 18.2, baseY + 2);
        }
        wp.ledge(29.0, 29.0, baseY + 3);
        addOneWayDeck(b, 25, baseY + 5, 5, 'PLATFORM');
        wp.ledge(28.0, 28.0, baseY + 5);
      } else {
        addDeck(b, 27, baseY, 5, 'DIRT', 1); // X: 27..32, topY = baseY
        addDeck(b, 15, baseY + 1, 3, 'DIRT', 1); // Island 2 X: 15..18, topY = baseY + 1
        addDeck(b, 3, baseY + 2, 3, 'DIRT', 1); // Island 1 X: 3..6, topY = baseY + 2
        addDeck(b, -10, baseY + 3, 4, 'DIRT', 1); // Left dock X: -10..-6, topY = baseY + 3

        const segs: ReadonlyArray<{ sx: number; sy: number; ex: number; ey: number }> = [
          { sx: 23.5, sy: baseY - 1, ex: 18.5, ey: baseY },
          { sx: 11.5, sy: baseY, ex: 6.5, ey: baseY + 1 },
          { sx: -0.5, sy: baseY + 1, ex: -5.5, ey: baseY + 2 },
        ];
        wp.ledge(29.0, 27.8, baseY);
        for (let s = 0; s < 3; s++) {
          const seg = segs[s];
          const mType = modes[s];
          b.addMovable({
            id: `minecart_${cartIdx++}`,
            startX: seg.sx,
            startY: seg.sy,
            endX: seg.ex,
            endY: seg.ey,
            w: 3,
            h: 1,
            speed,
            mode: mType,
            terrain: 'MOVABLE',
          });
          if (mType === 'FINISH_STOP') {
            addOneWayDeck(b, Math.floor(seg.ex), seg.sy, 8, 'PLATFORM');
          }
          wp.hop(seg.sx + 1.5, seg.sy + 1.6);
          wp.walk(seg.ex + 1.5, seg.ey + 1.6);
          if (s === 0) wp.ledge(17.0, 15.8, baseY + 1);
          if (s === 1) wp.ledge(5.0, 3.8, baseY + 2);
        }
        wp.ledge(-7.0, -7.0, baseY + 3);
        addOneWayDeck(b, -7, baseY + 5, 5, 'PLATFORM');
        wp.ledge(-6.0, -6.0, baseY + 5);
      }
    } else if (tier === 6) {
      // Tier 6 (Y = 154, Going Right): 2-Cart Baby Seal Rescue Cove!
      addDeck(b, -10, baseY, 10, 'DIRT', 1);
      b.addCollectible({
        id: 'seal_mines_rescue',
        kind: 'seal',
        x: -7.5,
        y: baseY + 1.0,
        label: 'Stranded Baby Seal',
        zone: 'mines',
      });
      b.addSign({
        x: -3.5,
        y: baseY,
        title: 'Baby Seal Cove',
        text: 'A lost arctic baby seal! Walk close to rescue it before riding the pulley carts.',
      });
      b.addMovable({
        id: `minecart_${cartIdx++}`,
        startX: 0.5,
        startY: baseY - 1,
        endX: 9.5,
        endY: baseY + 1,
        w: 3,
        h: 1,
        speed: 3.1,
        mode: modes[0],
        terrain: 'MOVABLE',
      });
      addDeck(b, 13, baseY + 2, 4, 'DIRT', 1);
      b.addMovable({
        id: `minecart_${cartIdx++}`,
        startX: 17.5,
        startY: baseY + 1,
        endX: 24.5,
        endY: baseY + 2,
        w: 3,
        h: 1,
        speed: 3.1,
        mode: modes[1],
        terrain: 'MOVABLE',
      });
      addDeck(b, 28, baseY + 3, 4, 'DIRT', 1);
      addOneWayDeck(b, 25, baseY + 5, 5, 'PLATFORM');

      wp.ledge(-7.0, -0.8, baseY);
      wp.hop(2.0, baseY + 0.6);
      wp.walk(11.0, baseY + 2.6);
      wp.ledge(14.0, 16.2, baseY + 2);
      wp.hop(19.0, baseY + 2.6);
      wp.walk(26.0, baseY + 3.6);
      wp.ledge(29.0, 29.0, baseY + 3);
      wp.ledge(28.0, 28.0, baseY + 5);
    } else {
      // Tier 13 (Y = 203, Going Left): 2-Cart Deep Finale
      addDeck(b, 27, baseY, 5, 'DIRT', 1);
      b.addMovable({
        id: `minecart_${cartIdx++}`,
        startX: 23.5,
        startY: baseY - 1,
        endX: 14.5,
        endY: baseY + 1,
        w: 3,
        h: 1,
        speed: 3.3,
        mode: modes[0],
        terrain: 'MOVABLE',
      });
      addDeck(b, 10, baseY + 2, 4, 'DIRT', 1);
      b.addMovable({
        id: `minecart_${cartIdx++}`,
        startX: 6.5,
        startY: baseY + 1,
        endX: -2.5,
        endY: baseY + 2,
        w: 3,
        h: 1,
        speed: 3.3,
        mode: modes[1],
        terrain: 'MOVABLE',
      });
      addDeck(b, -10, baseY + 3, 7, 'DIRT', 1);

      wp.ledge(29.0, 27.8, baseY);
      wp.hop(25.0, baseY + 0.6);
      wp.walk(16.0, baseY + 2.6);
      wp.ledge(13.0, 10.8, baseY + 2);
      wp.hop(8.0, baseY + 2.6);
      wp.walk(-1.0, baseY + 3.6);
      wp.ledge(-4.0, -5.0, baseY + 3);
    }

    if (tier === 1) {
      addOneWayDeck(b, 14, baseY + 3, 5, 'PLATFORM');
      b.addCollectible({
        id: 'Photo4',
        kind: 'photo',
        x: 16.5,
        y: baseY + 4.0,
        label: 'First Big Swing',
        zone: 'mines',
      });
    } else if (tier === 3) {
      b.addCollectible({
        id: 'npc_mole_2',
        kind: 'npc',
        x: -8.5,
        y: baseY + 4.0,
        label: 'Tunneler Pip',
        zone: 'mines',
      });
      b.addSign({
        x: -7.0,
        y: baseY + 3,
        title: 'Tunneler Pip',
        text: 'Start-Stop lifts ride up while you stand on them and glide back once you hop off!',
      });
    } else if (tier === 8) {
      addOneWayDeck(b, 15, baseY + 4, 5, 'PLATFORM');
      b.addCollectible({
        id: 'Photo5',
        kind: 'photo',
        x: 17.5,
        y: baseY + 5.0,
        label: 'Lantern Trestle',
        zone: 'mines',
      });
    } else if (tier === 10) {
      b.addCollectible({
        id: 'npc_mole_3',
        kind: 'npc',
        x: 30.5,
        y: baseY + 4.0,
        label: 'Lantern Keeper Gus',
        zone: 'mines',
      });
      b.addSign({
        x: 29.0,
        y: baseY + 3,
        title: 'Lantern Keeper Gus',
        text: 'Almost out of the dark shaft! Cold alpine winds whistle just above 217m.',
      });
    }
  }

  // --- 2D. Mines Exit Stairway & Polaroid Photo6 (Y: 206..217) ---
  addOneWayDeck(b, -6, 208, 6, 'PLATFORM'); // X: -6..0, topY = 208
  addDeck(b, 0, 210, 6, 'DIRT', 1); // X: 0..6, topY = 210
  addDeck(b, 8, 211, 5, 'DIRT', 1); // Crystal Ore Alcove for Photo6
  b.addCollectible({
    id: 'Photo6',
    kind: 'photo',
    x: 10.5,
    y: 212.0,
    label: 'Deep Shaft Seal',
    zone: 'mines',
  });
  addOneWayDeck(b, -2, 212, 6, 'PLATFORM'); // X: -2..4, topY = 212
  addDeck(b, -7, 214, 6, 'DIRT', 1); // X: -7..-1, topY = 214
  addOneWayDeck(b, -10, 215, 4, 'PLATFORM'); // X: -10..-6, topY = 215 (clear of Y=217 plateau!)
  addDeck(b, -6, 217, 13, 'SNOW', 1); // Mines Exit Plateau (topY = 217)

  wp.ledge(-3.5, -1.0, 208);
  wp.ledge(1.0, 2.5, 210);
  wp.ledge(1.5, -1.0, 212);
  wp.ledge(-2.5, -6.0, 214);
  wp.ledge(-7.5, -7.0, 215);
  wp.ledge(-5.0, -4.5, 217);

  // ==========================================================================
  // 3. ZONE 3: WINDY CRAGS (Y: 217..395)
  //    - 8 Cyclic WindZones (activeTime: 5.0, waitTime: 5.0, constant: false)
  //    - EXACT 8 Wind-driven SwingPlatforms (radius 12.12..12.5, maxDisp 8.43..9.78, swingTime 1.0..1.5)
  //    - EXACT 127 Crumbling FallingBlocks across 8 alpine crag bands!
  // ==========================================================================

  // West-side stairs strictly clear of Band 0 safety floor (X: 2..21, topY = 222)
  addDeck(b, -10, 219, 6, 'SNOW', 1); // X: -10..-4, topY = 219
  addDeck(b, -6, 221, 6, 'SNOW', 1); // X: -6..0, topY = 221
  addDeck(b, -10, 223, 6, 'SNOW', 1); // X: -10..-4, topY = 223

  wp.ledge(-6.5, -6.5, 219);
  wp.ledge(-4.5, -4.5, 221);
  wp.ledge(-6.0, -5.5, 223);

  interface CragBandSpec {
    bandY: number;
    windMinY: number;
    windMaxY: number;
    dir: 1 | -1;
    radius: number;
    maxDisp: number;
    swingTime: number;
    runBBlocks: number;
  }

  // 8 Bands covering Y = 225..393 -> EXACTLY 127 FallingBlocks in Zone 3!
  const cragBands: readonly CragBandSpec[] = [
    { bandY: 225, windMinY: 218, windMaxY: 245, dir: 1, radius: 12.15, maxDisp: 8.5, swingTime: 1.1, runBBlocks: 8 },
    { bandY: 246, windMinY: 246, windMaxY: 266, dir: -1, radius: 12.22, maxDisp: 8.75, swingTime: 1.2, runBBlocks: 8 },
    { bandY: 267, windMinY: 267, windMaxY: 287, dir: 1, radius: 12.28, maxDisp: 9.0, swingTime: 1.3, runBBlocks: 8 },
    { bandY: 288, windMinY: 288, windMaxY: 308, dir: -1, radius: 12.34, maxDisp: 9.2, swingTime: 1.4, runBBlocks: 8 },
    { bandY: 309, windMinY: 309, windMaxY: 329, dir: 1, radius: 12.4, maxDisp: 9.4, swingTime: 1.25, runBBlocks: 8 },
    { bandY: 330, windMinY: 330, windMaxY: 350, dir: -1, radius: 12.44, maxDisp: 9.55, swingTime: 1.35, runBBlocks: 8 },
    { bandY: 351, windMinY: 351, windMaxY: 371, dir: 1, radius: 12.48, maxDisp: 9.68, swingTime: 1.15, runBBlocks: 8 },
    { bandY: 372, windMinY: 372, windMaxY: 395, dir: -1, radius: 12.5, maxDisp: 9.75, swingTime: 1.45, runBBlocks: 7 },
  ];

  let cragFbIdx = 1;
  for (let i = 0; i < cragBands.length; i++) {
    const band = cragBands[i];
    const { bandY, dir, radius, maxDisp, swingTime } = band;

    b.addWindZone({
      id: `wind_crags_${i + 1}`,
      minX: -24,
      maxX: 38,
      minY: band.windMinY,
      maxY: band.windMaxY,
      dir,
      activeTime: PHYSICS.WIND_ACTIVE_TIME,
      waitTime: PHYSICS.WIND_WAIT_TIME,
      constant: false,
      strength: 1.0,
    });

    const swingW = 4.0;
    const pivotX = dir === 1 ? 6.5 : 16.5;
    const restTopY = bandY + 0.5;
    const pivotY = restTopY + radius;
    const peakCos = Math.sqrt(Math.max(0.05, 1 - (maxDisp / radius) * (maxDisp / radius)));
    const peakTopY = pivotY - radius * peakCos;
    const targetTopY = Math.floor(peakTopY);

    b.addSwingPlatform({
      id: `swing_crags_${i + 1}`,
      pivotX,
      pivotY,
      w: swingW,
      h: 1.0,
      radius,
      maxDisplacement: maxDisp,
      swingTime,
      windDriven: true,
    });

    // Solid safety ledge beneath Band 0 swing chasm (for i >= 1, prior band Run B serves as recovery floor)
    if (i === 0) {
      addDeck(b, 2, bandY - 3, 19, 'SNOW', 1);
    }

    if (dir === 1) {
      addDeck(b, -6, bandY, 9, 'SNOW', 1); // Launch Deck X: -6..3
      const targetLeftX = Math.ceil(pivotX + maxDisp + swingW * 0.5 + 0.6);
      addDeck(b, targetLeftX, targetTopY, 29 - targetLeftX, 'SNOW', 1);

      if (i === 0) {
        b.addSign({
          x: 1.0,
          y: bandY,
          title: 'Windy Crags - 225m',
          text: 'Gales blow 5s on, 5s off! Step onto the hanging cradle and ride the gust across.',
        });
        b.addCollectible({
          id: 'Wind',
          kind: 'manual',
          x: -4.0,
          y: bandY + 1.0,
          label: 'Gale Cycles & Swing Cradles',
          zone: 'crags',
        });
      }

      wp.ledge(-3.5, 2.2, bandY);
      wp.hop(pivotX - 1.5, restTopY + 0.6); // Step cleanly onto near edge of 4u cradle
      const maxAngle = Math.asin(maxDisp / radius);
      for (let s = 0; s <= 4; s++) {
        const ang = (s / 4) * maxAngle;
        const ax = pivotX + Math.sin(ang) * radius;
        const ay = pivotY - Math.cos(ang) * radius + 0.6;
        wp.hop(ax, ay);
      }
      const peakX = pivotX + maxDisp;
      wp.hop(peakX + 1.5, peakTopY + 0.6); // Far edge of 4u cradle at peak wind
      wp.ledge(targetLeftX + 1.2, 27.5, targetTopY);

      // Step cleanly up East cliff from targetTopY to bandY + 9 with zero ceiling clips
      let curY = targetTopY;
      while (curY + 2 <= bandY + 7) {
        curY += 2;
        addDeck(b, 27, curY, 6, 'SNOW', 1);
        wp.ledge(29.5, 29.5, curY);
      }
      if (bandY + 9 - curY > 2) {
        addDeck(b, 30, bandY + 8, 4, 'SNOW', 1);
        wp.ledge(31.5, 31.0, bandY + 8);
      }
      addDeck(b, 26, bandY + 9, 4, 'SNOW', 1);
      wp.ledge(28.5, 26.8, bandY + 9);

      // Run A (Right -> Left, 8 crumbling blocks: 4 + mid-island + 4)
      const runAY = bandY + 9;
      const runAXs = [23, 20, 17, 14, 5, 2, -1, -4];
      addDeck(b, 8, runAY + 1, 5, 'SNOW', 1);
      for (let k = 0; k < runAXs.length; k++) {
        const bx = runAXs[k];
        const byTop = k < 4 ? runAY + (k >= 2 ? 1 : 0) : runAY + 1 + (k >= 6 ? 1 : 0);
        b.addFallingBlock({ id: `fb_crags_${cragFbIdx++}`, x: bx, y: byTop - 1, w: 2, h: 1, terrain: 'SNOW' });
        wp.hop(bx + 1.0, byTop + 0.6);
        if (k === 3) wp.ledge(12.0, 9.0, runAY + 1);
      }
      addDeck(b, -10, runAY + 2, 5, 'SNOW', 1);
      addDeck(b, -10, runAY + 4, 5, 'SNOW', 1);
      addDeck(b, -9, bandY + 15, 5, 'SNOW', 1);
      wp.ledge(-6.5, -7.5, runAY + 2);
      wp.ledge(-7.5, -7.5, runAY + 4);
      wp.ledge(-7.0, -4.8, bandY + 15);

      // Run B (Left -> Right, 8 crumbling blocks: 4 + mid-island + 4)
      const runBY = bandY + 15;
      const runBXs = [-3, 0, 3, 6, 15, 18, 21, 24];
      addDeck(b, 9, runBY + 1, 5, 'SNOW', 1);
      for (let k = 0; k < runBXs.length; k++) {
        const bx = runBXs[k];
        const byTop = k < 4 ? runBY + (k >= 2 ? 1 : 0) : runBY + 1 + (k >= 6 ? 1 : 0);
        b.addFallingBlock({ id: `fb_crags_${cragFbIdx++}`, x: bx, y: byTop - 1, w: 2, h: 1, terrain: 'SNOW' });
        wp.hop(bx + 1.0, byTop + 0.6);
        if (k === 3) wp.ledge(10.0, 13.0, runBY + 1);
      }
      addDeck(b, 27, runBY + 2, 5, 'SNOW', 1);
      addDeck(b, 26, runBY + 4, 6, 'SNOW', 1);
      wp.ledge(28.0, 29.0, runBY + 2);
      wp.ledge(28.5, 27.5, runBY + 4);
    } else {
      addDeck(b, 20, bandY, 10, 'SNOW', 1); // Launch Deck X: 20..30
      const targetRightX = Math.floor(pivotX - maxDisp - swingW * 0.5 - 0.6);
      addDeck(b, -7, targetTopY, targetRightX + 7, 'SNOW', 1);

      wp.ledge(26.0, 20.8, bandY);
      wp.hop(pivotX + 1.5, restTopY + 0.6); // Near edge of 4u cradle
      const maxAngle = Math.asin(maxDisp / radius);
      for (let s = 0; s <= 4; s++) {
        const ang = -(s / 4) * maxAngle;
        const ax = pivotX + Math.sin(ang) * radius;
        const ay = pivotY - Math.cos(ang) * radius + 0.6;
        wp.hop(ax, ay);
      }
      const peakX = pivotX - maxDisp;
      wp.hop(peakX - 1.5, peakTopY + 0.6); // Far edge of 4u cradle at peak wind
      wp.ledge(targetRightX - 1.2, -5.5, targetTopY);

      // Step cleanly up West cliff from targetTopY to bandY + 9 with zero ceiling clips
      let curY = targetTopY;
      while (curY + 2 <= bandY + 7) {
        curY += 2;
        addDeck(b, -11, curY, 6, 'SNOW', 1);
        wp.ledge(-7.5, -7.5, curY);
      }
      if (bandY + 9 - curY > 2) {
        addDeck(b, -12, bandY + 8, 4, 'SNOW', 1);
        wp.ledge(-9.5, -9.0, bandY + 8);
      }
      addDeck(b, -8, bandY + 9, 4, 'SNOW', 1);
      wp.ledge(-6.5, -4.8, bandY + 9);

      // Run A (Left -> Right, 8 crumbling blocks)
      const runAY = bandY + 9;
      const runAXs = [-3, 0, 3, 6, 15, 18, 21, 24];
      addDeck(b, 9, runAY + 1, 5, 'SNOW', 1);
      for (let k = 0; k < runAXs.length; k++) {
        const bx = runAXs[k];
        const byTop = k < 4 ? runAY + (k >= 2 ? 1 : 0) : runAY + 1 + (k >= 6 ? 1 : 0);
        b.addFallingBlock({ id: `fb_crags_${cragFbIdx++}`, x: bx, y: byTop - 1, w: 2, h: 1, terrain: 'SNOW' });
        wp.hop(bx + 1.0, byTop + 0.6);
        if (k === 3) wp.ledge(10.0, 13.0, runAY + 1);
      }
      addDeck(b, 27, runAY + 2, 5, 'SNOW', 1);
      addDeck(b, 27, runAY + 4, 5, 'SNOW', 1);
      addDeck(b, 26, bandY + 15, 6, 'SNOW', 1);
      wp.ledge(28.0, 29.0, runAY + 2);
      wp.ledge(29.0, 29.0, runAY + 4);
      wp.ledge(28.5, 26.8, bandY + 15);

      // Run B (Right -> Left, 8 blocks on bands 1,3,5; 7 blocks on final band 7 -> 127 total!)
      const runBY = bandY + 15;
      const isSeven = band.runBBlocks === 7;
      const runBXs = isSeven ? [23, 20, 17, 14, 2, -1, -4] : [23, 20, 17, 14, 5, 2, -1, -4];
      addDeck(b, isSeven ? 5 : 8, runBY + 1, isSeven ? 8 : 5, 'SNOW', 1);
      for (let k = 0; k < runBXs.length; k++) {
        const bx = runBXs[k];
        const byTop = k < 4 ? runBY + (k >= 2 ? 1 : 0) : runBY + 1 + (k >= 5 ? 1 : 0);
        b.addFallingBlock({ id: `fb_crags_${cragFbIdx++}`, x: bx, y: byTop - 1, w: 2, h: 1, terrain: 'SNOW' });
        wp.hop(bx + 1.0, byTop + 0.6);
        if (k === 3) wp.ledge(12.0, isSeven ? 6.0 : 9.0, runBY + 1);
      }
      addDeck(b, -10, runBY + 2, 5, 'SNOW', 1);
      addDeck(b, -9, runBY + 4, 6, 'SNOW', 1);
      wp.ledge(-6.5, -7.5, runBY + 2);
      wp.ledge(-7.0, -5.0, runBY + 4);
    }

    if (i === 1) {
      b.addCollectible({
        id: 'Photo7',
        kind: 'photo',
        x: 11.5,
        y: bandY + 11.0,
        label: 'Gale Watchtower',
        zone: 'crags',
      });
    } else if (i === 3) {
      b.addCollectible({
        id: 'Assist',
        kind: 'manual',
        x: 11.5,
        y: bandY + 11.0,
        label: 'Rope Pull & Charlie Checkpoints',
        zone: 'crags',
      });
      b.addSign({
        x: 10.0,
        y: bandY + 10,
        title: 'Checkpoint Refuge',
        text: 'Need a safety net? Enable Flag & Charlie or Rope Pull anytime in the Assist Menu.',
      });
    } else if (i === 4) {
      b.addCollectible({
        id: 'Photo8',
        kind: 'photo',
        x: 11.5,
        y: bandY + 17.0,
        label: 'Suspended Cradle',
        zone: 'crags',
      });
    } else if (i === 7) {
      b.addCollectible({
        id: 'Photo9',
        kind: 'photo',
        x: 9.0,
        y: bandY + 17.0,
        label: 'Mirror Glacier',
        zone: 'crags',
      });
    }
  }

  // Final Crags -> Frozen Summit Gate step (393 -> 395)
  addDeck(b, -6, 393, 9, 'SNOW', 1);
  addDeck(b, 0, 395, 11, 'SNOW', 1);
  wp.ledge(-4.0, 1.0, 393);
  wp.ledge(2.0, 9.5, 395);

  // ==========================================================================
  // 4. ZONE 4: FROZEN SUMMIT & PEAK (Y: 395..498)
  //    - Constant Peak WindZone (waitTime: 0, constant: true)
  //    - Slick ICE ledges & non-grabbable ICE cliff walls
  //    - Manual Page (Ice), Polaroids (Photo10, Photo11, Photo12)
  //    - Grand Summit Flag & Celebration Plateau at Y = 498!
  // ==========================================================================

  b.addWindZone({
    id: 'wind_summit_peak',
    minX: -24,
    maxX: 38,
    minY: 396,
    maxY: 512,
    dir: 1,
    activeTime: 10.0,
    waitTime: 0,
    constant: true,
    strength: 0.78,
  });

  b.addSign({
    x: 4.5,
    y: 395.0,
    title: 'Frozen Summit - 395m',
    text: 'Constant summit gales and non-grabbable glacier walls! Use snow stops to anchor.',
  });

  // --- 4A. Glacier Gate & First Non-Grabbable ICE Monolith (Y: 395..419) ---
  addDeck(b, 10, 397, 7, 'ICE', 1); // X: 10..17
  addDeck(b, 17, 399, 5, 'SNOW', 2); // X: 17..22
  addDeck(b, 12, 401, 6, 'ICE', 1); // X: 12..18
  addDeck(b, 18, 402, 5, 'SNOW', 1); // Snow alcove for Manual Page: Ice
  b.addCollectible({
    id: 'Ice',
    kind: 'manual',
    x: 20.5,
    y: 403.0,
    label: 'Glacier Ice Momentum',
    zone: 'summit',
  });

  // Towering non-grabbable vertical ICE cliff wall (X: 23..26, Y: 401..417)
  b.fillIce(23, 401, 3, 16);

  addDeck(b, 6, 403, 6, 'ICE', 1); // X: 6..12
  addDeck(b, 1, 405, 5, 'SNOW', 1); // X: 1..6
  addDeck(b, 6, 407, 7, 'ICE', 1); // X: 6..13
  addDeck(b, 13, 409, 6, 'SNOW', 1); // X: 13..19
  addDeck(b, 8, 411, 6, 'ICE', 1); // X: 8..14
  addDeck(b, 2, 413, 6, 'SNOW', 1); // X: 2..8
  addDeck(b, 8, 415, 7, 'ICE', 1); // X: 8..15
  addDeck(b, 15, 417, 7, 'SNOW', 1); // X: 15..22
  addDeck(b, 20, 419, 7, 'SNOW', 1); // Clears top of ICE monolith!

  wp.ledge(11.0, 16.0, 397);
  wp.ledge(18.0, 18.0, 399);
  wp.ledge(16.5, 13.0, 401);
  wp.ledge(11.0, 7.0, 403);
  wp.ledge(5.0, 4.5, 405);
  wp.ledge(7.0, 12.0, 407);
  wp.ledge(14.0, 14.5, 409);
  wp.ledge(13.0, 9.0, 411);
  wp.ledge(7.0, 6.5, 413);
  wp.ledge(9.0, 14.0, 415);
  wp.ledge(16.0, 20.0, 417);
  wp.ledge(21.0, 21.0, 419);

  // --- 4B. Mirror Glacier Slopes & Polaroid Photo10 (Y: 419..445) ---
  addDeck(b, 14, 421, 6, 'ICE', 1);
  addDeck(b, 8, 423, 6, 'SNOW', 1);
  // Glacial Ice Slope rising right-to-left (Y: 423 -> 425)
  b.addSlope({ id: 'slope_summit_1', x: 4, y: 423, w: 4, h: 2, dir: 'left', terrain: 'ICE' });
  b.fillIce(4, 422, 4, 1);
  addDeck(b, -3, 425, 7, 'SNOW', 1);
  b.fillIce(-6, 424, 2, 16); // Non-grabbable west glacier spire

  addDeck(b, 3, 427, 7, 'ICE', 1);
  addDeck(b, 10, 429, 7, 'SNOW', 1);
  addDeck(b, 18, 430, 6, 'ICE', 1);
  addDeck(b, 24, 431, 3, 'SNOW', 2);
  b.addCollectible({
    id: 'Photo10',
    kind: 'photo',
    x: 21.0,
    y: 431.0,
    label: 'Above the Clouds',
    zone: 'summit',
  });

  addDeck(b, 5, 431, 6, 'ICE', 1);
  addDeck(b, 0, 433, 5, 'SNOW', 1);
  addDeck(b, 5, 435, 7, 'ICE', 1);
  b.addSlope({ id: 'slope_summit_2', x: 12, y: 435, w: 4, h: 2, dir: 'right', terrain: 'SNOW' });
  b.fillRect(12, 434, 4, 1, 'SNOW');
  addDeck(b, 16, 437, 7, 'SNOW', 1);
  addDeck(b, 11, 439, 6, 'ICE', 1);
  addDeck(b, 5, 441, 6, 'SNOW', 1);
  addDeck(b, 0, 443, 11, 'ICE', 1); // Extends cleanly to chimney mouth X=8..11
  addDeck(b, 8, 445, 5, 'SNOW', 1); // Chimney entry floor strictly inside mouth X: 8..13

  wp.ledge(19.0, 15.0, 421);
  wp.ledge(13.0, 8.5, 423);
  wp.hop(7.5, 423.8);
  wp.walk(4.5, 425.6);
  wp.ledge(3.0, 2.5, 425);
  wp.ledge(4.0, 9.0, 427);
  wp.ledge(11.0, 11.5, 429);
  wp.ledge(10.0, 6.0, 431);
  wp.ledge(4.0, 4.0, 433);
  wp.ledge(6.0, 11.5, 435);
  wp.hop(12.5, 435.8);
  wp.walk(15.5, 437.6);
  wp.ledge(17.0, 17.5, 437);
  wp.ledge(16.0, 12.0, 439);
  wp.ledge(10.0, 6.0, 441);
  wp.ledge(5.0, 9.5, 443);
  wp.ledge(10.0, 10.0, 445);

  // --- 4C. Frostbite Half-Ice Chimney & Polaroid Photo11 (Y: 445..467) ---
  b.fillRect(5, 445, 3, 18, 'SNOW'); // Grabbable left snow cliff
  b.fillIce(12, 445, 3, 18); // Non-grabbable right glacier wall
  for (let rungY = 447; rungY <= 461; rungY += 2) {
    // Parity places top rung (461) on right (rx=10) directly adjacent to east exit deck X=12!
    const onRight = ((rungY - 447) / 2) % 2 === 1;
    const rx = onRight ? 10 : 8;
    addOneWayDeck(b, rx, rungY, 2, 'PLATFORM');
    wp.hop(rx + 1.0, rungY + 0.6);
  }
  addDeck(b, 12, 463, 7, 'SNOW', 1);
  addDeck(b, 19, 465, 6, 'SNOW', 1);
  b.addCollectible({
    id: 'Photo11',
    kind: 'photo',
    x: 22.0,
    y: 466.0,
    label: 'Piston Blueprint',
    zone: 'summit',
  });
  addDeck(b, 13, 467, 6, 'ICE', 1);

  wp.ledge(13.0, 18.0, 463);
  wp.ledge(20.0, 20.0, 465);
  wp.ledge(18.0, 14.0, 467);

  // --- 4D. Final Tempest Ridge to Summit Staging Terrace (Y: 467..492) ---
  const finalSteps: ReadonlyArray<{
    x: number;
    topY: number;
    w: number;
    terrain: TerrainType;
    inX: number;
    outX: number;
  }> = [
    { x: 7, topY: 469, w: 6, terrain: 'SNOW', inX: 12.0, outX: 8.0 },
    { x: 1, topY: 471, w: 6, terrain: 'ICE', inX: 6.0, outX: 2.0 },
    { x: -3, topY: 473, w: 5, terrain: 'SNOW', inX: 1.0, outX: 1.0 },
    { x: 2, topY: 475, w: 7, terrain: 'ICE', inX: 3.0, outX: 8.0 },
    { x: 9, topY: 477, w: 6, terrain: 'SNOW', inX: 10.0, outX: 14.0 },
    { x: 15, topY: 479, w: 7, terrain: 'ICE', inX: 16.0, outX: 20.5 },
    { x: 21, topY: 481, w: 5, terrain: 'SNOW', inX: 22.0, outX: 21.8 },
    { x: 15, topY: 483, w: 6, terrain: 'ICE', inX: 20.0, outX: 16.0 },
    { x: 9, topY: 485, w: 6, terrain: 'SNOW', inX: 14.0, outX: 10.0 },
    { x: 3, topY: 487, w: 6, terrain: 'ICE', inX: 8.0, outX: 4.0 },
    { x: 1, topY: 489, w: 5, terrain: 'SNOW', inX: 3.0, outX: 2.0 },
    { x: -5, topY: 491, w: 6, terrain: 'ICE', inX: 0.0, outX: 0.2 },
  ];
  b.fillIce(26, 478, 3, 12);

  for (let s = 0; s < finalSteps.length; s++) {
    const st = finalSteps[s];
    addDeck(b, st.x, st.topY, st.w, st.terrain, 1);
    wp.ledge(st.inX, st.outX, st.topY);
  }

  // Wide Summit Warp Staging Terrace right below the 498 u Peak Flag (topY = 492, X: 1..12)
  addDeck(b, 1, 492, 11, 'SNOW', 1);
  b.addSign({
    x: 9.5,
    y: 492.0,
    title: 'Summit Approach - 492m',
    text: 'The Peak Banner flies just above! Three final snow ledges to 498m Victory!',
  });

  // Western Crystal Balcony with final Polaroid Photo12
  addDeck(b, -5, 494, 5, 'SNOW', 1);
  b.addCollectible({
    id: 'Photo12',
    kind: 'photo',
    x: -2.5,
    y: 495.0,
    label: 'Victory Over Bachicha',
    zone: 'summit',
  });

  wp.ledge(2.0, 11.2, 492);

  // --- 4E. Grand Summit Flag & Celebration Plateau (Y = 498) ---
  addDeck(b, 12, 494, 5, 'SNOW', 1); // Step 1 (topY = 494)
  addDeck(b, 18, 496, 5, 'SNOW', 1); // Step 2 (topY = 496, strictly clear of 4..18 plateau!)
  b.fillRect(4, 496, 14, 2, 'SNOW'); // Grand Celebration Plateau (topY = 498, X: 4..18)
  b.fillIce(2, 496, 2, 4);
  b.fillIce(23, 496, 2, 3);

  b.setSummitZone(8, WORLD.COOP_SUMMIT_Y, 6, 4, WORLD.COOP_SUMMIT_Y);
  b.addSign({
    x: 15.5,
    y: 498.0,
    title: 'Mount Krunked Peak - 498m',
    text: 'Bravo Krunked & Fred! You conquered the Foothills, Dark Mines, Windy Crags, and Glacier Peak!',
  });

  wp.ledge(13.0, 16.5, 494);
  wp.ledge(19.0, 19.0, 496);
  wp.ledge(17.0, 11.0, 498);

  b.addWaypoints(wp.points);
  return b.build();
}
