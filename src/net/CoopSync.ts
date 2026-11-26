// ============================================================================
// Krunked & Fred — Deterministic 50 Hz Input Exchange & Resync Manager (CoopSync)
// Host owns P1 (Krunked) & receives P2 (Fred); Client owns P2 (Fred) & receives
// P1 (Krunked). Tracks RTT ms, remote tick, FNV-1a hash parity (SYNCED / RESYNCING),
// and applies authoritative Host `state_resync` snapshots cleanly on divergence.
// ============================================================================

import {
  createEmptyInputFrame,
  createEmptyPlayerInput,
  type GameMode,
  type InputFrame,
  type NetSyncPacket,
  type PenguinState,
  type PlayerInput,
  type SimState,
} from '../contracts';
import type { CoopRole } from './BroadcastCoop';

export type SyncStatus = 'OFFLINE' | 'WAITING' | 'SYNCED' | 'RESYNCING';

export interface CoopSyncStats {
  role: CoopRole | null;
  syncStatus: SyncStatus;
  peerReady: boolean;
  rttMs: number;
  remoteTick: number;
  localTick: number;
  remoteHash: string;
  localHash: string;
  hashMatched: boolean;
  resyncCount: number;
  lastMatchedTick: number;
}

export interface CoopSyncCallbacks {
  sendPacket: (packet: NetSyncPacket) => boolean;
  onHandshakeHello?: (packet: Extract<NetSyncPacket, { type: 'hello' }>) => void;
  onApplyResync?: (tick: number, snapshot: Partial<SimState>) => void;
  onPeerInputArrived?: (tick: number) => void;
  onStatsChange?: (stats: CoopSyncStats) => void;
}

const INPUT_DELAY_TICKS = 2; // 40ms at 50 Hz absorbs BroadcastChannel & WebRTC jitter cleanly
const HASH_HISTORY_LIMIT = 180;
const ACK_INTERVAL_TICKS = 5; // 10 Hz hash verification heartbeat
const PING_INTERVAL_MS = 1000;
const RESYNC_COOLDOWN_MS = 250;
const RETRANSMIT_COOLDOWN_MS = 75;
const RETRANSMIT_WINDOW_TICKS = 6;

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function clonePlayerInput(inp: PlayerInput): PlayerInput {
  return {
    moveX: inp.moveX,
    moveY: inp.moveY,
    jump: Boolean(inp.jump),
    jumpPressed: Boolean(inp.jumpPressed),
    grab: Boolean(inp.grab),
    anchor: Boolean(inp.anchor),
    pull: Boolean(inp.pull),
    flag: Boolean(inp.flag),
    callCharlie: Boolean(inp.callCharlie),
    emote: inp.emote,
  };
}

function clonePenguinState(p: PenguinState): PenguinState {
  return {
    ...p,
    scarfNodes: p.scarfNodes.map((n) => ({ x: n.x, y: n.y })),
  };
}

/**
 * Produces a clean JSON-serializable authoritative snapshot of every deterministic
 * SimState field hashed by `hashSimState`, plus visual continuity fields (camera, rope, scarves).
 */
export function createSimResyncSnapshot(state: SimState): Partial<SimState> {
  return {
    tick: state.tick,
    seed: state.seed,
    rngState: state.rngState,
    levelId: state.levelId,
    mode: state.mode,
    timeTrialIndex: state.timeTrialIndex,
    elapsedSec: state.elapsedSec,
    isOnline: state.isOnline,
    aiBuddyEnabled: state.aiBuddyEnabled,
    assist: { ...state.assist },
    assistEverUsedInRun: state.assistEverUsedInRun,
    p1: clonePenguinState(state.p1),
    p2: clonePenguinState(state.p2),
    jeff: { ...state.jeff },
    rope: {
      maxDistance: state.rope.maxDistance,
      currentDistance: state.rope.currentDistance,
      taut: state.rope.taut,
      tension: state.rope.tension,
      wasTaut: state.rope.wasTaut,
      nodes: state.rope.nodes.map((n) => ({
        x: n.x,
        y: n.y,
        prevX: n.prevX,
        prevY: n.prevY,
      })),
    },
    checkpoint: { ...state.checkpoint },
    camera: { ...state.camera },
    altitude: state.altitude,
    maxAltitude: state.maxAltitude,
    fallsCount: state.fallsCount,
    jumpsCount: state.jumpsCount,
    currentBiome: state.currentBiome,
    windActive: state.windActive,
    windDir: state.windDir,
    windPhase: state.windPhase,
    fallingBlocks: state.fallingBlocks.map((b) => ({ ...b })),
    movablePlatforms: state.movablePlatforms.map((m) => ({ ...m })),
    swingPlatforms: state.swingPlatforms.map((s) => ({ ...s })),
    windZones: state.windZones.map((w) => ({ ...w })),
    circuits: state.circuits.map((c) => ({
      ...c,
      nodes: c.nodes.map((n) => ({ x: n.x, y: n.y })),
    })),
    buttons: state.buttons.map((b) => ({ ...b })),
    lasers: state.lasers.map((l) => ({ ...l })),
    tronchos: state.tronchos.map((tr) => ({ ...tr })),
    colorPlatforms: state.colorPlatforms.map((cp) => ({ ...cp })),
    collectibles: state.collectibles.map((c) => ({ ...c })),
    boss: {
      ...state.boss,
      phaseOrder: [...state.boss.phaseOrder],
      chains: state.boss.chains.map((c) => ({ ...c })),
    },
    completed: state.completed,
    completionTimeSec: state.completionTimeSec,
    completionMedal: state.completionMedal,
  };
}

/**
 * Mutates `target` SimState in-place from an authoritative Host `state_resync` snapshot,
 * preserving the object reference held by GameApp and DebugBridge while guaranteeing
 * immediate FNV-1a hash equality.
 */
export function applySimResyncSnapshot(target: SimState, snapshot: Partial<SimState>): void {
  if (typeof snapshot.tick === 'number') target.tick = snapshot.tick;
  if (typeof snapshot.seed === 'number') target.seed = snapshot.seed;
  if (typeof snapshot.rngState === 'number') target.rngState = snapshot.rngState;
  if (typeof snapshot.levelId === 'string') target.levelId = snapshot.levelId;
  if (typeof snapshot.mode === 'string') target.mode = snapshot.mode as GameMode;
  if (snapshot.timeTrialIndex !== undefined) target.timeTrialIndex = snapshot.timeTrialIndex;
  if (typeof snapshot.elapsedSec === 'number') target.elapsedSec = snapshot.elapsedSec;
  if (typeof snapshot.isOnline === 'boolean') target.isOnline = snapshot.isOnline;
  if (typeof snapshot.aiBuddyEnabled === 'boolean') target.aiBuddyEnabled = snapshot.aiBuddyEnabled;
  if (snapshot.assist) target.assist = { ...snapshot.assist };
  if (typeof snapshot.assistEverUsedInRun === 'boolean') {
    target.assistEverUsedInRun = snapshot.assistEverUsedInRun;
  }

  if (snapshot.p1) {
    Object.assign(target.p1, clonePenguinState(snapshot.p1));
  }
  if (snapshot.p2) {
    Object.assign(target.p2, clonePenguinState(snapshot.p2));
  }
  if (snapshot.jeff) {
    Object.assign(target.jeff, snapshot.jeff);
  }
  if (snapshot.rope) {
    target.rope.maxDistance = snapshot.rope.maxDistance;
    target.rope.currentDistance = snapshot.rope.currentDistance;
    target.rope.taut = snapshot.rope.taut;
    target.rope.tension = snapshot.rope.tension;
    target.rope.wasTaut = snapshot.rope.wasTaut;
    if (Array.isArray(snapshot.rope.nodes)) {
      target.rope.nodes = snapshot.rope.nodes.map((n) => ({
        x: n.x,
        y: n.y,
        prevX: n.prevX,
        prevY: n.prevY,
      }));
    }
  }
  if (snapshot.checkpoint) Object.assign(target.checkpoint, snapshot.checkpoint);
  if (snapshot.camera) Object.assign(target.camera, snapshot.camera);

  if (typeof snapshot.altitude === 'number') target.altitude = snapshot.altitude;
  if (typeof snapshot.maxAltitude === 'number') target.maxAltitude = snapshot.maxAltitude;
  if (typeof snapshot.fallsCount === 'number') target.fallsCount = snapshot.fallsCount;
  if (typeof snapshot.jumpsCount === 'number') target.jumpsCount = snapshot.jumpsCount;
  if (snapshot.currentBiome) target.currentBiome = snapshot.currentBiome;
  if (typeof snapshot.windActive === 'boolean') target.windActive = snapshot.windActive;
  if (snapshot.windDir === 1 || snapshot.windDir === -1) target.windDir = snapshot.windDir;
  if (snapshot.windPhase) target.windPhase = snapshot.windPhase;

  if (Array.isArray(snapshot.fallingBlocks)) {
    target.fallingBlocks = snapshot.fallingBlocks.map((b) => ({ ...b }));
  }
  if (Array.isArray(snapshot.movablePlatforms)) {
    target.movablePlatforms = snapshot.movablePlatforms.map((m) => ({ ...m }));
  }
  if (Array.isArray(snapshot.swingPlatforms)) {
    target.swingPlatforms = snapshot.swingPlatforms.map((s) => ({ ...s }));
  }
  if (Array.isArray(snapshot.windZones)) {
    target.windZones = snapshot.windZones.map((w) => ({ ...w }));
  }
  if (Array.isArray(snapshot.circuits)) {
    target.circuits = snapshot.circuits.map((c) => ({
      ...c,
      nodes: c.nodes.map((n) => ({ x: n.x, y: n.y })),
    }));
  }
  if (Array.isArray(snapshot.buttons)) {
    target.buttons = snapshot.buttons.map((b) => ({ ...b }));
  }
  if (Array.isArray(snapshot.lasers)) {
    target.lasers = snapshot.lasers.map((l) => ({ ...l }));
  }
  if (Array.isArray(snapshot.tronchos)) {
    target.tronchos = snapshot.tronchos.map((tr) => ({ ...tr }));
  }
  if (Array.isArray(snapshot.colorPlatforms)) {
    target.colorPlatforms = snapshot.colorPlatforms.map((cp) => ({ ...cp }));
  }
  if (Array.isArray(snapshot.collectibles)) {
    target.collectibles = snapshot.collectibles.map((c) => ({ ...c }));
  }
  if (snapshot.boss) {
    target.boss = {
      ...snapshot.boss,
      phaseOrder: [...snapshot.boss.phaseOrder],
      chains: snapshot.boss.chains.map((c) => ({ ...c })),
    };
  }
  if (typeof snapshot.completed === 'boolean') target.completed = snapshot.completed;
  if (typeof snapshot.completionTimeSec === 'number') {
    target.completionTimeSec = snapshot.completionTimeSec;
  }
  if (snapshot.completionMedal) target.completionMedal = snapshot.completionMedal;
  target.events = [];
}

export class CoopSync {
  private readonly callbacks: CoopSyncCallbacks;

  private role: CoopRole | null = null;
  private syncStatus: SyncStatus = 'OFFLINE';
  private peerReady = false;

  private localTick = 0;
  private nextSendTick = 0;
  private remoteTick = 0;
  private localHash = '';
  private remoteHash = '';
  private hashMatched = true;
  private lastMatchedTick = 0;
  private resyncCount = 0;
  private rttMs = 0;

  private readonly localInputs = new Map<number, PlayerInput>();
  private readonly remoteInputs = new Map<number, PlayerInput>();
  private readonly localHashes = new Map<number, string>();
  private readonly remoteHashes = new Map<number, string>();

  private lastPingSentMs = 0;
  private lastResyncSentMs = 0;
  private lastRetransmitMs = 0;
  private pendingHostResync = false;

  constructor(callbacks: CoopSyncCallbacks) {
    this.callbacks = callbacks;
  }

  startSession(role: CoopRole, baseTick = 0, initialHash = ''): void {
    this.role = role;
    this.peerReady = false;
    this.syncStatus = 'WAITING';
    this.rttMs = 0;
    this.resyncCount = 0;
    this.hashMatched = true;
    this.lastMatchedTick = baseTick;
    this.lastPingSentMs = 0;
    this.lastResyncSentMs = 0;
    this.lastRetransmitMs = 0;
    this.pendingHostResync = false;

    this.resetQueuesAtTick(baseTick, initialHash);
    this.emitStats();
  }

  reset(): void {
    this.role = null;
    this.peerReady = false;
    this.syncStatus = 'OFFLINE';
    this.localTick = 0;
    this.nextSendTick = 0;
    this.remoteTick = 0;
    this.localHash = '';
    this.remoteHash = '';
    this.hashMatched = true;
    this.lastMatchedTick = 0;
    this.resyncCount = 0;
    this.rttMs = 0;
    this.pendingHostResync = false;
    this.localInputs.clear();
    this.remoteInputs.clear();
    this.localHashes.clear();
    this.remoteHashes.clear();
    this.emitStats();
  }

  markPeerReady(baseTick: number, initialHash: string): void {
    if (!this.role) return;
    const wasReady = this.peerReady;
    this.peerReady = true;
    if (!wasReady) {
      this.resetQueuesAtTick(baseTick, initialHash);
      this.syncStatus = 'SYNCED';
      this.sendPingNow();
      this.emitStats();
    }
  }

  resetQueuesAtTick(baseTick: number, hash = ''): void {
    this.localInputs.clear();
    this.remoteInputs.clear();
    this.localHashes.clear();
    this.remoteHashes.clear();

    this.localTick = baseTick;
    this.remoteTick = Math.max(this.remoteTick, baseTick);
    this.localHash = hash;
    if (hash) {
      this.localHashes.set(baseTick, hash);
    }

    // Pre-seed initial delay window ticks identically on both Host and Client
    // so both start stepping smoothly without stalling on tick 0.
    for (let i = 0; i < INPUT_DELAY_TICKS; i++) {
      this.localInputs.set(baseTick + i, createEmptyPlayerInput());
      this.remoteInputs.set(baseTick + i, createEmptyPlayerInput());
    }
    this.nextSendTick = baseTick + INPUT_DELAY_TICKS;
  }

  getStats(): CoopSyncStats {
    return {
      role: this.role,
      syncStatus: this.syncStatus,
      peerReady: this.peerReady,
      rttMs: this.rttMs,
      remoteTick: this.remoteTick,
      localTick: this.localTick,
      remoteHash: this.remoteHash,
      localHash: this.localHash,
      hashMatched: this.hashMatched,
      resyncCount: this.resyncCount,
      lastMatchedTick: this.lastMatchedTick,
    };
  }

  isPeerReady(): boolean {
    return this.peerReady;
  }

  /**
   * Queues local input for future target tick `(currentTick + INPUT_DELAY_TICKS)`
   * and transmits it to the remote peer.
   */
  queueLocalInput(currentTick: number, input: PlayerInput, currentHash: string): void {
    if (!this.role || !this.peerReady) return;

    this.localHash = currentHash;
    const targetEndTick = currentTick + INPUT_DELAY_TICKS;
    if (this.nextSendTick < currentTick) {
      this.nextSendTick = currentTick;
    }

    while (this.nextSendTick <= targetEndTick) {
      const sendTick = this.nextSendTick;
      const cloned = clonePlayerInput(input);
      this.localInputs.set(sendTick, cloned);
      this.callbacks.sendPacket({
        type: 'input',
        tick: sendTick,
        role: this.role,
        input: cloned,
        hash: currentHash,
      });
      this.nextSendTick += 1;
    }

    this.maybeSendPing();
  }

  /**
   * Returns a synchronized 50 Hz `InputFrame` for `tick` once both local and remote
   * inputs are available. Returns `null` if waiting on remote input (never steps out of lockstep).
   */
  consumeTickFrame(tick: number): InputFrame | null {
    if (!this.role || !this.peerReady) return null;

    const local = this.localInputs.get(tick);
    const remote = this.remoteInputs.get(tick);
    if (!local || !remote) {
      return null;
    }

    const frame = createEmptyInputFrame(tick);
    if (this.role === 'host') {
      frame.p1 = clonePlayerInput(local);
      frame.p2 = clonePlayerInput(remote);
    } else {
      frame.p1 = clonePlayerInput(remote);
      frame.p2 = clonePlayerInput(local);
    }

    // Prune inputs older than retransmit window
    const pruneBefore = tick - RETRANSMIT_WINDOW_TICKS;
    for (const k of this.localInputs.keys()) {
      if (k < pruneBefore) this.localInputs.delete(k);
    }
    this.remoteInputs.delete(tick);

    return frame;
  }

  /**
   * Called immediately after `stepSim` completes a deterministic tick.
   * Records FNV-1a hash history, emits periodic `state_ack`, and dispatches Host
   * `state_resync` snapshots if hash divergence was detected.
   */
  recordCompletedTick(tick: number, hash: string, authoritativeState?: SimState): void {
    if (!this.role || !this.peerReady) return;

    this.localTick = tick;
    this.localHash = hash;
    this.localHashes.set(tick, hash);
    this.pruneHashMap(this.localHashes, tick);

    if (tick % ACK_INTERVAL_TICKS === 0 || this.syncStatus === 'RESYNCING') {
      this.callbacks.sendPacket({
        type: 'state_ack',
        tick,
        hash,
      });
    }

    // Compare against remote hash if already received for this exact tick
    const remoteHashAtTick = this.remoteHashes.get(tick);
    if (remoteHashAtTick) {
      this.evaluateHashPair(tick, hash, remoteHashAtTick);
    }

    // If Host has a pending resync request (from hash mismatch), transmit snapshot
    if (this.role === 'host' && this.pendingHostResync && authoritativeState) {
      this.sendHostResyncSnapshot(authoritativeState);
    }
  }

  /**
   * Authoritatively broadcasts Host's current SimState snapshot to Client and aligns queues.
   */
  sendHostResyncSnapshot(state: SimState, force = false): void {
    if (this.role !== 'host' || !this.peerReady) return;
    const now = nowMs();
    if (!force && now - this.lastResyncSentMs < RESYNC_COOLDOWN_MS) {
      return;
    }
    this.lastResyncSentMs = now;
    this.pendingHostResync = false;
    this.resyncCount += 1;

    const snapshot = createSimResyncSnapshot(state);
    this.callbacks.sendPacket({
      type: 'state_resync',
      tick: state.tick,
      snapshot,
    });
    this.resetQueuesAtTick(state.tick, this.localHash);
    this.emitStats();
  }

  /**
   * Gently re-broadcasts recent local inputs when stalled waiting on a peer tick.
   */
  pumpRetransmit(currentTick: number): void {
    if (!this.role || !this.peerReady) return;
    const now = nowMs();
    if (now - this.lastRetransmitMs < RETRANSMIT_COOLDOWN_MS) return;
    this.lastRetransmitMs = now;

    const maxTick = Math.max(currentTick + INPUT_DELAY_TICKS, this.nextSendTick - 1);
    for (let t = Math.max(0, currentTick); t <= maxTick; t++) {
      const inp = this.localInputs.get(t);
      if (inp) {
        this.callbacks.sendPacket({
          type: 'input',
          tick: t,
          role: this.role,
          input: inp,
          hash: this.localHash,
        });
      }
    }
    this.maybeSendPing();
  }

  /**
   * Handles any incoming `NetSyncPacket` from BroadcastCoop or WebRtcCoop.
   */
  handlePacket(packet: NetSyncPacket): void {
    if (!this.role) return;

    switch (packet.type) {
      case 'hello': {
        if (packet.role === this.role) return;
        this.callbacks.onHandshakeHello?.(packet);
        return;
      }

      case 'input': {
        if (packet.role === this.role) return;
        this.remoteInputs.set(packet.tick, clonePlayerInput(packet.input));
        if (packet.tick > this.remoteTick) {
          this.remoteTick = packet.tick;
        }
        if (packet.hash) {
          this.remoteHash = packet.hash;
        }
        this.callbacks.onPeerInputArrived?.(packet.tick);
        return;
      }

      case 'state_ack': {
        if (packet.tick > this.remoteTick) {
          this.remoteTick = packet.tick;
        }
        this.remoteHash = packet.hash;
        this.remoteHashes.set(packet.tick, packet.hash);
        this.pruneHashMap(this.remoteHashes, packet.tick);

        const localHashAtTick = this.localHashes.get(packet.tick);
        if (localHashAtTick) {
          this.evaluateHashPair(packet.tick, localHashAtTick, packet.hash);
        } else {
          this.emitStats();
        }
        return;
      }

      case 'state_resync': {
        if (this.role !== 'client') return;
        this.syncStatus = 'RESYNCING';
        this.resyncCount += 1;
        this.callbacks.onApplyResync?.(packet.tick, packet.snapshot);
        // After GameApp applies snapshot & computes new hash, it calls confirmClientResync()
        this.emitStats();
        return;
      }

      case 'ping': {
        this.callbacks.sendPacket({ type: 'pong', ts: packet.ts });
        return;
      }

      case 'pong': {
        const elapsed = Math.max(0, Math.round(nowMs() - packet.ts));
        this.rttMs = this.rttMs === 0 ? elapsed : Math.round(this.rttMs * 0.7 + elapsed * 0.3);
        this.emitStats();
        return;
      }
    }
  }

  /**
   * Called by Client immediately after applying an authoritative Host `state_resync` snapshot.
   */
  confirmClientResync(tick: number, newHash: string): void {
    this.resetQueuesAtTick(tick, newHash);
    this.hashMatched = true;
    this.lastMatchedTick = tick;
    this.syncStatus = 'SYNCED';
    this.callbacks.sendPacket({
      type: 'state_ack',
      tick,
      hash: newHash,
    });
    this.emitStats();
  }

  private evaluateHashPair(tick: number, localHash: string, remoteHash: string): void {
    if (localHash === remoteHash) {
      this.hashMatched = true;
      this.lastMatchedTick = Math.max(this.lastMatchedTick, tick);
      this.pendingHostResync = false;
      this.syncStatus = 'SYNCED';
    } else {
      this.hashMatched = false;
      this.syncStatus = 'RESYNCING';
      if (this.role === 'host') {
        this.pendingHostResync = true;
      }
    }
    this.emitStats();
  }

  private maybeSendPing(): void {
    const now = nowMs();
    if (now - this.lastPingSentMs >= PING_INTERVAL_MS) {
      this.sendPingNow();
    }
  }

  private sendPingNow(): void {
    this.lastPingSentMs = nowMs();
    this.callbacks.sendPacket({ type: 'ping', ts: this.lastPingSentMs });
  }

  private pruneHashMap(map: Map<number, string>, latestTick: number): void {
    if (map.size <= HASH_HISTORY_LIMIT) return;
    const cutoff = latestTick - HASH_HISTORY_LIMIT;
    for (const k of map.keys()) {
      if (k < cutoff) {
        map.delete(k);
      }
    }
  }

  private emitStats(): void {
    this.callbacks.onStatsChange?.(this.getStats());
  }
}
