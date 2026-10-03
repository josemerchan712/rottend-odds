import { describe, expect, it } from 'vitest';
import { playerBet, selectBetFraction } from '../src/game/actions';
import { betAmount, maxBet, playerBetAmount } from '../src/game/betting';
import { seededRng } from '../src/game/rng';
import { spin } from '../src/game/roulette';
import { LOSE, NEGRO, stateWith } from './helpers';

describe('selector de apuesta', () => {
  it('el techo empieza en 10 y crece x2,5 por nivel hasta ~95K', () => {
    expect(maxBet(0)).toBe(10);
    expect(maxBet(1)).toBe(25);
    expect(maxBet(2)).toBe(62);
    expect(maxBet(10)).toBe(Math.floor(10 * 2.5 ** 10));
  });

  it('nunca apuesta más que el saldo ni más que la apuesta máxima', () => {
    const rng = seededRng(1);
    for (let i = 0; i < 2000; i++) {
      const balance = Math.floor(rng() * 1e6);
      const ceiling = maxBet(Math.floor(rng() * 13));
      for (const f of [0.01, 0.1, 0.5, 1]) {
        const bet = betAmount(balance, f, ceiling);
        expect(bet).toBeLessThanOrEqual(balance);
        expect(bet).toBeLessThanOrEqual(ceiling);
        expect(bet).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('los botones 1%, 10%, 50% y TODO son fracciones del techo', () => {
    const state = stateWith({ balance: 1e9 });
    state.upgrades.maxBet = 11;
    const ceiling = maxBet(11);
    const bets = [0, 1, 2, 3].map((i) => (selectBetFraction(state, i), playerBetAmount(state)));
    expect(bets).toEqual([0.01, 0.1, 0.5, 1].map((f) => Math.floor(ceiling * f)));
  });

  it('si el saldo es menor que la apuesta pedida, se limita al saldo', () => {
    const state = stateWith({ balance: 7, betFractionIndex: 3 });
    expect(playerBetAmount(state)).toBe(7);
    state.balance = 1000;
    expect(playerBetAmount(state)).toBe(10);
  });

  it('apuesta al menos 1 ficha y nada con saldo 0', () => {
    expect(betAmount(5, 0.01, 10)).toBe(1);
    expect(betAmount(0, 1, 10)).toBe(0);
    const state = stateWith({ balance: 0 });
    expect(playerBet(state, NEGRO, LOSE)).toBeNull();
  });

  it('spin rechaza apuestas mayores que el saldo o que el techo', () => {
    const state = stateWith({ balance: 5 });
    expect(spin(state, { bettor: 'jugador', choice: NEGRO, bet: 6 }, LOSE)).toBeNull();
    expect(state.balance).toBe(5);
    state.balance = 1000;
    expect(spin(state, { bettor: 'jugador', choice: NEGRO, bet: 11 }, LOSE)).toBeNull();
    expect(state.balance).toBe(1000);
  });

  it('el saldo nunca baja de 0', () => {
    const state = stateWith({ balance: 10, betFractionIndex: 3 });
    playerBet(state, NEGRO, LOSE);
    expect(state.balance).toBe(0);
  });
});
