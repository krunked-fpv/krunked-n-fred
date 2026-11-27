import {
  PHYSICS,
  WORLD,
  type BiomeId,
  type LevelData,
  type MovablePlatformType,
  type TerrainType,
  type Vec2,
} from '../contracts';
import { LevelBuilder } from './tileBuilder';

/**
 * Guaranteed-grounded zone warp coordinates (Y-UP tiles) for Solo Jeff Mountain (0..497 u).
 * Each target sits 0.6 u above a wide flat solid deck with open headroom so warpPlayers
 * places both P1 and Jeff the Rock cleanly grounded without rolling off.
 */
export const SOLO_ZONE_WARPS: Record<BiomeId, Vec2> = {
  village: { x: 0.0, y: 1.6 },
  foothills: { x: 6.0, y: 20.6 },
  mines: { x: 8.5, y: 104.6 },
  crags: { x: 23.0, y: 225.6 },
  summit: { x: 10.5, y: 491.6 },
  lab: { x: -16.5, y: 3.6 },
  boss: { x: 10.5, y: 491.6 },
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
 * Builds the complete Solo Jeff Mountain (0..497 u) tailored for carrying, tossing,
 * anchoring, wall-clinging, and pendulum-swinging alongside Jeff the Rock:
 *  - Village Hub (Y = 0, X: -22..6) with Jeff tutorial & all 6 hub signs
 *  - Zone 1: Snowy Foothills (0..91 u) - Jeff-toss anchor perches, western chimney, ice bowls
 *  - Zone 2: Dark Mines (91..217 u) - darkZone (103..217), wide Jeff-friendly movable minecarts
 *    exercising all 5 MovablePlatformTypes, Seal rescue, 3 Mole NPCs
 *  - Zone 3: Windy Crags (217..395 u) - 8 cyclic WindZones, 8 wind-driven SwingPlatforms,
 *    crumbling FallingBlock sprints with frequent Jeff-drop snow rest pads
 *  - Zone 4: Frozen Summit & Peak (395..497 u) - slick ICE ledges with snow backstops for Jeff
 *    anchoring, non-grabbable ICE cliffs, constant Peak WindZone, and Summit Plateau at Y = 497!
 */
export function buildSoloJeffLevel(): LevelData {
  const b = new LevelBuilder({
    id: 'solo_jeff_mountain',
    name: 'Mount Krunked - Solo Jeff Ascent',
    mode: 'solo_jeff',
    summitY: WORLD.SOLO_SUMMIT_Y,
    bounds: { minX: -24, maxX: 38, minY: -2, maxY: 511 },
  });

  // Spawn Krunked (P1) & Jeff the Rock (spawnP2) in Village Hub above snow ground (topY = 1.0)
  b.setSpawn({ x: 0, y: 1.6 }, { x: 1.5, y: 1.6 });
  const wp = createWaypointTape(0, 1.6);

  // ==========================================================================
  // 0. VILLAGE HUB (Y: 0..6, X: -22..6)
  // ==========================================================================
  b.fillRect(-22, -2, 48, 3, 'SNOW'); // Wide village ground, topY = 1.0
  b.fillRect(-22, 1, 2, 16, 'SNOW'); // West boundary cliff
  b.fillRect(25, 1, 3, 22, 'SNOW'); // East boundary cliff

  b.fillRect(-19, 1, 6, 2, 'BELL_HOUSE');
  addOneWayDeck(b, -20, 6, 8, 'WORKSHOP');

  // All 6 Hub Signs + Solo Jeff Tutorial Sign (pure ASCII only)
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
    text: 'Equip 6 Jeff Skins, 16 Penguin Skins, and 12 Rope Skins in the Skin Closet.',
  });
  b.addSign({
    x: -14.2,
    y: 3.0,
    title: 'Jukebox',
    text: 'Choose from 11 Alpine, Cavern, and Synth tracks in the Jukebox!',
  });
  b.addSign({
    x: -7.5,
    y: 1.0,
    title: 'Album',
    text: 'Polaroid Album - Snap all 12 Polaroids hidden along the Solo Jeff route.',
  });
  b.addSign({
    x: -4.5,
    y: 1.0,
    title: 'Manual',
    text: 'Climber Manual - Collect all 7 pages covering Swing, Grab, Mines, Ice, and Wind.',
  });
  b.addSign({
    x: -2.0,
    y: 1.0,
    title: 'Time Trials',
    text: 'Test your speed across 10 Time Trials (TT1-TT10) for Platinum medals!',
  });
  b.addSign({
    x: 3.5,
    y: 1.0,
    title: 'Meet Jeff the Rock',
    text: 'Hold Grab near Jeff to carry him; release to toss! Grounded Jeff anchors your swing.',
  });

  // ==========================================================================
  // 1. ZONE 1: SNOWY FOOTHILLS (Y: 0..91) - Tuned for Carrying & Tossing Jeff!
  // ==========================================================================

  // --- 1A. Warmup Jeff-Carry Ledges, Slopes & Toss Perches (Y: 1..20) ---
  addDeck(b, 6, 3, 6, 'SNOW', 2); // X: 6..12, topY = 3
  addDeck(b, 12, 5, 6, 'SNOW', 2); // X: 12..18, topY = 5
  b.addSlope({ id: 'slope_solo_1', x: 18, y: 5, w: 4, h: 2, dir: 'right', terrain: 'SNOW' });
  b.fillRect(18, 4, 4, 1, 'SNOW');
  addDeck(b, 22, 7, 3, 'SNOW', 2); // X: 22..25, topY = 7
  addOneWayDeck(b, 16, 9, 6, 'PLATFORM'); // X: 16..22, topY = 9
  addDeck(b, 10, 11, 6, 'SNOW', 1); // X: 10..16, topY = 11

  // Eastern Scenic Perch for Manual Page: Emotes
  addDeck(b, 17, 13, 6, 'SNOW', 1); // X: 17..23, topY = 13
  b.addCollectible({
    id: 'Emotes',
    kind: 'manual',
    x: 20.5,
    y: 14.0,
    label: 'Claps & Rock-Paper-Scissors',
    zone: 'foothills',
  });

  addDeck(b, 4, 13, 6, 'SNOW', 1); // X: 4..10, topY = 13
  b.addSlope({ id: 'slope_solo_2', x: 0, y: 13, w: 4, h: 2, dir: 'left', terrain: 'SNOW' });
  b.fillRect(0, 12, 4, 1, 'SNOW');
  addDeck(b, -6, 15, 6, 'SNOW', 1); // X: -6..0, topY = 15
  addDeck(b, -11, 17, 5, 'SNOW', 1); // Side alcove for Photo1
  b.addCollectible({
    id: 'Photo1',
    kind: 'photo',
    x: -8.5,
    y: 18.0,
    label: 'Chimney Lookout',
    zone: 'foothills',
  });

  addOneWayDeck(b, -2, 17, 6, 'PLATFORM'); // X: -2..4, topY = 17
  addOneWayDeck(b, 3, 18, 5, 'PLATFORM'); // Approach directly beneath ONE_WAY chimney mouth X: 4..8!
  // Solo Foothills Warp & Chimney Mouth Deck (topY = 20, X: 4..8 ONE_WAY mouth between snow walls)
  addDeck(b, 1, 20, 3, 'SNOW', 1);
  addOneWayDeck(b, 4, 20, 4, 'PLATFORM');
  addDeck(b, 8, 20, 4, 'SNOW', 1);
  b.addSign({
    x: 6.0,
    y: 20.0,
    title: 'Jeff Wall Climb',
    text: 'Carry Jeff or set him on a rest ledge before wall-clinging up the western snow chimney!',
  });

  wp.walk(5.2, 1.6);
  wp.ledge(7.0, 11.2, 3);
  wp.ledge(13.0, 17.5, 5);
  wp.hop(18.5, 5.8);
  wp.walk(21.5, 7.6);
  wp.ledge(23.0, 22.8, 7);
  wp.ledge(21.0, 17.0, 9);
  wp.ledge(15.0, 11.0, 11);
  wp.ledge(9.0, 4.5, 13);
  wp.hop(3.5, 13.8);
  wp.walk(0.5, 15.6);
  wp.ledge(-1.0, -1.0, 15);
  wp.ledge(0.0, 3.0, 17);
  wp.ledge(4.5, 6.0, 18);
  wp.ledge(6.0, 6.0, 20);

  // --- 1B. Western Jeff-Friendly Wall-Cling Chimney (Y: 20..38) ---
  b.fillRect(1, 20, 3, 18, 'SNOW'); // Left cliff X: 1..4, topY = 38
  b.fillRect(8, 20, 4, 18, 'SNOW'); // Right cliff X: 8..12, topY = 38
  for (let rungY = 22; rungY <= 36; rungY += 2) {
    // Parity places top rung (36) on right (rx=6) directly adjacent to east exit deck X=8!
    const onRight = ((rungY - 22) / 2) % 2 === 1;
    const rx = onRight ? 6 : 4;
    addOneWayDeck(b, rx, rungY, 2, 'PLATFORM');
    wp.hop(rx + 1.0, rungY + 0.6);
  }
  addDeck(b, -3, 38, 7, 'SNOW', 1); // Left exit deck X: -3..4, topY = 38
  addDeck(b, 8, 38, 8, 'SNOW', 1); // Right crown X: 8..16, topY = 38
  b.addCollectible({
    id: 'Grab',
    kind: 'manual',
    x: 13.5,
    y: 39.0,
    label: 'Wall Cling & Stamina',
    zone: 'foothills',
  });
  addDeck(b, -9, 40, 5, 'SNOW', 1); // Western pine perch for Photo2
  b.addCollectible({
    id: 'Photo2',
    kind: 'photo',
    x: -6.5,
    y: 41.0,
    label: 'Minecart Crossing',
    zone: 'foothills',
  });

  wp.ledge(9.0, 15.0, 38);

  // --- 1C. Ice Bowls with Snow Backstops for Jeff Anchoring (Y: 38..54) ---
  addDeck(b, 16, 40, 6, 'ICE', 1);
  b.fillRect(22, 39, 3, 3, 'SNOW'); // Snow backstop X: 22..25, topY = 42
  addDeck(b, 15, 44, 6, 'ICE', 1);
  addDeck(b, 8, 46, 7, 'SNOW', 1);
  addDeck(b, 1, 48, 6, 'ICE', 1);
  b.fillRect(-2, 47, 3, 3, 'SNOW'); // Snow backstop X: -2..1, topY = 50
  addDeck(b, 2, 52, 7, 'SNOW', 1);
  addDeck(b, 4, 54, 19, 'SNOW', 1); // Wide recovery floor under Jeff Pendulum Chasm #1

  wp.ledge(17.0, 21.0, 40);
  wp.ledge(23.0, 22.8, 42);
  wp.ledge(20.0, 16.0, 44);
  wp.ledge(14.0, 9.0, 46);
  wp.ledge(6.5, 2.0, 48);
  wp.ledge(0.0, 0.2, 50);
  wp.ledge(3.0, 4.5, 52);
  wp.ledge(5.0, 5.0, 54);

  // --- 1D. Jeff-Anchored Pendulum Swing Chasm #1 (Y: 54..62) ---
  addDeck(b, 0, 56, 5, 'SNOW', 1);
  addDeck(b, -3, 58, 5, 'SNOW', 1);
  addDeck(b, 2, 60, 8, 'SNOW', 2); // Jeff Anchor Launch Ledge (X: 2..10, topY = 60)
  b.addSign({
    x: 6.5,
    y: 60.0,
    title: 'Jeff Pendulum Swing',
    text: 'Leave Jeff resting on the snow edge, drop below him, pump Left/Right, and launch across!',
  });

  addDeck(b, -4, 62, 5, 'SNOW', 1);
  b.addCollectible({
    id: 'Swing',
    kind: 'manual',
    x: -1.5,
    y: 63.0,
    label: 'Anchor & Pendulum Swing',
    zone: 'foothills',
  });

  b.fillRect(15, 57, 1, 2, 'SNOW');
  addDeck(b, 16, 60, 9, 'SNOW', 3); // Target Deck X: 16..25, topY = 60

  wp.ledge(3.5, 1.0, 56);
  wp.ledge(0.0, 1.0, 58);
  wp.ledge(3.0, 9.2, 60);
  wp.hop(12.5, 60.0); // Directly above Y = 54 recovery deck
  wp.ledge(16.0, 22.0, 60);

  // --- 1E. Jeff-Toss Staircase & Second Pendulum Chasm (Y: 60..76) ---
  addDeck(b, 21, 62, 6, 'SNOW', 1);
  addOneWayDeck(b, 16, 64, 5, 'PLATFORM');
  addDeck(b, 4, 66, 18, 'SNOW', 1); // Recovery floor under Chasm #2
  addDeck(b, 19, 68, 6, 'SNOW', 1);
  addDeck(b, 21, 70, 6, 'SNOW', 1);
  addDeck(b, 15, 72, 7, 'SNOW', 2); // Jeff Anchor Ledge #2 (X: 15..22, topY = 72)

  b.fillRect(9, 69, 1, 2, 'SNOW');
  addDeck(b, 2, 72, 7, 'SNOW', 3);
  addDeck(b, -4, 74, 5, 'SNOW', 1);
  b.addCollectible({
    id: 'Photo3',
    kind: 'photo',
    x: -1.5,
    y: 75.0,
    label: 'Village Campfire',
    zone: 'foothills',
  });

  wp.ledge(22.0, 21.8, 62);
  wp.ledge(20.0, 18.0, 64);
  wp.ledge(19.0, 20.0, 66);
  wp.ledge(21.0, 23.0, 68);
  wp.ledge(23.2, 23.2, 70);
  wp.ledge(21.0, 15.8, 72);
  wp.hop(12.5, 72.0); // Directly above Y = 66 recovery deck
  wp.ledge(9.0, 7.0, 72);

  // --- 1F. Upper Foothills Ridge to Dark Mines Gate (Y: 72..91) ---
  addDeck(b, 7, 74, 6, 'SNOW', 1);
  addDeck(b, 13, 76, 6, 'ICE', 1);
  addDeck(b, 19, 77, 4, 'SNOW', 2);
  addDeck(b, 14, 79, 6, 'SNOW', 1);
  addDeck(b, 8, 81, 6, 'SNOW', 1);
  addOneWayDeck(b, 3, 83, 6, 'PLATFORM');
  addDeck(b, 8, 85, 7, 'SNOW', 1);
  addDeck(b, 14, 87, 6, 'SNOW', 1);
  addDeck(b, 10, 89, 7, 'SNOW', 1);

  wp.ledge(8.0, 12.0, 74);
  wp.ledge(14.0, 18.0, 76);
  wp.ledge(20.0, 20.0, 77);
  wp.ledge(19.0, 15.0, 79);
  wp.ledge(13.0, 9.0, 81);
  wp.ledge(7.5, 7.5, 83);
  wp.ledge(9.0, 14.0, 85);
  wp.ledge(15.5, 16.0, 87);
  wp.ledge(14.5, 13.0, 89);

  // ==========================================================================
  // 2. ZONE 2: DARK MINES (Y: 91..217)
  //    - darkZone covering Y = 103..217
  //    - 42 wide (w = 4) Jeff-friendly MovablePlatforms across all 5 types!
  //    - 6 crumbling mine rock blocks, Seal Rescue, 3 friendly Mole NPCs
  // ==========================================================================

  b.fillRect(-14, WORLD.ZONE2_START_Y, 4, 126, 'DIRT');
  b.fillRect(32, WORLD.ZONE2_START_Y, 4, 126, 'DIRT');

  b.addDarkZone({
    minX: -24,
    maxX: 38,
    minY: WORLD.ZONE2_DARK_START_Y,
    maxY: WORLD.ZONE2_END_Y,
  });

  // Mines Entrance Gate Plateau at topY = 91
  addDeck(b, 3, 91, 14, 'DIRT', 1);
  b.addSign({
    x: 8.5,
    y: 91.0,
    title: 'Dark Mines - Solo Route',
    text: 'Keep Jeff close as headlamps ignite at 103m! Ride wide minecarts safely up the shaft.',
  });
  wp.ledge(13.0, 16.0, 91);

  // --- 2A. Gate to Solo Mines Warp Deck (Y: 91..104, Movables #1 & #2 + Mole #1) ---
  addDeck(b, 15, 93, 7, 'DIRT', 1);
  addDeck(b, 22, 95, 9, 'DIRT', 1);
  b.addCollectible({
    id: 'npc_solo_mole_1',
    kind: 'npc',
    x: 28.5,
    y: 96.0,
    label: 'Barnaby the Mole',
    zone: 'mines',
  });
  b.addSign({
    x: 25.5,
    y: 95.0,
    title: 'Barnaby the Mole',
    text: 'Nice boulder friend! Set Jeff on the wide minecarts and ride together.',
  });

  // Movable #1 (CONTINUE): East dock (22..31, topY=95) -> Mid platform (8..14, topY=97)
  b.addMovable({
    id: 'solo_cart_1',
    startX: 17.5,
    startY: 94,
    endX: 14.5,
    endY: 96,
    w: 4,
    h: 1,
    speed: 2.8,
    mode: 'CONTINUE',
    terrain: 'MOVABLE',
  });
  addDeck(b, 8, 97, 6, 'DIRT', 1);

  // Movable #2 (ENDS_STOP): Mid platform (8..14, topY=97) -> West dock (-10..-2, topY=99)
  b.addMovable({
    id: 'solo_cart_2',
    startX: 3.5,
    startY: 96,
    endX: -1.5,
    endY: 98,
    w: 4,
    h: 1,
    speed: 2.8,
    mode: 'ENDS_STOP',
    terrain: 'MOVABLE',
  });
  addDeck(b, -10, 99, 8, 'DIRT', 1);
  addOneWayDeck(b, -6, 101, 7, 'PLATFORM');
  addOneWayDeck(b, -3, 103, 6, 'PLATFORM'); // X: -3..3, strictly clear of X=3..15 deck!
  // Wide Solo Mines Warp Deck (topY = 104, X: 3..15, inside darkZone 103..217!)
  addDeck(b, 3, 104, 12, 'DIRT', 1);

  wp.ledge(17.0, 21.0, 93);
  wp.ledge(23.0, 22.8, 95);
  wp.hop(19.5, 95.6);
  wp.walk(16.5, 97.6);
  wp.ledge(13.0, 8.8, 97);
  wp.hop(5.5, 97.6);
  wp.walk(0.5, 99.6);
  wp.ledge(-3.0, -4.5, 99);
  wp.ledge(-4.0, -1.0, 101);
  wp.ledge(0.0, 2.0, 103);
  wp.ledge(4.5, 11.5, 104);

  // --- 2B. Crumbling Rock Sprint (6 FallingBlocks) + Manual Page: Mines (Y: 104..112) ---
  addOneWayDeck(b, 14, 103, 14, 'PLATFORM'); // Safe catwalk below bridge
  addDeck(b, 11, 106, 5, 'DIRT', 1);
  b.addFallingBlock({ id: 'fb_solo_mines_1', x: 17, y: 105, w: 2, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'fb_solo_mines_2', x: 20, y: 105, w: 2, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'fb_solo_mines_3', x: 23, y: 105, w: 2, h: 1, terrain: 'DIRT' });
  addDeck(b, 26, 107, 6, 'DIRT', 1);
  b.addCollectible({
    id: 'Mines',
    kind: 'manual',
    x: 29.0,
    y: 108.0,
    label: 'Dark Mines & Crumbling Rock',
    zone: 'mines',
  });
  b.addFallingBlock({ id: 'fb_solo_mines_4', x: 23, y: 108, w: 2, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'fb_solo_mines_5', x: 20, y: 108, w: 2, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'fb_solo_mines_6', x: 17, y: 108, w: 2, h: 1, terrain: 'DIRT' });
  addDeck(b, 11, 109, 5, 'DIRT', 1);
  // Strictly above y=108 falling blocks and strictly below solo_cart_3 (Y: 111..113) -> zero overlap!
  addOneWayDeck(b, 16, 110, 6, 'PLATFORM'); // ty = 109, topY = 110
  addOneWayDeck(b, 22, 111, 5, 'PLATFORM'); // ty = 110, topY = 111 (below solo_cart_3 minY = 111)

  wp.ledge(12.5, 15.2, 106);
  wp.hop(18.0, 106.6);
  wp.hop(21.0, 106.6);
  wp.hop(24.0, 106.6);
  wp.ledge(27.0, 27.0, 107);
  wp.hop(24.0, 109.6);
  wp.hop(21.0, 109.6);
  wp.hop(18.0, 109.6);
  wp.ledge(15.0, 15.0, 109);
  wp.ledge(17.5, 21.0, 110);
  wp.ledge(23.0, 26.0, 111);

  // --- 2C. 14 Wide Jeff-Friendly Minecart Tiers (Y: 112..210, Movables #3..#42) ---
  const tierModes: MovablePlatformType[][] = [
    ['ENDS_STOP', 'CONTINUE', 'ENDS_STOP'], // Tier 0 (Y=112, Left)
    ['CONTINUE', 'ENDS_STOP', 'CONTINUE'], // Tier 1 (Y=119, Right) -> Photo4
    ['START_STOP', 'ENDS_STOP', 'START_STOP'], // Tier 2 (Y=126, Left)
    ['START_STOP', 'START_STOP', 'START_STOP'], // Tier 3 (Y=133, Right) -> Mole #2
    ['START_STOP', 'CONTINUE', 'START_STOP'], // Tier 4 (Y=140, Left)
    ['STEP_STOP', 'START_STOP', 'STEP_STOP'], // Tier 5 (Y=147, Right)
    ['STEP_STOP', 'STEP_STOP'], // Tier 6 (Y=154, Left, 2-cart Seal Rescue Cove!)
    ['STEP_STOP', 'CONTINUE', 'STEP_STOP'], // Tier 7 (Y=161, Right)
    ['ENDS_STOP', 'STEP_STOP', 'STEP_STOP'], // Tier 8 (Y=168, Left) -> Photo5
    ['FINISH_STOP', 'CONTINUE', 'FINISH_STOP'], // Tier 9 (Y=175, Right)
    ['FINISH_STOP', 'ENDS_STOP', 'FINISH_STOP'], // Tier 10 (Y=182, Left) -> Mole #3
    ['FINISH_STOP', 'CONTINUE', 'FINISH_STOP'], // Tier 11 (Y=189, Right)
    ['FINISH_STOP', 'ENDS_STOP', 'CONTINUE'], // Tier 12 (Y=196, Left)
    ['CONTINUE', 'ENDS_STOP'], // Tier 13 (Y=203, Right, 2-cart Finale!)
  ];

  let cartIdx = 3;
  for (let tier = 0; tier < tierModes.length; tier++) {
    const baseY = 112 + tier * 7;
    const goingLeft = tier % 2 === 0;
    const modes = tierModes[tier];
    const speed = 2.6 + (tier % 4) * 0.3;

    if (modes.length === 3) {
      if (goingLeft) {
        addDeck(b, 27, baseY, 5, 'DIRT', 1); // Right dock X: 27..32
        addDeck(b, 15, baseY + 1, 3, 'DIRT', 1); // Island 2 X: 15..18
        addDeck(b, 3, baseY + 2, 3, 'DIRT', 1); // Island 1 X: 3..6
        addDeck(b, -10, baseY + 3, 4, 'DIRT', 1); // Left dock X: -10..-6

        const segs: ReadonlyArray<{ sx: number; sy: number; ex: number; ey: number }> = [
          { sx: 22.5, sy: baseY - 1, ex: 18.5, ey: baseY },
          { sx: 10.5, sy: baseY, ex: 6.5, ey: baseY + 1 },
          { sx: -1.5, sy: baseY + 1, ex: -5.5, ey: baseY + 2 },
        ];
        wp.ledge(28.5, 27.8, baseY);
        for (let s = 0; s < 3; s++) {
          const seg = segs[s];
          const mType = modes[s];
          b.addMovable({
            id: `solo_cart_${cartIdx++}`,
            startX: seg.sx,
            startY: seg.sy,
            endX: seg.ex,
            endY: seg.ey,
            w: 4,
            h: 1,
            speed,
            mode: mType,
            terrain: 'MOVABLE',
          });
          if (mType === 'FINISH_STOP') {
            addOneWayDeck(b, Math.floor(seg.ex), seg.sy, 8, 'PLATFORM');
          }
          wp.hop(seg.sx + 2.0, seg.sy + 1.6);
          wp.walk(seg.ex + 2.0, seg.ey + 1.6);
          if (s === 0) wp.ledge(17.0, 15.8, baseY + 1);
          if (s === 1) wp.ledge(5.0, 3.8, baseY + 2);
        }
        wp.ledge(-7.0, -7.0, baseY + 3);
        addOneWayDeck(b, -7, baseY + 5, 5, 'PLATFORM');
        wp.ledge(-6.0, -6.0, baseY + 5);
      } else {
        addDeck(b, -10, baseY, 5, 'DIRT', 1); // Left dock X: -10..-5
        addDeck(b, 4, baseY + 1, 3, 'DIRT', 1); // Island 1 X: 4..7
        addDeck(b, 16, baseY + 2, 3, 'DIRT', 1); // Island 2 X: 16..19
        addDeck(b, 28, baseY + 3, 4, 'DIRT', 1); // Right dock X: 28..32

        const segs: ReadonlyArray<{ sx: number; sy: number; ex: number; ey: number }> = [
          { sx: -4.5, sy: baseY - 1, ex: -0.5, ey: baseY },
          { sx: 7.5, sy: baseY, ex: 11.5, ey: baseY + 1 },
          { sx: 19.5, sy: baseY + 1, ex: 23.5, ey: baseY + 2 },
        ];
        wp.ledge(-7.5, -5.8, baseY);
        for (let s = 0; s < 3; s++) {
          const seg = segs[s];
          const mType = modes[s];
          b.addMovable({
            id: `solo_cart_${cartIdx++}`,
            startX: seg.sx,
            startY: seg.sy,
            endX: seg.ex,
            endY: seg.ey,
            w: 4,
            h: 1,
            speed,
            mode: mType,
            terrain: 'MOVABLE',
          });
          if (mType === 'FINISH_STOP') {
            addOneWayDeck(b, Math.floor(seg.sx), seg.sy, 8, 'PLATFORM');
          }
          wp.hop(seg.sx + 2.0, seg.sy + 1.6);
          wp.walk(seg.ex + 2.0, seg.ey + 1.6);
          if (s === 0) wp.ledge(5.0, 6.2, baseY + 1);
          if (s === 1) wp.ledge(17.0, 18.2, baseY + 2);
        }
        wp.ledge(29.0, 29.0, baseY + 3);
        addOneWayDeck(b, 25, baseY + 5, 5, 'PLATFORM');
        wp.ledge(28.0, 28.0, baseY + 5);
      }
    } else if (tier === 6) {
      // Tier 6 (Y = 154, Going Left): 2-Cart Baby Seal Rescue Alcove
      addDeck(b, 22, baseY, 10, 'DIRT', 1);
      b.addCollectible({
        id: 'seal_solo_rescue',
        kind: 'seal',
        x: 29.0,
        y: baseY + 1.0,
        label: 'Stranded Baby Seal',
        zone: 'mines',
      });
      b.addSign({
        x: 25.0,
        y: baseY,
        title: 'Baby Seal Cove',
        text: 'Even Jeff smiles at a rescued baby seal! Walk close to rescue it.',
      });
      b.addMovable({
        id: `solo_cart_${cartIdx++}`,
        startX: 17.5,
        startY: baseY - 1,
        endX: 10.5,
        endY: baseY + 1,
        w: 4,
        h: 1,
        speed: 2.9,
        mode: modes[0],
        terrain: 'MOVABLE',
      });
      addDeck(b, 6, baseY + 2, 4, 'DIRT', 1);
      b.addMovable({
        id: `solo_cart_${cartIdx++}`,
        startX: 1.5,
        startY: baseY + 1,
        endX: -5.5,
        endY: baseY + 2,
        w: 4,
        h: 1,
        speed: 2.9,
        mode: modes[1],
        terrain: 'MOVABLE',
      });
      addDeck(b, -10, baseY + 3, 4, 'DIRT', 1);
      addOneWayDeck(b, -7, baseY + 5, 5, 'PLATFORM');

      wp.ledge(28.0, 22.8, baseY);
      wp.hop(19.5, baseY + 0.6);
      wp.walk(12.5, baseY + 2.6);
      wp.ledge(9.0, 6.8, baseY + 2);
      wp.hop(3.5, baseY + 2.6);
      wp.walk(-3.5, baseY + 3.6);
      wp.ledge(-7.0, -7.0, baseY + 3);
      wp.ledge(-6.0, -6.0, baseY + 5);
    } else {
      // Tier 13 (Y = 203, Going Right): 2-Cart Deep Finale
      addDeck(b, -10, baseY, 5, 'DIRT', 1);
      b.addMovable({
        id: `solo_cart_${cartIdx++}`,
        startX: -4.5,
        startY: baseY - 1,
        endX: 4.5,
        endY: baseY + 1,
        w: 4,
        h: 1,
        speed: 3.0,
        mode: modes[0],
        terrain: 'MOVABLE',
      });
      addDeck(b, 9, baseY + 2, 4, 'DIRT', 1);
      b.addMovable({
        id: `solo_cart_${cartIdx++}`,
        startX: 13.5,
        startY: baseY + 1,
        endX: 21.5,
        endY: baseY + 2,
        w: 4,
        h: 1,
        speed: 3.0,
        mode: modes[1],
        terrain: 'MOVABLE',
      });
      addDeck(b, 26, baseY + 3, 6, 'DIRT', 1);

      wp.ledge(-7.5, -5.8, baseY);
      wp.hop(-2.5, baseY + 0.6);
      wp.walk(6.5, baseY + 2.6);
      wp.ledge(10.0, 12.2, baseY + 2);
      wp.hop(15.5, baseY + 2.6);
      wp.walk(23.5, baseY + 3.6);
      wp.ledge(27.0, 27.0, baseY + 3);
    }

    if (tier === 1) {
      addOneWayDeck(b, 4, baseY + 3, 5, 'PLATFORM');
      b.addCollectible({
        id: 'Photo4',
        kind: 'photo',
        x: 6.5,
        y: baseY + 4.0,
        label: 'First Big Swing',
        zone: 'mines',
      });
    } else if (tier === 3) {
      b.addCollectible({
        id: 'npc_solo_mole_2',
        kind: 'npc',
        x: 30.0,
        y: baseY + 4.0,
        label: 'Tunneler Pip',
        zone: 'mines',
      });
      b.addSign({
        x: 28.5,
        y: baseY + 3,
        title: 'Tunneler Pip',
        text: 'Toss Jeff onto a Start-Stop cart to trigger it or carry him right aboard!',
      });
    } else if (tier === 8) {
      addOneWayDeck(b, 14, baseY + 4, 5, 'PLATFORM');
      b.addCollectible({
        id: 'Photo5',
        kind: 'photo',
        x: 16.5,
        y: baseY + 5.0,
        label: 'Lantern Trestle',
        zone: 'mines',
      });
    } else if (tier === 10) {
      b.addCollectible({
        id: 'npc_solo_mole_3',
        kind: 'npc',
        x: -8.5,
        y: baseY + 4.0,
        label: 'Lantern Keeper Gus',
        zone: 'mines',
      });
      b.addSign({
        x: -6.5,
        y: baseY + 3,
        title: 'Lantern Keeper Gus',
        text: 'Fresh mountain gusts blow just beyond 217m - anchor Jeff against the gales!',
      });
    }
  }

  // --- 2D. Mines Exit Stairway & Polaroid Photo6 (Y: 206..217) ---
  addOneWayDeck(b, 22, 208, 6, 'PLATFORM');
  addDeck(b, 16, 210, 6, 'DIRT', 1);
  addDeck(b, 9, 211, 5, 'DIRT', 1);
  b.addCollectible({
    id: 'Photo6',
    kind: 'photo',
    x: 11.5,
    y: 212.0,
    label: 'Deep Shaft Seal',
    zone: 'mines',
  });
  addOneWayDeck(b, 19, 212, 6, 'PLATFORM');
  addDeck(b, 23, 214, 6, 'DIRT', 1);
  addOneWayDeck(b, 27, 215, 5, 'PLATFORM'); // X: 27..32, clear of Y=217 plateau (X: 17..27)!
  addDeck(b, 17, 217, 10, 'SNOW', 1); // X: 17..27, topY = 217

  wp.ledge(26.0, 23.0, 208);
  wp.ledge(21.0, 20.5, 210);
  wp.ledge(22.0, 23.5, 212);
  wp.ledge(25.0, 27.5, 214);
  wp.ledge(28.5, 28.0, 215);
  wp.ledge(26.0, 25.5, 217);

  // ==========================================================================
  // 3. ZONE 3: WINDY CRAGS (Y: 217..395)
  //    - 8 Cyclic WindZones (5.0s on, 5.0s off)
  //    - 8 Wind-driven SwingPlatforms (retail radius/displacement/swingTime parity)
  //    - 127 Crumbling FallingBlocks tuned for solo Jeff-carry sprints!
  // ==========================================================================

  // East-side stairs strictly clear of Band 0 safety floor (X: 2..21, topY = 222)
  addDeck(b, 26, 219, 6, 'SNOW', 1);
  addDeck(b, 22, 221, 6, 'SNOW', 1);
  addDeck(b, 26, 223, 6, 'SNOW', 1);

  wp.ledge(27.5, 27.5, 219);
  wp.ledge(25.5, 25.5, 221);
  wp.ledge(27.0, 26.5, 223);

  interface SoloCragBandSpec {
    bandY: number;
    windMinY: number;
    windMaxY: number;
    dir: 1 | -1;
    radius: number;
    maxDisp: number;
    swingTime: number;
    runBBlocks: number;
  }

  // Starts swinging LEFT from East Crags Warp Deck (X=23, Y=225.6), alternating across 8 bands!
  const cragBands: readonly SoloCragBandSpec[] = [
    { bandY: 225, windMinY: 218, windMaxY: 245, dir: -1, radius: 12.16, maxDisp: 8.55, swingTime: 1.15, runBBlocks: 8 },
    { bandY: 246, windMinY: 246, windMaxY: 266, dir: 1, radius: 12.24, maxDisp: 8.8, swingTime: 1.25, runBBlocks: 8 },
    { bandY: 267, windMinY: 267, windMaxY: 287, dir: -1, radius: 12.3, maxDisp: 9.05, swingTime: 1.3, runBBlocks: 8 },
    { bandY: 288, windMinY: 288, windMaxY: 308, dir: 1, radius: 12.36, maxDisp: 9.25, swingTime: 1.4, runBBlocks: 8 },
    { bandY: 309, windMinY: 309, windMaxY: 329, dir: -1, radius: 12.42, maxDisp: 9.42, swingTime: 1.2, runBBlocks: 8 },
    { bandY: 330, windMinY: 330, windMaxY: 350, dir: 1, radius: 12.45, maxDisp: 9.58, swingTime: 1.35, runBBlocks: 8 },
    { bandY: 351, windMinY: 351, windMaxY: 371, dir: -1, radius: 12.48, maxDisp: 9.65, swingTime: 1.1, runBBlocks: 8 },
    { bandY: 372, windMinY: 372, windMaxY: 395, dir: 1, radius: 12.5, maxDisp: 9.72, swingTime: 1.45, runBBlocks: 7 },
  ];

  let soloFbIdx = 1;
  for (let i = 0; i < cragBands.length; i++) {
    const band = cragBands[i];
    const { bandY, dir, radius, maxDisp, swingTime } = band;

    b.addWindZone({
      id: `wind_solo_crags_${i + 1}`,
      minX: -24,
      maxX: 38,
      minY: band.windMinY,
      maxY: band.windMaxY,
      dir,
      activeTime: PHYSICS.WIND_ACTIVE_TIME,
      waitTime: PHYSICS.WIND_WAIT_TIME,
      constant: false,
      strength: 0.95,
    });

    const swingW = 4.0;
    const pivotX = dir === 1 ? 6.5 : 16.5;
    const restTopY = bandY + 0.5;
    const pivotY = restTopY + radius;
    const peakCos = Math.sqrt(Math.max(0.05, 1 - (maxDisp / radius) * (maxDisp / radius)));
    const peakTopY = pivotY - radius * peakCos;
    const targetTopY = Math.floor(peakTopY);

    b.addSwingPlatform({
      id: `swing_solo_crags_${i + 1}`,
      pivotX,
      pivotY,
      w: swingW,
      h: 1.0,
      radius,
      maxDisplacement: maxDisp,
      swingTime,
      windDriven: true,
    });

    if (i === 0) {
      addDeck(b, 2, bandY - 3, 19, 'SNOW', 1); // Safe recovery snow deck underneath Band 0 chasm
    }

    if (dir === -1) {
      addDeck(b, 20, bandY, 10, 'SNOW', 1);
      const targetRightX = Math.floor(pivotX - maxDisp - swingW * 0.5 - 0.6);
      addDeck(b, -7, targetTopY, targetRightX + 7, 'SNOW', 1);

      if (i === 0) {
        b.addSign({
          x: 21.5,
          y: bandY,
          title: 'Windy Crags - Solo Route',
          text: 'Carry Jeff onto the hanging cradle and ride the 5s gale across the chasm!',
        });
        b.addCollectible({
          id: 'Wind',
          kind: 'manual',
          x: 27.0,
          y: bandY + 1.0,
          label: 'Gale Cycles & Swing Cradles',
          zone: 'crags',
        });
      }

      wp.ledge(26.0, 20.8, bandY);
      wp.hop(pivotX + 1.5, restTopY + 0.6);
      const maxAngle = Math.asin(maxDisp / radius);
      for (let s = 0; s <= 4; s++) {
        const ang = -(s / 4) * maxAngle;
        const ax = pivotX + Math.sin(ang) * radius;
        const ay = pivotY - Math.cos(ang) * radius + 0.6;
        wp.hop(ax, ay);
      }
      const peakX = pivotX - maxDisp;
      wp.hop(peakX - 1.5, peakTopY + 0.6);
      wp.ledge(targetRightX - 1.2, -5.5, targetTopY);

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

      // Run A (Left -> Right, 4 blocks -> Jeff Rest Island -> 4 blocks)
      const runAY = bandY + 9;
      const runAXs = [-3, 0, 3, 6, 15, 18, 21, 24];
      addDeck(b, 9, runAY + 1, 5, 'SNOW', 1);
      for (let k = 0; k < runAXs.length; k++) {
        const bx = runAXs[k];
        const byTop = k < 4 ? runAY + (k >= 2 ? 1 : 0) : runAY + 1 + (k >= 6 ? 1 : 0);
        b.addFallingBlock({ id: `fb_solo_crags_${soloFbIdx++}`, x: bx, y: byTop - 1, w: 2, h: 1, terrain: 'SNOW' });
        wp.hop(bx + 1.0, byTop + 0.6);
        if (k === 3) wp.ledge(10.0, 13.0, runAY + 1);
      }
      addDeck(b, 27, runAY + 2, 5, 'SNOW', 1);
      addDeck(b, 27, runAY + 4, 5, 'SNOW', 1);
      addDeck(b, 26, bandY + 15, 6, 'SNOW', 1);
      wp.ledge(28.0, 29.0, runAY + 2);
      wp.ledge(29.0, 29.0, runAY + 4);
      wp.ledge(28.5, 26.8, bandY + 15);

      // Run B (Right -> Left, 4 blocks -> Jeff Rest Island -> 4 blocks)
      const runBY = bandY + 15;
      const runBXs = [23, 20, 17, 14, 5, 2, -1, -4];
      addDeck(b, 8, runBY + 1, 5, 'SNOW', 1);
      for (let k = 0; k < runBXs.length; k++) {
        const bx = runBXs[k];
        const byTop = k < 4 ? runBY + (k >= 2 ? 1 : 0) : runBY + 1 + (k >= 6 ? 1 : 0);
        b.addFallingBlock({ id: `fb_solo_crags_${soloFbIdx++}`, x: bx, y: byTop - 1, w: 2, h: 1, terrain: 'SNOW' });
        wp.hop(bx + 1.0, byTop + 0.6);
        if (k === 3) wp.ledge(12.0, 9.0, runBY + 1);
      }
      addDeck(b, -10, runBY + 2, 5, 'SNOW', 1);
      addDeck(b, -9, runBY + 4, 6, 'SNOW', 1);
      wp.ledge(-6.5, -7.5, runBY + 2);
      wp.ledge(-7.0, -5.0, runBY + 4);
    } else {
      addDeck(b, -6, bandY, 9, 'SNOW', 1);
      const targetLeftX = Math.ceil(pivotX + maxDisp + swingW * 0.5 + 0.6);
      addDeck(b, targetLeftX, targetTopY, 29 - targetLeftX, 'SNOW', 1);

      wp.ledge(-3.5, 2.2, bandY);
      wp.hop(pivotX - 1.5, restTopY + 0.6);
      const maxAngle = Math.asin(maxDisp / radius);
      for (let s = 0; s <= 4; s++) {
        const ang = (s / 4) * maxAngle;
        const ax = pivotX + Math.sin(ang) * radius;
        const ay = pivotY - Math.cos(ang) * radius + 0.6;
        wp.hop(ax, ay);
      }
      const peakX = pivotX + maxDisp;
      wp.hop(peakX + 1.5, peakTopY + 0.6);
      wp.ledge(targetLeftX + 1.2, 27.5, targetTopY);

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

      // Run A (Right -> Left, 8 blocks)
      const runAY = bandY + 9;
      const runAXs = [23, 20, 17, 14, 5, 2, -1, -4];
      addDeck(b, 8, runAY + 1, 5, 'SNOW', 1);
      for (let k = 0; k < runAXs.length; k++) {
        const bx = runAXs[k];
        const byTop = k < 4 ? runAY + (k >= 2 ? 1 : 0) : runAY + 1 + (k >= 6 ? 1 : 0);
        b.addFallingBlock({ id: `fb_solo_crags_${soloFbIdx++}`, x: bx, y: byTop - 1, w: 2, h: 1, terrain: 'SNOW' });
        wp.hop(bx + 1.0, byTop + 0.6);
        if (k === 3) wp.ledge(12.0, 9.0, runAY + 1);
      }
      addDeck(b, -10, runAY + 2, 5, 'SNOW', 1);
      addDeck(b, -10, runAY + 4, 5, 'SNOW', 1);
      addDeck(b, -9, bandY + 15, 5, 'SNOW', 1);
      wp.ledge(-6.5, -7.5, runAY + 2);
      wp.ledge(-7.5, -7.5, runAY + 4);
      wp.ledge(-7.0, -4.8, bandY + 15);

      // Run B (Left -> Right, 8 blocks or 7 on Band 7 -> 127 total!)
      const runBY = bandY + 15;
      const isSeven = band.runBBlocks === 7;
      const runBXs = isSeven ? [-3, 0, 3, 6, 18, 21, 24] : [-3, 0, 3, 6, 15, 18, 21, 24];
      addDeck(b, 9, runBY + 1, isSeven ? 8 : 5, 'SNOW', 1);
      for (let k = 0; k < runBXs.length; k++) {
        const bx = runBXs[k];
        const byTop = k < 4 ? runBY + (k >= 2 ? 1 : 0) : runBY + 1 + (k >= 5 ? 1 : 0);
        b.addFallingBlock({ id: `fb_solo_crags_${soloFbIdx++}`, x: bx, y: byTop - 1, w: 2, h: 1, terrain: 'SNOW' });
        wp.hop(bx + 1.0, byTop + 0.6);
        if (k === 3) wp.ledge(10.0, isSeven ? 16.0 : 13.0, runBY + 1);
      }
      addDeck(b, 27, runBY + 2, 5, 'SNOW', 1);
      addDeck(b, 26, runBY + 4, 6, 'SNOW', 1);
      wp.ledge(28.0, 29.0, runBY + 2);
      wp.ledge(28.5, 27.5, runBY + 4);
    }

    if (i === 1) {
      b.addCollectible({
        id: 'Photo7',
        kind: 'photo',
        x: 10.5,
        y: bandY + 11.0,
        label: 'Gale Watchtower',
        zone: 'crags',
      });
    } else if (i === 3) {
      b.addCollectible({
        id: 'Assist',
        kind: 'manual',
        x: 10.5,
        y: bandY + 11.0,
        label: 'Rope Pull & Charlie Checkpoints',
        zone: 'crags',
      });
      b.addSign({
        x: 9.0,
        y: bandY + 10,
        title: 'Solo Checkpoint Refuge',
        text: 'Plant a Flag or reel Jeff up quickly with Rope Pull in the Assist Menu!',
      });
    } else if (i === 4) {
      b.addCollectible({
        id: 'Photo8',
        kind: 'photo',
        x: 10.5,
        y: bandY + 17.0,
        label: 'Suspended Cradle',
        zone: 'crags',
      });
    } else if (i === 7) {
      b.addCollectible({
        id: 'Photo9',
        kind: 'photo',
        x: 13.0,
        y: bandY + 17.0,
        label: 'Mirror Glacier',
        zone: 'crags',
      });
    }
  }

  // Final Crags -> Frozen Summit Gate step (393 -> 395)
  addDeck(b, 21, 393, 9, 'SNOW', 1);
  addDeck(b, 14, 395, 11, 'SNOW', 1);
  wp.ledge(26.5, 22.5, 393);
  wp.ledge(21.0, 15.0, 395);

  // ==========================================================================
  // 4. ZONE 4: FROZEN SUMMIT & PEAK (Y: 395..497)
  //    - Constant Peak WindZone (waitTime: 0, constant: true)
  //    - Slick ICE terraces with snow backstops for Jeff anchoring
  //    - Non-grabbable ICE walls, Manual (Ice), Polaroids (Photo10..12)
  //    - Grand Solo Jeff Summit Flag Plateau at Y = 497!
  // ==========================================================================

  b.addWindZone({
    id: 'wind_solo_summit_peak',
    minX: -24,
    maxX: 38,
    minY: 396,
    maxY: 511,
    dir: -1,
    activeTime: 10.0,
    waitTime: 0,
    constant: true,
    strength: 0.72,
  });

  b.addSign({
    x: 18.0,
    y: 395.0,
    title: 'Frozen Summit - Solo Peak',
    text: 'Constant westward gales! Set Jeff on snow stops so he will not slide on glacier ice.',
  });

  // --- 4A. Glacier Approach & Non-Grabbable ICE Monolith (Y: 395..419) ---
  addDeck(b, 7, 397, 7, 'ICE', 1);
  addDeck(b, 1, 399, 6, 'SNOW', 2);
  addDeck(b, 7, 401, 6, 'ICE', 1);
  addDeck(b, 1, 402, 5, 'SNOW', 1);
  b.addCollectible({
    id: 'Ice',
    kind: 'manual',
    x: 3.0,
    y: 403.0,
    label: 'Glacier Ice Momentum',
    zone: 'summit',
  });

  b.fillIce(-3, 401, 3, 16); // Non-grabbable west glacier monolith

  addDeck(b, 12, 403, 7, 'SNOW', 1);
  addDeck(b, 18, 405, 6, 'ICE', 1);
  addDeck(b, 24, 407, 4, 'SNOW', 2);
  addDeck(b, 17, 409, 7, 'ICE', 1);
  addDeck(b, 10, 411, 7, 'SNOW', 1);
  addDeck(b, 3, 413, 7, 'ICE', 1);
  addDeck(b, 1, 415, 5, 'SNOW', 1);
  addDeck(b, 6, 417, 7, 'ICE', 1);
  addDeck(b, 13, 419, 8, 'SNOW', 1);

  wp.ledge(13.0, 8.0, 397);
  wp.ledge(6.0, 6.0, 399);
  wp.ledge(8.0, 12.0, 401);
  wp.ledge(13.5, 18.0, 403);
  wp.ledge(19.5, 23.0, 405);
  wp.ledge(25.0, 25.0, 407);
  wp.ledge(23.0, 18.0, 409);
  wp.ledge(16.0, 11.0, 411);
  wp.ledge(9.0, 4.5, 413);
  wp.ledge(4.0, 5.0, 415);
  wp.ledge(7.0, 12.0, 417);
  wp.ledge(14.0, 14.0, 419);

  // --- 4B. Mirror Glacier Slopes & Photo10 (Y: 419..445) ---
  addDeck(b, 6, 421, 7, 'ICE', 1);
  addDeck(b, 0, 423, 6, 'SNOW', 1);
  b.addSlope({ id: 'slope_solo_summit_1', x: 6, y: 423, w: 4, h: 2, dir: 'right', terrain: 'ICE' });
  b.fillIce(6, 422, 4, 1);
  addDeck(b, 10, 425, 7, 'SNOW', 1);
  b.fillIce(27, 424, 2, 16); // Non-grabbable east glacier wall

  addDeck(b, 17, 427, 7, 'ICE', 1);
  addDeck(b, 11, 429, 7, 'SNOW', 1);
  addDeck(b, 3, 430, 6, 'ICE', 1);
  addDeck(b, 0, 431, 3, 'SNOW', 2);
  b.addCollectible({
    id: 'Photo10',
    kind: 'photo',
    x: 6.0,
    y: 431.0,
    label: 'Above the Clouds',
    zone: 'summit',
  });

  addDeck(b, 16, 431, 7, 'ICE', 1);
  addDeck(b, 21, 433, 5, 'SNOW', 1);
  addDeck(b, 14, 435, 7, 'ICE', 1);
  b.addSlope({ id: 'slope_solo_summit_2', x: 10, y: 435, w: 4, h: 2, dir: 'left', terrain: 'SNOW' });
  b.fillRect(10, 434, 4, 1, 'SNOW');
  addDeck(b, 3, 437, 7, 'SNOW', 1);
  addDeck(b, 9, 439, 7, 'ICE', 1);
  addDeck(b, 16, 441, 6, 'SNOW', 1);
  addDeck(b, 10, 443, 6, 'ICE', 1);
  addDeck(b, 8, 445, 9, 'SNOW', 1);

  wp.ledge(12.0, 7.0, 421);
  wp.ledge(5.0, 5.5, 423);
  wp.hop(6.5, 423.8);
  wp.walk(9.5, 425.6);
  wp.ledge(11.0, 16.0, 425);
  wp.ledge(18.0, 18.5, 427);
  wp.ledge(17.0, 15.5, 429);
  wp.ledge(17.0, 21.5, 431);
  wp.ledge(22.5, 22.0, 433);
  wp.ledge(20.0, 14.5, 435);
  wp.hop(13.5, 435.8);
  wp.walk(10.5, 437.6);
  wp.ledge(9.0, 8.5, 437);
  wp.ledge(10.0, 15.0, 439);
  wp.ledge(17.0, 17.0, 441);
  wp.ledge(15.0, 12.5, 443);
  wp.ledge(12.0, 12.0, 445);

  // --- 4C. Half-Ice Glacier Chimney & Photo11 (Y: 445..467) ---
  b.fillIce(8, 445, 3, 18); // Non-grabbable left glacier wall
  b.fillRect(15, 445, 3, 18, 'SNOW'); // Grabbable right snow cliff
  for (let rungY = 447; rungY <= 461; rungY += 2) {
    // Parity places top rung (461) on left (rx=11) directly adjacent to west exit deck X=4..11!
    const onLeft = ((rungY - 447) / 2) % 2 === 1;
    const rx = onLeft ? 11 : 13;
    addOneWayDeck(b, rx, rungY, 2, 'PLATFORM');
    wp.hop(rx + 1.0, rungY + 0.6);
  }
  addDeck(b, 4, 463, 7, 'SNOW', 1);
  addDeck(b, -2, 465, 6, 'SNOW', 1);
  b.addCollectible({
    id: 'Photo11',
    kind: 'photo',
    x: 1.0,
    y: 466.0,
    label: 'Piston Blueprint',
    zone: 'summit',
  });
  addDeck(b, 4, 467, 7, 'ICE', 1);

  wp.ledge(10.0, 5.0, 463);
  wp.ledge(3.0, 3.0, 465);
  wp.ledge(5.0, 10.0, 467);

  // --- 4D. Final Tempest Ascent to Solo Summit Staging Terrace (Y: 467..491) ---
  const finalSteps: ReadonlyArray<{
    x: number;
    topY: number;
    w: number;
    terrain: TerrainType;
    inX: number;
    outX: number;
  }> = [
    { x: 11, topY: 469, w: 6, terrain: 'SNOW', inX: 12.0, outX: 16.0 },
    { x: 17, topY: 471, w: 6, terrain: 'ICE', inX: 18.0, outX: 22.0 },
    { x: 22, topY: 473, w: 5, terrain: 'SNOW', inX: 23.0, outX: 22.8 },
    { x: 15, topY: 475, w: 7, terrain: 'ICE', inX: 21.0, outX: 16.0 },
    { x: 8, topY: 477, w: 7, terrain: 'SNOW', inX: 14.0, outX: 9.0 },
    { x: 1, topY: 479, w: 7, terrain: 'ICE', inX: 7.0, outX: 2.0 },
    { x: -3, topY: 481, w: 5, terrain: 'SNOW', inX: 1.0, outX: 1.2 },
    { x: 2, topY: 483, w: 7, terrain: 'ICE', inX: 3.0, outX: 8.0 },
    { x: 9, topY: 485, w: 7, terrain: 'SNOW', inX: 10.0, outX: 15.0 },
    { x: 16, topY: 487, w: 6, terrain: 'ICE', inX: 17.0, outX: 20.5 },
    { x: 20, topY: 489, w: 6, terrain: 'SNOW', inX: 21.0, outX: 17.5 },
  ];
  b.fillIce(-6, 478, 3, 12);

  for (let s = 0; s < finalSteps.length; s++) {
    const st = finalSteps[s];
    addDeck(b, st.x, st.topY, st.w, st.terrain, 1);
    wp.ledge(st.inX, st.outX, st.topY);
  }

  // Wide Solo Summit Warp Staging Terrace right below the 497 u Peak Flag (topY = 491, X: 5..16)
  addDeck(b, 5, 491, 11, 'SNOW', 1);
  b.addSign({
    x: 7.5,
    y: 491.0,
    title: 'Solo Summit Approach - 491m',
    text: 'Carry Jeff up three final ledges to plant the 497m Peak Banner!',
  });

  // Eastern Crystal Balcony with final Polaroid Photo12
  addDeck(b, 17, 493, 6, 'SNOW', 1);
  b.addCollectible({
    id: 'Photo12',
    kind: 'photo',
    x: 20.0,
    y: 494.0,
    label: 'Victory Over Bachicha',
    zone: 'summit',
  });

  wp.ledge(15.0, 6.0, 491);

  // --- 4E. Grand Solo Jeff Summit Flag & Celebration Plateau (Y = 497) ---
  addDeck(b, 0, 493, 5, 'SNOW', 1); // Step 1 (topY = 493, X=0..4 open sky clear of 4..17 plateau!)
  addOneWayDeck(b, -3, 495, 5, 'PLATFORM'); // Step 2 (topY = 495 jump-through deck, 2u chute to plateau!)
  b.fillRect(4, 495, 13, 2, 'SNOW'); // Grand Solo Summit Plateau (topY = 497, X: 4..17)
  b.fillIce(-5, 495, 2, 3);
  b.fillIce(17, 495, 2, 4);

  b.setSummitZone(7, WORLD.SOLO_SUMMIT_Y, 6, 4, WORLD.SOLO_SUMMIT_Y);
  b.addSign({
    x: 14.5,
    y: 497.0,
    title: 'Solo Jeff Summit - 497m',
    text: 'Rock Solid! Krunked and Jeff the Rock conquered every cliff, cavern, gale, and glacier!',
  });

  wp.ledge(3.8, 0.8, 493);
  wp.ledge(0.2, 1.8, 495);
  wp.ledge(4.8, 10.0, 497);

  b.addWaypoints(wp.points);
  return b.build();
}
