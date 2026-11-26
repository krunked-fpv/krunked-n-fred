/// <reference types="vite/client" />
// ============================================================================
// Krunked & Fred — Application Composition Root
// ============================================================================

import { GameApp } from './app/GameApp';
import { createAudioEngine } from './audio';
import { worldModule } from './data';
import { createGameRenderer } from './render';
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

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      app.dispose();
    });
  }
}

bootstrap();
