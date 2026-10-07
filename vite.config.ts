import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { CONTACT_EMAIL, GAME_TAGLINE, GAME_TITLE, SITE_URL } from './src/game/config.ts';
import { findPendingMarkers } from './scripts/pendingMarkers.ts';

/** Dominio público: SITE_URL del entorno al construir, o la constante de config. Sin barra final. */
const siteUrl = (process.env.SITE_URL || SITE_URL).replace(/\/+$/, '');

/**
 * El título, el subtítulo, el dominio y el contacto de las páginas HTML (index.html y privacidad.html) salen de
 * las constantes de config (%GAME_TITLE%, %GAME_TAGLINE%, %SITE_URL%, %CONTACT_EMAIL%).
 */
function gameTitle(): Plugin {
  return {
    name: 'game-title',
    transformIndexHtml: (html) =>
      html
        .replaceAll('%GAME_TITLE%', GAME_TITLE)
        .replaceAll('%GAME_TAGLINE%', GAME_TAGLINE)
        .replaceAll('%SITE_URL%', siteUrl)
        .replaceAll('%CONTACT_EMAIL%', CONTACT_EMAIL),
  };
}

/** Todos los archivos de texto de una carpeta, recursivamente. */
function textFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return textFiles(path);
    return /\.(html|js|css|json|txt|xml|webmanifest)$/.test(entry.name) || entry.name === '_headers' ? [path] : [];
  });
}

/** El build falla si en dist/ queda algún marcador pendiente («[PONER CONTACTO]», «%CONTACT_EMAIL%»…). */
function noPendingMarkers(): Plugin {
  let outDir = 'dist';
  return {
    name: 'no-pending-markers',
    apply: 'build',
    configResolved: (config) => {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const found = textFiles(outDir).flatMap((file) =>
        findPendingMarkers(readFileSync(file, 'utf8')).map((marker) => `${relative(outDir, file)}: ${marker}`),
      );
      if (found.length > 0) this.error(`Quedan marcadores pendientes en el build:\n  ${found.join('\n  ')}`);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [gameTitle(), noPendingMarkers()],
  build: {
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html'), privacidad: resolve(import.meta.dirname, 'privacidad.html') },
    },
  },
});
