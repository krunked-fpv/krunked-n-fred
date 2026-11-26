// ============================================================================
// Krunked & Fred — W3C Gamepad Driver (Xbox / PlayStation / Switch / Tesla HID)
// ============================================================================

import {
  createEmptyPlayerInput,
  type InputGlyphStyle,
  type PlayerInput,
} from '../contracts';
import type { MenuNavAction } from './KeyboardDriver';

export const GAMEPAD_RADIAL_DEADZONE = 0.18;
const STICK_SNAP_THRESHOLD = 0.22;
const NAV_INITIAL_REPEAT_SEC = 0.36;
const NAV_REPEAT_INTERVAL_SEC = 0.12;

export interface GamepadDriverOptions {
  splitMode?: boolean;
  grabToggleMode?: boolean;
  onAnyGamepadActivity?: (glyphStyle: InputGlyphStyle) => void;
  onMenuNav?: (action: MenuNavAction) => void;
}

interface NormalizedPad {
  index: number;
  glyph: Exclude<InputGlyphStyle, 'keyboard' | 'touch'>;
  lsX: number;
  lsY: number; // Y-UP (+1 up, -1 down)
  rsX: number;
  rsY: number; // Y-UP (+1 up, -1 down)
  dpadUp: boolean;
  dpadDown: boolean;
  dpadLeft: boolean;
  dpadRight: boolean;
  south: boolean; // A / Cross / B(Switch)
  east: boolean; // B / Circle / A(Switch)
  west: boolean; // X / Square / Y(Switch)
  north: boolean; // Y / Triangle / X(Switch)
  lb: boolean;
  rb: boolean;
  lt: boolean;
  rt: boolean;
  select: boolean;
  start: boolean;
  l3: boolean;
  r3: boolean;
  hasActivity: boolean;
}

interface PadPrevState {
  jump: boolean;
  grab: boolean;
  flag: boolean;
  emote: boolean;
  // Split-mode P2 edges on pad 0
  splitP2Jump: boolean;
  splitP2Grab: boolean;
  // Menu nav edges
  navUp: boolean;
  navDown: boolean;
  navLeft: boolean;
  navRight: boolean;
  navConfirm: boolean;
  navBack: boolean;
  navStart: boolean;
  navLb: boolean;
  navRb: boolean;
  // Directional repeat timers
  dirRepeatAction: 'up' | 'down' | 'left' | 'right' | null;
  dirRepeatTimer: number;
}

function createPadPrevState(): PadPrevState {
  return {
    jump: false,
    grab: false,
    flag: false,
    emote: false,
    splitP2Jump: false,
    splitP2Grab: false,
    navUp: false,
    navDown: false,
    navLeft: false,
    navRight: false,
    navConfirm: false,
    navBack: false,
    navStart: false,
    navLb: false,
    navRb: false,
    dirRepeatAction: null,
    dirRepeatTimer: 0,
  };
}

export function applyRadialDeadzone(
  rawX: number,
  rawY: number,
  deadzone = GAMEPAD_RADIAL_DEADZONE,
): { x: number; y: number } {
  const x = Number.isFinite(rawX) ? rawX : 0;
  const y = Number.isFinite(rawY) ? rawY : 0;
  const mag = Math.hypot(x, y);
  if (mag < deadzone || mag === 0) {
    return { x: 0, y: 0 };
  }
  const clampedMag = Math.min(1, mag);
  const scaled = (clampedMag - deadzone) / (1 - deadzone);
  return {
    x: (x / mag) * scaled,
    y: (y / mag) * scaled,
  };
}

export function detectGamepadGlyphStyle(id: string): Exclude<InputGlyphStyle, 'keyboard' | 'touch'> {
  const lower = id.toLowerCase();
  if (
    lower.includes('xbox') ||
    lower.includes('x-box') ||
    lower.includes('xinput') ||
    lower.includes('microsoft') ||
    lower.includes('045e')
  ) {
    return 'xbox';
  }
  if (
    lower.includes('nintendo') ||
    lower.includes('switch') ||
    lower.includes('joy-con') ||
    lower.includes('joycon') ||
    lower.includes('pro controller') ||
    lower.includes('057e')
  ) {
    return 'switch';
  }
  if (
    lower.includes('playstation') ||
    lower.includes('dualshock') ||
    lower.includes('dualsense') ||
    lower.includes('sony') ||
    lower.includes('054c') ||
    lower.includes('ps4') ||
    lower.includes('ps5') ||
    lower.includes('wireless controller')
  ) {
    return 'playstation';
  }
  return 'xbox';
}

function isBtnPressed(gp: Gamepad, idx: number, threshold = 0.35): boolean {
  const btn = gp.buttons[idx];
  if (!btn) return false;
  return btn.pressed || btn.value >= threshold;
}

function readAxis(gp: Gamepad, idx: number): number {
  const val = gp.axes[idx];
  return typeof val === 'number' && Number.isFinite(val) ? val : 0;
}

/**
 * Decodes standard Linux/HID POV Hat axis (typically axis 9 on non-standard pads):
 * -1.0 = N, -0.714 = NE, -0.429 = E, -0.143 = SE, 0.143 = S, 0.429 = SW, 0.714 = W, 1.0 = NW.
 * Centered values are typically > 1.2 (e.g., 3.2857).
 */
function decodePovHat(val: number): {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
} {
  if (!Number.isFinite(val) || val > 1.15 || val < -1.15) {
    return { up: false, down: false, left: false, right: false };
  }
  const eps = 0.14;
  const near = (target: number) => Math.abs(val - target) <= eps;
  const n = near(-1.0);
  const ne = near(-0.714);
  const e = near(-0.429);
  const se = near(-0.143);
  const s = near(0.143);
  const sw = near(0.429);
  const w = near(0.714);
  const nw = near(1.0);
  return {
    up: n || ne || nw,
    down: s || se || sw,
    left: w || sw || nw,
    right: e || ne || se,
  };
}

function normalizeGamepad(gp: Gamepad): NormalizedPad {
  const glyph = detectGamepadGlyphStyle(gp.id || '');
  const isStandard = gp.mapping === 'standard';

  let rawLsX = readAxis(gp, 0);
  let rawLsY = readAxis(gp, 1);
  let rawRsX = 0;
  let rawRsY = 0;

  let dpadUp = false;
  let dpadDown = false;
  let dpadLeft = false;
  let dpadRight = false;

  let south = false;
  let east = false;
  let west = false;
  let north = false;
  let lb = false;
  let rb = false;
  let lt = false;
  let rt = false;
  let select = false;
  let start = false;
  let l3 = false;
  let r3 = false;

  if (isStandard) {
    rawRsX = readAxis(gp, 2);
    rawRsY = readAxis(gp, 3);
    south = isBtnPressed(gp, 0);
    east = isBtnPressed(gp, 1);
    west = isBtnPressed(gp, 2);
    north = isBtnPressed(gp, 3);
    lb = isBtnPressed(gp, 4);
    rb = isBtnPressed(gp, 5);
    lt = isBtnPressed(gp, 6, 0.25);
    rt = isBtnPressed(gp, 7, 0.25);
    select = isBtnPressed(gp, 8);
    start = isBtnPressed(gp, 9);
    l3 = isBtnPressed(gp, 10);
    r3 = isBtnPressed(gp, 11);
    dpadUp = isBtnPressed(gp, 12);
    dpadDown = isBtnPressed(gp, 13);
    dpadLeft = isBtnPressed(gp, 14);
    dpadRight = isBtnPressed(gp, 15);
  } else {
    // Non-standard HID / Tesla MCU / Linux evdev fallback heuristics
    const lowerId = (gp.id || '').toLowerCase();
    const isSonyRaw = glyph === 'playstation';
    const isNintendoRaw = glyph === 'switch';
    const isXboxOrTeslaHid =
      lowerId.includes('tesla') ||
      lowerId.includes('xbox') ||
      lowerId.includes('x-box') ||
      lowerId.includes('8bitdo') ||
      lowerId.includes('logitech') ||
      (!isSonyRaw && !isNintendoRaw);

    if (isSonyRaw) {
      // Raw DualShock4/DualSense HID mapping
      rawRsX = readAxis(gp, 2);
      rawRsY = gp.axes.length > 5 ? readAxis(gp, 5) : readAxis(gp, 3);
      west = isBtnPressed(gp, 0); // Square
      south = isBtnPressed(gp, 1); // Cross
      east = isBtnPressed(gp, 2); // Circle
      north = isBtnPressed(gp, 3); // Triangle
      lb = isBtnPressed(gp, 4);
      rb = isBtnPressed(gp, 5);
      lt = isBtnPressed(gp, 6, 0.25) || (gp.axes.length > 3 && readAxis(gp, 3) > 0.25);
      rt = isBtnPressed(gp, 7, 0.25) || (gp.axes.length > 4 && readAxis(gp, 4) > 0.25);
      select = isBtnPressed(gp, 8);
      start = isBtnPressed(gp, 9);
      l3 = isBtnPressed(gp, 10);
      r3 = isBtnPressed(gp, 11);
    } else if (isNintendoRaw) {
      // Raw Switch Pro / Joy-Con HID
      rawRsX = readAxis(gp, 2);
      rawRsY = readAxis(gp, 3);
      south = isBtnPressed(gp, 0);
      east = isBtnPressed(gp, 1);
      west = isBtnPressed(gp, 2);
      north = isBtnPressed(gp, 3);
      lb = isBtnPressed(gp, 4);
      rb = isBtnPressed(gp, 5);
      lt = isBtnPressed(gp, 6, 0.25);
      rt = isBtnPressed(gp, 7, 0.25);
      select = isBtnPressed(gp, 8);
      start = isBtnPressed(gp, 9);
      l3 = isBtnPressed(gp, 10);
      r3 = isBtnPressed(gp, 11);
    } else if (isXboxOrTeslaHid) {
      // Linux / Tesla Chromium HID gamepad (common XInput/HID descriptor layouts)
      // Axes: 0/1 = LS, 2/3 or 3/4 = RS; axes 2/5 can be triggers (-1..+1) on Linux xpad
      const hasSixAxes = gp.axes.length >= 6;
      rawRsX = hasSixAxes ? readAxis(gp, 3) : readAxis(gp, 2);
      rawRsY = hasSixAxes ? readAxis(gp, 4) : readAxis(gp, 3);
      south = isBtnPressed(gp, 0);
      east = isBtnPressed(gp, 1);
      west = isBtnPressed(gp, 2);
      north = isBtnPressed(gp, 3);
      lb = isBtnPressed(gp, 4);
      rb = isBtnPressed(gp, 5);
      if (gp.buttons.length >= 10) {
        lt = isBtnPressed(gp, 6, 0.25) || (hasSixAxes && readAxis(gp, 2) > 0.25);
        rt = isBtnPressed(gp, 7, 0.25) || (hasSixAxes && readAxis(gp, 5) > 0.25);
        select = isBtnPressed(gp, 8);
        start = isBtnPressed(gp, 9);
        l3 = isBtnPressed(gp, 10);
        r3 = isBtnPressed(gp, 11);
      } else {
        // Compact HID (e.g. xpad 11-button where 6=Back, 7=Start, 8=Guide, 9=L3, 10=R3)
        lt = hasSixAxes && readAxis(gp, 2) > 0.25;
        rt = hasSixAxes && readAxis(gp, 5) > 0.25;
        select = isBtnPressed(gp, 6);
        start = isBtnPressed(gp, 7);
        l3 = isBtnPressed(gp, 9);
        r3 = isBtnPressed(gp, 10);
      }
    }

    // D-Pad heuristics across non-standard pads: buttons 12..15, axes 6/7, or POV hat axis 9
    if (gp.buttons.length >= 16) {
      dpadUp = isBtnPressed(gp, 12);
      dpadDown = isBtnPressed(gp, 13);
      dpadLeft = isBtnPressed(gp, 14);
      dpadRight = isBtnPressed(gp, 15);
    }
    if (!dpadUp && !dpadDown && !dpadLeft && !dpadRight) {
      if (gp.axes.length >= 10) {
        const hat = decodePovHat(readAxis(gp, 9));
        dpadUp = hat.up;
        dpadDown = hat.down;
        dpadLeft = hat.left;
        dpadRight = hat.right;
      } else if (gp.axes.length >= 8) {
        const hatX = readAxis(gp, 6);
        const hatY = readAxis(gp, 7);
        dpadLeft = hatX < -0.5;
        dpadRight = hatX > 0.5;
        dpadUp = hatY < -0.5;
        dpadDown = hatY > 0.5;
      }
    }
  }

  const ls = applyRadialDeadzone(rawLsX, rawLsY, GAMEPAD_RADIAL_DEADZONE);
  const rs = applyRadialDeadzone(rawRsX, rawRsY, GAMEPAD_RADIAL_DEADZONE);

  const hasActivity =
    ls.x !== 0 ||
    ls.y !== 0 ||
    rs.x !== 0 ||
    rs.y !== 0 ||
    dpadUp ||
    dpadDown ||
    dpadLeft ||
    dpadRight ||
    south ||
    east ||
    west ||
    north ||
    lb ||
    rb ||
    lt ||
    rt ||
    select ||
    start ||
    l3 ||
    r3;

  return {
    index: gp.index,
    glyph,
    lsX: ls.x,
    lsY: -ls.y, // invert browser Y-down to Y-up
    rsX: rs.x,
    rsY: -rs.y,
    dpadUp,
    dpadDown,
    dpadLeft,
    dpadRight,
    south,
    east,
    west,
    north,
    lb,
    rb,
    lt,
    rt,
    select,
    start,
    l3,
    r3,
    hasActivity,
  };
}

function snapAxis(val: number): number {
  if (val > STICK_SNAP_THRESHOLD) return 1;
  if (val < -STICK_SNAP_THRESHOLD) return -1;
  return 0;
}

export class GamepadDriver {
  private splitMode: boolean;
  private grabToggleMode: boolean;
  private readonly onAnyGamepadActivity?: (glyphStyle: InputGlyphStyle) => void;
  private readonly onMenuNav?: (action: MenuNavAction) => void;

  private readonly prevStates = new Map<number, PadPrevState>();
  private readonly menuQueue: MenuNavAction[] = [];

  private connectedCount = 0;
  private lastGlyphStyle: Exclude<InputGlyphStyle, 'keyboard' | 'touch'> = 'xbox';

  private p1GrabLatched = false;
  private p2GrabLatched = false;
  private p1JumpQueued = false;
  private p2JumpQueued = false;
  private p1FlagQueued = false;
  private p2FlagQueued = false;
  private p1EmoteQueued = false;
  private p2EmoteQueued = false;

  private lastActivePads: NormalizedPad[] = [];
  private disposed = false;

  private readonly handleConnectedBound: (e: GamepadEvent) => void;
  private readonly handleDisconnectedBound: (e: GamepadEvent) => void;

  constructor(options: GamepadDriverOptions = {}) {
    this.splitMode = options.splitMode ?? false;
    this.grabToggleMode = options.grabToggleMode ?? false;
    this.onAnyGamepadActivity = options.onAnyGamepadActivity;
    this.onMenuNav = options.onMenuNav;

    this.handleConnectedBound = (e) => {
      if (e.gamepad) {
        this.lastGlyphStyle = detectGamepadGlyphStyle(e.gamepad.id || '');
        this.scanConnectedCount();
      }
    };
    this.handleDisconnectedBound = (e) => {
      if (e.gamepad) {
        this.prevStates.delete(e.gamepad.index);
      }
      this.scanConnectedCount();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('gamepadconnected', this.handleConnectedBound);
      window.addEventListener('gamepaddisconnected', this.handleDisconnectedBound);
    }
    this.scanConnectedCount();
  }

  setSplitMode(enabled: boolean): void {
    this.splitMode = enabled;
  }

  setGrabToggleMode(enabled: boolean): void {
    this.grabToggleMode = enabled;
    if (!enabled) {
      this.p1GrabLatched = false;
      this.p2GrabLatched = false;
    }
  }

  getConnectedCount(): number {
    return this.connectedCount;
  }

  getLastGlyphStyle(): Exclude<InputGlyphStyle, 'keyboard' | 'touch'> {
    return this.lastGlyphStyle;
  }

  resetStepEdges(): void {
    this.p1JumpQueued = false;
    this.p2JumpQueued = false;
    this.p1FlagQueued = false;
    this.p2FlagQueued = false;
    this.p1EmoteQueued = false;
    this.p2EmoteQueued = false;
    this.p1GrabLatched = false;
    this.p2GrabLatched = false;
  }

  drainMenuActions(): MenuNavAction[] {
    if (this.menuQueue.length === 0) return [];
    const out = this.menuQueue.slice();
    this.menuQueue.length = 0;
    return out;
  }

  /**
   * Poll W3C Gamepad API once per rAF frame. Captures edge-triggered menu navigation,
   * updates hot-plug count, detects live glyph style, and queues gameplay edge triggers
   * so quick button taps are never missed between 50 Hz simulation steps.
   */
  poll(dt: number): void {
    if (this.disposed) return;
    const rawPads = this.getRawConnectedPads();
    this.connectedCount = rawPads.length;

    const normalized: NormalizedPad[] = [];
    const activeIndices = new Set<number>();

    for (const gp of rawPads) {
      const pad = normalizeGamepad(gp);
      normalized.push(pad);
      activeIndices.add(pad.index);

      if (pad.hasActivity) {
        this.lastGlyphStyle = pad.glyph;
        this.onAnyGamepadActivity?.(pad.glyph);
      }

      const prev = this.getOrCreatePrev(pad.index);
      this.processMenuNavForPad(pad, prev, dt);
    }

    // Prune disconnected pad edge states
    for (const idx of this.prevStates.keys()) {
      if (!activeIndices.has(idx)) {
        this.prevStates.delete(idx);
      }
    }

    // Queue gameplay edges for P1 & P2
    this.updateGameplayEdges(normalized);
    this.lastActivePads = normalized;
  }

  sample(): { p1: PlayerInput; p2: PlayerInput } {
    const p1 = createEmptyPlayerInput();
    const p2 = createEmptyPlayerInput();
    const pads = this.lastActivePads;

    if (pads.length > 0) {
      const pad0 = pads[0];
      if (this.splitMode) {
        // 1-Pad Co-Op Split Mode: Left half -> P1, Right half -> P2
        const p1MoveX =
          (pad0.dpadRight ? 1 : 0) - (pad0.dpadLeft ? 1 : 0) || snapAxis(pad0.lsX);
        const p1MoveY =
          (pad0.dpadUp ? 1 : 0) - (pad0.dpadDown ? 1 : 0) || snapAxis(pad0.lsY);
        p1.moveX = p1MoveX;
        p1.moveY = p1MoveY;
        p1.jump = pad0.lb || this.p1JumpQueued;
        p1.jumpPressed = this.p1JumpQueued;
        p1.grab = this.grabToggleMode ? this.p1GrabLatched : pad0.lt;
        p1.anchor = pad0.l3 || pad0.dpadDown;
        p1.pull = pad0.dpadUp;
        p1.flag = pad0.select || this.p1FlagQueued;
        p1.callCharlie = pad0.select && pad0.l3;
        p1.emote = this.p1EmoteQueued ? 'clap' : 'none';

        p2.moveX = snapAxis(pad0.rsX);
        p2.moveY = snapAxis(pad0.rsY);
        p2.jump = pad0.rb || pad0.south || this.p2JumpQueued;
        p2.jumpPressed = this.p2JumpQueued;
        p2.grab = this.grabToggleMode ? this.p2GrabLatched : pad0.rt || pad0.west;
        p2.anchor = pad0.east || pad0.r3;
        p2.pull = pad0.north;
        p2.flag = false;
        p2.callCharlie = false;
        p2.emote = this.p2EmoteQueued ? 'clap' : 'none';
      } else {
        // Standard Multi-Pad Mapping: Pad 0 -> P1, Pad 1 -> P2
        this.fillStandardPlayerInput(pad0, p1, true);
        if (pads.length > 1) {
          this.fillStandardPlayerInput(pads[1], p2, false);
        }
      }
    }

    // Clear per-step edges
    this.p1JumpQueued = false;
    this.p2JumpQueued = false;
    this.p1FlagQueued = false;
    this.p2FlagQueued = false;
    this.p1EmoteQueued = false;
    this.p2EmoteQueued = false;

    return { p1, p2 };
  }

  /**
   * Safe feature-detected dual-rumble across Chromium W3C `vibrationActuator`,
   * Firefox `hapticActuators`, and gracefully no-op on unsupported browsers.
   * Pass `padIndex = -1` to rumble all connected pads.
   */
  triggerRumble(padIndex: number, weak: number, strong: number, durationMs: number): void {
    if (this.disposed) return;
    const rawPads = this.getRawConnectedPads();
    if (rawPads.length === 0) return;

    const clampedWeak = Math.max(0, Math.min(1, Number.isFinite(weak) ? weak : 0));
    const clampedStrong = Math.max(0, Math.min(1, Number.isFinite(strong) ? strong : 0));
    const clampedMs = Math.max(10, Math.min(2000, Math.round(durationMs)));

    const targets =
      padIndex < 0
        ? rawPads
        : rawPads[padIndex]
          ? [rawPads[padIndex]]
          : [];

    for (const gp of targets) {
      try {
        const anyGp = gp as Gamepad & {
          vibrationActuator?: {
            playEffect?: (
              type: string,
              params: {
                startDelay: number;
                duration: number;
                weakMagnitude: number;
                strongMagnitude: number;
              },
            ) => Promise<string>;
          };
          hapticActuators?: Array<{ pulse?: (value: number, duration: number) => Promise<boolean> }>;
        };

        if (anyGp.vibrationActuator && typeof anyGp.vibrationActuator.playEffect === 'function') {
          void anyGp.vibrationActuator
            .playEffect('dual-rumble', {
              startDelay: 0,
              duration: clampedMs,
              weakMagnitude: clampedWeak,
              strongMagnitude: clampedStrong,
            })
            .catch(() => {
              // Ignore rejected haptic promise
            });
        } else if (
          Array.isArray(anyGp.hapticActuators) &&
          anyGp.hapticActuators[0] &&
          typeof anyGp.hapticActuators[0].pulse === 'function'
        ) {
          void anyGp.hapticActuators[0]
            .pulse(Math.max(clampedWeak, clampedStrong), clampedMs)
            .catch(() => {
              // Ignore rejected haptic promise
            });
        }
      } catch {
        // Safely swallow unsupported haptic exceptions
      }
    }
  }

  private fillStandardPlayerInput(pad: NormalizedPad, out: PlayerInput, isP1: boolean): void {
    const dpadX = (pad.dpadRight ? 1 : 0) - (pad.dpadLeft ? 1 : 0);
    const dpadY = (pad.dpadUp ? 1 : 0) - (pad.dpadDown ? 1 : 0);
    out.moveX = dpadX !== 0 ? dpadX : snapAxis(pad.lsX);
    out.moveY = dpadY !== 0 ? dpadY : snapAxis(pad.lsY);
    out.jump = pad.south || (isP1 ? this.p1JumpQueued : this.p2JumpQueued);
    out.jumpPressed = isP1 ? this.p1JumpQueued : this.p2JumpQueued;
    const grabHeld = pad.west || pad.lb || pad.lt;
    out.grab = this.grabToggleMode
      ? isP1
        ? this.p1GrabLatched
        : this.p2GrabLatched
      : grabHeld;
    out.anchor = pad.east || pad.rb || pad.rt;
    out.pull = pad.north;
    out.flag = pad.select || (isP1 ? this.p1FlagQueued : this.p2FlagQueued);
    out.callCharlie = pad.l3;
    out.emote = (isP1 ? this.p1EmoteQueued : this.p2EmoteQueued) ? 'clap' : 'none';
  }

  private updateGameplayEdges(pads: NormalizedPad[]): void {
    if (pads.length === 0) return;

    const pad0 = pads[0];
    const prev0 = this.getOrCreatePrev(pad0.index);

    if (this.splitMode) {
      const p1JumpNow = pad0.lb;
      const p1GrabNow = pad0.lt;
      const p1FlagNow = pad0.select;
      if (p1JumpNow && !prev0.jump) this.p1JumpQueued = true;
      if (this.grabToggleMode && p1GrabNow && !prev0.grab) {
        this.p1GrabLatched = !this.p1GrabLatched;
      }
      if (p1FlagNow && !prev0.flag) this.p1FlagQueued = true;

      const p2JumpNow = pad0.rb || pad0.south;
      const p2GrabNow = pad0.rt || pad0.west;
      if (p2JumpNow && !prev0.splitP2Jump) this.p2JumpQueued = true;
      if (this.grabToggleMode && p2GrabNow && !prev0.splitP2Grab) {
        this.p2GrabLatched = !this.p2GrabLatched;
      }

      prev0.jump = p1JumpNow;
      prev0.grab = p1GrabNow;
      prev0.flag = p1FlagNow;
      prev0.splitP2Jump = p2JumpNow;
      prev0.splitP2Grab = p2GrabNow;
    } else {
      const p1JumpNow = pad0.south;
      const p1GrabNow = pad0.west || pad0.lb || pad0.lt;
      const p1FlagNow = pad0.select;
      const p1EmoteNow = pad0.r3;
      if (p1JumpNow && !prev0.jump) this.p1JumpQueued = true;
      if (this.grabToggleMode && p1GrabNow && !prev0.grab) {
        this.p1GrabLatched = !this.p1GrabLatched;
      }
      if (p1FlagNow && !prev0.flag) this.p1FlagQueued = true;
      if (p1EmoteNow && !prev0.emote) this.p1EmoteQueued = true;
      prev0.jump = p1JumpNow;
      prev0.grab = p1GrabNow;
      prev0.flag = p1FlagNow;
      prev0.emote = p1EmoteNow;

      if (pads.length > 1) {
        const pad1 = pads[1];
        const prev1 = this.getOrCreatePrev(pad1.index);
        const p2JumpNow = pad1.south;
        const p2GrabNow = pad1.west || pad1.lb || pad1.lt;
        const p2FlagNow = pad1.select;
        const p2EmoteNow = pad1.r3;
        if (p2JumpNow && !prev1.jump) this.p2JumpQueued = true;
        if (this.grabToggleMode && p2GrabNow && !prev1.grab) {
          this.p2GrabLatched = !this.p2GrabLatched;
        }
        if (p2FlagNow && !prev1.flag) this.p2FlagQueued = true;
        if (p2EmoteNow && !prev1.emote) this.p2EmoteQueued = true;
        prev1.jump = p2JumpNow;
        prev1.grab = p2GrabNow;
        prev1.flag = p2FlagNow;
        prev1.emote = p2EmoteNow;
      }
    }
  }

  private processMenuNavForPad(pad: NormalizedPad, prev: PadPrevState, dt: number): void {
    const up = pad.dpadUp || pad.lsY > 0.55;
    const down = pad.dpadDown || pad.lsY < -0.55;
    const left = pad.dpadLeft || pad.lsX < -0.55;
    const right = pad.dpadRight || pad.lsX > 0.55;

    // Edge trigger directions + smooth hold repeat
    const activeDir: 'up' | 'down' | 'left' | 'right' | null = up
      ? 'up'
      : down
        ? 'down'
        : left
          ? 'left'
          : right
            ? 'right'
            : null;

    if (up && !prev.navUp) {
      this.emitMenuAction('up');
      prev.dirRepeatAction = 'up';
      prev.dirRepeatTimer = NAV_INITIAL_REPEAT_SEC;
    } else if (down && !prev.navDown) {
      this.emitMenuAction('down');
      prev.dirRepeatAction = 'down';
      prev.dirRepeatTimer = NAV_INITIAL_REPEAT_SEC;
    } else if (left && !prev.navLeft) {
      this.emitMenuAction('left');
      prev.dirRepeatAction = 'left';
      prev.dirRepeatTimer = NAV_INITIAL_REPEAT_SEC;
    } else if (right && !prev.navRight) {
      this.emitMenuAction('right');
      prev.dirRepeatAction = 'right';
      prev.dirRepeatTimer = NAV_INITIAL_REPEAT_SEC;
    } else if (activeDir && prev.dirRepeatAction === activeDir) {
      prev.dirRepeatTimer -= Math.max(0, dt);
      if (prev.dirRepeatTimer <= 0) {
        this.emitMenuAction(activeDir);
        prev.dirRepeatTimer = NAV_REPEAT_INTERVAL_SEC;
      }
    } else if (!activeDir) {
      prev.dirRepeatAction = null;
      prev.dirRepeatTimer = 0;
    }

    if (pad.south && !prev.navConfirm) this.emitMenuAction('confirm');
    if (pad.east && !prev.navBack) this.emitMenuAction('back');
    if (pad.start && !prev.navStart) this.emitMenuAction('pause');
    if (pad.lb && !prev.navLb) this.emitMenuAction('tab_prev');
    if (pad.rb && !prev.navRb) this.emitMenuAction('tab_next');

    prev.navUp = up;
    prev.navDown = down;
    prev.navLeft = left;
    prev.navRight = right;
    prev.navConfirm = pad.south;
    prev.navBack = pad.east;
    prev.navStart = pad.start;
    prev.navLb = pad.lb;
    prev.navRb = pad.rb;
  }

  private getOrCreatePrev(index: number): PadPrevState {
    let prev = this.prevStates.get(index);
    if (!prev) {
      prev = createPadPrevState();
      this.prevStates.set(index, prev);
    }
    return prev;
  }

  private getRawConnectedPads(): Gamepad[] {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
      return [];
    }
    try {
      const list = navigator.getGamepads();
      if (!list) return [];
      const connected: Gamepad[] = [];
      for (let i = 0; i < list.length; i++) {
        const gp = list[i];
        if (gp && gp.connected) {
          connected.push(gp);
        }
      }
      return connected;
    } catch {
      return [];
    }
  }

  private scanConnectedCount(): void {
    this.connectedCount = this.getRawConnectedPads().length;
  }

  private emitMenuAction(action: MenuNavAction): void {
    if (this.onMenuNav) {
      this.onMenuNav(action);
    } else {
      this.menuQueue.push(action);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.prevStates.clear();
    if (typeof window !== 'undefined') {
      window.removeEventListener('gamepadconnected', this.handleConnectedBound);
      window.removeEventListener('gamepaddisconnected', this.handleDisconnectedBound);
    }
  }
}
