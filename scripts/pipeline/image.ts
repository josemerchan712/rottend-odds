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
  return borderColorOf(img);
}

function borderColorOf(img: RgbaImage): Rgb {
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
    holeMinPixels?: number;
    holeFraction?: number;
  } = {},
): RgbaImage {
  const {
    tolerance = 110,
    fringeTolerance = 320,
    fringePasses = 3,
    holeTolerance = 70,
    holeMinPixels = 1,
    holeFraction = 0.5,
  } = options;
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

  // Huecos encerrados (fondo rodeado por el sprite, al que no llega el relleno desde el borde).
  // También por relleno, nunca píxel a píxel: se buscan regiones conectadas parecidas al fondo y se
  // borra la región entera solo si la mayoría de sus píxeles son casi idénticos al fondo. Una zona
  // de sangre o fieltro no lo cumple, aunque tenga algún píxel suelto parecido.
  const seen = new Uint8Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || data[start * 4 + 3] === 0 || dist(px(img, start), bg) >= tolerance) continue;
    const region: number[] = [];
    const queue = [start];
    seen[start] = 1;
    while (queue.length) {
      const i = queue.pop()!;
      region.push(i);
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < w * (h - 1) ? i + w : -1]) {
        if (j >= 0 && !seen[j] && data[j * 4 + 3] !== 0 && dist(px(img, j), bg) < tolerance) {
          seen[j] = 1;
          queue.push(j);
        }
      }
    }
    const nearBg = region.filter((i) => dist(px(img, i), bg) < holeTolerance).length;
    if (nearBg >= holeMinPixels && nearBg / region.length >= holeFraction) {
      for (const i of region) data[i * 4 + 3] = 0;
    }
  }

  // Halo: píxeles teñidos del color del fondo (mezcla de fondo y contorno) pegados a la transparencia.
  // "Teñido" = los dos canales altos del fondo dominan sobre el bajo (magenta: R y B sobre G; cian: G y B sobre R).
  const lo = bg.indexOf(Math.min(...bg));
  const [hi1, hi2] = [0, 1, 2].filter((c) => c !== lo);
  const tinted = (c: Rgb) => c[hi1] - c[lo] > 35 && c[hi2] - c[lo] > 35 && Math.abs(c[hi1] - c[hi2]) < 90;
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
      if (touches && tinted(c) && dist(c, bg) < fringeTolerance) clear.push(i);
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

/** Recorta una celda de una cuadrícula (columnas x filas), dejando fuera `inset` píxeles de cada borde (las líneas de la rejilla). */
export function gridCell(img: RgbaImage, cols: number, rows: number, col: number, row: number, inset: number): RgbaImage {
  const cw = img.width / cols;
  const ch = img.height / rows;
  const x = Math.round(col * cw + inset);
  const y = Math.round(row * ch + inset);
  return crop(img, { x, y, width: Math.round(cw - 2 * inset), height: Math.round(ch - 2 * inset) });
}

/** Caja ajustada a lo opaco (o null si la imagen está vacía). */
export function opaqueBounds(img: RgbaImage): Box | null {
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] === 0) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/** Reescala con vecino más próximo a un tamaño exacto (para fondos, sin mantener transparencia). */
export function resizeNearest(img: RgbaImage, width: number, height: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(img.height - 1, Math.floor(((y + 0.5) * img.height) / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(img.width - 1, Math.floor(((x + 0.5) * img.width) / width));
      data.set(img.data.subarray((sy * img.width + sx) * 4, (sy * img.width + sx) * 4 + 4), (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

/**
 * Línea clara fina en los bordes (algunas imágenes generadas traen 1-4 píxeles blancos en un lado):
 * por cada lado quita las filas o columnas con brillo medio > `threshold` (como mucho `max`) y una
 * más de margen, porque el JPEG mezcla la línea con la vecina. Devuelve la caja que queda.
 */
export function trimBrightEdges(img: RgbaImage, threshold = 100, max = 8): Box {
  const mean = (x0: number, y0: number, dx: number, dy: number, n: number) => {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const p = ((y0 + dy * i) * img.width + (x0 + dx * i)) * 4;
      sum += (img.data[p] + img.data[p + 1] + img.data[p + 2]) / 3;
    }
    return sum / n;
  };
  const count = (line: (i: number) => number) => {
    let n = 0;
    while (n < max && line(n) > threshold) n++;
    return n > 0 ? n + 1 : 0;
  };
  const top = count((i) => mean(0, i, 1, 0, img.width));
  const bottom = count((i) => mean(0, img.height - 1 - i, 1, 0, img.width));
  const left = count((i) => mean(i, 0, 0, 1, img.height));
  const right = count((i) => mean(img.width - 1 - i, 0, 0, 1, img.height));
  return { x: left, y: top, width: img.width - left - right, height: img.height - top - bottom };
}

/**
 * Columnas del separador vertical entre dos dibujos de una hoja (una línea magenta o negra hacia el
 * centro): el tramo de columnas del 40-60% del ancho cuyo color medio está a menos de `tolerance`
 * del color dado. Devuelve [primera, última+1], o null si no hay línea.
 */
export function findSeparator(img: RgbaImage, color: Rgb, tolerance = 90): [number, number] | null {
  const { width: w, height: h } = img;
  const hits: number[] = [];
  for (let x = Math.floor(w * 0.4); x < Math.ceil(w * 0.6); x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let y = 0; y < h; y++) {
      const c = px(img, y * w + x);
      r += c[0];
      g += c[1];
      b += c[2];
    }
    if (dist([r / h, g / h, b / h], color) < tolerance) hits.push(x);
  }
  if (hits.length === 0) return null;
  return [Math.min(...hits), Math.max(...hits) + 1];
}

/** Las dos mitades de una hoja con un separador vertical, sin el separador ni `margin` px a cada lado. */
export function splitAtSeparator(img: RgbaImage, color: Rgb, margin = 4): [Box, Box] {
  const sep = findSeparator(img, color);
  const [a, b] = sep ?? [Math.floor(img.width / 2), Math.floor(img.width / 2)];
  const left: Box = { x: margin, y: margin, width: a - 2 * margin, height: img.height - 2 * margin };
  const right: Box = { x: b + margin, y: margin, width: img.width - b - 2 * margin, height: img.height - 2 * margin };
  return [left, right];
}

export interface RadialSample {
  r: number;
  /** Fracción de píxeles opacos a ese radio. */
  opaque: number;
  /** Luminancia media (0-255) y su desviación entre ángulos: el anillo de casillas varía mucho. */
  lum: number;
  spread: number;
  /** Saturación media (max - min de los canales). */
  sat: number;
}

/** Perfil radial desde (cx, cy): una muestra por radio entero, 360 ángulos. */
export function radialProfile(img: RgbaImage, cx: number, cy: number, maxR: number): RadialSample[] {
  const out: RadialSample[] = [];
  for (let r = 0; r <= maxR; r++) {
    const lums: number[] = [];
    let opaque = 0;
    let sat = 0;
    const n = 360;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * r);
      const y = Math.round(cy + Math.sin(a) * r);
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      const i = y * img.width + x;
      if (img.data[i * 4 + 3] === 0) continue;
      opaque++;
      const c = px(img, i);
      lums.push(0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]);
      sat += Math.max(...c) - Math.min(...c);
    }
    const mean = lums.reduce((s, v) => s + v, 0) / Math.max(lums.length, 1);
    const spread = Math.sqrt(lums.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(lums.length, 1));
    out.push({ r, opaque: opaque / 360, lum: mean, spread, sat: sat / Math.max(opaque, 1) });
  }
  return out;
}

/** Deja opaco solo lo que está entre los radios `inner` y `outer` desde (cx, cy). Devuelve una copia. */
export function annulus(img: RgbaImage, cx: number, cy: number, inner: number, outer: number): RgbaImage {
  const data = new Uint8ClampedArray(img.data);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const r = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (r < inner || r > outer) data[(y * img.width + x) * 4 + 3] = 0;
    }
  }
  return { width: img.width, height: img.height, data };
}

export interface WheelGeometry {
  /** Radio exterior del aro de madera (px de la imagen cuadrada). */
  outer: number;
  /** Radio interior del aro de madera: aquí empieza el anillo de casillas (incluye el filo dorado del aro). */
  woodInner: number;
  /** Radio del cono central con su filo dorado. */
  cone: number;
}

/**
 * Mide la rueda en su perfil radial: el cono y el aro están separados del anillo de casillas por dos
 * filos dorados, que son los máximos de luminancia en el 30-48% y en el 62-82% del radio. El cono
 * acaba donde su filo vuelve a oscurecerse; el aro empieza donde su filo se enciende.
 */
export function measureWheel(profile: readonly RadialSample[], outer: number): WheelGeometry {
  const peak = (from: number, to: number) => {
    let best = Math.round(from);
    for (let r = Math.round(from); r <= Math.round(to) && r < profile.length; r++) if (profile[r].lum > profile[best].lum) best = r;
    return best;
  };
  const coneRim = peak(outer * 0.3, outer * 0.48);
  const woodRim = peak(outer * 0.62, outer * 0.82);
  const half = (r: number, base: number) => (profile[r].lum + base) / 2;
  const ringLum = profile[Math.round((coneRim + woodRim) / 2)].lum;
  let cone = coneRim;
  while (cone < woodRim && profile[cone].lum > half(coneRim, ringLum)) cone++;
  let woodInner = woodRim;
  while (woodInner > coneRim && profile[woodInner].lum > half(woodRim, ringLum)) woodInner--;
  return { outer, woodInner, cone };
}
