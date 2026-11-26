/// <reference types="vite/client" />
// ============================================================================
// Krunked & Fred — Application Composition Root
// ============================================================================

import { GameApp } from './app/GameApp';
import {
  renderCoopSkinPreview,
  renderJeffSkinPreview,
  renderManualDiagram,
  renderPolaroidPhoto,
  renderRopeSkinPreview,
} from './assets';
import { createAudioEngine } from './audio';
import { worldModule } from './data';
import { GameRenderer, createGameRenderer } from './render';
import { simModule } from './sim';

function bootstrap(): void {
  const container = document.getElementById('app');
  if (!container) {
    throw new Error('Krunked & Fred: #app root container not found.');
  }

  const renderer = createGameRenderer(container);
  const audio = createAudioEngine();

  const app = new GameApp(container, {
    sim: simModule,
    world: worldModule,
    renderer,
    audio,
  });

  // Wire rich hand-pixeled Polaroid, Manual, and Skin/Rope previews into Meta UI screens
  app.setMetaArtProvider({
    getPhotoArt: (id) => renderPolaroidPhoto(id),
    getManualDiagram: (id) => renderManualDiagram(id),
    getCoopSkinPreview: (id, who) => renderCoopSkinPreview(who, id),
    getJeffSkinPreview: (id) => renderJeffSkinPreview(id),
    getRopeSkinPreview: (id) => renderRopeSkinPreview(id),
  });

  // Forward any loaded custom pack audio URLs into AudioEngine
  if (renderer instanceof GameRenderer && audio.setCustomAudioPack) {
    const customAudio = renderer.getPackManager().getCustomAudioUrls();
    if (Object.keys(customAudio).length > 0) {
      audio.setCustomAudioPack(customAudio);
    }
  }

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      app.dispose();
    });
  }
}

bootstrap();
