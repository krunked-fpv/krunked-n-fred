import {
  PHYSICS,
  WORLD,
  type BiomeId,
  type LevelData,
  type TerrainType,
  type Vec2,
} from '../contracts';
import { LevelBuilder } from './tileBuilder';

/**
 * Guaranteed-grounded zone warp coordinates (Y-UP tile space) for the Laboratory DLC (0..661 u).
 * Every warp rests cleanly on a wide unobstructed deck with >= 4 u headroom.
 */
export const LAB_ZONE_WARPS: Record<BiomeId, Vec2> = {
  village: { x: 0.75, y: 1.6 },
  foothills: { x: 8.0, y: 76.6 },
  mines: { x: 8.0, y: 166.6 },
  crags: { x: 8.0, y: 261.6 },
  summit: { x: 8.0, y: 566.6 },
  lab: { x: 2.0, y: 1.6 },
  boss: { x: 8.0, y: 636.6 },
};

interface WaypointTracker {
  push(x: number, y: number): void;
  pushWalk(fromX: number, toX: number, topY: number): void;
  last(): Vec2;
}

function createWaypointTracker(b: LevelBuilder, startX: number, startY: number): WaypointTracker {
  let prev: Vec2 = { x: startX, y: startY };
  b.addWaypoint(startX, startY);

  const push = (x: number, y: number): void => {
    const dx = x - prev.x;
    const dy = y - prev.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.35) return;
    // Keep consecutive waypoints spaced <= 3.8 u along any climb or traverse,
    // staying at target landing Y (never overshooting into upper ledges or cutting solid corners!)
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

  const pushWalk = (fromX: number, toX: number, topY: number): void => {
    push(fromX, topY + 0.6);
    push(toX, topY + 0.6);
  };

  return {
    push,
    pushWalk,
    last: () => prev,
  };
}

/**
 * Adds a clean steel switchback ladder ascending from `startTopY` to `endTopY` in `dY = 2` increments,
 * staying strictly inside X in `[minX, maxX]` and emitting open-air waypoints on every step.
 */
function addLabSwitchback(
  b: LevelBuilder,
  wp: WaypointTracker,
  startTopY: number,
  endTopY: number,
  startX: number,
  initialDir: 1 | -1,
  minX: number,
  maxX: number,
  solidTerrain: TerrainType,
  catwalkTerrain: TerrainType,
): { x: number; topY: number; dir: 1 | -1 } {
  let curX = startX;
  let dir = initialDir;
  let topY = startTopY;

  while (topY < endTopY) {
    const stepH = Math.min(2, endTopY - topY);
    topY += stepH;
    const platW = 6;
    const nextShift = 4;

    if (dir === 1 && curX + nextShift + platW > maxX) {
      dir = -1;
    } else if (dir === -1 && curX - nextShift - platW < minX) {
      dir = 1;
    }

    const leftX = dir === 1 ? curX + 1 : curX - platW - 1;
    const clampedLeft = Math.max(minX, Math.min(maxX - platW, Math.round(leftX)));
    const tileY = topY - 1;

    if (((topY / 2) | 0) % 2 === 0) {
      b.fillRect(clampedLeft, tileY, platW, 1, solidTerrain);
    } else {
      b.addOneWay(clampedLeft, tileY, platW, catwalkTerrain);
    }

    const landX = dir === 1 ? clampedLeft + 1.5 : clampedLeft + platW - 1.5;
    const exitX = dir === 1 ? clampedLeft + platW - 1.5 : clampedLeft + 1.5;
    wp.push(landX, topY + 0.6);
    wp.push(exitX, topY + 0.6);
    curX = exitX;
  }

  return { x: curX, topY, dir };
}

/**
 * Builds a vertical steel wall-cling chimney (`4 u` clear interior width, grabbable LAB/LAB2 faces)
 * with staggered catwalk rest rungs every 3 u (well below 3.30 u jump peak AND grabbable!).
 */
function addSteelChimney(
  b: LevelBuilder,
  wp: WaypointTracker,
  interiorLeftX: number,
  bottomTopY: number,
  height: number,
  terrain: TerrainType,
  catwalkTerrain: TerrainType,
): { exitX: number; topY: number } {
  const wallH = height;
  // Leave a clean 3 u tall entry arch on the left side at the bottom so players walk right in!
  b.fillRect(interiorLeftX - 2, bottomTopY + 3, 2, Math.max(4, wallH - 3), terrain);
  b.fillRect(interiorLeftX + 4, bottomTopY, 2, wallH - 1, terrain);

  wp.push(interiorLeftX + 2.0, bottomTopY + 0.6);

  let y = bottomTopY + 2;
  let rightRung = true;
  while (y < bottomTopY + wallH - 1) {
    const rungX = rightRung ? interiorLeftX + 2 : interiorLeftX;
    b.addOneWay(rungX, y, 2, catwalkTerrain);
    wp.push(rungX + 1.0, y + 1.6);
    rightRung = !rightRung;
    y += 3;
  }

  const exitTopY = bottomTopY + wallH;
  // Exit deck extending left of the chimney
  b.fillRect(interiorLeftX - 6, exitTopY - 1, 6, 1, terrain);
  wp.push(interiorLeftX + 1.0, exitTopY + 0.6);
  wp.push(interiorLeftX - 1.5, exitTopY + 0.6);
  wp.push(interiorLeftX - 4.0, exitTopY + 0.6);

  return { exitX: interiorLeftX - 4.0, topY: exitTopY };
}

/**
 * Builds a signature pneumatic Troncho vertical launch module:
 * a button on the staging deck powers a glowing cyan circuit driving an upward-extending
 * grabbable Troncho piston (`launchImpulse >= 21.0`) PLUS staggered catwalk rungs beside it
 * so both high-speed piston launches and wall-cling / step climbing are 100% reachable.
 */
function addTronchoLaunchModule(
  b: LevelBuilder,
  wp: WaypointTracker,
  idSuffix: string,
  baseTopY: number,
  riseHeight: number,
  side: 'left' | 'right',
  buttonKind: 'switch' | 'pressure' | 'timed',
): { exitX: number; topY: number } {
  const circuitId = `circuit_tr_${idSuffix}`;
  const isRight = side === 'right';
  const deckLeft = isRight ? 6 : -6;
  const deckW = 14;
  b.fillRect(deckLeft, baseTopY - 1, deckW, 1, 'LAB');

  const btnX = isRight ? deckLeft + 2.5 : deckLeft + deckW - 4.0;
  const tronchoX = isRight ? deckLeft + 8 : deckLeft + 2;
  const tronchoW = 3;
  const tronchoH = 1;
  const extRise = Math.min(5, Math.max(3, riseHeight - 4));

  b.addButton({
    id: `btn_tr_${idSuffix}`,
    x: btnX,
    y: baseTopY,
    w: 1.5,
    h: 0.5,
    kind: buttonKind,
    circuitId,
    duration: buttonKind === 'timed' ? 5.0 : 0,
  });

  b.addCircuit({
    id: circuitId,
    nodes: [
      { x: btnX + 0.75, y: baseTopY + 0.15 },
      { x: tronchoX + tronchoW * 0.5, y: baseTopY + 0.15 },
      { x: tronchoX + tronchoW * 0.5, y: baseTopY + extRise },
    ],
  });

  b.addTroncho({
    id: `troncho_${idSuffix}`,
    baseX: tronchoX,
    baseY: baseTopY,
    extX: tronchoX,
    extY: baseTopY + extRise,
    w: tronchoW,
    h: tronchoH,
    circuitId,
    launchImpulse: 22.0,
    grabbable: true,
    terrain: 'TRONCHO',
  });

  // Flanking grabbable LAB2 wall + catwalk helper steps beside the piston shaft
  const flankX = isRight ? tronchoX + tronchoW + 1 : tronchoX - 5;
  b.addOneWay(flankX, baseTopY + 1, 4, 'LAB_PLATFORM2');
  if (riseHeight >= 6) {
    b.addOneWay(isRight ? tronchoX - 4 : tronchoX + tronchoW + 1, baseTopY + 3, 4, 'LAB_PLATFORM');
  }
  if (riseHeight >= 8) {
    b.addOneWay(flankX, baseTopY + 5, 4, 'LAB_PLATFORM2');
  }
  if (riseHeight >= 10) {
    b.addOneWay(isRight ? tronchoX - 4 : tronchoX + tronchoW + 1, baseTopY + 7, 4, 'LAB_PLATFORM');
  }

  const targetTopY = baseTopY + riseHeight;
  // Exit deck placed cleanly beside the Troncho launch shaft (zero ceiling overhang!)
  const exitLeft = isRight ? tronchoX - 10 : tronchoX + tronchoW + 1;
  b.fillRect(exitLeft, targetTopY - 1, 9, 1, 'LAB2');

  wp.push(btnX + 0.75, baseTopY + 0.6);
  wp.push(tronchoX + 1.5, baseTopY + 1.6);
  // Airborne / step waypoints climbing cleanly up the unobstructed piston shaft
  for (let dy = 3; dy < riseHeight; dy += 2) {
    wp.push(tronchoX + 1.5, baseTopY + dy + 0.6);
  }
  wp.push(tronchoX + 1.5, targetTopY + 0.6);
  const exitX = isRight ? exitLeft + 6.0 : exitLeft + 3.0;
  wp.push(exitX, targetTopY + 0.6);

  return { exitX, topY: targetTopY };
}

/**
 * Builds a horizontal laser security gallery with a disarm button BEFORE the laser gate
 * (`invertPower: true`), a solid steel floor underneath, and a clean rise onto the next tier.
 */
function addLaserGateGallery(
  b: LevelBuilder,
  wp: WaypointTracker,
  idSuffix: string,
  floorTopY: number,
  direction: 1 | -1,
  buttonKind: 'switch' | 'timed' | 'pressure',
): { exitX: number; topY: number } {
  const floorLeft = -10;
  const floorW = 36; // X: -10..26
  b.fillRect(floorLeft, floorTopY - 1, floorW, 1, 'LAB2');

  // Overhead emitter housing beam at floorTopY + 4 (clear 4 u headroom!)
  const laserX = direction === 1 ? 10 : 6;
  b.fillRect(laserX - 1, floorTopY + 4, 3, 1, 'LAB');

  const btnX = direction === 1 ? 1.5 : 13.5;
  const circuitId = `circuit_laser_${idSuffix}`;

  b.addButton({
    id: `btn_laser_${idSuffix}`,
    x: btnX,
    y: floorTopY,
    w: 1.5,
    h: 0.5,
    kind: buttonKind,
    circuitId,
    duration: buttonKind === 'timed' ? 5.5 : 0,
  });

  b.addCircuit({
    id: circuitId,
    nodes: [
      { x: btnX + 0.75, y: floorTopY + 0.15 },
      { x: btnX + 0.75, y: floorTopY + 4.3 },
      { x: laserX + 0.5, y: floorTopY + 4.3 },
    ],
  });

  // Invert-powered laser gate: active by default, disarms when circuit is powered!
  b.addLaser({
    id: `laser_gate_${idSuffix}`,
    x1: laserX + 0.5,
    y1: floorTopY + 0.15,
    x2: laserX + 0.5,
    y2: floorTopY + 3.9,
    circuitId,
    invertPower: true,
  });

  // Optional low jump-over laser hurdle further along the corridor (safe jump height 3.30 u!)
  const hurdleX = direction === 1 ? 16.5 : -2.5;
  b.addLaser({
    id: `laser_hurdle_${idSuffix}`,
    x1: hurdleX,
    y1: floorTopY + 0.4,
    x2: hurdleX + 2.5,
    y2: floorTopY + 0.4,
    circuitId,
    invertPower: true,
  });

  const startX = direction === 1 ? -5.0 : 21.0;
  const endX = direction === 1 ? 22.0 : -6.0;
  wp.push(startX, floorTopY + 0.6);
  wp.push(btnX + 0.75, floorTopY + 0.6);
  wp.push(laserX + 0.5, floorTopY + 0.6);
  wp.push(endX, floorTopY + 0.6);

  // Clean 2-step steel rise at gallery exit (Y + 2 -> Y + 4 -> Y + 6)
  const step1Left = direction === 1 ? 20 : -10;
  const step2Left = direction === 1 ? 15 : -5;
  const step3Left = direction === 1 ? 10 : 0;
  b.addOneWay(step1Left, floorTopY + 1, 6, 'LAB_PLATFORM');
  b.addOneWay(step2Left, floorTopY + 3, 6, 'LAB_PLATFORM2');
  b.fillRect(step3Left, floorTopY + 5, 8, 1, 'LAB');

  wp.push(step1Left + 3, floorTopY + 2.6);
  wp.push(step2Left + 3, floorTopY + 4.6);
  wp.push(step3Left + 4, floorTopY + 6.6);

  return { exitX: step3Left + 4, topY: floorTopY + 6 };
}

/**
 * Builds a co-op Chroma Split staircase featuring paired crimson KrunkedGround (`KRUNKED_ONLY`
 * & `owner: 'krunked'` ColorPlatforms) and emerald FredGround (`FRED_ONLY` & `owner: 'fred'`
 * ColorPlatforms) kept within `<= 1.5 u` of each other so both penguins climb side-by-side
 * on their 2.5 u tether, capped with a neutral steel checkpoint deck!
 */
function addChromaSplitStage(
  b: LevelBuilder,
  wp: WaypointTracker,
  idSuffix: string,
  baseTopY: number,
  steps: number,
  dir: 1 | -1,
): { exitX: number; topY: number } {
  const deckLeft = -4;
  b.fillRect(deckLeft, baseTopY - 1, 24, 1, 'LAB');

  // Circuit switch that activates bonus ColorPlatforms in the upper half of the stage
  const circuitId = `circuit_chroma_${idSuffix}`;
  const btnX = dir === 1 ? -1.5 : 16.5;
  b.addButton({
    id: `btn_chroma_${idSuffix}`,
    x: btnX,
    y: baseTopY,
    w: 1.5,
    h: 0.5,
    kind: 'switch',
    circuitId,
    duration: 0,
  });
  b.addCircuit({
    id: circuitId,
    nodes: [
      { x: btnX + 0.75, y: baseTopY + 0.15 },
      { x: 8, y: baseTopY + 0.15 },
      { x: 8, y: baseTopY + steps * 2 },
    ],
  });

  wp.push(btnX + 0.75, baseTopY + 0.6);

  let curCenterX = dir === 1 ? 3 : 13;
  let curDir = dir;
  let curY = baseTopY;

  for (let s = 0; s < steps; s++) {
    curY += 2;
    if (curDir === 1 && curCenterX + 6 > 25) curDir = -1;
    if (curDir === -1 && curCenterX - 6 < -9) curDir = 1;
    curCenterX += curDir * 3;

    const tileY = curY - 1;
    if (s % 2 === 0) {
      // Static KRUNKED_ONLY & FRED_ONLY paired pads touching at center (within 2.5 u rope!)
      b.fillRect(curCenterX - 4, tileY, 4, 1, 'LAB_PLATFORM', 'KRUNKED_ONLY');
      b.fillRect(curCenterX, tileY, 4, 1, 'LAB_PLATFORM', 'FRED_ONLY');
    } else {
      // Owner-exclusive ColorPlatforms (always active or circuit-powered + neutral safety center)
      b.addColorPlatform({
        id: `cp_krunked_${idSuffix}_${s}`,
        x: curCenterX - 4.5,
        y: tileY,
        w: 4.0,
        h: 1.0,
        owner: 'krunked',
        circuitId: s === steps - 1 ? circuitId : undefined,
      });
      b.addColorPlatform({
        id: `cp_fred_${idSuffix}_${s}`,
        x: curCenterX + 0.5,
        y: tileY,
        w: 4.0,
        h: 1.0,
        owner: 'fred',
        circuitId: s === steps - 1 ? circuitId : undefined,
      });
      // Small 1 u neutral catwalk center seam so solo/AI or un-switched players can still cross
      b.addOneWay(curCenterX, tileY, 1, 'LAB_PLATFORM2');
    }

    wp.push(curCenterX, curY + 0.6);
  }

  // Neutral checkpoint deck at top of chroma stage
  const topY = curY + 2;
  b.fillRect(Math.max(-10, curCenterX - 6), topY - 1, 14, 1, 'LAB');
  const exitX = Math.max(-8, Math.min(22, curCenterX));
  wp.push(exitX, topY + 0.6);

  return { exitX, topY };
}

/**
 * Builds the complete Laboratory DLC level (0..661 u) for Krunked & Fred:
 *  - Sector 1 (0..76): Airlock & Circuit Orientation (Switch/Pressure/Timed buttons, Laser, Troncho)
 *  - Sector 2 (76..166): Pneumatic Piston Foundry (grabbable Troncho upward launch shafts)
 *  - Sector 3 (166..261): Laser Security Corridor (invertPower gates, hurdle beams, service lifts)
 *  - Sector 4 (261..361): Chroma Split Chamber (crimson KrunkedGround & emerald FredGround)
 *  - Sector 5 (361..466): Dual-Circuit Reactor Shaft (crumbling containment blocks, cargo lifts, chimneys)
 *  - Sector 6 (466..566): Cryo-Ventilation & High Voltage (ICE pipes, exhaust wind, SwingPlatforms, Photo11)
 *  - Sector 7 (566..636): Bachicha Pre-Chamber Ascension Gauntlet
 *  - Sector 8 (636..661): Mech-Boss Bachicha 4-Chain Arena (`left_arm`, `right_arm`, `left_leg`, `right_leg`) + Victory Crown & Photo12
 */
export function buildLabDlcLevel(): LevelData {
  const b = new LevelBuilder({
    id: 'lab_dlc',
    name: 'Secret Laboratory DLC',
    mode: 'lab_dlc',
    summitY: WORLD.LAB_SUMMIT_Y,
    bounds: { minX: -20, maxX: 36, minY: -2, maxY: 676 },
  });

  // Spawn Krunked (P1) & Fred (P2) on the Lab Airlock deck (floor top Y = 1.0)
  b.setSpawn({ x: 0, y: 1.6 }, { x: 1.5, y: 1.6 });

  // ==========================================================================
  // 0. OUTER STEEL BULKHEADS & AIRLOCK FLOOR (Y: -2..672)
  // ==========================================================================
  b.fillRect(-20, -2, 56, 3, 'LAB'); // Base steel floor (top Y = 1.0)
  for (let bandY = 1; bandY < 668; bandY += 40) {
    const h = Math.min(40, 668 - bandY);
    const mat: TerrainType = ((bandY / 40) | 0) % 2 === 0 ? 'LAB' : 'LAB2';
    b.fillRect(-20, bandY, 6, h, mat); // Left steel bulkhead (inner face X = -14)
    b.fillRect(30, bandY, 6, h, mat); // Right steel bulkhead (inner face X = 30)
  }
  b.fillRect(-20, 668, 56, 4, 'LAB2'); // Top reactor vault ceiling

  const wp = createWaypointTracker(b, 0.75, 1.6);

  // ==========================================================================
  // 1. SECTOR 1: AIRLOCK & CIRCUIT ORIENTATION (Y: 1..76)
  // ==========================================================================
  b.addSign({
    x: -3.0,
    y: 1.0,
    title: 'Secret Laboratory',
    text: 'Ascend 661m through Dr. Bachicha steel shafts to break all 4 Boss Chains!',
  });
  b.addSign({
    x: 4.5,
    y: 1.0,
    title: 'Circuits & Pistons',
    text: 'Step on Switch buttons to disarm Lasers and fire pneumatic Troncho launchers!',
  });

  // Intro Switch -> Disarms Airlock Laser Gate + Powers first Troncho launcher right at Y = 1!
  b.addButton({
    id: 'btn_airlock_1',
    x: 5.5,
    y: 1,
    w: 1.5,
    h: 0.5,
    kind: 'switch',
    circuitId: 'c_airlock_1',
    duration: 0,
  });
  b.addCircuit({
    id: 'c_airlock_1',
    nodes: [
      { x: 6.25, y: 1.15 },
      { x: 6.25, y: 5.2 },
      { x: 10.5, y: 5.2 },
      { x: 14.5, y: 5.2 },
      { x: 14.5, y: 1.5 },
    ],
  });
  b.fillRect(9, 5, 3, 1, 'LAB2'); // Laser emitter header
  b.addLaser({
    id: 'laser_airlock_1',
    x1: 10.5,
    y1: 1.15,
    x2: 10.5,
    y2: 4.9,
    circuitId: 'c_airlock_1',
    invertPower: true,
  });
  b.addTroncho({
    id: 'troncho_airlock_1',
    baseX: 13,
    baseY: 1,
    extX: 13,
    extY: 5,
    w: 3,
    h: 1,
    circuitId: 'c_airlock_1',
    launchImpulse: 22.0,
    grabbable: true,
    terrain: 'TRONCHO',
  });

  // Gentle catwalk steps next to intro Troncho leading to Y = 9 (clear of Troncho shaft X=13..16!)
  b.addOneWay(18, 2, 5, 'LAB_PLATFORM'); // top 3
  b.addOneWay(21, 4, 5, 'LAB_PLATFORM2'); // top 5
  b.addOneWay(17, 6, 5, 'LAB_PLATFORM'); // top 7
  b.fillRect(4, 8, 8, 1, 'LAB'); // X = 4..12, top 9 (unobstructed Troncho launch!)

  wp.push(6.25, 1.6);
  wp.push(10.5, 1.6);
  wp.push(14.5, 2.6);
  wp.push(14.5, 5.6);
  wp.push(14.5, 9.6);
  wp.push(9.0, 9.6);

  // Switchback Y = 9..19
  const s1a = addLabSwitchback(b, wp, 9, 19, 9.0, -1, -10, 26, 'LAB', 'LAB_PLATFORM');
  // Intro Timed Troncho Module Y = 19..27
  const s1b = addTronchoLaunchModule(b, wp, 's1_timed', s1a.topY, 8, 'left', 'timed');
  // Switchback Y = 27..35
  const s1c = addLabSwitchback(b, wp, s1b.topY, 35, s1b.exitX, 1, -10, 26, 'LAB2', 'LAB_PLATFORM2');
  // Intro Laser Gallery Y = 35..41 (pressure/switch)
  const s1d = addLaserGateGallery(b, wp, 's1_gallery', s1c.topY, 1, 'switch');
  // Switchback Y = 41..47
  const s1e = addLabSwitchback(b, wp, s1d.topY, 47, s1d.exitX, -1, -10, 26, 'LAB', 'LAB_PLATFORM');
  // Steel wall-cling chimney Y = 47..63 (16 u tall, grabbable LAB walls)
  b.fillRect(1, 46, 12, 1, 'LAB'); // staging floor under chimney
  wp.push(6.0, 47.6);
  const s1f = addSteelChimney(b, wp, 4, 47, 16, 'LAB', 'LAB_PLATFORM');
  // Switchback Y = 63..74 -> Sector 2 Staging Deck at Y = 76
  addLabSwitchback(b, wp, s1f.topY, 74, s1f.exitX, 1, -10, 26, 'LAB2', 'LAB_PLATFORM2');
  b.fillRect(-4, 75, 24, 1, 'LAB'); // Sector 2 Staging Deck (top Y = 76)
  wp.push(8.0, 76.6);

  // ==========================================================================
  // 2. SECTOR 2: PNEUMATIC PISTON FOUNDRY (Y: 76..166)
  // ==========================================================================
  b.addSign({
    x: 4.0,
    y: 76.0,
    title: 'Piston Foundry',
    text: 'Stand atop powered Troncho pistons for high-altitude launches - or grab their sides!',
  });

  const s2a = addTronchoLaunchModule(b, wp, 's2_a', 76, 10, 'right', 'switch');
  const s2b = addLabSwitchback(b, wp, s2a.topY, 96, s2a.exitX, -1, -10, 26, 'LAB', 'LAB_PLATFORM');
  const s2c = addTronchoLaunchModule(b, wp, 's2_b', s2b.topY, 10, 'left', 'timed');
  const s2d = addLabSwitchback(b, wp, s2c.topY, 118, s2c.exitX, 1, -10, 26, 'LAB2', 'LAB_PLATFORM2');

  // Horizontal grabbable Troncho bridge across center shaft at Y = 118
  b.fillRect(-10, 117, 10, 1, 'LAB');
  b.addButton({
    id: 'btn_tr_horiz_s2',
    x: -4,
    y: 118,
    w: 1.5,
    h: 0.5,
    kind: 'switch',
    circuitId: 'c_tr_horiz_s2',
    duration: 0,
  });
  b.addCircuit({
    id: 'c_tr_horiz_s2',
    nodes: [
      { x: -3.25, y: 118.15 },
      { x: 2.0, y: 118.15 },
      { x: 10.0, y: 118.15 },
    ],
  });
  b.addTroncho({
    id: 'troncho_horiz_s2',
    baseX: 1,
    baseY: 117,
    extX: 9,
    extY: 117,
    w: 4,
    h: 1,
    circuitId: 'c_tr_horiz_s2',
    launchImpulse: 18.0,
    grabbable: true,
    terrain: 'TRONCHO',
  });
  b.addOneWay(6, 117, 4, 'LAB_PLATFORM'); // backup catwalk span
  b.fillRect(14, 117, 12, 1, 'LAB');
  wp.push(-3.25, 118.6);
  wp.push(4.0, 118.6);
  wp.push(11.0, 118.6);
  wp.push(18.0, 118.6);

  const s2e = addLabSwitchback(b, wp, 118, 130, 18.0, -1, -10, 26, 'LAB', 'LAB_PLATFORM');
  const s2f = addTronchoLaunchModule(b, wp, 's2_c', s2e.topY, 10, 'right', 'pressure');
  const s2g = addLabSwitchback(b, wp, s2f.topY, 150, s2f.exitX, -1, -10, 26, 'LAB2', 'LAB_PLATFORM2');
  const s2h = addTronchoLaunchModule(b, wp, 's2_d', s2g.topY, 10, 'left', 'timed');
  addLabSwitchback(b, wp, s2h.topY, 164, s2h.exitX, 1, -10, 26, 'LAB', 'LAB_PLATFORM');
  b.fillRect(-4, 165, 24, 1, 'LAB2'); // Sector 3 Staging Deck (top Y = 166)
  wp.push(8.0, 166.6);

  // ==========================================================================
  // 3. SECTOR 3: LASER SECURITY CORRIDOR (Y: 166..261)
  // ==========================================================================
  b.addSign({
    x: 4.0,
    y: 166.0,
    title: 'Laser Security',
    text: 'Timed switches disarm high-voltage gates! Sprint past before the timer expires!',
  });

  const s3a = addLaserGateGallery(b, wp, 's3_a', 166, 1, 'timed');
  const s3b = addLabSwitchback(b, wp, s3a.topY, 184, s3a.exitX, -1, -10, 26, 'LAB', 'LAB_PLATFORM');
  const s3c = addLaserGateGallery(b, wp, 's3_b', s3b.topY, -1, 'switch');

  // Movable steel cargo lift rising across laser-framed shaft (Y = 190..202)
  b.fillRect(-10, 189, 10, 1, 'LAB2');
  b.addMovable({
    id: 'lab_lift_s3_1',
    startX: 1,
    startY: 189,
    endX: 11,
    endY: 199,
    w: 4,
    h: 1,
    speed: 3.4,
    mode: 'CONTINUE',
    terrain: 'MOVABLE',
  });
  // Alternate steel rungs along left side of lift shaft
  b.addOneWay(-6, 191, 5, 'LAB_PLATFORM');
  b.addOneWay(-1, 193, 5, 'LAB_PLATFORM2');
  b.addOneWay(4, 195, 5, 'LAB_PLATFORM');
  b.addOneWay(9, 197, 5, 'LAB_PLATFORM2');
  b.fillRect(15, 199, 11, 1, 'LAB2'); // top Y = 200
  wp.push(-2.0, 190.6);
  wp.push(2.0, 192.6);
  wp.push(6.0, 195.6);
  wp.push(11.0, 198.6);
  wp.push(18.0, 200.6);

  const s3d = addLabSwitchback(b, wp, 200, 214, 18.0, -1, -10, 26, 'LAB', 'LAB_PLATFORM');
  const s3e = addLaserGateGallery(b, wp, 's3_c', s3d.topY, 1, 'timed');
  const s3f = addLabSwitchback(b, wp, s3e.topY, 232, s3e.exitX, -1, -10, 26, 'LAB2', 'LAB_PLATFORM2');
  const s3g = addLaserGateGallery(b, wp, 's3_d', s3f.topY, -1, 'timed');

  // STEP_STOP vertical maintenance elevator Y = 238..252
  b.fillRect(-10, 237, 12, 1, 'LAB');
  b.addMovable({
    id: 'lab_lift_s3_2',
    startX: 3,
    startY: 237,
    endX: 3,
    endY: 251,
    w: 4,
    h: 1,
    speed: 3.5,
    mode: 'STEP_STOP',
    terrain: 'MOVABLE',
  });
  b.addOneWay(8, 239, 5, 'LAB_PLATFORM');
  b.addOneWay(13, 241, 5, 'LAB_PLATFORM2');
  b.addOneWay(8, 243, 5, 'LAB_PLATFORM');
  b.addOneWay(13, 245, 5, 'LAB_PLATFORM2');
  b.addOneWay(8, 247, 5, 'LAB_PLATFORM');
  b.addOneWay(13, 249, 5, 'LAB_PLATFORM2');
  b.fillRect(6, 251, 14, 1, 'LAB'); // top Y = 252
  wp.push(5.0, 238.6);
  wp.push(5.0, 242.6);
  wp.push(5.0, 246.6);
  wp.push(5.0, 250.6);
  wp.push(10.0, 252.6);

  addLabSwitchback(b, wp, 252, 259, 10.0, 1, -10, 26, 'LAB2', 'LAB_PLATFORM2');
  b.fillRect(-4, 260, 24, 1, 'LAB'); // Sector 4 Staging Deck (top Y = 261)
  wp.push(8.0, 261.6);

  // ==========================================================================
  // 4. SECTOR 4: CHROMA SPLIT CHAMBER (KRUNKED & FRED GROUND, Y: 261..361)
  // ==========================================================================
  b.addSign({
    x: 4.0,
    y: 261.0,
    title: 'Chroma Split',
    text: 'Crimson holds Krunked; Emerald holds Fred! Stay paired and flip switches for bridges!',
  });

  const s4a = addChromaSplitStage(b, wp, 's4_1', 261, 6, 1); // 261 -> 275
  const s4b = addLabSwitchback(b, wp, s4a.topY, 285, s4a.exitX, -1, -10, 26, 'LAB2', 'LAB_PLATFORM2');
  const s4c = addChromaSplitStage(b, wp, 's4_2', s4b.topY, 7, -1); // 285 -> 301
  const s4d = addTronchoLaunchModule(b, wp, 's4_mid', s4c.topY, 8, 'right', 'switch'); // 301 -> 309
  // Clear 2 u step above Troncho shaft before Chroma deck at Y = 311
  b.addOneWay(2, 310, 6, 'LAB_PLATFORM'); // top 311
  wp.push(5.0, 311.6);
  const s4e = addChromaSplitStage(b, wp, 's4_3', 311, 6, 1); // 311 -> 325
  const s4f = addLabSwitchback(b, wp, s4e.topY, 337, s4e.exitX, -1, -10, 26, 'LAB', 'LAB_PLATFORM');
  const s4g = addChromaSplitStage(b, wp, 's4_4', s4f.topY, 7, -1); // 337 -> 353
  addLabSwitchback(b, wp, s4g.topY, 359, s4g.exitX, 1, -10, 26, 'LAB2', 'LAB_PLATFORM2');
  b.fillRect(-4, 360, 24, 1, 'LAB2'); // Sector 5 Staging Deck (top Y = 361)
  wp.push(8.0, 361.6);

  // ==========================================================================
  // 5. SECTOR 5: DUAL-CIRCUIT REACTOR SHAFT (Y: 361..466)
  // ==========================================================================
  b.addSign({
    x: 4.0,
    y: 361.0,
    title: 'Reactor Shaft',
    text: 'Unstable containment tiles crumble in 1 second! Chain pistons and cargo lifts!',
  });

  // Crumbling LAB2 FallingBlock bridge across reactor bay at Y = 361
  b.fillRect(-10, 360, 10, 1, 'LAB2');
  b.addFallingBlock({ id: 'fb_lab_1', x: 1.5, y: 360, w: 3, h: 1, terrain: 'LAB2' });
  b.addFallingBlock({ id: 'fb_lab_2', x: 6.0, y: 360, w: 3, h: 1, terrain: 'LAB2' });
  b.addFallingBlock({ id: 'fb_lab_3', x: 10.5, y: 360, w: 3, h: 1, terrain: 'LAB2' });
  b.addFallingBlock({ id: 'fb_lab_4', x: 15.0, y: 360, w: 3, h: 1, terrain: 'LAB2' });
  b.fillRect(19, 360, 7, 1, 'LAB2');
  wp.push(14.0, 361.6);
  wp.push(21.0, 361.6);

  const s5a = addLabSwitchback(b, wp, 361, 375, 21.0, -1, -10, 26, 'LAB', 'LAB_PLATFORM');
  const s5b = addLaserGateGallery(b, wp, 's5_laser', s5a.topY, 1, 'timed'); // 375 -> 381

  // Tall LAB2 Steel Chimney Y = 381..403
  b.fillRect(10, 380, 12, 1, 'LAB2');
  wp.push(15.0, 381.6);
  const s5c = addSteelChimney(b, wp, 13, 381, 22, 'LAB2', 'LAB_PLATFORM2'); // 381 -> 403

  // ENDS_STOP diagonal cargo elevator Y = 403..417
  b.fillRect(-10, 402, 14, 1, 'LAB');
  b.addMovable({
    id: 'lab_lift_s5_1',
    startX: 5,
    startY: 402,
    endX: 16,
    endY: 416,
    w: 4,
    h: 1,
    speed: 3.8,
    mode: 'ENDS_STOP',
    terrain: 'MOVABLE',
  });
  b.addOneWay(1, 404, 5, 'LAB_PLATFORM');
  b.addOneWay(6, 406, 5, 'LAB_PLATFORM2');
  b.addOneWay(11, 408, 5, 'LAB_PLATFORM');
  b.addOneWay(15, 410, 5, 'LAB_PLATFORM2');
  b.addOneWay(11, 412, 5, 'LAB_PLATFORM');
  b.addOneWay(15, 414, 5, 'LAB_PLATFORM2');
  b.fillRect(18, 416, 8, 1, 'LAB'); // top Y = 417
  wp.push(7.0, 403.6);
  wp.push(11.0, 408.6);
  wp.push(15.0, 413.6);
  wp.push(16.5, 416.6);
  wp.push(18.0, 417.6);
  wp.push(21.0, 417.6);

  const s5d = addLabSwitchback(b, wp, 417, 429, 21.0, -1, -10, 26, 'LAB2', 'LAB_PLATFORM2');
  const s5e = addTronchoLaunchModule(b, wp, 's5_piston', s5d.topY, 10, 'left', 'timed'); // 429 -> 439

  // Crumbling staircase Y = 439..451
  b.addFallingBlock({ id: 'fb_lab_5', x: 10, y: 440, w: 4, h: 1, terrain: 'LAB2' });
  b.addFallingBlock({ id: 'fb_lab_6', x: 16, y: 442, w: 4, h: 1, terrain: 'LAB2' });
  b.addFallingBlock({ id: 'fb_lab_7', x: 11, y: 444, w: 4, h: 1, terrain: 'LAB2' });
  b.addFallingBlock({ id: 'fb_lab_8', x: 5, y: 446, w: 4, h: 1, terrain: 'LAB2' });
  b.addFallingBlock({ id: 'fb_lab_9', x: 10, y: 448, w: 4, h: 1, terrain: 'LAB2' });
  b.fillRect(14, 450, 8, 1, 'LAB'); // top Y = 451
  wp.push(12.0, 441.6);
  wp.push(18.0, 443.6);
  wp.push(13.0, 445.6);
  wp.push(7.0, 447.6);
  wp.push(12.0, 449.6);
  wp.push(17.0, 451.6);

  addLabSwitchback(b, wp, 451, 464, 17.0, -1, -10, 26, 'LAB', 'LAB_PLATFORM');
  b.fillRect(-4, 465, 24, 1, 'LAB'); // Sector 6 Staging Deck (top Y = 466)
  wp.push(8.0, 466.6);

  // ==========================================================================
  // 6. SECTOR 6: CRYO-VENTILATION & HIGH VOLTAGE (Y: 466..566)
  // ==========================================================================
  b.addSign({
    x: 4.0,
    y: 466.0,
    title: 'Cryo Ventilation',
    text: 'Watch for slick cryo pipes and exhaust turbine drafts! Ride cradles across the bay!',
  });

  // Exhaust turbine cyclic WindZone covering Y = 472..516
  b.addWindZone({
    id: 'wind_lab_exhaust_1',
    minX: -14,
    maxX: 30,
    minY: 472,
    maxY: 516,
    dir: 1,
    activeTime: PHYSICS.WIND_ACTIVE_TIME,
    waitTime: PHYSICS.WIND_WAIT_TIME,
    constant: false,
    strength: 0.9,
  });

  // Cryo ICE ledges ascending to first maintenance SwingPlatform (Y = 466..482)
  b.fillIce(12, 467, 6, 1); // top 468
  b.fillIce(4, 469, 6, 1); // top 470
  b.fillRect(-3, 471, 6, 1, 'LAB'); // top 472 (grippy catch)
  b.fillIce(-8, 473, 5, 1); // top 474
  b.fillRect(-10, 475, 7, 1, 'LAB2'); // top 476
  b.addOneWay(-5, 477, 5, 'LAB_PLATFORM'); // top 478
  b.fillRect(-10, 479, 9, 1, 'LAB'); // top 480 (SwingPlatform boarding deck)
  wp.push(15.0, 468.6);
  wp.push(7.0, 470.6);
  wp.push(0.0, 472.6);
  wp.push(-5.5, 474.6);
  wp.push(-6.5, 476.6);
  wp.push(-2.5, 478.6);
  wp.push(-3.0, 480.6);

  // Wind-driven Maintenance Cradle SwingPlatform #1 (rests X=1..5, Y=481; swings right to X=10..14, Y=484.5)
  b.addSwingPlatform({
    id: 'swing_lab_1',
    pivotX: 3.0,
    pivotY: 493.2,
    w: 4.0,
    h: 1.0,
    radius: 12.2,
    maxDisplacement: 8.6,
    swingTime: 1.2,
    windDriven: true,
  });
  // East receiving deck at Y = 484
  b.fillRect(15, 483, 11, 1, 'LAB2'); // top Y = 484
  wp.push(3.0, 481.6);
  wp.push(9.5, 483.2);
  wp.push(18.0, 484.6);

  // Climb from Y = 484..502 (with cryo ICE mix)
  const s6a = addLabSwitchback(b, wp, 484, 498, 18.0, -1, -10, 26, 'LAB', 'LAB_PLATFORM');
  b.fillIce(-10, 499, 8, 1); // top 500
  b.fillRect(-10, 501, 9, 1, 'LAB2'); // top 502 (SwingPlatform #2 boarding deck)
  wp.push(-5.0, 500.6);
  wp.push(-3.0, 502.6);

  // Wind-driven Maintenance Cradle SwingPlatform #2 (Y = 502..506)
  b.addSwingPlatform({
    id: 'swing_lab_2',
    pivotX: 3.0,
    pivotY: 514.2,
    w: 4.0,
    h: 1.0,
    radius: 12.2,
    maxDisplacement: 8.6,
    swingTime: 1.2,
    windDriven: true,
  });
  b.fillRect(15, 505, 11, 1, 'LAB'); // top Y = 506
  wp.push(3.0, 503.6);
  wp.push(9.5, 505.2);
  wp.push(18.0, 506.6);

  // Climb Y = 506..536 through Steel Switchback + Laser Gate
  const s6b = addLabSwitchback(b, wp, 506, 520, 18.0, -1, -10, 26, 'LAB2', 'LAB_PLATFORM2');
  const s6c = addLaserGateGallery(b, wp, 's6_cryo', s6b.topY, 1, 'timed'); // 520 -> 526
  const s6d = addLabSwitchback(b, wp, s6c.topY, 538, s6c.exitX, -1, -10, 26, 'LAB', 'LAB_PLATFORM');

  // Photo11 ("Piston Blueprint") Showcase at Y = 545!
  const s6e = addTronchoLaunchModule(b, wp, 's6_photo11', s6d.topY, 8, 'right', 'switch'); // 538 -> 546
  // Rewarding side blueprint alcove right at Y = 545
  b.fillRect(20, 544, 9, 1, 'LAB2'); // top Y = 545
  b.addCollectible({
    id: 'Photo11',
    kind: 'photo',
    x: 24.5,
    y: 546.0,
    label: 'Piston Blueprint',
    zone: 'lab',
  });

  // Final climb to Sector 7 Deck (Y = 546..566)
  addLabSwitchback(b, wp, s6e.topY, 564, s6e.exitX, -1, -10, 26, 'LAB2', 'LAB_PLATFORM2');
  b.fillRect(-4, 565, 24, 1, 'LAB'); // Sector 7 Staging Deck (top Y = 566)
  wp.push(8.0, 566.6);

  // ==========================================================================
  // 7. SECTOR 7: BACHICHA PRE-CHAMBER GAUNTLET (Y: 566..636)
  // ==========================================================================
  b.addSign({
    x: 4.0,
    y: 566.0,
    title: 'Boss Approach',
    text: 'Final ascent to Mech-Boss Bachicha! Master Pistons, Chroma Pads & Lasers!',
  });

  const s7a = addChromaSplitStage(b, wp, 's7_chroma', 566, 6, 1); // 566 -> 580
  const s7b = addLaserGateGallery(b, wp, 's7_laser', s7a.topY, -1, 'timed'); // 580 -> 586
  const s7c = addLabSwitchback(b, wp, s7b.topY, 598, s7b.exitX, 1, -10, 26, 'LAB2', 'LAB_PLATFORM2');
  const s7d = addTronchoLaunchModule(b, wp, 's7_piston_1', s7c.topY, 10, 'right', 'timed'); // 598 -> 608
  const s7e = addLabSwitchback(b, wp, s7d.topY, 620, s7d.exitX, -1, -10, 26, 'LAB', 'LAB_PLATFORM');
  const s7f = addTronchoLaunchModule(b, wp, 's7_piston_2', s7e.topY, 10, 'left', 'switch'); // 620 -> 630

  // Grand entry staircase from Y = 630 to Boss Arena Entry Floor at Y = 636
  b.addOneWay(10, 631, 6, 'LAB_PLATFORM'); // top 632
  b.addOneWay(6, 633, 6, 'LAB_PLATFORM2'); // top 634
  wp.push(13.0, 632.6);
  wp.push(9.0, 634.6);

  // ==========================================================================
  // 8. SECTOR 8: MECH-BOSS BACHICHA 4-CHAIN ARENA (Y: 636..661)
  // ==========================================================================
  // Full arena steel floor at Y = 635 (top surface Y = 636)
  b.fillRect(-14, 635, 44, 1, 'LAB2');
  wp.push(8.0, 636.6);

  b.addSign({
    x: 2.5,
    y: 636.0,
    title: 'Mech-Boss Bachicha',
    text: 'Follow the glowing cyan circuit to the active Chain Button! Break all 4 chains!',
  });

  // Symmetrical Arena Catwalks & 4 Chain Release Platforms (all dY = 2.0 u!)
  // Lower step-ups (Y = 638) -> Lower leg chain decks (Y = 640)
  b.addOneWay(-5, 637, 5, 'LAB_PLATFORM'); // top 638 (left lower step)
  b.addOneWay(16, 637, 5, 'LAB_PLATFORM'); // top 638 (right lower step)

  b.fillRect(-13, 639, 7, 1, 'LAB'); // Left Leg Deck: X = -13..-6, top Y = 640
  b.fillRect(22, 639, 7, 1, 'LAB'); // Right Leg Deck: X = 22..29, top Y = 640

  // Center dodge bridge & mid-tier climbing catwalks (Y = 642..652)
  b.addOneWay(-6, 641, 5, 'LAB_PLATFORM2'); // top 642
  b.addOneWay(17, 641, 5, 'LAB_PLATFORM2'); // top 642
  b.addOneWay(-1, 643, 6, 'LAB_PLATFORM'); // top 644
  b.addOneWay(11, 643, 6, 'LAB_PLATFORM'); // top 644
  b.addOneWay(-7, 645, 5, 'LAB_PLATFORM2'); // top 646
  b.addOneWay(18, 645, 5, 'LAB_PLATFORM2'); // top 646
  b.addOneWay(-12, 647, 5, 'LAB_PLATFORM'); // top 648
  b.addOneWay(23, 647, 5, 'LAB_PLATFORM'); // top 648
  b.addOneWay(-7, 649, 5, 'LAB_PLATFORM2'); // top 650
  b.addOneWay(18, 649, 5, 'LAB_PLATFORM2'); // top 650
  b.addOneWay(-12, 651, 5, 'LAB_PLATFORM'); // top 652
  b.addOneWay(23, 651, 5, 'LAB_PLATFORM'); // top 652

  // Upper arm chain decks (Y = 654)
  b.fillRect(-13, 653, 7, 1, 'LAB'); // Left Arm Deck: X = -13..-6, top Y = 654
  b.fillRect(22, 653, 7, 1, 'LAB'); // Right Arm Deck: X = 22..29, top Y = 654

  // Arena Victory Crown ascent catwalks (Y = 656 -> 658 -> 660 -> 661)
  b.addOneWay(-6, 655, 5, 'LAB_PLATFORM2'); // top 656
  b.addOneWay(17, 655, 5, 'LAB_PLATFORM2'); // top 656
  b.addOneWay(-3, 657, 5, 'LAB_PLATFORM'); // top 658
  b.addOneWay(14, 657, 5, 'LAB_PLATFORM'); // top 658
  b.addOneWay(-1, 659, 4, 'LAB_PLATFORM2'); // X = -1..3, top 660 (clear of Crown X = 3..13!)
  b.addOneWay(13, 659, 4, 'LAB_PLATFORM2'); // X = 13..17, top 660

  // Victory Crown Deck at Y = 661 (`summitY = 661`)
  b.fillRect(3, 660, 10, 1, 'LAB2'); // X = 3..13, top Y = 661
  b.setSummitZone(5, 661, 6, 4, WORLD.LAB_SUMMIT_Y);

  // Polaroid Photo12 ("Victory Over Bachicha") on Victory Crown
  b.addCollectible({
    id: 'Photo12',
    kind: 'photo',
    x: 11.5,
    y: 662.0,
    label: 'Victory Over Bachicha',
    zone: 'boss',
  });

  // 4 Boss Chain Release Buttons (`pressure` so standing on active phase's button snaps that chain!)
  b.addButton({
    id: 'boss_btn_left_leg',
    x: -10.5,
    y: 640,
    w: 1.6,
    h: 0.5,
    kind: 'pressure',
    circuitId: 'boss_circuit_left_leg',
    duration: 0,
  });
  b.addButton({
    id: 'boss_btn_right_leg',
    x: 24.9,
    y: 640,
    w: 1.6,
    h: 0.5,
    kind: 'pressure',
    circuitId: 'boss_circuit_right_leg',
    duration: 0,
  });
  b.addButton({
    id: 'boss_btn_left_arm',
    x: -10.5,
    y: 654,
    w: 1.6,
    h: 0.5,
    kind: 'pressure',
    circuitId: 'boss_circuit_left_arm',
    duration: 0,
  });
  b.addButton({
    id: 'boss_btn_right_arm',
    x: 24.9,
    y: 654,
    w: 1.6,
    h: 0.5,
    kind: 'pressure',
    circuitId: 'boss_circuit_right_arm',
    duration: 0,
  });

  // Glowing cyan Boss Guide Circuits from Bachicha Core (8, 651) to each chain release button
  b.addCircuit({
    id: 'boss_circuit_left_leg',
    nodes: [
      { x: 8.0, y: 651.0 },
      { x: -1.0, y: 646.0 },
      { x: -9.7, y: 640.2 },
    ],
  });
  b.addCircuit({
    id: 'boss_circuit_right_leg',
    nodes: [
      { x: 8.0, y: 651.0 },
      { x: 17.0, y: 646.0 },
      { x: 25.7, y: 640.2 },
    ],
  });
  b.addCircuit({
    id: 'boss_circuit_left_arm',
    nodes: [
      { x: 8.0, y: 651.0 },
      { x: -1.0, y: 654.2 },
      { x: -9.7, y: 654.2 },
    ],
  });
  b.addCircuit({
    id: 'boss_circuit_right_arm',
    nodes: [
      { x: 8.0, y: 651.0 },
      { x: 17.0, y: 654.2 },
      { x: 25.7, y: 654.2 },
    ],
  });

  // Register Bachicha 4-Chain Boss Arena metadata
  b.setBossArena({
    minX: -14,
    maxX: 30,
    minY: 636,
    maxY: 665,
    chains: [
      { id: 'left_arm', broken: false, buttonId: 'boss_btn_left_arm', x: -10, y: 656 },
      { id: 'right_arm', broken: false, buttonId: 'boss_btn_right_arm', x: 26, y: 656 },
      { id: 'left_leg', broken: false, buttonId: 'boss_btn_left_leg', x: -10, y: 642 },
      { id: 'right_leg', broken: false, buttonId: 'boss_btn_right_leg', x: 26, y: 642 },
    ],
  });

  // Final Boss Arena route waypoints up to the Y = 661 Victory Crown
  wp.push(2.0, 636.6);
  wp.push(-2.5, 638.6);
  wp.push(-9.5, 640.6);
  wp.push(-3.5, 642.6);
  wp.push(2.0, 644.6);
  wp.push(-4.5, 646.6);
  wp.push(-9.5, 648.6);
  wp.push(-4.5, 650.6);
  wp.push(-9.5, 652.6);
  wp.push(-9.5, 654.6);
  wp.push(-3.5, 656.6);
  wp.push(-0.5, 658.6);
  wp.push(1.5, 660.6);
  wp.push(4.5, 661.6);
  wp.push(8.0, 661.6);

  return b.build();
}
