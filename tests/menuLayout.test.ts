import { describe, expect, it } from 'vitest';
import { menuItems, type MenuItem } from '../src/game/menu';
import { MENU_AVAILABLE, MENU_BOTTOM, MENU_METRICS, MENU_TOP, menuDensity, menuHeight } from '../src/game/menuLayout';
import { STAGE_HEIGHT } from '../src/ui/stage';

/** Todas las combinaciones: con y sin guardado, sesión, final visto, servidor y entrada del modo demo. */
function allCombinations(): { tag: string; items: MenuItem[] }[] {
  const out: { tag: string; items: MenuItem[] }[] = [];
  for (const hasSave of [false, true])
    for (const loggedIn of [false, true])
      for (const finished of [false, true])
        for (const online of [false, true])
          for (const demo of [false, true]) {
            // La sesión no añade opciones al menú principal (va dentro de Cuenta): se recorre igual para que el test
            // falle si alguien vuelve a poner Sincronizar o Cerrar sesión fuera.
            let items = menuItems({ hasSave, online, finished });
            if (!demo) items = items.filter((i) => i !== 'demo');
            out.push({ tag: JSON.stringify({ hasSave, loggedIn, finished, online, demo }), items });
          }
  return out;
}

describe('menú principal: siempre cabe (sesión 12)', () => {
  it('el espacio queda entre el título y el borde inferior del escenario', () => {
    expect(MENU_TOP).toBeGreaterThanOrEqual(146); // la gota de la «S» del título acaba en 142
    expect(MENU_BOTTOM).toBeLessThanOrEqual(STAGE_HEIGHT - 6);
    expect(MENU_AVAILABLE).toBe(MENU_BOTTOM - MENU_TOP);
  });

  it('con todas las combinaciones de opciones, la altura calculada cabe en el espacio disponible', () => {
    const combos = allCombinations();
    expect(combos).toHaveLength(32);
    for (const { tag, items } of combos) {
      const density = menuDensity(items);
      expect(menuHeight(items, density), tag).toBeLessThanOrEqual(MENU_AVAILABLE);
    }
  });

  it('el peor caso (guardado con final, servidor, demo) usa la densidad compacta y cabe', () => {
    const worst = menuItems({ hasSave: true, online: true, finished: true });
    expect(worst).toEqual(['continue', 'newGame', 'settings', 'ranking', 'account', 'ending', 'demo', 'credits']);
    expect(menuHeight(worst, 'normal')).toBeGreaterThan(MENU_AVAILABLE);
    expect(menuDensity(worst)).toBe('compact');
    expect(menuHeight(worst, 'compact')).toBe(201);
  });

  it('los casos habituales conservan el aspecto normal', () => {
    expect(menuDensity(menuItems({ hasSave: false, online: true, finished: false }))).toBe('normal');
    expect(menuDensity(menuItems({ hasSave: true, online: false, finished: true }))).toBe('normal');
  });

  it('la separación compacta no deja que los marcos pixel (3 por lado) se pisen más que el borde oscuro', () => {
    expect(MENU_METRICS.compact.gap).toBeGreaterThanOrEqual(5);
    expect(MENU_METRICS.normal.gap).toBeGreaterThanOrEqual(5);
  });
});
