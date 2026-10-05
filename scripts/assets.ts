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
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import {
  crop,
  findBlocks,
  fitNearest,
  gridCell,
  opaqueBounds,
  removeBackground,
  removeSpecks,
  annulus,
  measureWheel,
  radialProfile,
  resizeNearest,
  splitAtSeparator,
  trimBrightEdges,
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
  /** Celdas sin fondo que quitar (el dibujo llena la celda hasta el borde): solo se recortan. */
  keepBackground?: string[];
}

/** Hoja con cajas a mano: cada caja se recorta desde sus propios bordes (sprites de tamaños distintos). */
interface BoxSheet {
  kind: 'boxes';
  source: string;
  outDir: string;
  boxes: { name: string; x: number; y: number; width: number; height: number; size: [number, number] }[];
}

/** Fondo de escena: sin recorte; se ajusta a la proporción y se escala al tamaño final. */
interface Background {
  kind: 'background';
  /** Ruta o patrón con extensión comodín (assets/raw/trastienda.*). */
  source: string;
  out: string;
  size: [number, number];
  /** Si falta el original, se avisa y se sigue (la escena usa un provisional). */
  optional?: boolean;
  /** Quita antes una línea clara fina de los bordes (imágenes generadas con un filo blanco). */
  trimEdges?: boolean;
}

/**
 * Rueda de la ruleta (sesión 8): hoja con dos ruedas (sana a la izquierda, rota a la derecha) separadas
 * por una línea. De cada una solo se conserva el aro de madera y el cono con su pomo; el anillo de
 * casillas (con la bola y los ceros pintados) se descarta y se dibuja en código.
 */
interface WheelSheet {
  kind: 'wheel';
  /** Patrones en orden de preferencia (el primero que exista). */
  sources: string[];
  separator: [number, number, number];
  outDir: string;
  names: [string, string];
  /** Diámetro final del aro en la escena (unidades). */
  size: number;
}

/** Dos sprites en una hoja separados por una línea (la bola y el marcador). */
interface PairSheet {
  kind: 'pair';
  source: string;
  separator: [number, number, number];
  outDir: string;
  names: [string, string];
  sizes: [[number, number], [number, number]];
}

type Sheet = BlockSheet | GridSheet | BoxSheet | Background | WheelSheet | PairSheet;

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
    // Tamaño en escena, detrás de la mesa: reescalado desde el original, no desde el de 128.
    kind: 'blocks',
    source: 'assets/raw/encargado.png.jpeg',
    outDir: 'assets/sprites/lender-scene',
    names: ['calm', 'uneasy', 'deformed'],
    size: [96, 96],
  },
  {
    // Fondo cian y línea magenta en medio. Si existe ruleta_aro (solo aro y cono), se usa esa.
    kind: 'wheel',
    sources: ['assets/raw/ruleta_aro.*', 'assets/raw/ruleta_limpia.*'],
    separator: [255, 0, 255],
    outDir: 'assets/sprites/roulette',
    names: ['healthy', 'broken'],
    size: 172,
  },
  {
    // Fondo magenta y línea negra en medio: la bola a la izquierda y el marcador a la derecha.
    kind: 'pair',
    source: 'assets/raw/bola_marcador.*',
    separator: [0, 0, 0],
    outDir: 'assets/sprites/roulette',
    names: ['ball', 'marker'],
    sizes: [[9, 9], [13, 13]],
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
    // 5 ayudantes en paneles: brazo (mesa 1), zombi (2), camarero (3), esqueleto (4) y diablillo coronado (5).
    kind: 'grid',
    source: 'assets/raw/ayudantes.png.jpeg',
    outDir: 'assets/sprites/helpers',
    // Los paneles no miden lo mismo: el del brazo llega hasta x≈445 y el del zombi hasta x≈707.
    columns: [0, 446, 708, 1022, 1310, 1600],
    rows: [0, 320],
    inset: 10,
    names: ['arm', 'zombie', 'ghost', 'skeleton', 'imp'],
    size: [64, 64],
  },
  {
    // Mesa 2: la máquina (con su palanca) a la izquierda y los 6 símbolos en dos filas de tres.
    kind: 'boxes',
    source: 'assets/raw/tragaperras.png.jpeg',
    outDir: 'assets/sprites/slots',
    boxes: [
      { name: 'machine', x: 90, y: 50, width: 540, height: 660, size: [200, 252] },
      { name: 'cereza', x: 676, y: 146, width: 224, height: 222, size: [32, 32] },
      { name: 'calavera', x: 918, y: 146, width: 212, height: 222, size: [32, 32] },
      { name: 'diamante', x: 1148, y: 146, width: 222, height: 222, size: [32, 32] },
      { name: 'limon', x: 676, y: 398, width: 224, height: 222, size: [32, 32] },
      { name: 'siete', x: 918, y: 398, width: 212, height: 222, size: [32, 32] },
      { name: 'ojo', x: 1148, y: 398, width: 222, height: 222, size: [32, 32] },
    ],
  },
  {
    // Prestamista de la mesa 2, a tamaño de escena (detrás de la máquina central).
    kind: 'blocks',
    source: 'assets/raw/tragaperras-viviente.png.jpeg',
    outDir: 'assets/sprites/lender2-scene',
    names: ['calm', 'uneasy', 'deformed'],
    size: [96, 96],
  },
  {
    kind: 'background',
    source: 'assets/raw/fondo-mesa2.png.jpeg',
    out: 'assets/sprites/backgrounds/mesa2.png',
    size: [640, 360],
  },
  {
    // Mesa 3: las 6 caras planas (arriba) y el dado en 3/4 (para el giro al tirar).
    kind: 'boxes',
    source: 'assets/raw/dados.png.jpeg',
    outDir: 'assets/sprites/dice',
    boxes: [
      { name: 'face-1', x: 24, y: 16, width: 222, height: 222, size: [32, 32] },
      { name: 'face-2', x: 250, y: 16, width: 224, height: 222, size: [32, 32] },
      { name: 'face-3', x: 480, y: 16, width: 222, height: 222, size: [32, 32] },
      { name: 'face-4', x: 706, y: 16, width: 224, height: 222, size: [32, 32] },
      { name: 'face-5', x: 934, y: 16, width: 226, height: 222, size: [32, 32] },
      { name: 'face-6', x: 1164, y: 16, width: 222, height: 222, size: [32, 32] },
      { name: 'tumble', x: 500, y: 288, width: 410, height: 440, size: [32, 32] },
    ],
  },
  {
    // Prestamista de la mesa 3, a tamaño de escena (detrás de la barra).
    kind: 'blocks',
    source: 'assets/raw/barman.png.jpeg',
    outDir: 'assets/sprites/lender3-scene',
    names: ['calm', 'uneasy', 'deformed'],
    size: [96, 96],
  },
  {
    kind: 'background',
    source: 'assets/raw/fondo-mesa3.png.jpeg',
    out: 'assets/sprites/backgrounds/mesa3.png',
    size: [640, 360],
  },
  {
    // Mesa 4: el dorso de las cartas (las caras se dibujan con código: la hoja solo trae A, K y 7).
    kind: 'boxes',
    source: 'assets/raw/cartas.png.jpeg',
    outDir: 'assets/sprites/cards',
    boxes: [{ name: 'back', x: 478, y: 216, width: 212, height: 316, size: [32, 48] }],
  },
  {
    // Prestamista de la mesa 4, a tamaño de escena (detrás de la mesa). Cajas a mano: la hoja trae un
    // degradado blanco en los bordes de los paneles que une los tres frames.
    kind: 'boxes',
    source: 'assets/raw/crupier.png.jpeg',
    outDir: 'assets/sprites/lender4-scene',
    boxes: [
      { name: 'calm', x: 40, y: 0, width: 455, height: 506, size: [96, 96] },
      { name: 'uneasy', x: 565, y: 0, width: 455, height: 506, size: [96, 96] },
      { name: 'deformed', x: 1100, y: 0, width: 480, height: 506, size: [96, 96] },
    ],
  },
  {
    kind: 'background',
    source: 'assets/raw/fondo-mesa4.png.jpeg',
    out: 'assets/sprites/backgrounds/mesa4.png',
    size: [640, 360],
  },
  {
    // Mesa 5: la moneda (cara: el rey coronado; cruz: la calavera), para girarla en la escena.
    kind: 'boxes',
    source: 'assets/raw/moneda.*',
    outDir: 'assets/sprites/coin',
    boxes: [
      { name: 'cara', x: 200, y: 160, width: 1100, height: 1120, size: [48, 48] },
      { name: 'cruz', x: 1600, y: 160, width: 1110, height: 1120, size: [48, 48] },
    ],
  },
  {
    // Prestamista de la mesa 5, a tamaño de escena (sentado tras el escritorio).
    kind: 'blocks',
    source: 'assets/raw/dueno.png.jpeg',
    outDir: 'assets/sprites/lender5-scene',
    names: ['calm', 'uneasy', 'deformed'],
    size: [96, 96],
  },
  {
    kind: 'background',
    source: 'assets/raw/fondo-mesa5.png.jpeg',
    out: 'assets/sprites/backgrounds/mesa5.png',
    size: [640, 360],
  },
  {
    kind: 'background',
    source: 'assets/raw/fondo-mesa1.png.jpeg',
    out: 'assets/sprites/backgrounds/mesa1.png',
    size: [640, 360],
  },
  {
    // Pantalla de título: la imagen ya trae el logo dibujado (no se dibuja en código).
    kind: 'background',
    source: 'assets/raw/titulo.*',
    out: 'assets/sprites/screens/titulo.png',
    size: [640, 360],
    optional: true,
    trimEdges: true,
  },
  {
    // Pantalla final: la figura subiendo hacia las puertas abiertas.
    kind: 'background',
    source: 'assets/raw/final.*',
    out: 'assets/sprites/screens/final.png',
    size: [640, 360],
    optional: true,
    trimEdges: true,
  },
  {
    // Lo genera el diseñador; mientras no exista, la escena usa el casino reflejado y oscurecido.
    kind: 'background',
    source: 'assets/raw/trastienda.*',
    out: 'assets/sprites/backgrounds/trastienda.png',
    size: [640, 360],
    optional: true,
  },
];

/** Resuelve un patrón "carpeta/nombre.*" al primer archivo que exista (o null). */
function resolveSource(pattern: string): string | null {
  if (!pattern.endsWith('.*')) return existsSync(pattern) ? pattern : null;
  const dir = pattern.slice(0, pattern.lastIndexOf('/'));
  const base = pattern.slice(dir.length + 1, -2);
  const match = existsSync(dir) ? readdirSync(dir).find((f) => f.startsWith(`${base}.`)) : undefined;
  return match ? `${dir}/${match}` : null;
}

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

/** Rueda: separa las dos, quita el cian, la hace circular, mide sus radios y guarda aro y cono aparte. */
async function processWheel(sheet: WheelSheet): Promise<void> {
  const source = sheet.sources.map(resolveSource).find((s) => s !== null);
  if (!source) throw new Error(`No existe ninguna de ${sheet.sources.join(', ')}`);
  const img = await load(source);
  const geometry: Record<string, unknown> = { source, size: sheet.size };
  let ratios: { woodInner: number; cone: number } | null = null;
  mkdirSync(sheet.outDir, { recursive: true });
  for (const [i, box] of splitAtSeparator(img, sheet.separator).entries()) {
    const name = sheet.names[i];
    // Cian desde los bordes; huecos interiores solo si son casi idénticos al cian.
    const clean = removeSpecks(removeBackground(crop(img, box), { holeTolerance: 60, holeFraction: 0.6 }), 200);
    // Restos de cian en las grietas de la rueda rota (mezclados con la madera por el JPEG): el aro y el
    // cono no tienen ningún color con verde y azul muy por encima del rojo, así que esos píxeles fuera.
    for (let p = 0; p < clean.data.length; p += 4) {
      const [r, g, b] = [clean.data[p], clean.data[p + 1], clean.data[p + 2]];
      if (g > r + 60 && b > r + 60) clean.data[p + 3] = 0;
    }
    const bounds = opaqueBounds(clean)!;
    // El dibujo no es un círculo perfecto (un 4% más alto que ancho): se lleva a un cuadrado para que gire bien.
    const side = bounds.width;
    const wheel = resizeNearest(crop(clean, bounds), side, side);
    const c = side / 2;
    // Las dos ruedas salen de la misma plantilla: se mide la sana (sus filos dorados se separan bien del
    // anillo) y la rota usa las mismas proporciones (sus casillas desgastadas son tan claras como los filos).
    const own = measureWheel(radialProfile(wheel, c, c, Math.floor(c)), c);
    if (!ratios) ratios = { woodInner: own.woodInner / c, cone: own.cone / c };
    const measured = { outer: c, woodInner: Math.round(ratios.woodInner * c), cone: Math.round(ratios.cone * c) };
    const scale = sheet.size / side;
    const wood = annulus(wheel, c, c, measured.woodInner, c + 1);
    const cone = annulus(wheel, c, c, 0, measured.cone);
    await save(resizeNearest(wood, sheet.size, sheet.size), `${sheet.outDir}/${name}-wood.png`);
    await save(resizeNearest(cone, sheet.size, sheet.size), `${sheet.outDir}/${name}-cone.png`);
    geometry[name] = {
      sourcePx: { outer: Math.round(measured.outer), woodInner: measured.woodInner, cone: measured.cone },
      outer: sheet.size / 2,
      woodInner: Math.round(measured.woodInner * scale * 10) / 10,
      cone: Math.round(measured.cone * scale * 10) / 10,
    };
    console.log(`${sheet.outDir}/${name}-wood.png y -cone.png  (radios en la imagen: aro ${Math.round(c)}, interior del aro ${measured.woodInner}, cono ${measured.cone})`);
  }
  writeFileSync(`${sheet.outDir}/geometry.json`, `${JSON.stringify(geometry, null, 2)}
`);
}

/** Pareja: dos sprites separados por una línea; fuera la línea y el fondo de cada mitad. */
async function processPair(sheet: PairSheet): Promise<void> {
  const source = resolveSource(sheet.source);
  if (!source) throw new Error(`No existe ${sheet.source}`);
  const img = await load(source);
  mkdirSync(sheet.outDir, { recursive: true });
  for (const [i, box] of splitAtSeparator(img, sheet.separator, 12).entries()) {
    const sprite = cutOut(crop(img, box));
    await save(fitNearest(sprite, ...sheet.sizes[i]), `${sheet.outDir}/${sheet.names[i]}.png`);
    console.log(`${sheet.outDir}/${sheet.names[i]}.png  (${sprite.width}x${sprite.height})`);
  }
}

for (const sheet of SHEETS) {
  if (sheet.kind === 'wheel') {
    await processWheel(sheet);
    continue;
  }
  if (sheet.kind === 'pair') {
    await processPair(sheet);
    continue;
  }
  const source = resolveSource(sheet.source);
  if (!source) {
    if (sheet.kind === 'background' && sheet.optional) {
      console.log(`(falta ${sheet.source}: se usará el fondo provisional)`);
      continue;
    }
    throw new Error(`No existe ${sheet.source}`);
  }
  const loaded = await load(source);
  const trimmed = sheet.kind === 'background' && sheet.trimEdges ? trimBrightEdges(loaded) : null;
  const img = trimmed ? crop(loaded, trimmed) : loaded;
  if (trimmed && (trimmed.width !== loaded.width || trimmed.height !== loaded.height)) {
    console.log(`${source}: filo claro recortado (${loaded.width}x${loaded.height} → ${trimmed.width}x${trimmed.height} en ${trimmed.x},${trimmed.y})`);
  }
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
  if (sheet.kind === 'boxes') {
    for (const { name, size, ...box } of sheet.boxes) {
      const out = `${sheet.outDir}/${name}.png`;
      const sprite = cutOut(crop(img, box));
      await save(fitNearest(sprite, ...size), out);
      console.log(`${out}  (${sprite.width}x${sprite.height})`);
    }
    continue;
  }
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
      const sprite = sheet.keepBackground?.includes(name) ? cell : cutOut(cell);
      await save(fitNearest(sprite, ...sheet.size), out);
      console.log(`${out}  (${sprite.width}x${sprite.height})`);
    }
  }
}

// gridCell se exporta para quien quiera trocear una rejilla uniforme.
void gridCell;
