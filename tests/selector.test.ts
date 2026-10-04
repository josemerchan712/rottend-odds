import { describe, expect, it } from 'vitest';
import { playerBet, selectBetFraction } from '../src/game/actions';
import { maxBet, niceFloor, playerBetAmount, riskLevel, selectedChip, selectorChips, stateChips } from '../src/game/betting';
import { seededRng } from '../src/game/rng';
import { NEGRO, stateWith } from './helpers';

const amounts = (ceiling: number, balance = 1e12) => selectorChips(balance, ceiling).map((c) => (c.all ? `TODO ${c.amount}` : c.amount));

describe('selector de apuesta con cantidades reales', () => {
  it('redondea hacia abajo a la secuencia 1, 2, 5, 10, 20, 50...', () => {
    expect([0.1, 1, 1.9, 2, 4.99, 5, 9.99, 10, 15.6, 78, 195, 1150, 47_500].map(niceFloor)).toEqual([
      1, 1, 1, 2, 2, 5, 5, 10, 10, 50, 100, 1000, 20_000,
    ]);
  });

  it('con techo 10 salen 1, 5 y TODO (la repetida se elimina)', () => {
    expect(amounts(10)).toEqual([1, 5, 'TODO 10']);
  });

  it('con techos mayores salen las cuatro fichas', () => {
    expect(amounts(156)).toEqual([1, 10, 50, 'TODO 156']);
    expect(amounts(390)).toEqual([2, 20, 100, 'TODO 390']);
    expect(amounts(11_500)).toEqual([100, 1000, 5000, 'TODO 11500']);
    expect(amounts(95_000)).toEqual([500, 5000, 20_000, 'TODO 95000']);
  });

  it('TODO es el mínimo entre saldo y techo; las fichas que no alcanzan el saldo se apagan', () => {
    const chips = selectorChips(30, 390);
    expect(chips.map((c) => [c.amount, c.affordable])).toEqual([
      [2, true],
      [20, true],
      [100, false],
      [30, true],
    ]);
    expect(selectorChips(0, 10).every((c) => !c.affordable)).toBe(true);
  });

  it('las cantidades se recalculan al subir el techo', () => {
    const state = stateWith({ balance: 1e6 });
    const before = stateChips(state).map((c) => c.amount);
    state.upgrades.maxBet = 4;
    expect(stateChips(state).map((c) => c.amount)).not.toEqual(before);
    expect(stateChips(state).at(-1)!.amount).toBe(maxBet(4));
  });

  it('la apuesta hecha es exactamente la cantidad mostrada', () => {
    const rng = seededRng(4);
    for (const level of [0, 3, 4, 6, 9]) {
      for (const index of [0, 1, 2, 3]) {
        const state = stateWith({ balance: 1e9 });
        state.upgrades.maxBet = level;
        selectBetFraction(state, index);
        const shown = selectedChip(state).amount;
        expect(playerBetAmount(state)).toBe(shown);
        expect(playerBet(state, NEGRO, rng)?.bet).toBe(shown);
      }
    }
  });

  it('si la ficha elegida desaparece al redondear, se usa la visible de debajo', () => {
    const state = stateWith({ balance: 100 }); // techo 10: fichas 1, 5, TODO
    selectBetFraction(state, 1); // la de 10% (1) se elimina por repetida
    expect(selectedChip(state).amount).toBe(1);
  });

  it('con una ficha que no alcanza el saldo no se apuesta', () => {
    const state = stateWith({ balance: 3 }); // techo 10: 1, 5 (apagada), TODO 3
    selectBetFraction(state, 2);
    expect(playerBetAmount(state)).toBe(0);
    expect(playerBet(state, NEGRO, seededRng(1))).toBeNull();
  });

  it('el nivel de riesgo sale de apuesta/techo, sin enseñar porcentajes', () => {
    expect(riskLevel(1, 390)).toBe('bajo');
    expect(riskLevel(20, 390)).toBe('bajo');
    expect(riskLevel(50, 390)).toBe('medio');
    expect(riskLevel(200, 390)).toBe('alto');
    expect(riskLevel(390, 390)).toBe('máximo');
  });
});
