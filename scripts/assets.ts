/**
 * Pipeline de assets de la mesa 1.
 *
 *   npm run assets
 *
 * 1. Recorta el fondo (magenta o cian, se detecta en el borde) desde los bordes hacia dentro, con
 *    tolerancia; nunca con un filtro de color global.
 * 2. Trocea cada hoja en sprites detectando bloques o con una cuadrícula.
 * 3. Reescala con vecino más próximo al tamaño final.
 * 4. Exporta PNG con transparencia a assets/sprites/.
 */
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';
import {
  crop,
  findBlocks,
  fitNearest,
  gridCell,
  opaqueBounds,
  removeBackground,
  removeSpecks,
  resizeNearest,
  type RgbaImage,
} from './pipeline/image';

/** Hoja con sprites separados por fondo: se trocea detectando bloques. */
interface BlockSheet {
  kind: 'blocks';
  source: string;
  outDir: string;
  names: string[];
  size: [number, number];
}

/** Hoja con rejilla dibujada: cada celda se recorta desde sus propios bordes. */
interface GridSheet {
  kind: 'grid';
  source: string;
  outDir: string;
  /** Bordes de columnas y filas en píxeles de la hoja (incluye 0 y el ancho/alto). */
  columns: number[];
  rows: number[];
  inset: number;
  /** Nombre por celda, fila a fila; null = no se exporta. */
  names: (string | null)[];
  size: [number, number];
}

/** Fondo de escena: sin recorte; se ajusta a la proporción y se escala al tamaño final. */
interface Background {
  kind: 'background';
  source: string;
  out: string;
  size: [number, number];
}

type Sheet = BlockSheet | GridSheet | Background;

const SHEETS: Sheet[] = [
  {
    kind: 'blocks',
    source: 'assets/raw/basura.png.jpeg',
    outDir: 'assets/sprites/trash',
    names: ['colilla', 'vaso', 'botella', 'billete', 'ficha', 'cartera', 'dedo'],
    size: [32, 32],
  },
  {
    // Frames 1-2: otro personaje caminando (lo usa el ayudante de limpieza).
    // Frames 3-4: el jugador agachado con la pinza y levantando el objeto. El idle está pendiente.
    kind: 'blocks',
    source: 'assets/raw/jugador.png.jpeg',
    outDir: 'assets/sprites/player',
    names: ['walk-1', 'walk-2', 'crouch', 'lift'],
    size: [64, 64],
  },
  {
    kind: 'blocks',
    source: 'assets/raw/encargado.png.jpeg',
    outDir: 'assets/sprites/lender',
    names: ['calm', 'uneasy', 'deformed'],
    size: [128, 128],
  },
  {
    // Fondo cian. A 150 px, el tamaño con el que se dibuja en la escena.
    kind: 'blocks',
    source: 'assets/raw/ruleta.png.jpeg',
    outDir: 'assets/sprites/roulette',
    names: ['healthy', 'broken'],
    size: [150, 150],
  },
  {
    // Rejilla 4x3: dos filas de fichas (de sucia a brillante) y una fila más alta con dos pilas por
    // celda, una encima de otra: esa fila se parte en dos (pilas pequeñas arriba, grandes abajo).
    kind: 'grid',
    source: 'assets/raw/fichas.png.jpeg',
    outDir: 'assets/sprites/chips',
    columns: [0, 256, 512, 768, 1024],
    rows: [0, 254, 512, 762, 1024],
    inset: 10,
    names: [
      'chip-1', 'chip-2', 'chip-3', 'chip-4',
      'chip-5', 'chip-6', 'chip-7', 'chip-8',
      'stack-1', 'stack-2', 'stack-3', 'stack-4',
      'stack-5', 'stack-6', 'stack-7', 'stack-8',
    ],
    size: [32, 32],
  },
  {
    // 5 ayudantes en paneles; en la mesa 1 solo hace falta el brazo mecánico del crupier.
    kind: 'grid',
    source: 'assets/raw/ayudantes.png.jpeg',
    outDir: 'assets/sprites/helpers',
    // Los paneles no miden lo mismo: el del brazo llega hasta x≈445.
    columns: [0, 446],
    rows: [0, 320],
    inset: 10,
    names: ['arm'],
    size: [64, 64],
  },
  {
    kind: 'background',
    source: 'assets/raw/fondo-mesa1.png.jpeg',
    out: 'assets/sprites/backgrounds/mesa1.png',
    size: [640, 360],
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

/** Quita el fondo, las motas y recorta a lo opaco. */
function cutOut(img: RgbaImage): RgbaImage {
  const clean = removeSpecks(removeBackground(img), 40);
  const box = opaqueBounds(clean);
  if (!box) throw new Error('celda vacía tras quitar el fondo');
  return crop(clean, box);
}

for (const sheet of SHEETS) {
  const img = await load(sheet.source);
  if (sheet.kind === 'background') {
    // Recorte centrado a la proporción del destino y reescalado con vecino más próximo.
    const [w, h] = sheet.size;
    const cropWidth = Math.min(img.width, Math.round((img.height * w) / h));
    const cropHeight = Math.min(img.height, Math.round((img.width * h) / w));
    const box = { x: Math.floor((img.width - cropWidth) / 2), y: Math.floor((img.height - cropHeight) / 2), width: cropWidth, height: cropHeight };
    mkdirSync(sheet.out.replace(/\/[^/]+$/, ''), { recursive: true });
    await save(resizeNearest(crop(img, box), w, h), sheet.out);
    console.log(`${sheet.out}  (recorte ${box.width}x${box.height} en ${box.x},${box.y})`);
    continue;
  }

  mkdirSync(sheet.outDir, { recursive: true });
  if (sheet.kind === 'blocks') {
    const clean = removeSpecks(removeBackground(img), 40);
    const blocks = findBlocks(clean, 12);
    if (blocks.length !== sheet.names.length) {
      throw new Error(`${sheet.source}: se esperaban ${sheet.names.length} sprites y hay ${blocks.length}`);
    }
    for (const [i, box] of blocks.entries()) {
      const out = `${sheet.outDir}/${sheet.names[i]}.png`;
      await save(fitNearest(crop(clean, box), ...sheet.size), out);
      console.log(`${out}  (recorte ${box.width}x${box.height} en ${box.x},${box.y})`);
    }
    continue;
  }

  const cols = sheet.columns.length - 1;
  for (let row = 0; row < sheet.rows.length - 1; row++) {
    for (let col = 0; col < cols; col++) {
      const name = sheet.names[row * cols + col];
      if (!name) continue;
      const cell = crop(img, {
        x: sheet.columns[col] + sheet.inset,
        y: sheet.rows[row] + sheet.inset,
        width: sheet.columns[col + 1] - sheet.columns[col] - 2 * sheet.inset,
        height: sheet.rows[row + 1] - sheet.rows[row] - 2 * sheet.inset,
      });
      const out = `${sheet.outDir}/${name}.png`;
      const sprite = cutOut(cell);
      await save(fitNearest(sprite, ...sheet.size), out);
      console.log(`${out}  (${sprite.width}x${sprite.height})`);
    }
  }
}

// gridCell se exporta para quien quiera trocear una rejilla uniforme.
void gridCell;
