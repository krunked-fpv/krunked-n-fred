// ============================================================================
// Krunked & Fred — Main Application Loop, Fixed 50 Hz Sim, Render Pacing,
// Zero-Backend Online P2P Co-Op, Gamepad Haptics, Persistence + Toasts,
// and DebugBridge (`window.__KRUNKED_DEBUG__`)
// ============================================================================

import {
  PHYSICS,
  TIME_TRIAL_MEDALS,
  createEmptyInputFrame,
  type AchievementId,
  type AppDeps,
  type AssistSettings,
  type BiomeId,
  type DebugBridge,
  type DebugMetrics,
  type EmoteType,
  type GameMode,
  type InputFrame,
  type LevelData,
  type ManualPageId,
  type MedalTier,
  type MenuScreen,
  type PackSource,
  type PhotoId,
  type PlayerInput,
  type SaveData,
  type SimEvent,
  type SimHooks,
  type SimState,
  type TargetFps,
} from '../contracts';
import {
  ACHIEVEMENT_CATALOG,
  MANUAL_PAGE_CATALOG,
  PHOTO_CATALOG,
} from '../data/catalogs';
import { InputManager } from '../input/InputManager';
import {
  DEFAULT_BROADCAST_CHANNEL,
  OnlineCoopManager,
  applySimResyncSnapshot,
  type CoopHandshakeInfo,
  type CoopRole,
  type OnlineCoopStatusSnapshot,
} from '../net';
import { MenuManager, type MenuRenderContext } from '../ui/MenuManager';
import { SaveManager } from './SaveManager';

const DEFAULT_SEED = 1337;
const DRAWER_TELEMETRY_REFRESH_MS = 100;
const ONLINE_FALLBACK_INTERVAL_MS = 20;
const ONLINE_FALLBACK_STALE_MS = 45;

function getRenderMinIntervalMs(targetFps: TargetFps): number {
  if (targetFps <= 30) return 30.0; // Clean 30 FPS on 60/120/240Hz monitors
  if (targetFps <= 60) return 14.5; // Clean 60 FPS without jitter-dropping on 60Hz displays
  return 7.2; // Clean 120 FPS (caps 240Hz displays cleanly while never skipping on 120Hz)
}

function countSimEntities(state: SimState): number {
  return (
    2 +
    (state.jeff.active ? 1 : 0) +
    state.fallingBlocks.length +
    state.movablePlatforms.length +
    state.swingPlatforms.length +
    state.windZones.length +
    state.buttons.length +
    state.lasers.length +
    state.tronchos.length +
    state.colorPlatforms.length +
    state.collectibles.length +
    (state.boss.active ? 1 : 0)
  );
}

function isPlayerInputActive(inp: PlayerInput): boolean {
  return (
    inp.moveX !== 0 ||
    inp.moveY !== 0 ||
    inp.jump ||
    inp.jumpPressed ||
    inp.grab ||
    inp.anchor ||
    inp.pull ||
    inp.flag ||
    inp.callCharlie ||
    inp.emote !== 'none'
  );
}

function mergeClientLocalInput(p2: PlayerInput, p1Fallback: PlayerInput): PlayerInput {
  if (isPlayerInputActive(p2)) {
    return p2;
  }
  return p1Fallback;
}

function computeMedalForTimeTrial(trialIndex: number | null, timeSec: number): { id: string; medal: MedalTier } {
  const def =
    TIME_TRIAL_MEDALS.find((t) => t.index === (trialIndex ?? 1)) ?? TIME_TRIAL_MEDALS[0];
  let medal: MedalTier = 'none';
  if (timeSec <= def.platinum) medal = 'platinum';
  else if (timeSec <= def.gold) medal = 'gold';
  else if (timeSec <= def.silver) medal = 'silver';
  else if (timeSec <= def.bronze) medal = 'bronze';
  return { id: def.id, medal };
}

export class GameApp {
  private readonly container: HTMLElement;
  private readonly deps: AppDeps;
  private readonly saveManager: SaveManager;
  private readonly inputManager: InputManager;
  private readonly menuManager: MenuManager;
  private readonly onlineCoop: OnlineCoopManager;
  private readonly simHooks: SimHooks;

  private level: LevelData;
  private simState: SimState;
  private currentMode: GameMode = 'coop_mountain';
  private currentTimeTrialIndex: number | undefined = undefined;
  private inActiveRun = false;
  private runCompletionPersisted = false;

  private packStatusText = 'Built-In Krunked Art';
  private onlineState = 'offline';
  private onlineFallbackTimer: ReturnType<typeof setInterval> | null = null;

  private pendingWheelEmoteP1: EmoteType = 'none';
  private pendingWheelEmoteP2: EmoteType = 'none';

  private rafId: number | null = null;
  private running = false;
  private disposed = false;

  private lastFrameMs = 0;
  private lastRenderMs = 0;
  private lastDrawerUpdateMs = 0;
  private accumulator = 0;

  private fpsFrameCount = 0;
  private fpsWindowStartMs = 0;
  private measuredFps = 60;

  private resizeObserver: ResizeObserver | null = null;
  private readonly handleResizeBound: () => void;
  private readonly debugBridge: DebugBridge;

  constructor(container: HTMLElement, deps: AppDeps) {
    this.container = container;
    this.deps = deps;

    this.saveManager = new SaveManager();
    const save = this.saveManager.get();

    // Ensure renderer canvas is mounted cleanly in container
    const canvas = this.deps.renderer.getCanvas();
    if (!canvas.id) {
      canvas.id = 'game-canvas';
    }
    if (!canvas.parentElement) {
      this.container.appendChild(canvas);
    }

    this.deps.audio.applySettings(save.audio);
    this.simHooks = this.deps.world.createSimHooks();

    // Boot live mountain backdrop right away
    this.level = this.deps.world.getLevelByMode('coop_mountain');
    this.simState = this.deps.sim.createSimState(this.level, {
      seed: DEFAULT_SEED,
      assist: { ...save.assist },
    });

    // Zero-backend Online Co-Op manager (BroadcastChannel + WebRTC P2P + CoopSync)
    this.onlineCoop = new OnlineCoopManager({
      onPeerConnected: (role, handshake) => this.handleOnlinePeerConnected(role, handshake),
      onApplyResync: (tick, snapshot) => this.handleOnlineApplyResync(tick, snapshot),
      onPeerInputArrived: () => this.handlePeerInputArrived(),
      onStatusChange: (status) => this.handleOnlineStatusChange(status),
    });

    this.inputManager = new InputManager(this.container, {
      keybinds: save.keybinds,
      touchMode: save.render.touchMode,
      gamepadSplitMode: save.gamepadSplitMode,
      grabToggleMode: save.grabToggleMode,
      onMenuNav: (action) => {
        this.menuManager.handleNavAction(action, this.buildMenuContext());
      },
      onGlyphChange: () => {
        if (this.menuManager.getScreen() !== 'playing') {
          this.menuManager.render(this.buildMenuContext());
        }
      },
      onTouchVisibilityChange: () => {
        this.menuManager.updateDrawerTelemetry(this.buildMenuContext());
      },
      onAnyUserGesture: () => {
        this.deps.audio.unlock();
      },
    });
    this.inputManager.setTwoPlayerMode(true);

    this.menuManager = new MenuManager(this.container, {
      onStartMode: (mode, ttIndex) => this.startMode(mode, ttIndex),
      onResume: () => this.resumeGame(),
      onRespawnAtBase: () => this.respawnAtBase(),
      onQuitToTitle: () => this.quitToTitle(),
      onSetScreen: (screen) => this.setScreen(screen),
      onUpdateSave: (mutator) => this.updateSaveAndApply(mutator),
      onSetPackSource: (source) => this.setPackSource(source),
      onLoadCustomPackFiles: (files) => this.loadCustomPackFromFiles(files),
      onSetAssist: (partial) => this.setAssist(partial),
      onWarpToZone: (zone) => this.warpToZone(zone),
      onBreakBossChain: () => this.triggerBossChainBreak(),
      onStepTicks: (count) => {
        this.stepTicks(count);
      },
      onResetSave: () => this.resetSave(),
      onOpenOnlineCoop: (role, channelName) => this.openOnlineCoop(role, channelName),
      onCreateWebRtcOffer: () => this.createWebRtcOffer(),
      onAcceptWebRtcAnswer: (code) => this.acceptWebRtcAnswer(code),
      onAcceptWebRtcOffer: (code) => this.acceptWebRtcOffer(code),
      onDisconnectOnline: () => this.disconnectOnline(),
      onTriggerEmote: (who, emote) => this.triggerEmote(who, emote),
      onUnlockAudio: () => this.deps.audio.unlock(),
      onUiSound: (kind) => this.deps.audio.playUiSound(kind),
      onPlayAgain: () => this.startMode(this.currentMode, this.currentTimeTrialIndex),
    });

    // Resize wiring
    this.handleResizeBound = () => this.syncCanvasSize();
    this.syncCanvasSize();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.syncCanvasSize());
      this.resizeObserver.observe(this.container);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.handleResizeBound);
    }

    // Apply saved pack source cleanly (falling back gracefully if custom assets absent)
    if (save.render.packSource === 'custom') {
      this.setPackSource('custom');
    } else {
      this.packStatusText = this.deps.renderer.hasCustomPack()
        ? 'Built-In Art (Custom Available)'
        : 'Built-In Krunked Art';
    }

    // Render initial title screen over live backdrop
    this.menuManager.setScreen('title', this.buildMenuContext());

    // Install DebugBridge on window.__KRUNKED_DEBUG__
    this.debugBridge = this.createDebugBridge();
    if (typeof window !== 'undefined') {
      window.__KRUNKED_DEBUG__ = this.debugBridge;
    }

    // Start loop automatically (start() is idempotent)
    this.start();
  }

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    this.lastFrameMs = now;
    this.lastRenderMs = now - 100;
    this.fpsWindowStartMs = now;
    this.fpsFrameCount = 0;

    // Render one immediate initial frame so first paint is never blank
    this.renderFrame(0.016, 1);

    if (typeof requestAnimationFrame !== 'undefined') {
      this.rafId = requestAnimationFrame((ts) => this.loop(ts));
    }
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  getDebugBridge(): DebugBridge {
    return this.debugBridge;
  }

  getOnlineCoopManager(): OnlineCoopManager {
    return this.onlineCoop;
  }

  // ---- Core App Actions ----

  startMode(mode: GameMode, timeTrialIndex?: number, seedOverride?: number): void {
    this.currentMode = mode;
    this.currentTimeTrialIndex = timeTrialIndex;
    this.inActiveRun = true;
    this.runCompletionPersisted = false;
    this.pendingWheelEmoteP1 = 'none';
    this.pendingWheelEmoteP2 = 'none';

    const save = this.saveManager.get();
    this.level = this.deps.world.getLevelByMode(mode, timeTrialIndex);
    const seed = seedOverride ?? DEFAULT_SEED + (timeTrialIndex ?? 0) * 97;
    this.simState = this.deps.sim.createSimState(this.level, {
      seed,
      assist: { ...save.assist },
      isOnline: mode === 'online_coop',
      aiBuddyEnabled: mode === 'solo_ai',
    });
    if (
      save.assist.infiniteJumps ||
      save.assist.pullingRope ||
      save.assist.checkPoints ||
      save.assist.betterGrab
    ) {
      this.simState.assistEverUsedInRun = true;
    }

    if (mode !== 'online_coop') {
      this.disconnectOnline();
    }

    this.inputManager.setTwoPlayerMode(mode === 'coop_mountain' || mode === 'lab_dlc');
    this.inputManager.resetStepEdges();
    this.accumulator = 0;
    this.menuManager.setScreen('playing', this.buildMenuContext());
    this.renderFrame(PHYSICS.FIXED_DT, 1);
  }

  setScreen(screen: MenuScreen): void {
    if (screen === 'playing' && !this.inActiveRun) {
      this.inActiveRun = true;
    }
    this.menuManager.setScreen(screen, this.buildMenuContext());
  }

  resumeGame(): void {
    this.accumulator = 0;
    this.inputManager.resetStepEdges();
    this.menuManager.setScreen('playing', this.buildMenuContext());
  }

  respawnAtBase(): void {
    if (this.currentMode === 'online_coop' && this.onlineCoop.isActive()) {
      // In online co-op, reset position & broadcast authoritative resync from Host
      this.deps.sim.warpPlayers(this.simState, this.level.spawnP1.x + 0.6, this.level.spawnP1.y);
      if (this.onlineCoop.getRole() === 'host') {
        this.onlineCoop.sendHostResyncSnapshot(this.simState, true);
      }
      this.resumeGame();
      return;
    }
    this.startMode(this.currentMode, this.currentTimeTrialIndex);
  }

  quitToTitle(): void {
    this.persistBestAltitudeIfHigher();
    this.inActiveRun = false;
    this.runCompletionPersisted = false;
    this.disconnectOnline();
    const save = this.saveManager.get();
    this.currentMode = 'coop_mountain';
    this.currentTimeTrialIndex = undefined;
    this.level = this.deps.world.getLevelByMode('coop_mountain');
    this.simState = this.deps.sim.createSimState(this.level, {
      seed: DEFAULT_SEED,
      assist: { ...save.assist },
    });
    this.accumulator = 0;
    this.inputManager.resetStepEdges();
    this.menuManager.setScreen('title', this.buildMenuContext());
  }

  warpTo(x: number, y: number): void {
    this.deps.sim.warpPlayers(this.simState, x, y);
    if (this.currentMode === 'online_coop' && this.onlineCoop.getRole() === 'host') {
      this.onlineCoop.sendHostResyncSnapshot(this.simState, true);
    }
    this.renderFrame(0, 1);
    this.menuManager.updateDrawerTelemetry(this.buildMenuContext());
  }

  warpToZone(zone: BiomeId): void {
    // Allow LAB and BOSS warps from anywhere by switching into Laboratory DLC cleanly
    if ((zone === 'lab' || zone === 'boss') && this.currentMode !== 'lab_dlc') {
      this.startMode('lab_dlc');
    } else if (!this.inActiveRun) {
      this.startMode(this.currentMode, this.currentTimeTrialIndex);
    }
    const target = this.deps.world.getZoneWarpTarget(this.level, zone);
    this.warpTo(target.x, target.y);
  }

  setAssist(partial: Partial<AssistSettings>): void {
    this.saveManager.update((d) => {
      d.assist = { ...d.assist, ...partial };
    });
    const nextAssist = this.saveManager.get().assist;
    this.simState.assist = { ...nextAssist };
    if (
      this.inActiveRun &&
      (nextAssist.infiniteJumps ||
        nextAssist.pullingRope ||
        nextAssist.checkPoints ||
        nextAssist.betterGrab)
    ) {
      this.simState.assistEverUsedInRun = true;
    }
    if (this.currentMode === 'online_coop' && this.onlineCoop.getRole() === 'host') {
      this.onlineCoop.sendHostResyncSnapshot(this.simState, true);
    }
    this.refreshUi();
  }

  setPackSource(source: PackSource): void {
    this.saveManager.update((d) => {
      d.render.packSource = source;
    });
    this.packStatusText = source === 'custom' ? 'Loading Custom Pack...' : 'Built-In Krunked Art';
    this.refreshUi();

    void this.deps.renderer
      .setPackSource(source)
      .then((resolved) => {
        if (this.disposed) return;
        if (resolved !== source) {
          this.saveManager.update((d) => {
            d.render.packSource = resolved;
          });
          this.packStatusText = 'Built-In Art (No Custom Pack Found)';
        } else {
          this.packStatusText =
            resolved === 'custom' ? 'Custom Pack Active' : 'Built-In Krunked Art';
        }
        this.refreshUi();
      })
      .catch(() => {
        if (this.disposed) return;
        this.saveManager.update((d) => {
          d.render.packSource = 'builtin';
        });
        this.packStatusText = 'Built-In Art (Custom Pack Fallback)';
        this.refreshUi();
      });
  }

  async loadCustomPackFromFiles(files: FileList | File[]): Promise<boolean> {
    if (!this.deps.renderer.loadCustomPackFromFiles) {
      this.packStatusText = 'Built-In Art (Loader Unavailable)';
      this.refreshUi();
      return false;
    }
    try {
      const ok = await this.deps.renderer.loadCustomPackFromFiles(files);
      if (ok) {
        this.saveManager.update((d) => {
          d.render.packSource = 'custom';
        });
        this.packStatusText = 'Custom Folder Pack Active';
      } else {
        this.packStatusText = 'Built-In Art (No Valid Pack Files)';
      }
      this.refreshUi();
      return ok;
    } catch {
      this.packStatusText = 'Built-In Art (Folder Load Failed)';
      this.refreshUi();
      return false;
    }
  }

  resetSave(): void {
    const fresh = this.saveManager.reset();
    this.applyAllSettings(fresh);
    this.simState.assist = { ...fresh.assist };
    this.setPackSource(fresh.render.packSource);
    this.refreshUi();
  }

  triggerEmote(who: 'p1' | 'p2', emote: EmoteType): void {
    if (who === 'p2') {
      this.pendingWheelEmoteP2 = emote;
    } else {
      this.pendingWheelEmoteP1 = emote;
    }
  }

  // ---- Zero-Backend Online Co-Op (BroadcastChannel + WebRTC P2P) ----

  openOnlineCoop(role: CoopRole, channelName = DEFAULT_BROADCAST_CHANNEL): void {
    const safeChannel = (channelName ?? '').trim() || DEFAULT_BROADCAST_CHANNEL;
    this.disconnectOnline();

    // Launch clean deterministic online_coop session at tick 0
    this.startMode('online_coop', undefined, DEFAULT_SEED);

    const handshake: CoopHandshakeInfo = {
      seed: this.simState.seed,
      mode: 'online_coop',
      levelId: this.level.id,
    };
    const initialHash = this.deps.sim.hashSimState(this.simState);
    this.onlineCoop.connectBroadcast(role, safeChannel, handshake, this.simState.tick, initialHash);
    this.ensureOnlineFallbackTimer();
    this.refreshUi();
  }

  async createWebRtcOffer(): Promise<string> {
    const onlineLevel = this.deps.world.getLevelByMode('online_coop');
    const code = await this.onlineCoop.createWebRtcOffer(
      {
        seed: DEFAULT_SEED,
        mode: 'online_coop',
        levelId: onlineLevel.id,
      },
      0,
      '',
    );
    this.ensureOnlineFallbackTimer();
    return code;
  }

  async acceptWebRtcAnswer(answerCode: string): Promise<void> {
    await this.onlineCoop.acceptWebRtcAnswer(answerCode);
  }

  async acceptWebRtcOffer(offerCode: string): Promise<string> {
    const onlineLevel = this.deps.world.getLevelByMode('online_coop');
    const code = await this.onlineCoop.acceptWebRtcOffer(
      offerCode,
      {
        seed: DEFAULT_SEED,
        mode: 'online_coop',
        levelId: onlineLevel.id,
      },
      0,
      '',
    );
    this.ensureOnlineFallbackTimer();
    return code;
  }

  disconnectOnline(): void {
    this.stopOnlineFallbackTimer();
    this.onlineCoop.disconnect();
    this.onlineState = 'offline';
    this.menuManager.updateOnlineHud(this.onlineCoop.getStatusSnapshot());
  }

  private handleOnlinePeerConnected(role: CoopRole, handshake: CoopHandshakeInfo): void {
    // Auto-launch synchronized online_coop if we were still in the lobby (e.g. WebRTC connected)
    if (this.currentMode !== 'online_coop' || !this.inActiveRun) {
      this.startMode('online_coop', undefined, handshake.seed);
    } else if (
      role === 'client' &&
      (this.simState.seed !== handshake.seed || this.simState.levelId !== handshake.levelId)
    ) {
      this.startMode('online_coop', undefined, handshake.seed);
    }

    const hash = this.deps.sim.hashSimState(this.simState);
    this.onlineCoop.markPeerReadyAt(this.simState.tick, hash);
    this.ensureOnlineFallbackTimer();

    if (role === 'host') {
      // Authoritatively align Client's tick, seed, assist settings, and positions immediately
      this.onlineCoop.sendHostResyncSnapshot(this.simState, true);
    }

    this.menuManager.showToast({
      kind: 'info',
      title: 'ONLINE CO-OP CONNECTED',
      subtitle:
        role === 'host'
          ? 'P2 Fred joined! Synchronized 50 Hz play active.'
          : 'Locked to Host Krunked! Synchronized 50 Hz play active.',
    });
    this.refreshUi();
  }

  private handleOnlineApplyResync(_tick: number, snapshot: Partial<SimState>): void {
    applySimResyncSnapshot(this.simState, snapshot);
    const newHash = this.deps.sim.hashSimState(this.simState);
    this.onlineCoop.confirmClientResync(this.simState.tick, newHash);
    this.accumulator = 0;
    this.renderFrame(0, 1);
    this.menuManager.updateDrawerTelemetry(this.buildMenuContext());
  }

  private handlePeerInputArrived(): void {
    // If tab is hidden/throttled, respond right away so dual-tab lockstep never stalls
    if (
      typeof document !== 'undefined' &&
      document.hidden &&
      this.currentMode === 'online_coop' &&
      this.inActiveRun &&
      this.menuManager.getScreen() === 'playing' &&
      this.onlineCoop.isPeerConnected()
    ) {
      this.stepOnlineLockstepTick();
    }
  }

  private handleOnlineStatusChange(status: OnlineCoopStatusSnapshot): void {
    this.onlineState = status.summaryString;
    this.menuManager.updateOnlineHud(status);
    if (this.menuManager.getScreen() === 'online_lobby') {
      this.menuManager.render(this.buildMenuContext());
    } else if (this.menuManager.isDrawerOpen()) {
      this.menuManager.updateDrawerTelemetry(this.buildMenuContext());
    }
  }

  private ensureOnlineFallbackTimer(): void {
    if (this.onlineFallbackTimer !== null) return;
    this.onlineFallbackTimer = setInterval(() => {
      if (this.disposed || !this.onlineCoop.isActive()) {
        this.stopOnlineFallbackTimer();
        return;
      }
      if (
        this.currentMode !== 'online_coop' ||
        !this.inActiveRun ||
        this.menuManager.getScreen() !== 'playing' ||
        !this.onlineCoop.isPeerConnected()
      ) {
        return;
      }
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - this.lastFrameMs >= ONLINE_FALLBACK_STALE_MS) {
        this.stepOnlineLockstepTick();
      }
    }, ONLINE_FALLBACK_INTERVAL_MS);
  }

  private stopOnlineFallbackTimer(): void {
    if (this.onlineFallbackTimer !== null) {
      clearInterval(this.onlineFallbackTimer);
      this.onlineFallbackTimer = null;
    }
  }

  private stepOnlineLockstepTick(): boolean {
    if (!this.onlineCoop.isPeerConnected()) {
      return false;
    }
    const role = this.onlineCoop.getRole();
    if (!role) return false;

    const sampled = this.sampleCombinedLocalFrame(this.simState.tick);
    const localInput =
      role === 'host' ? sampled.p1 : mergeClientLocalInput(sampled.p2, sampled.p1);
    const preHash = this.deps.sim.hashSimState(this.simState);
    this.onlineCoop.queueLocalInput(this.simState.tick, localInput, preHash);

    const netFrame = this.onlineCoop.consumeTickFrame(this.simState.tick);
    if (!netFrame) {
      this.onlineCoop.pumpRetransmit(this.simState.tick);
      return false;
    }

    this.stepSingleTick(netFrame);
    const postHash = this.deps.sim.hashSimState(this.simState);
    this.onlineCoop.recordCompletedTick(this.simState.tick, postHash, this.simState);
    return true;
  }

  // ---- Deterministic Stepping & Boss Debug ----

  stepTicks(count: number, p1?: Partial<PlayerInput>, p2?: Partial<PlayerInput>): string {
    const ticks = Math.max(0, Math.floor(count));
    const hasInlineOverride = p1 !== undefined || p2 !== undefined;

    for (let i = 0; i < ticks; i++) {
      let frame: InputFrame;
      if (hasInlineOverride) {
        frame = createEmptyInputFrame(this.simState.tick);
        if (p1) {
          frame.p1 = {
            ...frame.p1,
            ...p1,
            jumpPressed:
              p1.jumpPressed !== undefined ? p1.jumpPressed : i === 0 && Boolean(p1.jump),
          };
          if (frame.p1.jumpPressed) frame.p1.jump = true;
        }
        if (p2) {
          frame.p2 = {
            ...frame.p2,
            ...p2,
            jumpPressed:
              p2.jumpPressed !== undefined ? p2.jumpPressed : i === 0 && Boolean(p2.jump),
          };
          if (frame.p2.jumpPressed) frame.p2.jump = true;
        }
      } else {
        frame = this.sampleCombinedLocalFrame(this.simState.tick);
      }

      this.stepSingleTick(frame);
    }

    this.renderFrame(PHYSICS.FIXED_DT, 1);
    this.menuManager.updateDrawerTelemetry(this.buildMenuContext());
    return this.deps.sim.hashSimState(this.simState);
  }

  triggerBossChainBreak(chainIndex?: number): void {
    // If player triggers BREAK BOSS CHAIN from the dev drawer outside lab_dlc, enter Boss Arena automatically
    if (this.currentMode !== 'lab_dlc' || this.simState.boss.chains.length === 0) {
      this.warpToZone('boss');
    }

    const chains = this.simState.boss.chains;
    if (!chains || chains.length === 0) return;

    this.simState.boss.active = true;
    const target =
      chainIndex !== undefined && chains[chainIndex]
        ? chains[chainIndex]
        : chains.find((c) => !c.broken);

    if (!target || target.broken) return;

    target.broken = true;
    const remaining = chains.reduce((acc, c) => acc + (c.broken ? 0 : 1), 0);
    const events: SimEvent[] = [
      {
        type: 'boss_chain_break',
        chainId: target.id,
        remaining,
        x: target.x,
        y: target.y,
      },
    ];

    if (remaining === 0 && !this.simState.boss.defeated) {
      this.simState.boss.defeated = true;
      this.simState.completed = true;
      this.simState.completionTimeSec = this.simState.elapsedSec;
      events.push({ type: 'boss_defeated', timeSec: this.simState.elapsedSec });
    }

    this.simState.events.push(...events);
    this.processSimEvents(events);
    if (this.simState.completed && this.inActiveRun) {
      this.handleRunCompleted();
    }
    this.renderFrame(0, 1);
    this.menuManager.updateDrawerTelemetry(this.buildMenuContext());
  }

  // ---- Main Decoupled 50 Hz Sim / 30|60|120 FPS Render Loop ----

  private loop(nowMs: number): void {
    if (!this.running || this.disposed) return;

    const rawDtSec = (nowMs - this.lastFrameMs) / 1000;
    this.lastFrameMs = nowMs;
    const dt = Math.min(Math.max(rawDtSec, 0), PHYSICS.MAX_ALLOWED_TIMESTEP);

    // Poll Gamepad UI nav & hot-plug every rAF frame
    this.inputManager.pollUi(dt);

    const screen = this.menuManager.getScreen();
    const shouldStepSim = screen === 'playing' || !this.inActiveRun;

    if (shouldStepSim) {
      if (screen === 'playing' && this.currentMode === 'online_coop' && this.onlineCoop.isActive()) {
        if (this.onlineCoop.isPeerConnected()) {
          this.accumulator += dt;
          while (this.accumulator >= PHYSICS.FIXED_DT) {
            const stepped = this.stepOnlineLockstepTick();
            if (!stepped) {
              // Hold accumulator at one fixed step while awaiting remote tick
              this.accumulator = Math.min(this.accumulator, PHYSICS.FIXED_DT);
              break;
            }
            this.accumulator -= PHYSICS.FIXED_DT;
            if (this.menuManager.getScreen() !== screen) {
              this.accumulator = 0;
              break;
            }
          }
        } else {
          this.accumulator = 0;
        }
      } else {
        this.accumulator += dt;
        while (this.accumulator >= PHYSICS.FIXED_DT) {
          const frame =
            screen === 'playing'
              ? this.sampleCombinedLocalFrame(this.simState.tick)
              : createEmptyInputFrame(this.simState.tick);
          this.stepSingleTick(frame);
          this.accumulator -= PHYSICS.FIXED_DT;

          // If run just completed into victory screen, stop stepping mid-frame
          if (this.menuManager.getScreen() !== screen) {
            this.accumulator = 0;
            break;
          }
        }
      }
    }

    // Decoupled render pacing for Target FPS (30 | 60 | 120)
    const save = this.saveManager.get();
    const minIntervalMs = getRenderMinIntervalMs(save.render.targetFps);
    const sinceRenderMs = nowMs - this.lastRenderMs;

    if (sinceRenderMs >= minIntervalMs) {
      const renderDt = Math.min(sinceRenderMs / 1000, PHYSICS.MAX_ALLOWED_TIMESTEP);
      this.lastRenderMs = nowMs;

      const interpAlpha = save.render.classic50HzSnap
        ? 1
        : Math.max(0, Math.min(1, this.accumulator / PHYSICS.FIXED_DT));

      this.renderFrame(renderDt, interpAlpha);

      // Update rolling FPS measurement (0.5s window)
      this.fpsFrameCount += 1;
      const fpsElapsed = nowMs - this.fpsWindowStartMs;
      if (fpsElapsed >= 500) {
        this.measuredFps = Math.round((this.fpsFrameCount * 1000) / fpsElapsed);
        this.fpsFrameCount = 0;
        this.fpsWindowStartMs = nowMs;
      }
    }

    // Throttled telemetry & Online HUD refresh
    if (nowMs - this.lastDrawerUpdateMs >= DRAWER_TELEMETRY_REFRESH_MS) {
      this.lastDrawerUpdateMs = nowMs;
      if (this.menuManager.isDrawerOpen() || this.onlineCoop.isActive()) {
        this.menuManager.updateDrawerTelemetry(this.buildMenuContext());
      }
    }

    if (typeof requestAnimationFrame !== 'undefined') {
      this.rafId = requestAnimationFrame((ts) => this.loop(ts));
    }
  }

  private sampleCombinedLocalFrame(tick: number): InputFrame {
    const frame = this.inputManager.sampleFrame(tick);
    if (this.pendingWheelEmoteP1 !== 'none') {
      frame.p1.emote = this.pendingWheelEmoteP1;
      this.pendingWheelEmoteP1 = 'none';
    }
    if (this.pendingWheelEmoteP2 !== 'none') {
      frame.p2.emote = this.pendingWheelEmoteP2;
      this.pendingWheelEmoteP2 = 'none';
    }
    return frame;
  }

  private stepSingleTick(frame: InputFrame): void {
    const wasCompleted = this.simState.completed;
    const events = this.deps.sim.stepSim(this.simState, this.level, frame, this.simHooks);
    this.processSimEvents(events);

    if (this.inActiveRun) {
      this.checkStateAchievements();
    }

    if (!wasCompleted && this.simState.completed && this.inActiveRun) {
      this.handleRunCompleted();
    }
  }

  private processSimEvents(events: SimEvent[]): void {
    if (events.length === 0) return;

    this.deps.renderer.consumeEvents(events, this.simState);
    this.deps.audio.consumeEvents(events, this.simState);

    const splitMode = this.saveManager.get().gamepadSplitMode;

    for (const ev of events) {
      switch (ev.type) {
        case 'land_hard': {
          const padIdx = splitMode ? 0 : ev.who === 'p2' ? 1 : 0;
          this.inputManager.triggerRumble(padIdx, 0.55, 0.85, 220);
          if (this.inActiveRun) this.tryUnlockAchievement('HardLanding');
          break;
        }
        case 'grab_start': {
          const padIdx = splitMode ? 0 : ev.who === 'p2' ? 1 : 0;
          this.inputManager.triggerRumble(padIdx, 0.25, 0.12, 65);
          if (this.inActiveRun && ev.who !== 'jeff') {
            this.tryUnlockAchievement('WallClimber');
          }
          break;
        }
        case 'grab_stamina_out': {
          if (this.inActiveRun) this.tryUnlockAchievement('RunOutStamina');
          break;
        }
        case 'swing_launch': {
          if (this.inActiveRun) this.tryUnlockAchievement('FirstSwing');
          break;
        }
        case 'rope_taut': {
          const tension = Math.max(0, Math.min(1, ev.tension));
          this.inputManager.triggerRumble(
            -1,
            Math.min(0.65, 0.22 + tension * 0.35),
            Math.min(0.55, 0.15 + tension * 0.32),
            90,
          );
          break;
        }
        case 'rope_pull_start': {
          if (this.inActiveRun) this.tryUnlockAchievement('RopePullRescue');
          break;
        }
        case 'charlie_pickup': {
          if (this.inActiveRun) this.tryUnlockAchievement('CallCharlie');
          break;
        }
        case 'troncho_launch': {
          if (this.inActiveRun) this.tryUnlockAchievement('TronchoFlyer');
          break;
        }
        case 'rps_result': {
          if (this.inActiveRun && ev.winner !== 'draw') {
            this.tryUnlockAchievement('RpsChampion');
          }
          break;
        }
        case 'boss_chain_break': {
          this.inputManager.triggerRumble(-1, 0.85, 1.0, 380);
          break;
        }
        case 'collect_photo': {
          const unlocked = this.saveManager.unlockPhoto(ev.id);
          if (unlocked) {
            const meta = PHOTO_CATALOG[ev.id as PhotoId];
            this.menuManager.showToast({
              kind: 'photo',
              title: 'POLAROID COLLECTED',
              subtitle: meta ? `${meta.title} (${this.saveManager.get().unlockedPhotos.length}/12)` : ev.label,
            });
            this.checkCollectionAchievements();
          }
          break;
        }
        case 'collect_manual': {
          const unlocked = this.saveManager.unlockManual(ev.id);
          if (unlocked) {
            const meta = MANUAL_PAGE_CATALOG[ev.id as ManualPageId];
            this.menuManager.showToast({
              kind: 'manual',
              title: 'MANUAL PAGE FOUND',
              subtitle: meta ? meta.title : ev.label,
            });
            this.checkCollectionAchievements();
          }
          break;
        }
        case 'rescue_seal': {
          this.saveManager.recordSealRescued();
          this.tryUnlockAchievement('RescueSeal');
          break;
        }
        case 'achievement_unlock': {
          this.tryUnlockAchievement(ev.id);
          break;
        }
        case 'summit_reached': {
          this.runCompletionPersisted = true;
          this.saveManager.recordSummit(ev.noAssist);
          if (ev.mode === 'coop_mountain' || ev.mode === 'online_coop') {
            this.tryUnlockAchievement('ReachPeakCoop');
          } else if (ev.mode === 'solo_jeff' || ev.mode === 'solo_ai') {
            this.tryUnlockAchievement('ReachPeakSolo');
          }
          if (ev.noAssist) {
            this.tryUnlockAchievement('GameCompletedNoAssist');
          }
          break;
        }
        case 'boss_defeated': {
          this.runCompletionPersisted = true;
          this.saveManager.recordLabBossCleared();
          this.saveManager.unlockPhoto('Photo12');
          this.tryUnlockAchievement('DefeatBachicha');
          this.checkCollectionAchievements();
          break;
        }
        case 'time_trial_finish': {
          this.runCompletionPersisted = true;
          this.saveManager.recordTimeTrial(ev.trialId, ev.timeSec, ev.medal);
          if (ev.medal !== 'none') {
            this.tryUnlockAchievement('TimeTrialBronze');
          }
          if (ev.medal === 'platinum') {
            this.tryUnlockAchievement('TimeTrialPlatinum');
          }
          break;
        }
      }
    }
  }

  private checkStateAchievements(): void {
    const st = this.simState;
    if (st.altitude >= 4 && st.currentBiome !== 'village') {
      this.tryUnlockAchievement('FirstSteps');
    }
    if (st.currentBiome === 'mines') {
      this.tryUnlockAchievement('EnterMines');
    } else if (st.currentBiome === 'summit') {
      this.tryUnlockAchievement('FrozenSummit');
    } else if (st.currentBiome === 'lab' || st.currentBiome === 'boss') {
      this.tryUnlockAchievement('EnterLab');
    }
    if (st.p1.action === 'Drag' || st.p2.action === 'Drag') {
      this.tryUnlockAchievement('DraggedDown');
    }
    if (
      st.p1.emote === 'clap' &&
      st.p2.emote === 'clap' &&
      st.p1.emoteTimer > 0 &&
      st.p2.emoteTimer > 0
    ) {
      this.tryUnlockAchievement('ClapTogether');
    }
    if (st.windActive && st.swingPlatforms.length > 0) {
      const swingIds = new Set(st.swingPlatforms.map((s) => s.id));
      if (
        (st.p1.platformEntityId && swingIds.has(st.p1.platformEntityId)) ||
        (st.p2.platformEntityId && swingIds.has(st.p2.platformEntityId))
      ) {
        this.tryUnlockAchievement('WindRider');
      }
    }
  }

  private checkCollectionAchievements(): void {
    const save = this.saveManager.get();
    if (save.unlockedPhotos.length >= 6) {
      this.tryUnlockAchievement('PhotoCollectorHalf');
    }
    if (save.unlockedPhotos.length >= 12) {
      this.tryUnlockAchievement('PhotoCollectorAll');
    }
    if (save.unlockedManual.length >= 7) {
      this.tryUnlockAchievement('ManualScholar');
    }
  }

  private tryUnlockAchievement(id: AchievementId): void {
    const newlyUnlocked = this.saveManager.unlockAchievement(id);
    if (!newlyUnlocked) return;

    const meta = ACHIEVEMENT_CATALOG[id];
    this.menuManager.showToast({
      kind: 'achievement',
      title: `ACHIEVEMENT: ${meta.name}`,
      subtitle: meta.description,
    });
    this.deps.audio.playUiSound('confirm');
  }

  private handleRunCompleted(): void {
    this.persistBestAltitudeIfHigher();

    if (!this.runCompletionPersisted) {
      this.runCompletionPersisted = true;
      const st = this.simState;
      const runTime = st.completionTimeSec > 0 ? st.completionTimeSec : st.elapsedSec;
      if (st.mode === 'time_trial') {
        const res = computeMedalForTimeTrial(st.timeTrialIndex, runTime);
        if (st.completionMedal === 'none') {
          st.completionMedal = res.medal;
        }
        this.saveManager.recordTimeTrial(res.id, runTime, st.completionMedal);
        if (st.completionMedal !== 'none') this.tryUnlockAchievement('TimeTrialBronze');
        if (st.completionMedal === 'platinum') this.tryUnlockAchievement('TimeTrialPlatinum');
      } else if (st.mode === 'lab_dlc' && st.boss.defeated) {
        this.saveManager.recordLabBossCleared();
        this.tryUnlockAchievement('DefeatBachicha');
      } else {
        const noAssist = !st.assistEverUsedInRun;
        this.saveManager.recordSummit(noAssist);
        if (st.mode === 'coop_mountain' || st.mode === 'online_coop') {
          this.tryUnlockAchievement('ReachPeakCoop');
        } else if (st.mode === 'solo_jeff' || st.mode === 'solo_ai') {
          this.tryUnlockAchievement('ReachPeakSolo');
        }
        if (noAssist) this.tryUnlockAchievement('GameCompletedNoAssist');
      }
    }

    this.menuManager.setScreen('victory', this.buildMenuContext());
  }

  private renderFrame(dt: number, interpAlpha: number): void {
    const save = this.saveManager.get();
    this.deps.renderer.render(
      this.simState,
      this.level,
      interpAlpha,
      save.render,
      save.skins,
      dt,
      this.measuredFps,
    );
    this.deps.audio.update(this.simState, dt);
  }

  private updateSaveAndApply(mutator: (data: SaveData) => void): void {
    const updated = this.saveManager.update(mutator);
    this.applyAllSettings(updated);
    if (
      (updated.skins.p1 !== 'Default' || updated.skins.p2 !== 'Default') &&
      updated.skins.rope !== 'Default'
    ) {
      this.tryUnlockAchievement('FashionPenguin');
    }
    this.refreshUi();
  }

  private applyAllSettings(save: SaveData): void {
    this.deps.audio.applySettings(save.audio);
    this.inputManager.setKeybinds(save.keybinds);
    this.inputManager.setTouchMode(save.render.touchMode);
    this.inputManager.setGamepadSplitMode(save.gamepadSplitMode);
    this.inputManager.setGrabToggleMode(save.grabToggleMode);
  }

  private persistBestAltitudeIfHigher(): void {
    if (!this.inActiveRun) return;
    this.saveManager.updateBestAltitude(this.simState.mode, this.simState.maxAltitude);
  }

  private syncCanvasSize(): void {
    const rect = this.container.getBoundingClientRect();
    const w =
      rect.width > 0
        ? Math.round(rect.width)
        : typeof window !== 'undefined'
          ? window.innerWidth
          : 960;
    const h =
      rect.height > 0
        ? Math.round(rect.height)
        : typeof window !== 'undefined'
          ? window.innerHeight
          : 540;
    this.deps.renderer.resize(Math.max(1, w), Math.max(1, h));
  }

  private buildMetrics(): DebugMetrics {
    const save = this.saveManager.get();
    return {
      fps: this.measuredFps,
      targetFps: save.render.targetFps,
      simHz: PHYSICS.SIM_HZ,
      tick: this.simState.tick,
      altitude: this.simState.altitude,
      maxAltitude: this.simState.maxAltitude,
      biome: this.simState.currentBiome,
      entities: countSimEntities(this.simState),
      packSource: this.deps.renderer.getPackSource(),
      touchVisible: this.inputManager.isTouchVisible(),
      gamepadCount: this.inputManager.getGamepadCount(),
      onlineState: this.onlineState,
    };
  }

  private buildMenuContext(): MenuRenderContext {
    return {
      save: this.saveManager.get(),
      simState: this.simState,
      metrics: this.buildMetrics(),
      hash: this.deps.sim.hashSimState(this.simState),
      glyphStyle: this.inputManager.getGlyphStyle(),
      hasCustomPack: this.deps.renderer.hasCustomPack(),
      packStatusText: this.packStatusText,
      inActiveRun: this.inActiveRun,
      onlineStatus: this.onlineCoop.getStatusSnapshot(),
    };
  }

  private refreshUi(): void {
    const ctx = this.buildMenuContext();
    this.menuManager.render(ctx);
    this.menuManager.updateDrawerTelemetry(ctx);
  }

  private createDebugBridge(): DebugBridge {
    return {
      getState: () => this.simState,
      getHash: () => this.deps.sim.hashSimState(this.simState),
      getMetrics: () => this.buildMetrics(),
      getScreen: () => this.menuManager.getScreen(),
      setScreen: (screen: MenuScreen) => this.setScreen(screen),
      startMode: (mode: GameMode, timeTrialIndex?: number) =>
        this.startMode(mode, timeTrialIndex),
      warpTo: (x: number, y: number) => this.warpTo(x, y),
      warpToZone: (zone: BiomeId) => this.warpToZone(zone),
      setAssist: (partial: Partial<AssistSettings>) => this.setAssist(partial),
      setTargetFps: (fps: TargetFps) =>
        this.updateSaveAndApply((d) => {
          d.render.targetFps = fps;
        }),
      setClassicSnap: (enabled: boolean) =>
        this.updateSaveAndApply((d) => {
          d.render.classic50HzSnap = enabled;
        }),
      setSkins: (partial: Partial<SaveData['skins']>) =>
        this.updateSaveAndApply((d) => {
          d.skins = { ...d.skins, ...partial };
        }),
      setPackSource: (source: PackSource) => this.setPackSource(source),
      setInputOverride: (p1?: Partial<PlayerInput>, p2?: Partial<PlayerInput>) =>
        this.inputManager.setInputOverride(p1, p2),
      clearInputOverride: () => this.inputManager.clearInputOverride(),
      stepTicks: (count: number, p1?: Partial<PlayerInput>, p2?: Partial<PlayerInput>) =>
        this.stepTicks(count, p1, p2),
      triggerBossChainBreak: (chainIndex?: number) => this.triggerBossChainBreak(chainIndex),
      resetSave: () => this.resetSave(),
      getTouchVisible: () => this.inputManager.isTouchVisible(),
      openOnlineCoop: (role: 'host' | 'client', channelName?: string) =>
        this.openOnlineCoop(role, channelName),
      toggleDrawer: (open?: boolean) => this.menuManager.toggleDrawer(open, this.buildMenuContext()),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.persistBestAltitudeIfHigher();
    this.stopOnlineFallbackTimer();
    this.onlineCoop.dispose();

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.handleResizeBound);
      if (window.__KRUNKED_DEBUG__ === this.debugBridge) {
        delete window.__KRUNKED_DEBUG__;
      }
    }

    this.inputManager.dispose();
    this.menuManager.dispose();
    this.deps.renderer.dispose();
    this.deps.audio.dispose();
  }
}
