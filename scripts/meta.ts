/**
 * Metadatos de la web (npm run meta): favicon en pixel art a partir de una ficha y la imagen para
 * compartir a partir de una escena (vecino más próximo, sin suavizar). Salen en public/.
 */
import sharp from 'sharp';

await sharp('assets/sprites/chips/chip-4.png')
  .resize(32, 32, { kernel: 'nearest', fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9 })
  .toFile('public/favicon.png');

// 1200x630: la mesa 5 a escala 2 (1280x720) recortada al centro, con una franja oscura y el título.
const scene = await sharp('assets/sprites/backgrounds/mesa5.png').resize(1280, 720, { kernel: 'nearest' }).extract({ left: 40, top: 45, width: 1200, height: 630 }).toBuffer();
const title = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="470" width="1200" height="160" fill="#050403" fill-opacity="0.82"/>
  <text x="60" y="560" font-family="monospace" font-size="84" fill="#c9a443">CASINO</text>
  <text x="62" y="604" font-family="monospace" font-size="30" fill="#e3dcc6">Debes diez millones. Paga cinco deudas y sal de la casa.</text>
</svg>`);
await sharp(scene).composite([{ input: title }]).png({ compressionLevel: 9 }).toFile('public/og.png');
console.log('public/favicon.png y public/og.png');
