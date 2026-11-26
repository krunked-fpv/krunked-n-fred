// ============================================================================
// Krunked & Fred — Keyboard Input Driver
// ============================================================================

import {
  DEFAULT_KEYBINDS,
  createEmptyPlayerInput,
  type EmoteType,
  type KeybindProfile,
  type PlayerInput,
} from '../contracts';

export type MenuNavAction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'confirm'
  | 'back'
  | 'pause'
  | 'tab_prev'
  | 'tab_next'
  | 'toggle_drawer';

export interface KeyboardDriverOptions {
  keybinds?: KeybindProfile;
  grabToggleMode?: boolean;
  onAnyKeyActivity?: () => void;
  onMenuNav?: (action: MenuNavAction) => void;
}

const PREVENT_DEFAULT_CODES: ReadonlySet<string> = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'F9',
]);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export class KeyboardDriver {
  private keybinds: KeybindProfile;
  private grabToggleMode: boolean;
  private readonly onAnyKeyActivity?: () => void;
  private readonly onMenuNav?: (action: MenuNavAction) => void;

  private readonly held = new Set<string>();
  private readonly menuQueue: MenuNavAction[] = [];

  private p1JumpQueued = false;
  private p2JumpQueued = false;
  private p1GrabLatched = false;
  private p2GrabLatched = false;
  private flagQueued = false;
  private p1EmoteQueued: EmoteType = 'none';
  private p2EmoteQueued: EmoteType = 'none';

  private captureCallback: ((code: string) => void) | null = null;
  private disposed = false;

  private readonly handleKeyDownBound: (e: KeyboardEvent) => void;
  private readonly handleKeyUpBound: (e: KeyboardEvent) => void;
  private readonly handleBlurBound: () => void;
  private readonly handleVisibilityBound: () => void;

  constructor(options: KeyboardDriverOptions = {}) {
    this.keybinds = { ...(options.keybinds ?? DEFAULT_KEYBINDS) };
    this.grabToggleMode = options.grabToggleMode ?? false;
    this.onAnyKeyActivity = options.onAnyKeyActivity;
    this.onMenuNav = options.onMenuNav;

    this.handleKeyDownBound = (e) => this.onKeyDown(e);
    this.handleKeyUpBound = (e) => this.onKeyUp(e);
    this.handleBlurBound = () => this.clearAll();
    this.handleVisibilityBound = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        this.clearAll();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.handleKeyDownBound);
      window.addEventListener('keyup', this.handleKeyUpBound);
      window.addEventListener('blur', this.handleBlurBound);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityBound);
    }
  }

  setKeybinds(profile: KeybindProfile): void {
    this.keybinds = { ...profile };
  }

  getKeybinds(): KeybindProfile {
    return { ...this.keybinds };
  }

  setGrabToggleMode(enabled: boolean): void {
    this.grabToggleMode = enabled;
    if (!enabled) {
      this.p1GrabLatched = false;
      this.p2GrabLatched = false;
    }
  }

  captureNextKey(cb: ((code: string) => void) | null): void {
    this.captureCallback = cb;
  }

  resetStepEdges(): void {
    this.p1JumpQueued = false;
    this.p2JumpQueued = false;
    this.flagQueued = false;
    this.p1EmoteQueued = 'none';
    this.p2EmoteQueued = 'none';
    this.p1GrabLatched = false;
    this.p2GrabLatched = false;
  }

  clearAll(): void {
    this.held.clear();
    this.p1JumpQueued = false;
    this.p2JumpQueued = false;
    this.flagQueued = false;
    this.p1EmoteQueued = 'none';
    this.p2EmoteQueued = 'none';
  }

  drainMenuActions(): MenuNavAction[] {
    if (this.menuQueue.length === 0) return [];
    const out = this.menuQueue.slice();
    this.menuQueue.length = 0;
    return out;
  }

  sample(): { p1: PlayerInput; p2: PlayerInput } {
    const kb = this.keybinds;

    const p1 = createEmptyPlayerInput();
    const p1Left = this.held.has(kb.p1Left);
    const p1Right = this.held.has(kb.p1Right);
    const p1Up = this.held.has(kb.p1Up);
    const p1Down = this.held.has(kb.p1Down);
    const p1JumpHeld = this.held.has(kb.p1Jump);

    p1.moveX = (p1Right ? 1 : 0) - (p1Left ? 1 : 0);
    p1.moveY = (p1Up ? 1 : 0) - (p1Down ? 1 : 0);
    p1.jump = p1JumpHeld || this.p1JumpQueued;
    p1.jumpPressed = this.p1JumpQueued;
    p1.grab = this.grabToggleMode ? this.p1GrabLatched : this.held.has(kb.p1Grab);
    p1.anchor = this.held.has(kb.p1Anchor);
    p1.pull = this.held.has(kb.p1Pull);
    p1.flag = this.held.has(kb.flag) || this.flagQueued;
    p1.callCharlie = this.held.has(kb.charlie);
    p1.emote = this.p1EmoteQueued;

    const p2 = createEmptyPlayerInput();
    const p2Left = this.held.has(kb.p2Left);
    const p2Right = this.held.has(kb.p2Right);
    const p2Up = this.held.has(kb.p2Up);
    const p2Down = this.held.has(kb.p2Down);
    const p2JumpHeld = this.held.has(kb.p2Jump);

    p2.moveX = (p2Right ? 1 : 0) - (p2Left ? 1 : 0);
    p2.moveY = (p2Up ? 1 : 0) - (p2Down ? 1 : 0);
    p2.jump = p2JumpHeld || this.p2JumpQueued;
    p2.jumpPressed = this.p2JumpQueued;
    p2.grab = this.grabToggleMode ? this.p2GrabLatched : this.held.has(kb.p2Grab);
    p2.anchor = this.held.has(kb.p2Anchor);
    p2.pull = this.held.has(kb.p2Pull);
    p2.flag = false;
    p2.callCharlie = false;
    p2.emote = this.p2EmoteQueued;

    // Clear per-50Hz-step edge triggers cleanly
    this.p1JumpQueued = false;
    this.p2JumpQueued = false;
    this.flagQueued = false;
    this.p1EmoteQueued = 'none';
    this.p2EmoteQueued = 'none';

    return { p1, p2 };
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.disposed) return;

    const code = e.code;

    // F9 toggles Dev Playtest Drawer from anywhere
    if (code === 'F9') {
      e.preventDefault();
      if (!e.repeat) {
        this.emitMenuAction('toggle_drawer');
      }
      this.onAnyKeyActivity?.();
      return;
    }

    if (isEditableTarget(e.target)) {
      return;
    }

    if (PREVENT_DEFAULT_CODES.has(code)) {
      e.preventDefault();
    }

    this.onAnyKeyActivity?.();

    if (this.captureCallback) {
      e.preventDefault();
      const cb = this.captureCallback;
      this.captureCallback = null;
      if (code !== 'Escape') {
        cb(code);
      }
      return;
    }

    const wasHeld = this.held.has(code);
    this.held.add(code);

    const kb = this.keybinds;

    // Gameplay edge-triggered actions (ignoring OS key repeat)
    if (!wasHeld && !e.repeat) {
      if (code === kb.p1Jump) {
        this.p1JumpQueued = true;
      }
      if (code === kb.p2Jump) {
        this.p2JumpQueued = true;
      }
      if (this.grabToggleMode) {
        if (code === kb.p1Grab) {
          this.p1GrabLatched = !this.p1GrabLatched;
        }
        if (code === kb.p2Grab) {
          this.p2GrabLatched = !this.p2GrabLatched;
        }
      }
      if (code === kb.flag) {
        this.flagQueued = true;
      }
      if (code === kb.emote) {
        this.p1EmoteQueued = 'clap';
      } else if (code === 'Digit1') {
        this.p1EmoteQueued = 'rps_rock';
      } else if (code === 'Digit2') {
        this.p1EmoteQueued = 'rps_paper';
      } else if (code === 'Digit3') {
        this.p1EmoteQueued = 'rps_scissors';
      } else if (code === 'Digit8') {
        this.p2EmoteQueued = 'rps_rock';
      } else if (code === 'Digit9') {
        this.p2EmoteQueued = 'rps_paper';
      } else if (code === 'Digit0') {
        this.p2EmoteQueued = 'rps_scissors';
      } else if (code === 'Quote') {
        this.p2EmoteQueued = 'clap';
      }
    }

    // Menu navigation actions (allow directional repeat; gate confirm/pause/back on !repeat)
    if (code === 'ArrowUp' || code === 'KeyW') {
      this.emitMenuAction('up');
    } else if (code === 'ArrowDown' || code === 'KeyS') {
      this.emitMenuAction('down');
    } else if (code === 'ArrowLeft' || code === 'KeyA') {
      this.emitMenuAction('left');
    } else if (code === 'ArrowRight' || code === 'KeyD') {
      this.emitMenuAction('right');
    } else if (!e.repeat) {
      if (code === 'Enter' || code === 'Space') {
        this.emitMenuAction('confirm');
      } else if (code === 'Escape') {
        this.emitMenuAction('pause');
      } else if (code === 'Backspace') {
        this.emitMenuAction('back');
      } else if (code === 'BracketLeft' || code === 'KeyQ') {
        this.emitMenuAction('tab_prev');
      } else if (code === 'BracketRight' || code === 'KeyE') {
        this.emitMenuAction('tab_next');
      }
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (this.disposed) return;
    this.held.delete(e.code);
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
    this.held.clear();
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.handleKeyDownBound);
      window.removeEventListener('keyup', this.handleKeyUpBound);
      window.removeEventListener('blur', this.handleBlurBound);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityBound);
    }
  }
}
