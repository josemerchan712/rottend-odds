import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import { debtProgress, payDebt } from '../src/game/debt';
import { seededRng } from '../src/game/rng';
import type { TrashItem } from '../src/game/state';
import { buyUpgrade, upgradeCost } from '../src/game/upgrades';
import {
  bagMultiplier,
  cleanerInterval,
  collectItem,
  collectNearest,
  itemAt,
  itemValue,
  nearestItem,
  updateWork,
} from '../src/game/work';
import { stateWith } from './helpers';

const { work } = CONFIG;
const item = (id: number, kind: string, x: number, y: number): TrashItem => ({ id, kind, x, y });

/** Estado con el suelo ya sembrado (para tests que controlan la basura a mano). */
function seeded(items: TrashItem[] = []) {
  const state = stateWith();
  state.work.items = items;
  state.work.nextId = 100;
  return state;
}

describe('basura en el suelo', () => {
  it('el suelo empieza lleno, con objetos de la tabla dentro de la zona del suelo', () => {
    const state = stateWith();
    updateWork(state, 0.01, seededRng(1));
    expect(state.work.items).toHaveLength(work.maxItems);
    const kinds = work.items.map((i) => i.id);
    for (const i of state.work.items) {
      expect(kinds).toContain(i.kind);
      expect(i.x).toBeGreaterThanOrEqual(work.floor.x);
      expect(i.x).toBeLessThanOrEqual(work.floor.x + work.floor.width);
      expect(i.y).toBeGreaterThanOrEqual(work.floor.y);
      expect(i.y).toBeLessThanOrEqual(work.floor.y + work.floor.height);
    }
    expect(new Set(state.work.items.map((i) => i.id)).size).toBe(work.maxItems);
  });

  it('reaparece un objeto cada 2 s hasta un máximo de 6', () => {
    const state = seeded();
    const rng = seededRng(2);
    updateWork(state, 1.9, rng);
    expect(state.work.items).toHaveLength(0);
    updateWork(state, 0.2, rng);
    expect(state.work.items).toHaveLength(1);
    updateWork(state, 100, rng);
    expect(state.work.items).toHaveLength(6);
    updateWork(state, 100, rng);
    expect(state.work.items).toHaveLength(6);
  });

  it('las frecuencias de aparición siguen la tabla 4.2 (RNG con semilla)', () => {
    const state = seeded();
    const rng = seededRng(3);
    const counts: Record<string, number> = {};
    for (let n = 0; n < 20_000; n++) {
      updateWork(state, work.respawnInterval, rng);
      const [first] = state.work.items;
      counts[first.kind] = (counts[first.kind] ?? 0) + 1;
      state.work.items = [];
    }
    const total = work.items.reduce((s, i) => s + i.weight, 0);
    for (const def of work.items) expect((counts[def.id] ?? 0) / 20_000).toBeCloseTo(def.weight / total, 2);
  });

  it('procura que los objetos no se tapen', () => {
    const state = stateWith();
    updateWork(state, 0.01, seededRng(4));
    const items = state.work.items;
    let close = 0;
    for (const a of items) for (const b of items) if (a.id < b.id && Math.hypot(a.x - b.x, a.y - b.y) < work.minItemDistance) close++;
    expect(close).toBeLessThanOrEqual(1);
  });
});

describe('recoger', () => {
  it('la zona de clic es generosa y elige el objeto más cercano', () => {
    const items = [item(1, 'vaso', 200, 300), item(2, 'colilla', 240, 300)];
    // El centro visual está ~12 px por encima de la base.
    expect(itemAt(items, 200, 288)?.id).toBe(1);
    expect(itemAt(items, 214, 296)?.id).toBe(1); // desviado del centro, sigue dentro
    expect(itemAt(items, 236, 290)?.id).toBe(2);
    expect(itemAt(items, 400, 200)).toBeNull();
  });

  it('cada objeto suma su valor y desaparece', () => {
    const state = seeded([item(1, 'billete', 300, 300), item(2, 'colilla', 400, 300)]);
    const got = collectItem(state, 1);
    expect(got).toEqual([{ kind: 'billete', name: 'Billete arrugado', value: 15, x: 300, y: 300 }]);
    expect(state.balance).toBe(15);
    expect(state.work.items.map((i) => i.id)).toEqual([2]);
    expect(collectItem(state, 1)).toEqual([]);
  });

  it('el atajo de teclado recoge el más cercano al jugador', () => {
    const far = item(1, 'dedo', 590, 300);
    const near = item(2, 'colilla', 160, 340);
    const state = seeded([far, near]);
    expect(nearestItem(state.work.items, work.player)?.id).toBe(2);
    expect(collectNearest(state).map((c) => c.kind)).toEqual(['colilla']);
    expect(collectNearest(stateWith())).toEqual([]);
  });

  it('las pinzas recogen además el objeto más cercano al pulsado', () => {
    const state = seeded([item(1, 'vaso', 300, 300), item(2, 'colilla', 320, 300), item(3, 'dedo', 590, 330)]);
    state.upgrades.tweezers = 1;
    const got = collectItem(state, 1);
    expect(got.map((c) => c.kind)).toEqual(['vaso', 'colilla']);
    expect(state.work.items.map((i) => i.id)).toEqual([3]);
  });

  it('la bolsa grande sube el valor de cada objeto', () => {
    const state = seeded([item(1, 'ficha', 300, 300)]);
    expect(bagMultiplier(state)).toBe(1);
    state.upgrades.bigBag = 2;
    expect(bagMultiplier(state)).toBe(1 + 2 * work.bagValuePerLevel);
    expect(itemValue(state, 'ficha')).toBe(Math.round(40 * (1 + 2 * work.bagValuePerLevel)));
    expect(collectItem(state, 1)[0].value).toBe(itemValue(state, 'ficha'));
  });
});

describe('ayudante de limpieza', () => {
  it('no hace nada sin contratar', () => {
    const state = seeded([item(1, 'vaso', 300, 300)]);
    expect(updateWork(state, 100, seededRng(1))).toEqual([]);
    expect(cleanerInterval(0)).toBe(Infinity);
  });

  it('recoge el objeto más cercano a él cada intervalo y se mueve allí', () => {
    const state = seeded([item(1, 'vaso', 590, 340), item(2, 'colilla', 160, 280)]);
    state.upgrades.cleaner = 1;
    const rng = seededRng(5);
    expect(updateWork(state, cleanerInterval(1) - 0.01, rng)).toEqual([]);
    const got = updateWork(state, 0.02, rng);
    expect(got.map((c) => c.kind)).toEqual(['vaso']);
    expect(state.work.cleaner).toMatchObject({ x: 590, y: 340 });
    expect(state.balance).toBe(3);
  });

  it('cada nivel le hace un 20% más rápido', () => {
    expect(cleanerInterval(1)).toBe(work.cleaner.baseInterval);
    expect(cleanerInterval(3)).toBeCloseTo(work.cleaner.baseInterval * 0.8 ** 2, 10);
  });

  it('las mejoras del trabajo se compran con los costes de shared/config.json', () => {
    const state = stateWith({ balance: 10_000 });
    expect(buyUpgrade(state, 'tweezers')).toBe(true);
    expect(state.balance).toBe(10_000 - upgradeCost('tweezers', 0));
    expect(buyUpgrade(state, 'tweezers')).toBe(false); // un solo nivel
    expect(buyUpgrade(state, 'bigBag')).toBe(true);
    expect(buyUpgrade(state, 'cleaner')).toBe(true);
  });
});

describe('deuda', () => {
  it('solo se paga con 10M y conserva el sobrante', () => {
    const state = stateWith({ balance: 9_999_999 });
    expect(payDebt(state)).toBe(false);
    expect(debtProgress(state)).toBeLessThan(1);
    state.balance = 12_000_000;
    expect(payDebt(state)).toBe(true);
    expect(state.balance).toBe(2_000_000);
    expect(state.debtPaid).toBe(true);
    expect(payDebt(state)).toBe(false);
  });
});
