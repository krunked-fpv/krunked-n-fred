import {
  PHYSICS,
  TIME_TRIAL_MEDALS,
  type LevelData,
  type TerrainType,
  type Vec2,
} from '../contracts';
import { LevelBuilder } from './tileBuilder';

interface TrailTracker {
  push(x: number, y: number): void;
  last(): Vec2;
}

function createTrail(b: LevelBuilder, startX: number, startY: number): TrailTracker {
  let prev: Vec2 = { x: startX, y: startY };
  b.addWaypoint(startX, startY);

  const push = (x: number, y: number): void => {
    const dx = x - prev.x;
    const dy = y - prev.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.35) return;
    if (dist > 3.6) {
      const steps = Math.ceil(dist / 3.3);
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const interpX = prev.x + dx * t;
        const interpY = dy > 0.25 && dy <= 2.5 ? Math.max(prev.y + dy * t, y) : prev.y + dy * t;
        b.addWaypoint(
          Math.round(interpX * 100) / 100,
          Math.round(interpY * 100) / 100,
        );
      }
    }
    const rx = Math.round(x * 100) / 100;
    const ry = Math.round(y * 100) / 100;
    b.addWaypoint(rx, ry);
    prev = { x: rx, y: ry };
  };

  return {
    push,
    last: () => prev,
  };
}

function initTrialBuilder(
  index: number,
  summitY: number,
  wallTerrain: TerrainType,
  floorTerrain: TerrainType,
  minX = -14,
  maxX = 28,
): { b: LevelBuilder; wp: TrailTracker } {
  const def = TIME_TRIAL_MEDALS[index - 1];
  const b = new LevelBuilder({
    id: `time_trial_${index}`,
    name: def.name,
    mode: 'time_trial',
    timeTrialIndex: index,
    summitY,
    bounds: { minX, maxX, minY: -2, maxY: summitY + 12 },
  });

  b.setSpawn({ x: 0, y: 1.6 }, { x: 1.5, y: 1.6 });
  // Base starting deck (top Y = 1.0) & outer framing walls
  b.fillRect(minX, -2, maxX - minX, 3, floorTerrain);
  b.fillRect(minX, 1, 3, summitY + 7, wallTerrain);
  b.fillRect(maxX - 3, 1, 3, summitY + 7, wallTerrain);

  const wp = createTrail(b, 0.75, 1.6);
  return { b, wp };
}

function finishSummitPlateau(
  b: LevelBuilder,
  wp: TrailTracker,
  centerX: number,
  summitY: number,
  terrain: TerrainType,
  title: string,
): void {
  const leftX = Math.round(centerX - 5);
  b.fillRect(leftX, summitY - 1, 10, 1, terrain);
  b.setSummitZone(leftX + 2, summitY, 6, 4, summitY);
  b.addSign({
    x: leftX + 8.5,
    y: summitY,
    title,
    text: 'Cross the banner to lock in your Time Trial medal!',
  });
  wp.push(centerX, summitY + 0.6);
}

// ============================================================================
// TT1: Foothills Sprint (foothills, 62 u) - Fast alpine switchbacks & slopes
// ============================================================================
function buildTT1(): LevelData {
  const summitY = 62;
  const { b, wp } = initTrialBuilder(1, summitY, 'SNOW', 'SNOW');

  b.addSign({
    x: -3.5,
    y: 1.0,
    title: 'TT1: Foothills Sprint',
    text: 'Chain jumps up the pine ledges and snow slopes for Platinum (70s)!',
  });

  // Opening sprint steps & slope boost (Y = 1..15)
  b.fillRect(5, 2, 5, 1, 'SNOW'); // top 3
  b.addSlope({ id: 'tt1_slope_1', x: 10, y: 3, w: 4, h: 2, dir: 'right', terrain: 'SNOW' });
  b.fillRect(10, 2, 4, 1, 'SNOW');
  b.fillRect(14, 4, 6, 1, 'SNOW'); // top 5
  b.addOneWay(18, 6, 5, 'PLATFORM'); // top 7
  b.fillRect(12, 8, 5, 1, 'SNOW'); // top 9
  b.addOneWay(6, 10, 5, 'PLATFORM'); // top 11
  b.fillRect(0, 12, 5, 1, 'SNOW'); // top 13
  b.addSlope({ id: 'tt1_slope_2', x: -4, y: 13, w: 4, h: 2, dir: 'left', terrain: 'SNOW' });
  b.fillRect(-4, 12, 4, 1, 'SNOW');
  b.fillRect(-10, 14, 6, 1, 'SNOW'); // top 15

  wp.push(7.5, 3.6);
  wp.push(12.0, 4.6);
  wp.push(17.0, 5.6);
  wp.push(20.5, 7.6);
  wp.push(14.5, 9.6);
  wp.push(8.5, 11.6);
  wp.push(2.5, 13.6);
  wp.push(-2.0, 14.6);
  wp.push(-7.0, 15.6);

  // Express alpine zig-zag (Y = 15..35)
  const steps1: ReadonlyArray<[number, number, number, boolean]> = [
    [-4, 16, 5, true],
    [2, 18, 5, false],
    [8, 20, 5, true],
    [14, 22, 6, false],
    [18, 24, 5, true],
    [12, 26, 5, false],
    [6, 28, 5, true],
    [0, 30, 5, false],
    [-5, 32, 5, true],
    [0, 34, 6, false],
  ];
  for (let i = 0; i < steps1.length; i++) {
    const [x, y, w, isOneWay] = steps1[i];
    if (isOneWay) b.addOneWay(x, y, w, 'PLATFORM');
    else b.fillRect(x, y, w, 1, 'SNOW');
    wp.push(x + w * 0.5, y + 1.6);
  }

  // Quick wall-cling sprint chimney (Y = 35..47) with 3u lower entry doorway
  b.fillRect(5, 38, 2, 9, 'SNOW'); // left wall face X = 7 (open entry Y = 35..38)
  b.fillRect(11, 35, 2, 11, 'SNOW'); // right wall face X = 11
  b.addOneWay(9, 37, 2, 'PLATFORM'); // top 38
  b.addOneWay(7, 40, 2, 'PLATFORM'); // top 41
  b.addOneWay(9, 43, 2, 'PLATFORM'); // top 44
  b.fillRect(11, 46, 8, 1, 'SNOW'); // top 47
  wp.push(9.0, 36.6);
  wp.push(10.0, 38.6);
  wp.push(8.0, 41.6);
  wp.push(10.0, 44.6);
  wp.push(10.0, 47.6);
  wp.push(15.0, 47.6);

  // Final summit sprint staircase (Y = 47..62)
  const steps2: ReadonlyArray<[number, number, number, boolean]> = [
    [18, 48, 5, true],
    [13, 50, 5, false],
    [7, 52, 5, true],
    [1, 54, 5, false],
    [-4, 56, 5, true],
    [1, 58, 5, false],
    [6, 59, 5, true],
  ];
  for (let i = 0; i < steps2.length; i++) {
    const [x, y, w, isOneWay] = steps2[i];
    if (isOneWay) b.addOneWay(x, y, w, 'PLATFORM');
    else b.fillRect(x, y, w, 1, 'SNOW');
    wp.push(x + w * 0.5, y + 1.6);
  }

  finishSummitPlateau(b, wp, 10, summitY, 'SNOW', 'TT1 Finish!');
  return b.build();
}

// ============================================================================
// TT2: Pine Ledge Dash (foothills, 72 u) - Ice momentum, chimney & swing chasm
// ============================================================================
function buildTT2(): LevelData {
  const summitY = 72;
  const { b, wp } = initTrialBuilder(2, summitY, 'SNOW', 'SNOW');

  b.addSign({
    x: -3.5,
    y: 1.0,
    title: 'TT2: Pine Ledge Dash',
    text: 'Carry speed off Ice terraces and nail the mid-course Pendulum Swing (80s Platinum)!',
  });

  // Ice speed terrace climb (Y = 1..19)
  b.fillRect(5, 2, 5, 1, 'SNOW');
  b.fillIce(11, 4, 6, 1);
  b.fillRect(17, 6, 5, 1, 'SNOW');
  b.fillIce(11, 8, 6, 1);
  b.fillIce(4, 10, 6, 1);
  b.fillRect(-3, 12, 6, 1, 'SNOW');
  b.addOneWay(-8, 14, 5, 'PLATFORM');
  b.fillIce(-4, 16, 6, 1);
  b.fillRect(3, 18, 7, 1, 'SNOW'); // top 19

  wp.push(7.5, 3.6);
  wp.push(14.0, 5.6);
  wp.push(19.5, 7.6);
  wp.push(14.0, 9.6);
  wp.push(7.0, 11.6);
  wp.push(0.0, 13.6);
  wp.push(-5.5, 15.6);
  wp.push(-1.0, 17.6);
  wp.push(6.5, 19.6);

  // Mid-course Co-Op Pendulum Swing Chasm (Y = 19..29)
  b.fillRect(0, 20, 18, 1, 'SNOW'); // Rescue floor top Y = 21
  b.fillRect(-6, 22, 5, 1, 'SNOW'); // top 23
  b.fillRect(-10, 24, 5, 1, 'SNOW'); // top 25
  b.fillRect(-6, 26, 6, 1, 'SNOW'); // top 27
  b.fillRect(-1, 27, 6, 2, 'SNOW'); // Anchor ledge: X = -1..5, top Y = 29
  // Target ledge across ~5.0 u chasm: X = 10..18, top Y = 29
  b.fillRect(10, 27, 8, 2, 'SNOW');
  // Stepping stone below center for solo/speed fallback
  b.addOneWay(6, 26, 3, 'PLATFORM'); // top 27

  wp.push(9.0, 21.6);
  wp.push(-3.5, 23.6);
  wp.push(-7.5, 25.6);
  wp.push(-3.0, 27.6);
  wp.push(3.5, 29.6);
  wp.push(7.5, 28.6);
  wp.push(14.0, 29.6);

  // Tall Snow Chimney (Y = 29..47) with 3u lower entry doorway
  b.fillRect(15, 32, 2, 15, 'SNOW'); // left wall X = 17 (open entry Y = 29..32)
  b.fillRect(21, 29, 2, 17, 'SNOW'); // right wall X = 21
  b.addOneWay(19, 31, 2, 'PLATFORM');
  b.addOneWay(17, 34, 2, 'PLATFORM');
  b.addOneWay(19, 37, 2, 'PLATFORM');
  b.addOneWay(17, 40, 2, 'PLATFORM');
  b.addOneWay(19, 43, 2, 'PLATFORM');
  b.fillRect(10, 46, 7, 1, 'SNOW'); // top 47

  wp.push(19.0, 30.6);
  wp.push(20.0, 32.6);
  wp.push(18.0, 35.6);
  wp.push(20.0, 38.6);
  wp.push(18.0, 41.6);
  wp.push(20.0, 44.6);
  wp.push(18.0, 47.6);
  wp.push(13.5, 47.6);

  // Upper Pine Ridge Sprint (Y = 47..72)
  const upper: ReadonlyArray<[number, number, number, 'SNOW' | 'ICE' | 'PLATFORM']> = [
    [4, 48, 6, 'ICE'],
    [-3, 50, 6, 'SNOW'],
    [-9, 52, 5, 'PLATFORM'],
    [-4, 54, 6, 'ICE'],
    [3, 56, 5, 'SNOW'],
    [9, 58, 6, 'ICE'],
    [16, 60, 5, 'SNOW'],
    [11, 62, 5, 'PLATFORM'],
    [5, 64, 5, 'SNOW'],
    [-1, 66, 6, 'ICE'],
    [5, 68, 5, 'PLATFORM'],
    [9, 69, 5, 'SNOW'],
  ];
  for (let i = 0; i < upper.length; i++) {
    const [x, y, w, kind] = upper[i];
    if (kind === 'ICE') b.fillIce(x, y, w, 1);
    else if (kind === 'PLATFORM') b.addOneWay(x, y, w, 'PLATFORM');
    else b.fillRect(x, y, w, 1, 'SNOW');
    wp.push(x + w * 0.5, y + 1.6);
  }

  finishSummitPlateau(b, wp, 13, summitY, 'SNOW', 'TT2 Finish!');
  return b.build();
}

// ============================================================================
// TT3: Minecart Shaft (mines, 66 u) - DarkZone + fast CONTINUE/ENDS_STOP carts
// ============================================================================
function buildTT3(): LevelData {
  const summitY = 66;
  const { b, wp } = initTrialBuilder(3, summitY, 'DIRT', 'DIRT');

  b.addDarkZone({ minX: -14, maxX: 28, minY: 8, maxY: 64 });
  b.addSign({
    x: -3.5,
    y: 1.0,
    title: 'TT3: Minecart Shaft',
    text: 'Hop across moving minecarts in the dark shaft for Platinum (50s)!',
  });

  // Entry descent into dark shaft (Y = 1..11)
  b.addOneWay(5, 2, 5, 'PLATFORM');
  b.fillRect(10, 4, 5, 1, 'DIRT');
  b.addOneWay(15, 6, 5, 'PLATFORM');
  b.fillRect(17, 8, 8, 1, 'DIRT'); // top 9
  b.fillRect(15, 10, 10, 1, 'DIRT'); // top 11 (Minecart 1 dock)
  wp.push(7.5, 3.6);
  wp.push(12.5, 5.6);
  wp.push(17.5, 7.6);
  wp.push(20.0, 9.6);
  wp.push(18.0, 11.6);

  // Minecart 1 (CONTINUE diagonal right->left, Y = 11..19)
  b.addMovable({
    id: 'tt3_cart_1',
    startX: 11,
    startY: 10,
    endX: -4,
    endY: 18,
    w: 3.5,
    h: 1,
    speed: 4.5,
    mode: 'CONTINUE',
    terrain: 'MOVABLE',
  });
  b.addOneWay(10, 12, 4, 'PLATFORM');
  b.addOneWay(5, 14, 4, 'PLATFORM');
  b.addOneWay(0, 16, 4, 'PLATFORM');
  b.fillRect(-11, 18, 7, 1, 'DIRT'); // top 19
  wp.push(12.0, 13.6);
  wp.push(7.0, 15.6);
  wp.push(2.0, 17.6);
  wp.push(-7.5, 19.6);

  // Timber stairs Y = 19..29
  b.addOneWay(-6, 20, 5, 'PLATFORM');
  b.fillRect(-1, 22, 5, 1, 'DIRT');
  b.addOneWay(-6, 24, 5, 'PLATFORM');
  b.fillRect(-11, 26, 7, 1, 'DIRT');
  b.fillRect(-11, 28, 9, 1, 'DIRT'); // top 29 (Minecart 2 dock)
  wp.push(-3.5, 21.6);
  wp.push(1.5, 23.6);
  wp.push(-3.5, 25.6);
  wp.push(-7.5, 27.6);
  wp.push(-5.0, 29.6);

  // Minecart 2 (ENDS_STOP fast cross-shaft lift, Y = 29..39)
  b.addMovable({
    id: 'tt3_cart_2',
    startX: -1,
    startY: 28,
    endX: 14,
    endY: 38,
    w: 3.5,
    h: 1,
    speed: 4.8,
    mode: 'ENDS_STOP',
    terrain: 'MOVABLE',
  });
  b.addOneWay(0, 30, 4, 'PLATFORM');
  b.addOneWay(5, 32, 4, 'PLATFORM');
  b.addOneWay(10, 34, 4, 'PLATFORM');
  b.addOneWay(14, 36, 4, 'PLATFORM');
  b.fillRect(18, 38, 7, 1, 'DIRT'); // top 39
  wp.push(2.0, 31.6);
  wp.push(7.0, 33.6);
  wp.push(12.0, 35.6);
  wp.push(16.0, 37.6);
  wp.push(21.0, 39.6);

  // Shaft switchback + Minecart 3 (CONTINUE vertical express, Y = 39..57)
  b.addOneWay(14, 40, 5, 'PLATFORM');
  b.fillRect(9, 42, 5, 1, 'DIRT');
  b.addOneWay(4, 44, 5, 'PLATFORM');
  b.fillRect(-2, 46, 7, 1, 'DIRT'); // top 47 (Minecart 3 dock)
  wp.push(16.5, 41.6);
  wp.push(11.5, 43.6);
  wp.push(6.5, 45.6);
  wp.push(1.5, 47.6);

  b.addMovable({
    id: 'tt3_cart_3',
    startX: 6,
    startY: 46,
    endX: 6,
    endY: 56,
    w: 4.0,
    h: 1,
    speed: 4.4,
    mode: 'CONTINUE',
    terrain: 'MOVABLE',
  });
  b.addOneWay(11, 48, 4, 'PLATFORM');
  b.addOneWay(15, 50, 4, 'PLATFORM');
  b.addOneWay(11, 52, 4, 'PLATFORM');
  b.addOneWay(15, 54, 4, 'PLATFORM');
  b.fillRect(11, 56, 8, 1, 'DIRT'); // top 57
  wp.push(8.0, 48.6);
  wp.push(8.0, 52.6);
  wp.push(8.0, 56.6);
  wp.push(14.5, 57.6);

  // Exit shaft to Summit Flag (Y = 57..66)
  b.addOneWay(7, 58, 5, 'PLATFORM');
  b.fillRect(2, 60, 5, 1, 'DIRT');
  b.addOneWay(-2, 62, 5, 'PLATFORM');
  b.fillRect(3, 63, 5, 1, 'SNOW');
  wp.push(9.5, 59.6);
  wp.push(4.5, 61.6);
  wp.push(0.5, 63.6);
  wp.push(5.5, 64.6);

  finishSummitPlateau(b, wp, 10, summitY, 'SNOW', 'TT3 Finish!');
  return b.build();
}

// ============================================================================
// TT4: Headlamp Chasm (mines, 76 u) - DarkZone, FallingBlocks & START_STOP carts
// ============================================================================
function buildTT4(): LevelData {
  const summitY = 76;
  const { b, wp } = initTrialBuilder(4, summitY, 'DIRT', 'DIRT');

  b.addDarkZone({ minX: -14, maxX: 28, minY: 6, maxY: 74 });
  b.addSign({
    x: -3.5,
    y: 1.0,
    title: 'TT4: Headlamp Chasm',
    text: 'Sprint over crumbling stone bridges by headlamp light (65s Platinum)!',
  });

  // Ascent into chasm (Y = 1..15)
  b.fillRect(5, 2, 5, 1, 'DIRT');
  b.addOneWay(10, 4, 5, 'PLATFORM');
  b.fillRect(15, 6, 6, 1, 'DIRT');
  b.addOneWay(19, 8, 5, 'PLATFORM');
  b.fillRect(16, 10, 8, 1, 'DIRT');
  b.addOneWay(18, 12, 6, 'PLATFORM');
  b.fillRect(17, 14, 8, 1, 'DIRT'); // top 15
  wp.push(7.5, 3.6);
  wp.push(12.5, 5.6);
  wp.push(18.0, 7.6);
  wp.push(21.5, 9.6);
  wp.push(20.0, 11.6);
  wp.push(21.0, 13.6);
  wp.push(20.0, 15.6);

  // Crumbling FallingBlock Bridge #1 (right -> left at Y = 15)
  b.addFallingBlock({ id: 'tt4_fb_1', x: 12.5, y: 14, w: 3, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'tt4_fb_2', x: 8.0, y: 14, w: 3, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'tt4_fb_3', x: 3.5, y: 14, w: 3, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'tt4_fb_4', x: -1.0, y: 14, w: 3, h: 1, terrain: 'DIRT' });
  b.fillRect(-11, 14, 9, 1, 'DIRT'); // top 15
  wp.push(14.0, 15.6);
  wp.push(9.5, 15.6);
  wp.push(5.0, 15.6);
  wp.push(0.5, 15.6);
  wp.push(-6.5, 15.6);

  // Dark Wall-Cling Mine Chimney (Y = 15..33) with 3u lower entry doorway on right
  b.fillRect(-9, 15, 2, 18, 'DIRT'); // left face X = -7
  b.fillRect(-3, 18, 2, 14, 'DIRT'); // right face X = -3 (open entry Y = 15..18)
  b.addOneWay(-5, 17, 2, 'PLATFORM');
  b.addOneWay(-7, 20, 2, 'PLATFORM');
  b.addOneWay(-5, 23, 2, 'PLATFORM');
  b.addOneWay(-7, 26, 2, 'PLATFORM');
  b.addOneWay(-5, 29, 2, 'PLATFORM');
  b.fillRect(-3, 32, 9, 1, 'DIRT'); // top 33
  wp.push(-5.0, 16.6);
  wp.push(-4.0, 18.6);
  wp.push(-6.0, 21.6);
  wp.push(-4.0, 24.6);
  wp.push(-6.0, 27.6);
  wp.push(-4.0, 30.6);
  wp.push(-4.0, 33.6);
  wp.push(2.0, 33.6);

  // START_STOP Minecart Lift (Y = 33..45)
  b.addMovable({
    id: 'tt4_cart_startstop',
    startX: 7,
    startY: 32,
    endX: 17,
    endY: 44,
    w: 3.5,
    h: 1,
    speed: 4.5,
    mode: 'START_STOP',
    terrain: 'MOVABLE',
  });
  b.addOneWay(6, 34, 4, 'PLATFORM');
  b.addOneWay(10, 36, 4, 'PLATFORM');
  b.addOneWay(14, 38, 4, 'PLATFORM');
  b.addOneWay(10, 40, 4, 'PLATFORM');
  b.addOneWay(14, 42, 4, 'PLATFORM');
  b.fillRect(17, 44, 8, 1, 'DIRT'); // top 45
  wp.push(8.5, 35.6);
  wp.push(12.0, 37.6);
  wp.push(16.0, 39.6);
  wp.push(12.0, 41.6);
  wp.push(16.0, 43.6);
  wp.push(21.0, 45.6);

  // Crumbling Staircase #2 (Y = 45..59)
  b.addFallingBlock({ id: 'tt4_fb_5', x: 13, y: 46, w: 3.5, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'tt4_fb_6', x: 8, y: 48, w: 3.5, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'tt4_fb_7', x: 3, y: 50, w: 3.5, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'tt4_fb_8', x: -2, y: 52, w: 3.5, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'tt4_fb_9', x: 3, y: 54, w: 3.5, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'tt4_fb_10', x: 8, y: 56, w: 3.5, h: 1, terrain: 'DIRT' });
  b.fillRect(12, 58, 9, 1, 'DIRT'); // top 59
  wp.push(14.7, 47.6);
  wp.push(9.7, 49.6);
  wp.push(4.7, 51.6);
  wp.push(-0.2, 53.6);
  wp.push(4.7, 55.6);
  wp.push(9.7, 57.6);
  wp.push(16.5, 59.6);

  // STEP_STOP final minecart + daylight sprint (Y = 59..76)
  b.addMovable({
    id: 'tt4_cart_stepstop',
    startX: 7,
    startY: 58,
    endX: -5,
    endY: 66,
    w: 3.5,
    h: 1,
    speed: 4.4,
    mode: 'STEP_STOP',
    terrain: 'MOVABLE',
  });
  b.addOneWay(8, 60, 4, 'PLATFORM');
  b.addOneWay(3, 62, 4, 'PLATFORM');
  b.addOneWay(-2, 64, 4, 'PLATFORM');
  b.fillRect(-10, 66, 7, 1, 'DIRT'); // top 67
  b.addOneWay(-5, 68, 5, 'PLATFORM');
  b.fillRect(0, 70, 5, 1, 'DIRT');
  b.addOneWay(5, 72, 5, 'PLATFORM');
  b.fillRect(10, 73, 5, 1, 'SNOW');
  wp.push(10.0, 61.6);
  wp.push(5.0, 63.6);
  wp.push(0.0, 65.6);
  wp.push(-6.5, 67.6);
  wp.push(-2.5, 69.6);
  wp.push(2.5, 71.6);
  wp.push(7.5, 73.6);
  wp.push(12.5, 74.6);

  finishSummitPlateau(b, wp, 16, summitY, 'SNOW', 'TT4 Finish!');
  return b.build();
}

// ============================================================================
// TT5: Gale Pendulum (crags, 74 u) - Cyclic WindZones & 2 Wind SwingPlatforms
// ============================================================================
function buildTT5(): LevelData {
  const summitY = 74;
  const { b, wp } = initTrialBuilder(5, summitY, 'SNOW', 'SNOW');

  b.addSign({
    x: -3.5,
    y: 1.0,
    title: 'TT5: Gale Pendulum',
    text: 'Ride wind-driven hanging cradles across twin crag chasms (60s Platinum)!',
  });

  // Lower cyclic wind zone (blowing right) + upper cyclic wind zone (blowing left)
  b.addWindZone({
    id: 'tt5_wind_1',
    minX: -14,
    maxX: 28,
    minY: 12,
    maxY: 42,
    dir: 1,
    activeTime: PHYSICS.WIND_ACTIVE_TIME,
    waitTime: PHYSICS.WIND_WAIT_TIME,
    constant: false,
    strength: 1.0,
  });
  b.addWindZone({
    id: 'tt5_wind_2',
    minX: -14,
    maxX: 28,
    minY: 44,
    maxY: 72,
    dir: -1,
    activeTime: PHYSICS.WIND_ACTIVE_TIME,
    waitTime: PHYSICS.WIND_WAIT_TIME,
    constant: false,
    strength: 1.0,
  });

  // Approach ledges to Cradle #1 (Y = 1..15)
  b.fillRect(-6, 2, 5, 1, 'SNOW');
  b.addOneWay(-10, 4, 5, 'PLATFORM');
  b.fillRect(-6, 6, 5, 1, 'SNOW');
  b.addOneWay(-10, 8, 5, 'PLATFORM');
  b.fillRect(-6, 10, 5, 1, 'SNOW');
  b.addOneWay(-10, 12, 5, 'PLATFORM');
  b.fillRect(-11, 14, 9, 1, 'SNOW'); // top 15 (Boarding deck #1)
  wp.push(-3.5, 3.6);
  wp.push(-7.5, 5.6);
  wp.push(-3.5, 7.6);
  wp.push(-7.5, 9.6);
  wp.push(-3.5, 11.6);
  wp.push(-7.5, 13.6);
  wp.push(-4.5, 15.6);

  // Wind-Driven SwingPlatform #1 (rests X=0..4, Y=16; swings right to X=8.5..12.5, Y=19.5)
  b.addSwingPlatform({
    id: 'tt5_swing_1',
    pivotX: 2.0,
    pivotY: 28.2,
    w: 4.0,
    h: 1.0,
    radius: 12.2,
    maxDisplacement: 8.6,
    swingTime: 1.15,
    windDriven: true,
  });
  b.fillRect(14, 18, 11, 1, 'SNOW'); // top 19
  wp.push(2.0, 16.6);
  wp.push(8.0, 18.2);
  wp.push(18.0, 19.6);

  // Windy Crag Ridge Switchback (Y = 19..47)
  const midCrag: ReadonlyArray<[number, number, number, boolean]> = [
    [19, 20, 5, true],
    [14, 22, 5, false],
    [19, 24, 5, true],
    [14, 26, 5, false],
    [8, 28, 5, true],
    [2, 30, 5, false],
    [-4, 32, 5, true],
    [1, 34, 5, false],
    [7, 36, 5, true],
    [13, 38, 5, false],
    [18, 40, 5, true],
    [14, 42, 6, false],
    [17, 44, 6, true],
    [16, 46, 9, false], // top 47 (Boarding deck #2)
  ];
  for (let i = 0; i < midCrag.length; i++) {
    const [x, y, w, oneWay] = midCrag[i];
    if (oneWay) b.addOneWay(x, y, w, 'PLATFORM');
    else b.fillRect(x, y, w, 1, 'SNOW');
    wp.push(x + w * 0.5, y + 1.6);
  }

  // Wind-Driven SwingPlatform #2 (wind dir = -1: rests X=10..14, Y=48; swings left to X=1.5..5.5, Y=51.5)
  b.addSwingPlatform({
    id: 'tt5_swing_2',
    pivotX: 12.0,
    pivotY: 60.2,
    w: 4.0,
    h: 1.0,
    radius: 12.2,
    maxDisplacement: 8.6,
    swingTime: 1.15,
    windDriven: true,
  });
  b.fillRect(-11, 50, 11, 1, 'SNOW'); // top 51
  wp.push(12.0, 48.6);
  wp.push(6.0, 50.2);
  wp.push(-4.5, 51.6);

  // Final gale-swept crag steps to Summit (Y = 51..74)
  const topCrag: ReadonlyArray<[number, number, number, boolean]> = [
    [-10, 52, 5, true],
    [-5, 54, 5, false],
    [1, 56, 5, true],
    [7, 58, 5, false],
    [12, 60, 5, true],
    [7, 62, 5, false],
    [1, 64, 5, true],
    [-4, 66, 5, false],
    [1, 68, 5, true],
    [6, 70, 5, false],
    [10, 71, 5, true],
  ];
  for (let i = 0; i < topCrag.length; i++) {
    const [x, y, w, oneWay] = topCrag[i];
    if (oneWay) b.addOneWay(x, y, w, 'PLATFORM');
    else b.fillRect(x, y, w, 1, 'SNOW');
    wp.push(x + w * 0.5, y + 1.6);
  }

  finishSummitPlateau(b, wp, 14, summitY, 'SNOW', 'TT5 Finish!');
  return b.build();
}

// ============================================================================
// TT6: Crumble Spire (crags, 78 u) - High-tempo FallingBlocks + wind + Swing vault
// ============================================================================
function buildTT6(): LevelData {
  const summitY = 78;
  const { b, wp } = initTrialBuilder(6, summitY, 'SNOW', 'SNOW');

  b.addSign({
    x: -3.5,
    y: 1.0,
    title: 'TT6: Crumble Spire',
    text: 'Never stop moving across the crumbling rock spire (55s Platinum)!',
  });

  b.addWindZone({
    id: 'tt6_wind',
    minX: -14,
    maxX: 28,
    minY: 20,
    maxY: 74,
    dir: 1,
    activeTime: PHYSICS.WIND_ACTIVE_TIME,
    waitTime: PHYSICS.WIND_WAIT_TIME,
    constant: false,
    strength: 0.9,
  });

  // Crumbling Spiral Run #1 (Y = 1..25)
  b.fillRect(5, 2, 5, 1, 'SNOW');
  b.addFallingBlock({ id: 'tt6_fb_1', x: 11, y: 4, w: 3.5, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'tt6_fb_2', x: 16, y: 6, w: 3.5, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'tt6_fb_3', x: 11, y: 8, w: 3.5, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'tt6_fb_4', x: 6, y: 10, w: 3.5, h: 1, terrain: 'DIRT' });
  b.fillRect(-1, 12, 6, 1, 'SNOW'); // Rest shelf top 13
  b.addFallingBlock({ id: 'tt6_fb_5', x: -7, y: 14, w: 3.5, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'tt6_fb_6', x: -2, y: 16, w: 3.5, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'tt6_fb_7', x: 3, y: 18, w: 3.5, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'tt6_fb_8', x: 8, y: 20, w: 3.5, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'tt6_fb_9', x: 13, y: 22, w: 3.5, h: 1, terrain: 'DIRT' });
  b.fillRect(17, 24, 8, 1, 'SNOW'); // Rest shelf top 25

  wp.push(7.5, 3.6);
  wp.push(12.7, 5.6);
  wp.push(17.7, 7.6);
  wp.push(12.7, 9.6);
  wp.push(7.7, 11.6);
  wp.push(2.0, 13.6);
  wp.push(-5.2, 15.6);
  wp.push(-0.2, 17.6);
  wp.push(4.7, 19.6);
  wp.push(9.7, 21.6);
  wp.push(14.7, 23.6);
  wp.push(21.0, 25.6);

  // Crumbling Bridge + Grabbable Pillar Climb (Y = 25..49)
  b.addFallingBlock({ id: 'tt6_fb_10', x: 12, y: 26, w: 3.5, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'tt6_fb_11', x: 7, y: 28, w: 3.5, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'tt6_fb_12', x: 2, y: 30, w: 3.5, h: 1, terrain: 'DIRT' });
  b.fillRect(-5, 32, 6, 1, 'SNOW'); // top 33

  // Grabbable central spire pillar X = -1..2, Y = 36..48 (3u open arch at Y = 33..36!)
  b.fillRect(-1, 36, 3, 12, 'SNOW');
  b.addOneWay(-5, 35, 4, 'PLATFORM');
  b.addOneWay(-5, 38, 4, 'PLATFORM');
  b.addOneWay(-5, 41, 4, 'PLATFORM');
  b.addOneWay(-5, 44, 4, 'PLATFORM');
  b.fillRect(-10, 47, 10, 1, 'SNOW'); // top 48 (Swing vault dock)

  wp.push(13.7, 27.6);
  wp.push(8.7, 29.6);
  wp.push(3.7, 31.6);
  wp.push(-2.0, 33.6);
  wp.push(-3.0, 36.6);
  wp.push(-3.0, 39.6);
  wp.push(-3.0, 42.6);
  wp.push(-3.0, 45.6);
  wp.push(-3.0, 48.6);

  // Wind-driven SwingPlatform Spire Vault (Y = 48..53)
  b.addSwingPlatform({
    id: 'tt6_swing_vault',
    pivotX: 3.0,
    pivotY: 61.3,
    w: 4.0,
    h: 1.0,
    radius: 12.3,
    maxDisplacement: 8.8,
    swingTime: 1.2,
    windDriven: true,
  });
  b.fillRect(15, 51, 10, 1, 'SNOW'); // top 52
  wp.push(3.0, 49.6);
  wp.push(9.5, 51.2);
  wp.push(19.0, 52.6);

  // Final Crumbling Spire Gauntlet (Y = 52..78)
  b.addFallingBlock({ id: 'tt6_fb_13', x: 13, y: 53, w: 3.5, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'tt6_fb_14', x: 8, y: 55, w: 3.5, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'tt6_fb_15', x: 3, y: 57, w: 3.5, h: 1, terrain: 'DIRT' });
  b.fillRect(-4, 59, 6, 1, 'SNOW'); // top 60
  b.addFallingBlock({ id: 'tt6_fb_16', x: 2, y: 61, w: 3.5, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'tt6_fb_17', x: 7, y: 63, w: 3.5, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'tt6_fb_18', x: 12, y: 65, w: 3.5, h: 1, terrain: 'DIRT' });
  b.fillRect(16, 67, 6, 1, 'SNOW'); // top 68
  b.addFallingBlock({ id: 'tt6_fb_19', x: 11, y: 69, w: 3.5, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'tt6_fb_20', x: 6, y: 71, w: 3.5, h: 1, terrain: 'DIRT' });
  b.addFallingBlock({ id: 'tt6_fb_21', x: 1, y: 73, w: 3.5, h: 1, terrain: 'DIRT' });
  b.fillRect(4, 75, 5, 1, 'SNOW'); // top 76

  wp.push(14.7, 54.6);
  wp.push(9.7, 56.6);
  wp.push(4.7, 58.6);
  wp.push(-1.0, 60.6);
  wp.push(3.7, 62.6);
  wp.push(8.7, 64.6);
  wp.push(13.7, 66.6);
  wp.push(19.0, 68.6);
  wp.push(12.7, 70.6);
  wp.push(7.7, 72.6);
  wp.push(2.7, 74.6);
  wp.push(6.5, 76.6);

  finishSummitPlateau(b, wp, 10, summitY, 'SNOW', 'TT6 Finish!');
  return b.build();
}

// ============================================================================
// TT7: Glacier Slip (summit, 70 u) - Slick ICE terraces, ICE slopes & steady gale
// ============================================================================
function buildTT7(): LevelData {
  const summitY = 70;
  const { b, wp } = initTrialBuilder(7, summitY, 'ICE', 'SNOW');

  b.addSign({
    x: -3.5,
    y: 1.0,
    title: 'TT7: Glacier Slip',
    text: 'Control your ice slide momentum and catch on snow pads (70s Platinum)!',
  });

  // Upper constant summit breeze
  b.addWindZone({
    id: 'tt7_gale',
    minX: -14,
    maxX: 28,
    minY: 36,
    maxY: 72,
    dir: -1,
    activeTime: 5.0,
    waitTime: 0,
    constant: true,
    strength: 0.75,
  });

  // Lower Glacier Ice Terraces & Slopes (Y = 1..33)
  b.fillIce(5, 2, 7, 1);
  b.fillRect(12, 2, 2, 2, 'SNOW'); // Snow brake bumper!
  b.fillIce(14, 4, 7, 1);
  b.addOneWay(18, 6, 5, 'PLATFORM');
  b.fillIce(11, 8, 7, 1);
  b.addSlope({ id: 'tt7_ice_slope_1', x: 7, y: 9, w: 4, h: 2, dir: 'left', terrain: 'ICE' });
  b.fillIce(7, 8, 4, 1);
  b.fillIce(1, 10, 6, 1);
  b.fillRect(-5, 12, 6, 1, 'SNOW'); // Grippy snow turn
  b.fillIce(-10, 14, 6, 1);
  b.fillIce(-4, 16, 7, 1);
  b.fillIce(4, 18, 7, 1);
  b.fillRect(12, 20, 5, 1, 'SNOW');
  b.fillIce(17, 22, 6, 1);
  b.fillIce(11, 24, 6, 1);
  b.fillIce(4, 26, 6, 1);
  b.fillRect(-3, 28, 6, 1, 'SNOW');
  b.fillIce(-8, 30, 6, 1);
  b.fillIce(-2, 32, 7, 1);

  wp.push(8.5, 3.6);
  wp.push(17.5, 5.6);
  wp.push(20.5, 7.6);
  wp.push(14.5, 9.6);
  wp.push(9.0, 10.6);
  wp.push(4.0, 11.6);
  wp.push(-2.0, 13.6);
  wp.push(-7.0, 15.6);
  wp.push(-0.5, 17.6);
  wp.push(7.5, 19.6);
  wp.push(14.5, 21.6);
  wp.push(20.0, 23.6);
  wp.push(14.0, 25.6);
  wp.push(7.0, 27.6);
  wp.push(0.0, 29.6);
  wp.push(-5.0, 31.6);
  wp.push(1.5, 33.6);

  // Upper Wind-Swept Glacier Sprint (Y = 33..70)
  const glacierUpper: ReadonlyArray<[number, number, number, 'ICE' | 'SNOW' | 'PLATFORM']> = [
    [6, 34, 7, 'ICE'],
    [14, 36, 6, 'SNOW'],
    [18, 38, 6, 'ICE'],
    [12, 40, 6, 'ICE'],
    [5, 42, 6, 'SNOW'],
    [-2, 44, 7, 'ICE'],
    [-9, 46, 6, 'SNOW'],
    [-3, 48, 7, 'ICE'],
    [5, 50, 6, 'ICE'],
    [12, 52, 6, 'SNOW'],
    [17, 54, 6, 'ICE'],
    [11, 56, 6, 'ICE'],
    [4, 58, 6, 'SNOW'],
    [-3, 60, 6, 'ICE'],
    [2, 62, 6, 'PLATFORM'],
    [8, 64, 6, 'ICE'],
    [13, 66, 6, 'SNOW'],
    [9, 67, 5, 'PLATFORM'],
  ];
  for (let i = 0; i < glacierUpper.length; i++) {
    const [x, y, w, kind] = glacierUpper[i];
    if (kind === 'ICE') b.fillIce(x, y, w, 1);
    else if (kind === 'PLATFORM') b.addOneWay(x, y, w, 'PLATFORM');
    else b.fillRect(x, y, w, 1, 'SNOW');
    wp.push(x + w * 0.5, y + 1.6);
  }

  finishSummitPlateau(b, wp, 6, summitY, 'SNOW', 'TT7 Finish!');
  return b.build();
}

// ============================================================================
// TT8: Summit Tempest (summit, 84 u) - Constant Peak Gale + Ice + FallingBlocks + Swing
// ============================================================================
function buildTT8(): LevelData {
  const summitY = 84;
  const { b, wp } = initTrialBuilder(8, summitY, 'ICE', 'SNOW');

  b.addSign({
    x: -3.5,
    y: 1.0,
    title: 'TT8: Summit Tempest',
    text: 'Brave a constant peak gale across glacier ice and frost cradles (60s Platinum)!',
  });

  // Constant Summit Gale across entire ascent (Y = 8..86)
  b.addWindZone({
    id: 'tt8_tempest_gale',
    minX: -14,
    maxX: 28,
    minY: 8,
    maxY: 86,
    dir: 1,
    activeTime: 5.0,
    waitTime: 0,
    constant: true,
    strength: 0.95,
  });

  // Gale Ice Warmup (Y = 1..25)
  const phase1: ReadonlyArray<[number, number, number, 'ICE' | 'SNOW' | 'FB']> = [
    [5, 2, 6, 'SNOW'],
    [12, 4, 6, 'ICE'],
    [18, 6, 6, 'SNOW'],
    [12, 8, 6, 'ICE'],
    [5, 10, 5, 'FB'],
    [-2, 12, 6, 'SNOW'],
    [-8, 14, 6, 'ICE'],
    [-2, 16, 5, 'FB'],
    [4, 18, 6, 'ICE'],
    [11, 20, 6, 'SNOW'],
    [4, 22, 6, 'ICE'],
    [-4, 24, 8, 'SNOW'], // top 25
  ];
  for (let i = 0; i < phase1.length; i++) {
    const [x, y, w, kind] = phase1[i];
    if (kind === 'ICE') b.fillIce(x, y, w, 1);
    else if (kind === 'FB') {
      b.addFallingBlock({ id: `tt8_fb_p1_${i}`, x, y, w: 3.5, h: 1, terrain: 'SNOW' });
    } else {
      b.fillRect(x, y, w, 1, 'SNOW');
    }
    wp.push(x + (kind === 'FB' ? 1.75 : w * 0.5), y + 1.6);
  }

  // Constant-gale SwingPlatform over Ice Abyss (Y = 25..31)
  b.fillRect(-10, 26, 9, 1, 'SNOW'); // top 27
  wp.push(-4.0, 27.6);
  b.addSwingPlatform({
    id: 'tt8_swing_gale',
    pivotX: 2.0,
    pivotY: 40.2,
    w: 4.0,
    h: 1.0,
    radius: 12.2,
    maxDisplacement: 8.6,
    swingTime: 1.25,
    windDriven: true,
  });
  // Mid-gap ice island for fast jumps when cradle is shifted
  b.fillIce(5, 28, 4, 1); // top 29
  b.fillRect(14, 30, 10, 1, 'SNOW'); // top 31
  wp.push(2.0, 28.6);
  wp.push(7.0, 29.6);
  wp.push(18.0, 31.6);

  // Upper Glacier Tempest Climb (Y = 31..84)
  const phase2: ReadonlyArray<[number, number, number, 'ICE' | 'SNOW' | 'FB' | 'PLAT']> = [
    [18, 32, 6, 'ICE'],
    [12, 34, 5, 'FB'],
    [6, 36, 6, 'SNOW'],
    [0, 38, 6, 'ICE'],
    [-6, 40, 5, 'FB'],
    [-10, 42, 6, 'SNOW'],
    [-4, 44, 6, 'ICE'],
    [3, 46, 5, 'FB'],
    [9, 48, 6, 'SNOW'],
    [16, 50, 6, 'ICE'],
    [19, 52, 5, 'PLAT'],
    [13, 54, 6, 'SNOW'],
    [6, 56, 5, 'FB'],
    [0, 58, 6, 'ICE'],
    [-6, 60, 6, 'SNOW'],
    [-1, 62, 5, 'FB'],
    [5, 64, 6, 'ICE'],
    [12, 66, 6, 'SNOW'],
    [17, 68, 5, 'PLAT'],
    [11, 70, 6, 'ICE'],
    [4, 72, 5, 'FB'],
    [-2, 74, 6, 'SNOW'],
    [3, 76, 6, 'ICE'],
    [9, 78, 6, 'SNOW'],
    [14, 80, 5, 'PLAT'],
    [9, 82, 5, 'SNOW'],
  ];
  for (let i = 0; i < phase2.length; i++) {
    const [x, y, w, kind] = phase2[i];
    if (kind === 'ICE') b.fillIce(x, y, w, 1);
    else if (kind === 'PLAT') b.addOneWay(x, y, w, 'PLATFORM');
    else if (kind === 'FB') {
      b.addFallingBlock({ id: `tt8_fb_p2_${i}`, x, y, w: 3.5, h: 1, terrain: 'SNOW' });
    } else {
      b.fillRect(x, y, w, 1, 'SNOW');
    }
    wp.push(x + (kind === 'FB' ? 1.75 : w * 0.5), y + 1.6);
  }

  finishSummitPlateau(b, wp, 6, summitY, 'SNOW', 'TT8 Finish!');
  return b.build();
}

// ============================================================================
// TT9: Circuit Piston Run (lab, 76 u) - Switches, Troncho launches & Chroma sprints
// ============================================================================
function buildTT9(): LevelData {
  const summitY = 76;
  const { b, wp } = initTrialBuilder(9, summitY, 'LAB', 'LAB');

  b.addSign({
    x: -3.5,
    y: 1.0,
    title: 'TT9: Circuit Piston Run',
    text: 'Chain pneumatic Troncho launches and Chroma pads for Platinum (50s)!',
  });

  // Troncho Launch #1 right off spawn (Y = 1 -> 9)
  b.addButton({
    id: 'tt9_btn_1',
    x: 4.5,
    y: 1,
    w: 1.5,
    h: 0.5,
    kind: 'switch',
    circuitId: 'tt9_c1',
    duration: 0,
  });
  b.addCircuit({
    id: 'tt9_c1',
    nodes: [
      { x: 5.25, y: 1.15 },
      { x: 9.5, y: 1.15 },
      { x: 9.5, y: 5.5 },
    ],
  });
  b.addTroncho({
    id: 'tt9_tr_1',
    baseX: 8,
    baseY: 1,
    extX: 8,
    extY: 5,
    w: 3,
    h: 1,
    circuitId: 'tt9_c1',
    launchImpulse: 22.0,
    grabbable: true,
    terrain: 'TRONCHO',
  });
  b.addOneWay(13, 2, 4, 'LAB_PLATFORM');
  b.addOneWay(16, 4, 4, 'LAB_PLATFORM2');
  b.addOneWay(12, 6, 4, 'LAB_PLATFORM');
  b.fillRect(-1, 8, 8, 1, 'LAB2'); // X = -1..7, top 9 (clear of Troncho shaft 8..11!)
  wp.push(5.25, 1.6);
  wp.push(9.5, 2.6);
  wp.push(9.5, 5.6);
  wp.push(9.5, 9.6);
  wp.push(4.5, 9.6);

  // Fast Steel Switchback + Timed Troncho #2 (Y = 9..27)
  b.addOneWay(-2, 10, 5, 'LAB_PLATFORM');
  b.fillRect(-8, 12, 6, 1, 'LAB');
  b.addOneWay(-3, 14, 5, 'LAB_PLATFORM2');
  b.fillRect(-9, 16, 11, 1, 'LAB2'); // top 17 (Troncho #2 pad)
  wp.push(0.5, 11.6);
  wp.push(-5.0, 13.6);
  wp.push(-0.5, 15.6);
  wp.push(-4.5, 17.6);

  b.addButton({
    id: 'tt9_btn_2',
    x: -7.5,
    y: 17,
    w: 1.5,
    h: 0.5,
    kind: 'timed',
    circuitId: 'tt9_c2',
    duration: 4.5,
  });
  b.addCircuit({
    id: 'tt9_c2',
    nodes: [
      { x: -6.75, y: 17.15 },
      { x: -1.5, y: 17.15 },
      { x: -1.5, y: 22.0 },
    ],
  });
  b.addTroncho({
    id: 'tt9_tr_2',
    baseX: -3,
    baseY: 17,
    extX: -3,
    extY: 22,
    w: 3,
    h: 1,
    circuitId: 'tt9_c2',
    launchImpulse: 22.5,
    grabbable: true,
    terrain: 'TRONCHO',
  });
  b.addOneWay(2, 18, 4, 'LAB_PLATFORM');
  b.addOneWay(6, 20, 4, 'LAB_PLATFORM2');
  b.addOneWay(2, 22, 4, 'LAB_PLATFORM');
  b.addOneWay(6, 24, 4, 'LAB_PLATFORM2');
  b.fillRect(0, 26, 10, 1, 'LAB'); // top 27
  wp.push(-1.5, 18.6);
  wp.push(-1.5, 22.6);
  wp.push(-1.5, 25.6);
  wp.push(-1.5, 27.6);
  wp.push(4.0, 27.6);

  // Chroma Split Sprint (Y = 27..41)
  b.addColorPlatform({ id: 'tt9_cp_k1', x: 6, y: 28, w: 4, h: 1, owner: 'krunked' });
  b.addColorPlatform({ id: 'tt9_cp_f1', x: 10, y: 28, w: 4, h: 1, owner: 'fred' });
  b.addOneWay(9, 28, 2, 'LAB_PLATFORM');
  b.addColorPlatform({ id: 'tt9_cp_k2', x: 11, y: 30, w: 4, h: 1, owner: 'krunked' });
  b.addColorPlatform({ id: 'tt9_cp_f2', x: 15, y: 30, w: 4, h: 1, owner: 'fred' });
  b.addOneWay(14, 30, 2, 'LAB_PLATFORM2');
  b.fillRect(15, 32, 8, 1, 'LAB2'); // top 33
  b.addColorPlatform({ id: 'tt9_cp_k3', x: 9, y: 34, w: 4, h: 1, owner: 'krunked' });
  b.addColorPlatform({ id: 'tt9_cp_f3', x: 13, y: 34, w: 4, h: 1, owner: 'fred' });
  b.addOneWay(12, 34, 2, 'LAB_PLATFORM');
  b.addColorPlatform({ id: 'tt9_cp_k4', x: 3, y: 36, w: 4, h: 1, owner: 'krunked' });
  b.addColorPlatform({ id: 'tt9_cp_f4', x: 7, y: 36, w: 4, h: 1, owner: 'fred' });
  b.addOneWay(6, 36, 2, 'LAB_PLATFORM2');
  b.fillRect(-4, 38, 10, 1, 'LAB'); // top 39
  wp.push(10.0, 29.6);
  wp.push(15.0, 31.6);
  wp.push(19.0, 33.6);
  wp.push(13.0, 35.6);
  wp.push(7.0, 37.6);
  wp.push(1.0, 39.6);

  // Troncho Launch #3 (Y = 39 -> 49)
  b.addButton({
    id: 'tt9_btn_3',
    x: -2.5,
    y: 39,
    w: 1.5,
    h: 0.5,
    kind: 'switch',
    circuitId: 'tt9_c3',
    duration: 0,
  });
  b.addCircuit({
    id: 'tt9_c3',
    nodes: [
      { x: -1.75, y: 39.15 },
      { x: 2.5, y: 39.15 },
      { x: 2.5, y: 44.5 },
    ],
  });
  b.addTroncho({
    id: 'tt9_tr_3',
    baseX: 1,
    baseY: 39,
    extX: 1,
    extY: 44,
    w: 3,
    h: 1,
    circuitId: 'tt9_c3',
    launchImpulse: 23.0,
    grabbable: true,
    terrain: 'TRONCHO',
  });
  b.addOneWay(-5, 40, 4, 'LAB_PLATFORM');
  b.addOneWay(-9, 42, 4, 'LAB_PLATFORM2');
  b.addOneWay(-5, 44, 4, 'LAB_PLATFORM');
  b.addOneWay(-1, 46, 4, 'LAB_PLATFORM2');
  b.fillRect(5, 48, 9, 1, 'LAB2'); // X = 5..14, top 49 (clear of Troncho shaft 1..4!)
  wp.push(2.5, 40.6);
  wp.push(2.5, 44.6);
  wp.push(2.5, 49.6);
  wp.push(9.0, 49.6);

  // Upper Catwalks + Final Troncho #4 Vault to Summit (Y = 49..76)
  b.addOneWay(13, 50, 5, 'LAB_PLATFORM');
  b.fillRect(17, 52, 6, 1, 'LAB');
  b.addOneWay(12, 54, 5, 'LAB_PLATFORM2');
  b.fillRect(6, 56, 6, 1, 'LAB2');
  b.addOneWay(0, 58, 5, 'LAB_PLATFORM');
  b.fillRect(-6, 60, 11, 1, 'LAB'); // top 61 (Troncho #4 deck)
  wp.push(15.5, 51.6);
  wp.push(20.0, 53.6);
  wp.push(14.5, 55.6);
  wp.push(9.0, 57.6);
  wp.push(2.5, 59.6);
  wp.push(-1.0, 61.6);

  b.addButton({
    id: 'tt9_btn_4',
    x: -4.5,
    y: 61,
    w: 1.5,
    h: 0.5,
    kind: 'timed',
    circuitId: 'tt9_c4',
    duration: 5.0,
  });
  b.addCircuit({
    id: 'tt9_c4',
    nodes: [
      { x: -3.75, y: 61.15 },
      { x: 1.5, y: 61.15 },
      { x: 1.5, y: 66.5 },
    ],
  });
  b.addTroncho({
    id: 'tt9_tr_4',
    baseX: 0,
    baseY: 61,
    extX: 0,
    extY: 66,
    w: 3,
    h: 1,
    circuitId: 'tt9_c4',
    launchImpulse: 23.0,
    grabbable: true,
    terrain: 'TRONCHO',
  });
  b.addOneWay(5, 62, 4, 'LAB_PLATFORM');
  b.addOneWay(9, 64, 4, 'LAB_PLATFORM2');
  b.addOneWay(5, 66, 4, 'LAB_PLATFORM');
  b.addOneWay(9, 68, 4, 'LAB_PLATFORM2');
  b.fillRect(4, 70, 9, 1, 'LAB2'); // top 71
  b.addOneWay(12, 72, 5, 'LAB_PLATFORM'); // top 73
  b.addOneWay(8, 73, 5, 'LAB_PLATFORM2'); // top 74
  wp.push(1.5, 62.6);
  wp.push(1.5, 66.6);
  wp.push(1.5, 69.6);
  wp.push(1.5, 71.6);
  wp.push(8.5, 71.6);
  wp.push(14.5, 73.6);
  wp.push(10.5, 74.6);

  finishSummitPlateau(b, wp, 6, summitY, 'LAB2', 'TT9 Finish!');
  return b.build();
}

// ============================================================================
// TT10: Laser Gauntlet (lab, 85 u) - Timed Laser Gates, Hurdles, Tronchos & Finale
// ============================================================================
function buildTT10(): LevelData {
  const summitY = 85;
  const { b, wp } = initTrialBuilder(10, summitY, 'LAB2', 'LAB2');

  b.addSign({
    x: -3.5,
    y: 1.0,
    title: 'TT10: Laser Gauntlet',
    text: 'Disarm timed Laser gates, hurdle beams, and launch through the final Lab shaft (57s Platinum)!',
  });

  // Laser Gallery #1 right at Y = 1 (Timed switch disarms gate + hurdle)
  b.addButton({
    id: 'tt10_btn_1',
    x: 4.0,
    y: 1,
    w: 1.5,
    h: 0.5,
    kind: 'timed',
    circuitId: 'tt10_c1',
    duration: 5.0,
  });
  b.addCircuit({
    id: 'tt10_c1',
    nodes: [
      { x: 4.75, y: 1.15 },
      { x: 4.75, y: 5.2 },
      { x: 10.5, y: 5.2 },
    ],
  });
  b.fillRect(9, 5, 3, 1, 'LAB');
  b.addLaser({
    id: 'tt10_laser_1',
    x1: 10.5,
    y1: 1.15,
    x2: 10.5,
    y2: 4.9,
    circuitId: 'tt10_c1',
    invertPower: true,
  });
  b.addOneWay(15, 2, 5, 'LAB_PLATFORM');
  b.addOneWay(19, 4, 5, 'LAB_PLATFORM2');
  b.addOneWay(14, 6, 5, 'LAB_PLATFORM');
  b.fillRect(7, 8, 9, 1, 'LAB'); // top 9
  wp.push(4.75, 1.6);
  wp.push(10.5, 1.6);
  wp.push(17.5, 3.6);
  wp.push(21.5, 5.6);
  wp.push(16.5, 7.6);
  wp.push(11.5, 9.6);

  // Laser Hurdle Sprint Corridor (Y = 9..23)
  b.fillRect(-10, 8, 17, 1, 'LAB'); // full floor X = -10..16, top 9
  b.addButton({
    id: 'tt10_btn_2',
    x: 6.5,
    y: 9,
    w: 1.5,
    h: 0.5,
    kind: 'switch',
    circuitId: 'tt10_c2',
    duration: 0,
  });
  b.addCircuit({
    id: 'tt10_c2',
    nodes: [
      { x: 7.25, y: 9.15 },
      { x: 0.5, y: 9.15 },
      { x: 0.5, y: 13.2 },
    ],
  });
  b.fillRect(-1, 13, 3, 1, 'LAB2');
  b.addLaser({
    id: 'tt10_laser_2',
    x1: 0.5,
    y1: 9.15,
    x2: 0.5,
    y2: 12.9,
    circuitId: 'tt10_c2',
    invertPower: true,
  });
  b.addOneWay(-8, 10, 5, 'LAB_PLATFORM');
  b.addOneWay(-4, 12, 5, 'LAB_PLATFORM2');
  b.fillRect(-10, 14, 7, 1, 'LAB2'); // top 15
  b.addOneWay(-4, 16, 5, 'LAB_PLATFORM');
  b.fillRect(1, 18, 6, 1, 'LAB');
  b.addOneWay(7, 20, 5, 'LAB_PLATFORM2');
  b.fillRect(11, 22, 12, 1, 'LAB2'); // top 23 (Troncho #1 deck)

  wp.push(7.25, 9.6);
  wp.push(0.5, 9.6);
  wp.push(-5.5, 11.6);
  wp.push(-1.5, 13.6);
  wp.push(-6.5, 15.6);
  wp.push(-1.5, 17.6);
  wp.push(4.0, 19.6);
  wp.push(9.5, 21.6);
  wp.push(15.5, 23.6);

  // Laser-Guarded Troncho Shaft #1 (Y = 23..37)
  b.addButton({
    id: 'tt10_btn_3',
    x: 13.0,
    y: 23,
    w: 1.5,
    h: 0.5,
    kind: 'timed',
    circuitId: 'tt10_c3',
    duration: 5.5,
  });
  b.addCircuit({
    id: 'tt10_c3',
    nodes: [
      { x: 13.75, y: 23.15 },
      { x: 19.5, y: 23.15 },
      { x: 19.5, y: 28.5 },
    ],
  });
  b.addTroncho({
    id: 'tt10_tr_1',
    baseX: 18,
    baseY: 23,
    extX: 18,
    extY: 28,
    w: 3,
    h: 1,
    circuitId: 'tt10_c3',
    launchImpulse: 22.5,
    grabbable: true,
    terrain: 'TRONCHO',
  });
  // Horizontal laser clears automatically when tt10_c3 is powered!
  b.addLaser({
    id: 'tt10_laser_3',
    x1: 16.5,
    y1: 30.0,
    x2: 22.5,
    y2: 30.0,
    circuitId: 'tt10_c3',
    invertPower: true,
  });
  b.addOneWay(12, 25, 5, 'LAB_PLATFORM');
  b.addOneWay(8, 27, 5, 'LAB_PLATFORM2');
  b.addOneWay(12, 29, 5, 'LAB_PLATFORM');
  b.addOneWay(8, 31, 5, 'LAB_PLATFORM2');
  b.fillRect(9, 33, 8, 1, 'LAB'); // X = 9..17, top 34 (clear of Troncho shaft 18..21!)
  b.addOneWay(6, 35, 5, 'LAB_PLATFORM'); // top 36
  wp.push(19.5, 24.6);
  wp.push(19.5, 28.6);
  wp.push(19.5, 31.6);
  wp.push(19.5, 34.6);
  wp.push(13.0, 34.6);
  wp.push(8.5, 36.6);

  // Mid-Gauntlet Chroma + Laser Bridge (Y = 36..55)
  b.fillRect(-10, 36, 16, 1, 'LAB2'); // top 37
  b.addButton({
    id: 'tt10_btn_4',
    x: 2.0,
    y: 37,
    w: 1.5,
    h: 0.5,
    kind: 'switch',
    circuitId: 'tt10_c4',
    duration: 0,
  });
  b.addCircuit({
    id: 'tt10_c4',
    nodes: [
      { x: 2.75, y: 37.15 },
      { x: -3.5, y: 37.15 },
      { x: -3.5, y: 40.3 },
    ],
  });
  b.fillRect(-5, 40, 3, 1, 'LAB'); // emitter cap at Y = 40 (3 u corridor clearance, flush with Y = 41 deck!)
  b.addLaser({
    id: 'tt10_laser_4',
    x1: -3.5,
    y1: 37.15,
    x2: -3.5,
    y2: 39.9,
    circuitId: 'tt10_c4',
    invertPower: true,
  });
  wp.push(2.75, 37.6);
  wp.push(-3.5, 37.6);
  wp.push(-8.0, 37.6);

  // Chroma split climb Y = 37..55
  b.addOneWay(-9, 38, 5, 'LAB_PLATFORM');
  b.addColorPlatform({ id: 'tt10_cp_k1', x: -3, y: 40, w: 4, h: 1, owner: 'krunked', circuitId: 'tt10_c4' });
  b.addColorPlatform({ id: 'tt10_cp_f1', x: 1, y: 40, w: 4, h: 1, owner: 'fred', circuitId: 'tt10_c4' });
  b.addOneWay(0, 40, 2, 'LAB_PLATFORM2');
  b.addColorPlatform({ id: 'tt10_cp_k2', x: 1, y: 42, w: 4, h: 1, owner: 'krunked' });
  b.addColorPlatform({ id: 'tt10_cp_f2', x: 5, y: 42, w: 4, h: 1, owner: 'fred' });
  b.addOneWay(4, 42, 2, 'LAB_PLATFORM');
  b.fillRect(8, 44, 7, 1, 'LAB'); // top 45
  b.addFallingBlock({ id: 'tt10_fb_1', x: 14, y: 46, w: 3.5, h: 1, terrain: 'LAB2' });
  b.addFallingBlock({ id: 'tt10_fb_2', x: 18, y: 48, w: 3.5, h: 1, terrain: 'LAB2' });
  b.addFallingBlock({ id: 'tt10_fb_3', x: 13, y: 50, w: 3.5, h: 1, terrain: 'LAB2' });
  b.addFallingBlock({ id: 'tt10_fb_4', x: 8, y: 52, w: 3.5, h: 1, terrain: 'LAB2' });
  b.fillRect(-1, 54, 10, 1, 'LAB2'); // top 55

  wp.push(-6.5, 39.6);
  wp.push(-2.0, 41.6);
  wp.push(5.0, 43.6);
  wp.push(11.5, 45.6);
  wp.push(15.7, 47.6);
  wp.push(19.7, 49.6);
  wp.push(14.7, 51.6);
  wp.push(9.7, 53.6);
  wp.push(4.0, 55.6);

  // Twin-Troncho Final Laser Ascent (Y = 55..85)
  b.addButton({
    id: 'tt10_btn_5',
    x: 0.5,
    y: 55,
    w: 1.5,
    h: 0.5,
    kind: 'timed',
    circuitId: 'tt10_c5',
    duration: 5.5,
  });
  b.addCircuit({
    id: 'tt10_c5',
    nodes: [
      { x: 1.25, y: 55.15 },
      { x: 6.5, y: 55.15 },
      { x: 6.5, y: 60.5 },
    ],
  });
  b.addTroncho({
    id: 'tt10_tr_2',
    baseX: 5,
    baseY: 55,
    extX: 5,
    extY: 60,
    w: 3,
    h: 1,
    circuitId: 'tt10_c5',
    launchImpulse: 23.0,
    grabbable: true,
    terrain: 'TRONCHO',
  });
  b.addOneWay(-2, 57, 4, 'LAB_PLATFORM');
  b.addOneWay(-6, 59, 4, 'LAB_PLATFORM2');
  b.addOneWay(-2, 61, 4, 'LAB_PLATFORM');
  b.addOneWay(2, 63, 4, 'LAB_PLATFORM2');
  b.fillRect(9, 65, 9, 1, 'LAB'); // X = 9..18, top 66 (clear of Troncho shaft 5..8!)
  wp.push(6.5, 56.6);
  wp.push(6.5, 60.6);
  wp.push(6.5, 63.6);
  wp.push(6.5, 66.6);
  wp.push(10.5, 66.6);

  // Final Laser Gate + Final Troncho Launch to Y = 85 Banner!
  b.addButton({
    id: 'tt10_btn_6',
    x: 9.5,
    y: 66,
    w: 1.5,
    h: 0.5,
    kind: 'timed',
    circuitId: 'tt10_c6',
    duration: 6.0,
  });
  b.addCircuit({
    id: 'tt10_c6',
    nodes: [
      { x: 10.25, y: 66.15 },
      { x: 14.5, y: 66.15 },
      { x: 14.5, y: 70.2 },
      { x: 19.5, y: 70.2 },
      { x: 19.5, y: 66.5 },
    ],
  });
  b.fillRect(13, 70, 3, 1, 'LAB2');
  b.addLaser({
    id: 'tt10_laser_5',
    x1: 14.5,
    y1: 66.15,
    x2: 14.5,
    y2: 69.9,
    circuitId: 'tt10_c6',
    invertPower: true,
  });
  b.fillRect(17, 65, 7, 1, 'LAB'); // top 66
  b.addTroncho({
    id: 'tt10_tr_3',
    baseX: 18,
    baseY: 66,
    extX: 18,
    extY: 71,
    w: 3,
    h: 1,
    circuitId: 'tt10_c6',
    launchImpulse: 23.0,
    grabbable: true,
    terrain: 'TRONCHO',
  });
  b.addOneWay(13, 68, 4, 'LAB_PLATFORM');
  b.addOneWay(9, 70, 4, 'LAB_PLATFORM2');
  b.addOneWay(13, 72, 4, 'LAB_PLATFORM');
  b.addOneWay(13, 74, 4, 'LAB_PLATFORM2');
  b.fillRect(8, 76, 9, 1, 'LAB2'); // X = 8..17, top 77 (clear of Troncho shaft 18..21!)
  b.addOneWay(6, 78, 5, 'LAB_PLATFORM'); // top 79
  b.fillRect(1, 80, 5, 1, 'LAB'); // top 81
  b.addOneWay(5, 82, 5, 'LAB_PLATFORM2'); // top 83

  wp.push(10.25, 66.6);
  wp.push(14.5, 66.6);
  wp.push(19.5, 67.6);
  wp.push(19.5, 71.6);
  wp.push(19.5, 74.6);
  wp.push(19.5, 77.6);
  wp.push(13.0, 77.6);
  wp.push(8.5, 79.6);
  wp.push(3.5, 81.6);
  wp.push(7.5, 83.6);

  finishSummitPlateau(b, wp, 12, summitY, 'LAB2', 'TT10 Finish!');
  return b.build();
}

/**
 * Builds any of the 10 handcrafted Time Trial courses (`TT1`..`TT10`),
 * each themed to its canonical `TIME_TRIAL_MEDALS` biome with crisp speedrun routing
 * and dense verified waypoints from spawn `(0, 1.6)` to the finish `summitZone`.
 */
export function buildTimeTrialLevel(trialIndex: number): LevelData {
  const clamped = Math.max(1, Math.min(10, Math.floor(Number.isFinite(trialIndex) ? trialIndex : 1)));
  switch (clamped) {
    case 1:
      return buildTT1();
    case 2:
      return buildTT2();
    case 3:
      return buildTT3();
    case 4:
      return buildTT4();
    case 5:
      return buildTT5();
    case 6:
      return buildTT6();
    case 7:
      return buildTT7();
    case 8:
      return buildTT8();
    case 9:
      return buildTT9();
    case 10:
    default:
      return buildTT10();
  }
}
