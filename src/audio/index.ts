// ============================================================================
// Krunked & Fred — Audio Module Barrel Exports
// ============================================================================

import type { AudioModulePort } from '../contracts';
import { AudioEngine } from './AudioEngine';

export { AudioEngine } from './AudioEngine';
export { ProceduralSynth, type UiSoundKind, type VoiceHandle } from './ProceduralSynth';

export function createAudioEngine(): AudioModulePort {
  return new AudioEngine();
}
