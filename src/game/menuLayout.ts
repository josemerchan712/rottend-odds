import type { MenuItem } from './menu';

/**
 * Medidas del menú principal en unidades del escenario (640x360; cada unidad son `--u` píxeles CSS, así que
 * no dependen del dpr ni del tamaño de la ventana). Las mismas cifras están en style.css (.title-menu y
 * .title-menu.compact): si cambian aquí, cambian allí, y el test de extremo a extremo (scripts/e2e/titleMenu.ts)
 * mide el menú de verdad y falla si no coinciden.
 *
 * Sesión 12: el menú se cortaba por abajo con la sesión iniciada (empezaba en 166 y en el peor caso acababa en
 * 453). Ahora empieza en 150 (bajo la gota de la «S» del título, que acaba en 142) y tiene hasta 352 (8 de margen).
 */
export const MENU_TOP = 150;
export const MENU_BOTTOM = 352;
export const MENU_AVAILABLE = MENU_BOTTOM - MENU_TOP;

export type MenuDensity = 'normal' | 'compact';

interface Metrics {
  /** Alto de un botón de una línea (16 px de texto + relleno). */
  item: number;
  /** Separación: 5 como mínimo, para que los marcos pixel de 3 de dos botones solo compartan su borde oscuro. */
  gap: number;
  /** Línea pequeña bajo Continuar (y bajo Modo demo en normal; en compacto va en la misma línea). */
  line: number;
}

export const MENU_METRICS: Record<MenuDensity, Metrics> = {
  normal: { item: 23, gap: 6, line: 16 },
  compact: { item: 19, gap: 5, line: 14 },
};

/** Alto que ocupan las opciones con una densidad. */
export function menuHeight(items: readonly MenuItem[], density: MenuDensity): number {
  if (items.length === 0) return 0;
  const m = MENU_METRICS[density];
  let height = items.length * m.item + (items.length - 1) * m.gap;
  if (items.includes('continue')) height += m.line;
  if (density === 'normal' && items.includes('demo')) height += m.line;
  return height;
}

/** La densidad normal si cabe; si no, la compacta. */
export function menuDensity(items: readonly MenuItem[], available = MENU_AVAILABLE): MenuDensity {
  return menuHeight(items, 'normal') <= available ? 'normal' : 'compact';
}
