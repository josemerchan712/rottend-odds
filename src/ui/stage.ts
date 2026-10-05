/**
 * El "escenario": un bloque de 640x360 unidades (la resolución interna) con la escena y todos los
 * menús HTML dentro, a un factor ENTERO k de píxeles físicos por unidad y centrado en el contenedor
 * raíz, que ocupa toda la ventana (barras negras si sobra).
 *
 * Sesión 5 (texto nítido): antes se escalaba con `transform: scale(k/dpr)`, y el navegador
 * rasterizaba el HTML y el canvas de 640x360 a su tamaño y después lo estiraba (texto borroso en
 * pantalla completa y con dpr fraccionario). Ahora:
 * - el HTML usa `zoom` = k/dpr (la variable `--u`): se maqueta y se rasteriza ya a su tamaño final,
 *   y cada unidad de CSS es k píxeles físicos exactos;
 * - el canvas tiene la resolución física (640k x 360k), dibuja con la transformación k, sin
 *   suavizado; el texto va en su propia capa con VT323 a resolución física (sceneText.ts);
 * - la capa CRT va aparte, justo encima de la escena y por debajo del texto y del HUD, sin eventos ni filtros.
 */
import { clearTextLayer } from './sceneText';

export const STAGE_WIDTH = 640;
export const STAGE_HEIGHT = 360;

export interface StageLayout {
  /** Píxeles físicos por unidad del escenario (entero, al menos 1). */
  k: number;
  /** Píxeles CSS por unidad (k / dpr): el zoom del escenario y la variable --u. */
  u: number;
  /** Esquina del escenario en píxeles CSS, en un píxel físico exacto. */
  left: number;
  top: number;
}

/**
 * El mayor factor entero de píxeles físicos que cabe, y la esquina centrada alineada a píxel físico.
 * Función pura. Devuelve null con medidas imposibles (ventana minimizada, pestaña oculta, dpr 0):
 * entonces se conserva la composición anterior en vez de recomponer con un tamaño de 0.
 */
export function stageLayout(width: number, height: number, dpr: number): StageLayout | null {
  if (!(width >= 1 && height >= 1 && dpr > 0 && Number.isFinite(width) && Number.isFinite(height) && Number.isFinite(dpr))) return null;
  const k = Math.max(1, Math.floor(Math.min((width * dpr) / STAGE_WIDTH, (height * dpr) / STAGE_HEIGHT)));
  const left = Math.max(0, Math.floor((width * dpr - STAGE_WIDTH * k) / 2)) / dpr;
  const top = Math.max(0, Math.floor((height * dpr - STAGE_HEIGHT * k) / 2)) / dpr;
  return { k, u: k / dpr, left, top };
}

/** Factor de escala CSS para que cada unidad del escenario ocupe un número entero de píxeles físicos. */
export function stageScale(width: number, height: number, dpr: number): number {
  return stageLayout(width, height, dpr)?.u ?? 1;
}

let physicalScale = 1;

/** Píxeles físicos por unidad del escenario ahora mismo (para el canvas). */
export function stagePixelScale(): number {
  return physicalScale;
}

/**
 * Recoloca el escenario. Con un tamaño nulo o un dpr imposible (ventana minimizada) no hace nada y
 * devuelve false. No se usa document.hidden como bloqueo: algunos navegadores incrustados la dan por
 * oculta mientras se ve; las medidas transitorias de una página oculta se corrigen al volver
 * (visibilitychange → recolocar con debounce).
 */
export function layoutStage(root: HTMLElement, stage: HTMLElement): boolean {
  const { clientWidth: w, clientHeight: h } = root;
  const layout = stageLayout(w, h, window.devicePixelRatio || 1);
  if (!layout) return false;
  physicalScale = layout.k;
  root.style.setProperty('--u', `${layout.u}px`);
  stage.style.transform = '';
  stage.style.zoom = String(layout.u);
  // Con zoom, left y top del propio escenario también se multiplican por él.
  stage.style.left = `${layout.left / layout.u}px`;
  stage.style.top = `${layout.top / layout.u}px`;
  return true;
}

/**
 * La barra superior siempre en una línea: si el contenido no cabe, pasa a modo compacto (textos
 * abreviados); si sobra sitio de verdad (con margen, para no oscilar), vuelve al normal.
 */
export function fitHud(hud: HTMLElement | null): void {
  if (!hud || hud.clientWidth === 0) return;
  const overflow = hud.scrollWidth > hud.clientWidth + 1;
  if (overflow && !hud.classList.contains('compact')) hud.classList.add('compact');
  else if (!overflow && hud.classList.contains('compact')) {
    hud.classList.remove('compact');
    if (hud.scrollWidth > hud.clientWidth - 24) hud.classList.add('compact');
  }
}

/**
 * Prepara el canvas de la escena para dibujar un fotograma: resolución física (640k x 360k),
 * transformación k (se sigue dibujando en unidades de 640x360) y sin suavizado.
 */
export function prepareCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  const k = physicalScale;
  const w = STAGE_WIDTH * k;
  const h = STAGE_HEIGHT * k;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.imageSmoothingEnabled = false;
  clearTextLayer(w, h);
}

export function isFullscreen(): boolean {
  return document.fullscreenElement !== null;
}

/** Pantalla completa sobre el contenedor raíz (no el canvas). Necesita un gesto del usuario. */
export async function toggleFullscreen(root: HTMLElement): Promise<void> {
  try {
    if (isFullscreen()) await document.exitFullscreen();
    else await root.requestFullscreen();
  } catch {
    // El navegador lo ha denegado (sin gesto del usuario o en un iframe): se sigue en ventana.
  }
}

export async function enterFullscreen(root: HTMLElement): Promise<void> {
  if (isFullscreen()) return;
  try {
    await root.requestFullscreen();
  } catch {
    // Igual que arriba: no es grave.
  }
}

export type CrtLevel = 'apagado' | 'suave' | 'fuerte';

/**
 * Capa CRT en CSS sobre todo el escenario (escena y menús): scanlines de 1 unidad (alineadas al
 * píxel del juego), viñeta y grano animado. Tres niveles (data-crt en el escenario).
 */
export function mountCrt(stage: HTMLElement): { setLevel(level: CrtLevel): void; tick(): void } {
  const layer = document.createElement('div');
  layer.className = 'crt';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = '<div class="crt-grain"></div><div class="crt-scan"></div><div class="crt-vignette"></div>';
  // Justo encima de la escena: por debajo de la capa de texto y del HUD (el CRT no tapa el texto).
  const scene = stage.querySelector('.scene');
  if (scene) scene.after(layer);
  else stage.append(layer);

  // Textura de grano generada una vez (128x128) y desplazada al azar en cada frame.
  const tile = document.createElement('canvas');
  tile.width = tile.height = 128;
  const ctx = tile.getContext('2d')!;
  const img = ctx.createImageData(128, 128);
  for (let i = 0; i < 128 * 128; i++) {
    const v = Math.random() * 255;
    img.data.set([v, v, v, Math.random() < 0.5 ? 22 : 0], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  const grain = layer.querySelector<HTMLElement>('.crt-grain')!;
  grain.style.backgroundImage = `url(${tile.toDataURL()})`;

  let enabled = true;
  return {
    setLevel(level) {
      enabled = level !== 'apagado';
      layer.hidden = !enabled;
      stage.dataset.crt = level;
    },
    tick() {
      if (enabled) grain.style.backgroundPosition = `${Math.floor(Math.random() * 128)}px ${Math.floor(Math.random() * 128)}px`;
    },
  };
}
