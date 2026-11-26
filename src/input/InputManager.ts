// ============================================================================
// Krunked & Fred — Unified Input Manager
// Merges Keyboard, Gamepad (Xbox/PS/Switch/Tesla HID), Auto-Hiding TouchOverlay,
// and DebugBridge input overrides into a deterministic 50 Hz InputFrame.
// ============================================================================

import {
  createEmptyInputFrame,
  createEmptyPlayerInput,
  type EmoteType,
  type InputFrame,
  type InputGlyphStyle,
  type KeybindProfile,
  type PlayerInput,
  type TouchMode,
} from '../contracts';
import { GamepadDriver } from './GamepadDriver';
import { KeyboardDriver, type MenuNavAction } from './KeyboardDriver';
import { TouchOverlay } from './TouchOverlay';

export type { MenuNavAction };

export interface InputManagerOptions {
  keybinds: KeybindProfile;
  touchMode: TouchMode;
  gamepadSplitMode: boolean;
  grabToggleMode: boolean;
  onMenuNav?: (action: MenuNavAction) => void;
  onGlyphChange?: (style: InputGlyphStyle) => void;
  onTouchVisibilityChange?: (visible: boolean) => void;
  onAnyUserGesture?: () => void;
}

function clampAxis(val: number): number {
  if (val > 0) return 1;
  if (val < 0) return -1;
  return 0;
}

function pickEmote(a: EmoteType, b: EmoteType, c: EmoteType): EmoteType {
  if (a !== 'none') return a;
  if (b !== 'none') return b;
  return c;
}

function mergePlayerInputs(kb: PlayerInput, gp: PlayerInput, touch: PlayerInput): PlayerInput {
  const out = createEmptyPlayerInput();
  out.moveX = clampAxis(kb.moveX + gp.moveX + touch.moveX);
  out.moveY = clampAxis(kb.moveY + gp.moveY + touch.moveY);
  out.jump = kb.jump || gp.jump || touch.jump;
  out.jumpPressed = kb.jumpPressed || gp.jumpPressed || touch.jumpPressed;
  out.grab = kb.grab || gp.grab || touch.grab;
  out.anchor = kb.anchor || gp.anchor || touch.anchor;
  out.pull = kb.pull || gp.pull || touch.pull;
  out.flag = kb.flag || gp.flag || touch.flag;
  out.callCharlie = kb.callCharlie || gp.callCharlie || touch.callCharlie;
  out.emote = pickEmote(kb.emote, gp.emote, touch.emote);
  return out;
}

function applyOverride(
  base: PlayerInput,
  override: Partial<PlayerInput> | null,
  prevJump: boolean,
): { input: PlayerInput; jumpHeld: boolean } {
  if (!override) {
    return { input: base, jumpHeld: false };
  }
  const out: PlayerInput = { ...base };
  if (override.moveX !== undefined) {
    out.moveX = Math.max(-1, Math.min(1, override.moveX));
  }
  if (override.moveY !== undefined) {
    out.moveY = Math.max(-1, Math.min(1, override.moveY));
  }
  if (override.jump !== undefined) {
    out.jump = override.jump;
    out.jumpPressed =
      override.jumpPressed !== undefined ? override.jumpPressed : override.jump && !prevJump;
  } else if (override.jumpPressed !== undefined) {
    out.jumpPressed = override.jumpPressed;
    if (override.jumpPressed) out.jump = true;
  }
  if (override.grab !== undefined) out.grab = override.grab;
  if (override.anchor !== undefined) out.anchor = override.anchor;
  if (override.pull !== undefined) out.pull = override.pull;
  if (override.flag !== undefined) out.flag = override.flag;
  if (override.callCharlie !== undefined) out.callCharlie = override.callCharlie;
  if (override.emote !== undefined) out.emote = override.emote;

  return { input: out, jumpHeld: Boolean(override.jump) };
}

export class InputManager {
  private readonly keyboard: KeyboardDriver;
  private readonly gamepad: GamepadDriver;
  private readonly touch: TouchOverlay;

  private readonly onMenuNav?: (action: MenuNavAction) => void;
  private readonly onGlyphChange?: (style: InputGlyphStyle) => void;
  private readonly onAnyUserGesture?: () => void;

  private glyphStyle: InputGlyphStyle = 'keyboard';
  private overrideP1: Partial<PlayerInput> | null = null;
  private overrideP2: Partial<PlayerInput> | null = null;
  private prevOverrideP1Jump = false;
  private prevOverrideP2Jump = false;
  private disposed = false;

  private readonly handlePointerGestureBound: () => void;

  constructor(container: HTMLElement, options: InputManagerOptions) {
    this.onMenuNav = options.onMenuNav;
    this.onGlyphChange = options.onGlyphChange;
    this.onAnyUserGesture = options.onAnyUserGesture;

    this.touch = new TouchOverlay(container, {
      mode: options.touchMode,
      grabToggleMode: options.grabToggleMode,
      onTouchActivity: () => {
        this.setGlyphStyle('touch');
        this.onAnyUserGesture?.();
      },
      onVisibilityChange: (visible) => {
        options.onTouchVisibilityChange?.(visible);
      },
      onMenuNav: (action) => this.dispatchMenuNav(action),
    });

    this.keyboard = new KeyboardDriver({
      keybinds: options.keybinds,
      grabToggleMode: options.grabToggleMode,
      onAnyKeyActivity: () => {
        this.touch.notifyNonTouchInput();
        this.setGlyphStyle('keyboard');
        this.onAnyUserGesture?.();
      },
      onMenuNav: (action) => this.dispatchMenuNav(action),
    });

    this.gamepad = new GamepadDriver({
      splitMode: options.gamepadSplitMode,
      grabToggleMode: options.grabToggleMode,
      onAnyGamepadActivity: (style) => {
        this.touch.notifyNonTouchInput();
        this.setGlyphStyle(style);
        this.onAnyUserGesture?.();
      },
      onMenuNav: (action) => this.dispatchMenuNav(action),
    });

    this.handlePointerGestureBound = () => {
      this.onAnyUserGesture?.();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('pointerdown', this.handlePointerGestureBound, { passive: true });
    }
  }

  pollUi(dt: number): void {
    if (this.disposed) return;
    this.gamepad.poll(dt);

    const kbActions = this.keyboard.drainMenuActions();
    for (const action of kbActions) {
      this.dispatchMenuNav(action);
    }
    const gpActions = this.gamepad.drainMenuActions();
    for (const action of gpActions) {
      this.dispatchMenuNav(action);
    }
  }

  sampleFrame(tick: number): InputFrame {
    const kb = this.keyboard.sample();
    const gp = this.gamepad.sample();
    const touch = this.touch.sample();

    const mergedP1 = mergePlayerInputs(kb.p1, gp.p1, touch.p1);
    const mergedP2 = mergePlayerInputs(kb.p2, gp.p2, touch.p2);

    const resP1 = applyOverride(mergedP1, this.overrideP1, this.prevOverrideP1Jump);
    const resP2 = applyOverride(mergedP2, this.overrideP2, this.prevOverrideP2Jump);

    this.prevOverrideP1Jump = resP1.jumpHeld;
    this.prevOverrideP2Jump = resP2.jumpHeld;

    const frame = createEmptyInputFrame(tick);
    frame.p1 = resP1.input;
    frame.p2 = resP2.input;
    return frame;
  }

  setKeybinds(profile: KeybindProfile): void {
    this.keyboard.setKeybinds(profile);
  }

  setTouchMode(mode: TouchMode): void {
    this.touch.setMode(mode);
  }

  setGamepadSplitMode(enabled: boolean): void {
    this.gamepad.setSplitMode(enabled);
  }

  setGrabToggleMode(enabled: boolean): void {
    this.keyboard.setGrabToggleMode(enabled);
    this.gamepad.setGrabToggleMode(enabled);
    this.touch.setGrabToggleMode(enabled);
  }

  setTwoPlayerMode(is2P: boolean): void {
    this.touch.setTwoPlayerTabletopEligible(is2P);
  }

  setInputOverride(p1?: Partial<PlayerInput>, p2?: Partial<PlayerInput>): void {
    this.overrideP1 = p1 ? { ...p1 } : null;
    this.overrideP2 = p2 ? { ...p2 } : null;
    if (!p1?.jump) this.prevOverrideP1Jump = false;
    if (!p2?.jump) this.prevOverrideP2Jump = false;
  }

  clearInputOverride(): void {
    this.overrideP1 = null;
    this.overrideP2 = null;
    this.prevOverrideP1Jump = false;
    this.prevOverrideP2Jump = false;
  }

  hasInputOverride(): boolean {
    return this.overrideP1 !== null || this.overrideP2 !== null;
  }

  getGlyphStyle(): InputGlyphStyle {
    return this.glyphStyle;
  }

  isTouchVisible(): boolean {
    return this.touch.isVisible();
  }

  getGamepadCount(): number {
    return this.gamepad.getConnectedCount();
  }

  triggerRumble(padIndex: number, weak: number, strong: number, durationMs: number): void {
    this.gamepad.triggerRumble(padIndex, weak, strong, durationMs);
  }

  resetStepEdges(): void {
    this.keyboard.resetStepEdges();
    this.gamepad.resetStepEdges();
    this.touch.resetStepEdges();
    this.prevOverrideP1Jump = false;
    this.prevOverrideP2Jump = false;
  }

  private setGlyphStyle(next: InputGlyphStyle): void {
    if (this.glyphStyle === next) return;
    this.glyphStyle = next;
    this.onGlyphChange?.(next);
  }

  private dispatchMenuNav(action: MenuNavAction): void {
    this.onMenuNav?.(action);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this.handlePointerGestureBound);
    }
    this.keyboard.dispose();
    this.gamepad.dispose();
    this.touch.dispose();
  }
}
