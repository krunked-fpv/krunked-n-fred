// ============================================================================
// Krunked & Fred — Auto-Hiding Translucent Pixel Touch Overlay
// Strictly hidden on desktop boot until real touch input occurs (touchMode='auto').
// ============================================================================

import {
  PALETTE,
  createEmptyPlayerInput,
  type PlayerInput,
  type TouchMode,
} from '../contracts';
import type { MenuNavAction } from './KeyboardDriver';

export interface TouchOverlayOptions {
  mode?: TouchMode;
  grabToggleMode?: boolean;
  onTouchActivity?: () => void;
  onVisibilityChange?: (visible: boolean) => void;
  onMenuNav?: (action: MenuNavAction) => void;
}

type TouchActionKind = 'left' | 'right' | 'jump' | 'grab' | 'anchor' | 'pull_flag';

interface ActiveTouchBinding {
  player: 'p1' | 'p2';
  action: TouchActionKind;
  el: HTMLElement;
  downAtMs: number;
}

const STYLE_ELEMENT_ID = 'krunked-touch-overlay-styles';
const TABLETOP_MIN_WIDTH = 900;
const FLAG_TAP_MAX_MS = 260;

function injectTouchStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ELEMENT_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = `
.kf-touch-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  pointer-events: none;
  overflow: hidden;
  font-family: 'Courier New', Courier, monospace;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}

.kf-touch-btn {
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  background: rgba(96, 88, 174, 0.94);
  color: ${PALETTE.BELLY_WHITE};
  border: 2px solid ${PALETTE.SNOW_LIGHT};
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.45), 0 2px 0 ${PALETTE.OUTLINE};
  opacity: 0.28;
  font-family: 'Courier New', Courier, monospace;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  text-shadow: 1px 1px 0 ${PALETTE.OUTLINE}, -1px -1px 0 ${PALETTE.OUTLINE};
  cursor: pointer;
  touch-action: none;
  transition: opacity 60ms linear, transform 60ms linear;
}

.kf-touch-btn.is-pressed,
.kf-touch-btn.is-latched {
  opacity: 0.55;
  transform: translateY(1px);
  background: rgba(109, 88, 183, 0.95);
}

.kf-touch-btn.is-latched {
  box-shadow: inset 0 0 0 2px ${PALETTE.BEAK_BRIGHT}, 0 2px 0 ${PALETTE.OUTLINE};
}

.kf-touch-btn.p1-accent {
  border-color: ${PALETTE.OUTLINE};
  box-shadow: inset 0 0 0 2px ${PALETTE.KRUNKED_SCARF}, 0 2px 0 ${PALETTE.OUTLINE};
}

.kf-touch-btn.p2-accent {
  border-color: ${PALETTE.OUTLINE};
  box-shadow: inset 0 0 0 2px ${PALETTE.FRED_SCARF}, 0 2px 0 ${PALETTE.OUTLINE};
}

.kf-touch-top-bar {
  position: absolute;
  top: max(10px, env(safe-area-inset-top));
  left: max(10px, env(safe-area-inset-left));
  right: max(10px, env(safe-area-inset-right));
  display: flex;
  justify-content: space-between;
  align-items: center;
  pointer-events: none;
}

.kf-touch-top-group {
  display: flex;
  gap: 8px;
  pointer-events: none;
}

.kf-touch-pill {
  height: 34px;
  padding: 0 12px;
  font-size: 11px;
}

.kf-touch-cluster-left {
  position: absolute;
  left: max(16px, env(safe-area-inset-left));
  bottom: max(18px, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.kf-touch-cluster-right {
  position: absolute;
  right: max(16px, env(safe-area-inset-right));
  bottom: max(18px, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  pointer-events: none;
}

.kf-touch-rocker {
  pointer-events: auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: 148px;
  height: 68px;
  gap: 4px;
  touch-action: none;
}

.kf-touch-rocker .kf-touch-btn {
  width: 100%;
  height: 100%;
  font-size: 20px;
}

.kf-touch-action-grid {
  display: grid;
  grid-template-columns: 72px 72px;
  grid-template-rows: 52px 62px;
  gap: 8px;
  pointer-events: none;
}

.kf-touch-action-btn {
  font-size: 11px;
  line-height: 1.1;
  text-align: center;
}

.kf-touch-action-jump {
  font-size: 13px;
  background: rgba(209, 22, 81, 0.9);
}

.kf-touch-tabletop-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
  pointer-events: none;
}

.kf-touch-tabletop-row {
  display: flex;
  gap: 6px;
  pointer-events: none;
}

.kf-touch-tabletop-btn {
  width: 62px;
  height: 46px;
  font-size: 10px;
}

.kf-touch-tabletop-rocker {
  width: 130px;
  height: 54px;
}
`;
  document.head.appendChild(style);
}

export class TouchOverlay {
  private readonly container: HTMLElement;
  private readonly root: HTMLDivElement;
  private readonly onTouchActivity?: () => void;
  private readonly onVisibilityChange?: (visible: boolean) => void;
  private readonly onMenuNav?: (action: MenuNavAction) => void;

  private mode: TouchMode;
  private visible = false;
  private grabToggleMode: boolean;
  private twoPlayerEligible = false;
  private tabletop2PEnabled = false;

  private readonly activePointers = new Map<number, ActiveTouchBinding>();
  private readonly rockerPointers = new Map<
    number,
    { player: 'p1' | 'p2'; rockerEl: HTMLElement; leftEl: HTMLElement; rightEl: HTMLElement; dir: -1 | 0 | 1 }
  >();

  private p1GrabLatched = false;
  private p2GrabLatched = false;
  private p1JumpQueued = false;
  private p2JumpQueued = false;
  private p1FlagQueued = false;
  private p2FlagQueued = false;
  private p1EmoteQueued = false;

  private grabBtnP1: HTMLButtonElement | null = null;
  private grabBtnP2: HTMLButtonElement | null = null;
  private disposed = false;

  private readonly handleWindowPointerDownBound: (e: PointerEvent) => void;
  private readonly handleWindowTouchStartBound: (e: TouchEvent) => void;
  private readonly handleWindowPointerUpBound: (e: PointerEvent) => void;
  private readonly handleWindowResizeBound: () => void;

  constructor(container: HTMLElement, options: TouchOverlayOptions = {}) {
    this.container = container;
    this.mode = options.mode ?? 'auto';
    this.grabToggleMode = options.grabToggleMode ?? false;
    this.onTouchActivity = options.onTouchActivity;
    this.onVisibilityChange = options.onVisibilityChange;
    this.onMenuNav = options.onMenuNav;

    injectTouchStyles();

    this.root = document.createElement('div');
    this.root.id = 'krunked-touch-overlay';
    this.root.className = 'kf-touch-overlay';
    // CRITICAL: Strictly hidden on boot unless mode === 'on'
    this.visible = this.mode === 'on';
    this.applyVisibilityDom();

    this.rebuildLayout();
    this.container.appendChild(this.root);

    this.handleWindowPointerDownBound = (e: PointerEvent) => {
      if (this.disposed) return;
      if (e.pointerType === 'touch') {
        this.handleRealTouchDetected();
      }
    };

    this.handleWindowTouchStartBound = () => {
      if (this.disposed) return;
      this.handleRealTouchDetected();
    };

    this.handleWindowPointerUpBound = (e: PointerEvent) => {
      this.releasePointer(e.pointerId);
    };

    this.handleWindowResizeBound = () => {
      if (this.disposed) return;
      const wide = this.isWideScreen();
      if (!wide && this.tabletop2PEnabled) {
        this.tabletop2PEnabled = false;
        this.rebuildLayout();
      } else if (this.visible) {
        this.rebuildLayout();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('pointerdown', this.handleWindowPointerDownBound, {
        capture: true,
        passive: true,
      });
      window.addEventListener('touchstart', this.handleWindowTouchStartBound, {
        capture: true,
        passive: true,
      });
      window.addEventListener('pointerup', this.handleWindowPointerUpBound, { capture: true });
      window.addEventListener('pointercancel', this.handleWindowPointerUpBound, { capture: true });
      window.addEventListener('resize', this.handleWindowResizeBound);
    }
  }

  getRootElement(): HTMLElement {
    return this.root;
  }

  getMode(): TouchMode {
    return this.mode;
  }

  isVisible(): boolean {
    return this.visible;
  }

  setMode(mode: TouchMode): void {
    this.mode = mode;
    if (mode === 'off') {
      this.setVisible(false);
    } else if (mode === 'on') {
      this.setVisible(true);
    } else {
      // 'auto': stay hidden until an actual touch event fires
      this.setVisible(false);
    }
  }

  setGrabToggleMode(enabled: boolean): void {
    this.grabToggleMode = enabled;
    if (!enabled) {
      this.p1GrabLatched = false;
      this.p2GrabLatched = false;
      this.syncGrabLatchVisuals();
    }
  }

  setTwoPlayerTabletopEligible(eligible: boolean): void {
    if (this.twoPlayerEligible === eligible) return;
    this.twoPlayerEligible = eligible;
    if (!eligible && this.tabletop2PEnabled) {
      this.tabletop2PEnabled = false;
    }
    this.rebuildLayout();
  }

  notifyNonTouchInput(): void {
    if (this.mode === 'auto' && this.visible) {
      this.clearAllTouches();
      this.setVisible(false);
    }
  }

  resetStepEdges(): void {
    this.p1JumpQueued = false;
    this.p2JumpQueued = false;
    this.p1FlagQueued = false;
    this.p2FlagQueued = false;
    this.p1EmoteQueued = false;
    this.p1GrabLatched = false;
    this.p2GrabLatched = false;
    this.syncGrabLatchVisuals();
  }

  sample(): { p1: PlayerInput; p2: PlayerInput } {
    const p1 = createEmptyPlayerInput();
    const p2 = createEmptyPlayerInput();

    if (!this.visible) {
      this.p1JumpQueued = false;
      this.p2JumpQueued = false;
      this.p1FlagQueued = false;
      this.p2FlagQueued = false;
      this.p1EmoteQueued = false;
      return { p1, p2 };
    }

    let p1Left = false;
    let p1Right = false;
    let p1JumpHeld = false;
    let p1GrabHeld = false;
    let p1AnchorHeld = false;
    let p1PullHeld = false;

    let p2Left = false;
    let p2Right = false;
    let p2JumpHeld = false;
    let p2GrabHeld = false;
    let p2AnchorHeld = false;
    let p2PullHeld = false;

    for (const r of this.rockerPointers.values()) {
      if (r.player === 'p1') {
        if (r.dir < 0) p1Left = true;
        if (r.dir > 0) p1Right = true;
      } else {
        if (r.dir < 0) p2Left = true;
        if (r.dir > 0) p2Right = true;
      }
    }

    for (const binding of this.activePointers.values()) {
      if (binding.player === 'p1') {
        if (binding.action === 'left') p1Left = true;
        else if (binding.action === 'right') p1Right = true;
        else if (binding.action === 'jump') p1JumpHeld = true;
        else if (binding.action === 'grab') p1GrabHeld = true;
        else if (binding.action === 'anchor') p1AnchorHeld = true;
        else if (binding.action === 'pull_flag') p1PullHeld = true;
      } else {
        if (binding.action === 'left') p2Left = true;
        else if (binding.action === 'right') p2Right = true;
        else if (binding.action === 'jump') p2JumpHeld = true;
        else if (binding.action === 'grab') p2GrabHeld = true;
        else if (binding.action === 'anchor') p2AnchorHeld = true;
        else if (binding.action === 'pull_flag') p2PullHeld = true;
      }
    }

    p1.moveX = (p1Right ? 1 : 0) - (p1Left ? 1 : 0);
    p1.jump = p1JumpHeld || this.p1JumpQueued;
    p1.jumpPressed = this.p1JumpQueued;
    p1.grab = this.grabToggleMode ? this.p1GrabLatched : p1GrabHeld;
    p1.anchor = p1AnchorHeld;
    p1.pull = p1PullHeld;
    p1.flag = this.p1FlagQueued;
    p1.emote = this.p1EmoteQueued ? 'clap' : 'none';

    p2.moveX = (p2Right ? 1 : 0) - (p2Left ? 1 : 0);
    p2.jump = p2JumpHeld || this.p2JumpQueued;
    p2.jumpPressed = this.p2JumpQueued;
    p2.grab = this.grabToggleMode ? this.p2GrabLatched : p2GrabHeld;
    p2.anchor = p2AnchorHeld;
    p2.pull = p2PullHeld;
    p2.flag = this.p2FlagQueued;

    this.p1JumpQueued = false;
    this.p2JumpQueued = false;
    this.p1FlagQueued = false;
    this.p2FlagQueued = false;
    this.p1EmoteQueued = false;

    return { p1, p2 };
  }

  private handleRealTouchDetected(): void {
    if (this.mode === 'off') return;
    if (this.mode === 'auto' && !this.visible) {
      this.setVisible(true);
    }
    this.onTouchActivity?.();
  }

  private setVisible(next: boolean): void {
    const changed = this.visible !== next;
    this.visible = next;
    this.applyVisibilityDom();
    if (!next) {
      this.clearAllTouches();
    }
    if (changed) {
      this.onVisibilityChange?.(next);
    }
  }

  private applyVisibilityDom(): void {
    this.root.style.display = this.visible ? 'block' : 'none';
    this.root.dataset.visible = this.visible ? 'true' : 'false';
    this.root.setAttribute('aria-hidden', this.visible ? 'false' : 'true');
  }

  private isWideScreen(): boolean {
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= TABLETOP_MIN_WIDTH;
  }

  private clearAllTouches(): void {
    for (const binding of this.activePointers.values()) {
      binding.el.classList.remove('is-pressed');
    }
    this.activePointers.clear();

    for (const r of this.rockerPointers.values()) {
      r.leftEl.classList.remove('is-pressed');
      r.rightEl.classList.remove('is-pressed');
    }
    this.rockerPointers.clear();
  }

  private releasePointer(pointerId: number): void {
    const binding = this.activePointers.get(pointerId);
    if (binding) {
      binding.el.classList.remove('is-pressed');
      if (binding.action === 'pull_flag') {
        const heldMs = performance.now() - binding.downAtMs;
        if (heldMs <= FLAG_TAP_MAX_MS) {
          if (binding.player === 'p1') this.p1FlagQueued = true;
          else this.p2FlagQueued = true;
        }
      }
      this.activePointers.delete(pointerId);
    }

    const rocker = this.rockerPointers.get(pointerId);
    if (rocker) {
      rocker.leftEl.classList.remove('is-pressed');
      rocker.rightEl.classList.remove('is-pressed');
      this.rockerPointers.delete(pointerId);
    }
  }

  private syncGrabLatchVisuals(): void {
    if (this.grabBtnP1) {
      this.grabBtnP1.classList.toggle('is-latched', this.grabToggleMode && this.p1GrabLatched);
    }
    if (this.grabBtnP2) {
      this.grabBtnP2.classList.toggle('is-latched', this.grabToggleMode && this.p2GrabLatched);
    }
  }

  private rebuildLayout(): void {
    this.clearAllTouches();
    this.root.innerHTML = '';
    this.grabBtnP1 = null;
    this.grabBtnP2 = null;

    // Top Corner Pills: PAUSE (left) & EMOTE (+ optional 2P PAD on wide touch screens >= 900px)
    const topBar = document.createElement('div');
    topBar.className = 'kf-touch-top-bar';

    const leftTopGroup = document.createElement('div');
    leftTopGroup.className = 'kf-touch-top-group';
    const pauseBtn = this.makePillButton('PAUSE', () => {
      this.onMenuNav?.('pause');
    });
    leftTopGroup.appendChild(pauseBtn);

    const rightTopGroup = document.createElement('div');
    rightTopGroup.className = 'kf-touch-top-group';
    if (this.twoPlayerEligible && this.isWideScreen()) {
      const tabletopBtn = this.makePillButton(
        this.tabletop2PEnabled ? '2P TABLE: ON' : '2P TABLE: OFF',
        () => {
          this.tabletop2PEnabled = !this.tabletop2PEnabled;
          this.rebuildLayout();
        },
      );
      rightTopGroup.appendChild(tabletopBtn);
    }
    const emoteBtn = this.makePillButton('EMOTE', () => {
      this.p1EmoteQueued = true;
    });
    rightTopGroup.appendChild(emoteBtn);

    topBar.appendChild(leftTopGroup);
    topBar.appendChild(rightTopGroup);
    this.root.appendChild(topBar);

    if (this.tabletop2PEnabled && this.twoPlayerEligible && this.isWideScreen()) {
      this.buildTabletop2PLayout();
    } else {
      this.buildStandardLayout();
    }
    this.syncGrabLatchVisuals();
  }

  private buildStandardLayout(): void {
    // Bottom-Left: Floating Left/Right Rocker (P1)
    const leftCluster = document.createElement('div');
    leftCluster.className = 'kf-touch-cluster-left';
    leftCluster.appendChild(this.makeRocker('p1', false));
    this.root.appendChild(leftCluster);

    // Bottom-Right: JUMP, GRAB, ANCHOR, PULL/FLAG (P1)
    const rightCluster = document.createElement('div');
    rightCluster.className = 'kf-touch-cluster-right';
    const grid = document.createElement('div');
    grid.className = 'kf-touch-action-grid';

    const pullFlagBtn = this.makeActionButton('p1', 'pull_flag', 'PULL\nFLAG', 'kf-touch-action-btn');
    const grabBtn = this.makeActionButton('p1', 'grab', 'GRAB', 'kf-touch-action-btn');
    const anchorBtn = this.makeActionButton('p1', 'anchor', 'ANCHOR', 'kf-touch-action-btn');
    const jumpBtn = this.makeActionButton(
      'p1',
      'jump',
      'JUMP',
      'kf-touch-action-btn kf-touch-action-jump',
    );
    this.grabBtnP1 = grabBtn;

    grid.appendChild(pullFlagBtn);
    grid.appendChild(grabBtn);
    grid.appendChild(anchorBtn);
    grid.appendChild(jumpBtn);
    rightCluster.appendChild(grid);
    this.root.appendChild(rightCluster);
  }

  private buildTabletop2PLayout(): void {
    // Left Edge: P1 Krunked controls
    const leftCluster = document.createElement('div');
    leftCluster.className = 'kf-touch-cluster-left';
    const p1Wrap = document.createElement('div');
    p1Wrap.className = 'kf-touch-tabletop-grid';

    const p1ActionsTop = document.createElement('div');
    p1ActionsTop.className = 'kf-touch-tabletop-row';
    const p1Grab = this.makeActionButton('p1', 'grab', 'P1 GRB', 'kf-touch-tabletop-btn p1-accent');
    const p1Anc = this.makeActionButton('p1', 'anchor', 'P1 ANC', 'kf-touch-tabletop-btn p1-accent');
    this.grabBtnP1 = p1Grab;
    p1ActionsTop.appendChild(p1Grab);
    p1ActionsTop.appendChild(p1Anc);

    const p1ActionsMid = document.createElement('div');
    p1ActionsMid.className = 'kf-touch-tabletop-row';
    const p1Jump = this.makeActionButton(
      'p1',
      'jump',
      'P1 JMP',
      'kf-touch-tabletop-btn p1-accent kf-touch-action-jump',
    );
    const p1Pull = this.makeActionButton(
      'p1',
      'pull_flag',
      'PULL',
      'kf-touch-tabletop-btn p1-accent',
    );
    p1ActionsMid.appendChild(p1Jump);
    p1ActionsMid.appendChild(p1Pull);

    p1Wrap.appendChild(p1ActionsTop);
    p1Wrap.appendChild(p1ActionsMid);
    p1Wrap.appendChild(this.makeRocker('p1', true));
    leftCluster.appendChild(p1Wrap);
    this.root.appendChild(leftCluster);

    // Right Edge: P2 Fred controls
    const rightCluster = document.createElement('div');
    rightCluster.className = 'kf-touch-cluster-right';
    const p2Wrap = document.createElement('div');
    p2Wrap.className = 'kf-touch-tabletop-grid';

    const p2ActionsTop = document.createElement('div');
    p2ActionsTop.className = 'kf-touch-tabletop-row';
    const p2Grab = this.makeActionButton('p2', 'grab', 'P2 GRB', 'kf-touch-tabletop-btn p2-accent');
    const p2Anc = this.makeActionButton('p2', 'anchor', 'P2 ANC', 'kf-touch-tabletop-btn p2-accent');
    this.grabBtnP2 = p2Grab;
    p2ActionsTop.appendChild(p2Grab);
    p2ActionsTop.appendChild(p2Anc);

    const p2ActionsMid = document.createElement('div');
    p2ActionsMid.className = 'kf-touch-tabletop-row';
    const p2Pull = this.makeActionButton(
      'p2',
      'pull_flag',
      'PULL',
      'kf-touch-tabletop-btn p2-accent',
    );
    const p2Jump = this.makeActionButton(
      'p2',
      'jump',
      'P2 JMP',
      'kf-touch-tabletop-btn p2-accent',
    );
    p2ActionsMid.appendChild(p2Pull);
    p2ActionsMid.appendChild(p2Jump);

    p2Wrap.appendChild(p2ActionsTop);
    p2Wrap.appendChild(p2ActionsMid);
    p2Wrap.appendChild(this.makeRocker('p2', true));
    rightCluster.appendChild(p2Wrap);
    this.root.appendChild(rightCluster);
  }

  private makeRocker(player: 'p1' | 'p2', compact: boolean): HTMLElement {
    const rocker = document.createElement('div');
    rocker.className = compact ? 'kf-touch-rocker kf-touch-tabletop-rocker' : 'kf-touch-rocker';
    const accent = compact ? (player === 'p1' ? ' p1-accent' : ' p2-accent') : '';

    const leftEl = document.createElement('div');
    leftEl.className = `kf-touch-btn${accent}`;
    leftEl.textContent = '<';

    const rightEl = document.createElement('div');
    rightEl.className = `kf-touch-btn${accent}`;
    rightEl.textContent = '>';

    rocker.appendChild(leftEl);
    rocker.appendChild(rightEl);

    const updateDir = (e: PointerEvent, entry: { dir: -1 | 0 | 1 }) => {
      const rect = rocker.getBoundingClientRect();
      const midX = rect.left + rect.width * 0.5;
      const deadband = rect.width * 0.06;
      if (e.clientX < midX - deadband) {
        entry.dir = -1;
      } else if (e.clientX > midX + deadband) {
        entry.dir = 1;
      } else {
        entry.dir = e.clientX < midX ? -1 : 1;
      }
      leftEl.classList.toggle('is-pressed', entry.dir === -1);
      rightEl.classList.toggle('is-pressed', entry.dir === 1);
    };

    rocker.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        rocker.setPointerCapture(e.pointerId);
      } catch {
        // Ignore synthetic event without active pointer
      }
      const entry = { player, rockerEl: rocker, leftEl, rightEl, dir: 0 as -1 | 0 | 1 };
      updateDir(e, entry);
      this.rockerPointers.set(e.pointerId, entry);
      this.onTouchActivity?.();
    });

    rocker.addEventListener('pointermove', (e: PointerEvent) => {
      const entry = this.rockerPointers.get(e.pointerId);
      if (!entry) return;
      e.preventDefault();
      updateDir(e, entry);
    });

    return rocker;
  }

  private makeActionButton(
    player: 'p1' | 'p2',
    action: TouchActionKind,
    label: string,
    extraClass: string,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `kf-touch-btn ${extraClass}`;
    btn.textContent = label;
    btn.style.whiteSpace = 'pre-line';

    btn.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      btn.blur();
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        // Ignore synthetic event without active pointer
      }
      btn.classList.add('is-pressed');

      if (action === 'jump') {
        if (player === 'p1') this.p1JumpQueued = true;
        else this.p2JumpQueued = true;
      } else if (action === 'grab' && this.grabToggleMode) {
        if (player === 'p1') this.p1GrabLatched = !this.p1GrabLatched;
        else this.p2GrabLatched = !this.p2GrabLatched;
        this.syncGrabLatchVisuals();
      }

      this.activePointers.set(e.pointerId, {
        player,
        action,
        el: btn,
        downAtMs: performance.now(),
      });
      this.onTouchActivity?.();
    });

    return btn;
  }

  private makePillButton(label: string, onTap: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kf-touch-btn kf-touch-pill';
    btn.textContent = label;

    btn.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      btn.blur();
      btn.classList.add('is-pressed');
      this.onTouchActivity?.();
      onTap();
      window.setTimeout(() => btn.classList.remove('is-pressed'), 120);
    });

    return btn;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearAllTouches();
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this.handleWindowPointerDownBound, { capture: true });
      window.removeEventListener('touchstart', this.handleWindowTouchStartBound, { capture: true });
      window.removeEventListener('pointerup', this.handleWindowPointerUpBound, { capture: true });
      window.removeEventListener('pointercancel', this.handleWindowPointerUpBound, {
        capture: true,
      });
      window.removeEventListener('resize', this.handleWindowResizeBound);
    }
    this.root.remove();
  }
}
