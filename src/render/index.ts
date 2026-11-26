// ============================================================================
// Krunked & Fred — Render Module Entry Point & Factory
// Conforms strictly to RendererModulePort in src/contracts/index.ts.
// ============================================================================

import type { RendererModulePort } from '../contracts';
import { AssetPackManager } from '../assets';
import { GameRenderer } from './GameRenderer';

export function createGameRenderer(container: HTMLElement): RendererModulePort {
  return new GameRenderer(container);
}

export { GameRenderer } from './GameRenderer';
export { AssetPackManager } from '../assets';
export { WebGL2PixelBlitter } from './WebGL2PixelBlitter';
export { ParticlePool, MAX_PARTICLES, type ParticleKind } from './ParticlePool';
