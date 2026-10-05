import { defineConfig, type Plugin } from 'vite';
import { GAME_TAGLINE, GAME_TITLE } from './src/game/config.ts';

/** El título y el subtítulo de index.html salen de las constantes de config (%GAME_TITLE%, %GAME_TAGLINE%). */
function gameTitle(): Plugin {
  return {
    name: 'game-title',
    transformIndexHtml: (html) => html.replaceAll('%GAME_TITLE%', GAME_TITLE).replaceAll('%GAME_TAGLINE%', GAME_TAGLINE),
  };
}

export default defineConfig({
  base: './',
  plugins: [gameTitle()],
});
