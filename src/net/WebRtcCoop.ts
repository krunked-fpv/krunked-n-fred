// ============================================================================
// Krunked & Fred — Zero-Backend WebRTC DataChannel P2P Co-Op
// Uses RTCPeerConnection + RTCDataChannel('krunked-coop') with compressed
// base64url SDP Offer/Answer Room Codes and a clean 2.5s ICE gather timeout.
// ============================================================================

import type { NetSyncPacket } from '../contracts';
import {
  isNetSyncPacket,
  type CoopHandshakeInfo,
  type CoopRole,
  type NetTransportStatus,
} from './BroadcastCoop';

export const WEBRTC_DATA_CHANNEL_NAME = 'krunked-coop';
export const ICE_GATHER_TIMEOUT_MS = 2500;

const ROOM_CODE_DEFLATE_PREFIX = 'KF1Z.';
const ROOM_CODE_RAW_PREFIX = 'KF1R.';

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

interface RoomCodePayload {
  t: 'o' | 'a';
  s: string;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  const b64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(str: string): Uint8Array {
  const cleaned = str.trim().replace(/-/g, '+').replace(/_/g, '/');
  const pad = cleaned.length % 4 === 0 ? '' : '='.repeat(4 - (cleaned.length % 4));
  const padded = cleaned + pad;
  if (typeof atob === 'function') {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

async function compressDeflateRaw(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    await writer.write(copy);
    await writer.close();
    const res = new Response(cs.readable);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

async function decompressDeflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DecompressionStream is unavailable in this browser.');
  }
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  await writer.write(copy);
  await writer.close();
  const res = new Response(ds.readable);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export async function encodeSdpRoomCode(desc: RTCSessionDescriptionInit): Promise<string> {
  if ((desc.type !== 'offer' && desc.type !== 'answer') || !desc.sdp) {
    throw new Error('Invalid RTCSessionDescription for room code encoding.');
  }
  const payload: RoomCodePayload = {
    t: desc.type === 'offer' ? 'o' : 'a',
    s: desc.sdp,
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(payload));
  const compressed = await compressDeflateRaw(jsonBytes);
  if (compressed && compressed.length < jsonBytes.length) {
    return `${ROOM_CODE_DEFLATE_PREFIX}${bytesToBase64Url(compressed)}`;
  }
  return `${ROOM_CODE_RAW_PREFIX}${bytesToBase64Url(jsonBytes)}`;
}

export async function decodeSdpRoomCode(code: string): Promise<RTCSessionDescriptionInit> {
  const trimmed = code.trim().replace(/\s+/g, '');
  if (!trimmed) {
    throw new Error('Room code is empty.');
  }

  let jsonText: string;
  if (trimmed.startsWith(ROOM_CODE_DEFLATE_PREFIX)) {
    const rawBytes = base64UrlToBytes(trimmed.slice(ROOM_CODE_DEFLATE_PREFIX.length));
    const inflated = await decompressDeflateRaw(rawBytes);
    jsonText = new TextDecoder().decode(inflated);
  } else if (trimmed.startsWith(ROOM_CODE_RAW_PREFIX)) {
    const rawBytes = base64UrlToBytes(trimmed.slice(ROOM_CODE_RAW_PREFIX.length));
    jsonText = new TextDecoder().decode(rawBytes);
  } else if (trimmed.startsWith('{')) {
    jsonText = trimmed;
  } else {
    const rawBytes = base64UrlToBytes(trimmed);
    jsonText = new TextDecoder().decode(rawBytes);
  }

  const parsed: unknown = JSON.parse(jsonText);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Malformed room code payload.');
  }
  const obj = parsed as Record<string, unknown>;
  const typeVal =
    obj.t === 'o' || obj.type === 'offer'
      ? 'offer'
      : obj.t === 'a' || obj.type === 'answer'
        ? 'answer'
        : null;
  const sdpVal = typeof obj.s === 'string' ? obj.s : typeof obj.sdp === 'string' ? obj.sdp : null;

  if (!typeVal || !sdpVal) {
    throw new Error('Room code missing SDP type or content.');
  }
  return { type: typeVal, sdp: sdpVal };
}

function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = ICE_GATHER_TIMEOUT_MS): Promise<void> {
  if (pc.iceGatheringState === 'complete') {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange', onStateChange);
      pc.removeEventListener('icecandidate', onCandidate);
      resolve();
    };
    const onStateChange = () => {
      if (pc.iceGatheringState === 'complete') {
        finish();
      }
    };
    const onCandidate = (ev: RTCPeerConnectionIceEvent) => {
      if (ev.candidate === null) {
        finish();
      }
    };
    const timer = setTimeout(finish, timeoutMs);
    pc.addEventListener('icegatheringstatechange', onStateChange);
    pc.addEventListener('icecandidate', onCandidate);
  });
}

export class WebRtcCoop {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private role: CoopRole | null = null;
  private status: NetTransportStatus = 'idle';
  private errorMessage: string | null = null;
  private localCode = '';
  private handshake: CoopHandshakeInfo = {
    seed: 1337,
    mode: 'online_coop',
    levelId: 'vertical-slice',
  };

  private readonly packetListeners = new Set<(packet: NetSyncPacket) => void>();
  private readonly statusListeners = new Set<(status: NetTransportStatus, error?: string) => void>();

  getStatus(): NetTransportStatus {
    return this.status;
  }

  getRole(): CoopRole | null {
    return this.role;
  }

  getError(): string | null {
    return this.errorMessage;
  }

  getLocalCode(): string {
    return this.localCode;
  }

  updateHandshake(handshake: CoopHandshakeInfo): void {
    this.handshake = { ...handshake };
  }

  async createOfferCode(handshake?: CoopHandshakeInfo): Promise<string> {
    this.close();
    if (handshake) {
      this.handshake = { ...handshake };
    }
    this.role = 'host';

    if (typeof RTCPeerConnection === 'undefined') {
      const msg = 'WebRTC RTCPeerConnection is unavailable in this environment.';
      this.setStatus('error', msg);
      throw new Error(msg);
    }

    try {
      this.setStatus('waiting');
      const pc = new RTCPeerConnection({ iceServers: DEFAULT_ICE_SERVERS });
      this.pc = pc;
      this.wirePeerConnectionEvents(pc);

      const dc = pc.createDataChannel(WEBRTC_DATA_CHANNEL_NAME, { ordered: true });
      this.attachDataChannel(dc);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGathering(pc, ICE_GATHER_TIMEOUT_MS);

      const localDesc = pc.localDescription ?? offer;
      const code = await encodeSdpRoomCode({
        type: localDesc.type,
        sdp: localDesc.sdp,
      });
      this.localCode = code;
      return code;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create WebRTC offer code.';
      this.setStatus('error', msg);
      throw err;
    }
  }

  async acceptAnswerCode(answerCode: string): Promise<void> {
    if (!this.pc || this.role !== 'host') {
      const msg = 'Create an Offer Code first before accepting an Answer Code.';
      this.setStatus('error', msg);
      throw new Error(msg);
    }

    try {
      const desc = await decodeSdpRoomCode(answerCode);
      if (desc.type !== 'answer') {
        throw new Error('Expected an Answer Room Code from the Client.');
      }
      await this.pc.setRemoteDescription(desc);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid WebRTC Answer Room Code.';
      this.setStatus('error', msg);
      throw err;
    }
  }

  async acceptOfferAndCreateAnswer(offerCode: string, handshake?: CoopHandshakeInfo): Promise<string> {
    this.close();
    if (handshake) {
      this.handshake = { ...handshake };
    }
    this.role = 'client';

    if (typeof RTCPeerConnection === 'undefined') {
      const msg = 'WebRTC RTCPeerConnection is unavailable in this environment.';
      this.setStatus('error', msg);
      throw new Error(msg);
    }

    try {
      const offerDesc = await decodeSdpRoomCode(offerCode);
      if (offerDesc.type !== 'offer') {
        throw new Error('Expected an Offer Room Code from the Host.');
      }

      this.setStatus('waiting');
      const pc = new RTCPeerConnection({ iceServers: DEFAULT_ICE_SERVERS });
      this.pc = pc;
      this.wirePeerConnectionEvents(pc);

      pc.ondatachannel = (ev: RTCDataChannelEvent) => {
        if (ev.channel) {
          this.attachDataChannel(ev.channel);
        }
      };

      await pc.setRemoteDescription(offerDesc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitForIceGathering(pc, ICE_GATHER_TIMEOUT_MS);

      const localDesc = pc.localDescription ?? answer;
      const code = await encodeSdpRoomCode({
        type: localDesc.type,
        sdp: localDesc.sdp,
      });
      this.localCode = code;
      return code;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create WebRTC Answer Code.';
      this.setStatus('error', msg);
      throw err;
    }
  }

  sendPacket(packet: NetSyncPacket): boolean {
    if (!this.dc || this.dc.readyState !== 'open') {
      return false;
    }
    try {
      this.dc.send(JSON.stringify(packet));
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send DataChannel packet.';
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
    if (this.dc) {
      try {
        this.dc.onopen = null;
        this.dc.onmessage = null;
        this.dc.onclose = null;
        this.dc.onerror = null;
        this.dc.close();
      } catch {
        // Ignore close errors
      }
      this.dc = null;
    }
    if (this.pc) {
      try {
        this.pc.ondatachannel = null;
        this.pc.onconnectionstatechange = null;
        this.pc.oniceconnectionstatechange = null;
        this.pc.close();
      } catch {
        // Ignore close errors
      }
      this.pc = null;
    }
    this.role = null;
    this.localCode = '';
    this.errorMessage = null;
    if (this.status !== 'idle') {
      this.setStatus('idle');
    }
  }

  private wirePeerConnectionEvents(pc: RTCPeerConnection): void {
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) return;
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        if (this.status === 'connected') {
          this.setStatus('error', `Peer connection ${pc.connectionState}.`);
        }
      }
    };
    pc.oniceconnectionstatechange = () => {
      if (this.pc !== pc) return;
      if (pc.iceConnectionState === 'failed') {
        this.setStatus('error', 'WebRTC ICE negotiation failed.');
      }
    };
  }

  private attachDataChannel(dc: RTCDataChannel): void {
    this.dc = dc;
    dc.onopen = () => {
      if (this.dc !== dc) return;
      this.setStatus('connected');
      if (this.role) {
        this.sendPacket({
          type: 'hello',
          role: this.role,
          seed: this.handshake.seed,
          mode: this.handshake.mode,
          levelId: this.handshake.levelId,
        });
      }
    };
    dc.onmessage = (ev: MessageEvent) => {
      if (this.dc !== dc || typeof ev.data !== 'string') return;
      try {
        const parsed: unknown = JSON.parse(ev.data);
        if (!isNetSyncPacket(parsed)) return;
        if ((parsed.type === 'hello' || parsed.type === 'input') && parsed.role === this.role) {
          return;
        }
        if (parsed.type === 'hello' && this.role === 'host' && parsed.role === 'client') {
          this.sendPacket({
            type: 'hello',
            role: 'host',
            seed: this.handshake.seed,
            mode: this.handshake.mode,
            levelId: this.handshake.levelId,
          });
        }
        for (const listener of this.packetListeners) {
          listener(parsed);
        }
      } catch {
        // Ignore malformed packet
      }
    };
    dc.onclose = () => {
      if (this.dc !== dc) return;
      if (this.status === 'connected') {
        this.setStatus('idle');
      }
    };
    dc.onerror = () => {
      if (this.dc !== dc) return;
      this.setStatus('error', 'WebRTC DataChannel transport error.');
    };
  }

  private setStatus(next: NetTransportStatus, error?: string): void {
    this.status = next;
    this.errorMessage = next === 'error' ? (error ?? 'WebRTC error') : null;
    for (const listener of this.statusListeners) {
      listener(next, this.errorMessage ?? undefined);
    }
  }
}
