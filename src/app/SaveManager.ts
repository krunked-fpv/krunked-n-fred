// ============================================================================
// Krunked & Fred — Schema-Validated Save Persistence (SaveManager)
// ============================================================================

import {
  ACHIEVEMENT_IDS,
  COOP_SKINS,
  DEFAULT_KEYBINDS,
  JEFF_SKINS,
  JUKEBOX_TRACKS,
  MANUAL_PAGE_IDS,
  PHOTO_IDS,
  ROPE_SKINS,
  type AchievementId,
  type AssistSettings,
  type AudioSettings,
  type CoopSkinId,
  type GameMode,
  type JeffSkinId,
  type JukeboxTrackId,
  type KeybindProfile,
  type ManualPageId,
  type MedalTier,
  type PackSource,
  type PhotoId,
  type RenderSettings,
  type RopeSkinId,
  type SaveData,
  type TargetFps,
  type TouchMode,
} from '../contracts';

export const SAVE_STORAGE_KEY = 'krunked_n_fred_save_v1';

const VALID_TARGET_FPS: ReadonlySet<number> = new Set([30, 60, 120]);
const VALID_TOUCH_MODES: ReadonlySet<string> = new Set(['auto', 'off', 'on']);
const VALID_PACK_SOURCES: ReadonlySet<string> = new Set(['builtin', 'custom']);
const VALID_MEDAL_TIERS: ReadonlySet<string> = new Set(['none', 'bronze', 'silver', 'gold', 'platinum']);
const VALID_COOP_SKINS: ReadonlySet<string> = new Set(COOP_SKINS);
const VALID_JEFF_SKINS: ReadonlySet<string> = new Set(JEFF_SKINS);
const VALID_ROPE_SKINS: ReadonlySet<string> = new Set(ROPE_SKINS);
const VALID_JUKEBOX_TRACKS: ReadonlySet<string> = new Set(JUKEBOX_TRACKS);
const VALID_PHOTO_IDS: ReadonlySet<string> = new Set(PHOTO_IDS);
const VALID_MANUAL_IDS: ReadonlySet<string> = new Set(MANUAL_PAGE_IDS);
const VALID_ACHIEVEMENT_IDS: ReadonlySet<string> = new Set(ACHIEVEMENT_IDS);

const MEDAL_RANK: Record<MedalTier, number> = {
  none: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
};

export function createDefaultSaveData(): SaveData {
  return {
    version: 1,
    render: {
      targetFps: 120,
      classic50HzSnap: false,
      screenShake: true,
      packSource: 'builtin',
      touchMode: 'auto',
      showFps: false,
    },
    audio: {
      master: 0.8,
      music: 0.7,
      sfx: 0.85,
      muted: false,
      jukeboxTrack: 'Base',
    },
    assist: {
      infiniteJumps: false,
      pullingRope: false,
      checkPoints: false,
      betterGrab: false,
    },
    skins: {
      p1: 'Default',
      p2: 'Default',
      jeff: 'Default',
      rope: 'Default',
    },
    unlockedPhotos: [],
    unlockedManual: [],
    unlockedAchievements: [],
    timeTrialBest: {},
    bestAltitudeCoop: 0,
    bestAltitudeSolo: 0,
    bestAltitudeLab: 0,
    summitsCleared: 0,
    noAssistCleared: false,
    labBossCleared: false,
    sealsRescued: 0,
    keybinds: { ...DEFAULT_KEYBINDS },
    gamepadSplitMode: false,
    grabToggleMode: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBool(obj: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const v = obj[key];
  return typeof v === 'boolean' ? v : fallback;
}

function readNonNegNumber(obj: Record<string, unknown>, key: string, fallback: number): number {
  const v = obj[key];
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}

function readUnitNumber(obj: Record<string, unknown>, key: string, fallback: number): number {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(1, v));
}

function readUniqueStringArray<T extends string>(
  raw: unknown,
  allowed: ReadonlySet<string>,
): T[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && allowed.has(item) && !seen.has(item)) {
      seen.add(item);
      out.push(item as T);
    }
  }
  return out;
}

function validateRender(raw: unknown, defaults: RenderSettings): RenderSettings {
  if (!isRecord(raw)) return { ...defaults };
  const targetFps: TargetFps =
    typeof raw.targetFps === 'number' && VALID_TARGET_FPS.has(raw.targetFps)
      ? (raw.targetFps as TargetFps)
      : defaults.targetFps;
  const packSource: PackSource =
    typeof raw.packSource === 'string' && VALID_PACK_SOURCES.has(raw.packSource)
      ? (raw.packSource as PackSource)
      : defaults.packSource;
  const touchMode: TouchMode =
    typeof raw.touchMode === 'string' && VALID_TOUCH_MODES.has(raw.touchMode)
      ? (raw.touchMode as TouchMode)
      : defaults.touchMode;

  return {
    targetFps,
    classic50HzSnap: readBool(raw, 'classic50HzSnap', defaults.classic50HzSnap),
    screenShake: readBool(raw, 'screenShake', defaults.screenShake),
    packSource,
    touchMode,
    showFps: readBool(raw, 'showFps', defaults.showFps),
  };
}

function validateAudio(raw: unknown, defaults: AudioSettings): AudioSettings {
  if (!isRecord(raw)) return { ...defaults };
  const jukeboxTrack: JukeboxTrackId =
    typeof raw.jukeboxTrack === 'string' && VALID_JUKEBOX_TRACKS.has(raw.jukeboxTrack)
      ? (raw.jukeboxTrack as JukeboxTrackId)
      : defaults.jukeboxTrack;
  return {
    master: readUnitNumber(raw, 'master', defaults.master),
    music: readUnitNumber(raw, 'music', defaults.music),
    sfx: readUnitNumber(raw, 'sfx', defaults.sfx),
    muted: readBool(raw, 'muted', defaults.muted),
    jukeboxTrack,
  };
}

function validateAssist(raw: unknown, defaults: AssistSettings): AssistSettings {
  if (!isRecord(raw)) return { ...defaults };
  return {
    infiniteJumps: readBool(raw, 'infiniteJumps', defaults.infiniteJumps),
    pullingRope: readBool(raw, 'pullingRope', defaults.pullingRope),
    checkPoints: readBool(raw, 'checkPoints', defaults.checkPoints),
    betterGrab: readBool(raw, 'betterGrab', defaults.betterGrab),
  };
}

function validateSkins(raw: unknown, defaults: SaveData['skins']): SaveData['skins'] {
  if (!isRecord(raw)) return { ...defaults };
  const p1: CoopSkinId =
    typeof raw.p1 === 'string' && VALID_COOP_SKINS.has(raw.p1) ? (raw.p1 as CoopSkinId) : defaults.p1;
  const p2: CoopSkinId =
    typeof raw.p2 === 'string' && VALID_COOP_SKINS.has(raw.p2) ? (raw.p2 as CoopSkinId) : defaults.p2;
  const jeff: JeffSkinId =
    typeof raw.jeff === 'string' && VALID_JEFF_SKINS.has(raw.jeff)
      ? (raw.jeff as JeffSkinId)
      : defaults.jeff;
  const rope: RopeSkinId =
    typeof raw.rope === 'string' && VALID_ROPE_SKINS.has(raw.rope)
      ? (raw.rope as RopeSkinId)
      : defaults.rope;
  return { p1, p2, jeff, rope };
}

function validateKeybinds(raw: unknown): KeybindProfile {
  const out: KeybindProfile = { ...DEFAULT_KEYBINDS };
  if (!isRecord(raw)) return out;
  const keys = Object.keys(DEFAULT_KEYBINDS) as (keyof KeybindProfile)[];
  for (const key of keys) {
    const val = raw[key];
    if (typeof val === 'string' && val.trim().length > 0 && val.length <= 32) {
      out[key] = val;
    }
  }
  return out;
}

function validateTimeTrialBest(
  raw: unknown,
): Record<string, { timeSec: number; medal: MedalTier }> {
  const out: Record<string, { timeSec: number; medal: MedalTier }> = {};
  if (!isRecord(raw)) return out;
  for (const [trialId, entry] of Object.entries(raw)) {
    if (!trialId || !isRecord(entry)) continue;
    const timeSec = entry.timeSec;
    const medal = entry.medal;
    if (
      typeof timeSec === 'number' &&
      Number.isFinite(timeSec) &&
      timeSec > 0 &&
      typeof medal === 'string' &&
      VALID_MEDAL_TIERS.has(medal)
    ) {
      out[trialId] = { timeSec, medal: medal as MedalTier };
    }
  }
  return out;
}

export function validateSaveData(raw: unknown): SaveData {
  const defaults = createDefaultSaveData();
  if (!isRecord(raw)) return defaults;

  return {
    version: 1,
    render: validateRender(raw.render, defaults.render),
    audio: validateAudio(raw.audio, defaults.audio),
    assist: validateAssist(raw.assist, defaults.assist),
    skins: validateSkins(raw.skins, defaults.skins),
    unlockedPhotos: readUniqueStringArray<PhotoId>(raw.unlockedPhotos, VALID_PHOTO_IDS),
    unlockedManual: readUniqueStringArray<ManualPageId>(raw.unlockedManual, VALID_MANUAL_IDS),
    unlockedAchievements: readUniqueStringArray<AchievementId>(
      raw.unlockedAchievements,
      VALID_ACHIEVEMENT_IDS,
    ),
    timeTrialBest: validateTimeTrialBest(raw.timeTrialBest),
    bestAltitudeCoop: readNonNegNumber(raw, 'bestAltitudeCoop', defaults.bestAltitudeCoop),
    bestAltitudeSolo: readNonNegNumber(raw, 'bestAltitudeSolo', defaults.bestAltitudeSolo),
    bestAltitudeLab: readNonNegNumber(raw, 'bestAltitudeLab', defaults.bestAltitudeLab),
    summitsCleared: Math.floor(readNonNegNumber(raw, 'summitsCleared', defaults.summitsCleared)),
    noAssistCleared: readBool(raw, 'noAssistCleared', defaults.noAssistCleared),
    labBossCleared: readBool(raw, 'labBossCleared', defaults.labBossCleared),
    sealsRescued: Math.floor(readNonNegNumber(raw, 'sealsRescued', defaults.sealsRescued)),
    keybinds: validateKeybinds(raw.keybinds),
    gamepadSplitMode: readBool(raw, 'gamepadSplitMode', defaults.gamepadSplitMode),
    grabToggleMode: readBool(raw, 'grabToggleMode', defaults.grabToggleMode),
  };
}

function getSafeStorage(override?: Storage): Storage | null {
  if (override) return override;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Blocked storage (e.g. privacy sandbox / disabled cookies)
  }
  return null;
}

export class SaveManager {
  private readonly storageKey: string;
  private readonly storage: Storage | null;
  private data: SaveData;
  private readonly listeners = new Set<(data: SaveData) => void>();

  constructor(storageKey = SAVE_STORAGE_KEY, storageOverride?: Storage) {
    this.storageKey = storageKey;
    this.storage = getSafeStorage(storageOverride);
    this.data = this.load();
  }

  load(): SaveData {
    if (!this.storage) {
      this.data = createDefaultSaveData();
      return this.data;
    }
    try {
      const rawText = this.storage.getItem(this.storageKey);
      if (!rawText) {
        this.data = createDefaultSaveData();
        return this.data;
      }
      const parsed: unknown = JSON.parse(rawText);
      this.data = validateSaveData(parsed);
      return this.data;
    } catch {
      this.data = createDefaultSaveData();
      return this.data;
    }
  }

  get(): SaveData {
    return this.data;
  }

  save(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(this.data));
    } catch {
      // Gracefully ignore quota or blocked storage errors
    }
  }

  update(mutator: (data: SaveData) => void): SaveData {
    mutator(this.data);
    this.data = validateSaveData(this.data);
    this.save();
    this.emitChange();
    return this.data;
  }

  reset(): SaveData {
    this.data = createDefaultSaveData();
    if (this.storage) {
      try {
        this.storage.removeItem(this.storageKey);
      } catch {
        // Ignore blocked storage
      }
    }
    this.save();
    this.emitChange();
    return this.data;
  }

  updateBestAltitude(mode: GameMode, altitude: number): boolean {
    if (!Number.isFinite(altitude) || altitude <= 0) return false;
    const rounded = Math.round(altitude * 10) / 10;
    let changed = false;
    if (mode === 'lab_dlc') {
      if (rounded > this.data.bestAltitudeLab) {
        this.data.bestAltitudeLab = rounded;
        changed = true;
      }
    } else if (mode === 'solo_jeff' || mode === 'solo_ai') {
      if (rounded > this.data.bestAltitudeSolo) {
        this.data.bestAltitudeSolo = rounded;
        changed = true;
      }
    } else if (mode === 'coop_mountain' || mode === 'online_coop') {
      if (rounded > this.data.bestAltitudeCoop) {
        this.data.bestAltitudeCoop = rounded;
        changed = true;
      }
    }
    if (changed) {
      this.save();
      this.emitChange();
    }
    return changed;
  }

  unlockPhoto(id: string): boolean {
    if (!VALID_PHOTO_IDS.has(id)) return false;
    const photoId = id as PhotoId;
    if (this.data.unlockedPhotos.includes(photoId)) return false;
    this.data.unlockedPhotos.push(photoId);
    this.save();
    this.emitChange();
    return true;
  }

  unlockManual(id: string): boolean {
    if (!VALID_MANUAL_IDS.has(id)) return false;
    const manualId = id as ManualPageId;
    if (this.data.unlockedManual.includes(manualId)) return false;
    this.data.unlockedManual.push(manualId);
    this.save();
    this.emitChange();
    return true;
  }

  unlockAchievement(id: string): boolean {
    if (!VALID_ACHIEVEMENT_IDS.has(id)) return false;
    const achId = id as AchievementId;
    if (this.data.unlockedAchievements.includes(achId)) return false;
    this.data.unlockedAchievements.push(achId);
    this.save();
    this.emitChange();
    return true;
  }

  recordSealRescued(): void {
    this.data.sealsRescued += 1;
    this.save();
    this.emitChange();
  }

  recordSummit(noAssist: boolean): void {
    this.data.summitsCleared += 1;
    if (noAssist) {
      this.data.noAssistCleared = true;
    }
    this.save();
    this.emitChange();
  }

  recordLabBossCleared(): void {
    this.data.labBossCleared = true;
    this.save();
    this.emitChange();
  }

  recordTimeTrial(trialId: string, timeSec: number, medal: MedalTier): void {
    if (!trialId || !Number.isFinite(timeSec) || timeSec <= 0) return;
    const existing = this.data.timeTrialBest[trialId];
    if (!existing || timeSec < existing.timeSec) {
      const bestMedal =
        existing && MEDAL_RANK[existing.medal] > MEDAL_RANK[medal] ? existing.medal : medal;
      this.data.timeTrialBest[trialId] = { timeSec, medal: bestMedal };
      this.save();
      this.emitChange();
    } else if (MEDAL_RANK[medal] > MEDAL_RANK[existing.medal]) {
      this.data.timeTrialBest[trialId] = { timeSec: existing.timeSec, medal };
      this.save();
      this.emitChange();
    }
  }

  onChange(listener: (data: SaveData) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitChange(): void {
    for (const fn of this.listeners) {
      fn(this.data);
    }
  }
}
