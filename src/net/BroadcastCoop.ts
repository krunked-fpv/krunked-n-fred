// ============================================================================
// Krunked & Fred — Instant Dual-Tab Online Co-Op via BroadcastChannel
// Same-origin zero-backend transport: Host listens for Client `hello`,
// replies with `hello` + seed/mode/levelId, and both tabs lock into
// synchronized 50 Hz co-op immediately.
// ============================================================================

import type { GameMode, NetSyncPacket } from '../contracts';

export type CoopRole = 'host' | 'client';
export type NetTransportStatus = 'idle' | 'waiting' | 'connected' | 'error';

export interface CoopHandshakeInfo {
  seed: number;
  mode: GameMode;
  levelId: string;
}

export const DEFAULT_BROADCAST_CHANNEL = 'krunked-n-fred-coop';
const HELLO_RETRY_INTERVAL_MS = 250;

export function isNetSyncPacket(raw: unknown): raw is NetSyncPacket {
  if (typeof raw !== 'object' || raw === null) return false;
  const obj = raw as Record<string, unknown>;
  switch (obj.type) {
    case 'hello':
      return (
        (obj.role === 'host' || obj.role === 'client') &&
        typeof obj.seed === 'number' &&
        typeof obj.mode === 'string' &&
        typeof obj.levelId === 'string'
      );
    case 'input':
      return (
        typeof obj.tick === 'number' &&
        (obj.role === 'host' || obj.role === 'client') &&
        typeof obj.input === 'object' &&
        obj.input !== null &&
        typeof obj.hash === 'string'
      );
    case 'state_ack':
      return typeof obj.tick === 'number' && typeof obj.hash === 'string';
    case 'state_resync':
      return (
        typeof obj.tick === 'number' &&
        typeof obj.snapshot === 'object' &&
        obj.snapshot !== null
      );
    case 'ping':
    case 'pong':
      return typeof obj.ts === 'number';
    default:
      return false;
  }
}

export class BroadcastCoop {
  private channel: BroadcastChannel | null = null;
  private channelName: string = DEFAULT_BROADCAST_CHANNEL;
  private role: CoopRole | null = null;
  private status: NetTransportStatus = 'idle';
  private errorMessage: string | null = null;
  private handshake: CoopHandshakeInfo = {
    seed: 1337,
    mode: 'online_coop',
    levelId: 'vertical-slice',
  };

  private helloTimer: ReturnType<typeof setInterval> | null = null;
  private readonly packetListeners = new Set<(packet: NetSyncPacket) => void>();
  private readonly statusListeners = new Set<(status: NetTransportStatus, error?: string) => void>();

  getStatus(): NetTransportStatus {
    return this.status;
  }

  getRole(): CoopRole | null {
    return this.role;
  }

  getChannelName(): string {
    return this.channelName;
  }

  getError(): string | null {
    return this.errorMessage;
  }

  getHandshake(): CoopHandshakeInfo {
    return { ...this.handshake };
  }

  open(role: CoopRole, channelName?: string, handshake?: CoopHandshakeInfo): void {
    this.close();

    const safeName = (channelName ?? '').trim() || DEFAULT_BROADCAST_CHANNEL;
    this.channelName = safeName;
    this.role = role;
    this.errorMessage = null;
    if (handshake) {
      this.handshake = { ...handshake };
    }

    if (typeof BroadcastChannel === 'undefined') {
      this.setStatus('error', 'BroadcastChannel is not supported in this browser.');
      return;
    }

    try {
      const ch = new BroadcastChannel(safeName);
      this.channel = ch;
      ch.onmessage = (ev: MessageEvent) => {
        this.handleRawMessage(ev.data);
      };
      ch.onmessageerror = () => {
        this.setStatus('error', 'BroadcastChannel message deserialization error.');
      };

      this.setStatus('waiting');
      this.sendHello();

      // Periodically announce presence while waiting so either tab can open first
      this.helloTimer = setInterval(() => {
        if (this.status === 'waiting') {
          this.sendHello();
        } else {
          this.stopHelloTimer();
        }
      }, HELLO_RETRY_INTERVAL_MS);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to open BroadcastChannel.';
      this.setStatus('error', msg);
    }
  }

  updateHandshake(handshake: CoopHandshakeInfo): void {
    this.handshake = { ...handshake };
  }

  sendPacket(packet: NetSyncPacket): boolean {
    if (!this.channel || this.status === 'idle' || this.status === 'error') {
      return false;
    }
    try {
      this.channel.postMessage(packet);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send BroadcastChannel packet.';
      this.setStatus('error', msg);
      return false;
    }
  }

  onPacket(listener: (packet: NetSyncPacket) => void): () => void {
    this.packetListeners.add(listener);
    return () => {
      this.packetListeners.delete(listener);
    };
  }

  onStatusChange(listener: (status: NetTransportStatus, error?: string) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  close(): void {
    this.stopHelloTimer();
    if (this.channel) {
      try {
        this.channel.onmessage = null;
        this.channel.onmessageerror = null;
        this.channel.close();
      } catch {
        // Ignore close errors
      }
      this.channel = null;
    }
    this.role = null;
    this.errorMessage = null;
    if (this.status !== 'idle') {
      this.setStatus('idle');
    }
  }

  private sendHello(): void {
    if (!this.role) return;
    this.sendPacket({
      type: 'hello',
      role: this.role,
      seed: this.handshake.seed,
      mode: this.handshake.mode,
      levelId: this.handshake.levelId,
    });
  }

  private handleRawMessage(raw: unknown): void {
    if (!isNetSyncPacket(raw)) return;
    if (!this.role) return;

    // Ignore stray echoes from same role
    if ((raw.type === 'hello' || raw.type === 'input') && raw.role === this.role) {
      return;
    }

    if (raw.type === 'hello') {
      if (this.role === 'host' && raw.role === 'client') {
        // Host replies immediately with canonical seed/mode/levelId
        this.sendHello();
        if (this.status !== 'connected') {
          this.stopHelloTimer();
          this.setStatus('connected');
        }
      } else if (this.role === 'client' && raw.role === 'host') {
        const wasWaiting = this.status !== 'connected';
        this.handshake = {
          seed: raw.seed,
          mode: raw.mode,
          levelId: raw.levelId,
        };
        if (wasWaiting) {
          this.stopHelloTimer();
          this.setStatus('connected');
          // Acknowledge back so host also locks in immediately if host opened second
          this.sendHello();
        }
      }
    } else if (this.status === 'waiting') {
      // Any valid peer packet while waiting indicates peer is already live
      this.stopHelloTimer();
      this.setStatus('connected');
    }

    for (const listener of this.packetListeners) {
      listener(raw);
    }
  }

  private stopHelloTimer(): void {
    if (this.helloTimer !== null) {
      clearInterval(this.helloTimer);
      this.helloTimer = null;
    }
  }

  private setStatus(next: NetTransportStatus, error?: string): void {
    this.status = next;
    this.errorMessage = next === 'error' ? (error ?? 'BroadcastChannel error') : null;
    for (const listener of this.statusListeners) {
      listener(next, this.errorMessage ?? undefined);
    }
  }
}
