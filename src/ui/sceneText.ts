/**
 * Texto de las escenas (las cinco mesas), con la misma fuente que el HUD (VT323).
 *
 * Por qué así (sesión 6): antes el texto del canvas salía de máscaras umbralizadas a 1 píxel por
 * unidad (y los números del tapete de una fuente bitmap de 3x5): a 9-12 px VT323 se quedaba en
 * glifos de 3x5 en los que el 2 parecía un 7, y encima pasaba el filtro CRT. Ahora:
 * - `fillText` a resolución física (el canvas ya es 640k x 360k): el navegador rasteriza el texto
 *   como el del HUD, con todos sus píxeles físicos, sin estirar nada. Se eligió frente a elementos
 *   HTML superpuestos porque da la misma nitidez (mismo motor de fuentes, mismo tamaño físico) y
 *   sigue a la escena en el mismo fotograma (temblor, textos flotantes, cartas que se mueven) sin
 *   sincronizar cientos de nodos.
 * - Se dibuja en una capa de texto propia (un segundo canvas) por encima de la capa CRT y por debajo
 *   del HUD: las scanlines y el grano no pasan por encima del texto.
 * - Cada texto usa un estilo de la tabla STYLES (tamaño, color, fondo contra el que se lee y
 *   contorno). Altura mínima de mayúscula: 8 unidades (VT323 ≈ 0,6 × tamaño → 14 px); números del
 *   tapete y de las fichas, 16 px. Contraste mínimo 4,5:1 contra su fondo (tests/sceneText.test.ts).
 */

export interface TextStyle {
  /** Tamaño de la fuente en unidades del escenario. */
  size: number;
  color: string;
  /** Fondo contra el que se lee (para el contraste): el contorno si lo hay, o la caja donde va. */
  background: string;
  /** Contorno oscuro de 1 unidad alrededor de los glifos (texto sobre la escena). */
  outline: boolean;
}

/** Color del contorno de los textos sobre la escena. */
export const OUTLINE = '#0b0908';
/** Fondo de los paneles y paños de las mesas (el más claro de ellos, para ir a lo seguro). */
const PANEL = '#2a1d14';
/** Fondo de los botones impresos en las mesas. */
export const BUTTON_FILL = '#3a2812';
export const BUTTON_FILL_HOVER = '#5a3e18';
export const BUTTON_FILL_DISABLED = '#1e1712';
const PAPER = '#e3d9bd';

export const STYLES = {
  /** Contadores y etiquetas de los paneles (APUESTA, POZO, RACHA, DESCARTES, MANOS...). */
  label: { size: 14, color: '#e3dcc6', background: OUTLINE, outline: true },
  /** Etiquetas secundarias: atenuadas pero legibles. */
  muted: { size: 14, color: '#b9ae92', background: OUTLINE, outline: true },
  /** Valores destacados (racha encendida, jackpot posible, total del jugador). */
  value: { size: 14, color: '#f0d27a', background: OUTLINE, outline: true },
  /** Avisos de pérdida o de pasarse. */
  danger: { size: 14, color: '#ff8a7a', background: OUTLINE, outline: true },
  /** Texto de los botones impresos en la mesa. */
  button: { size: 14, color: '#f6dc8a', background: BUTTON_FILL, outline: false },
  buttonHover: { size: 14, color: '#fff0b8', background: BUTTON_FILL_HOVER, outline: false },
  /** Botón desactivado: atenuado (y con borde punteado), pero con contraste suficiente. */
  buttonDisabled: { size: 14, color: '#a99c7c', background: BUTTON_FILL_DISABLED, outline: false },
  /** Números del tapete de la ruleta (sobre negro o hueso) y la cantidad de las fichas. */
  numberOnDark: { size: 16, color: '#efe6cc', background: '#141110', outline: false },
  numberOnBone: { size: 16, color: '#141110', background: '#cfc5a6', outline: false },
  zoneOnFelt: { size: 14, color: '#efe6cc', background: '#3b4f28', outline: true },
  chip: { size: 16, color: '#efe6cc', background: OUTLINE, outline: true },
  chipSelected: { size: 16, color: '#f0d27a', background: OUTLINE, outline: true },
  chipDisabled: { size: 16, color: '#b9ae92', background: OUTLINE, outline: true },
  chipTag: { size: 14, color: '#f0d27a', background: OUTLINE, outline: true },
  /** Textos flotantes (+N, −N, JACKPOT). */
  float: { size: 16, color: '#f0d27a', background: OUTLINE, outline: true },
  floatBad: { size: 16, color: '#ff8a7a', background: OUTLINE, outline: true },
  /** Índices y palos de las cartas, sobre el papel. */
  cardInk: { size: 14, color: '#141110', background: PAPER, outline: false },
  cardRed: { size: 14, color: '#8f1d16', background: PAPER, outline: false },
  cardPip: { size: 22, color: '#141110', background: PAPER, outline: false },
  cardPipRed: { size: 22, color: '#8f1d16', background: PAPER, outline: false },
  /** Etiquetas de objetivo bloqueado (dados) y similares sobre los paneles. */
  locked: { size: 14, color: '#a99c7c', background: PANEL, outline: false },
} satisfies Record<string, TextStyle>;

export type TextStyleName = keyof typeof STYLES;

/** Altura de mayúscula mínima (unidades) y factor de VT323 (altura de mayúscula / tamaño). */
export const MIN_CAP_HEIGHT = 8;
export const VT323_CAP_RATIO = 0.6;

// ---------------------------------------------------------------------------
// Contraste (WCAG 2)

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const v = hex.replace('#', '');
  const n = parseInt(v.length === 3 ? v.split('').map((x) => x + x).join('') : v, 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------------------
// La capa de texto

let layer: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;

/** El canvas de la capa de texto (encima del CRT, debajo del HUD). */
export function mountTextLayer(canvas: HTMLCanvasElement): void {
  layer = { canvas, ctx: canvas.getContext('2d')! };
}

/** Limpia la capa para un fotograma nuevo con la resolución física de la escena. */
export function clearTextLayer(width: number, height: number): void {
  if (!layer) return;
  const { canvas, ctx } = layer;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
}

/** Ancho de un texto en unidades del escenario con ese estilo. */
export function textWidth(style: TextStyleName, value: string): number {
  const ctx = layer?.ctx;
  if (!ctx) return value.length * STYLES[style].size * 0.4;
  ctx.font = `${STYLES[style].size}px VT323, monospace`;
  const t = ctx.getTransform();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const w = ctx.measureText(value).width;
  ctx.setTransform(t);
  return w;
}

/**
 * Dibuja un texto de la escena con un estilo. `scene` es el contexto de la escena: su transformación
 * (escala k, temblor) y su transparencia se copian a la capa de texto, así el texto sigue a la escena.
 */
export function drawText(
  scene: CanvasRenderingContext2D,
  style: TextStyleName,
  value: string,
  x: number,
  y: number,
  align: CanvasTextAlign = 'center',
  baseline: CanvasTextBaseline = 'middle',
): void {
  if (!value) return;
  const s = STYLES[style];
  const ctx = layer?.ctx ?? scene;
  if (ctx !== scene) {
    ctx.setTransform(scene.getTransform());
    ctx.globalAlpha = scene.globalAlpha;
  }
  ctx.font = `${s.size}px VT323, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (s.outline) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2; // 1 unidad hacia fuera del glifo
    ctx.strokeStyle = OUTLINE;
    ctx.strokeText(value, x, y);
  }
  ctx.fillStyle = s.color;
  ctx.fillText(value, x, y);
  if (ctx !== scene) ctx.globalAlpha = 1;
}

/**
 * Un botón impreso en la mesa: caja con borde y su texto. Activo: borde dorado; con el ratón,
 * más claro; desactivado: caja apagada con borde punteado y texto atenuado (pero legible).
 */
export function drawButton(
  scene: CanvasRenderingContext2D,
  r: { x: number; y: number; width: number; height: number },
  label: string,
  state: 'active' | 'hover' | 'disabled',
): void {
  scene.fillStyle = OUTLINE;
  scene.fillRect(r.x - 1, r.y - 1, r.width + 2, r.height + 2);
  scene.fillStyle = state === 'hover' ? BUTTON_FILL_HOVER : state === 'active' ? BUTTON_FILL : BUTTON_FILL_DISABLED;
  scene.fillRect(r.x, r.y, r.width, r.height);
  scene.lineWidth = 1;
  scene.strokeStyle = state === 'disabled' ? '#6b5d44' : state === 'hover' ? '#fff0b8' : '#d4ad48';
  if (state === 'disabled') scene.setLineDash([2, 2]);
  scene.strokeRect(r.x + 0.5, r.y + 0.5, r.width - 1, r.height - 1);
  scene.setLineDash([]);
  drawText(scene, state === 'hover' ? 'buttonHover' : state === 'active' ? 'button' : 'buttonDisabled', label, r.x + r.width / 2, r.y + r.height / 2 + 1);
}

/** Los textos flotantes (+N, −N...): suben y se desvanecen. Rojo si el color pedido es rojizo. */
export function drawFloatTexts(scene: CanvasRenderingContext2D, floats: readonly { text: string; x: number; y: number; age: number; color: string }[], seconds: number): void {
  for (const f of floats) {
    scene.globalAlpha = Math.max(0, 1 - f.age / seconds);
    const n = parseInt(f.color.replace('#', '').slice(0, 6), 16);
    const bad = Number.isFinite(n) && (n >> 16) > ((n >> 8) & 255) * 1.4;
    drawText(scene, bad ? 'floatBad' : 'float', f.text, Math.round(f.x), Math.round(f.y - f.age * 18));
  }
  scene.globalAlpha = 1;
}
