import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import { debtProgress, payDebt } from '../src/game/debt';
import { seededRng } from '../src/game/rng';
import { collectTrash, updateWork } from '../src/game/work';
import { stateWith } from './helpers';

describe('trabajo manual', () => {
  it('cada clic recoge un objeto de la tabla y gasta basura del suelo', () => {
    const state = stateWith();
    const rng = seededRng(9);
    const values = CONFIG.work.items.map((i) => i.value as number);
    for (let i = 0; i < 6; i++) {
      const item = collectTrash(state, rng)!;
      expect(values).toContain(item.value);
    }
    expect(state.work.items).toBe(0);
    expect(collectTrash(state, rng)).toBeNull();
    expect(state.balance).toBe(state.stats.workEarned);
  });

  it('reaparece un objeto cada 2 s hasta 6', () => {
    const state = stateWith();
    state.work.items = 0;
    updateWork(state, 3.9);
    expect(state.work.items).toBe(1);
    updateWork(state, 100);
    expect(state.work.items).toBe(6);
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
