// ============================================================================
// Krunked & Fred — Unified Zero-Backend Online Co-Op Manager
// Combines BroadcastCoop (Instant Dual-Tab) + WebRtcCoop (Room Code P2P)
// + CoopSync (Deterministic 50 Hz Input Exchange & Authoritative Resync).
// ============================================================================

import type { InputFrame, NetSyncPacket, PlayerInput, SimState } from '../contracts';
import {
  BroadcastCoop,
  DEFAULT_BROADCAST_CHANNEL,
  type CoopHandshakeInfo,
  type CoopRole,
  type NetTransportStatus,
} from './BroadcastCoop';
import {
  CoopSync,
  applySimResyncSnapshot,
  createSimResyncSnapshot,
  type CoopSyncStats,
  type SyncStatus,
} from './CoopSync';
import { WebRtcCoop } from './WebRtcCoop';

export {
  BroadcastCoop,
  DEFAULT_BROADCAST_CHANNEL,
  isNetSyncPacket,
  type CoopHandshakeInfo,
  type CoopRole,
  type NetTransportStatus,
} from './BroadcastCoop';
export {
  CoopSync,
  applySimResyncSnapshot,
  createSimResyncSnapshot,
  type CoopSyncStats,
  type SyncStatus,
} from './CoopSync';
export {
  ICE_GATHER_TIMEOUT_MS,
  WEBRTC_DATA_CHANNEL_NAME,
  WebRtcCoop,
  decodeSdpRoomCode,
  encodeSdpRoomCode,
} from './WebRtcCoop';

export type NetTransportKind = 'none' | 'broadcast' | 'webrtc';

export interface OnlineCoopStatusSnapshot {
  active: boolean;
  transport: NetTransportKind;
  role: CoopRole | null;
  transportStatus: NetTransportStatus;
  syncStatus: SyncStatus;
  peerReady: boolean;
  channelName: string;
  localRoomCode: string;
  rttMs: number;
  remoteTick: number;
  localTick: number;
  remoteHash: string;
  localHash: string;
  hashMatched: boolean;
  resyncCount: number;
  error: string | null;
  summaryString: string;
}

export interface OnlineCoopManagerCallbacks {
  onPeerConnected?: (role: CoopRole, handshake: CoopHandshakeInfo) => void;
  onApplyResync?: (tick: number, snapshot: Partial<SimState>) => void;
  onPeerInputArrived?: (tick: number) => void;
  onStatusChange?: (snapshot: OnlineCoopStatusSnapshot) => void;
}

export class OnlineCoopManager {
  private readonly broadcast = new BroadcastCoop();
  private readonly webrtc = new WebRtcCoop();
  private readonly sync: CoopSync;
  private readonly callbacks: OnlineCoopManagerCallbacks;

  private activeTransport: NetTransportKind = 'none';
  private activeRole: CoopRole | null = null;
  private channelName: string = DEFAULT_BROADCAST_CHANNEL;
  private handshake: CoopHandshakeInfo = {
    seed: 1337,
    mode: 'online_coop',
    levelId: 'vertical-slice',
  };
  private connectedNotified = false;

  private readonly unsubs: Array<() => void> = [];

  constructor(callbacks: OnlineCoopManagerCallbacks = {}) {
    this.callbacks = callbacks;

    this.sync = new CoopSync({
      sendPacket: (packet) => this.sendViaActiveTransport(packet),
      onHandshakeHello: (packet) => this.handlePeerHello(packet),
      onApplyResync: (tick, snapshot) => {
        this.callbacks.onApplyResync?.(tick, snapshot);
      },
      onPeerInputArrived: (tick) => {
        this.callbacks.onPeerInputArrived?.(tick);
      },
      onStatsChange: () => {
        this.emitStatus();
      },
    });

    this.unsubs.push(
      this.broadcast.onPacket((pkt) => {
        if (this.activeTransport === 'broadcast') {
          this.sync.handlePacket(pkt);
        }
      }),
      this.broadcast.onStatusChange((status) => {
        if (this.activeTransport === 'broadcast') {
          if (status === 'connected' && this.activeRole) {
            this.handshake = this.broadcast.getHandshake();
            this.notifyConnectedOnce(this.handshake);
          }
          this.emitStatus();
        }
      }),
      this.webrtc.onPacket((pkt) => {
        if (this.activeTransport === 'webrtc') {
          this.sync.handlePacket(pkt);
        }
      }),
      this.webrtc.onStatusChange((status) => {
        if (this.activeTransport === 'webrtc') {
          if (status === 'connected' && this.activeRole) {
            this.notifyConnectedOnce(this.handshake);
          }
          this.emitStatus();
        }
      }),
    );
  }

  /**
   * Mode A: Instant Dual-Tab Co-Op over same-origin `BroadcastChannel`.
   */
  connectBroadcast(
    role: CoopRole,
    channelName = DEFAULT_BROADCAST_CHANNEL,
    handshake?: CoopHandshakeInfo,
    baseTick = 0,
    initialHash = '',
  ): void {
    this.disconnect();
    this.activeTransport = 'broadcast';
    this.activeRole = role;
    this.channelName = (channelName ?? '').trim() || DEFAULT_BROADCAST_CHANNEL;
    this.connectedNotified = false;
    if (handshake) {
      this.handshake = { ...handshake };
    }

    this.sync.startSession(role, baseTick, initialHash);
    this.broadcast.open(role, this.channelName, this.handshake);
    this.emitStatus();
  }

  /**
   * Mode B (Host step 1): Creates a compressed base64url WebRTC Offer Room Code.
   */
  async createWebRtcOffer(
    handshake?: CoopHandshakeInfo,
    baseTick = 0,
    initialHash = '',
  ): Promise<string> {
    this.disconnect();
    this.activeTransport = 'webrtc';
    this.activeRole = 'host';
    this.connectedNotified = false;
    if (handshake) {
      this.handshake = { ...handshake };
    }

    this.sync.startSession('host', baseTick, initialHash);
    const code = await this.webrtc.createOfferCode(this.handshake);
    this.emitStatus();
    return code;
  }

  /**
   * Mode B (Host step 2): Accepts the Client's compressed base64url Answer Room Code.
   */
  async acceptWebRtcAnswer(answerCode: string): Promise<void> {
    if (this.activeTransport !== 'webrtc' || this.activeRole !== 'host') {
      throw new Error('No active WebRTC Host offer waiting for an answer.');
    }
    await this.webrtc.acceptAnswerCode(answerCode);
    this.emitStatus();
  }

  /**
   * Mode B (Client step 1): Accepts Host's Offer Room Code & returns compressed Answer Room Code.
   */
  async acceptWebRtcOffer(
    offerCode: string,
    handshake?: CoopHandshakeInfo,
    baseTick = 0,
    initialHash = '',
  ): Promise<string> {
    this.disconnect();
    this.activeTransport = 'webrtc';
    this.activeRole = 'client';
    this.connectedNotified = false;
    if (handshake) {
      this.handshake = { ...handshake };
    }

    this.sync.startSession('client', baseTick, initialHash);
    const code = await this.webrtc.acceptOfferAndCreateAnswer(offerCode, this.handshake);
    this.emitStatus();
    return code;
  }

  isActive(): boolean {
    return this.activeTransport !== 'none' && this.activeRole !== null;
  }

  isPeerConnected(): boolean {
    return this.isActive() && this.sync.isPeerReady();
  }

  getRole(): CoopRole | null {
    return this.activeRole;
  }

  getTransport(): NetTransportKind {
    return this.activeTransport;
  }

  getSyncStats(): CoopSyncStats {
    return this.sync.getStats();
  }

  getStatusSnapshot(): OnlineCoopStatusSnapshot {
    const stats = this.sync.getStats();
    const transportStatus: NetTransportStatus =
      this.activeTransport === 'broadcast'
        ? this.broadcast.getStatus()
        : this.activeTransport === 'webrtc'
          ? this.webrtc.getStatus()
          : 'idle';
    const error =
      this.activeTransport === 'broadcast'
        ? this.broadcast.getError()
        : this.activeTransport === 'webrtc'
          ? this.webrtc.getError()
          : null;
    const localRoomCode = this.activeTransport === 'webrtc' ? this.webrtc.getLocalCode() : '';

    let summaryString = 'offline';
    if (this.activeTransport !== 'none' && this.activeRole) {
      const stateTag = error
        ? 'error'
        : stats.peerReady
          ? `${stats.syncStatus.toLowerCase()}:${stats.rttMs}ms`
          : transportStatus;
      summaryString =
        this.activeTransport === 'broadcast'
          ? `${this.activeRole}:${this.channelName}:${stateTag}`
          : `webrtc:${this.activeRole}:${stateTag}`;
    }

    return {
      active: this.isActive(),
      transport: this.activeTransport,
      role: this.activeRole,
      transportStatus,
      syncStatus: stats.syncStatus,
      peerReady: stats.peerReady,
      channelName: this.channelName,
      localRoomCode,
      rttMs: stats.rttMs,
      remoteTick: stats.remoteTick,
      localTick: stats.localTick,
      remoteHash: stats.remoteHash,
      localHash: stats.localHash,
      hashMatched: stats.hashMatched,
      resyncCount: stats.resyncCount,
      error,
      summaryString,
    };
  }

  markPeerReadyAt(tick: number, hash: string): void {
    this.sync.markPeerReady(tick, hash);
  }

  queueLocalInput(currentTick: number, input: PlayerInput, currentHash: string): void {
    this.sync.queueLocalInput(currentTick, input, currentHash);
  }

  consumeTickFrame(tick: number): InputFrame | null {
    return this.sync.consumeTickFrame(tick);
  }

  recordCompletedTick(tick: number, hash: string, authoritativeState?: SimState): void {
    this.sync.recordCompletedTick(tick, hash, authoritativeState);
  }

  sendHostResyncSnapshot(state: SimState, force = false): void {
    this.sync.sendHostResyncSnapshot(state, force);
  }

  confirmClientResync(tick: number, newHash: string): void {
    this.sync.confirmClientResync(tick, newHash);
  }

  pumpRetransmit(currentTick: number): void {
    this.sync.pumpRetransmit(currentTick);
  }

  disconnect(): void {
    this.broadcast.close();
    this.webrtc.close();
    this.sync.reset();
    this.activeTransport = 'none';
    this.activeRole = null;
    this.connectedNotified = false;
    this.emitStatus();
  }

  dispose(): void {
    this.disconnect();
    for (const unsub of this.unsubs) {
      unsub();
    }
    this.unsubs.length = 0;
  }

  private sendViaActiveTransport(packet: NetSyncPacket): boolean {
    if (this.activeTransport === 'broadcast') {
      return this.broadcast.sendPacket(packet);
    }
    if (this.activeTransport === 'webrtc') {
      return this.webrtc.sendPacket(packet);
    }
    return false;
  }

  private handlePeerHello(packet: Extract<NetSyncPacket, { type: 'hello' }>): void {
    if (!this.activeRole) return;
    if (this.activeRole === 'client' && packet.role === 'host') {
      this.handshake = {
        seed: packet.seed,
        mode: packet.mode,
        levelId: packet.levelId,
      };
    }
    this.notifyConnectedOnce(this.handshake);
  }

  private notifyConnectedOnce(info: CoopHandshakeInfo): void {
    if (!this.activeRole || this.connectedNotified) return;
    this.connectedNotified = true;
    this.callbacks.onPeerConnected?.(this.activeRole, info);
    this.emitStatus();
  }

  private emitStatus(): void {
    this.callbacks.onStatusChange?.(this.getStatusSnapshot());
  }
}
