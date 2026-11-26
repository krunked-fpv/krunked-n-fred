import {
  ACHIEVEMENT_IDS,
  WORLD,
  type AchievementId,
  type LevelData,
  type MedalTier,
  type SaveData,
  type SimEvent,
  type SimState,
} from '../contracts';
import { gradeTimeTrialMedal, resolveBiomeAt } from './modes';

const unlockedPerRun = new WeakMap<SimState, Set<AchievementId>>();
const VALID_ACHIEVEMENTS: ReadonlySet<AchievementId> = new Set(ACHIEVEMENT_IDS);

function getUnlockedSet(state: SimState): Set<AchievementId> {
  let set = unlockedPerRun.get(state);
  if (!set) {
    set = new Set<AchievementId>();
    unlockedPerRun.set(state, set);
  }
  return set;
}

function parseTrialIndex(trialId: string): number | null {
  const match = /^TT(\d+)$/i.exec(trialId.trim());
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
}

function isRidingWindDrivenSwing(state: SimState): boolean {
  if (state.swingPlatforms.length === 0) return false;
  const p1Id = state.p1.grounded ? state.p1.platformEntityId : null;
  const p2Id = state.mode !== 'solo_jeff' && state.p2.grounded ? state.p2.platformEntityId : null;
  if (!p1Id && !p2Id) return false;

  for (let i = 0; i < state.swingPlatforms.length; i++) {
    const sp = state.swingPlatforms[i];
    if (!sp.windDriven) continue;
    if (sp.id === p1Id || sp.id === p2Id) {
      if (state.windActive || Math.abs(sp.angle) > 0.03 || Math.abs(sp.vx) > 0.25) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Evaluates persistent save-level achievements across all 26 `ACHIEVEMENT_IDS`
 * (including FashionPenguin, PhotoCollectorHalf, PhotoCollectorAll, ManualScholar,
 * and TimeTrial medal unlocks stored in `SaveData`).
 */
export function evaluateSaveAchievements(save: SaveData): AchievementId[] {
  const earned: AchievementId[] = [];
  const existing = new Set<AchievementId>(save.unlockedAchievements);

  const check = (id: AchievementId, condition: boolean): void => {
    if (condition && !existing.has(id)) {
      existing.add(id);
      earned.push(id);
    }
  };

  check('PhotoCollectorHalf', save.unlockedPhotos.length >= 6);
  check('PhotoCollectorAll', save.unlockedPhotos.length >= 12);
  check('ManualScholar', save.unlockedManual.length >= 7);
  check(
    'FashionPenguin',
    (save.skins.p1 !== 'Default' || save.skins.p2 !== 'Default') && save.skins.rope !== 'Default',
  );
  check('RescueSeal', save.sealsRescued >= 1);
  check('GameCompletedNoAssist', save.noAssistCleared);
  check('DefeatBachicha', save.labBossCleared);

  let anyBronze = false;
  let anyPlatinum = false;
  const entries = Object.values(save.timeTrialBest);
  for (let i = 0; i < entries.length; i++) {
    const medal = entries[i].medal;
    if (medal !== 'none') anyBronze = true;
    if (medal === 'platinum') anyPlatinum = true;
  }
  check('TimeTrialBronze', anyBronze);
  check('TimeTrialPlatinum', anyPlatinum);

  return earned;
}

/**
 * Pure deterministic progression & 26-Achievement evaluator invoked at Phase 8 of `stepSim`.
 * Updates `state.currentBiome` via `resolveBiomeAt`, grades `state.completionMedal` on
 * `time_trial_finish`, and emits deduplicated `achievement_unlock` events per run.
 */
export function updateProgression(
  state: SimState,
  level: LevelData,
  events: SimEvent[],
): void {
  const unlocked = getUnlockedSet(state);

  const unlock = (id: AchievementId): void => {
    if (!VALID_ACHIEVEMENTS.has(id) || unlocked.has(id)) {
      return;
    }
    unlocked.add(id);
    events.push({ type: 'achievement_unlock', id });
  };

  // 1. Update canonical biome via `resolveBiomeAt`
  const midX = state.mode === 'solo_jeff' ? state.p1.x : (state.p1.x + state.p2.x) * 0.5;
  const midY = state.mode === 'solo_jeff' ? state.p1.y : (state.p1.y + state.p2.y) * 0.5;
  state.currentBiome = resolveBiomeAt(level, midY, midX);

  // 2. Scan tick events (snapshot length so newly appended achievement_unlock events aren't re-scanned)
  const initialEventCount = events.length;
  let p1Clapped = false;
  let p2Clapped = false;

  for (let i = 0; i < initialEventCount; i++) {
    const ev = events[i];
    switch (ev.type) {
      case 'swing_launch':
        unlock('FirstSwing');
        break;

      case 'grab_start':
        if (ev.who === 'p1' || ev.who === 'p2') {
          unlock('WallClimber');
        }
        break;

      case 'grab_stamina_out':
        unlock('RunOutStamina');
        break;

      case 'land_hard':
        unlock('HardLanding');
        break;

      case 'rescue_seal':
        unlock('RescueSeal');
        break;

      case 'charlie_pickup':
        unlock('CallCharlie');
        break;

      case 'rope_pull_start':
        unlock('RopePullRescue');
        break;

      case 'troncho_launch':
        unlock('TronchoFlyer');
        break;

      case 'boss_defeated':
        unlock('DefeatBachicha');
        if (!state.assistEverUsedInRun) {
          unlock('GameCompletedNoAssist');
        }
        break;

      case 'summit_reached':
        if (ev.mode === 'solo_jeff') {
          unlock('ReachPeakSolo');
        } else if (
          ev.mode === 'coop_mountain' ||
          ev.mode === 'online_coop' ||
          ev.mode === 'solo_ai'
        ) {
          unlock('ReachPeakCoop');
        }
        if (ev.noAssist) {
          unlock('GameCompletedNoAssist');
        }
        break;

      case 'time_trial_finish': {
        const trialIndex =
          level.timeTrialIndex ?? state.timeTrialIndex ?? parseTrialIndex(ev.trialId) ?? 1;
        const graded: MedalTier = gradeTimeTrialMedal(trialIndex, ev.timeSec);
        state.completionMedal = graded;
        ev.medal = graded;
        if (graded !== 'none') {
          unlock('TimeTrialBronze');
        }
        if (graded === 'platinum') {
          unlock('TimeTrialPlatinum');
        }
        break;
      }

      case 'emote':
        if (ev.emote === 'clap') {
          if (ev.who === 'p1') p1Clapped = true;
          if (ev.who === 'p2') p2Clapped = true;
        }
        break;

      case 'rps_result':
        if (ev.winner === 'p1' || ev.winner === 'p2') {
          unlock('RpsChampion');
        }
        break;

      default:
        break;
    }
  }

  // 3. State-driven biome, action, and collectible checks
  const isMountainMode = level.mode !== 'lab_dlc' && level.mode !== 'time_trial';

  if (isMountainMode) {
    if (state.currentBiome === 'foothills' && (midX >= 3 || state.altitude >= 1.5)) {
      unlock('FirstSteps');
    }
    if (state.currentBiome === 'mines' || midY >= WORLD.ZONE2_START_Y) {
      unlock('EnterMines');
    }
    if (state.currentBiome === 'summit' || midY >= WORLD.ZONE4_START_Y) {
      unlock('FrozenSummit');
    }
  }

  if (level.mode === 'lab_dlc' || state.currentBiome === 'lab' || state.currentBiome === 'boss') {
    unlock('EnterLab');
  }

  if (state.boss.defeated) {
    unlock('DefeatBachicha');
  }

  if (state.p1.action === 'Drag' || (state.mode !== 'solo_jeff' && state.p2.action === 'Drag')) {
    unlock('DraggedDown');
  }

  if (isRidingWindDrivenSwing(state)) {
    unlock('WindRider');
  }

  // Synchronized clap (both clapping concurrently or emitted clap in same tick)
  const bothClapping =
    state.mode !== 'solo_jeff' &&
    ((state.p1.emote === 'clap' &&
      state.p1.emoteTimer > 0 &&
      state.p2.emote === 'clap' &&
      state.p2.emoteTimer > 0) ||
      (p1Clapped && p2Clapped));
  if (bothClapping) {
    unlock('ClapTogether');
  }

  // In-run collectible milestone checks (Polaroids & Manual Pages)
  let photosCollected = 0;
  let manualCollected = 0;
  for (let i = 0; i < state.collectibles.length; i++) {
    const c = state.collectibles[i];
    if (!c.collected) continue;
    if (c.kind === 'photo') photosCollected += 1;
    else if (c.kind === 'manual') manualCollected += 1;
  }
  if (photosCollected >= 6) {
    unlock('PhotoCollectorHalf');
  }
  if (photosCollected >= 12) {
    unlock('PhotoCollectorAll');
  }
  if (manualCollected >= 7) {
    unlock('ManualScholar');
  }
}
