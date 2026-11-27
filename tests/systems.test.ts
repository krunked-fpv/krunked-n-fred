import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_IDS,
  ACTION_STATES,
  CATALOG_COUNTS,
  COOP_SKINS,
  createEmptyPlayerInput,
  JEFF_SKINS,
  JUKEBOX_TRACKS,
  MANUAL_PAGE_IDS,
  PHOTO_IDS,
  ROPE_SKINS,
  TERRAIN_TYPES,
  TIME_TRIAL_MEDALS,
  type AudioSettings,
  type NetSyncPacket,
  type PlayerInput,
  type SimEvent,
} from '../src/contracts';
import {
  createDefaultSaveData,
  SAVE_STORAGE_KEY,
  SaveManager,
  validateSaveData,
} from '../src/app/SaveManager';
import { AudioEngine, createAudioEngine } from '../src/audio';
import {
  ACHIEVEMENT_CATALOG,
  COOP_SKIN_CATALOG,
  createSimHooks,
  getLevelByMode,
  JEFF_SKIN_CATALOG,
  JUKEBOX_TRACK_CATALOG,
  MANUAL_PAGE_CATALOG,
  PHOTO_CATALOG,
  ROPE_SKIN_CATALOG,
} from '../src/data';
import {
  applySimResyncSnapshot,
  CoopSync,
  decodeSdpRoomCode,
  encodeSdpRoomCode,
  isNetSyncPacket,
  WebRtcCoop,
} from '../src/net';
import {
  createSimState,
  evaluateSaveAchievements,
  gradeTimeTrialMedal,
  hashSimState,
  stepSim,
  updateProgression,
} from '../src/sim';

class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

function createMockAudioContextClass(): new () => AudioContext {
  const makeParam = (initial = 0) => ({
    value: initial,
    setValueAtTime: () => {},
    linearRampToValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
    setTargetAtTime: () => {},
    cancelScheduledValues: () => {},
  });

  const makeNode = () => ({
    connect: () => {},
    disconnect: () => {},
    gain: makeParam(1),
    frequency: makeParam(440),
    Q: makeParam(1),
    pan: makeParam(0),
    threshold: makeParam(-12),
    knee: makeParam(16),
    ratio: makeParam(6),
    attack: makeParam(0.004),
    release: makeParam(0.14),
    type: 'sine',
    loop: false,
    buffer: null as unknown,
    playbackRate: makeParam(1),
    onended: null as (() => void) | null,
    start: () => {},
    stop: () => {},
  });

  class MockAudioContext {
    currentTime = 1.0;
    sampleRate = 44100;
    state: AudioContextState = 'running';
    destination = makeNode();

    resume(): Promise<void> {
      this.state = 'running';
      return Promise.resolve();
    }

    close(): Promise<void> {
      this.state = 'closed';
      return Promise.resolve();
    }

    createGain() {
      return makeNode();
    }

    createOscillator() {
      return makeNode();
    }

    createBiquadFilter() {
      return makeNode();
    }

    createDynamicsCompressor() {
      return makeNode();
    }

    createStereoPanner() {
      return makeNode();
    }

    createBufferSource() {
      return makeNode();
    }

    createBuffer(_channels: number, length: number, sampleRate: number) {
      const buf = new Float32Array(length);
      return {
        length,
        sampleRate,
        duration: length / sampleRate,
        numberOfChannels: 1,
        getChannelData: () => buf,
      };
    }
  }

  return MockAudioContext as unknown as new () => AudioContext;
}

describe('Krunked & Fred — Systems, Persistence, Netcode, Audio, Medals & Progression', () => {
  describe('1. SaveManager Persistence, Validation & Recovery', () => {
    it('creates valid default schema and performs full write/read roundtrip', () => {
      const storage = new MemoryStorage();
      const sm = new SaveManager(SAVE_STORAGE_KEY, storage);
      const def = createDefaultSaveData();

      expect(sm.get()).toEqual(def);
      expect(sm.get().version).toBe(1);
      expect(sm.get().render.targetFps).toBe(120);

      sm.update((d) => {
        d.render.targetFps = 60;
        d.render.classic50HzSnap = true;
        d.audio.master = 0.5;
        d.audio.jukeboxTrack = 'Track5';
        d.assist.betterGrab = true;
        d.skins.p1 = 'Knight';
        d.skins.p2 = 'Robot';
        d.skins.jeff = 'Scuba';
        d.skins.rope = 'Super';
        d.keybinds.p1Jump = 'KeyW';
      });
      sm.unlockPhoto('Photo1');
      sm.unlockManual('Swing');
      sm.unlockAchievement('FirstSwing');
      sm.updateBestAltitude('coop_mountain', 245.76);
      sm.updateBestAltitude('solo_jeff', 180.4);
      sm.updateBestAltitude('lab_dlc', 661.0);
      sm.recordSealRescued();
      sm.recordSummit(true);
      sm.recordLabBossCleared();
      sm.recordTimeTrial('TT1', 64.2, 'platinum');

      // Reload from fresh SaveManager reading the same storage
      const reloaded = new SaveManager(SAVE_STORAGE_KEY, storage);
      const data = reloaded.get();

      expect(data.render.targetFps).toBe(60);
      expect(data.render.classic50HzSnap).toBe(true);
      expect(data.audio.master).toBe(0.5);
      expect(data.audio.jukeboxTrack).toBe('Track5');
      expect(data.assist.betterGrab).toBe(true);
      expect(data.skins).toEqual({ p1: 'Knight', p2: 'Robot', jeff: 'Scuba', rope: 'Super' });
      expect(data.keybinds.p1Jump).toBe('KeyW');
      expect(data.unlockedPhotos).toEqual(['Photo1']);
      expect(data.unlockedManual).toEqual(['Swing']);
      expect(data.unlockedAchievements).toEqual(['FirstSwing']);
      expect(data.bestAltitudeCoop).toBe(245.8);
      expect(data.bestAltitudeSolo).toBe(180.4);
      expect(data.bestAltitudeLab).toBe(661.0);
      expect(data.sealsRescued).toBe(1);
      expect(data.summitsCleared).toBe(1);
      expect(data.noAssistCleared).toBe(true);
      expect(data.labBossCleared).toBe(true);
      expect(data.timeTrialBest.TT1).toEqual({ timeSec: 64.2, medal: 'platinum' });
    });

    it('recovers cleanly from corrupt JSON and sanitizes partial/out-of-range fields and reset()', () => {
      const storage = new MemoryStorage();
      storage.setItem(SAVE_STORAGE_KEY, '{not valid json!!!');

      const recovered = new SaveManager(SAVE_STORAGE_KEY, storage);
      expect(recovered.get()).toEqual(createDefaultSaveData());

      // Sanitize partial/corrupt/out-of-range payload
      const sanitized = validateSaveData({
        version: 99,
        render: { targetFps: 999, packSource: 'bogus', touchMode: 'invalid', showFps: 'yes' },
        audio: { master: 5.0, music: -2.0, sfx: Number.NaN, jukeboxTrack: 'UnknownTrack' },
        skins: { p1: 'NonExistent', p2: 'Fish', jeff: 'FakeRock', rope: 'Knight' },
        unlockedPhotos: ['Photo1', 'Photo1', 'FakePhoto', 42],
        unlockedManual: ['Ice', 'Ice', 'BadManual'],
        unlockedAchievements: ['FirstSteps', 'NotReal', 'FirstSteps'],
        timeTrialBest: {
          TT1: { timeSec: 65, medal: 'platinum' },
          TT2: { timeSec: -5, medal: 'gold' },
          TT3: { timeSec: 50, medal: 'diamond' },
        },
        bestAltitudeCoop: -100,
        bestAltitudeSolo: Number.POSITIVE_INFINITY,
        summitsCleared: 3.9,
        sealsRescued: -2,
      });

      expect(sanitized.version).toBe(1);
      expect(sanitized.render.targetFps).toBe(120);
      expect(sanitized.render.packSource).toBe('builtin');
      expect(sanitized.render.touchMode).toBe('auto');
      expect(sanitized.render.showFps).toBe(false);
      expect(sanitized.audio.master).toBe(1);
      expect(sanitized.audio.music).toBe(0);
      expect(sanitized.audio.sfx).toBe(0.85);
      expect(sanitized.audio.jukeboxTrack).toBe('Base');
      expect(sanitized.skins).toEqual({ p1: 'Default', p2: 'Fish', jeff: 'Default', rope: 'Knight' });
      expect(sanitized.unlockedPhotos).toEqual(['Photo1']);
      expect(sanitized.unlockedManual).toEqual(['Ice']);
      expect(sanitized.unlockedAchievements).toEqual(['FirstSteps']);
      expect(sanitized.timeTrialBest).toEqual({ TT1: { timeSec: 65, medal: 'platinum' } });
      expect(sanitized.bestAltitudeCoop).toBe(0);
      expect(sanitized.bestAltitudeSolo).toBe(0);
      expect(sanitized.summitsCleared).toBe(3);
      expect(sanitized.sealsRescued).toBe(0);

      // Reset clears mutations and notifies listeners
      let notifiedCount = 0;
      const unsub = recovered.onChange(() => {
        notifiedCount += 1;
      });
      recovered.unlockPhoto('Photo2');
      expect(recovered.get().unlockedPhotos).toEqual(['Photo2']);
      recovered.reset();
      expect(recovered.get()).toEqual(createDefaultSaveData());
      expect(notifiedCount).toBe(2);
      unsub();
    });
  });

  describe('2. WebRtcCoop SDP Room Code Compression & Public API', () => {
    it('roundtrips realistic Offer and Answer SDPs through encodeSdpRoomCode / decodeSdpRoomCode', async () => {
      const sampleOfferSdp = [
        'v=0',
        'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
        's=-',
        't=0 0',
        'a=group:BUNDLE 0',
        'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
        'c=IN IP4 0.0.0.0',
        'a=ice-ufrag:krunked99',
        'a=ice-pwd:fred1234567890abcdefghijklmnop',
        'a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
        'a=setup:actpass',
        'a=mid:0',
        'a=sctp-port:5000',
        'a=candidate:1 1 udp 2122260223 192.168.1.42 54321 typ host generation 0',
        '',
      ].join('\r\n');

      const offerCode = await encodeSdpRoomCode({ type: 'offer', sdp: sampleOfferSdp });
      expect(offerCode.startsWith('KF1Z.') || offerCode.startsWith('KF1R.')).toBe(true);
      expect(offerCode.length).toBeLessThan(sampleOfferSdp.length * 1.4);

      // Whitespace/newlines pasted by user are tolerated
      const decodedOffer = await decodeSdpRoomCode(`  ${offerCode.slice(0, 20)}\n${offerCode.slice(20)}  `);
      expect(decodedOffer).toEqual({ type: 'offer', sdp: sampleOfferSdp });

      const sampleAnswerSdp = sampleOfferSdp.replace('a=setup:actpass', 'a=setup:active');
      const answerCode = await encodeSdpRoomCode({ type: 'answer', sdp: sampleAnswerSdp });
      const decodedAnswer = await decodeSdpRoomCode(answerCode);
      expect(decodedAnswer).toEqual({ type: 'answer', sdp: sampleAnswerSdp });

      // Invalid / empty room codes reject cleanly
      await expect(decodeSdpRoomCode('   ')).rejects.toThrow();
      await expect(decodeSdpRoomCode('KF1R.bm90LWpzb24')).rejects.toThrow();
      await expect(encodeSdpRoomCode({ type: 'offer', sdp: '' })).rejects.toThrow();
    });

    it('handles WebRtcCoop lifecycle safely in Node without RTCPeerConnection', async () => {
      const rtc = new WebRtcCoop();
      expect(rtc.getStatus()).toBe('idle');
      expect(rtc.getRole()).toBeNull();
      expect(rtc.sendPacket({ type: 'ping', ts: 1 })).toBe(false);

      await expect(rtc.acceptAnswerCode('KF1R.e30')).rejects.toThrow();
      expect(rtc.getStatus()).toBe('error');

      if (typeof RTCPeerConnection === 'undefined') {
        await expect(rtc.createOfferCode()).rejects.toThrow(/RTCPeerConnection/);
        expect(rtc.getStatus()).toBe('error');
      }

      rtc.close();
      expect(rtc.getStatus()).toBe('idle');
      expect(rtc.getRole()).toBeNull();
      expect(rtc.getError()).toBeNull();
    });
  });

  describe('3. CoopSync 50 Hz Lockstep & Authoritative Host Desync Recovery', () => {
    it('maintains 50 Hz lockstep hash parity and recovers cleanly from artificial client desync via state_resync', () => {
      const level = getLevelByMode('coop_mountain');
      const hooks = createSimHooks();
      const seed = 0x12345678;

      const hostState = createSimState(level, { seed, isOnline: true });
      const clientState = createSimState(level, { seed, isOnline: true });

      const hostToClientQueue: NetSyncPacket[] = [];
      const clientToHostQueue: NetSyncPacket[] = [];
      let clientAppliedResyncs = 0;

      const hostSync = new CoopSync({
        sendPacket: (pkt) => {
          expect(isNetSyncPacket(pkt)).toBe(true);
          hostToClientQueue.push(pkt);
          return true;
        },
      });

      const clientSync = new CoopSync({
        sendPacket: (pkt) => {
          expect(isNetSyncPacket(pkt)).toBe(true);
          clientToHostQueue.push(pkt);
          return true;
        },
        onApplyResync: (tick, snapshot) => {
          applySimResyncSnapshot(clientState, snapshot);
          clientAppliedResyncs += 1;
          clientSync.confirmClientResync(tick, hashSimState(clientState));
        },
      });

      const initialHash = hashSimState(hostState);
      hostSync.startSession('host', 0, initialHash);
      clientSync.startSession('client', 0, initialHash);
      hostSync.markPeerReady(0, initialHash);
      clientSync.markPeerReady(0, initialHash);

      const flushQueues = (): void => {
        let guard = 0;
        while ((hostToClientQueue.length > 0 || clientToHostQueue.length > 0) && guard < 100) {
          guard++;
          while (hostToClientQueue.length > 0) {
            clientSync.handlePacket(hostToClientQueue.shift()!);
          }
          while (clientToHostQueue.length > 0) {
            hostSync.handlePacket(clientToHostQueue.shift()!);
          }
        }
      };

      const stepLockstep = (p1Inp: PlayerInput, p2Inp: PlayerInput): void => {
        hostSync.queueLocalInput(hostState.tick, p1Inp, hashSimState(hostState));
        clientSync.queueLocalInput(clientState.tick, p2Inp, hashSimState(clientState));
        flushQueues();

        const hostFrame = hostSync.consumeTickFrame(hostState.tick);
        const clientFrame = clientSync.consumeTickFrame(clientState.tick);
        expect(hostFrame).not.toBeNull();
        expect(clientFrame).not.toBeNull();

        stepSim(hostState, level, hostFrame!, hooks);
        stepSim(clientState, level, clientFrame!, hooks);

        hostSync.recordCompletedTick(hostState.tick, hashSimState(hostState), hostState);
        clientSync.recordCompletedTick(clientState.tick, hashSimState(clientState));
        flushQueues();
      };

      // Advance 40 synchronized 50 Hz ticks with varied P1 & P2 inputs
      for (let t = 0; t < 40; t++) {
        const p1: PlayerInput = {
          ...createEmptyPlayerInput(),
          moveX: t < 25 ? 1 : -1,
          jump: t === 12,
          jumpPressed: t === 12,
        };
        const p2: PlayerInput = {
          ...createEmptyPlayerInput(),
          moveX: t < 25 ? 1 : 0,
          anchor: t >= 30,
        };
        stepLockstep(p1, p2);
      }

      expect(hostState.tick).toBe(40);
      expect(clientState.tick).toBe(40);
      expect(hashSimState(hostState)).toBe(hashSimState(clientState));
      expect(hostSync.getStats().syncStatus).toBe('SYNCED');
      expect(clientSync.getStats().syncStatus).toBe('SYNCED');
      expect(hostSync.getStats().hashMatched).toBe(true);

      // Inject artificial desync on Client!
      clientState.p1.x += 4.25;
      clientState.p2.vy = -14.0;
      expect(hashSimState(clientState)).not.toBe(hashSimState(hostState));

      // Step through next state_ack heartbeat (ticks 41..50) so Host detects mismatch and sends state_resync
      for (let t = 0; t < 12; t++) {
        const inp = { ...createEmptyPlayerInput(), moveX: 1 };
        stepLockstep(inp, inp);
      }

      expect(clientAppliedResyncs).toBeGreaterThanOrEqual(1);
      expect(hostSync.getStats().resyncCount).toBeGreaterThanOrEqual(1);
      expect(clientSync.getStats().resyncCount).toBeGreaterThanOrEqual(1);
      expect(hashSimState(clientState)).toBe(hashSimState(hostState));
      expect(clientState.p1.x).toBeCloseTo(hostState.p1.x, 5);

      // Continue 15 more ticks after resync and confirm persistent SYNCED parity
      for (let t = 0; t < 15; t++) {
        const p1 = { ...createEmptyPlayerInput(), moveX: -1 };
        const p2 = { ...createEmptyPlayerInput(), moveX: -1 };
        stepLockstep(p1, p2);
      }
      expect(hashSimState(clientState)).toBe(hashSimState(hostState));
      expect(hostSync.getStats().syncStatus).toBe('SYNCED');
      expect(clientSync.getStats().syncStatus).toBe('SYNCED');
    });
  });

  describe('4. AudioEngine (SSR-Safe, All 14 Terrains & All 11 Jukebox Tracks)', () => {
    it('creates and operates SSR-safely without window/AudioContext', () => {
      const engine = createAudioEngine();
      const level = getLevelByMode('coop_mountain');
      const state = createSimState(level, { seed: 400 });

      expect(() => engine.unlock()).not.toThrow();
      expect(() => engine.playUiSound('confirm')).not.toThrow();
      for (const track of JUKEBOX_TRACKS) {
        expect(() =>
          engine.applySettings({
            master: 0.8,
            music: 0.7,
            sfx: 0.85,
            muted: false,
            jukeboxTrack: track,
          }),
        ).not.toThrow();
      }
      for (const terrain of TERRAIN_TYPES) {
        const events: SimEvent[] = [
          { type: 'footstep', who: 'p1', x: 0, y: 1, terrain },
          { type: 'land', who: 'p2', x: 1, y: 1, terrain, impactVy: 12 },
          { type: 'land_hard', who: 'p1', x: 0, y: 1, terrain },
          { type: 'grab_start', who: 'p1', x: 0, y: 2, terrain },
          { type: 'anchor_set', who: 'p2', x: 1, y: 1, terrain },
        ];
        expect(() => engine.consumeEvents(events, state)).not.toThrow();
      }
      expect(() => engine.update(state, 0.02)).not.toThrow();
      expect(() => engine.dispose()).not.toThrow();
    });

    it('synthesizes all 14 TerrainTypes, key SimEvents, and all 11 Jukebox tracks cleanly with active Web Audio', () => {
      const prevWindow = (globalThis as { window?: unknown }).window;
      const MockCtx = createMockAudioContextClass();
      (globalThis as { window?: unknown }).window = { AudioContext: MockCtx };

      try {
        const engine = new AudioEngine();
        const level = getLevelByMode('coop_mountain');
        const state = createSimState(level, { seed: 401 });

        engine.unlock();
        engine.playUiSound('move');
        engine.playUiSound('confirm');
        engine.playUiSound('cancel');
        engine.playUiSound('toggle');

        // Cycle all 11 Jukebox tracks and tick music sequencer
        for (const track of JUKEBOX_TRACKS) {
          const settings: AudioSettings = {
            master: 0.85,
            music: 0.75,
            sfx: 0.9,
            muted: false,
            jukeboxTrack: track,
          };
          expect(() => engine.applySettings(settings)).not.toThrow();
          expect(() => engine.update(state, 0.05)).not.toThrow();
        }

        // Exercise all 14 TerrainTypes across footstep, land, land_hard, grab_start, anchor_set
        for (const terrain of TERRAIN_TYPES) {
          const terrainEvents: SimEvent[] = [
            { type: 'footstep', who: 'p1', x: 0, y: 1, terrain },
            { type: 'land', who: 'p2', x: 1, y: 1, terrain, impactVy: 14 },
            { type: 'land_hard', who: 'p1', x: 0, y: 1, terrain },
            { type: 'grab_start', who: 'p1', x: 0, y: 2, terrain },
            { type: 'anchor_set', who: 'p2', x: 1, y: 1, terrain },
          ];
          expect(() => engine.consumeEvents(terrainEvents, state)).not.toThrow();
        }

        // Exercise celebratory & mechanic SimEvents
        const specialEvents: SimEvent[] = [
          { type: 'jump', who: 'p1', x: 0, y: 2 },
          { type: 'grab_stamina_out', who: 'p1', x: 0, y: 3 },
          { type: 'swing_pump', who: 'p2', x: 1, y: 2, speed: 9 },
          { type: 'swing_launch', who: 'p2', x: 2, y: 3, speed: 13 },
          { type: 'rope_taut', x: 1, y: 2, tension: 0.9 },
          { type: 'rope_pull_start', who: 'p1', x: 0, y: 2 },
          { type: 'block_shake', id: 'fb1', x: 2, y: 2 },
          { type: 'block_crumble', id: 'fb1', x: 2, y: 2 },
          { type: 'block_recover', id: 'fb1', x: 2, y: 2 },
          { type: 'wind_telegraph', dir: 1 },
          { type: 'wind_start', dir: 1 },
          { type: 'wind_stop' },
          { type: 'flag_place', x: 0, y: 1 },
          { type: 'charlie_pickup', x: 0, y: 1 },
          { type: 'collect_photo', id: 'Photo1', label: 'Photo1', x: 0, y: 1 },
          { type: 'collect_manual', id: 'Swing', label: 'Swing', x: 0, y: 1 },
          { type: 'rescue_seal', id: 'seal1', x: 0, y: 1 },
          { type: 'button_press', id: 'btn1', circuitId: 'c1', powered: true, x: 0, y: 1 },
          { type: 'troncho_launch', id: 'tr1', who: 'p1', x: 0, y: 1 },
          { type: 'laser_zap', id: 'las1', who: 'p1', x: 0, y: 1 },
          { type: 'boss_chain_break', chainId: 'left_arm', remaining: 3, x: 0, y: 10 },
          { type: 'boss_defeated', timeSec: 120 },
          { type: 'summit_reached', mode: 'coop_mountain', timeSec: 300, noAssist: true },
          { type: 'time_trial_finish', trialId: 'TT1', timeSec: 65, medal: 'platinum' },
          { type: 'emote', who: 'p1', emote: 'clap', x: 0, y: 1 },
          { type: 'rps_result', winner: 'p1', p1Move: 'rps_rock', p2Move: 'rps_scissors' },
          { type: 'achievement_unlock', id: 'FirstSwing' },
        ];
        expect(() => engine.consumeEvents(specialEvents, state)).not.toThrow();
        expect(engine.getActiveVoiceCount()).toBeLessThanOrEqual(16);

        engine.dispose();
      } finally {
        if (prevWindow === undefined) {
          delete (globalThis as { window?: unknown }).window;
        } else {
          (globalThis as { window?: unknown }).window = prevWindow;
        }
      }
    });
  });

  describe('5. Time Trial Medal Grading (TT1..TT10 Exact Boundaries)', () => {
    it('grades exact Bronze, Silver, Gold, Platinum, and None boundaries for all 10 Time Trials', () => {
      expect(TIME_TRIAL_MEDALS).toHaveLength(10);

      for (const def of TIME_TRIAL_MEDALS) {
        expect(gradeTimeTrialMedal(def.index, 0)).toBe('platinum');
        expect(gradeTimeTrialMedal(def.index, def.platinum - 0.01)).toBe('platinum');
        expect(gradeTimeTrialMedal(def.index, def.platinum)).toBe('platinum');

        expect(gradeTimeTrialMedal(def.index, def.platinum + 0.01)).toBe('gold');
        expect(gradeTimeTrialMedal(def.index, def.gold)).toBe('gold');

        expect(gradeTimeTrialMedal(def.index, def.gold + 0.01)).toBe('silver');
        expect(gradeTimeTrialMedal(def.index, def.silver)).toBe('silver');

        expect(gradeTimeTrialMedal(def.index, def.silver + 0.01)).toBe('bronze');
        expect(gradeTimeTrialMedal(def.index, def.bronze)).toBe('bronze');

        expect(gradeTimeTrialMedal(def.index, def.bronze + 0.01)).toBe('none');
      }

      // Edge inputs
      expect(gradeTimeTrialMedal(1, -1)).toBe('none');
      expect(gradeTimeTrialMedal(1, Number.NaN)).toBe('none');
      expect(gradeTimeTrialMedal(99, 10)).toBe('none');
    });
  });

  describe('6. Progression, Achievements & Catalog Parity', () => {
    it('unlocks GameCompletedNoAssist, DefeatBachicha, RescueSeal, RunOutStamina, and TimeTrialPlatinum via updateProgression', () => {
      // Summit no-assist + RescueSeal + RunOutStamina
      const coopLevel = getLevelByMode('coop_mountain');
      const sCoop = createSimState(coopLevel, { seed: 601 });
      const evCoop: SimEvent[] = [
        { type: 'rescue_seal', id: 'seal_mines_rescue', x: 0, y: 155 },
        { type: 'grab_stamina_out', who: 'p1', x: 10, y: 30 },
        { type: 'summit_reached', mode: 'coop_mountain', timeSec: 420, noAssist: true },
      ];
      updateProgression(sCoop, coopLevel, evCoop);
      const coopUnlocked = evCoop
        .filter((e): e is Extract<SimEvent, { type: 'achievement_unlock' }> => e.type === 'achievement_unlock')
        .map((e) => e.id);

      expect(coopUnlocked).toContain('RescueSeal');
      expect(coopUnlocked).toContain('RunOutStamina');
      expect(coopUnlocked).toContain('ReachPeakCoop');
      expect(coopUnlocked).toContain('GameCompletedNoAssist');

      // Deduplication: re-emitting same events in the same run does not duplicate achievement_unlock
      const dupEv: SimEvent[] = [{ type: 'rescue_seal', id: 'seal_mines_rescue', x: 0, y: 155 }];
      updateProgression(sCoop, coopLevel, dupEv);
      expect(dupEv.some((e) => e.type === 'achievement_unlock' && e.id === 'RescueSeal')).toBe(false);

      // Summit WITH assist does NOT unlock GameCompletedNoAssist
      const sAssist = createSimState(coopLevel, { seed: 602, assist: { infiniteJumps: true } });
      const evAssist: SimEvent[] = [
        { type: 'summit_reached', mode: 'coop_mountain', timeSec: 200, noAssist: false },
      ];
      updateProgression(sAssist, coopLevel, evAssist);
      const assistUnlocked = evAssist
        .filter((e): e is Extract<SimEvent, { type: 'achievement_unlock' }> => e.type === 'achievement_unlock')
        .map((e) => e.id);
      expect(assistUnlocked).toContain('ReachPeakCoop');
      expect(assistUnlocked).not.toContain('GameCompletedNoAssist');

      // Lab DLC: DefeatBachicha
      const labLevel = getLevelByMode('lab_dlc');
      const sLab = createSimState(labLevel, { seed: 603 });
      const evLab: SimEvent[] = [{ type: 'boss_defeated', timeSec: 310 }];
      updateProgression(sLab, labLevel, evLab);
      const labUnlocked = evLab
        .filter((e): e is Extract<SimEvent, { type: 'achievement_unlock' }> => e.type === 'achievement_unlock')
        .map((e) => e.id);
      expect(labUnlocked).toContain('DefeatBachicha');
      expect(labUnlocked).toContain('EnterLab');
      expect(labUnlocked).toContain('GameCompletedNoAssist');

      // Time Trial: TimeTrialPlatinum & TimeTrialBronze
      const tt1Level = getLevelByMode('time_trial', 1);
      const sTT = createSimState(tt1Level, { seed: 604 });
      const evTT: SimEvent[] = [
        { type: 'time_trial_finish', trialId: 'TT1', timeSec: 55.0, medal: 'none' },
      ];
      updateProgression(sTT, tt1Level, evTT);
      const ttUnlocked = evTT
        .filter((e): e is Extract<SimEvent, { type: 'achievement_unlock' }> => e.type === 'achievement_unlock')
        .map((e) => e.id);
      expect(sTT.completionMedal).toBe('platinum');
      expect(ttUnlocked).toContain('TimeTrialBronze');
      expect(ttUnlocked).toContain('TimeTrialPlatinum');

      // Save-level achievement evaluation
      const save = createDefaultSaveData();
      save.skins.p1 = 'Knight';
      save.skins.rope = 'Knight';
      save.unlockedPhotos = [...PHOTO_IDS];
      save.unlockedManual = [...MANUAL_PAGE_IDS];
      save.sealsRescued = 1;
      save.noAssistCleared = true;
      save.labBossCleared = true;
      save.timeTrialBest.TT1 = { timeSec: 60, medal: 'platinum' };

      const saveEarned = evaluateSaveAchievements(save);
      expect(saveEarned).toContain('FashionPenguin');
      expect(saveEarned).toContain('PhotoCollectorHalf');
      expect(saveEarned).toContain('PhotoCollectorAll');
      expect(saveEarned).toContain('ManualScholar');
      expect(saveEarned).toContain('RescueSeal');
      expect(saveEarned).toContain('GameCompletedNoAssist');
      expect(saveEarned).toContain('DefeatBachicha');
      expect(saveEarned).toContain('TimeTrialBronze');
      expect(saveEarned).toContain('TimeTrialPlatinum');
    });

    it('matches exact catalog counts across skins, tracks, photos, manual pages, achievements, terrains, and actions', () => {
      expect(COOP_SKINS).toHaveLength(CATALOG_COUNTS.COOP_SKINS);
      expect(Object.keys(COOP_SKIN_CATALOG)).toHaveLength(16);
      expect(JEFF_SKINS).toHaveLength(CATALOG_COUNTS.JEFF_SKINS);
      expect(Object.keys(JEFF_SKIN_CATALOG)).toHaveLength(6);
      expect(ROPE_SKINS).toHaveLength(CATALOG_COUNTS.ROPE_SKINS);
      expect(Object.keys(ROPE_SKIN_CATALOG)).toHaveLength(12);
      expect(JUKEBOX_TRACKS).toHaveLength(CATALOG_COUNTS.JUKEBOX_TRACKS);
      expect(Object.keys(JUKEBOX_TRACK_CATALOG)).toHaveLength(11);
      expect(PHOTO_IDS).toHaveLength(CATALOG_COUNTS.PHOTOS);
      expect(Object.keys(PHOTO_CATALOG)).toHaveLength(12);
      expect(MANUAL_PAGE_IDS).toHaveLength(CATALOG_COUNTS.MANUAL_PAGES);
      expect(Object.keys(MANUAL_PAGE_CATALOG)).toHaveLength(7);
      expect(ACHIEVEMENT_IDS).toHaveLength(CATALOG_COUNTS.ACHIEVEMENTS);
      expect(Object.keys(ACHIEVEMENT_CATALOG)).toHaveLength(26);
      expect(TERRAIN_TYPES).toHaveLength(CATALOG_COUNTS.TERRAIN_TYPES);
      expect(ACTION_STATES).toHaveLength(CATALOG_COUNTS.ACTION_STATES);
      expect(TIME_TRIAL_MEDALS).toHaveLength(CATALOG_COUNTS.TIME_TRIALS);
    });
  });
});
