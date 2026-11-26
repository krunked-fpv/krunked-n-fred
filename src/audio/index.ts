// ============================================================================
// Krunked & Fred — Audio Module Barrel Exports
// ============================================================================

import type { AudioModulePort } from '../contracts';
import { AudioEngine } from './AudioEngine';

export { AudioEngine } from './AudioEngine';
export { CustomAudioLoader, type CustomAudioLoaderOptions } from './CustomAudioLoader';
export {
  JUKEBOX_TRACK_DATA,
  RANDOM_PLAYLIST_ORDER,
  getBiomeDefaultTrack,
  getDeterministicRandomTrack,
  getTrackData,
  midiToHz,
  type JukeboxTrackData,
  type MelodyArticulation,
  type PercHit,
  type PlayableTrackId,
} from './JukeboxTracks';
export {
  ProceduralSynth,
  type UiSoundKind,
  type VoiceHandle,
  type WindBedHandle,
} from './ProceduralSynth';

export function createAudioEngine(): AudioModulePort {
  return new AudioEngine();
}
