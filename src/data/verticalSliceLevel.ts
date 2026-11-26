import {
  PHYSICS,
  TIME_TRIAL_MEDALS,
  WORLD,
  type GameMode,
  type LevelData,
} from '../contracts';
import { LevelBuilder } from './tileBuilder';

/**
 * Builds the Flagship Wave 1 Vertical Slice level for Krunked & Fred:
 *  - Village Hub (X: -20..2, Y: 0)
 *  - Zone 1: Snowy Foothills (Y: 0..91) — warmup steps, wall-cling chimney, ice terrace, co-op pendulum chasm
 *  - Zone 2: Dark Mines Entrance (Y: 91..155) — darkZone at Y=103, crumbling FallingBlock bridge,
 *    CONTINUE minecart MovablePlatform, cyclic WindZone + SwingPlatform cavern, and Wave 1 Summit Flag at Y=152.
 */
export function buildVerticalSliceLevel(
  mode: GameMode = 'coop_mountain',
  timeTrialIndex?: number,
): LevelData {
  const trialDef =
    mode === 'time_trial' && timeTrialIndex != null
      ? TIME_TRIAL_MEDALS.find((m) => m.index === timeTrialIndex)
      : undefined;

  const id =
    mode === 'time_trial' && timeTrialIndex != null
      ? `time_trial_${timeTrialIndex}`
      : `vertical_slice_${mode}`;

  const name = trialDef ? trialDef.name : 'Krunked & Fred — Wave 1 Vertical Slice';

  const b = new LevelBuilder({
    id,
    name,
    mode,
    timeTrialIndex,
    summitY: 152,
    bounds: { minX: -22, maxX: 34, minY: -2, maxY: 162 },
  });

  // Spawn Krunked (P1) & Fred / Jeff (P2) in Village Hub right above snow ground (top Y = 1.0)
  b.setSpawn({ x: 0, y: 1.6 }, { x: 1.5, y: 1.6 });

  // ==========================================================================
  // 0. VILLAGE HUB (X: -20..4, Y: 0)
  // ==========================================================================
  // Wide snowy village ground (top surface at Y = 1.0)
  b.fillRect(-22, -2, 46, 3, 'SNOW');
  // Left boundary cliff framing the village
  b.fillRect(-22, 1, 2, 14, 'SNOW');
  // Right outer cliff wall framing the foothills start
  b.fillRect(22, 1, 3, 24, 'SNOW');

  // Cozy starting cabin raised deck (top Y = 3.0, dY = +2.0) & timber roof porch (top Y = 6.0)
  b.fillRect(-18, 1, 7, 2, 'BELL_HOUSE');
  b.addOneWay(-19, 5, 9, 'WORKSHOP');

  // Village hub signs pointing to all side-systems
  b.addSign({
    x: -19.0,
    y: 1.0,
    title: 'Secret Lab Portal',
    text: 'Rumors whisper of Dr. Bachicha’s Secret Lab beyond the Summit!',
  });
  b.addSign({
    x: -16.5,
    y: 3.0,
    title: 'Skin Closet',
    text: 'Swap 16 Penguin Skins, 6 Jeff Skins & 12 Rope Skins anytime in menus.',
  });
  b.addSign({
    x: -12.5,
    y: 3.0,
    title: 'Jukebox',
    text: 'Spin 11 Alpine & Cavern tracks in the Jukebox!',
  });
  b.addSign({
    x: -9.0,
    y: 1.0,
    title: 'Polaroid Album',
    text: 'Keep your eyes peeled for hidden Polaroids perched on side ledges.',
  });
  b.addSign({
    x: -5.0,
    y: 1.0,
    title: 'Climber Manual',
    text: 'Collect Manual Pages to master Swing, Grab, Ice & Wind!',
  });
  b.addSign({
    x: 3.5,
    y: 1.0,
    title: 'Jump & Rope',
    text: 'Move & Jump together! Your 2.5u rope links you—climb in rhythm.',
  });

  // ==========================================================================
  // 1. ZONE 1: SNOWY FOOTHILLS (Y: 0..91)
  // ==========================================================================

  // --- 1A. Warmup Snow Steps (dY = 2.0 u, well below 3.30 u jump peak) ---
  b.fillRect(6, 1, 6, 2, 'SNOW'); // X: 6..12, top Y = 3.0
  b.fillRect(11, 3, 6, 2, 'SNOW'); // X: 11..17, top Y = 5.0
  b.fillRect(15, 5, 7, 2, 'SNOW'); // X: 15..22, top Y = 7.0
  b.addOneWay(11, 8, 5, 'PLATFORM'); // X: 11..16, top Y = 9.0
  b.fillRect(5, 10, 6, 1, 'SNOW'); // X: 5..11, top Y = 11.0
  b.fillRect(1, 12, 6, 1, 'SNOW'); // X: 1..7, top Y = 13.0
  b.fillRect(6, 14, 5, 1, 'SNOW'); // X: 6..11, top Y = 15.0
  // Gentle snow slope rising from Y = 15 -> Y = 17
  b.addSlope({ id: 'slope_foothills_1', x: 11, y: 15, w: 4, h: 2, dir: 'right', terrain: 'SNOW' });
  b.fillRect(11, 14, 4, 1, 'SNOW'); // solid base under slope
  b.fillRect(15, 16, 7, 1, 'SNOW'); // X: 15..22, top Y = 17.0
  b.fillRect(11, 18, 11, 1, 'SNOW'); // X: 11..22, top Y = 19.0 (Chimney staging terrace)

  b.addSign({
    x: 15.5,
    y: 19.0,
    title: 'Wall Cling',
    text: 'Hold Grab (Shift) next to snow cliffs to cling! Leap between walls.',
  });

  // --- 1B. Wall-Cling Rock Chimney (Y: 19..38, vertical grabbable SNOW walls 4.0 u apart) ---
  // Left cliff face at X = 14.0, right cliff face at X = 18.0 -> 4.0 u interior shaft
  b.fillRect(11, 19, 3, 19, 'SNOW'); // X: 11..14, Y: 19..38 (top Y = 38.0)
  b.fillRect(18, 19, 4, 18, 'SNOW'); // X: 18..22, Y: 19..37 (top Y = 37.0)
  // Staggered timber rest ledges inside chimney every 3.0 u (easy with wall-cling, fair recovery)
  b.addOneWay(16, 21, 2, 'PLATFORM'); // top Y = 22.0
  b.addOneWay(14, 24, 2, 'PLATFORM'); // top Y = 25.0
  b.addOneWay(16, 27, 2, 'PLATFORM'); // top Y = 28.0
  b.addOneWay(14, 30, 2, 'PLATFORM'); // top Y = 31.0
  b.addOneWay(16, 33, 2, 'PLATFORM'); // top Y = 34.0

  // Chimney exit decks: left deck toward Ice Terrace, right scenic lookout for Polaroid Photo1
  b.fillRect(8, 37, 6, 1, 'SNOW'); // X: 8..14, top Y = 38.0
  b.fillRect(18, 36, 5, 1, 'SNOW'); // X: 18..23, top Y = 37.0
  b.fillRect(24, 38, 5, 1, 'SNOW'); // X: 24..29, top Y = 39.0 (Photo1 rewarding side ledge!)
  b.addCollectible({
    id: 'Photo1',
    kind: 'photo',
    x: 26.5,
    y: 40.0,
    label: 'Chimney Lookout',
    zone: 'foothills',
  });

  // --- 1C. Slick ICE Landing & Jump Terrace (Y: 38..51) ---
  b.fillIce(1, 39, 7, 1); // X: 1..8, top Y = 40.0 (slippery landing!)
  b.fillRect(-2, 39, 3, 3, 'SNOW'); // X: -2..1, Y: 39..42 (top Y = 42.0, flush snow bumper)
  b.fillIce(2, 43, 5, 1); // X: 2..7, top Y = 44.0 (ice jump terrace 2)
  b.fillIce(8, 45, 6, 1); // X: 8..14, top Y = 46.0 (ice jump terrace 3)
  b.fillRect(14, 45, 4, 2, 'SNOW'); // X: 14..18, top Y = 47.0 (grippy snow catch)
  b.fillRect(10, 48, 5, 1, 'SNOW'); // X: 10..15, top Y = 49.0

  // --- 1D. Signature Co-Op Pendulum Swing Chasm (Y: 51..63) ---
  // Safe rescue platform underneath chasm (plenty of clearance below swinging partner!)
  b.fillRect(5, 50, 14, 1, 'SNOW'); // X: 5..19, top Y = 51.0
  // Friendly staircase on left side back up to the Anchor Ledge
  b.fillRect(1, 52, 5, 1, 'SNOW'); // X: 1..6, top Y = 53.0
  b.fillRect(-2, 54, 4, 1, 'SNOW'); // X: -2..2, top Y = 55.0
  b.fillRect(1, 56, 4, 1, 'SNOW'); // X: 1..5, top Y = 57.0

  // Anchor Ledge (right edge at X = 10.0, top surface at Y = 59.0)
  b.fillRect(4, 57, 6, 2, 'SNOW'); // X: 4..10, Y: 57..59
  b.addSign({
    x: 7.0,
    y: 59.0,
    title: 'Anchor & Swing',
    text: 'P1 hold Anchor (C) at ledge! P2 drop, pump Left/Right & Jump to launch across!',
  });

  // Rewarding side ledge above left of Anchor Ledge with Manual Page: Swing
  b.fillRect(-2, 60, 5, 1, 'SNOW'); // X: -2..3, top Y = 61.0 (dY = +2.0 from 59.0, gap 1.0 u)
  b.addCollectible({
    id: 'Swing',
    kind: 'manual',
    x: 0.0,
    y: 62.0,
    label: 'Anchor & Pendulum Swing',
    zone: 'foothills',
  });

  // Target Ledge across ~5.5 u chasm (X = 10 -> 15.5): grabbable snow lip at X = 15 & deck X = 16..23
  b.fillRect(15, 56, 1, 2, 'SNOW'); // X: 15..16, top Y = 58.0 (grabbable catch chin, 5.0 u gap)
  b.fillRect(16, 56, 7, 3, 'SNOW'); // X: 16..23, top Y = 59.0 (6.0 u top gap, avg 5.5 u)

  // --- 1E. Alpine Ridge Ascent to Dark Mines Gate (Y: 59..91) ---
  b.fillRect(19, 60, 6, 1, 'SNOW'); // X: 19..25, top Y = 61.0
  b.addOneWay(14, 62, 5, 'PLATFORM'); // X: 14..19, top Y = 63.0
  b.fillRect(8, 64, 6, 1, 'SNOW'); // X: 8..14, top Y = 65.0
  b.addSign({
    x: 10.5,
    y: 65.0,
    title: 'Flag & Charlie',
    text: 'Turn on Checkpoints in Assist: press F to plant a Flag, hold R to call Charlie!',
  });

  b.fillRect(4, 66, 5, 1, 'SNOW'); // X: 4..9, top Y = 67.0
  b.fillIce(9, 68, 5, 1); // X: 9..14, top Y = 69.0
  b.fillRect(15, 70, 5, 1, 'SNOW'); // X: 15..20, top Y = 71.0

  // Short grabbable snow crag with timber helper step
  b.fillRect(20, 71, 3, 6, 'SNOW'); // X: 20..23, top Y = 77.0 (left face grabbable)
  b.addOneWay(16, 73, 3, 'PLATFORM'); // X: 16..19, top Y = 74.0

  b.fillRect(14, 78, 6, 1, 'SNOW'); // X: 14..20, top Y = 79.0
  b.fillRect(8, 80, 6, 1, 'SNOW'); // X: 8..14, top Y = 81.0
  b.fillRect(4, 82, 5, 1, 'SNOW'); // X: 4..9, top Y = 83.0
  b.fillRect(8, 84, 6, 1, 'SNOW'); // X: 8..14, top Y = 85.0
  b.fillRect(13, 86, 6, 1, 'SNOW'); // X: 13..19, top Y = 87.0
  b.fillRect(10, 88, 6, 1, 'SNOW'); // X: 10..16, top Y = 89.0

  // ==========================================================================
  // 2. ZONE 2: DARK MINES ENTRANCE (Y: 91..155)
  // ==========================================================================

  // Cavern framing walls (DIRT strata flanking the shaft, opening to starry sky at Summit Y = 152)
  b.fillRect(-6, WORLD.ZONE2_START_Y, 4, 60, 'DIRT'); // X: -6..-2, Y: 91..151
  b.fillRect(26, WORLD.ZONE2_START_Y, 4, 60, 'DIRT'); // X: 26..30, Y: 91..151

  // Dark Zone starts cleanly at Y = 103 (activating 2D headlamp lighting!)
  b.addDarkZone({
    minX: -22,
    maxX: 34,
    minY: WORLD.ZONE2_DARK_START_Y,
    maxY: 151,
  });

  // Mines Entrance Threshold at Y = 91
  b.fillRect(4, 90, 12, 1, 'DIRT'); // X: 4..16, top Y = 91.0
  b.addSign({
    x: 8.5,
    y: 91.0,
    title: 'Dark Mines',
    text: 'Deep shafts & crumbling stone ahead! Stay close—headlamps ignite at 103m.',
  });

  // --- 2A. Mine Timber Ascent to Headlamp Threshold (Y: 91..105) ---
  b.addOneWay(2, 92, 5, 'PLATFORM'); // X: 2..7, top Y = 93.0
  b.fillRect(-2, 94, 5, 1, 'DIRT'); // X: -2..3, top Y = 95.0
  b.addOneWay(3, 96, 5, 'PLATFORM'); // X: 3..8, top Y = 97.0
  b.fillRect(8, 98, 6, 1, 'DIRT'); // X: 8..14, top Y = 99.0
  b.addOneWay(13, 100, 5, 'PLATFORM'); // X: 13..18, top Y = 101.0
  // Safety catwalk beneath the upcoming FallingBlock shaft
  b.addOneWay(6, 100, 7, 'PLATFORM'); // X: 6..13, top Y = 101.0

  // Headlamp Threshold Deck right at Y = 103 (unobstructed headroom for warp & approach)
  b.fillRect(14, 102, 12, 1, 'DIRT'); // X: 14..26, top Y = 103.0
  b.fillRect(20, 104, 6, 1, 'DIRT'); // X: 20..26, top Y = 105.0 (FallingBlock bridge start)

  // --- 2B. Crumbling FallingBlock Bridge Sequence (3 blocks across shaft, Y = 105) ---
  b.addFallingBlock({ id: 'fb_mines_1', x: 15.5, y: 104, w: 3, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'fb_mines_2', x: 11.0, y: 104, w: 3, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'fb_mines_3', x: 6.5, y: 104, w: 3, h: 1, terrain: 'DIRT' });

  // West shaft landing deck + Manual Page: Mines
  b.fillRect(-2, 104, 7, 1, 'DIRT'); // X: -2..5, top Y = 105.0
  b.addCollectible({
    id: 'Mines',
    kind: 'manual',
    x: -0.5,
    y: 106.0,
    label: 'Dark Mines & Crumbling Rock',
    zone: 'mines',
  });

  // Steps up to Minecart boarding dock (Y = 111)
  b.addOneWay(0, 106, 5, 'PLATFORM'); // X: 0..5, top Y = 107.0
  b.fillRect(-2, 108, 7, 1, 'DIRT'); // X: -2..5, top Y = 109.0
  b.fillRect(-2, 110, 7, 1, 'DIRT'); // X: -2..5, top Y = 111.0 (Minecart boarding dock)

  // --- 2C. CONTINUE Minecart MovablePlatform Across Cavern (Y: 111..115) ---
  b.addMovable({
    id: 'minecart_cavern_1',
    startX: 5.5,
    startY: 110,
    endX: 16.0,
    endY: 114,
    w: 3.5,
    h: 1,
    speed: 3.2,
    mode: 'CONTINUE',
    terrain: 'MOVABLE',
  });

  // Optional mid-cavern timber perch with Polaroid Photo2 (jump off upper cart)
  b.addOneWay(10, 116, 4, 'PLATFORM'); // X: 10..14, top Y = 117.0
  b.addCollectible({
    id: 'Photo2',
    kind: 'photo',
    x: 12.0,
    y: 118.0,
    label: 'Minecart Crossing',
    zone: 'mines',
  });

  // East cavern landing & switchback climb to Wind Cavern (Y: 115..126)
  b.fillRect(20, 114, 6, 1, 'DIRT'); // X: 20..26, top Y = 115.0
  b.addOneWay(18, 116, 5, 'PLATFORM'); // X: 18..23, top Y = 117.0
  b.fillRect(20, 118, 6, 1, 'DIRT'); // X: 20..26, top Y = 119.0
  b.addOneWay(15, 120, 5, 'PLATFORM'); // X: 15..20, top Y = 121.0
  b.fillRect(10, 122, 6, 1, 'DIRT'); // X: 10..16, top Y = 123.0
  b.fillRect(4, 124, 7, 1, 'DIRT'); // X: 4..11, top Y = 125.0
  b.fillRect(-2, 125, 8, 1, 'DIRT'); // X: -2..6, top Y = 126.0 (Wind Cavern staging deck)

  b.addSign({
    x: 0.5,
    y: 126.0,
    title: 'Subterranean Drafts',
    text: 'Listen for the whistle! Step onto the cradle and let the gust sweep you across.',
  });

  // --- 2D. Wind-Draft Cavern (Y: 126..150) with Cyclic WindZone + SwingPlatform ---
  b.addWindZone({
    id: 'wind_mines_cavern',
    minX: -4,
    maxX: 28,
    minY: 126,
    maxY: 150,
    dir: 1,
    activeTime: PHYSICS.WIND_ACTIVE_TIME,
    waitTime: PHYSICS.WIND_WAIT_TIME,
    constant: false,
    strength: 1.0,
  });

  // Timber boarding step leading cleanly to resting SwingPlatform (gap 1.0 u, zero clipping)
  b.addOneWay(2, 127, 4, 'PLATFORM'); // X: 2..6, top Y = 128.0

  // Wind-driven SwingPlatform: rests at X=7..11, Y=128.8; gusts swing it up to X=15.5..19.5, Y=132.25
  b.addSwingPlatform({
    id: 'swing_mines_1',
    pivotX: 9.0,
    pivotY: 141.0,
    w: 4.0,
    h: 1.0,
    radius: 12.2,
    maxDisplacement: 8.5,
    swingTime: 1.25,
    windDriven: true,
  });

  // East Wind Landing Deck meeting SwingPlatform peak (Y = 132.0) with generous headroom above arc
  b.fillRect(20, 131, 6, 1, 'DIRT'); // X: 20..26, top Y = 132.0

  // Final Wind-Swept Ascent to Summit Plateau (Y: 132..152)
  b.fillRect(21, 133, 5, 1, 'DIRT'); // X: 21..26, top Y = 134.0
  b.addOneWay(16, 135, 5, 'PLATFORM'); // X: 16..21, top Y = 136.0 (clears SwingPlatform peak by >3.5 u)
  b.fillRect(11, 137, 5, 1, 'DIRT'); // X: 11..16, top Y = 138.0
  b.fillRect(5, 139, 6, 1, 'DIRT'); // X: 5..11, top Y = 140.0
  // Stranded baby seal tucked on the sheltered west wind refuge
  b.addCollectible({
    id: 'seal_mines_1',
    kind: 'seal',
    x: 6.5,
    y: 141.0,
    label: 'Sheltered Baby Seal',
    zone: 'mines',
  });

  b.fillRect(1, 141, 5, 1, 'DIRT'); // X: 1..6, top Y = 142.0
  b.addOneWay(6, 143, 5, 'PLATFORM'); // X: 6..11, top Y = 144.0
  b.fillRect(11, 145, 6, 1, 'SNOW'); // X: 11..17, top Y = 146.0 (snow dusts the exit!)
  b.fillRect(14, 147, 5, 1, 'SNOW'); // X: 14..19, top Y = 148.0
  b.fillRect(9, 149, 5, 1, 'SNOW'); // X: 9..14, top Y = 150.0

  // ==========================================================================
  // 3. WAVE 1 SUMMIT FLAG PLATEAU (Y = 152)
  // ==========================================================================
  b.fillRect(0, 151, 13, 1, 'SNOW'); // X: 0..13, top surface at Y = 152.0
  b.fillRect(-2, 151, 2, 2, 'SNOW'); // snowy windbreak ridge on far left
  b.setSummitZone(3, 152, 6, 4, 152);
  b.addSign({
    x: 10.0,
    y: 152.0,
    title: 'Wave 1 Summit!',
    text: 'Bravo Krunked & Fred! You conquered the Foothills & Dark Mines!',
  });

  // ==========================================================================
  // 4. CLEAN WAYPOINTS EVERY 3-5 u FROM SPAWN (0, 1.6) TO SUMMIT (6, 153)
  // ==========================================================================
  b.addWaypoints([
    // Village & Warmup Steps
    { x: 0.0, y: 1.6 },
    { x: 4.0, y: 1.6 },
    { x: 8.5, y: 3.6 },
    { x: 13.0, y: 5.6 },
    { x: 17.5, y: 7.6 },
    { x: 13.5, y: 9.6 },
    { x: 8.5, y: 11.6 },
    { x: 4.0, y: 13.6 },
    { x: 8.5, y: 15.6 },
    { x: 13.0, y: 16.6 },
    { x: 17.5, y: 17.6 },
    { x: 15.5, y: 19.6 },

    // Wall-Cling Chimney
    { x: 17.0, y: 22.6 },
    { x: 15.0, y: 25.6 },
    { x: 17.0, y: 28.6 },
    { x: 15.0, y: 31.6 },
    { x: 17.0, y: 34.6 },
    { x: 14.0, y: 38.6 },
    { x: 10.0, y: 38.6 },

    // Ice Terrace
    { x: 5.5, y: 40.6 },
    { x: 1.0, y: 42.6 },
    { x: 4.5, y: 44.6 },
    { x: 9.5, y: 46.6 },
    { x: 14.5, y: 47.6 },
    { x: 12.0, y: 49.6 },
    { x: 8.0, y: 51.6 },

    // Pendulum Swing Chasm Approach & Crossing
    { x: 3.5, y: 53.6 },
    { x: 0.5, y: 55.6 },
    { x: 3.0, y: 57.6 },
    { x: 7.5, y: 59.6 },
    { x: 11.5, y: 59.0 },
    { x: 15.5, y: 59.6 },
    { x: 19.5, y: 59.6 },

    // Alpine Ridge Ascent to Mines Gate
    { x: 21.5, y: 61.6 },
    { x: 16.5, y: 63.6 },
    { x: 11.0, y: 65.6 },
    { x: 6.5, y: 67.6 },
    { x: 11.0, y: 69.6 },
    { x: 16.5, y: 71.6 },
    { x: 17.5, y: 74.6 },
    { x: 21.0, y: 77.6 },
    { x: 17.0, y: 79.6 },
    { x: 11.0, y: 81.6 },
    { x: 6.5, y: 83.6 },
    { x: 11.0, y: 85.6 },
    { x: 15.5, y: 87.6 },
    { x: 12.5, y: 89.6 },
    { x: 9.0, y: 91.6 },

    // Dark Mines Entry
    { x: 4.5, y: 93.6 },
    { x: 0.5, y: 95.6 },
    { x: 5.0, y: 97.6 },
    { x: 10.5, y: 99.6 },
    { x: 15.0, y: 101.6 },
    { x: 19.5, y: 103.6 },
    { x: 21.5, y: 105.6 },

    // Crumbling FallingBlock Bridge
    { x: 16.5, y: 105.6 },
    { x: 12.0, y: 105.6 },
    { x: 7.5, y: 105.6 },
    { x: 2.5, y: 105.6 },
    { x: 2.5, y: 107.6 },
    { x: 1.5, y: 109.6 },
    { x: 3.0, y: 111.6 },

    // Minecart Cavern Crossing
    { x: 7.5, y: 112.0 },
    { x: 12.0, y: 113.5 },
    { x: 16.5, y: 115.0 },
    { x: 21.5, y: 115.6 },
    { x: 20.5, y: 117.6 },
    { x: 22.0, y: 119.6 },
    { x: 17.5, y: 121.6 },
    { x: 13.0, y: 123.6 },
    { x: 7.5, y: 125.6 },
    { x: 2.5, y: 126.6 },

    // Wind-Draft Cavern & SwingPlatform Showcase
    { x: 5.0, y: 128.6 },
    { x: 9.0, y: 129.4 },
    { x: 13.5, y: 130.6 },
    { x: 17.5, y: 132.8 },
    { x: 22.0, y: 132.6 },

    // Final Wind-Swept Ascent & Wave 1 Summit
    { x: 23.0, y: 134.6 },
    { x: 18.5, y: 136.6 },
    { x: 13.5, y: 138.6 },
    { x: 8.0, y: 140.6 },
    { x: 3.5, y: 142.6 },
    { x: 8.5, y: 144.6 },
    { x: 14.0, y: 146.6 },
    { x: 16.5, y: 148.6 },
    { x: 11.5, y: 150.6 },
    { x: 6.0, y: 153.0 },
  ]);

  return b.build();
}
