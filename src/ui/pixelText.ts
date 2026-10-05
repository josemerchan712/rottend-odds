/**
 * Texto pixelado en el canvas: en vez de fillText con antialias (que, con el canvas a resolución
 * física, saldría fino y suave, y antes salía en manchas grises al estirar el canvas de 640x360),
 * cada texto se rasteriza una vez a 1 píxel por unidad del escenario, se umbraliza (sin grises) y
 * se dibuja escalado sin suavizado: píxeles de juego nítidos a cualquier escala entera.
 *
 * Usa el estado del contexto como fillText: font, fillStyle, textAlign, textBaseline y globalAlpha.
 */

/** Alfa mínimo para que un píxel del texto cuente (los trazos finos de VT323 rondan la mitad). */
const ALPHA_THRESHOLD = 90;
const MAX_CACHE = 600;

interface Mask {
  canvas: HTMLCanvasElement;
  /** Dónde cae el punto (x, y) de fillText dentro de la máscara. */
  anchorX: number;
  anchorY: number;
}

const cache = new Map<string, Mask>();

function fontSize(font: string): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  return m ? Number(m[1]) : 12;
}

function rasterize(ctx: CanvasRenderingContext2D, text: string, color: string): Mask {
  const size = fontSize(ctx.font);
  const pad = Math.ceil(size);
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = ctx.font;
  const width = Math.ceil(probe.measureText(text).width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(width + pad * 2, 1);
  canvas.height = Math.ceil(size * 3);
  const g = canvas.getContext('2d')!;
  g.font = ctx.font;
  g.textAlign = ctx.textAlign;
  g.textBaseline = ctx.textBaseline;
  g.fillStyle = color;
  const anchorX = ctx.textAlign === 'center' ? Math.round(canvas.width / 2) : ctx.textAlign === 'right' || ctx.textAlign === 'end' ? width + pad : pad;
  const anchorY = Math.round(size * 1.5);
  g.fillText(text, anchorX, anchorY);
  const img = g.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= ALPHA_THRESHOLD ? 255 : 0;
  g.putImageData(img, 0, 0);
  return { canvas, anchorX, anchorY };
}

/** Como ctx.fillText, pero con píxeles de juego nítidos. */
export function fillPixelText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  if (!text) return;
  const color = ctx.fillStyle;
  if (typeof color !== 'string') {
    ctx.fillText(text, x, y); // degradados o patrones: sin caché
    return;
  }
  const key = `${ctx.font}|${color}|${ctx.textAlign}|${ctx.textBaseline}|${text}`;
  let mask = cache.get(key);
  if (!mask) {
    mask = rasterize(ctx, text, color);
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
    cache.set(key, mask);
  }
  ctx.drawImage(mask.canvas, Math.round(x) - mask.anchorX, Math.round(y) - mask.anchorY);
}
