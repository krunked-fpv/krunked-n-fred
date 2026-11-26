// ============================================================================
// Krunked & Fred — Pixel UI Overlay & F9 Playtest Drawer (MenuManager)
// 100% navigable via Keyboard, Mouse, and Gamepad (D-Pad/Stick + A/B/Start/LB/RB).
// Clean-room Krunked & Fred branding only.
// ============================================================================

import {
  COOP_SKINS,
  JEFF_SKINS,
  JUKEBOX_TRACKS,
  PALETTE,
  ROPE_SKINS,
  TIME_TRIAL_MEDALS,
  type AssistSettings,
  type BiomeId,
  type DebugMetrics,
  type GameMode,
  type InputGlyphStyle,
  type MenuScreen,
  type PackSource,
  type SaveData,
  type SimState,
  type TargetFps,
  type TouchMode,
} from '../contracts';
import type { MenuNavAction } from '../input/KeyboardDriver';

export interface MenuCallbacks {
  onStartMode(mode: GameMode, timeTrialIndex?: number): void;
  onResume(): void;
  onRespawnAtBase(): void;
  onQuitToTitle(): void;
  onSetScreen(screen: MenuScreen): void;
  onUpdateSave(mutator: (data: SaveData) => void): void;
  onSetPackSource(source: PackSource): void;
  onLoadCustomPackFiles(files: FileList | File[]): Promise<boolean>;
  onSetAssist(partial: Partial<AssistSettings>): void;
  onWarpToZone(zone: BiomeId): void;
  onStepTicks(count: number): void;
  onResetSave(): void;
  onOpenOnlineCoop(role: 'host' | 'client', channelName: string): void;
  onUiSound(kind: 'move' | 'confirm' | 'cancel' | 'toggle'): void;
  onPlayAgain(): void;
}

export interface MenuRenderContext {
  save: SaveData;
  simState: SimState;
  metrics: DebugMetrics;
  hash: string;
  glyphStyle: InputGlyphStyle;
  hasCustomPack: boolean;
  packStatusText: string;
  inActiveRun: boolean;
}

interface MenuItemDef {
  id: string;
  label: string;
  sublabel?: string;
  valueText?: string;
  sliderRatio?: number;
  variant?: 'default' | 'primary' | 'danger' | 'pill';
  onActivate?: () => void;
  onStep?: (dir: -1 | 1) => void;
}

const UI_STYLE_ID = 'krunked-ui-styles';
const TARGET_FPS_OPTIONS: readonly TargetFps[] = [30, 60, 120];
const TOUCH_MODE_OPTIONS: readonly TouchMode[] = ['auto', 'off', 'on'];
const TOUCH_MODE_LABELS: Record<TouchMode, string> = {
  auto: 'Auto [Touch-Only]',
  off: 'Always Off',
  on: 'Always On',
};

function formatTime(sec: number): string {
  const safe = Math.max(0, Number.isFinite(sec) ? sec : 0);
  const mins = Math.floor(safe / 60);
  const rem = safe - mins * 60;
  const whole = Math.floor(rem);
  const hundredths = Math.floor((rem - whole) * 100);
  return `${String(mins).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

function getFooterPrompt(glyph: InputGlyphStyle, screen: MenuScreen): string {
  if (glyph === 'touch') {
    return 'TAP AN OPTION TO SELECT  •  TAP VALUE TO ADJUST';
  }
  const hasAdjust = screen === 'options' || screen === 'skin_closet';
  if (glyph === 'xbox') {
    return hasAdjust
      ? '[D-PAD / LS] Move   [A] Select   [◀ ▶] Adjust   [B] Back'
      : '[D-PAD / LS] Move   [A] Select   [B] Back   [START] Pause';
  }
  if (glyph === 'playstation') {
    return hasAdjust
      ? '[D-PAD / LS] Move   [✕] Select   [◀ ▶] Adjust   [○] Back'
      : '[D-PAD / LS] Move   [✕] Select   [○] Back   [OPTIONS] Pause';
  }
  if (glyph === 'switch') {
    return hasAdjust
      ? '[D-PAD / LS] Move   [B] Select   [◀ ▶] Adjust   [A] Back'
      : '[D-PAD / LS] Move   [B] Select   [A] Back   [+] Pause';
  }
  return hasAdjust
    ? '[↑↓ / W S] Move   [ENTER / SPACE] Select   [←→ / A D] Adjust   [ESC] Back'
    : '[↑↓ / W S] Move   [ENTER / SPACE] Select   [ESC] Back   [F9] Dev Drawer';
}

function injectUiStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(UI_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = UI_STYLE_ID;
  style.textContent = `
@keyframes kf-logo-bob {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-4px); }
}

@keyframes kf-subtitle-pulse {
  0%, 100% { opacity: 0.85; letter-spacing: 2px; }
  50% { opacity: 1; letter-spacing: 2.8px; }
}

.kf-ui-root {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 18px;
  font-family: 'Courier New', Courier, monospace;
  color: ${PALETTE.BELLY_WHITE};
  pointer-events: auto;
}

.kf-ui-root.is-hidden {
  display: none;
  pointer-events: none;
}

.kf-ui-root.screen-title {
  background: linear-gradient(
    180deg,
    rgba(19, 18, 58, 0.52) 0%,
    rgba(19, 18, 58, 0.14) 50%,
    rgba(19, 18, 58, 0.72) 100%
  );
  justify-content: space-between;
  padding: 28px 20px 18px;
}

.kf-ui-root.screen-modal {
  background: rgba(19, 18, 58, 0.68);
}

.kf-title-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  margin-top: 6px;
}

.kf-logo {
  font-size: clamp(28px, 6vw, 54px);
  font-weight: 900;
  letter-spacing: 3px;
  line-height: 1;
  text-transform: uppercase;
  animation: kf-logo-bob 2.6s ease-in-out infinite;
  text-shadow:
    3px 3px 0 ${PALETTE.OUTLINE},
    -2px -2px 0 ${PALETTE.OUTLINE},
    2px -2px 0 ${PALETTE.OUTLINE},
    -2px 2px 0 ${PALETTE.OUTLINE},
    0 6px 0 ${PALETTE.OUTLINE};
}

.kf-logo-k { color: ${PALETTE.KRUNKED_SCARF}; }
.kf-logo-amp { color: ${PALETTE.BEAK_BRIGHT}; }
.kf-logo-f { color: ${PALETTE.FRED_SCARF}; }

.kf-subtitle {
  font-size: clamp(11px, 1.8vw, 14px);
  font-weight: 700;
  color: ${PALETTE.SNOW_LIGHT};
  text-transform: uppercase;
  text-shadow: 2px 2px 0 ${PALETTE.OUTLINE};
  animation: kf-subtitle-pulse 3.2s ease-in-out infinite;
}

.kf-panel {
  width: min(540px, 94vw);
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  background: rgba(19, 18, 58, 0.92);
  border: 3px solid ${PALETTE.OUTLINE};
  box-shadow:
    inset 0 0 0 2px ${PALETTE.CLIFF_MID},
    0 6px 0 ${PALETTE.OUTLINE};
  padding: 18px 18px 14px;
  gap: 12px;
}

.kf-title-card {
  width: min(380px, 92vw);
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(19, 18, 58, 0.84);
  border: 3px solid ${PALETTE.OUTLINE};
  box-shadow:
    inset 0 0 0 2px ${PALETTE.CLIFF_DARK},
    0 5px 0 ${PALETTE.OUTLINE};
  padding: 14px;
}

.kf-panel-title {
  font-size: 20px;
  font-weight: 900;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: ${PALETTE.BELLY_WHITE};
  text-shadow: 2px 2px 0 ${PALETTE.OUTLINE};
  border-bottom: 2px solid ${PALETTE.CLIFF_DARK};
  padding-bottom: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.kf-panel-note {
  font-size: 11px;
  color: ${PALETTE.SNOW_LIGHT};
  line-height: 1.4;
}

.kf-menu-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  max-height: 54vh;
  padding-right: 4px;
}

.kf-menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 12px;
  background: rgba(43, 29, 65, 0.9);
  color: ${PALETTE.BELLY_WHITE};
  border: 2px solid ${PALETTE.OUTLINE};
  box-shadow: inset 0 0 0 1px rgba(109, 88, 183, 0.45);
  font-family: 'Courier New', Courier, monospace;
  font-size: 13px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
  transition: background 60ms linear, transform 60ms linear;
}

.kf-menu-item.variant-primary {
  background: rgba(209, 22, 81, 0.88);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
}

.kf-menu-item.variant-pill {
  background: rgba(31, 51, 71, 0.92);
  border-color: ${PALETTE.OUTLINE};
  box-shadow: inset 0 0 0 1px ${PALETTE.LAB_CYAN};
  font-size: 12px;
  padding: 7px 12px;
}

.kf-menu-item.variant-danger {
  background: rgba(129, 11, 61, 0.85);
}

.kf-menu-item.is-selected {
  background: ${PALETTE.CLIFF_MID};
  border-color: ${PALETTE.BELLY_WHITE};
  box-shadow:
    inset 0 0 0 2px ${PALETTE.BEAK_BRIGHT},
    0 2px 0 ${PALETTE.OUTLINE};
  transform: translateX(3px);
}

.kf-menu-item.variant-primary.is-selected {
  background: ${PALETTE.KRUNKED_SCARF};
}

.kf-item-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.kf-item-cursor {
  width: 12px;
  color: ${PALETTE.BEAK_BRIGHT};
  font-weight: 900;
  flex-shrink: 0;
}

.kf-item-labels {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.kf-item-sub {
  font-size: 10px;
  color: ${PALETTE.SNOW_LIGHT};
  font-weight: 400;
}

.kf-item-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  color: ${PALETTE.SNOW_LIGHT};
  font-size: 12px;
}

.kf-slider-track {
  width: 74px;
  height: 10px;
  background: ${PALETTE.OUTLINE};
  border: 1px solid ${PALETTE.CLIFF_MID};
  padding: 1px;
  display: flex;
}

.kf-slider-fill {
  height: 100%;
  background: ${PALETTE.FRED_SCARF};
}

.kf-stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.kf-stat-box {
  background: rgba(43, 29, 65, 0.85);
  border: 2px solid ${PALETTE.OUTLINE};
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.kf-stat-label {
  font-size: 10px;
  color: ${PALETTE.SNOW_LIGHT};
  text-transform: uppercase;
}

.kf-stat-value {
  font-size: 16px;
  font-weight: 900;
  color: ${PALETTE.BELLY_WHITE};
}

.kf-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 1px;
  border: 2px solid ${PALETTE.OUTLINE};
  text-transform: uppercase;
}

.kf-badge-gold {
  background: ${PALETTE.BEAK_BRIGHT};
  color: ${PALETTE.OUTLINE};
}

.kf-badge-muted {
  background: ${PALETTE.CLIFF_DARK};
  color: ${PALETTE.SNOW_LIGHT};
}

.kf-footer {
  margin-top: 4px;
  padding: 6px 12px;
  background: rgba(19, 18, 58, 0.86);
  border: 2px solid ${PALETTE.OUTLINE};
  font-size: 11px;
  font-weight: 700;
  color: ${PALETTE.SNOW_LIGHT};
  text-align: center;
  letter-spacing: 0.4px;
}

.kf-online-input {
  width: 100%;
  padding: 8px 10px;
  background: ${PALETTE.OUTLINE};
  color: ${PALETTE.BELLY_WHITE};
  border: 2px solid ${PALETTE.CLIFF_MID};
  font-family: 'Courier New', Courier, monospace;
  font-size: 13px;
  font-weight: 700;
}

/* ---- F9 Dev Playtest Drawer ---- */
.kf-dev-drawer {
  position: absolute;
  top: 8px;
  right: 8px;
  bottom: 8px;
  width: min(292px, 92vw);
  z-index: 40;
  background: rgba(19, 18, 58, 0.94);
  border: 3px solid ${PALETTE.OUTLINE};
  box-shadow:
    inset 0 0 0 2px ${PALETTE.LAB_CYAN},
    0 6px 0 ${PALETTE.OUTLINE};
  color: ${PALETTE.BELLY_WHITE};
  font-family: 'Courier New', Courier, monospace;
  font-size: 11px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 10px;
  gap: 10px;
  pointer-events: auto;
}

.kf-dev-drawer.is-hidden {
  display: none;
  pointer-events: none;
}

.kf-drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid ${PALETTE.CLIFF_DARK};
  padding-bottom: 6px;
  font-weight: 900;
  font-size: 12px;
  color: ${PALETTE.LAB_CYAN};
  letter-spacing: 1px;
}

.kf-drawer-section {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.kf-drawer-heading {
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
  color: ${PALETTE.BEAK_BRIGHT};
  letter-spacing: 1px;
}

.kf-drawer-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 8px;
  background: rgba(34, 32, 52, 0.85);
  border: 1px solid ${PALETTE.CLIFF_DARK};
  padding: 6px;
  font-size: 10px;
}

.kf-drawer-metric-wide {
  grid-column: 1 / -1;
}

.kf-drawer-btn-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 5px;
}

.kf-drawer-btn-grid.cols-3 {
  grid-template-columns: repeat(3, 1fr);
}

.kf-drawer-btn {
  padding: 6px 6px;
  background: ${PALETTE.CLIFF_DARK};
  color: ${PALETTE.BELLY_WHITE};
  border: 2px solid ${PALETTE.OUTLINE};
  font-family: 'Courier New', Courier, monospace;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
  text-transform: uppercase;
}

.kf-drawer-btn:hover {
  background: ${PALETTE.CLIFF_MID};
}

.kf-drawer-btn.is-active {
  background: ${PALETTE.FRED_SCARF};
  color: ${PALETTE.OUTLINE};
  border-color: ${PALETTE.BELLY_WHITE};
}

.kf-drawer-btn.is-danger {
  background: ${PALETTE.KRUNKED_SCARF_DARK};
}
`;
  document.head.appendChild(style);
}

export class MenuManager {
  private readonly container: HTMLElement;
  private readonly callbacks: MenuCallbacks;

  private readonly uiRoot: HTMLDivElement;
  private readonly drawerRoot: HTMLDivElement;
  private readonly folderInput: HTMLInputElement;

  private screen: MenuScreen = 'title';
  private returnScreen: MenuScreen = 'title';
  private selectedIndex = 0;
  private currentItems: MenuItemDef[] = [];
  private currentItemElements: HTMLButtonElement[] = [];

  private drawerOpen = false;
  private drawerBuiltMode: GameMode | null = null;
  private drawerTelemetryEls: Record<string, HTMLElement> = {};
  private drawerAssistBtns: Partial<Record<keyof AssistSettings, HTMLButtonElement>> = {};
  private drawerFpsBtns: Partial<Record<TargetFps, HTMLButtonElement>> = {};
  private drawerPackBtn: HTMLButtonElement | null = null;

  private onlineChannelInputValue = 'krunked-coop-1';
  private lastCtx: MenuRenderContext | null = null;
  private disposed = false;

  constructor(container: HTMLElement, callbacks: MenuCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    injectUiStyles();

    this.uiRoot = document.createElement('div');
    this.uiRoot.id = 'krunked-ui-overlay';
    this.uiRoot.className = 'kf-ui-root screen-title';
    this.container.appendChild(this.uiRoot);

    this.drawerRoot = document.createElement('div');
    this.drawerRoot.id = 'krunked-dev-drawer';
    this.drawerRoot.className = 'kf-dev-drawer is-hidden';
    this.drawerRoot.dataset.open = 'false';
    this.container.appendChild(this.drawerRoot);

    // Hidden folder picker for runtime custom art pack loading
    this.folderInput = document.createElement('input');
    this.folderInput.type = 'file';
    this.folderInput.multiple = true;
    this.folderInput.setAttribute('webkitdirectory', '');
    this.folderInput.setAttribute('directory', '');
    this.folderInput.style.display = 'none';
    this.folderInput.addEventListener('change', () => {
      const files = this.folderInput.files;
      if (files && files.length > 0) {
        void this.callbacks.onLoadCustomPackFiles(files);
      }
      this.folderInput.value = '';
    });
    this.container.appendChild(this.folderInput);
  }

  getScreen(): MenuScreen {
    return this.screen;
  }

  isDrawerOpen(): boolean {
    return this.drawerOpen;
  }

  setScreen(screen: MenuScreen, ctx: MenuRenderContext): void {
    if (screen === 'options' || screen === 'assist_menu') {
      if (this.screen === 'paused' || this.screen === 'title') {
        this.returnScreen = this.screen;
      }
    } else if (screen === 'title') {
      this.returnScreen = 'title';
    }
    const screenChanged = this.screen !== screen;
    this.screen = screen;
    if (screenChanged) {
      this.selectedIndex = 0;
    }
    this.render(ctx);
  }

  toggleDrawer(open: boolean | undefined, ctx: MenuRenderContext): void {
    const next = open === undefined ? !this.drawerOpen : open;
    this.drawerOpen = next;
    this.drawerRoot.classList.toggle('is-hidden', !next);
    this.drawerRoot.dataset.open = next ? 'true' : 'false';
    if (next) {
      this.ensureDrawerBuilt(ctx);
      this.updateDrawerTelemetry(ctx);
    }
  }

  render(ctx: MenuRenderContext): void {
    this.lastCtx = ctx;
    if (this.drawerOpen) {
      this.ensureDrawerBuilt(ctx);
      this.updateDrawerTelemetry(ctx);
    }

    if (this.screen === 'playing') {
      this.uiRoot.className = 'kf-ui-root is-hidden';
      this.uiRoot.innerHTML = '';
      this.currentItems = [];
      this.currentItemElements = [];
      return;
    }

    this.uiRoot.innerHTML = '';
    this.currentItems = [];
    this.currentItemElements = [];

    if (this.screen === 'title') {
      this.renderTitleScreen(ctx);
    } else {
      this.renderModalScreen(ctx);
    }

    if (this.currentItems.length > 0) {
      this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, this.currentItems.length - 1));
      this.applySelectionHighlight();
    }
  }

  updateDrawerTelemetry(ctx: MenuRenderContext): void {
    this.lastCtx = ctx;
    if (!this.drawerOpen) return;
    if (this.drawerBuiltMode !== ctx.simState.mode) {
      this.ensureDrawerBuilt(ctx);
    }
    const setText = (key: string, val: string) => {
      const el = this.drawerTelemetryEls[key];
      if (el && el.textContent !== val) {
        el.textContent = val;
      }
    };
    setText('fps', `${Math.round(ctx.metrics.fps)} / ${ctx.metrics.targetFps} FPS`);
    setText('simHz', `${ctx.metrics.simHz} Hz`);
    setText('tick', String(ctx.metrics.tick));
    setText('alt', `${ctx.metrics.altitude.toFixed(1)}m (Max ${ctx.metrics.maxAltitude.toFixed(1)}m)`);
    setText('biome', ctx.metrics.biome.toUpperCase());
    setText('entities', String(ctx.metrics.entities));
    setText('hash', ctx.hash);
    setText(
      'input',
      `Pads: ${ctx.metrics.gamepadCount} | Touch: ${ctx.metrics.touchVisible ? 'ON' : 'OFF'}`,
    );

    const assistKeys: (keyof AssistSettings)[] = [
      'infiniteJumps',
      'pullingRope',
      'checkPoints',
      'betterGrab',
    ];
    for (const k of assistKeys) {
      const btn = this.drawerAssistBtns[k];
      if (btn) btn.classList.toggle('is-active', ctx.simState.assist[k]);
    }
    for (const fps of TARGET_FPS_OPTIONS) {
      const btn = this.drawerFpsBtns[fps];
      if (btn) btn.classList.toggle('is-active', ctx.save.render.targetFps === fps);
    }
    if (this.drawerPackBtn) {
      const isCustom = ctx.metrics.packSource === 'custom';
      this.drawerPackBtn.textContent = isCustom ? 'PACK: CUSTOM ART' : 'PACK: BUILT-IN ART';
      this.drawerPackBtn.classList.toggle('is-active', isCustom);
    }
  }

  handleNavAction(action: MenuNavAction, ctx: MenuRenderContext): void {
    this.lastCtx = ctx;
    if (action === 'toggle_drawer') {
      this.toggleDrawer(undefined, ctx);
      this.callbacks.onUiSound('toggle');
      return;
    }

    if (this.screen === 'playing') {
      if (action === 'pause') {
        this.callbacks.onUiSound('toggle');
        this.callbacks.onSetScreen('paused');
      }
      return;
    }

    const count = this.currentItems.length;
    if (action === 'up' && count > 0) {
      this.selectedIndex = (this.selectedIndex - 1 + count) % count;
      this.applySelectionHighlight();
      this.callbacks.onUiSound('move');
      return;
    }
    if (action === 'down' && count > 0) {
      this.selectedIndex = (this.selectedIndex + 1) % count;
      this.applySelectionHighlight();
      this.callbacks.onUiSound('move');
      return;
    }
    if ((action === 'left' || action === 'tab_prev') && count > 0) {
      const item = this.currentItems[this.selectedIndex];
      if (item?.onStep) {
        item.onStep(-1);
        this.callbacks.onUiSound('toggle');
      }
      return;
    }
    if ((action === 'right' || action === 'tab_next') && count > 0) {
      const item = this.currentItems[this.selectedIndex];
      if (item?.onStep) {
        item.onStep(1);
        this.callbacks.onUiSound('toggle');
      }
      return;
    }
    if (action === 'confirm' && count > 0) {
      const item = this.currentItems[this.selectedIndex];
      if (item?.onActivate) {
        this.callbacks.onUiSound('confirm');
        item.onActivate();
      } else if (item?.onStep) {
        this.callbacks.onUiSound('toggle');
        item.onStep(1);
      }
      return;
    }
    if (action === 'back' || action === 'pause') {
      this.handleBackAction();
    }
  }

  private handleBackAction(): void {
    if (this.screen === 'paused') {
      this.callbacks.onUiSound('confirm');
      this.callbacks.onResume();
    } else if (this.screen === 'options' || this.screen === 'assist_menu') {
      this.callbacks.onUiSound('cancel');
      this.callbacks.onSetScreen(this.returnScreen);
    } else if (this.screen === 'time_trials' || this.screen === 'online_lobby') {
      this.callbacks.onUiSound('cancel');
      this.callbacks.onSetScreen('play_menu');
    } else if (this.screen !== 'title') {
      this.callbacks.onUiSound('cancel');
      this.callbacks.onSetScreen('title');
    }
  }

  private renderTitleScreen(ctx: MenuRenderContext): void {
    this.uiRoot.className = 'kf-ui-root screen-title';

    const header = document.createElement('div');
    header.className = 'kf-title-header';

    const logo = document.createElement('div');
    logo.className = 'kf-logo';
    logo.innerHTML =
      '<span class="kf-logo-k">KRUNKED</span> <span class="kf-logo-amp">&amp;</span> <span class="kf-logo-f">FRED</span>';

    const subtitle = document.createElement('div');
    subtitle.className = 'kf-subtitle';
    subtitle.textContent = 'TWO PENGUINS • ONE ROPE • SUMMIT OR BUST';

    header.appendChild(logo);
    header.appendChild(subtitle);
    this.uiRoot.appendChild(header);

    const card = document.createElement('div');
    card.className = 'kf-title-card';

    const packActive = ctx.metrics.packSource === 'custom';
    const items: MenuItemDef[] = [
      {
        id: 'title-play',
        label: 'PLAY',
        variant: 'primary',
        onActivate: () => this.callbacks.onSetScreen('play_menu'),
      },
      {
        id: 'title-assist',
        label: 'ASSIST MODE',
        valueText: this.countActiveAssists(ctx.save.assist) > 0 ? `${this.countActiveAssists(ctx.save.assist)} ON` : 'OFF',
        onActivate: () => this.callbacks.onSetScreen('assist_menu'),
      },
      {
        id: 'title-options',
        label: 'OPTIONS',
        onActivate: () => this.callbacks.onSetScreen('options'),
      },
      {
        id: 'title-pack-pill',
        label: 'ART PACK',
        sublabel: ctx.packStatusText,
        valueText: packActive ? 'CUSTOM PACK' : 'BUILT-IN ART',
        variant: 'pill',
        onActivate: () => {
          const next: PackSource = packActive ? 'builtin' : 'custom';
          this.callbacks.onSetPackSource(next);
        },
        onStep: () => {
          const next: PackSource = packActive ? 'builtin' : 'custom';
          this.callbacks.onSetPackSource(next);
        },
      },
    ];

    const listEl = this.buildItemList(items);
    card.appendChild(listEl);
    this.uiRoot.appendChild(card);

    const footer = document.createElement('div');
    footer.className = 'kf-footer';
    footer.textContent = getFooterPrompt(ctx.glyphStyle, 'title');
    this.uiRoot.appendChild(footer);
  }

  private renderModalScreen(ctx: MenuRenderContext): void {
    this.uiRoot.className = 'kf-ui-root screen-modal';

    const panel = document.createElement('div');
    panel.className = 'kf-panel';

    const titleEl = document.createElement('div');
    titleEl.className = 'kf-panel-title';

    let items: MenuItemDef[] = [];

    switch (this.screen) {
      case 'play_menu': {
        titleEl.textContent = 'SELECT EXPEDITION';
        panel.appendChild(titleEl);
        items = [
          {
            id: 'mode-coop',
            label: 'Local 2P Co-Op Mountain',
            sublabel: 'Krunked & Fred tethered climb',
            variant: 'primary',
            onActivate: () => this.callbacks.onStartMode('coop_mountain'),
          },
          {
            id: 'mode-jeff',
            label: 'Solo w/ Jeff',
            sublabel: 'Carry & toss Jeff the trusty rock',
            onActivate: () => this.callbacks.onStartMode('solo_jeff'),
          },
          {
            id: 'mode-ai',
            label: 'Solo w/ AI Fred',
            sublabel: 'Climb with an automated penguin partner',
            onActivate: () => this.callbacks.onStartMode('solo_ai'),
          },
          {
            id: 'mode-lab',
            label: 'Laboratory DLC',
            sublabel: 'Circuits, Tronchos, Lasers & Mech Boss',
            onActivate: () => this.callbacks.onStartMode('lab_dlc'),
          },
          {
            id: 'mode-tt',
            label: 'Time Trials (10)',
            sublabel: 'Beat Bronze, Silver, Gold & Platinum par times',
            onActivate: () => this.callbacks.onSetScreen('time_trials'),
          },
          {
            id: 'mode-online',
            label: 'Online P2P Co-Op',
            sublabel: 'Host or join a shared room channel',
            onActivate: () => this.callbacks.onSetScreen('online_lobby'),
          },
          {
            id: 'play-back',
            label: 'Back',
            onActivate: () => this.callbacks.onSetScreen('title'),
          },
        ];
        break;
      }

      case 'time_trials': {
        titleEl.textContent = 'TIME TRIALS (10)';
        panel.appendChild(titleEl);
        items = [
          ...TIME_TRIAL_MEDALS.map((tt) => {
            const best = ctx.save.timeTrialBest[tt.id];
            return {
              id: `tt-${tt.id}`,
              label: `${tt.id}: ${tt.name}`,
              sublabel: `Zone: ${tt.biome.toUpperCase()} • Gold ${tt.gold}s • Plat ${tt.platinum}s`,
              valueText: best
                ? `${formatTime(best.timeSec)} (${best.medal.toUpperCase()})`
                : 'UNPLAYED',
              onActivate: () => this.callbacks.onStartMode('time_trial', tt.index),
            };
          }),
          {
            id: 'tt-back',
            label: 'Back',
            onActivate: () => this.callbacks.onSetScreen('play_menu'),
          },
        ];
        break;
      }

      case 'online_lobby': {
        titleEl.textContent = 'ONLINE P2P CO-OP';
        panel.appendChild(titleEl);

        const note = document.createElement('div');
        note.className = 'kf-panel-note';
        note.textContent = `Status: ${ctx.metrics.onlineState || 'offline'}. Enter a room channel and choose Host or Join.`;
        panel.appendChild(note);

        const input = document.createElement('input');
        input.className = 'kf-online-input';
        input.type = 'text';
        input.value = this.onlineChannelInputValue;
        input.maxLength = 32;
        input.placeholder = 'Room channel name...';
        input.addEventListener('input', () => {
          this.onlineChannelInputValue = input.value.trim() || 'krunked-coop-1';
        });
        panel.appendChild(input);

        items = [
          {
            id: 'online-host',
            label: 'Host Co-Op Room (P1 Krunked)',
            variant: 'primary',
            onActivate: () =>
              this.callbacks.onOpenOnlineCoop('host', this.onlineChannelInputValue),
          },
          {
            id: 'online-join',
            label: 'Join Co-Op Room (P2 Fred)',
            onActivate: () =>
              this.callbacks.onOpenOnlineCoop('client', this.onlineChannelInputValue),
          },
          {
            id: 'online-back',
            label: 'Back',
            onActivate: () => this.callbacks.onSetScreen('play_menu'),
          },
        ];
        break;
      }

      case 'paused': {
        titleEl.textContent = 'PAUSED';
        panel.appendChild(titleEl);
        items = [
          {
            id: 'pause-resume',
            label: 'Resume',
            variant: 'primary',
            onActivate: () => this.callbacks.onResume(),
          },
          {
            id: 'pause-respawn',
            label: 'Respawn at Base',
            onActivate: () => this.callbacks.onRespawnAtBase(),
          },
          {
            id: 'pause-assist',
            label: 'Assist Mode',
            valueText:
              this.countActiveAssists(ctx.save.assist) > 0
                ? `${this.countActiveAssists(ctx.save.assist)} ON`
                : 'OFF',
            onActivate: () => this.callbacks.onSetScreen('assist_menu'),
          },
          {
            id: 'pause-options',
            label: 'Options',
            onActivate: () => this.callbacks.onSetScreen('options'),
          },
          {
            id: 'pause-quit',
            label: 'Quit to Title',
            variant: 'danger',
            onActivate: () => this.callbacks.onQuitToTitle(),
          },
        ];
        break;
      }

      case 'options': {
        titleEl.textContent = 'OPTIONS';
        panel.appendChild(titleEl);
        const s = ctx.save;
        const cycleFps = (dir: -1 | 1) => {
          const idx = TARGET_FPS_OPTIONS.indexOf(s.render.targetFps);
          const next =
            TARGET_FPS_OPTIONS[(idx + dir + TARGET_FPS_OPTIONS.length) % TARGET_FPS_OPTIONS.length];
          this.callbacks.onUpdateSave((d) => {
            d.render.targetFps = next;
          });
        };
        const cycleTouch = (dir: -1 | 1) => {
          const idx = TOUCH_MODE_OPTIONS.indexOf(s.render.touchMode);
          const next =
            TOUCH_MODE_OPTIONS[(idx + dir + TOUCH_MODE_OPTIONS.length) % TOUCH_MODE_OPTIONS.length];
          this.callbacks.onUpdateSave((d) => {
            d.render.touchMode = next;
          });
        };
        const stepVol = (key: 'master' | 'music' | 'sfx', dir: -1 | 1) => {
          this.callbacks.onUpdateSave((d) => {
            const cur = Math.round(d.audio[key] * 10);
            d.audio[key] = Math.max(0, Math.min(10, cur + dir)) / 10;
          });
        };
        const togglePack = () => {
          const next: PackSource = ctx.metrics.packSource === 'custom' ? 'builtin' : 'custom';
          this.callbacks.onSetPackSource(next);
        };

        items = [
          {
            id: 'opt-fps',
            label: 'Target FPS',
            valueText: `${s.render.targetFps} FPS`,
            onActivate: () => cycleFps(1),
            onStep: cycleFps,
          },
          {
            id: 'opt-snap',
            label: 'Classic 50Hz Snap',
            valueText: s.render.classic50HzSnap ? 'ON' : 'OFF',
            onActivate: () =>
              this.callbacks.onUpdateSave((d) => {
                d.render.classic50HzSnap = !d.render.classic50HzSnap;
              }),
            onStep: () =>
              this.callbacks.onUpdateSave((d) => {
                d.render.classic50HzSnap = !d.render.classic50HzSnap;
              }),
          },
          {
            id: 'opt-shake',
            label: 'Screen Shake',
            valueText: s.render.screenShake ? 'ON' : 'OFF',
            onActivate: () =>
              this.callbacks.onUpdateSave((d) => {
                d.render.screenShake = !d.render.screenShake;
              }),
            onStep: () =>
              this.callbacks.onUpdateSave((d) => {
                d.render.screenShake = !d.render.screenShake;
              }),
          },
          {
            id: 'opt-master',
            label: 'Master Volume',
            valueText: `${Math.round(s.audio.master * 100)}%`,
            sliderRatio: s.audio.master,
            onStep: (dir) => stepVol('master', dir),
            onActivate: () => stepVol('master', 1),
          },
          {
            id: 'opt-music',
            label: 'Music Volume',
            valueText: `${Math.round(s.audio.music * 100)}%`,
            sliderRatio: s.audio.music,
            onStep: (dir) => stepVol('music', dir),
            onActivate: () => stepVol('music', 1),
          },
          {
            id: 'opt-sfx',
            label: 'SFX Volume',
            valueText: `${Math.round(s.audio.sfx * 100)}%`,
            sliderRatio: s.audio.sfx,
            onStep: (dir) => stepVol('sfx', dir),
            onActivate: () => stepVol('sfx', 1),
          },
          {
            id: 'opt-mute',
            label: 'Mute Audio',
            valueText: s.audio.muted ? 'MUTED' : 'ACTIVE',
            onActivate: () =>
              this.callbacks.onUpdateSave((d) => {
                d.audio.muted = !d.audio.muted;
              }),
            onStep: () =>
              this.callbacks.onUpdateSave((d) => {
                d.audio.muted = !d.audio.muted;
              }),
          },
          {
            id: 'opt-touch',
            label: 'Touch Controls',
            valueText: TOUCH_MODE_LABELS[s.render.touchMode],
            onActivate: () => cycleTouch(1),
            onStep: cycleTouch,
          },
          {
            id: 'opt-pack',
            label: 'Art Pack',
            sublabel: ctx.packStatusText,
            valueText: ctx.metrics.packSource === 'custom' ? 'Custom' : 'Built-In',
            onActivate: togglePack,
            onStep: togglePack,
          },
          {
            id: 'opt-pack-folder',
            label: 'Load Custom Pack Folder...',
            sublabel: 'Pick local sprite/audio folder to load custom pack',
            variant: 'pill',
            onActivate: () => this.folderInput.click(),
          },
          {
            id: 'opt-split-pad',
            label: 'Split-Controller 1-Pad Co-Op',
            valueText: s.gamepadSplitMode ? 'ON' : 'OFF',
            onActivate: () =>
              this.callbacks.onUpdateSave((d) => {
                d.gamepadSplitMode = !d.gamepadSplitMode;
              }),
            onStep: () =>
              this.callbacks.onUpdateSave((d) => {
                d.gamepadSplitMode = !d.gamepadSplitMode;
              }),
          },
          {
            id: 'opt-grab-toggle',
            label: 'Grab Toggle Mode',
            valueText: s.grabToggleMode ? 'TOGGLE' : 'HOLD',
            onActivate: () =>
              this.callbacks.onUpdateSave((d) => {
                d.grabToggleMode = !d.grabToggleMode;
              }),
            onStep: () =>
              this.callbacks.onUpdateSave((d) => {
                d.grabToggleMode = !d.grabToggleMode;
              }),
          },
          {
            id: 'opt-show-fps',
            label: 'Show FPS',
            valueText: s.render.showFps ? 'ON' : 'OFF',
            onActivate: () =>
              this.callbacks.onUpdateSave((d) => {
                d.render.showFps = !d.render.showFps;
              }),
            onStep: () =>
              this.callbacks.onUpdateSave((d) => {
                d.render.showFps = !d.render.showFps;
              }),
          },
          {
            id: 'opt-back',
            label: 'Back',
            onActivate: () => this.callbacks.onSetScreen(this.returnScreen),
          },
        ];
        break;
      }

      case 'assist_menu': {
        titleEl.textContent = 'ASSIST MODE';
        panel.appendChild(titleEl);

        const note = document.createElement('div');
        note.className = 'kf-panel-note';
        note.textContent =
          'Optional climbing aids to learn tricky sections. Complete a climb with all assists OFF to earn the No-Assist badge.';
        panel.appendChild(note);

        const a = ctx.save.assist;
        const toggleAssist = (key: keyof AssistSettings) => {
          this.callbacks.onSetAssist({ [key]: !a[key] });
        };

        items = [
          {
            id: 'assist-inf-jumps',
            label: 'InfiniteJumps',
            sublabel: 'Jump anytime in mid-air without touching ground',
            valueText: a.infiniteJumps ? 'ON' : 'OFF',
            onActivate: () => toggleAssist('infiniteJumps'),
            onStep: () => toggleAssist('infiniteJumps'),
          },
          {
            id: 'assist-pull-rope',
            label: 'PullingRope',
            sublabel: 'Hold Pull while grounded/anchored to reel your partner in',
            valueText: a.pullingRope ? 'ON' : 'OFF',
            onActivate: () => toggleAssist('pullingRope'),
            onStep: () => toggleAssist('pullingRope'),
          },
          {
            id: 'assist-checkpoints',
            label: 'CheckPoints',
            sublabel: 'Place a Flag [F] and hold Call Charlie [R] to fly back',
            valueText: a.checkPoints ? 'ON' : 'OFF',
            onActivate: () => toggleAssist('checkPoints'),
            onStep: () => toggleAssist('checkPoints'),
          },
          {
            id: 'assist-better-grab',
            label: 'BetterGrab',
            sublabel: 'Doubles wall-cling stamina (30s) & extends grab reach (1.2 u)',
            valueText: a.betterGrab ? 'ON' : 'OFF',
            onActivate: () => toggleAssist('betterGrab'),
            onStep: () => toggleAssist('betterGrab'),
          },
          {
            id: 'assist-back',
            label: 'Back',
            onActivate: () => this.callbacks.onSetScreen(this.returnScreen),
          },
        ];
        break;
      }

      case 'victory': {
        const st = ctx.simState;
        const isLab = st.mode === 'lab_dlc';
        const isTT = st.mode === 'time_trial';
        titleEl.textContent = isTT
          ? 'TIME TRIAL COMPLETE!'
          : isLab
            ? 'LABORATORY CLEARED!'
            : 'SUMMIT REACHED!';
        panel.appendChild(titleEl);

        const badgeRow = document.createElement('div');
        badgeRow.style.display = 'flex';
        badgeRow.style.gap = '8px';
        badgeRow.style.flexWrap = 'wrap';

        const noAssist = !st.assistEverUsedInRun;
        const noAssistBadge = document.createElement('div');
        noAssistBadge.className = noAssist ? 'kf-badge kf-badge-gold' : 'kf-badge kf-badge-muted';
        noAssistBadge.textContent = noAssist ? '★ NO-ASSIST CLEAR ★' : 'ASSIST MODE USED';
        badgeRow.appendChild(noAssistBadge);

        if (isTT && st.completionMedal !== 'none') {
          const medalBadge = document.createElement('div');
          medalBadge.className = 'kf-badge kf-badge-gold';
          medalBadge.textContent = `${st.completionMedal.toUpperCase()} MEDAL`;
          badgeRow.appendChild(medalBadge);
        }
        panel.appendChild(badgeRow);

        const statsGrid = document.createElement('div');
        statsGrid.className = 'kf-stats-grid';
        const runTime = st.completionTimeSec > 0 ? st.completionTimeSec : st.elapsedSec;
        const stats: Array<[string, string]> = [
          ['Run Time', formatTime(runTime)],
          ['Max Altitude', `${st.maxAltitude.toFixed(1)} m`],
          ['Jumps', String(st.jumpsCount)],
          ['Falls', String(st.fallsCount)],
        ];
        for (const [label, value] of stats) {
          const box = document.createElement('div');
          box.className = 'kf-stat-box';
          const lbl = document.createElement('div');
          lbl.className = 'kf-stat-label';
          lbl.textContent = label;
          const val = document.createElement('div');
          val.className = 'kf-stat-value';
          val.textContent = value;
          box.appendChild(lbl);
          box.appendChild(val);
          statsGrid.appendChild(box);
        }
        panel.appendChild(statsGrid);

        items = [
          {
            id: 'victory-again',
            label: 'Play Again',
            variant: 'primary',
            onActivate: () => this.callbacks.onPlayAgain(),
          },
          {
            id: 'victory-title',
            label: 'Title',
            onActivate: () => this.callbacks.onQuitToTitle(),
          },
        ];
        break;
      }

      case 'skin_closet': {
        titleEl.textContent = 'SKIN CLOSET';
        panel.appendChild(titleEl);
        const s = ctx.save.skins;
        const cycleSkin = <T extends string>(
          list: readonly T[],
          cur: T,
          dir: -1 | 1,
          apply: (next: T) => void,
        ) => {
          const idx = list.indexOf(cur);
          const next = list[(idx + dir + list.length) % list.length];
          apply(next);
        };
        items = [
          {
            id: 'skin-p1',
            label: 'Krunked (P1) Skin',
            valueText: s.p1,
            onActivate: () =>
              cycleSkin(COOP_SKINS, s.p1, 1, (next) =>
                this.callbacks.onUpdateSave((d) => {
                  d.skins.p1 = next;
                }),
              ),
            onStep: (dir) =>
              cycleSkin(COOP_SKINS, s.p1, dir, (next) =>
                this.callbacks.onUpdateSave((d) => {
                  d.skins.p1 = next;
                }),
              ),
          },
          {
            id: 'skin-p2',
            label: 'Fred (P2) Skin',
            valueText: s.p2,
            onActivate: () =>
              cycleSkin(COOP_SKINS, s.p2, 1, (next) =>
                this.callbacks.onUpdateSave((d) => {
                  d.skins.p2 = next;
                }),
              ),
            onStep: (dir) =>
              cycleSkin(COOP_SKINS, s.p2, dir, (next) =>
                this.callbacks.onUpdateSave((d) => {
                  d.skins.p2 = next;
                }),
              ),
          },
          {
            id: 'skin-jeff',
            label: 'Jeff Skin',
            valueText: s.jeff,
            onActivate: () =>
              cycleSkin(JEFF_SKINS, s.jeff, 1, (next) =>
                this.callbacks.onUpdateSave((d) => {
                  d.skins.jeff = next;
                }),
              ),
            onStep: (dir) =>
              cycleSkin(JEFF_SKINS, s.jeff, dir, (next) =>
                this.callbacks.onUpdateSave((d) => {
                  d.skins.jeff = next;
                }),
              ),
          },
          {
            id: 'skin-rope',
            label: 'Rope Skin',
            valueText: s.rope,
            onActivate: () =>
              cycleSkin(ROPE_SKINS, s.rope, 1, (next) =>
                this.callbacks.onUpdateSave((d) => {
                  d.skins.rope = next;
                }),
              ),
            onStep: (dir) =>
              cycleSkin(ROPE_SKINS, s.rope, dir, (next) =>
                this.callbacks.onUpdateSave((d) => {
                  d.skins.rope = next;
                }),
              ),
          },
          {
            id: 'skin-back',
            label: 'Back',
            onActivate: () => this.callbacks.onSetScreen('title'),
          },
        ];
        break;
      }

      case 'jukebox': {
        titleEl.textContent = 'VILLAGE JUKEBOX';
        panel.appendChild(titleEl);
        items = [
          ...JUKEBOX_TRACKS.map((track) => ({
            id: `jb-${track}`,
            label: track,
            valueText: ctx.save.audio.jukeboxTrack === track ? 'PLAYING' : '',
            onActivate: () =>
              this.callbacks.onUpdateSave((d) => {
                d.audio.jukeboxTrack = track;
              }),
          })),
          {
            id: 'jb-back',
            label: 'Back',
            onActivate: () => this.callbacks.onSetScreen('title'),
          },
        ];
        break;
      }

      default: {
        // album, manual, achievements, controls_remap fallback view
        const labelMap: Record<string, string> = {
          album: `PHOTO ALBUM (${ctx.save.unlockedPhotos.length}/12)`,
          manual: `CLIMBER MANUAL (${ctx.save.unlockedManual.length}/7)`,
          achievements: `ACHIEVEMENTS (${ctx.save.unlockedAchievements.length}/26)`,
          controls_remap: 'CONTROLS & KEYBINDS',
        };
        titleEl.textContent = labelMap[this.screen] ?? this.screen.toUpperCase();
        panel.appendChild(titleEl);

        const info = document.createElement('div');
        info.className = 'kf-panel-note';
        if (this.screen === 'controls_remap') {
          const kb = ctx.save.keybinds;
          info.textContent = `P1: ${kb.p1Left}/${kb.p1Right} Move, ${kb.p1Jump} Jump, ${kb.p1Grab} Grab, ${kb.p1Anchor} Anchor, ${kb.p1Pull} Pull | P2: ${kb.p2Left}/${kb.p2Right} Move, ${kb.p2Jump} Jump, ${kb.p2Grab} Grab, ${kb.p2Anchor} Anchor, ${kb.p2Pull} Pull | Flag: ${kb.flag}, Charlie: ${kb.charlie}, Emote: ${kb.emote}`;
        } else {
          info.textContent = 'Explore the mountain to unlock collectibles, pages, and trophies.';
        }
        panel.appendChild(info);

        items = [
          {
            id: 'sub-back',
            label: 'Back',
            onActivate: () => this.callbacks.onSetScreen('title'),
          },
        ];
        break;
      }
    }

    const listEl = this.buildItemList(items);
    panel.appendChild(listEl);

    const footer = document.createElement('div');
    footer.className = 'kf-footer';
    footer.textContent = getFooterPrompt(ctx.glyphStyle, this.screen);
    panel.appendChild(footer);

    this.uiRoot.appendChild(panel);
  }

  private buildItemList(items: MenuItemDef[]): HTMLDivElement {
    this.currentItems = items;
    this.currentItemElements = [];

    const list = document.createElement('div');
    list.className = 'kf-menu-list';

    items.forEach((item, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `kf-menu-item${item.variant && item.variant !== 'default' ? ` variant-${item.variant}` : ''}`;
      btn.dataset.menuId = item.id;

      const left = document.createElement('span');
      left.className = 'kf-item-left';

      const cursor = document.createElement('span');
      cursor.className = 'kf-item-cursor';
      cursor.textContent = '';

      const labels = document.createElement('span');
      labels.className = 'kf-item-labels';

      const mainLabel = document.createElement('span');
      mainLabel.textContent = item.label;
      labels.appendChild(mainLabel);

      if (item.sublabel) {
        const sub = document.createElement('span');
        sub.className = 'kf-item-sub';
        sub.textContent = item.sublabel;
        labels.appendChild(sub);
      }

      left.appendChild(cursor);
      left.appendChild(labels);
      btn.appendChild(left);

      if (item.valueText !== undefined || item.sliderRatio !== undefined) {
        const right = document.createElement('span');
        right.className = 'kf-item-right';

        if (item.sliderRatio !== undefined) {
          const track = document.createElement('span');
          track.className = 'kf-slider-track';
          const fill = document.createElement('span');
          fill.className = 'kf-slider-fill';
          fill.style.width = `${Math.round(Math.max(0, Math.min(1, item.sliderRatio)) * 100)}%`;
          track.appendChild(fill);
          right.appendChild(track);
        }

        if (item.valueText !== undefined) {
          const val = document.createElement('span');
          val.textContent = item.onStep ? `◀ ${item.valueText} ▶` : item.valueText;
          right.appendChild(val);
        }

        btn.appendChild(right);
      }

      btn.addEventListener('pointerenter', () => {
        if (this.selectedIndex !== index) {
          this.selectedIndex = index;
          this.applySelectionHighlight();
        }
      });

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        btn.blur();
        this.selectedIndex = index;
        this.applySelectionHighlight();
        if (item.onActivate) {
          this.callbacks.onUiSound('confirm');
          item.onActivate();
        } else if (item.onStep) {
          this.callbacks.onUiSound('toggle');
          item.onStep(1);
        }
      });

      this.currentItemElements.push(btn);
      list.appendChild(btn);
    });

    return list;
  }

  private applySelectionHighlight(): void {
    this.currentItemElements.forEach((btn, idx) => {
      const selected = idx === this.selectedIndex;
      btn.classList.toggle('is-selected', selected);
      const cursor = btn.querySelector('.kf-item-cursor');
      if (cursor) {
        cursor.textContent = selected ? '▶' : '';
      }
      if (selected) {
        btn.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  private ensureDrawerBuilt(ctx: MenuRenderContext): void {
    if (this.drawerBuiltMode === ctx.simState.mode && this.drawerRoot.childElementCount > 0) {
      return;
    }
    this.drawerBuiltMode = ctx.simState.mode;
    this.drawerRoot.innerHTML = '';
    this.drawerTelemetryEls = {};
    this.drawerAssistBtns = {};
    this.drawerFpsBtns = {};
    this.drawerPackBtn = null;

    // Header
    const header = document.createElement('div');
    header.className = 'kf-drawer-header';
    const title = document.createElement('span');
    title.textContent = 'DEV PLAYTEST (F9)';
    const closeBtn = this.makeDrawerBtn('X', () => {
      if (this.lastCtx) this.toggleDrawer(false, this.lastCtx);
    });
    closeBtn.style.padding = '2px 7px';
    header.appendChild(title);
    header.appendChild(closeBtn);
    this.drawerRoot.appendChild(header);

    // Live Telemetry
    const metricsSec = document.createElement('div');
    metricsSec.className = 'kf-drawer-section';
    metricsSec.appendChild(this.makeDrawerHeading('Live Telemetry'));
    const metricsGrid = document.createElement('div');
    metricsGrid.className = 'kf-drawer-metrics';
    const metricRows: Array<[string, string, boolean]> = [
      ['fps', 'FPS', false],
      ['simHz', 'SIM', false],
      ['tick', 'TICK', false],
      ['entities', 'ENT', false],
      ['biome', 'BIOME', false],
      ['hash', 'FNV1A', false],
      ['alt', 'ALT', true],
      ['input', 'INPUT', true],
    ];
    for (const [key, label, wide] of metricRows) {
      const cell = document.createElement('div');
      if (wide) cell.className = 'kf-drawer-metric-wide';
      const lbl = document.createElement('span');
      lbl.style.color = PALETTE.SNOW_LIGHT;
      lbl.textContent = `${label}: `;
      const val = document.createElement('span');
      val.textContent = '-';
      cell.appendChild(lbl);
      cell.appendChild(val);
      metricsGrid.appendChild(cell);
      this.drawerTelemetryEls[key] = val;
    }
    metricsSec.appendChild(metricsGrid);
    this.drawerRoot.appendChild(metricsSec);

    // Zone Warp Buttons
    const warpSec = document.createElement('div');
    warpSec.className = 'kf-drawer-section';
    warpSec.appendChild(this.makeDrawerHeading('Zone Warp'));
    const warpGrid = document.createElement('div');
    warpGrid.className = 'kf-drawer-btn-grid cols-3';
    const zones: Array<[BiomeId, string]> = [
      ['village', 'Village'],
      ['foothills', 'Foothills'],
      ['mines', 'Mines'],
      ['crags', 'Crags'],
      ['summit', 'Summit'],
    ];
    if (ctx.simState.mode === 'lab_dlc') {
      zones.push(['lab', 'Lab'], ['boss', 'Boss']);
    }
    for (const [zoneId, label] of zones) {
      warpGrid.appendChild(
        this.makeDrawerBtn(label, () => {
          this.callbacks.onWarpToZone(zoneId);
        }),
      );
    }
    warpSec.appendChild(warpGrid);
    this.drawerRoot.appendChild(warpSec);

    // Assist Quick Toggles
    const assistSec = document.createElement('div');
    assistSec.className = 'kf-drawer-section';
    assistSec.appendChild(this.makeDrawerHeading('Assist Quick Toggles'));
    const assistGrid = document.createElement('div');
    assistGrid.className = 'kf-drawer-btn-grid';
    const assists: Array<[keyof AssistSettings, string]> = [
      ['infiniteJumps', 'Inf Jumps'],
      ['pullingRope', 'Pull Rope'],
      ['checkPoints', 'CheckPts'],
      ['betterGrab', 'BetterGrab'],
    ];
    for (const [key, label] of assists) {
      const btn = this.makeDrawerBtn(label, () => {
        const cur = this.lastCtx?.simState.assist[key] ?? false;
        this.callbacks.onSetAssist({ [key]: !cur });
      });
      this.drawerAssistBtns[key] = btn;
      assistGrid.appendChild(btn);
    }
    assistSec.appendChild(assistGrid);
    this.drawerRoot.appendChild(assistSec);

    // FPS Switcher
    const fpsSec = document.createElement('div');
    fpsSec.className = 'kf-drawer-section';
    fpsSec.appendChild(this.makeDrawerHeading('Target FPS'));
    const fpsGrid = document.createElement('div');
    fpsGrid.className = 'kf-drawer-btn-grid cols-3';
    for (const fps of TARGET_FPS_OPTIONS) {
      const btn = this.makeDrawerBtn(`${fps} FPS`, () => {
        this.callbacks.onUpdateSave((d) => {
          d.render.targetFps = fps;
        });
      });
      this.drawerFpsBtns[fps] = btn;
      fpsGrid.appendChild(btn);
    }
    fpsSec.appendChild(fpsGrid);
    this.drawerRoot.appendChild(fpsSec);

    // Pack Toggle + Tick Stepper
    const toolsSec = document.createElement('div');
    toolsSec.className = 'kf-drawer-section';
    toolsSec.appendChild(this.makeDrawerHeading('Pack & Tick Stepper'));
    const packBtn = this.makeDrawerBtn('PACK: BUILT-IN ART', () => {
      const cur = this.lastCtx?.metrics.packSource ?? 'builtin';
      this.callbacks.onSetPackSource(cur === 'custom' ? 'builtin' : 'custom');
    });
    this.drawerPackBtn = packBtn;
    toolsSec.appendChild(packBtn);

    const stepGrid = document.createElement('div');
    stepGrid.className = 'kf-drawer-btn-grid';
    stepGrid.appendChild(this.makeDrawerBtn('+1 Tick', () => this.callbacks.onStepTicks(1)));
    stepGrid.appendChild(this.makeDrawerBtn('+50 Ticks', () => this.callbacks.onStepTicks(50)));
    toolsSec.appendChild(stepGrid);

    const resetBtn = this.makeDrawerBtn('Reset Save', () => this.callbacks.onResetSave());
    resetBtn.classList.add('is-danger');
    toolsSec.appendChild(resetBtn);

    this.drawerRoot.appendChild(toolsSec);
  }

  private makeDrawerHeading(text: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'kf-drawer-heading';
    el.textContent = text;
    return el;
  }

  private makeDrawerBtn(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kf-drawer-btn';
    btn.textContent = label;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.blur();
      this.callbacks.onUiSound('toggle');
      onClick();
    });
    return btn;
  }

  private countActiveAssists(a: AssistSettings): number {
    return (
      (a.infiniteJumps ? 1 : 0) +
      (a.pullingRope ? 1 : 0) +
      (a.checkPoints ? 1 : 0) +
      (a.betterGrab ? 1 : 0)
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.uiRoot.remove();
    this.drawerRoot.remove();
    this.folderInput.remove();
  }
}
