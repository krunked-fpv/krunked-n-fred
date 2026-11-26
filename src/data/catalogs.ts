import {
  ACHIEVEMENT_IDS,
  COOP_SKINS,
  JEFF_SKINS,
  JUKEBOX_TRACKS,
  MANUAL_PAGE_IDS,
  PALETTE,
  PHOTO_IDS,
  ROPE_SKINS,
  type AchievementId,
  type BiomeId,
  type CoopSkinId,
  type JeffSkinId,
  type JukeboxTrackId,
  type ManualPageId,
  type PhotoId,
  type RopeSkinId,
} from '../contracts';

// ============================================================================
// 1. Co-Op Penguin Skins (16)
// ============================================================================

export interface CoopSkinMeta {
  id: CoopSkinId;
  name: string;
  description: string;
  krunkedAccent: string;
  fredAccent: string;
  unlockHint: string;
}

export const COOP_SKIN_CATALOG: Readonly<Record<CoopSkinId, CoopSkinMeta>> = {
  Default: {
    id: 'Default',
    name: 'Classic Alpine',
    description: 'Krunked in crimson wool and Fred in emerald knit, ready for the peak.',
    krunkedAccent: PALETTE.KRUNKED_SCARF,
    fredAccent: PALETTE.FRED_SCARF,
    unlockHint: 'Unlocked from the start.',
  },
  Knight: {
    id: 'Knight',
    name: 'Glacier Knights',
    description: 'Polished silver helms and chivalrous plumes forged for frostbound quests.',
    krunkedAccent: '#d9485b',
    fredAccent: '#48b8d0',
    unlockHint: 'Reach the Snowy Foothills chimney.',
  },
  Robot: {
    id: 'Robot',
    name: 'Clockwork Units',
    description: 'Riveted steel chassis with glowing optic visors from the Secret Lab.',
    krunkedAccent: '#ff5c77',
    fredAccent: PALETTE.LAB_CYAN,
    unlockHint: 'Discover the Secret Lab Portal.',
  },
  Pot: {
    id: 'Pot',
    name: 'Campfire Pots',
    description: 'Tin stew pots worn proudly as helmets after one too many summit picnics.',
    krunkedAccent: '#df7126',
    fredAccent: '#8f563b',
    unlockHint: 'Survive a hard landing in the Foothills.',
  },
  Skeleton: {
    id: 'Skeleton',
    name: 'Cavern Bones',
    description: 'Chattering ribcage sweaters that faintly rattle in the Dark Mines.',
    krunkedAccent: '#f2f5ff',
    fredAccent: '#cbdbfc',
    unlockHint: 'Enter the Dark Mines.',
  },
  Bread: {
    id: 'Bread',
    name: 'Sourdough Bakers',
    description: 'Warm crusty toques and flour-dusted aprons fresh from the village oven.',
    krunkedAccent: '#e8a855',
    fredAccent: '#c97a32',
    unlockHint: 'Clear any mountain ascent.',
  },
  Inverted: {
    id: 'Inverted',
    name: 'Mirror Twins',
    description: 'Krunked and Fred traded scarves and palettes just to keep everyone guessing.',
    krunkedAccent: PALETTE.FRED_SCARF,
    fredAccent: PALETTE.KRUNKED_SCARF,
    unlockHint: 'Win a Rock-Paper-Scissors clash with your partner.',
  },
  Fish: {
    id: 'Fish',
    name: 'Trout Anglers',
    description: 'Wiggly salmon hats and slicker bibs straight off the glacier pier.',
    krunkedAccent: '#ff7b6b',
    fredAccent: '#4ecdc4',
    unlockHint: 'Rescue a stranded baby seal.',
  },
  Box: {
    id: 'Box',
    name: 'Cardboard Scouts',
    description: 'Recycled shipping cartons with hastily drawn eye-holes and packing tape.',
    krunkedAccent: '#c48d56',
    fredAccent: '#a8723d',
    unlockHint: 'Plant your first checkpoint flag.',
  },
  Fruit: {
    id: 'Fruit',
    name: 'Orchard Duo',
    description: 'Berry and kiwi knit beanies that pop brightly against deep alpine snow.',
    krunkedAccent: '#e63956',
    fredAccent: '#6bd94b',
    unlockHint: 'Collect 3 Polaroids.',
  },
  Animals: {
    id: 'Animals',
    name: 'Critter Hoodies',
    description: 'Cozy red-fox and frog ear-flaps stitched by the village tailor.',
    krunkedAccent: '#e86f34',
    fredAccent: '#52c478',
    unlockHint: 'Clap in sync with your partner.',
  },
  SuperHero: {
    id: 'SuperHero',
    name: 'Caped Climbers',
    description: 'Domino masks and fluttering capes engineered for dramatic pendulum saves.',
    krunkedAccent: '#ff2e63',
    fredAccent: '#38e8ff',
    unlockHint: 'Complete a climb without Assist.',
  },
  Christmas: {
    id: 'Christmas',
    name: 'Solstice Mittens',
    description: 'Fuzzy pom-pom hats and jingle-bell collars for crisp winter ascents.',
    krunkedAccent: '#e0243d',
    fredAccent: '#28a863',
    unlockHint: 'Collect 6 Polaroids.',
  },
  Detective: {
    id: 'Detective',
    name: 'Frost Sleuths',
    description: 'Deerstalker caps and magnifying glasses on the trail of missing Polaroids.',
    krunkedAccent: '#a87c4f',
    fredAccent: '#6b7d65',
    unlockHint: 'Collect all 7 Manual Pages.',
  },
  Halloween: {
    id: 'Halloween',
    name: 'Lantern Spooks',
    description: 'Pumpkin hoods and midnight cloaks made for headlamp cavern dashes.',
    krunkedAccent: '#ff8a1f',
    fredAccent: '#9b5de5',
    unlockHint: 'Cross the Dark Mines without falling.',
  },
  Nuclear: {
    id: 'Nuclear',
    name: 'Isotope Suits',
    description: 'High-visibility hazard gear glowing softly from Dr. Bachicha’s reactor wing.',
    krunkedAccent: '#c6ff00',
    fredAccent: '#ffb830',
    unlockHint: 'Defeat Mech-Boss Bachicha in the Lab.',
  },
};

export const COOP_SKIN_LIST: readonly CoopSkinMeta[] = COOP_SKINS.map((id) => COOP_SKIN_CATALOG[id]);

// ============================================================================
// 2. Jeff the Rock Skins (6)
// ============================================================================

export interface JeffSkinMeta {
  id: JeffSkinId;
  name: string;
  description: string;
  tint: string;
  unlockHint: string;
}

export const JEFF_SKIN_CATALOG: Readonly<Record<JeffSkinId, JeffSkinMeta>> = {
  Default: {
    id: 'Default',
    name: 'Granite Jeff',
    description: 'A dependable, heavy alpine boulder with hand-painted eyes and endless patience.',
    tint: '#7c8599',
    unlockHint: 'Unlocked from the start.',
  },
  Bowling: {
    id: 'Bowling',
    name: 'Strike Ball',
    description: 'Glossy three-hole marble sphere ready to roll straight down icy ledges.',
    tint: '#2f3654',
    unlockHint: 'Carry Jeff past the Ice Terrace.',
  },
  Headless: {
    id: 'Headless',
    name: 'Hollow Lantern',
    description: 'Carved mine-gourd boulder with an eerie ember glowing inside.',
    tint: '#df7126',
    unlockHint: 'Bring Jeff into the Dark Mines.',
  },
  Prisoner: {
    id: 'Prisoner',
    name: 'Iron Ball',
    description: 'Cast-iron chain weight that insists it is totally not slowing you down.',
    tint: '#4a4e61',
    unlockHint: 'Hang Jeff off a cliff wall 10 times.',
  },
  Dwarf: {
    id: 'Dwarf',
    name: 'Delver Helmet',
    description: 'Bearded miner rock sporting a brass headlamp and sturdy pickaxe emblem.',
    tint: '#b88346',
    unlockHint: 'Reach the Dark Mines Summit with Jeff.',
  },
  Scuba: {
    id: 'Scuba',
    name: 'Deep Diver',
    description: 'Brass diving bell with a glass porthole for high-altitude gale storms.',
    tint: '#48b8d0',
    unlockHint: 'Complete Solo Jeff Summit.',
  },
};

export const JEFF_SKIN_LIST: readonly JeffSkinMeta[] = JEFF_SKINS.map((id) => JEFF_SKIN_CATALOG[id]);

// ============================================================================
// 3. Rope Skins (12)
// ============================================================================

export interface RopeSkinMeta {
  id: RopeSkinId;
  name: string;
  description: string;
  primaryColor: string;
  secondaryColor: string;
}

export const ROPE_SKIN_CATALOG: Readonly<Record<RopeSkinId, RopeSkinMeta>> = {
  Default: {
    id: 'Default',
    name: 'Braided Hemp',
    description: 'Classic twin-ply mountaineering rope rated for chaotic penguin swings.',
    primaryColor: PALETTE.ROPE_BASE,
    secondaryColor: PALETTE.CLIFF_MID,
  },
  Animals: {
    id: 'Animals',
    name: 'Plush Tail',
    description: 'Striped cozy yarn braided like a fluffy woodland tail.',
    primaryColor: '#e86f34',
    secondaryColor: '#ffffff',
  },
  Box: {
    id: 'Box',
    name: 'Packing Twine',
    description: 'Crisp parcel string held together with reinforced kraft-paper knots.',
    primaryColor: '#d9b07c',
    secondaryColor: '#8f563b',
  },
  Bread: {
    id: 'Bread',
    name: 'Pretzel Braid',
    description: 'Golden twisted dough rope lightly dusted with coarse mountain salt.',
    primaryColor: '#e8a855',
    secondaryColor: '#9c5a22',
  },
  Fish: {
    id: 'Fish',
    name: 'Kelp Line',
    description: 'Slick sea-kelp cord dotted with tiny bobber floats.',
    primaryColor: '#40cc8c',
    secondaryColor: '#257d64',
  },
  Fruit: {
    id: 'Fruit',
    name: 'Berry Vine',
    description: 'Springy orchard vine speckled with bright berry blossoms.',
    primaryColor: '#6bd94b',
    secondaryColor: '#e63956',
  },
  Inverted: {
    id: 'Inverted',
    name: 'Prism Thread',
    description: 'High-contrast crimson and emerald threads wound in alternating spirals.',
    primaryColor: PALETTE.KRUNKED_SCARF,
    secondaryColor: PALETTE.FRED_SCARF,
  },
  Knight: {
    id: 'Knight',
    name: 'Steel Chain',
    description: 'Interlocking forged iron links that clink heroically when taut.',
    primaryColor: '#b8c4d4',
    secondaryColor: '#5d7285',
  },
  Pot: {
    id: 'Pot',
    name: 'Sausage Links',
    description: 'Campfire kitchen links knotted into an unexpectedly sturdy tether.',
    primaryColor: '#b84b3e',
    secondaryColor: '#df7126',
  },
  Robot: {
    id: 'Robot',
    name: 'Power Conduit',
    description: 'Insulated lab cable pulsing with bright cyan telemetry signals.',
    primaryColor: PALETTE.LAB_CYAN,
    secondaryColor: PALETTE.LAB_STEEL,
  },
  Skeleton: {
    id: 'Skeleton',
    name: 'Spine Cord',
    description: 'Pale articulated bone links scavenged from the lower mines.',
    primaryColor: '#f2f5ff',
    secondaryColor: '#8a8ca8',
  },
  Super: {
    id: 'Super',
    name: 'Laser Tether',
    description: 'Crackling golden energy beam built for heroic midair catches.',
    primaryColor: PALETTE.LAB_AMBER,
    secondaryColor: '#ffffff',
  },
};

export const ROPE_SKIN_LIST: readonly RopeSkinMeta[] = ROPE_SKINS.map((id) => ROPE_SKIN_CATALOG[id]);

// ============================================================================
// 4. Jukebox Tracks (11)
// ============================================================================

export interface JukeboxTrackMeta {
  id: JukeboxTrackId;
  title: string;
  subtitle: string;
  biome: BiomeId;
  bpm: number;
}

export const JUKEBOX_TRACK_CATALOG: Readonly<Record<JukeboxTrackId, JukeboxTrackMeta>> = {
  Base: {
    id: 'Base',
    title: 'Krunked & Fred Theme',
    subtitle: 'Cozy village waltz & braided rope bounce',
    biome: 'village',
    bpm: 112,
  },
  Bits: {
    id: 'Bits',
    title: '8-Bit Snowflakes',
    subtitle: 'Crisp chiptune arpeggios for classic ascents',
    biome: 'foothills',
    bpm: 124,
  },
  Track1: {
    id: 'Track1',
    title: 'Pine Ledge Waltz',
    subtitle: 'Snowy Foothills — brisk accordion & triangle bass',
    biome: 'foothills',
    bpm: 118,
  },
  Track2: {
    id: 'Track2',
    title: 'Lanterns in the Shaft',
    subtitle: 'Dark Mines — echoing subterranean pulse',
    biome: 'mines',
    bpm: 96,
  },
  Track3: {
    id: 'Track3',
    title: 'Pendulum Ridge',
    subtitle: 'Windy Crags — soaring gusts & syncopated chimes',
    biome: 'crags',
    bpm: 128,
  },
  Track4: {
    id: 'Track4',
    title: 'Crystal Glacier',
    subtitle: 'Summit Approach — sparkling icy bells',
    biome: 'summit',
    bpm: 132,
  },
  Track5: {
    id: 'Track5',
    title: 'Circuit Breaker',
    subtitle: 'Secret Lab — punchy synthwave pistons',
    biome: 'lab',
    bpm: 136,
  },
  Track6: {
    id: 'Track6',
    title: 'Bachicha Overdrive',
    subtitle: 'Boss Arena — high-voltage four-chain showdown',
    biome: 'boss',
    bpm: 148,
  },
  Remix1: {
    id: 'Remix1',
    title: 'Foothills Sprint Remix',
    subtitle: 'Upbeat time-trial rush through the pines',
    biome: 'foothills',
    bpm: 142,
  },
  Remix2: {
    id: 'Remix2',
    title: 'Deep Drafts Remix',
    subtitle: 'Driving cavern percussion & whistling winds',
    biome: 'mines',
    bpm: 134,
  },
  Random: {
    id: 'Random',
    title: 'Shuffle All Tracks',
    subtitle: 'Cycles dynamically through the mountain soundtrack',
    biome: 'village',
    bpm: 120,
  },
};

export const JUKEBOX_TRACK_LIST: readonly JukeboxTrackMeta[] = JUKEBOX_TRACKS.map(
  (id) => JUKEBOX_TRACK_CATALOG[id],
);

// ============================================================================
// 5. Polaroids Album (12)
// ============================================================================

export interface PhotoMeta {
  id: PhotoId;
  title: string;
  caption: string;
  zone: BiomeId;
  altitudeHint: number;
}

export const PHOTO_CATALOG: Readonly<Record<PhotoId, PhotoMeta>> = {
  Photo1: {
    id: 'Photo1',
    title: 'Chimney Lookout',
    caption: 'Krunked & Fred waving from the pine ledge above the Foothills chimney.',
    zone: 'foothills',
    altitudeHint: 39,
  },
  Photo2: {
    id: 'Photo2',
    title: 'Minecart Crossing',
    caption: 'Two glowing headlamps caught mid-ride over the echoing mine cavern.',
    zone: 'mines',
    altitudeHint: 117,
  },
  Photo3: {
    id: 'Photo3',
    title: 'Village Campfire',
    caption: 'Marshmallows toasting beside the starting cabin before the big climb.',
    zone: 'village',
    altitudeHint: 2,
  },
  Photo4: {
    id: 'Photo4',
    title: 'First Big Swing',
    caption: 'Fred soaring gracefully while Krunked clings to the snow ledge for dear life.',
    zone: 'foothills',
    altitudeHint: 60,
  },
  Photo5: {
    id: 'Photo5',
    title: 'Lantern Trestle',
    caption: 'Old wooden mine supports lit by warm amber brass lamps.',
    zone: 'mines',
    altitudeHint: 140,
  },
  Photo6: {
    id: 'Photo6',
    title: 'Deep Shaft Seal',
    caption: 'A rescued baby seal balancing a pebble right on its nose.',
    zone: 'mines',
    altitudeHint: 185,
  },
  Photo7: {
    id: 'Photo7',
    title: 'Gale Watchtower',
    caption: 'Scarves whipping sideways across the roaring Crags bridge.',
    zone: 'crags',
    altitudeHint: 255,
  },
  Photo8: {
    id: 'Photo8',
    title: 'Suspended Cradle',
    caption: 'Catching a sudden gust aboard the highest hanging timber platform.',
    zone: 'crags',
    altitudeHint: 330,
  },
  Photo9: {
    id: 'Photo9',
    title: 'Mirror Glacier',
    caption: 'Starlight reflecting off translucent violet summit ice.',
    zone: 'summit',
    altitudeHint: 425,
  },
  Photo10: {
    id: 'Photo10',
    title: 'Above the Clouds',
    caption: 'The entire snowy valley glittering far below the summit banner.',
    zone: 'summit',
    altitudeHint: 495,
  },
  Photo11: {
    id: 'Photo11',
    title: 'Piston Blueprint',
    caption: 'A candid snap beside a freshly powered cyan Troncho launcher.',
    zone: 'lab',
    altitudeHint: 545,
  },
  Photo12: {
    id: 'Photo12',
    title: 'Victory Over Bachicha',
    caption: 'Krunked & Fred high-fiving atop the deactivated Lab mech.',
    zone: 'boss',
    altitudeHint: 660,
  },
};

export const PHOTO_LIST: readonly PhotoMeta[] = PHOTO_IDS.map((id) => PHOTO_CATALOG[id]);

// ============================================================================
// 6. Climber Manual Pages (7)
// ============================================================================

export interface ManualPageMeta {
  id: ManualPageId;
  title: string;
  tip: string;
  controlsHint: string;
  zone: BiomeId;
}

export const MANUAL_PAGE_CATALOG: Readonly<Record<ManualPageId, ManualPageMeta>> = {
  Swing: {
    id: 'Swing',
    title: 'Anchor & Pendulum Swing',
    tip: 'Have one penguin hold Anchor at a ledge while the other drops below on the taut rope. Pump Left and Right in rhythm to build arc speed, then press Jump near the peak to launch across wide chasms!',
    controlsHint: 'Anchor: C / Slash  |  Swing Pump: Left/Right  |  Launch: Jump',
    zone: 'foothills',
  },
  Grab: {
    id: 'Grab',
    title: 'Wall Cling & Stamina',
    tip: 'Hold Grab next to snow or dirt cliff walls to cling tightly for up to 15 seconds. Watch the red tint and sweat drops—jump off before stamina runs dry! Slick ice and thin wooden platforms cannot be grabbed.',
    controlsHint: 'Grab: Left Shift / Right Shift',
    zone: 'foothills',
  },
  Mines: {
    id: 'Mines',
    title: 'Dark Mines & Crumbling Rock',
    tip: 'Beyond 103m the shaft goes pitch black—stay close so your twin headlamps illuminate the path. Cracked rock blocks shake for 1 second before crumbling and reform 2 seconds later.',
    controlsHint: 'Keep moving across shaking rock bridges!',
    zone: 'mines',
  },
  Ice: {
    id: 'Ice',
    title: 'Glacier Ice Momentum',
    tip: 'Ice ledges take half a second to accelerate or brake. Tap Anchor on solid snow after an icy jump to stop your partner from sliding off the edge.',
    controlsHint: 'Counter-steer early before braking on ice.',
    zone: 'foothills',
  },
  Wind: {
    id: 'Wind',
    title: 'Gale Cycles & Swing Cradles',
    tip: 'Mountain drafts blow for 5 seconds and rest for 5 seconds, preceded by a sharp 0.6s wind whistle. Anchor during headwinds, or ride wind-driven hanging platforms across deep shafts.',
    controlsHint: 'Listen for the whistle telegraph before every gust.',
    zone: 'crags',
  },
  Assist: {
    id: 'Assist',
    title: 'Rope Pull & Charlie Checkpoints',
    tip: 'In the Assist Menu you can enable Rope Pull to reel a dangling partner up, or Checkpoints to plant a Flag and hold Call Charlie to fly both penguins back safely.',
    controlsHint: 'Pull: Q / Period  |  Flag: F  |  Call Charlie: Hold R (1.5s)',
    zone: 'village',
  },
  Emotes: {
    id: 'Emotes',
    title: 'Claps & Rock-Paper-Scissors',
    tip: 'Celebrate tough climbs with a synchronized Clap, or settle who anchors next with an in-world game of Rock-Paper-Scissors!',
    controlsHint: 'Emote: E',
    zone: 'village',
  },
};

export const MANUAL_PAGE_LIST: readonly ManualPageMeta[] = MANUAL_PAGE_IDS.map(
  (id) => MANUAL_PAGE_CATALOG[id],
);

// ============================================================================
// 7. Achievements (26)
// ============================================================================

export interface AchievementMeta {
  id: AchievementId;
  name: string;
  description: string;
  category: 'climb' | 'coop' | 'collect' | 'mastery' | 'lab';
}

export const ACHIEVEMENT_CATALOG: Readonly<Record<AchievementId, AchievementMeta>> = {
  FirstSteps: {
    id: 'FirstSteps',
    name: 'Snowy First Steps',
    description: 'Leave the Village Hub and begin climbing the Snowy Foothills.',
    category: 'climb',
  },
  FirstSwing: {
    id: 'FirstSwing',
    name: 'Pendulum Partners',
    description: 'Launch a partner from a taut co-op pendulum swing.',
    category: 'coop',
  },
  WallClimber: {
    id: 'WallClimber',
    name: 'Flipper Grip',
    description: 'Cling to a vertical cliff face and leap higher.',
    category: 'climb',
  },
  RunOutStamina: {
    id: 'RunOutStamina',
    name: 'Sweaty Flippers',
    description: 'Hold onto a cliff wall until your grab stamina runs completely dry.',
    category: 'climb',
  },
  HardLanding: {
    id: 'HardLanding',
    name: 'Belly Flop',
    description: 'Take a comical hard belly-flop landing after a long fall.',
    category: 'climb',
  },
  DraggedDown: {
    id: 'DraggedDown',
    name: 'Down We Go!',
    description: 'Get pulled off a ledge by a dangling partner.',
    category: 'coop',
  },
  EnterMines: {
    id: 'EnterMines',
    name: 'Headlamps On',
    description: 'Cross the 91m threshold into the Dark Mines.',
    category: 'climb',
  },
  RescueSeal: {
    id: 'RescueSeal',
    name: 'Seal Savior',
    description: 'Rescue a stranded baby seal perched on the mountain.',
    category: 'collect',
  },
  WindRider: {
    id: 'WindRider',
    name: 'Catch the Draft',
    description: 'Ride a wind-driven hanging platform across a chasm.',
    category: 'climb',
  },
  FrozenSummit: {
    id: 'FrozenSummit',
    name: 'Frostbite Crest',
    description: 'Reach the icy upper summit approaches.',
    category: 'climb',
  },
  ReachPeakCoop: {
    id: 'ReachPeakCoop',
    name: 'Twin Peak Champions',
    description: 'Reach the Summit Flag together as Krunked & Fred.',
    category: 'mastery',
  },
  ReachPeakSolo: {
    id: 'ReachPeakSolo',
    name: 'Rock Solid',
    description: 'Reach the Summit Flag alongside Jeff the Rock in Solo mode.',
    category: 'mastery',
  },
  GameCompletedNoAssist: {
    id: 'GameCompletedNoAssist',
    name: 'Pure Alpine Purists',
    description: 'Complete a climb to the Summit without ever using Assist features.',
    category: 'mastery',
  },
  CallCharlie: {
    id: 'CallCharlie',
    name: 'Air Mail Express',
    description: 'Summon Charlie the checkpoint bird to carry you back to your flag.',
    category: 'coop',
  },
  RopePullRescue: {
    id: 'RopePullRescue',
    name: 'Reel ’Em In',
    description: 'Use Assist Rope Pull to hoist a dangling partner to safety.',
    category: 'coop',
  },
  PhotoCollectorHalf: {
    id: 'PhotoCollectorHalf',
    name: 'Shutterbugs',
    description: 'Collect at least 6 hidden Polaroids across the mountain.',
    category: 'collect',
  },
  PhotoCollectorAll: {
    id: 'PhotoCollectorAll',
    name: 'Full Scrapbook',
    description: 'Collect all 12 hidden Polaroids in your album.',
    category: 'collect',
  },
  ManualScholar: {
    id: 'ManualScholar',
    name: 'By the Book',
    description: 'Collect all 7 pages of the Climber Manual.',
    category: 'collect',
  },
  FashionPenguin: {
    id: 'FashionPenguin',
    name: 'Peak Couture',
    description: 'Equip a custom penguin skin and rope skin in the Skin Closet.',
    category: 'collect',
  },
  ClapTogether: {
    id: 'ClapTogether',
    name: 'Round of Applause',
    description: 'Clap in sync with your partner after a tricky jump.',
    category: 'coop',
  },
  RpsChampion: {
    id: 'RpsChampion',
    name: 'Best Out of One',
    description: 'Win an in-world Rock-Paper-Scissors clash against your partner.',
    category: 'coop',
  },
  EnterLab: {
    id: 'EnterLab',
    name: 'Secret Frequency',
    description: 'Enter the subterranean Secret Laboratory.',
    category: 'lab',
  },
  TronchoFlyer: {
    id: 'TronchoFlyer',
    name: 'Piston Express',
    description: 'Launch high into the air off a powered Troncho piston.',
    category: 'lab',
  },
  DefeatBachicha: {
    id: 'DefeatBachicha',
    name: 'Unchained Victory',
    description: 'Break all four chains and defeat Mech-Boss Bachicha.',
    category: 'lab',
  },
  TimeTrialBronze: {
    id: 'TimeTrialBronze',
    name: 'On the Clock',
    description: 'Earn at least a Bronze medal in any Time Trial course.',
    category: 'mastery',
  },
  TimeTrialPlatinum: {
    id: 'TimeTrialPlatinum',
    name: 'Flashpoint Penguins',
    description: 'Earn a gleaming Platinum medal in a Time Trial course.',
    category: 'mastery',
  },
};

export const ACHIEVEMENT_LIST: readonly AchievementMeta[] = ACHIEVEMENT_IDS.map(
  (id) => ACHIEVEMENT_CATALOG[id],
);
