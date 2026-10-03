/**
 * Funciones puras del pipeline de assets sobre imágenes RGBA en memoria (sin dependencias).
 * Las usa scripts/assets.ts y tienen tests en tests/pipeline.test.ts.
 */

export interface RgbaImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes por píxel. */
  data: Uint8ClampedArray;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Rgb = [number, number, number];

function px(img: RgbaImage, i: number): Rgb {
  return [img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]];
}

function dist(a: Rgb, b: Rgb): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Color de fondo: la mediana de los píxeles del borde (robusta ante el ruido del JPEG). */
export function borderColor(img: RgbaImage): Rgb {
  const samples: Rgb[] = [];
  const { width: w, height: h } = img;
  for (let x = 0; x < w; x++) samples.push(px(img, x), px(img, (h - 1) * w + x));
  for (let y = 0; y < h; y++) samples.push(px(img, y * w), px(img, y * w + w - 1));
  const median = (c: number) => samples.map((s) => s[c]).sort((a, b) => a - b)[samples.length >> 1];
  return [median(0), median(1), median(2)];
}

/**
 * Quita el fondo con un flood fill desde los bordes hacia dentro (no un filtro de color global:
 * el rojo del fieltro y la sangre se parecen al magenta). Después limpia el halo que deja la
 * compresión JPEG en los bordes de los sprites. Muta la imagen.
 */
export function removeBackground(
  img: RgbaImage,
  options: {
    tolerance?: number;
    fringeTolerance?: number;
    fringePasses?: number;
    holeTolerance?: number;
  } = {},
): RgbaImage {
  const { tolerance = 110, fringeTolerance = 320, fringePasses = 3, holeTolerance = 70 } = options;
  const { width: w, height: h, data } = img;
  const bg = borderColor(img);
  const visited = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (i: number) => {
    if (!visited[i] && dist(px(img, i), bg) < tolerance) {
      visited[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) push(x), push((h - 1) * w + x);
  for (let y = 0; y < h; y++) push(y * w), push(y * w + w - 1);
  while (stack.length) {
    const i = stack.pop()!;
    data[i * 4 + 3] = 0;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }

  // Huecos encerrados (fondo rodeado por el sprite, al que no llega el relleno desde el borde):
  // se borran solo los píxeles casi idénticos al fondo. Es un umbral muy estricto: la sangre y
  // el fieltro rojo quedan a más de 200 de distancia del magenta, así que no los toca.
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3] !== 0 && dist(px(img, i), bg) < holeTolerance) data[i * 4 + 3] = 0;
  }

  // Halo: píxeles de tono rosado/morado (mezcla de magenta y contorno) pegados a la transparencia.
  const pinkish = ([r, g, b]: Rgb) => r - g > 35 && b - g > 35 && Math.abs(r - b) < 90;
  for (let pass = 0; pass < fringePasses; pass++) {
    const clear: number[] = [];
    for (let i = 0; i < w * h; i++) {
      if (data[i * 4 + 3] === 0) continue;
      const x = i % w;
      const touches =
        (x > 0 && data[(i - 1) * 4 + 3] === 0) ||
        (x < w - 1 && data[(i + 1) * 4 + 3] === 0) ||
        (i >= w && data[(i - w) * 4 + 3] === 0) ||
        (i < w * (h - 1) && data[(i + w) * 4 + 3] === 0);
      const c = px(img, i);
      if (touches && pinkish(c) && dist(c, bg) < fringeTolerance) clear.push(i);
    }
    for (const i of clear) data[i * 4 + 3] = 0;
  }
  return img;
}

/** Borra manchas opacas sueltas de menos de `minPixels` (ruido del JPEG en el fondo). Muta la imagen. */
export function removeSpecks(img: RgbaImage, minPixels: number): RgbaImage {
  const { width: w, height: h, data } = img;
  const seen = new Uint8Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || data[start * 4 + 3] === 0) continue;
    const component: number[] = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      component.push(i);
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j >= 0 && j < w * h && !seen[j] && data[j * 4 + 3] !== 0) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    if (component.length < minPixels) for (const i of component) data[i * 4 + 3] = 0;
  }
  return img;
}

/**
 * Trocea una hoja en sprites detectando bloques: columnas con algún píxel opaco, separadas por
 * al menos `minGap` columnas vacías. Devuelve la caja ajustada de cada bloque, de izquierda a derecha.
 */
export function findBlocks(img: RgbaImage, minGap = 8, minWidth = 6): Box[] {
  const { width: w, height: h, data } = img;
  const opaqueColumn = (x: number) => {
    for (let y = 0; y < h; y++) if (data[(y * w + x) * 4 + 3] !== 0) return true;
    return false;
  };
  const runs: [number, number][] = [];
  let start = -1;
  let gap = 0;
  for (let x = 0; x <= w; x++) {
    const filled = x < w && opaqueColumn(x);
    if (filled) {
      if (start < 0) start = x;
      gap = 0;
    } else if (start >= 0) {
      gap++;
      if (gap >= minGap || x === w) {
        runs.push([start, x - gap]);
        start = -1;
        gap = 0;
      }
    }
  }
  return runs
    .filter(([a, b]) => b - a + 1 >= minWidth)
    .map(([x0, x1]) => {
      let y0 = h;
      let y1 = -1;
      for (let y = 0; y < h; y++) {
        for (let x = x0; x <= x1; x++) {
          if (data[(y * w + x) * 4 + 3] !== 0) {
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
            break;
          }
        }
      }
      return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
    });
}

export function crop(img: RgbaImage, box: Box): RgbaImage {
  const data = new Uint8ClampedArray(box.width * box.height * 4);
  for (let y = 0; y < box.height; y++) {
    const from = ((box.y + y) * img.width + box.x) * 4;
    data.set(img.data.subarray(from, from + box.width * 4), y * box.width * 4);
  }
  return { width: box.width, height: box.height, data };
}

/**
 * Reescala con vecino más próximo (sin suavizado) para que quepa en width×height manteniendo la
 * proporción, y lo coloca centrado abajo en un lienzo transparente de ese tamaño.
 */
export function fitNearest(img: RgbaImage, width: number, height: number): RgbaImage {
  const scale = Math.min(width / img.width, height / img.height);
  const sw = Math.max(1, Math.round(img.width * scale));
  const sh = Math.max(1, Math.round(img.height * scale));
  const ox = Math.floor((width - sw) / 2);
  const oy = height - sh;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < sh; y++) {
    const sy = Math.min(img.height - 1, Math.floor((y + 0.5) / scale));
    for (let x = 0; x < sw; x++) {
      const sx = Math.min(img.width - 1, Math.floor((x + 0.5) / scale));
      const from = (sy * img.width + sx) * 4;
      const to = ((oy + y) * width + ox + x) * 4;
      data[to] = img.data[from];
      data[to + 1] = img.data[from + 1];
      data[to + 2] = img.data[from + 2];
      // Alfa binario: nada de bordes semitransparentes en pixel art.
      data[to + 3] = img.data[from + 3] >= 128 ? 255 : 0;
    }
  }
  return { width, height, data };
}
