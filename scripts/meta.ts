/**
 * Metadatos de la web (npm run meta): favicon en pixel art a partir de una ficha y la imagen para
 * compartir a partir de una escena (vecino más próximo, sin suavizar). Salen en public/.
 */
import sharp from 'sharp';
import { GAME_TAGLINE } from '../src/game/config';

await sharp('assets/sprites/chips/chip-4.png')
  .resize(32, 32, { kernel: 'nearest', fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9 })
  .toFile('public/favicon.png');

// 1200x630: la portada (que ya trae el título dibujado) a 1200 de ancho, recortada por abajo, con
// el subtítulo en una franja oscura.
const scene = await sharp('assets/sprites/screens/titulo.png').resize(1200, 675, { kernel: 'nearest' }).extract({ left: 0, top: 0, width: 1200, height: 630 }).toBuffer();
const title = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="540" width="1200" height="90" fill="#050403" fill-opacity="0.82"/>
  <text x="600" y="598" text-anchor="middle" font-family="monospace" font-size="40" fill="#b8963f">${GAME_TAGLINE}</text>
</svg>`);
await sharp(scene).composite([{ input: title }]).png({ compressionLevel: 9 }).toFile('public/og.png');
console.log('public/favicon.png y public/og.png');
