import { defineConfig, type Plugin } from 'vite';
import { GAME_TAGLINE, GAME_TITLE, SITE_URL } from './src/game/config.ts';

/** Dominio público: SITE_URL del entorno al construir, o la constante de config. Sin barra final. */
const siteUrl = (process.env.SITE_URL || SITE_URL).replace(/\/+$/, '');

/**
 * El título, el subtítulo y el dominio de index.html salen de las constantes de config
 * (%GAME_TITLE%, %GAME_TAGLINE%, %SITE_URL%).
 */
function gameTitle(): Plugin {
  return {
    name: 'game-title',
    transformIndexHtml: (html) => html.replaceAll('%GAME_TITLE%', GAME_TITLE).replaceAll('%GAME_TAGLINE%', GAME_TAGLINE).replaceAll('%SITE_URL%', siteUrl),
  };
}

export default defineConfig({
  base: './',
  plugins: [gameTitle()],
});
