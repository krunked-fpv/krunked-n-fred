// ============================================================================
// Krunked & Fred — Complete Meta UI Suite & Live HUD Overlays (MetaScreens)
// Renders Skin Closet, Polaroid Album, Field Manual, Jukebox, Achievements,
// Time Trials, Online Co-Op Lobby (BroadcastChannel + WebRTC P2P), Controls &
// Gamepad Remapper, Boss/Time-Trial Victory Ceremonies, Emote Wheel, Toasts,
// and Online Sync HUD. 100% Keyboard, Mouse, and Gamepad navigable.
// ============================================================================

import {
  DEFAULT_KEYBINDS,
  PALETTE,
  TIME_TRIAL_MEDALS,
  type AchievementId,
  type CoopSkinId,
  type EmoteType,
  type GameMode,
  type InputGlyphStyle,
  type JeffSkinId,
  type JukeboxTrackId,
  type KeybindProfile,
  type ManualPageId,
  type MedalTier,
  type MenuScreen,
  type PhotoId,
  type RopeSkinId,
  type SaveData,
  type SimState,
  type TimeTrialMedalDef,
} from '../contracts';
import {
  ACHIEVEMENT_LIST,
  COOP_SKIN_CATALOG,
  COOP_SKIN_LIST,
  JEFF_SKIN_CATALOG,
  JEFF_SKIN_LIST,
  JUKEBOX_TRACK_CATALOG,
  JUKEBOX_TRACK_LIST,
  MANUAL_PAGE_CATALOG,
  MANUAL_PAGE_LIST,
  PHOTO_LIST,
  ROPE_SKIN_CATALOG,
  ROPE_SKIN_LIST,
  type AchievementMeta,
  type PhotoMeta,
} from '../data/catalogs';
import type { MenuNavAction } from '../input/KeyboardDriver';
import { DEFAULT_BROADCAST_CHANNEL, type OnlineCoopStatusSnapshot } from '../net';

export interface MetaArtProvider {
  getPhotoArt?(id: PhotoId): HTMLCanvasElement | string | null;
  getManualDiagram?(id: ManualPageId): HTMLCanvasElement | string | null;
  getCoopSkinPreview?(id: CoopSkinId, who: 'p1' | 'p2'): HTMLCanvasElement | string | null;
  getJeffSkinPreview?(id: JeffSkinId): HTMLCanvasElement | string | null;
  getRopeSkinPreview?(id: RopeSkinId): HTMLCanvasElement | string | null;
  getAchievementIcon?(id: AchievementId): HTMLCanvasElement | string | null;
}

export interface MetaRenderContext {
  save: SaveData;
  simState: SimState;
  glyphStyle: InputGlyphStyle;
  onlineStatus: OnlineCoopStatusSnapshot;
  returnScreen: MenuScreen;
}

export interface MetaScreenCallbacks {
  onBack(): void;
  onSetScreen(screen: MenuScreen): void;
  onStartMode(mode: GameMode, timeTrialIndex?: number): void;
  onPlayAgain(): void;
  onQuitToTitle(): void;
  onUpdateSave(mutator: (data: SaveData) => void): void;
  onOpenOnlineCoop(role: 'host' | 'client', channelName: string): void;
  onCreateWebRtcOffer(): Promise<string>;
  onAcceptWebRtcAnswer(answerCode: string): Promise<void>;
  onAcceptWebRtcOffer(offerCode: string): Promise<string>;
  onDisconnectOnline(): void;
  onTriggerEmote(who: 'p1' | 'p2', emote: EmoteType): void;
  onUnlockAudio(): void;
  onUiSound(kind: 'move' | 'confirm' | 'cancel' | 'toggle'): void;
  onRequestRerender(): void;
}

export interface ToastNotification {
  kind: 'achievement' | 'photo' | 'manual' | 'info';
  title: string;
  subtitle: string;
}

type SkinClosetTab = 'coop' | 'jeff' | 'rope';
type SkinEquipTarget = 'p1' | 'p2' | 'both';
type AchievementFilter = 'all' | AchievementMeta['category'];
type OnlineLobbyTab = 'broadcast' | 'webrtc';
type GamepadVisualLayout = 'xbox' | 'playstation' | 'switch' | 'tesla';

interface FocusSlot {
  el: HTMLElement;
  onActivate?: () => void;
  onStep?: (dir: -1 | 1) => void;
  row?: number;
  col?: number;
}

const META_STYLE_ID = 'krunked-meta-ui-styles';

const KEYBIND_ROWS: ReadonlyArray<{ key: keyof KeybindProfile; group: 'P1' | 'P2' | 'SHARED'; label: string }> = [
  { key: 'p1Left', group: 'P1', label: 'Krunked Left' },
  { key: 'p1Right', group: 'P1', label: 'Krunked Right' },
  { key: 'p1Up', group: 'P1', label: 'Krunked Up / Jump Alt' },
  { key: 'p1Down', group: 'P1', label: 'Krunked Down / Anchor Alt' },
  { key: 'p1Jump', group: 'P1', label: 'Krunked Jump' },
  { key: 'p1Grab', group: 'P1', label: 'Krunked Wall Grab' },
  { key: 'p1Anchor', group: 'P1', label: 'Krunked Anchor' },
  { key: 'p1Pull', group: 'P1', label: 'Krunked Assist Pull' },
  { key: 'p2Left', group: 'P2', label: 'Fred Left' },
  { key: 'p2Right', group: 'P2', label: 'Fred Right' },
  { key: 'p2Up', group: 'P2', label: 'Fred Up / Jump Alt' },
  { key: 'p2Down', group: 'P2', label: 'Fred Down / Anchor Alt' },
  { key: 'p2Jump', group: 'P2', label: 'Fred Jump' },
  { key: 'p2Grab', group: 'P2', label: 'Fred Wall Grab' },
  { key: 'p2Anchor', group: 'P2', label: 'Fred Anchor' },
  { key: 'p2Pull', group: 'P2', label: 'Fred Assist Pull' },
  { key: 'flag', group: 'SHARED', label: 'Place Checkpoint Flag' },
  { key: 'charlie', group: 'SHARED', label: 'Hold Call Charlie' },
  { key: 'emote', group: 'SHARED', label: 'Emote Wheel / Clap' },
];

const EMOTE_WHEEL_OPTIONS: ReadonlyArray<{
  emote: Exclude<EmoteType, 'none'>;
  label: string;
  keyHint: string;
  color: string;
  icon: string;
}> = [
  { emote: 'clap', label: 'CLAP', keyHint: 'E', color: PALETTE.LAB_AMBER, icon: '👏' },
  { emote: 'rps_rock', label: 'ROCK', keyHint: '1', color: PALETTE.KRUNKED_SCARF, icon: '🪨' },
  { emote: 'rps_paper', label: 'PAPER', keyHint: '2', color: PALETTE.LAB_CYAN, icon: '📄' },
  { emote: 'rps_scissors', label: 'SCISSORS', keyHint: '3', color: PALETTE.FRED_SCARF, icon: '✂️' },
];

export function formatClock(sec: number): string {
  const safe = Math.max(0, Number.isFinite(sec) ? sec : 0);
  const mins = Math.floor(safe / 60);
  const rem = safe - mins * 60;
  const whole = Math.floor(rem);
  const hundredths = Math.floor((rem - whole) * 100);
  return `${String(mins).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

function formatParSec(sec: number): string {
  const mins = Math.floor(sec / 60);
  const rem = Math.round(sec - mins * 60);
  return `${mins}:${String(rem).padStart(2, '0')}`;
}

function formatKeyCode(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = {
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ShiftLeft: 'L-SHIFT',
    ShiftRight: 'R-SHIFT',
    Space: 'SPACE',
    Enter: 'ENTER',
    Slash: '/',
    Period: '.',
    Comma: ',',
    Semicolon: ';',
    Quote: "'",
    ControlLeft: 'L-CTRL',
    ControlRight: 'R-CTRL',
  };
  return map[code] ?? code.toUpperCase();
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mountArtOrSvg(
  holder: HTMLElement,
  custom: HTMLCanvasElement | string | null | undefined,
  fallbackSvg: string,
): void {
  if (custom instanceof HTMLCanvasElement) {
    custom.style.imageRendering = 'pixelated';
    custom.style.width = '100%';
    custom.style.height = '100%';
    holder.appendChild(custom);
    return;
  }
  if (typeof custom === 'string' && custom.length > 0) {
    const img = document.createElement('img');
    img.src = custom;
    img.alt = '';
    img.style.imageRendering = 'pixelated';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    holder.appendChild(img);
    return;
  }
  holder.innerHTML = fallbackSvg;
}

// ============================================================================
// Crisp Pixel-Art SVG Generators (Default Clean-Room Art)
// ============================================================================

function renderPenguinSkinSvg(skinId: CoopSkinId, who: 'p1' | 'p2'): string {
  const meta = COOP_SKIN_CATALOG[skinId];
  const accent = who === 'p1' ? meta.krunkedAccent : meta.fredAccent;
  const body =
    skinId === 'Skeleton'
      ? '#242038'
      : skinId === 'Inverted'
        ? '#e8eefc'
        : skinId === 'Robot'
          ? PALETTE.LAB_STEEL
          : skinId === 'Nuclear'
            ? '#384f28'
            : PALETTE.BODY_MAIN;
  const belly =
    skinId === 'Inverted'
      ? PALETTE.BODY_DARK
      : skinId === 'Skeleton'
        ? '#242038'
        : PALETTE.BELLY_WHITE;

  let hatPixels = '';
  switch (skinId) {
    case 'Knight':
      hatPixels = `<rect x="4" y="1" width="8" height="3" fill="#b8c4d4"/><rect x="6" y="0" width="4" height="1" fill="${accent}"/><rect x="5" y="4" width="6" height="1" fill="#5d7285"/>`;
      break;
    case 'Robot':
      hatPixels = `<rect x="7" y="0" width="2" height="2" fill="${accent}"/><rect x="5" y="4" width="6" height="2" fill="${accent}"/>`;
      break;
    case 'Pot':
      hatPixels = `<rect x="3" y="1" width="10" height="3" fill="#7c8599"/><rect x="12" y="2" width="3" height="1" fill="#5d7285"/><rect x="5" y="0" width="6" height="1" fill="#9badb7"/>`;
      break;
    case 'Skeleton':
      hatPixels = `<rect x="5" y="9" width="6" height="1" fill="#f2f5ff"/><rect x="6" y="11" width="4" height="1" fill="#f2f5ff"/>`;
      break;
    case 'Bread':
      hatPixels = `<rect x="4" y="0" width="8" height="3" fill="#fff4df"/><rect x="5" y="3" width="6" height="1" fill="${accent}"/>`;
      break;
    case 'Fish':
      hatPixels = `<rect x="4" y="1" width="8" height="2" fill="${accent}"/><rect x="11" y="0" width="3" height="3" fill="${accent}"/>`;
      break;
    case 'Box':
      hatPixels = `<rect x="3" y="2" width="10" height="5" fill="#c48d56"/><rect x="5" y="4" width="2" height="2" fill="#222034"/><rect x="9" y="4" width="2" height="2" fill="#222034"/>`;
      break;
    case 'Fruit':
      hatPixels = `<rect x="4" y="1" width="8" height="2" fill="${accent}"/><rect x="7" y="0" width="2" height="1" fill="#6bd94b"/>`;
      break;
    case 'Animals':
      hatPixels = `<rect x="4" y="1" width="2" height="2" fill="${accent}"/><rect x="10" y="1" width="2" height="2" fill="${accent}"/>`;
      break;
    case 'SuperHero':
      hatPixels = `<rect x="2" y="8" width="2" height="5" fill="${accent}"/><rect x="5" y="4" width="6" height="2" fill="${accent}"/>`;
      break;
    case 'Christmas':
      hatPixels = `<rect x="4" y="1" width="8" height="2" fill="${accent}"/><rect x="5" y="0" width="4" height="1" fill="#ffffff"/><rect x="4" y="3" width="8" height="1" fill="#ffffff"/>`;
      break;
    case 'Detective':
      hatPixels = `<rect x="3" y="2" width="10" height="2" fill="${accent}"/><rect x="5" y="1" width="6" height="1" fill="#663931"/>`;
      break;
    case 'Halloween':
      hatPixels = `<rect x="4" y="1" width="8" height="3" fill="#ff8a1f"/><rect x="7" y="0" width="2" height="1" fill="#40cc8c"/>`;
      break;
    case 'Nuclear':
      hatPixels = `<rect x="5" y="4" width="6" height="2" fill="#c6ff00"/><rect x="6" y="1" width="4" height="2" fill="#ffb830"/>`;
      break;
    default:
      hatPixels = `<rect x="5" y="2" width="6" height="1" fill="${PALETTE.BODY_DARK}"/>`;
      break;
  }

  return `<svg viewBox="0 0 16 16" shape-rendering="crispEdges" class="kf-pixel-svg">
    <rect x="4" y="3" width="8" height="10" fill="${PALETTE.OUTLINE}"/>
    <rect x="3" y="5" width="10" height="7" fill="${PALETTE.OUTLINE}"/>
    <rect x="5" y="4" width="6" height="8" fill="${body}"/>
    <rect x="4" y="6" width="8" height="5" fill="${body}"/>
    <rect x="6" y="7" width="4" height="5" fill="${belly}"/>
    <rect x="5" y="5" width="1" height="1" fill="#ffffff"/>
    <rect x="10" y="5" width="1" height="1" fill="#ffffff"/>
    <rect x="7" y="6" width="2" height="1" fill="${PALETTE.BEAK_BRIGHT}"/>
    <rect x="4" y="7" width="8" height="2" fill="${accent}"/>
    <rect x="11" y="8" width="2" height="2" fill="${accent}"/>
    <rect x="5" y="13" width="2" height="2" fill="${PALETTE.BEAK_BRIGHT}"/>
    <rect x="9" y="13" width="2" height="2" fill="${PALETTE.BEAK_BRIGHT}"/>
    ${hatPixels}
  </svg>`;
}

function renderJeffSkinSvg(skinId: JeffSkinId): string {
  const meta = JEFF_SKIN_CATALOG[skinId];
  let detail = `<rect x="5" y="6" width="2" height="2" fill="#ffffff"/><rect x="9" y="6" width="2" height="2" fill="#ffffff"/><rect x="6" y="7" width="1" height="1" fill="#222034"/><rect x="10" y="7" width="1" height="1" fill="#222034"/>`;
  if (skinId === 'Bowling') {
    detail = `<rect x="6" y="5" width="2" height="2" fill="#13123a"/><rect x="9" y="5" width="2" height="2" fill="#13123a"/><rect x="7" y="8" width="2" height="2" fill="#13123a"/>`;
  } else if (skinId === 'Headless') {
    detail = `<rect x="7" y="2" width="2" height="2" fill="#40cc8c"/><rect x="5" y="7" width="2" height="2" fill="#ffb830"/><rect x="9" y="7" width="2" height="2" fill="#ffb830"/><rect x="6" y="10" width="4" height="1" fill="#ffb830"/>`;
  } else if (skinId === 'Prisoner') {
    detail = `<rect x="6" y="1" width="4" height="2" fill="#9badb7"/><rect x="5" y="7" width="6" height="1" fill="#222034"/><rect x="5" y="9" width="6" height="1" fill="#222034"/>`;
  } else if (skinId === 'Dwarf') {
    detail = `<rect x="4" y="3" width="8" height="3" fill="#ffb830"/><rect x="7" y="4" width="2" height="2" fill="#ffffff"/><rect x="5" y="10" width="6" height="3" fill="#8f563b"/>`;
  } else if (skinId === 'Scuba') {
    detail = `<rect x="5" y="5" width="6" height="6" fill="#38e8ff"/><rect x="6" y="6" width="4" height="4" fill="#1f3347"/><rect x="7" y="7" width="2" height="2" fill="#ffffff"/>`;
  }

  return `<svg viewBox="0 0 16 16" shape-rendering="crispEdges" class="kf-pixel-svg">
    <rect x="3" y="4" width="10" height="9" fill="${PALETTE.OUTLINE}"/>
    <rect x="4" y="3" width="8" height="11" fill="${PALETTE.OUTLINE}"/>
    <rect x="4" y="4" width="8" height="9" fill="${meta.tint}"/>
    <rect x="5" y="5" width="6" height="2" fill="rgba(255,255,255,0.2)"/>
    ${detail}
  </svg>`;
}

function renderRopeSkinSvg(skinId: RopeSkinId): string {
  const meta = ROPE_SKIN_CATALOG[skinId];
  const segs: string[] = [];
  for (let i = 0; i < 8; i++) {
    const x = 2 + i * 4;
    const y = i % 2 === 0 ? 3 : 4;
    const col = i % 2 === 0 ? meta.primaryColor : meta.secondaryColor;
    segs.push(`<rect x="${x}" y="${y}" width="4" height="3" fill="${col}"/>`);
  }
  return `<svg viewBox="0 0 36 10" shape-rendering="crispEdges" class="kf-pixel-svg">
    <rect x="1" y="2" width="34" height="6" fill="${PALETTE.OUTLINE}"/>
    ${segs.join('')}
  </svg>`;
}

function renderPhotoSceneSvg(photo: PhotoMeta, unlocked: boolean): string {
  if (!unlocked) {
    return `<svg viewBox="0 0 64 44" shape-rendering="crispEdges" class="kf-pixel-svg">
      <rect width="64" height="44" fill="#17142b"/>
      <rect x="2" y="2" width="60" height="40" fill="#221e3b"/>
      <rect x="26" y="13" width="12" height="8" fill="none" stroke="#6d58b7" stroke-width="2"/>
      <rect x="23" y="20" width="18" height="13" fill="#3f3f74"/>
      <rect x="30" y="24" width="4" height="5" fill="#17142b"/>
    </svg>`;
  }

  const skyByZone: Record<PhotoMeta['zone'], [string, string, string]> = {
    village: ['#2b1d41', '#6d58b7', '#ffffff'],
    foothills: ['#24345c', '#5d7285', '#cbdbfc'],
    mines: ['#1f1321', '#45283c', '#7a4537'],
    crags: ['#1d284d', '#543b58', '#cadafb'],
    summit: ['#13123a', '#6d58b7', '#d7b7ed'],
    lab: ['#141e2e', '#1f3347', '#38e8ff'],
    boss: ['#1a1026', '#810b3d', '#ffb830'],
  };
  const [bg, mid, hi] = skyByZone[photo.zone];
  const accentDetail =
    photo.zone === 'village'
      ? `<rect x="10" y="22" width="16" height="12" fill="#7a4537"/><polygon points="8,22 18,14 28,22" fill="#d11651"/><rect x="34" y="29" width="6" height="5" fill="#ffb830"/>`
      : photo.zone === 'mines'
        ? `<rect x="0" y="0" width="64" height="44" fill="#1f1321"/><polygon points="22,22 44,14 44,30" fill="rgba(255,184,48,0.28)"/><rect x="8" y="34" width="48" height="10" fill="#663941"/>`
        : photo.zone === 'lab'
          ? `<rect x="4" y="28" width="56" height="4" fill="#5d7285"/><rect x="42" y="12" width="12" height="16" fill="#38e8ff"/><rect x="44" y="14" width="8" height="12" fill="#1f3347"/>`
          : photo.zone === 'boss'
            ? `<rect x="20" y="10" width="24" height="22" fill="#5d7285"/><rect x="25" y="15" width="14" height="5" fill="#ff2e63"/><rect x="10" y="32" width="44" height="12" fill="#1f3347"/>`
            : `<polygon points="0,44 18,16 38,44" fill="${mid}"/><polygon points="24,44 46,12 64,44" fill="${hi}"/>`;

  return `<svg viewBox="0 0 64 44" shape-rendering="crispEdges" class="kf-pixel-svg">
    <rect width="64" height="44" fill="${bg}"/>
    <rect x="6" y="6" width="2" height="2" fill="#ffffff"/>
    <rect x="52" y="8" width="2" height="2" fill="#ffffff"/>
    <rect x="32" y="5" width="2" height="2" fill="${hi}"/>
    ${accentDetail}
    <rect x="0" y="34" width="64" height="10" fill="${hi}"/>
    <rect x="17" y="25" width="6" height="9" fill="#3f3f74"/>
    <rect x="17" y="28" width="6" height="2" fill="${PALETTE.KRUNKED_SCARF}"/>
    <rect x="38" y="25" width="6" height="9" fill="#3f3f74"/>
    <rect x="38" y="28" width="6" height="2" fill="${PALETTE.FRED_SCARF}"/>
    <line x1="23" y1="30" x2="38" y2="30" stroke="#9badb7" stroke-width="2"/>
  </svg>`;
}

function renderManualDiagramSvg(pageId: ManualPageId): string {
  switch (pageId) {
    case 'Swing':
      return `<svg viewBox="0 0 120 64" shape-rendering="crispEdges" class="kf-pixel-svg">
        <rect width="120" height="64" fill="#13123a"/>
        <rect x="0" y="24" width="38" height="40" fill="#3f3f74"/>
        <rect x="0" y="22" width="38" height="4" fill="#ffffff"/>
        <rect x="86" y="24" width="34" height="40" fill="#3f3f74"/>
        <rect x="86" y="22" width="34" height="4" fill="#ffffff"/>
        <rect x="26" y="13" width="8" height="9" fill="#3f3f74"/>
        <rect x="26" y="16" width="8" height="2" fill="${PALETTE.KRUNKED_SCARF}"/>
        <line x1="34" y1="19" x2="62" y2="44" stroke="#9badb7" stroke-width="2"/>
        <path d="M40 46 Q62 58 84 30" fill="none" stroke="#ffb830" stroke-width="2" stroke-dasharray="4 3"/>
        <rect x="58" y="40" width="8" height="9" fill="#3f3f74"/>
        <rect x="58" y="43" width="8" height="2" fill="${PALETTE.FRED_SCARF}"/>
        <polygon points="86,28 80,29 84,35" fill="#ffb830"/>
      </svg>`;
    case 'Grab':
      return `<svg viewBox="0 0 120 64" shape-rendering="crispEdges" class="kf-pixel-svg">
        <rect width="120" height="64" fill="#13123a"/>
        <rect x="16" y="4" width="24" height="60" fill="#6d58b7"/>
        <rect x="36" y="4" width="4" height="60" fill="#cbdbfc"/>
        <rect x="40" y="26" width="9" height="11" fill="#3f3f74"/>
        <rect x="40" y="30" width="9" height="2" fill="${PALETTE.KRUNKED_SCARF}"/>
        <rect x="54" y="12" width="50" height="8" fill="#222034"/>
        <rect x="56" y="14" width="32" height="4" fill="#40cc8c"/>
        <rect x="88" y="14" width="14" height="4" fill="#d11651"/>
        <path d="M49 30 Q68 26 78 42" fill="none" stroke="#38e8ff" stroke-width="2" stroke-dasharray="3 2"/>
        <polygon points="80,45 74,42 79,38" fill="#38e8ff"/>
      </svg>`;
    case 'Mines':
      return `<svg viewBox="0 0 120 64" shape-rendering="crispEdges" class="kf-pixel-svg">
        <rect width="120" height="64" fill="#1f1321"/>
        <polygon points="28,28 96,10 96,46" fill="rgba(255,184,48,0.22)"/>
        <rect x="18" y="22" width="10" height="12" fill="#3f3f74"/>
        <rect x="26" y="23" width="4" height="3" fill="#ffb830"/>
        <rect x="56" y="40" width="22" height="12" fill="#663941"/>
        <line x1="60" y1="40" x2="66" y2="52" stroke="#1f1321" stroke-width="2"/>
        <line x1="72" y1="40" x2="68" y2="52" stroke="#1f1321" stroke-width="2"/>
        <rect x="86" y="40" width="22" height="12" fill="#7a4537"/>
      </svg>`;
    case 'Ice':
      return `<svg viewBox="0 0 120 64" shape-rendering="crispEdges" class="kf-pixel-svg">
        <rect width="120" height="64" fill="#13123a"/>
        <rect x="8" y="44" width="104" height="14" fill="#b6aaf0"/>
        <rect x="8" y="42" width="104" height="4" fill="#cadafb"/>
        <rect x="18" y="45" width="16" height="2" fill="#ffffff"/>
        <rect x="64" y="45" width="22" height="2" fill="#ffffff"/>
        <rect x="66" y="31" width="9" height="11" fill="#3f3f74"/>
        <rect x="66" y="34" width="9" height="2" fill="${PALETTE.FRED_SCARF}"/>
        <line x1="28" y1="38" x2="60" y2="38" stroke="#38e8ff" stroke-width="2" stroke-dasharray="6 3"/>
        <line x1="36" y1="34" x2="56" y2="34" stroke="#ffffff" stroke-width="2" stroke-dasharray="4 4"/>
      </svg>`;
    case 'Wind':
      return `<svg viewBox="0 0 120 64" shape-rendering="crispEdges" class="kf-pixel-svg">
        <rect width="120" height="64" fill="#1d284d"/>
        <line x1="62" y1="4" x2="72" y2="38" stroke="#9badb7" stroke-width="2"/>
        <rect x="54" y="38" width="34" height="6" fill="#7a4537"/>
        <rect x="66" y="27" width="9" height="11" fill="#3f3f74"/>
        <rect x="66" y="30" width="9" height="2" fill="${PALETTE.KRUNKED_SCARF}"/>
        <path d="M10 18 H46 M14 28 H54 M8 48 H42" stroke="#cadafb" stroke-width="2"/>
        <polygon points="58,28 50,24 50,32" fill="#cadafb"/>
      </svg>`;
    case 'Assist':
      return `<svg viewBox="0 0 120 64" shape-rendering="crispEdges" class="kf-pixel-svg">
        <rect width="120" height="64" fill="#13123a"/>
        <rect x="8" y="44" width="104" height="20" fill="#3f3f74"/>
        <rect x="8" y="42" width="104" height="4" fill="#ffffff"/>
        <rect x="26" y="18" width="3" height="24" fill="#cbdbfc"/>
        <polygon points="29,18 46,24 29,30" fill="#d11651"/>
        <rect x="74" y="12" width="18" height="10" fill="#df7126"/>
        <rect x="70" y="14" width="6" height="4" fill="#ffb830"/>
        <rect x="92" y="14" width="6" height="4" fill="#ffb830"/>
        <rect x="79" y="24" width="8" height="9" fill="#3f3f74"/>
        <line x1="83" y1="22" x2="83" y2="24" stroke="#ffffff" stroke-width="2"/>
      </svg>`;
    case 'Emotes':
      return `<svg viewBox="0 0 120 64" shape-rendering="crispEdges" class="kf-pixel-svg">
        <rect width="120" height="64" fill="#13123a"/>
        <rect x="0" y="48" width="120" height="16" fill="#3f3f74"/>
        <rect x="28" y="34" width="10" height="14" fill="#3f3f74"/>
        <rect x="28" y="38" width="10" height="2" fill="${PALETTE.KRUNKED_SCARF}"/>
        <rect x="82" y="34" width="10" height="14" fill="#3f3f74"/>
        <rect x="82" y="38" width="10" height="2" fill="${PALETTE.FRED_SCARF}"/>
        <rect x="20" y="12" width="26" height="16" fill="#ffffff"/>
        <rect x="28" y="16" width="10" height="8" fill="#d11651"/>
        <rect x="74" y="12" width="26" height="16" fill="#ffffff"/>
        <rect x="82" y="15" width="10" height="10" fill="#25af7c"/>
        <rect x="55" y="18" width="10" height="6" fill="#ffb830"/>
      </svg>`;
  }
}

export function renderMedalSvg(tier: MedalTier): string {
  const colors: Record<MedalTier, [string, string, string]> = {
    platinum: ['#38e8ff', '#ffffff', '#6d58b7'],
    gold: ['#ffb830', '#fff0a8', '#df7126'],
    silver: ['#cbdbfc', '#ffffff', '#5d7285'],
    bronze: ['#df7126', '#f2a666', '#663931'],
    none: ['#3f3f74', '#5d7285', '#222034'],
  };
  const [main, hi, rim] = colors[tier];
  return `<svg viewBox="0 0 24 24" shape-rendering="crispEdges" class="kf-pixel-svg">
    <rect x="7" y="1" width="4" height="7" fill="${PALETTE.KRUNKED_SCARF}"/>
    <rect x="13" y="1" width="4" height="7" fill="${PALETTE.FRED_SCARF}"/>
    <rect x="5" y="8" width="14" height="14" fill="${PALETTE.OUTLINE}"/>
    <rect x="6" y="7" width="12" height="16" fill="${PALETTE.OUTLINE}"/>
    <rect x="6" y="9" width="12" height="12" fill="${rim}"/>
    <rect x="7" y="10" width="10" height="10" fill="${main}"/>
    <rect x="9" y="11" width="4" height="3" fill="${hi}"/>
    <rect x="11" y="13" width="2" height="4" fill="${hi}"/>
  </svg>`;
}

function renderAchievementSvg(meta: AchievementMeta, unlocked: boolean): string {
  const catColor: Record<AchievementMeta['category'], string> = {
    climb: '#40cc8c',
    coop: '#d11651',
    collect: '#ffb830',
    mastery: '#38e8ff',
    lab: '#c6ff00',
  };
  const main = unlocked ? catColor[meta.category] : '#3f3f74';
  const hi = unlocked ? '#ffffff' : '#5d7285';
  return `<svg viewBox="0 0 24 24" shape-rendering="crispEdges" class="kf-pixel-svg">
    <rect x="4" y="4" width="16" height="11" fill="${PALETTE.OUTLINE}"/>
    <rect x="6" y="5" width="12" height="9" fill="${main}"/>
    <rect x="3" y="6" width="3" height="5" fill="${main}"/>
    <rect x="18" y="6" width="3" height="5" fill="${main}"/>
    <rect x="8" y="6" width="3" height="3" fill="${hi}"/>
    <rect x="10" y="14" width="4" height="4" fill="${main}"/>
    <rect x="7" y="18" width="10" height="3" fill="${PALETTE.OUTLINE}"/>
    <rect x="8" y="19" width="8" height="2" fill="${hi}"/>
  </svg>`;
}

function renderGamepadDiagramSvg(layout: GamepadVisualLayout): string {
  const labels: Record<
    GamepadVisualLayout,
    { south: string; east: string; west: string; north: string; lb: string; rb: string; start: string; title: string }
  > = {
    xbox: { south: 'A', east: 'B', west: 'X', north: 'Y', lb: 'LB/LT', rb: 'RB/RT', start: 'MENU', title: 'XBOX / XINPUT' },
    playstation: { south: '✕', east: '○', west: '□', north: '△', lb: 'L1/L2', rb: 'R1/R2', start: 'OPT', title: 'PLAYSTATION DUALSENSE' },
    switch: { south: 'B', east: 'A', west: 'Y', north: 'X', lb: 'L/ZL', rb: 'R/ZR', start: '+', title: 'NINTENDO SWITCH PRO' },
    tesla: { south: 'A', east: 'B', west: 'X', north: 'Y', lb: 'LB/LT', rb: 'RB/RT', start: 'START', title: 'TESLA USB / BLUETOOTH HID' },
  };
  const g = labels[layout];
  return `<svg viewBox="0 0 240 108" shape-rendering="crispEdges" class="kf-pixel-svg">
    <rect width="240" height="108" fill="#17142b"/>
    <rect x="34" y="20" width="172" height="62" rx="14" fill="#2b1d41" stroke="#6d58b7" stroke-width="3"/>
    <rect x="48" y="12" width="38" height="10" fill="#3f3f74" stroke="#cbdbfc" stroke-width="1"/>
    <rect x="154" y="12" width="38" height="10" fill="#3f3f74" stroke="#cbdbfc" stroke-width="1"/>
    <text x="67" y="20" text-anchor="middle" fill="#ffffff" font-size="7" font-family="monospace">${escapeXml(g.lb)}</text>
    <text x="173" y="20" text-anchor="middle" fill="#ffffff" font-size="7" font-family="monospace">${escapeXml(g.rb)}</text>
    <!-- D-Pad -->
    <rect x="60" y="38" width="10" height="26" fill="#5d7285"/>
    <rect x="52" y="46" width="26" height="10" fill="#5d7285"/>
    <!-- Sticks -->
    <circle cx="94" cy="64" r="9" fill="#3f3f74" stroke="#cbdbfc" stroke-width="2"/>
    <circle cx="146" cy="64" r="9" fill="#3f3f74" stroke="#cbdbfc" stroke-width="2"/>
    <text x="94" y="67" text-anchor="middle" fill="#ffffff" font-size="6" font-family="monospace">LS</text>
    <text x="146" y="67" text-anchor="middle" fill="#ffffff" font-size="6" font-family="monospace">RS</text>
    <!-- Center Buttons -->
    <rect x="106" y="38" width="10" height="6" fill="#9badb7"/>
    <rect x="124" y="38" width="10" height="6" fill="#ffb830"/>
    <!-- Face Buttons -->
    <circle cx="176" cy="62" r="7" fill="${PALETTE.FRED_SCARF}"/>
    <circle cx="190" cy="50" r="7" fill="${PALETTE.KRUNKED_SCARF}"/>
    <circle cx="162" cy="50" r="7" fill="${PALETTE.LAB_CYAN}"/>
    <circle cx="176" cy="38" r="7" fill="${PALETTE.LAB_AMBER}"/>
    <text x="176" y="65" text-anchor="middle" fill="#13123a" font-size="8" font-weight="bold" font-family="monospace">${escapeXml(g.south)}</text>
    <text x="190" y="53" text-anchor="middle" fill="#ffffff" font-size="8" font-weight="bold" font-family="monospace">${escapeXml(g.east)}</text>
    <text x="162" y="53" text-anchor="middle" fill="#13123a" font-size="8" font-weight="bold" font-family="monospace">${escapeXml(g.west)}</text>
    <text x="176" y="41" text-anchor="middle" fill="#13123a" font-size="8" font-weight="bold" font-family="monospace">${escapeXml(g.north)}</text>
    <text x="120" y="99" text-anchor="middle" fill="#cbdbfc" font-size="8" font-weight="bold" font-family="monospace">${escapeXml(g.title)} • ${escapeXml(g.start)} = PAUSE</text>
  </svg>`;
}

function injectMetaStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(META_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = META_STYLE_ID;
  style.textContent = `
@keyframes kf-eq-bounce {
  0%, 100% { transform: scaleY(0.25); }
  50% { transform: scaleY(1.0); }
}

@keyframes kf-toast-in {
  from { opacity: 0; transform: translateX(28px); }
  to { opacity: 1; transform: translateX(0); }
}

.kf-panel.kf-panel-wide {
  width: min(760px, 96vw);
  max-height: 88vh;
}

.kf-pixel-svg {
  width: 100%;
  height: 100%;
  display: block;
  image-rendering: pixelated;
}

.kf-tabs-bar {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}

.kf-tab-btn {
  padding: 6px 10px;
  background: rgba(43, 29, 65, 0.9);
  color: ${PALETTE.SNOW_LIGHT};
  border: 2px solid ${PALETTE.OUTLINE};
  font-family: 'Courier New', Courier, monospace;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  cursor: pointer;
}

.kf-tab-btn.is-active {
  background: ${PALETTE.CLIFF_MID};
  color: ${PALETTE.BELLY_WHITE};
  border-color: ${PALETTE.BEAK_BRIGHT};
  box-shadow: inset 0 0 0 1px ${PALETTE.BELLY_WHITE};
}

.kf-tab-hint {
  margin-left: auto;
  font-size: 10px;
  color: ${PALETTE.LAB_CYAN};
  font-weight: 700;
}

.kf-meta-scroll {
  overflow-y: auto;
  max-height: 55vh;
  padding-right: 4px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Skin Closet */
.kf-skin-stage {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: rgba(34, 32, 52, 0.9);
  border: 2px solid ${PALETTE.CLIFF_DARK};
  padding: 8px 12px;
  flex-wrap: wrap;
}

.kf-skin-duo-preview {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kf-avatar-box {
  width: 44px;
  height: 44px;
  background: #13123a;
  border: 2px solid ${PALETTE.OUTLINE};
  padding: 3px;
  flex-shrink: 0;
}

.kf-rope-preview-box {
  width: 68px;
  height: 20px;
  background: #13123a;
  border: 2px solid ${PALETTE.OUTLINE};
  padding: 2px;
  flex-shrink: 0;
}

.kf-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(156px, 1fr));
  gap: 7px;
}

.kf-skin-card {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 8px;
  background: rgba(43, 29, 65, 0.88);
  border: 2px solid ${PALETTE.OUTLINE};
  color: ${PALETTE.BELLY_WHITE};
  font-family: 'Courier New', Courier, monospace;
  text-align: left;
  cursor: pointer;
}

.kf-skin-card.is-selected {
  background: ${PALETTE.CLIFF_MID};
  border-color: ${PALETTE.BELLY_WHITE};
  box-shadow: inset 0 0 0 2px ${PALETTE.BEAK_BRIGHT};
}

.kf-skin-card-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.kf-skin-badge-row {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.kf-mini-tag {
  font-size: 9px;
  font-weight: 900;
  padding: 1px 5px;
  border: 1px solid ${PALETTE.OUTLINE};
  text-transform: uppercase;
}

.kf-tag-p1 { background: ${PALETTE.KRUNKED_SCARF}; color: #fff; }
.kf-tag-p2 { background: ${PALETTE.FRED_SCARF}; color: #13123a; }
.kf-tag-eq { background: ${PALETTE.LAB_AMBER}; color: #13123a; }
.kf-tag-zone { background: ${PALETTE.CLIFF_DARK}; color: ${PALETTE.SNOW_LIGHT}; }

/* Polaroid Album */
.kf-album-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

@media (max-width: 600px) {
  .kf-album-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.kf-polaroid-card {
  background: #f4f6ff;
  color: ${PALETTE.OUTLINE};
  border: 2px solid ${PALETTE.OUTLINE};
  padding: 5px 5px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: pointer;
  font-family: 'Courier New', Courier, monospace;
  text-align: left;
  box-shadow: 0 3px 0 ${PALETTE.OUTLINE};
}

.kf-polaroid-card.is-locked {
  background: #2b2640;
  color: ${PALETTE.SNOW_LIGHT};
}

.kf-polaroid-card.is-selected {
  outline: 3px solid ${PALETTE.BEAK_BRIGHT};
  transform: translateY(-2px);
}

.kf-polaroid-art {
  width: 100%;
  aspect-ratio: 64 / 44;
  background: #13123a;
  border: 1px solid ${PALETTE.OUTLINE};
  overflow: hidden;
}

.kf-polaroid-title {
  font-size: 10px;
  font-weight: 900;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kf-spotlight-box {
  display: flex;
  gap: 12px;
  align-items: center;
  background: rgba(34, 32, 52, 0.92);
  border: 2px solid ${PALETTE.CLIFF_MID};
  padding: 9px 12px;
}

/* Field Manual */
.kf-manual-layout {
  display: grid;
  grid-template-columns: 168px 1fr;
  gap: 10px;
}

@media (max-width: 620px) {
  .kf-manual-layout {
    grid-template-columns: 1fr;
  }
}

.kf-manual-spread {
  background: #221d38;
  border: 2px solid ${PALETTE.CLIFF_MID};
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.kf-manual-diagram {
  width: 100%;
  max-height: 126px;
  aspect-ratio: 120 / 64;
  border: 2px solid ${PALETTE.OUTLINE};
  background: #13123a;
  overflow: hidden;
}

.kf-manual-hint {
  background: rgba(19, 18, 58, 0.9);
  border: 1px solid ${PALETTE.LAB_CYAN};
  color: ${PALETTE.LAB_CYAN};
  padding: 6px 8px;
  font-size: 11px;
  font-weight: 700;
}

/* Jukebox */
.kf-jukebox-stage {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: rgba(31, 51, 71, 0.72);
  border: 2px solid ${PALETTE.LAB_CYAN};
  padding: 10px 12px;
}

.kf-eq-bars {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 28px;
  flex-shrink: 0;
}

.kf-eq-bar {
  width: 6px;
  height: 100%;
  background: ${PALETTE.FRED_SCARF};
  transform-origin: bottom;
  animation: kf-eq-bounce 0.55s steps(4, end) infinite;
}

.kf-eq-bars.is-muted .kf-eq-bar {
  animation: none;
  transform: scaleY(0.18);
  background: ${PALETTE.CLIFF_DARK};
}

/* Achievements */
.kf-ach-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 7px;
}

.kf-ach-card {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 8px;
  background: rgba(43, 29, 65, 0.88);
  border: 2px solid ${PALETTE.OUTLINE};
  font-family: 'Courier New', Courier, monospace;
  color: ${PALETTE.BELLY_WHITE};
  text-align: left;
  cursor: pointer;
}

.kf-ach-card.is-unlocked {
  border-color: ${PALETTE.LAB_AMBER};
  background: rgba(58, 43, 89, 0.92);
}

.kf-ach-card.is-selected {
  box-shadow: inset 0 0 0 2px ${PALETTE.BELLY_WHITE};
}

/* Time Trials */
.kf-tt-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  background: rgba(43, 29, 65, 0.9);
  border: 2px solid ${PALETTE.OUTLINE};
  color: ${PALETTE.BELLY_WHITE};
  font-family: 'Courier New', Courier, monospace;
  cursor: pointer;
  text-align: left;
  width: 100%;
}

.kf-tt-row.is-selected {
  background: ${PALETTE.CLIFF_MID};
  border-color: ${PALETTE.BELLY_WHITE};
  box-shadow: inset 0 0 0 2px ${PALETTE.BEAK_BRIGHT};
}

.kf-tt-pars {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 10px;
  margin-top: 3px;
}

/* Online Lobby */
.kf-online-status-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 10px;
  background: rgba(20, 30, 46, 0.92);
  border: 2px solid ${PALETTE.LAB_CYAN};
  font-size: 11px;
}

.kf-code-area {
  width: 100%;
  min-height: 54px;
  padding: 7px 8px;
  background: #13123a;
  color: ${PALETTE.LAB_CYAN};
  border: 2px solid ${PALETTE.CLIFF_MID};
  font-family: 'Courier New', Courier, monospace;
  font-size: 10px;
  resize: vertical;
}

.kf-webrtc-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

@media (max-width: 640px) {
  .kf-webrtc-grid {
    grid-template-columns: 1fr;
  }
}

.kf-webrtc-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px;
  background: rgba(34, 32, 52, 0.85);
  border: 2px solid ${PALETTE.CLIFF_DARK};
}

/* Controls & Gamepad Remapper */
.kf-controls-layout {
  display: grid;
  grid-template-columns: 1.25fr 1fr;
  gap: 10px;
}

@media (max-width: 660px) {
  .kf-controls-layout {
    grid-template-columns: 1fr;
  }
}

.kf-key-pill {
  padding: 2px 7px;
  background: #13123a;
  border: 2px solid ${PALETTE.CLIFF_MID};
  color: ${PALETTE.LAB_AMBER};
  font-size: 11px;
  font-weight: 900;
}

.kf-key-pill.is-capturing {
  background: ${PALETTE.KRUNKED_SCARF};
  color: #ffffff;
  border-color: #ffffff;
}

/* Progress Bar */
.kf-progress-bar {
  width: 100%;
  height: 8px;
  background: ${PALETTE.OUTLINE};
  border: 1px solid ${PALETTE.CLIFF_MID};
  overflow: hidden;
}

.kf-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, ${PALETTE.KRUNKED_SCARF}, ${PALETTE.LAB_AMBER}, ${PALETTE.FRED_SCARF});
}

/* ---- Live Gameplay Overlays: Emote Wheel, Toasts, Online HUD Pill ---- */
.kf-emote-wheel {
  position: absolute;
  left: 50%;
  bottom: 22px;
  transform: translateX(-50%);
  z-index: 35;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  background: rgba(19, 18, 58, 0.94);
  border: 3px solid ${PALETTE.OUTLINE};
  box-shadow: inset 0 0 0 2px ${PALETTE.LAB_AMBER}, 0 5px 0 ${PALETTE.OUTLINE};
  font-family: 'Courier New', Courier, monospace;
  color: ${PALETTE.BELLY_WHITE};
  pointer-events: auto;
}

.kf-emote-wheel.is-hidden {
  display: none;
  pointer-events: none;
}

.kf-emote-row {
  display: flex;
  gap: 6px;
}

.kf-emote-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 68px;
  padding: 7px 8px;
  background: rgba(43, 29, 65, 0.92);
  color: ${PALETTE.BELLY_WHITE};
  border: 2px solid ${PALETTE.OUTLINE};
  font-family: 'Courier New', Courier, monospace;
  font-size: 10px;
  font-weight: 900;
  cursor: pointer;
}

.kf-emote-btn.is-selected {
  background: ${PALETTE.CLIFF_MID};
  border-color: ${PALETTE.BELLY_WHITE};
  box-shadow: inset 0 0 0 2px ${PALETTE.BEAK_BRIGHT};
}

.kf-toast-stack {
  position: absolute;
  right: 12px;
  bottom: 14px;
  z-index: 45;
  display: flex;
  flex-direction: column;
  gap: 6px;
  pointer-events: none;
  max-width: min(320px, 88vw);
}

.kf-toast {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 11px;
  background: rgba(19, 18, 58, 0.95);
  border: 3px solid ${PALETTE.OUTLINE};
  box-shadow: inset 0 0 0 2px ${PALETTE.LAB_AMBER}, 0 4px 0 ${PALETTE.OUTLINE};
  color: ${PALETTE.BELLY_WHITE};
  font-family: 'Courier New', Courier, monospace;
  animation: kf-toast-in 160ms ease-out;
}

.kf-online-hud {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 25;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  background: rgba(19, 18, 58, 0.88);
  border: 2px solid ${PALETTE.OUTLINE};
  box-shadow: inset 0 0 0 1px ${PALETTE.LAB_CYAN};
  color: ${PALETTE.BELLY_WHITE};
  font-family: 'Courier New', Courier, monospace;
  font-size: 10px;
  font-weight: 800;
  pointer-events: none;
  white-space: nowrap;
}

.kf-online-hud.is-hidden {
  display: none;
}

.kf-sync-dot {
  width: 8px;
  height: 8px;
  display: inline-block;
  border: 1px solid ${PALETTE.OUTLINE};
}
`;
  document.head.appendChild(style);
}

export class MetaScreens {
  private readonly callbacks: MetaScreenCallbacks;
  private artProvider: MetaArtProvider | null = null;

  // Interactive focus state for current rendered Meta screen
  private slots: FocusSlot[] = [];
  private selectedIndex = 0;

  // Per-screen sub-state
  private skinTab: SkinClosetTab = 'coop';
  private skinTarget: SkinEquipTarget = 'p1';
  private selectedPhotoIdx = 0;
  private selectedManualIdx = 0;
  private achFilter: AchievementFilter = 'all';
  private onlineTab: OnlineLobbyTab = 'broadcast';
  private broadcastChannelInput: string = DEFAULT_BROADCAST_CHANNEL;
  private webrtcOfferText = '';
  private webrtcAnswerInput = '';
  private webrtcRemoteOfferInput = '';
  private webrtcAnswerText = '';
  private webrtcBusy = false;
  private webrtcFeedback = '';
  private gamepadLayout: GamepadVisualLayout = 'xbox';

  // Interactive keybind capture state
  private capturingKey: keyof KeybindProfile | null = null;
  private captureListener: ((e: KeyboardEvent) => void) | null = null;

  // Gameplay Emote Wheel overlay
  private readonly emoteRoot: HTMLDivElement;
  private emoteWheelOpen = false;
  private emoteWheelIndex = 0;
  private emoteWheelWho: 'p1' | 'p2' = 'p1';
  private emoteAutoCloseTimer: ReturnType<typeof setTimeout> | null = null;

  // Toast notifications overlay
  private readonly toastRoot: HTMLDivElement;

  // Live Online Co-Op status pill overlay
  private readonly onlineHudRoot: HTMLDivElement;

  constructor(container: HTMLElement, callbacks: MetaScreenCallbacks, artProvider?: MetaArtProvider) {
    this.callbacks = callbacks;
    this.artProvider = artProvider ?? null;
    injectMetaStyles();

    this.emoteRoot = document.createElement('div');
    this.emoteRoot.id = 'krunked-emote-wheel';
    this.emoteRoot.className = 'kf-emote-wheel is-hidden';
    container.appendChild(this.emoteRoot);

    this.toastRoot = document.createElement('div');
    this.toastRoot.id = 'krunked-toast-stack';
    this.toastRoot.className = 'kf-toast-stack';
    container.appendChild(this.toastRoot);

    this.onlineHudRoot = document.createElement('div');
    this.onlineHudRoot.id = 'krunked-online-hud';
    this.onlineHudRoot.className = 'kf-online-hud is-hidden';
    container.appendChild(this.onlineHudRoot);
  }

  setArtProvider(provider: MetaArtProvider | null): void {
    this.artProvider = provider;
  }

  isManagedScreen(screen: MenuScreen): boolean {
    return (
      screen === 'skin_closet' ||
      screen === 'album' ||
      screen === 'manual' ||
      screen === 'jukebox' ||
      screen === 'achievements' ||
      screen === 'time_trials' ||
      screen === 'online_lobby' ||
      screen === 'controls_remap' ||
      screen === 'victory'
    );
  }

  isCapturingKey(): boolean {
    return this.capturingKey !== null;
  }

  cancelKeyCapture(): void {
    if (this.captureListener && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.captureListener, { capture: true });
    }
    this.captureListener = null;
    this.capturingKey = null;
  }

  /**
   * Captures the next physical key press cleanly in capture phase before KeyboardDriver,
   * supporting Escape to cancel without modifying any keybind.
   */
  captureNextKey(actionKey: keyof KeybindProfile, onCaptured: (code: string) => void): void {
    this.cancelKeyCapture();
    this.capturingKey = actionKey;
    this.callbacks.onRequestRerender();

    if (typeof window === 'undefined') return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const code = e.code;
      this.cancelKeyCapture();
      if (code && code !== 'Escape') {
        onCaptured(code);
      } else {
        this.callbacks.onUiSound('cancel');
        this.callbacks.onRequestRerender();
      }
    };
    this.captureListener = handler;
    window.addEventListener('keydown', handler, { capture: true });
  }

  resetScreenFocus(screen: MenuScreen, glyphStyle?: InputGlyphStyle): void {
    this.cancelKeyCapture();
    this.selectedIndex = 0;
    if (screen === 'controls_remap' && glyphStyle) {
      if (glyphStyle === 'playstation' || glyphStyle === 'switch' || glyphStyle === 'xbox') {
        this.gamepadLayout = glyphStyle;
      }
    }
  }

  // ---- Emote Wheel Overlay ----

  isEmoteWheelOpen(): boolean {
    return this.emoteWheelOpen;
  }

  openEmoteWheel(who: 'p1' | 'p2' = 'p1'): void {
    this.emoteWheelWho = who;
    this.emoteWheelOpen = true;
    this.emoteWheelIndex = 0;
    this.renderEmoteWheel();
    this.resetEmoteAutoClose();
  }

  closeEmoteWheel(): void {
    this.emoteWheelOpen = false;
    this.emoteRoot.classList.add('is-hidden');
    if (this.emoteAutoCloseTimer !== null) {
      clearTimeout(this.emoteAutoCloseTimer);
      this.emoteAutoCloseTimer = null;
    }
  }

  toggleEmoteWheel(who: 'p1' | 'p2' = 'p1'): void {
    if (this.emoteWheelOpen) {
      this.closeEmoteWheel();
    } else {
      this.openEmoteWheel(who);
    }
  }

  handleEmoteWheelNav(action: MenuNavAction): boolean {
    if (!this.emoteWheelOpen) return false;
    const len = EMOTE_WHEEL_OPTIONS.length;
    if (action === 'left' || action === 'up' || action === 'tab_prev') {
      this.emoteWheelIndex = (this.emoteWheelIndex - 1 + len) % len;
      this.callbacks.onUiSound('move');
      this.renderEmoteWheel();
      this.resetEmoteAutoClose();
      return true;
    }
    if (action === 'right' || action === 'down') {
      this.emoteWheelIndex = (this.emoteWheelIndex + 1) % len;
      this.callbacks.onUiSound('move');
      this.renderEmoteWheel();
      this.resetEmoteAutoClose();
      return true;
    }
    if (action === 'confirm') {
      const opt = EMOTE_WHEEL_OPTIONS[this.emoteWheelIndex];
      if (opt) {
        this.callbacks.onTriggerEmote(this.emoteWheelWho, opt.emote);
        this.callbacks.onUiSound('confirm');
      }
      this.closeEmoteWheel();
      return true;
    }
    if (action === 'back' || action === 'pause' || action === 'tab_next') {
      this.closeEmoteWheel();
      return true;
    }
    return false;
  }

  private renderEmoteWheel(): void {
    this.emoteRoot.classList.remove('is-hidden');
    this.emoteRoot.innerHTML = '';

    const title = document.createElement('div');
    title.style.fontSize = '10px';
    title.style.fontWeight = '900';
    title.style.color = PALETTE.LAB_AMBER;
    title.textContent = `EMOTE WHEEL (${this.emoteWheelWho === 'p1' ? 'KRUNKED' : 'FRED'}) • ←→ + ENTER / CLICK`;
    this.emoteRoot.appendChild(title);

    const row = document.createElement('div');
    row.className = 'kf-emote-row';
    EMOTE_WHEEL_OPTIONS.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `kf-emote-btn${idx === this.emoteWheelIndex ? ' is-selected' : ''}`;
      btn.dataset.emote = opt.emote;
      btn.innerHTML = `<span style="font-size:16px;line-height:1">${opt.icon}</span><span style="color:${opt.color}">${opt.label}</span><span style="font-size:9px;color:${PALETTE.SNOW_LIGHT}">[${opt.keyHint}]</span>`;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        btn.blur();
        this.callbacks.onTriggerEmote(this.emoteWheelWho, opt.emote);
        this.callbacks.onUiSound('confirm');
        this.closeEmoteWheel();
      });
      row.appendChild(btn);
    });
    this.emoteRoot.appendChild(row);
  }

  private resetEmoteAutoClose(): void {
    if (this.emoteAutoCloseTimer !== null) {
      clearTimeout(this.emoteAutoCloseTimer);
    }
    this.emoteAutoCloseTimer = setTimeout(() => {
      this.closeEmoteWheel();
    }, 4000);
  }

  // ---- Toast Notifications ----

  showToast(toast: ToastNotification): void {
    const el = document.createElement('div');
    el.className = 'kf-toast';
    const icon =
      toast.kind === 'achievement'
        ? '🏆'
        : toast.kind === 'photo'
          ? '📷'
          : toast.kind === 'manual'
            ? '📖'
            : '★';
    const borderCol =
      toast.kind === 'achievement'
        ? PALETTE.LAB_AMBER
        : toast.kind === 'photo'
          ? PALETTE.LAB_CYAN
          : PALETTE.FRED_SCARF;
    el.style.boxShadow = `inset 0 0 0 2px ${borderCol}, 0 4px 0 ${PALETTE.OUTLINE}`;

    el.innerHTML = `<span style="font-size:18px;flex-shrink:0">${icon}</span>
      <div style="display:flex;flex-direction:column;gap:2px;min-width:0">
        <div style="font-size:11px;font-weight:900;color:${borderCol};text-transform:uppercase">${escapeXml(toast.title)}</div>
        <div style="font-size:10px;color:${PALETTE.SNOW_LIGHT}">${escapeXml(toast.subtitle)}</div>
      </div>`;

    this.toastRoot.appendChild(el);
    while (this.toastRoot.childElementCount > 3) {
      this.toastRoot.firstElementChild?.remove();
    }

    setTimeout(() => {
      el.remove();
    }, 3800);
  }

  // ---- Online Co-Op Live HUD Pill ----

  updateOnlineHud(status: OnlineCoopStatusSnapshot, screen: MenuScreen): void {
    if (!status.active || screen !== 'playing') {
      this.onlineHudRoot.classList.add('is-hidden');
      return;
    }
    this.onlineHudRoot.classList.remove('is-hidden');
    const dotColor =
      status.error
        ? PALETTE.KRUNKED_SCARF
        : status.syncStatus === 'SYNCED'
          ? PALETTE.FRED_SCARF
          : status.syncStatus === 'RESYNCING'
            ? PALETTE.LAB_AMBER
            : PALETTE.LAB_CYAN;
    const roleLabel = status.role === 'host' ? 'HOST (KRUNKED)' : 'CLIENT (FRED)';
    const transportLabel = status.transport === 'broadcast' ? `TAB:${status.channelName}` : 'WEBRTC';
    const syncLabel = status.error
      ? `ERR: ${status.error}`
      : status.peerReady
        ? `${status.syncStatus} • ${status.rttMs}ms • T${status.localTick} • #${status.localHash || '--------'}`
        : `WAITING FOR PARTNER (${transportLabel})`;

    this.onlineHudRoot.innerHTML = `<span class="kf-sync-dot" style="background:${dotColor}"></span>
      <span>${escapeXml(roleLabel)}</span>
      <span style="color:${PALETTE.SNOW_LIGHT}">|</span>
      <span style="color:${dotColor}">${escapeXml(syncLabel)}</span>`;
  }

  // ---- Meta Screen Navigation ----

  handleNavAction(screen: MenuScreen, action: MenuNavAction, ctx: MetaRenderContext): void {
    if (this.capturingKey) return;

    if (action === 'tab_prev' || action === 'tab_next') {
      const dir: -1 | 1 = action === 'tab_prev' ? -1 : 1;
      if (this.stepScreenTab(screen, dir, ctx)) {
        this.callbacks.onUiSound('toggle');
        this.callbacks.onRequestRerender();
        return;
      }
    }

    const count = this.slots.length;
    if (action === 'up' && count > 0) {
      this.moveFocusVertical(-1);
      this.callbacks.onUiSound('move');
      return;
    }
    if (action === 'down' && count > 0) {
      this.moveFocusVertical(1);
      this.callbacks.onUiSound('move');
      return;
    }
    if (action === 'left' && count > 0) {
      const cur = this.slots[this.selectedIndex];
      if (cur?.onStep) {
        cur.onStep(-1);
        this.callbacks.onUiSound('toggle');
      } else {
        this.selectedIndex = (this.selectedIndex - 1 + count) % count;
        this.applyFocusHighlight();
        this.callbacks.onUiSound('move');
      }
      return;
    }
    if (action === 'right' && count > 0) {
      const cur = this.slots[this.selectedIndex];
      if (cur?.onStep) {
        cur.onStep(1);
        this.callbacks.onUiSound('toggle');
      } else {
        this.selectedIndex = (this.selectedIndex + 1) % count;
        this.applyFocusHighlight();
        this.callbacks.onUiSound('move');
      }
      return;
    }
    if (action === 'confirm' && count > 0) {
      const cur = this.slots[this.selectedIndex];
      if (cur?.onActivate) {
        this.callbacks.onUiSound('confirm');
        cur.onActivate();
      } else if (cur?.onStep) {
        this.callbacks.onUiSound('toggle');
        cur.onStep(1);
      }
      return;
    }
    if (action === 'back' || action === 'pause') {
      this.callbacks.onUiSound('cancel');
      this.callbacks.onBack();
    }
  }

  private stepScreenTab(screen: MenuScreen, dir: -1 | 1, ctx: MetaRenderContext): boolean {
    if (screen === 'skin_closet') {
      const tabs: SkinClosetTab[] = ['coop', 'jeff', 'rope'];
      const idx = tabs.indexOf(this.skinTab);
      this.skinTab = tabs[(idx + dir + tabs.length) % tabs.length];
      this.selectedIndex = 0;
      return true;
    }
    if (screen === 'manual') {
      const len = MANUAL_PAGE_LIST.length;
      this.selectedManualIdx = (this.selectedManualIdx + dir + len) % len;
      return true;
    }
    if (screen === 'achievements') {
      const filters: AchievementFilter[] = ['all', 'climb', 'coop', 'collect', 'mastery', 'lab'];
      const idx = filters.indexOf(this.achFilter);
      this.achFilter = filters[(idx + dir + filters.length) % filters.length];
      this.selectedIndex = 0;
      return true;
    }
    if (screen === 'online_lobby') {
      this.onlineTab = this.onlineTab === 'broadcast' ? 'webrtc' : 'broadcast';
      this.selectedIndex = 0;
      return true;
    }
    if (screen === 'controls_remap') {
      const layouts: GamepadVisualLayout[] = ['xbox', 'playstation', 'switch', 'tesla'];
      const idx = layouts.indexOf(this.gamepadLayout);
      this.gamepadLayout = layouts[(idx + dir + layouts.length) % layouts.length];
      return true;
    }
    if (screen === 'album') {
      const len = PHOTO_LIST.length;
      this.selectedPhotoIdx = (this.selectedPhotoIdx + dir + len) % len;
      this.selectedIndex = this.selectedPhotoIdx;
      return true;
    }
    void ctx;
    return false;
  }

  private moveFocusVertical(dir: -1 | 1): void {
    const cur = this.slots[this.selectedIndex];
    if (cur && cur.row !== undefined && cur.col !== undefined) {
      const targetRow = cur.row + dir;
      const sameCol = this.slots.findIndex((s) => s.row === targetRow && s.col === cur.col);
      if (sameCol !== -1) {
        this.selectedIndex = sameCol;
        this.applyFocusHighlight();
        return;
      }
      const anyInRow = this.slots.findIndex((s) => s.row === targetRow);
      if (anyInRow !== -1) {
        this.selectedIndex = anyInRow;
        this.applyFocusHighlight();
        return;
      }
    }
    this.selectedIndex = (this.selectedIndex + dir + this.slots.length) % this.slots.length;
    this.applyFocusHighlight();
  }

  // ---- Screen Rendering Entry Point ----

  renderScreen(screen: MenuScreen, panel: HTMLDivElement, ctx: MetaRenderContext): void {
    this.slots = [];
    panel.classList.add('kf-panel-wide');

    switch (screen) {
      case 'skin_closet':
        this.renderSkinCloset(panel, ctx);
        break;
      case 'album':
        this.renderAlbum(panel, ctx);
        break;
      case 'manual':
        this.renderManual(panel, ctx);
        break;
      case 'jukebox':
        this.renderJukebox(panel, ctx);
        break;
      case 'achievements':
        this.renderAchievements(panel, ctx);
        break;
      case 'time_trials':
        this.renderTimeTrials(panel, ctx);
        break;
      case 'online_lobby':
        this.renderOnlineLobby(panel, ctx);
        break;
      case 'controls_remap':
        this.renderControlsRemap(panel, ctx);
        break;
      case 'victory':
        this.renderVictoryCeremony(panel, ctx);
        break;
    }

    if (this.slots.length > 0) {
      this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, this.slots.length - 1));
      this.applyFocusHighlight();
    }
  }

  // ============================================================================
  // 1. Skin Closet (`skin_closet`)
  // ============================================================================

  private renderSkinCloset(panel: HTMLDivElement, ctx: MetaRenderContext): void {
    const skins = ctx.save.skins;
    panel.appendChild(this.makeTitleRow('SKIN CLOSET', `P1: ${skins.p1} • P2: ${skins.p2}`));

    // 3 Tabs: Co-Op Skins (16), Jeff Skins (6), Rope Skins (12)
    const tabsBar = document.createElement('div');
    tabsBar.className = 'kf-tabs-bar';
    const tabs: Array<[SkinClosetTab, string]> = [
      ['coop', `Co-Op Skins (${COOP_SKIN_LIST.length})`],
      ['jeff', `Jeff Skins (${JEFF_SKIN_LIST.length})`],
      ['rope', `Rope Skins (${ROPE_SKIN_LIST.length})`],
    ];
    for (const [id, label] of tabs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `kf-tab-btn${this.skinTab === id ? ' is-active' : ''}`;
      btn.textContent = label;
      btn.addEventListener('click', () => {
        this.skinTab = id;
        this.selectedIndex = 0;
        this.callbacks.onUiSound('toggle');
        this.callbacks.onRequestRerender();
      });
      tabsBar.appendChild(btn);
    }
    const hint = document.createElement('span');
    hint.className = 'kf-tab-hint';
    hint.textContent = this.getTabHintText(ctx.glyphStyle);
    tabsBar.appendChild(hint);
    panel.appendChild(tabsBar);

    // Live Equipped Duo + Rope + Jeff Preview Stage
    const stage = document.createElement('div');
    stage.className = 'kf-skin-stage';

    const duo = document.createElement('div');
    duo.className = 'kf-skin-duo-preview';

    const p1Box = document.createElement('div');
    p1Box.className = 'kf-avatar-box';
    mountArtOrSvg(p1Box, this.artProvider?.getCoopSkinPreview?.(skins.p1, 'p1'), renderPenguinSkinSvg(skins.p1, 'p1'));

    const ropeBox = document.createElement('div');
    ropeBox.className = 'kf-rope-preview-box';
    mountArtOrSvg(ropeBox, this.artProvider?.getRopeSkinPreview?.(skins.rope), renderRopeSkinSvg(skins.rope));

    const p2Box = document.createElement('div');
    p2Box.className = 'kf-avatar-box';
    mountArtOrSvg(p2Box, this.artProvider?.getCoopSkinPreview?.(skins.p2, 'p2'), renderPenguinSkinSvg(skins.p2, 'p2'));

    const jeffBox = document.createElement('div');
    jeffBox.className = 'kf-avatar-box';
    mountArtOrSvg(jeffBox, this.artProvider?.getJeffSkinPreview?.(skins.jeff), renderJeffSkinSvg(skins.jeff));

    duo.append(p1Box, ropeBox, p2Box, jeffBox);
    stage.appendChild(duo);

    if (this.skinTab === 'coop') {
      const targetBtn = document.createElement('button');
      targetBtn.type = 'button';
      targetBtn.className = 'kf-menu-item variant-pill';
      targetBtn.style.width = 'auto';
      const targetText =
        this.skinTarget === 'p1'
          ? 'EQUIPPING: P1 KRUNKED'
          : this.skinTarget === 'p2'
            ? 'EQUIPPING: P2 FRED'
            : 'EQUIPPING: BOTH PENGUINS';
      targetBtn.textContent = `◀ ${targetText} ▶`;
      const cycleTarget = (dir: -1 | 1) => {
        const list: SkinEquipTarget[] = ['p1', 'p2', 'both'];
        this.skinTarget = list[(list.indexOf(this.skinTarget) + dir + list.length) % list.length];
        this.callbacks.onRequestRerender();
      };
      this.registerSlot(targetBtn, {
        onActivate: () => cycleTarget(1),
        onStep: cycleTarget,
      });
      stage.appendChild(targetBtn);
    } else {
      const badge = document.createElement('div');
      badge.className = 'kf-panel-note';
      badge.textContent =
        this.skinTab === 'jeff'
          ? `Active Jeff: ${JEFF_SKIN_CATALOG[skins.jeff].name}`
          : `Active Rope: ${ROPE_SKIN_CATALOG[skins.rope].name}`;
      stage.appendChild(badge);
    }
    panel.appendChild(stage);

    const scroll = document.createElement('div');
    scroll.className = 'kf-meta-scroll';
    const grid = document.createElement('div');
    grid.className = 'kf-card-grid';

    if (this.skinTab === 'coop') {
      COOP_SKIN_LIST.forEach((meta) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'kf-skin-card';
        card.dataset.skinId = meta.id;

        const head = document.createElement('div');
        head.className = 'kf-skin-card-head';
        const icon = document.createElement('div');
        icon.style.width = '30px';
        icon.style.height = '30px';
        icon.style.flexShrink = '0';
        const previewWho = this.skinTarget === 'p2' ? 'p2' : 'p1';
        mountArtOrSvg(icon, this.artProvider?.getCoopSkinPreview?.(meta.id, previewWho), renderPenguinSkinSvg(meta.id, previewWho));

        const titles = document.createElement('div');
        titles.innerHTML = `<div style="font-size:11px;font-weight:900">${escapeXml(meta.name)}</div>
          <div style="font-size:9px;color:${PALETTE.SNOW_LIGHT}">${escapeXml(meta.id)}</div>`;
        head.append(icon, titles);
        card.appendChild(head);

        const desc = document.createElement('div');
        desc.style.fontSize = '9px';
        desc.style.color = PALETTE.SNOW_LIGHT;
        desc.style.lineHeight = '1.3';
        desc.textContent = meta.description;
        card.appendChild(desc);

        const tags = document.createElement('div');
        tags.className = 'kf-skin-badge-row';
        if (skins.p1 === meta.id) {
          tags.innerHTML += '<span class="kf-mini-tag kf-tag-p1">P1 EQUIPPED</span>';
        }
        if (skins.p2 === meta.id) {
          tags.innerHTML += '<span class="kf-mini-tag kf-tag-p2">P2 EQUIPPED</span>';
        }
        const swatch = document.createElement('span');
        swatch.className = 'kf-mini-tag';
        swatch.style.background = `linear-gradient(90deg, ${meta.krunkedAccent} 50%, ${meta.fredAccent} 50%)`;
        swatch.style.width = '24px';
        swatch.innerHTML = '&nbsp;';
        tags.appendChild(swatch);
        card.appendChild(tags);

        const equip = () => {
          this.callbacks.onUpdateSave((d) => {
            if (this.skinTarget === 'p1' || this.skinTarget === 'both') d.skins.p1 = meta.id;
            if (this.skinTarget === 'p2' || this.skinTarget === 'both') d.skins.p2 = meta.id;
          });
        };
        this.registerSlot(card, { onActivate: equip });
        grid.appendChild(card);
      });
    } else if (this.skinTab === 'jeff') {
      JEFF_SKIN_LIST.forEach((meta) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'kf-skin-card';
        card.dataset.jeffSkinId = meta.id;

        const head = document.createElement('div');
        head.className = 'kf-skin-card-head';
        const icon = document.createElement('div');
        icon.style.width = '32px';
        icon.style.height = '32px';
        icon.style.flexShrink = '0';
        mountArtOrSvg(icon, this.artProvider?.getJeffSkinPreview?.(meta.id), renderJeffSkinSvg(meta.id));

        const titles = document.createElement('div');
        titles.innerHTML = `<div style="font-size:11px;font-weight:900">${escapeXml(meta.name)}</div>
          <div style="font-size:9px;color:${PALETTE.SNOW_LIGHT}">${escapeXml(meta.id)}</div>`;
        head.append(icon, titles);
        card.appendChild(head);

        const desc = document.createElement('div');
        desc.style.fontSize = '9px';
        desc.style.color = PALETTE.SNOW_LIGHT;
        desc.textContent = meta.description;
        card.appendChild(desc);

        if (skins.jeff === meta.id) {
          const tags = document.createElement('div');
          tags.className = 'kf-skin-badge-row';
          tags.innerHTML = '<span class="kf-mini-tag kf-tag-eq">EQUIPPED</span>';
          card.appendChild(tags);
        }

        this.registerSlot(card, {
          onActivate: () => {
            this.callbacks.onUpdateSave((d) => {
              d.skins.jeff = meta.id;
            });
          },
        });
        grid.appendChild(card);
      });
    } else {
      ROPE_SKIN_LIST.forEach((meta) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'kf-skin-card';
        card.dataset.ropeSkinId = meta.id;

        const preview = document.createElement('div');
        preview.style.width = '100%';
        preview.style.height = '22px';
        mountArtOrSvg(preview, this.artProvider?.getRopeSkinPreview?.(meta.id), renderRopeSkinSvg(meta.id));
        card.appendChild(preview);

        const title = document.createElement('div');
        title.style.fontSize = '11px';
        title.style.fontWeight = '900';
        title.textContent = meta.name;
        card.appendChild(title);

        const desc = document.createElement('div');
        desc.style.fontSize = '9px';
        desc.style.color = PALETTE.SNOW_LIGHT;
        desc.textContent = meta.description;
        card.appendChild(desc);

        if (skins.rope === meta.id) {
          const tags = document.createElement('div');
          tags.className = 'kf-skin-badge-row';
          tags.innerHTML = '<span class="kf-mini-tag kf-tag-eq">EQUIPPED</span>';
          card.appendChild(tags);
        }

        this.registerSlot(card, {
          onActivate: () => {
            this.callbacks.onUpdateSave((d) => {
              d.skins.rope = meta.id;
            });
          },
        });
        grid.appendChild(card);
      });
    }

    scroll.appendChild(grid);
    panel.appendChild(scroll);
    panel.appendChild(this.makeBackButton());
  }

  // ============================================================================
  // 2. Polaroid Album (`album`) — All 12 Polaroids
  // ============================================================================

  private renderAlbum(panel: HTMLDivElement, ctx: MetaRenderContext): void {
    const unlockedSet = new Set<PhotoId>(ctx.save.unlockedPhotos);
    const count = unlockedSet.size;
    panel.appendChild(this.makeTitleRow('POLAROID ALBUM', `${count} / ${PHOTO_LIST.length} Collected`));
    panel.appendChild(this.makeProgressBar(count / PHOTO_LIST.length));

    // Spotlight inspector for focused photo
    const focusPhoto = PHOTO_LIST[Math.max(0, Math.min(this.selectedPhotoIdx, PHOTO_LIST.length - 1))];
    const focusUnlocked = unlockedSet.has(focusPhoto.id);
    const spotlight = document.createElement('div');
    spotlight.className = 'kf-spotlight-box';

    const spotArt = document.createElement('div');
    spotArt.style.width = '112px';
    spotArt.style.height = '76px';
    spotArt.style.flexShrink = '0';
    spotArt.style.border = `2px solid ${PALETTE.OUTLINE}`;
    mountArtOrSvg(
      spotArt,
      focusUnlocked ? this.artProvider?.getPhotoArt?.(focusPhoto.id) : null,
      renderPhotoSceneSvg(focusPhoto, focusUnlocked),
    );

    const spotText = document.createElement('div');
    spotText.style.display = 'flex';
    spotText.style.flexDirection = 'column';
    spotText.style.gap = '4px';
    spotText.innerHTML = `<div style="font-size:13px;font-weight:900;color:${focusUnlocked ? PALETTE.LAB_AMBER : PALETTE.SNOW_LIGHT}">
        ${focusUnlocked ? escapeXml(focusPhoto.title) : `LOCKED POLAROID #${this.selectedPhotoIdx + 1}`}
      </div>
      <div style="font-size:11px;color:${PALETTE.BELLY_WHITE};line-height:1.35">
        ${
          focusUnlocked
            ? escapeXml(focusPhoto.caption)
            : `Hint: Explore ${focusPhoto.zone.toUpperCase()} near ${focusPhoto.altitudeHint}m altitude.`
        }
      </div>
      <div><span class="kf-mini-tag kf-tag-zone">${focusPhoto.zone.toUpperCase()} • ${focusPhoto.altitudeHint}m</span></div>`;
    spotlight.append(spotArt, spotText);
    panel.appendChild(spotlight);

    const scroll = document.createElement('div');
    scroll.className = 'kf-meta-scroll';
    const grid = document.createElement('div');
    grid.className = 'kf-album-grid';

    PHOTO_LIST.forEach((photo, idx) => {
      const unlocked = unlockedSet.has(photo.id);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `kf-polaroid-card${unlocked ? '' : ' is-locked'}`;
      card.dataset.photoId = photo.id;

      const art = document.createElement('div');
      art.className = 'kf-polaroid-art';
      mountArtOrSvg(
        art,
        unlocked ? this.artProvider?.getPhotoArt?.(photo.id) : null,
        renderPhotoSceneSvg(photo, unlocked),
      );
      card.appendChild(art);

      const title = document.createElement('div');
      title.className = 'kf-polaroid-title';
      title.textContent = unlocked ? photo.title : `#${idx + 1} • ${photo.zone.toUpperCase()}`;
      card.appendChild(title);

      const sub = document.createElement('div');
      sub.style.fontSize = '9px';
      sub.style.opacity = '0.85';
      sub.textContent = unlocked ? `${photo.altitudeHint}m` : `Hint ~${photo.altitudeHint}m`;
      card.appendChild(sub);

      this.registerSlot(card, {
        row: Math.floor(idx / 4),
        col: idx % 4,
        onActivate: () => {
          this.selectedPhotoIdx = idx;
          this.callbacks.onRequestRerender();
        },
      });
      grid.appendChild(card);
    });

    scroll.appendChild(grid);
    panel.appendChild(scroll);
    panel.appendChild(this.makeBackButton(Math.ceil(PHOTO_LIST.length / 4), 0));
  }

  // ============================================================================
  // 3. Field Manual (`manual`) — All 7 Manual Pages
  // ============================================================================

  private renderManual(panel: HTMLDivElement, ctx: MetaRenderContext): void {
    const unlockedSet = new Set<ManualPageId>(ctx.save.unlockedManual);
    panel.appendChild(
      this.makeTitleRow('CLIMBER FIELD MANUAL', `${unlockedSet.size} / ${MANUAL_PAGE_LIST.length} Pages Found`),
    );

    const layout = document.createElement('div');
    layout.className = 'kf-manual-layout';

    const pageList = document.createElement('div');
    pageList.style.display = 'flex';
    pageList.style.flexDirection = 'column';
    pageList.style.gap = '5px';

    MANUAL_PAGE_LIST.forEach((page, idx) => {
      const found = unlockedSet.has(page.id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `kf-menu-item${idx === this.selectedManualIdx ? ' variant-pill' : ''}`;
      btn.dataset.manualPage = page.id;
      btn.innerHTML = `<span class="kf-item-left"><span class="kf-item-cursor"></span><span>${idx + 1}. ${escapeXml(page.id)}</span></span>
        <span style="font-size:9px;color:${found ? PALETTE.FRED_SCARF : PALETTE.SNOW_LIGHT}">${found ? '★ FOUND' : 'GUIDE'}</span>`;
      this.registerSlot(btn, {
        onActivate: () => {
          this.selectedManualIdx = idx;
          this.callbacks.onRequestRerender();
        },
      });
      pageList.appendChild(btn);
    });

    const activePage = MANUAL_PAGE_CATALOG[MANUAL_PAGE_LIST[this.selectedManualIdx].id];
    const spread = document.createElement('div');
    spread.className = 'kf-manual-spread';

    const head = document.createElement('div');
    head.style.display = 'flex';
    head.style.justifyContent = 'space-between';
    head.style.alignItems = 'center';
    head.innerHTML = `<span style="font-size:14px;font-weight:900;color:${PALETTE.LAB_AMBER}">${escapeXml(activePage.title)}</span>
      <span class="kf-mini-tag kf-tag-zone">${activePage.zone.toUpperCase()}</span>`;
    spread.appendChild(head);

    const diagram = document.createElement('div');
    diagram.className = 'kf-manual-diagram';
    mountArtOrSvg(
      diagram,
      this.artProvider?.getManualDiagram?.(activePage.id),
      renderManualDiagramSvg(activePage.id),
    );
    spread.appendChild(diagram);

    const tip = document.createElement('div');
    tip.className = 'kf-panel-note';
    tip.style.color = PALETTE.BELLY_WHITE;
    tip.style.fontSize = '11px';
    tip.textContent = activePage.tip;
    spread.appendChild(tip);

    const controlsBox = document.createElement('div');
    controlsBox.className = 'kf-manual-hint';
    controlsBox.textContent = `CONTROLS: ${activePage.controlsHint}`;
    spread.appendChild(controlsBox);

    layout.append(pageList, spread);
    panel.appendChild(layout);
    panel.appendChild(this.makeBackButton());
  }

  // ============================================================================
  // 4. Village Jukebox (`jukebox`) — All 11 Tracks + Equalizer
  // ============================================================================

  private renderJukebox(panel: HTMLDivElement, ctx: MetaRenderContext): void {
    const activeId = ctx.save.audio.jukeboxTrack;
    const activeMeta = JUKEBOX_TRACK_CATALOG[activeId];
    panel.appendChild(this.makeTitleRow('VILLAGE JUKEBOX', `${JUKEBOX_TRACK_LIST.length} TRACKS`));

    // Live Now Playing Equalizer Stage
    const stage = document.createElement('div');
    stage.className = 'kf-jukebox-stage';

    const info = document.createElement('div');
    info.innerHTML = `<div style="font-size:10px;color:${PALETTE.LAB_CYAN};font-weight:800">NOW PLAYING • ${activeMeta.bpm} BPM • ${activeMeta.biome.toUpperCase()}</div>
      <div style="font-size:15px;font-weight:900;color:${PALETTE.BELLY_WHITE}">${escapeXml(activeMeta.title)}</div>
      <div style="font-size:10px;color:${PALETTE.SNOW_LIGHT}">${escapeXml(activeMeta.subtitle)}</div>`;

    const eq = document.createElement('div');
    eq.className = `kf-eq-bars${ctx.save.audio.muted || ctx.save.audio.music <= 0.01 ? ' is-muted' : ''}`;
    const delays = [0, 0.14, 0.28, 0.07, 0.22, 0.35, 0.11, 0.31];
    delays.forEach((d, idx) => {
      const bar = document.createElement('div');
      bar.className = 'kf-eq-bar';
      bar.style.animationDelay = `${d}s`;
      bar.style.background =
        idx % 3 === 0
          ? PALETTE.KRUNKED_SCARF
          : idx % 3 === 1
            ? PALETTE.LAB_AMBER
            : PALETTE.FRED_SCARF;
      eq.appendChild(bar);
    });

    stage.append(info, eq);
    panel.appendChild(stage);

    const scroll = document.createElement('div');
    scroll.className = 'kf-meta-scroll';

    JUKEBOX_TRACK_LIST.forEach((track) => {
      const playing = activeId === track.id;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `kf-menu-item${playing ? ' variant-primary' : ''}`;
      btn.dataset.trackId = track.id;
      btn.innerHTML = `<span class="kf-item-left">
          <span class="kf-item-cursor"></span>
          <span class="kf-item-labels">
            <span>${escapeXml(track.id)} — ${escapeXml(track.title)}</span>
            <span class="kf-item-sub">${escapeXml(track.subtitle)}</span>
          </span>
        </span>
        <span class="kf-item-right">${playing ? '▶ PLAYING' : `${track.bpm} BPM`}</span>`;

      this.registerSlot(btn, {
        onActivate: () => {
          this.callbacks.onUnlockAudio();
          this.callbacks.onUpdateSave((d) => {
            d.audio.jukeboxTrack = track.id as JukeboxTrackId;
            d.audio.muted = false;
          });
        },
      });
      scroll.appendChild(btn);
    });

    panel.appendChild(scroll);
    panel.appendChild(this.makeBackButton());
  }

  // ============================================================================
  // 5. Achievements (`achievements`) — All 26 Achievements
  // ============================================================================

  private renderAchievements(panel: HTMLDivElement, ctx: MetaRenderContext): void {
    const unlockedSet = new Set<AchievementId>(ctx.save.unlockedAchievements);
    const total = ACHIEVEMENT_LIST.length;
    const count = unlockedSet.size;
    const pct = Math.round((count / total) * 100);

    panel.appendChild(this.makeTitleRow('ACHIEVEMENTS', `${count} / ${total} (${pct}%)`));
    panel.appendChild(this.makeProgressBar(count / total));

    // Category filter tabs
    const tabsBar = document.createElement('div');
    tabsBar.className = 'kf-tabs-bar';
    const filters: Array<[AchievementFilter, string]> = [
      ['all', `All (${total})`],
      ['climb', 'Climb'],
      ['coop', 'Co-Op'],
      ['collect', 'Collect'],
      ['mastery', 'Mastery'],
      ['lab', 'Lab'],
    ];
    for (const [f, label] of filters) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `kf-tab-btn${this.achFilter === f ? ' is-active' : ''}`;
      btn.textContent = label;
      btn.addEventListener('click', () => {
        this.achFilter = f;
        this.selectedIndex = 0;
        this.callbacks.onUiSound('toggle');
        this.callbacks.onRequestRerender();
      });
      tabsBar.appendChild(btn);
    }
    const hint = document.createElement('span');
    hint.className = 'kf-tab-hint';
    hint.textContent = this.getTabHintText(ctx.glyphStyle);
    tabsBar.appendChild(hint);
    panel.appendChild(tabsBar);

    const filtered =
      this.achFilter === 'all'
        ? ACHIEVEMENT_LIST
        : ACHIEVEMENT_LIST.filter((a) => a.category === this.achFilter);

    const scroll = document.createElement('div');
    scroll.className = 'kf-meta-scroll';
    const grid = document.createElement('div');
    grid.className = 'kf-ach-grid';

    filtered.forEach((meta) => {
      const unlocked = unlockedSet.has(meta.id);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `kf-ach-card${unlocked ? ' is-unlocked' : ''}`;
      card.dataset.achievementId = meta.id;

      const iconBox = document.createElement('div');
      iconBox.style.width = '28px';
      iconBox.style.height = '28px';
      iconBox.style.flexShrink = '0';
      mountArtOrSvg(
        iconBox,
        this.artProvider?.getAchievementIcon?.(meta.id),
        renderAchievementSvg(meta, unlocked),
      );

      const body = document.createElement('div');
      body.style.display = 'flex';
      body.style.flexDirection = 'column';
      body.style.gap = '3px';
      body.innerHTML = `<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
          <span style="font-size:11px;font-weight:900;color:${unlocked ? PALETTE.LAB_AMBER : PALETTE.BELLY_WHITE}">${escapeXml(meta.name)}</span>
          <span class="kf-mini-tag ${unlocked ? 'kf-tag-eq' : 'kf-tag-zone'}">${unlocked ? 'UNLOCKED' : meta.category.toUpperCase()}</span>
        </div>
        <div style="font-size:9.5px;color:${PALETTE.SNOW_LIGHT};line-height:1.3">${escapeXml(meta.description)}</div>`;

      card.append(iconBox, body);
      this.registerSlot(card, { onActivate: () => {} });
      grid.appendChild(card);
    });

    scroll.appendChild(grid);
    panel.appendChild(scroll);
    panel.appendChild(this.makeBackButton());
  }

  // ============================================================================
  // 6. Time Trials (`time_trials`) — All 10 Courses (TT1–TT10)
  // ============================================================================

  private renderTimeTrials(panel: HTMLDivElement, ctx: MetaRenderContext): void {
    const cleared = TIME_TRIAL_MEDALS.filter((t) => Boolean(ctx.save.timeTrialBest[t.id])).length;
    panel.appendChild(this.makeTitleRow('TIME TRIALS (TT1–TT10)', `${cleared} / 10 Cleared`));

    const scroll = document.createElement('div');
    scroll.className = 'kf-meta-scroll';

    TIME_TRIAL_MEDALS.forEach((tt: TimeTrialMedalDef) => {
      const best = ctx.save.timeTrialBest[tt.id];
      const medalTier: MedalTier = best?.medal ?? 'none';
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'kf-tt-row';
      row.dataset.trialId = tt.id;

      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.alignItems = 'center';
      left.style.gap = '8px';

      const medalIcon = document.createElement('div');
      medalIcon.style.width = '26px';
      medalIcon.style.height = '26px';
      medalIcon.style.flexShrink = '0';
      medalIcon.innerHTML = renderMedalSvg(medalTier);

      const info = document.createElement('div');
      info.innerHTML = `<div style="font-size:12px;font-weight:900">${escapeXml(tt.id)}: ${escapeXml(tt.name)} <span class="kf-mini-tag kf-tag-zone">${tt.biome.toUpperCase()}</span></div>
        <div class="kf-tt-pars">
          <span style="color:#f2a666">BRZ ${formatParSec(tt.bronze)}</span>
          <span style="color:#cbdbfc">SLV ${formatParSec(tt.silver)}</span>
          <span style="color:#ffb830">GLD ${formatParSec(tt.gold)}</span>
          <span style="color:#38e8ff">PLT ${formatParSec(tt.platinum)}</span>
        </div>`;

      left.append(medalIcon, info);

      const right = document.createElement('div');
      right.style.textAlign = 'right';
      right.style.flexShrink = '0';
      right.innerHTML = `<div style="font-size:12px;font-weight:900;color:${best ? PALETTE.LAB_AMBER : PALETTE.SNOW_LIGHT}">
          ${best ? formatClock(best.timeSec) : 'UNPLAYED'}
        </div>
        <div style="font-size:9px;color:${PALETTE.FRED_SCARF}">
          ${best ? `${medalTier.toUpperCase()} • ▶ PLAY` : '▶ LAUNCH'}
        </div>`;

      row.append(left, right);
      this.registerSlot(row, {
        onActivate: () => this.callbacks.onStartMode('time_trial', tt.index),
      });
      scroll.appendChild(row);
    });

    panel.appendChild(scroll);
    panel.appendChild(this.makeBackButton());
  }

  // ============================================================================
  // 7. Online Co-Op Lobby (`online_lobby`) — BroadcastChannel + WebRTC Room Codes
  // ============================================================================

  private renderOnlineLobby(panel: HTMLDivElement, ctx: MetaRenderContext): void {
    const st = ctx.onlineStatus;
    panel.appendChild(this.makeTitleRow('ONLINE P2P CO-OP', 'ZERO-BACKEND'));

    // Mode Tabs
    const tabsBar = document.createElement('div');
    tabsBar.className = 'kf-tabs-bar';
    const tabs: Array<[OnlineLobbyTab, string]> = [
      ['broadcast', 'Mode A: Instant Dual-Tab (BroadcastChannel)'],
      ['webrtc', 'Mode B: WebRTC Room Code P2P'],
    ];
    for (const [id, label] of tabs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `kf-tab-btn${this.onlineTab === id ? ' is-active' : ''}`;
      btn.textContent = label;
      btn.addEventListener('click', () => {
        this.onlineTab = id;
        this.selectedIndex = 0;
        this.callbacks.onUiSound('toggle');
        this.callbacks.onRequestRerender();
      });
      tabsBar.appendChild(btn);
    }
    panel.appendChild(tabsBar);

    // Live Connection Status Banner
    const banner = document.createElement('div');
    banner.className = 'kf-online-status-banner';
    const statusColor = st.error
      ? PALETTE.KRUNKED_SCARF
      : st.syncStatus === 'SYNCED'
        ? PALETTE.FRED_SCARF
        : st.active
          ? PALETTE.LAB_AMBER
          : PALETTE.SNOW_LIGHT;
    banner.innerHTML = `<span>STATUS: <strong style="color:${statusColor}">${escapeXml(st.summaryString.toUpperCase())}</strong></span>
      <span>RTT: <strong>${st.rttMs}ms</strong> • HASH: <strong>${st.hashMatched ? 'MATCH' : 'RESYNCING'}</strong></span>`;
    panel.appendChild(banner);

    const scroll = document.createElement('div');
    scroll.className = 'kf-meta-scroll';

    if (this.onlineTab === 'broadcast') {
      const note = document.createElement('div');
      note.className = 'kf-panel-note';
      note.textContent =
        'Open Krunked & Fred in two tabs on the same browser. Host in Tab 1 (Krunked P1) and Join in Tab 2 (Fred P2) with the same channel name for instant 50 Hz synchronized play!';
      scroll.appendChild(note);

      const input = document.createElement('input');
      input.className = 'kf-online-input';
      input.type = 'text';
      input.value = this.broadcastChannelInput;
      input.maxLength = 40;
      input.placeholder = DEFAULT_BROADCAST_CHANNEL;
      input.addEventListener('input', () => {
        this.broadcastChannelInput = input.value.trim() || DEFAULT_BROADCAST_CHANNEL;
      });
      scroll.appendChild(input);

      const hostBtn = this.makeMenuButton(
        'Host Dual-Tab Room (P1 Krunked)',
        `Channel: ${this.broadcastChannelInput} • Sends authoritative seed & resyncs`,
        'primary',
      );
      this.registerSlot(hostBtn, {
        onActivate: () => this.callbacks.onOpenOnlineCoop('host', this.broadcastChannelInput),
      });
      scroll.appendChild(hostBtn);

      const joinBtn = this.makeMenuButton(
        'Join Dual-Tab Room (P2 Fred)',
        `Channel: ${this.broadcastChannelInput} • Auto-locks to Host 50 Hz stream`,
        'default',
      );
      this.registerSlot(joinBtn, {
        onActivate: () => this.callbacks.onOpenOnlineCoop('client', this.broadcastChannelInput),
      });
      scroll.appendChild(joinBtn);
    } else {
      const note = document.createElement('div');
      note.className = 'kf-panel-note';
      note.textContent =
        'Direct peer-to-peer RTCDataChannel ("krunked-coop") with zero signaling server! Copy & paste compressed base64url Room Codes between Host and Client (ICE gather timeout: 2.5s).';
      scroll.appendChild(note);

      if (this.webrtcFeedback) {
        const fb = document.createElement('div');
        fb.className = 'kf-manual-hint';
        fb.textContent = this.webrtcFeedback;
        scroll.appendChild(fb);
      }

      const grid = document.createElement('div');
      grid.className = 'kf-webrtc-grid';

      // Host Column
      const hostCard = document.createElement('div');
      hostCard.className = 'kf-webrtc-card';
      hostCard.innerHTML = `<div style="font-size:12px;font-weight:900;color:${PALETTE.KRUNKED_SCARF}">HOST FLOW (P1 KRUNKED)</div>`;

      const createOfferBtn = this.makeMenuButton(
        this.webrtcBusy ? 'Gathering ICE (<=2.5s)...' : '1. Create Offer Code',
        'Generates compressed base64url SDP offer',
        'primary',
      );
      this.registerSlot(createOfferBtn, {
        onActivate: () => {
          if (this.webrtcBusy) return;
          this.webrtcBusy = true;
          this.webrtcFeedback = 'Gathering ICE candidates (up to 2.5s)...';
          this.callbacks.onRequestRerender();
          void this.callbacks
            .onCreateWebRtcOffer()
            .then((code) => {
              this.webrtcOfferText = code;
              this.webrtcFeedback = 'Offer Code ready! Copy and send it to P2 Fred.';
            })
            .catch((err) => {
              this.webrtcFeedback = `Offer failed: ${err instanceof Error ? err.message : String(err)}`;
            })
            .finally(() => {
              this.webrtcBusy = false;
              this.callbacks.onRequestRerender();
            });
        },
      });
      hostCard.appendChild(createOfferBtn);

      const offerOut = document.createElement('textarea');
      offerOut.className = 'kf-code-area';
      offerOut.readOnly = true;
      offerOut.placeholder = 'Generated Offer Room Code appears here...';
      offerOut.value = this.webrtcOfferText;
      hostCard.appendChild(offerOut);

      const copyOfferBtn = this.makeMenuButton('Copy Offer Code', undefined, 'pill');
      this.registerSlot(copyOfferBtn, {
        onActivate: () => {
          if (!this.webrtcOfferText) {
            this.webrtcFeedback = 'Create an Offer Code first.';
            this.callbacks.onRequestRerender();
            return;
          }
          this.copyText(this.webrtcOfferText, 'Offer Room Code copied to clipboard!');
        },
      });
      hostCard.appendChild(copyOfferBtn);

      const answerIn = document.createElement('textarea');
      answerIn.className = 'kf-code-area';
      answerIn.placeholder = '2. Paste Client Answer Room Code here...';
      answerIn.value = this.webrtcAnswerInput;
      answerIn.addEventListener('input', () => {
        this.webrtcAnswerInput = answerIn.value;
      });
      hostCard.appendChild(answerIn);

      const connectAnswerBtn = this.makeMenuButton('3. Connect with Answer', undefined, 'default');
      this.registerSlot(connectAnswerBtn, {
        onActivate: () => {
          const code = this.webrtcAnswerInput.trim();
          if (!code) {
            this.webrtcFeedback = 'Paste the Client Answer Code first.';
            this.callbacks.onRequestRerender();
            return;
          }
          this.webrtcFeedback = 'Applying Answer Code & opening DataChannel...';
          this.callbacks.onRequestRerender();
          void this.callbacks
            .onAcceptWebRtcAnswer(code)
            .then(() => {
              this.webrtcFeedback = 'Answer accepted! Waiting for P2P DataChannel lock...';
            })
            .catch((err) => {
              this.webrtcFeedback = `Connect failed: ${err instanceof Error ? err.message : String(err)}`;
            })
            .finally(() => {
              this.callbacks.onRequestRerender();
            });
        },
      });
      hostCard.appendChild(connectAnswerBtn);

      // Client Column
      const clientCard = document.createElement('div');
      clientCard.className = 'kf-webrtc-card';
      clientCard.innerHTML = `<div style="font-size:12px;font-weight:900;color:${PALETTE.FRED_SCARF}">CLIENT FLOW (P2 FRED)</div>`;

      const remoteOfferIn = document.createElement('textarea');
      remoteOfferIn.className = 'kf-code-area';
      remoteOfferIn.placeholder = '1. Paste Host Offer Room Code here...';
      remoteOfferIn.value = this.webrtcRemoteOfferInput;
      remoteOfferIn.addEventListener('input', () => {
        this.webrtcRemoteOfferInput = remoteOfferIn.value;
      });
      clientCard.appendChild(remoteOfferIn);

      const createAnswerBtn = this.makeMenuButton(
        this.webrtcBusy ? 'Gathering ICE (<=2.5s)...' : '2. Create Answer Code',
        'Decodes Host Offer & generates Answer Code',
        'primary',
      );
      this.registerSlot(createAnswerBtn, {
        onActivate: () => {
          if (this.webrtcBusy) return;
          const code = this.webrtcRemoteOfferInput.trim();
          if (!code) {
            this.webrtcFeedback = 'Paste the Host Offer Code first.';
            this.callbacks.onRequestRerender();
            return;
          }
          this.webrtcBusy = true;
          this.webrtcFeedback = 'Generating Answer Room Code (up to 2.5s)...';
          this.callbacks.onRequestRerender();
          void this.callbacks
            .onAcceptWebRtcOffer(code)
            .then((ans) => {
              this.webrtcAnswerText = ans;
              this.webrtcFeedback = 'Answer Code ready! Send it back to Host to launch.';
            })
            .catch((err) => {
              this.webrtcFeedback = `Answer failed: ${err instanceof Error ? err.message : String(err)}`;
            })
            .finally(() => {
              this.webrtcBusy = false;
              this.callbacks.onRequestRerender();
            });
        },
      });
      clientCard.appendChild(createAnswerBtn);

      const answerOut = document.createElement('textarea');
      answerOut.className = 'kf-code-area';
      answerOut.readOnly = true;
      answerOut.placeholder = 'Generated Answer Room Code appears here...';
      answerOut.value = this.webrtcAnswerText;
      clientCard.appendChild(answerOut);

      const copyAnswerBtn = this.makeMenuButton('3. Copy Answer Code', undefined, 'pill');
      this.registerSlot(copyAnswerBtn, {
        onActivate: () => {
          if (!this.webrtcAnswerText) {
            this.webrtcFeedback = 'Create an Answer Code first.';
            this.callbacks.onRequestRerender();
            return;
          }
          this.copyText(this.webrtcAnswerText, 'Answer Room Code copied! Waiting for Host...');
        },
      });
      clientCard.appendChild(copyAnswerBtn);

      grid.append(hostCard, clientCard);
      scroll.appendChild(grid);
    }

    if (st.active) {
      const discBtn = this.makeMenuButton('Disconnect Active Session', undefined, 'danger');
      this.registerSlot(discBtn, {
        onActivate: () => {
          this.callbacks.onDisconnectOnline();
          this.callbacks.onRequestRerender();
        },
      });
      scroll.appendChild(discBtn);
    }

    panel.appendChild(scroll);
    panel.appendChild(this.makeBackButton());
  }

  // ============================================================================
  // 8. Controls & Gamepad Remapper (`controls_remap`)
  // ============================================================================

  private renderControlsRemap(panel: HTMLDivElement, ctx: MetaRenderContext): void {
    panel.appendChild(
      this.makeTitleRow(
        'CONTROLS & GAMEPAD REMAP',
        this.capturingKey ? 'PRESS ANY KEY (ESC CANCEL)' : 'KEYBOARD + PAD',
      ),
    );

    const layout = document.createElement('div');
    layout.className = 'kf-controls-layout';

    // Left: Interactive Keyboard Rebinding List
    const leftCol = document.createElement('div');
    leftCol.className = 'kf-meta-scroll';

    KEYBIND_ROWS.forEach((row) => {
      const isCap = this.capturingKey === row.key;
      const curCode = ctx.save.keybinds[row.key];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kf-menu-item';
      btn.dataset.bindKey = row.key;

      const badgeClass =
        row.group === 'P1' ? 'kf-tag-p1' : row.group === 'P2' ? 'kf-tag-p2' : 'kf-tag-eq';
      btn.innerHTML = `<span class="kf-item-left">
          <span class="kf-item-cursor"></span>
          <span class="kf-mini-tag ${badgeClass}">${row.group}</span>
          <span>${escapeXml(row.label)}</span>
        </span>
        <span class="kf-key-pill${isCap ? ' is-capturing' : ''}">${isCap ? 'PRESS KEY...' : escapeXml(formatKeyCode(curCode))}</span>`;

      this.registerSlot(btn, {
        onActivate: () => {
          this.captureNextKey(row.key, (code) => {
            this.callbacks.onUpdateSave((d) => {
              d.keybinds[row.key] = code;
            });
          });
        },
      });
      leftCol.appendChild(btn);
    });

    const resetBtn = this.makeMenuButton('Reset Defaults', 'Restore standard WASD + Arrow keybinds', 'danger');
    this.registerSlot(resetBtn, {
      onActivate: () => {
        this.callbacks.onUpdateSave((d) => {
          d.keybinds = { ...DEFAULT_KEYBINDS };
        });
      },
    });
    leftCol.appendChild(resetBtn);

    // Right: Visual Gamepad Button Map (Xbox / PS / Switch / Tesla HID)
    const rightCol = document.createElement('div');
    rightCol.style.display = 'flex';
    rightCol.style.flexDirection = 'column';
    rightCol.style.gap = '7px';

    const padTabs = document.createElement('div');
    padTabs.className = 'kf-tabs-bar';
    const layouts: Array<[GamepadVisualLayout, string]> = [
      ['xbox', 'Xbox'],
      ['playstation', 'PS'],
      ['switch', 'Switch'],
      ['tesla', 'Tesla'],
    ];
    for (const [id, lbl] of layouts) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `kf-tab-btn${this.gamepadLayout === id ? ' is-active' : ''}`;
      b.textContent = lbl;
      b.addEventListener('click', () => {
        this.gamepadLayout = id;
        this.callbacks.onUiSound('toggle');
        this.callbacks.onRequestRerender();
      });
      padTabs.appendChild(b);
    }
    rightCol.appendChild(padTabs);

    const diagramWrap = document.createElement('div');
    diagramWrap.style.border = `2px solid ${PALETTE.OUTLINE}`;
    diagramWrap.style.background = '#17142b';
    diagramWrap.innerHTML = renderGamepadDiagramSvg(this.gamepadLayout);
    rightCol.appendChild(diagramWrap);

    const legend = document.createElement('div');
    legend.className = 'kf-stat-box';
    legend.style.fontSize = '10px';
    legend.style.lineHeight = '1.45';
    legend.innerHTML = `<div style="color:${PALETTE.LAB_CYAN};font-weight:900">STANDARD PAD (PAD 1 → P1 • PAD 2 → P2)</div>
      <div>• Move: D-Pad / Left Stick</div>
      <div>• Jump: South (A / ✕ / B) • Anchor: East / RB / RT</div>
      <div>• Wall Grab: West / LB / LT • Pull Rope: North</div>
      <div>• Flag: Select/Back • Charlie: L3 • Emote: R3</div>
      <div style="color:${PALETTE.LAB_AMBER};font-weight:900;margin-top:4px">1-PAD SPLIT MODE (${ctx.save.gamepadSplitMode ? 'ON' : 'OFF'})</div>
      <div>• Left Half (LS/LB/LT/L3) → Krunked (P1)</div>
      <div>• Right Half (RS/RB/RT/Face) → Fred (P2)</div>`;
    rightCol.appendChild(legend);

    layout.append(leftCol, rightCol);
    panel.appendChild(layout);
    panel.appendChild(this.makeBackButton());
  }

  // ============================================================================
  // 9. Enhanced Boss Victory, Time Trial Medal & Summit Ceremony (`victory`)
  // ============================================================================

  private renderVictoryCeremony(panel: HTMLDivElement, ctx: MetaRenderContext): void {
    const st = ctx.simState;
    const isBoss = st.mode === 'lab_dlc' && st.boss.defeated;
    const isTT = st.mode === 'time_trial';
    const runTime = st.completionTimeSec > 0 ? st.completionTimeSec : st.elapsedSec;

    const headline = isTT
      ? 'TIME TRIAL MEDAL CEREMONY!'
      : isBoss
        ? 'MECH-BOSS BACHICHA DEFEATED!'
        : st.mode === 'lab_dlc'
          ? 'LABORATORY CLEARED!'
          : 'SUMMIT REACHED!';
    panel.appendChild(this.makeTitleRow(headline, st.mode.toUpperCase().replace('_', ' ')));

    if (isTT) {
      const ttDef =
        TIME_TRIAL_MEDALS.find((t) => t.index === (st.timeTrialIndex ?? 1)) ?? TIME_TRIAL_MEDALS[0];
      const earned: MedalTier = st.completionMedal !== 'none' ? st.completionMedal : 'none';
      const best = ctx.save.timeTrialBest[ttDef.id];
      const isPb = best ? runTime <= best.timeSec + 0.02 : true;

      const hero = document.createElement('div');
      hero.className = 'kf-spotlight-box';
      const medalBox = document.createElement('div');
      medalBox.style.width = '58px';
      medalBox.style.height = '58px';
      medalBox.style.flexShrink = '0';
      medalBox.innerHTML = renderMedalSvg(earned);

      const tiers: Array<[string, number, string]> = [
        ['BRONZE', ttDef.bronze, '#f2a666'],
        ['SILVER', ttDef.silver, '#cbdbfc'],
        ['GOLD', ttDef.gold, '#ffb830'],
        ['PLATINUM', ttDef.platinum, '#38e8ff'],
      ];
      const parHtml = tiers
        .map(([lbl, par, col]) => {
          const hit = runTime <= par;
          return `<span style="color:${hit ? col : '#6d58b7'};font-weight:${hit ? 900 : 400}">${hit ? '✓' : '·'} ${lbl} ${formatParSec(par)}</span>`;
        })
        .join('  ');

      const details = document.createElement('div');
      details.innerHTML = `<div style="font-size:14px;font-weight:900;color:${PALETTE.LAB_AMBER}">
          ${escapeXml(ttDef.id)}: ${escapeXml(ttDef.name)} — ${earned === 'none' ? 'FINISHER' : `${earned.toUpperCase()} MEDAL!`}
        </div>
        <div style="font-size:12px;margin:3px 0;color:${PALETTE.BELLY_WHITE}">
          Time: <strong>${formatClock(runTime)}</strong> ${isPb ? `<span class="kf-mini-tag kf-tag-eq">★ NEW PERSONAL BEST</span>` : ''}
        </div>
        <div style="font-size:10px;display:flex;gap:8px;flex-wrap:wrap">${parHtml}</div>`;
      hero.append(medalBox, details);
      panel.appendChild(hero);
    } else if (isBoss) {
      const hero = document.createElement('div');
      hero.className = 'kf-spotlight-box';
      const trophy = document.createElement('div');
      trophy.style.width = '56px';
      trophy.style.height = '56px';
      trophy.style.flexShrink = '0';
      trophy.innerHTML = renderMedalSvg('platinum');

      const chainsBroken = st.boss.chains.filter((c) => c.broken).length;
      const details = document.createElement('div');
      details.innerHTML = `<div style="font-size:14px;font-weight:900;color:${PALETTE.LAB_CYAN}">
          UNCHAINED VICTORY! ALL ${chainsBroken || 4} CHAINS SHATTERED!
        </div>
        <div style="font-size:11px;color:${PALETTE.SNOW_LIGHT};margin-top:4px">
          Dr. Bachicha's mech powered down in ${formatClock(runTime)}. Isotope Suits & Lab Polaroid unlocked!
        </div>`;
      hero.append(trophy, details);
      panel.appendChild(hero);
    }

    // Badges Row
    const badgeRow = document.createElement('div');
    badgeRow.style.display = 'flex';
    badgeRow.style.gap = '8px';
    badgeRow.style.flexWrap = 'wrap';

    const noAssist = !st.assistEverUsedInRun;
    const noAssistBadge = document.createElement('div');
    noAssistBadge.className = noAssist ? 'kf-badge kf-badge-gold' : 'kf-badge kf-badge-muted';
    noAssistBadge.textContent = noAssist ? '★ NO-ASSIST CLEAR ★' : 'ASSIST MODE USED';
    badgeRow.appendChild(noAssistBadge);

    if (ctx.save.summitsCleared > 0) {
      const sumBadge = document.createElement('div');
      sumBadge.className = 'kf-badge kf-badge-muted';
      sumBadge.textContent = `SUMMITS: ${ctx.save.summitsCleared}`;
      badgeRow.appendChild(sumBadge);
    }
    panel.appendChild(badgeRow);

    // Run Stats Grid
    const statsGrid = document.createElement('div');
    statsGrid.className = 'kf-stats-grid';
    const stats: Array<[string, string]> = [
      ['Run Time', formatClock(runTime)],
      ['Max Altitude', `${st.maxAltitude.toFixed(1)} m`],
      ['Jumps', String(st.jumpsCount)],
      ['Falls', String(st.fallsCount)],
    ];
    for (const [label, value] of stats) {
      const box = document.createElement('div');
      box.className = 'kf-stat-box';
      box.innerHTML = `<div class="kf-stat-label">${escapeXml(label)}</div><div class="kf-stat-value">${escapeXml(value)}</div>`;
      statsGrid.appendChild(box);
    }
    panel.appendChild(statsGrid);

    const actions = document.createElement('div');
    actions.className = 'kf-menu-list';

    if (isTT && (st.timeTrialIndex ?? 1) < TIME_TRIAL_MEDALS.length) {
      const nextIdx = (st.timeTrialIndex ?? 1) + 1;
      const nextBtn = this.makeMenuButton(`Next Trial (TT${nextIdx})`, undefined, 'primary');
      this.registerSlot(nextBtn, {
        onActivate: () => this.callbacks.onStartMode('time_trial', nextIdx),
      });
      actions.appendChild(nextBtn);
    }

    const againBtn = this.makeMenuButton('Play Again', undefined, isTT ? 'default' : 'primary');
    this.registerSlot(againBtn, { onActivate: () => this.callbacks.onPlayAgain() });
    actions.appendChild(againBtn);

    if (isTT) {
      const ttListBtn = this.makeMenuButton('Time Trials Board', undefined, 'default');
      this.registerSlot(ttListBtn, { onActivate: () => this.callbacks.onSetScreen('time_trials') });
      actions.appendChild(ttListBtn);
    }

    const titleBtn = this.makeMenuButton('Title Screen', undefined, 'default');
    this.registerSlot(titleBtn, { onActivate: () => this.callbacks.onQuitToTitle() });
    actions.appendChild(titleBtn);

    panel.appendChild(actions);
  }

  // ============================================================================
  // Shared Helpers
  // ============================================================================

  private makeTitleRow(title: string, rightTag?: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'kf-panel-title';
    const left = document.createElement('span');
    left.textContent = title;
    el.appendChild(left);
    if (rightTag) {
      const tag = document.createElement('span');
      tag.style.fontSize = '11px';
      tag.style.color = PALETTE.LAB_CYAN;
      tag.textContent = rightTag;
      el.appendChild(tag);
    }
    return el;
  }

  private makeProgressBar(ratio: number): HTMLDivElement {
    const bar = document.createElement('div');
    bar.className = 'kf-progress-bar';
    const fill = document.createElement('div');
    fill.className = 'kf-progress-fill';
    fill.style.width = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
    bar.appendChild(fill);
    return bar;
  }

  private makeMenuButton(
    label: string,
    sublabel?: string,
    variant: 'default' | 'primary' | 'danger' | 'pill' = 'default',
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `kf-menu-item${variant !== 'default' ? ` variant-${variant}` : ''}`;
    btn.innerHTML = `<span class="kf-item-left">
        <span class="kf-item-cursor"></span>
        <span class="kf-item-labels">
          <span>${escapeXml(label)}</span>
          ${sublabel ? `<span class="kf-item-sub">${escapeXml(sublabel)}</span>` : ''}
        </span>
      </span>`;
    return btn;
  }

  private makeBackButton(row?: number, col?: number): HTMLButtonElement {
    const btn = this.makeMenuButton('Back', undefined, 'default');
    btn.dataset.menuId = 'meta-back';
    this.registerSlot(btn, {
      row,
      col,
      onActivate: () => this.callbacks.onBack(),
    });
    return btn;
  }

  private registerSlot(
    el: HTMLElement,
    opts: { onActivate?: () => void; onStep?: (dir: -1 | 1) => void; row?: number; col?: number },
  ): void {
    const idx = this.slots.length;
    this.slots.push({ el, ...opts });

    el.addEventListener('pointerenter', () => {
      if (this.selectedIndex !== idx) {
        this.selectedIndex = idx;
        this.applyFocusHighlight();
      }
    });
    el.addEventListener('click', (e) => {
      e.preventDefault();
      if (el instanceof HTMLElement) el.blur();
      this.selectedIndex = idx;
      this.applyFocusHighlight();
      if (opts.onActivate) {
        this.callbacks.onUiSound('confirm');
        opts.onActivate();
      } else if (opts.onStep) {
        this.callbacks.onUiSound('toggle');
        opts.onStep(1);
      }
    });
  }

  private applyFocusHighlight(): void {
    this.slots.forEach((slot, idx) => {
      const selected = idx === this.selectedIndex;
      slot.el.classList.toggle('is-selected', selected);
      const cursor = slot.el.querySelector('.kf-item-cursor');
      if (cursor) cursor.textContent = selected ? '▶' : '';
      if (selected) {
        slot.el.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  private getTabHintText(glyph: InputGlyphStyle): string {
    if (glyph === 'playstation') return '[L1 / R1] Tabs';
    if (glyph === 'switch') return '[L / R] Tabs';
    if (glyph === 'xbox') return '[LB / RB] Tabs';
    if (glyph === 'touch') return 'Tap Tabs';
    return '[Q / E] Tabs';
  }

  private copyText(text: string, successMsg: string): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard
        .writeText(text)
        .then(() => {
          this.webrtcFeedback = successMsg;
          this.callbacks.onRequestRerender();
        })
        .catch(() => {
          this.webrtcFeedback = 'Select & copy the room code from the box above.';
          this.callbacks.onRequestRerender();
        });
    } else {
      this.webrtcFeedback = 'Select & copy the room code from the box above.';
      this.callbacks.onRequestRerender();
    }
  }

  dispose(): void {
    this.cancelKeyCapture();
    this.closeEmoteWheel();
    this.emoteRoot.remove();
    this.toastRoot.remove();
    this.onlineHudRoot.remove();
  }
}
