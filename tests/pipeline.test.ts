import { describe, expect, it } from 'vitest';
import { crop, findBlocks, fitNearest, removeBackground, removeSpecks, trimBrightEdges, type RgbaImage } from '../scripts/pipeline/image';

const MAGENTA = [240, 0, 240];
const BLOOD = [130, 20, 25];
const OUTLINE = [20, 18, 16];

/** Imagen de prueba a partir de un mapa de caracteres: m = magenta, b = sangre, o = contorno, k = rosa de halo. */
function image(rows: string[]): RgbaImage {
  const colors: Record<string, number[]> = { m: MAGENTA, b: BLOOD, o: OUTLINE, k: [190, 60, 185] };
  const width = rows[0].length;
  const data = new Uint8ClampedArray(width * rows.length * 4);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const [r, g, b] = colors[ch];
      data.set([r, g, b, 255], (y * width + x) * 4);
    }),
  );
  return { width, height: rows.length, data };
}

const alpha = (img: RgbaImage) =>
  Array.from({ length: img.height }, (_, y) =>
    Array.from({ length: img.width }, (_, x) => (img.data[(y * img.width + x) * 4 + 3] ? '#' : '.')).join(''),
  );

describe('pipeline de assets', () => {
  it('quita el fondo desde los bordes y respeta la sangre, aunque se parezca al magenta', () => {
    const img = removeBackground(
      image([
        'mmmmmmmm',
        'mooooomm',
        'mobbbomm',
        'mooooomm',
        'mmmmmmmm',
      ]),
    );
    expect(alpha(img)).toEqual(['........', '.#####..', '.#####..', '.#####..', '........']);
  });

  it('borra huecos de fondo encerrados por el sprite y el halo rosado del JPEG', () => {
    const img = removeBackground(
      image([
        'mmmmmmmmm',
        'mkooooomm',
        'mkomoomm',
        'mkooooomm',
        'mmmmmmmmm',
      ].map((r) => r.padEnd(9, 'm'))),
    );
    // El hueco magenta interior (fila 2) y la columna de halo rosa (k) desaparecen.
    expect(alpha(img)[2][3]).toBe('.');
    expect(alpha(img).map((r) => r[1])).toEqual(['.', '.', '.', '.', '.']);
  });

  it('elimina motas sueltas y trocea la hoja por bloques de izquierda a derecha', () => {
    const img = removeSpecks(
      removeBackground(
        image([
          'mmmmmmmmmmmmmmmmmmmm',
          'moommmmmmmmmmmmooomm',
          'moommmmmmmmmmmmooomm',
          'mmmmmmmmommmmmmmmmmm', // mota de 1 píxel
          'mmmmmmmmmmmmmmmmmmmm',
        ]),
      ),
      2,
    );
    const blocks = findBlocks(img, 4, 2);
    expect(blocks).toEqual([
      { x: 1, y: 1, width: 2, height: 2 },
      { x: 15, y: 1, width: 3, height: 2 },
    ]);
    expect(crop(img, blocks[1]).width).toBe(3);
  });

  it('detecta el color de fondo del borde: también funciona con fondo cian (la ruleta)', () => {
    const cyan = [40, 230, 240];
    const rows = ['ccccccc', 'cgooocc', 'coGoocc', 'cooooc' + 'c', 'ccccccc'];
    const colors: Record<string, number[]> = { c: cyan, o: OUTLINE, g: [60, 190, 195], G: [70, 200, 90] };
    const data = new Uint8ClampedArray(7 * 5 * 4);
    rows.forEach((row, y) => [...row].forEach((ch, x) => data.set([...colors[ch], 255], (y * 7 + x) * 4)));
    const img = removeBackground({ width: 7, height: 5, data });
    // El halo cian (g) se va; el verde del marcador de la ruleta (G) se queda: no es "teñido de cian".
    expect(alpha(img)).toEqual(['.......', '..###..', '.####..', '.####..', '.......']);
  });

  it('una zona grande de sangre rodeada por el sprite no se toma por un hueco de fondo', () => {
    const img = removeBackground(
      image([
        'mmmmmmmmm',
        'mooooooom',
        'mobbbbbom',
        'mobbbbbom',
        'mooooooom',
        'mmmmmmmmm',
      ]),
    );
    expect(alpha(img).slice(1, 5)).toEqual(['.#######.', '.#######.', '.#######.', '.#######.']);
  });

  it('reescala con vecino más próximo, centrado abajo y con alfa binario', () => {
    const src = image(['oo', 'bb']);
    const out = fitNearest(src, 8, 8);
    expect(out.width).toBe(8);
    // 2x2 → 8x8 a escala 4: llena todo; la mitad de abajo es sangre, sin mezclar colores.
    const pixel = (x: number, y: number) => Array.from(out.data.slice((y * 8 + x) * 4, (y * 8 + x) * 4 + 4));
    expect(pixel(0, 0)).toEqual([...OUTLINE, 255]);
    expect(pixel(7, 7)).toEqual([...BLOOD, 255]);
    const tall = fitNearest(image(['o', 'o']), 8, 8); // 1x2 → 4x8 centrado
    expect(alpha(tall)[7]).toBe('..####..');
  });

  it('recorta el filo blanco fino de los bordes (y una línea más de margen), sin tocar una imagen oscura', () => {
    const w = 20;
    const h = 12;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const white = y >= h - 2 || x >= w - 1;
        const v = white ? 250 : 12;
        data.set([v, v, v, 255], (y * w + x) * 4);
      }
    }
    expect(trimBrightEdges({ width: w, height: h, data })).toEqual({ x: 0, y: 0, width: w - 2, height: h - 3 });
    const dark = new Uint8ClampedArray(w * h * 4).fill(10);
    expect(trimBrightEdges({ width: w, height: h, data: dark })).toEqual({ x: 0, y: 0, width: w, height: h });
  });
});
