/**
 * El "escenario": un bloque de 640x360 unidades (la resolución interna) con la escena y todos los
 * menús HTML dentro, escalado con un factor ENTERO de píxeles físicos y centrado en el contenedor
 * raíz, que ocupa toda la ventana (barras negras si sobra). Así el pixel art, la fuente pixel y el
 * filtro CRT escalan juntos.
 */
export const STAGE_WIDTH = 640;
export const STAGE_HEIGHT = 360;

/** Factor de escala CSS para que cada unidad del escenario ocupe un número entero de píxeles físicos. */
export function stageScale(width: number, height: number, dpr: number): number {
  const k = Math.max(1, Math.floor(Math.min((width * dpr) / STAGE_WIDTH, (height * dpr) / STAGE_HEIGHT)));
  return k / dpr;
}

export function layoutStage(root: HTMLElement, stage: HTMLElement): void {
  const { clientWidth: w, clientHeight: h } = root;
  const scale = stageScale(w, h, window.devicePixelRatio || 1);
  // Desplazamiento redondeado a píxel físico para no partir píxeles del juego.
  const dpr = window.devicePixelRatio || 1;
  const left = Math.round(((w - STAGE_WIDTH * scale) / 2) * dpr) / dpr;
  const top = Math.round(((h - STAGE_HEIGHT * scale) / 2) * dpr) / dpr;
  stage.style.transform = `translate(${left}px, ${top}px) scale(${scale})`;
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

/** Capa CRT en CSS sobre todo el escenario (escena y menús): scanlines, viñeta y grano animado. */
export function mountCrt(stage: HTMLElement): { setEnabled(on: boolean): void; tick(): void } {
  const layer = document.createElement('div');
  layer.className = 'crt';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = '<div class="crt-grain"></div><div class="crt-scan"></div><div class="crt-vignette"></div>';
  stage.append(layer);

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
    setEnabled(on) {
      enabled = on;
      layer.hidden = !on;
    },
    tick() {
      if (enabled) grain.style.backgroundPosition = `${Math.floor(Math.random() * 128)}px ${Math.floor(Math.random() * 128)}px`;
    },
  };
}
