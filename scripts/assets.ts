/**
 * Pipeline de assets (solo lo que necesita el hito 4: basura y jugador).
 *
 *   npm run assets
 *
 * 1. Recorta el fondo magenta desde los bordes hacia dentro (flood fill).
 * 2. Trocea cada hoja en sprites detectando bloques.
 * 3. Reescala con vecino más próximo al tamaño final.
 * 4. Exporta PNG con transparencia a assets/sprites/.
 */
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';
import { crop, findBlocks, fitNearest, removeBackground, removeSpecks, type RgbaImage } from './pipeline/image';

interface Sheet {
  source: string;
  outDir: string;
  /** Nombres de los sprites, de izquierda a derecha. */
  names: string[];
  size: [number, number];
}

const SHEETS: Sheet[] = [
  {
    source: 'assets/raw/basura.png.jpeg',
    outDir: 'assets/sprites/trash',
    names: ['colilla', 'vaso', 'botella', 'billete', 'ficha', 'cartera', 'dedo'],
    size: [32, 32],
  },
  {
    // Frames 1-2: otro personaje caminando (lo usa el ayudante de limpieza).
    // Frames 3-4: el jugador agachado con la pinza y levantando el objeto. El idle está pendiente.
    source: 'assets/raw/jugador.png.jpeg',
    outDir: 'assets/sprites/player',
    names: ['walk-1', 'walk-2', 'crouch', 'lift'],
    size: [64, 64],
  },
];

async function load(path: string): Promise<RgbaImage> {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}

async function save(img: RgbaImage, path: string): Promise<void> {
  await sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length), {
    raw: { width: img.width, height: img.height, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toFile(path);
}

for (const sheet of SHEETS) {
  const img = removeSpecks(removeBackground(await load(sheet.source)), 40);
  const blocks = findBlocks(img, 12);
  if (blocks.length !== sheet.names.length) {
    throw new Error(`${sheet.source}: se esperaban ${sheet.names.length} sprites y hay ${blocks.length}`);
  }
  mkdirSync(sheet.outDir, { recursive: true });
  for (const [i, box] of blocks.entries()) {
    const out = `${sheet.outDir}/${sheet.names[i]}.png`;
    await save(fitNearest(crop(img, box), ...sheet.size), out);
    console.log(`${out}  (recorte ${box.width}x${box.height} en ${box.x},${box.y})`);
  }
}
