import { describe, expect, it } from 'vitest';
import { playerBet, selectBetFraction } from '../src/game/actions';
import { betAmount, maxBet, playerBetAmount } from '../src/game/betting';
import { seededRng } from '../src/game/rng';
import { spin } from '../src/game/roulette';
import { LOSE, stateWith } from './helpers';

describe('selector de apuesta', () => {
  it('el techo empieza en 10 y crece x1,8 por nivel', () => {
    expect(maxBet(0)).toBe(10);
    expect(maxBet(1)).toBe(18);
    expect(maxBet(2)).toBe(32);
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

  it('usa los botones 1%, 10%, 50% y TODO', () => {
    const state = stateWith({ balance: 1000 });
    state.upgrades.maxBet = 12; // techo ~11.500, no limita
    const bets = [0, 1, 2, 3].map((i) => (selectBetFraction(state, i), playerBetAmount(state)));
    expect(bets).toEqual([10, 100, 500, 1000]);
  });

  it('el techo limita el TODO', () => {
    const state = stateWith({ balance: 1000, betFractionIndex: 3 });
    expect(playerBetAmount(state)).toBe(10);
  });

  it('apuesta al menos 1 ficha y nada con saldo 0', () => {
    expect(betAmount(5, 0.01, 10)).toBe(1);
    expect(betAmount(0, 1, 10)).toBe(0);
    const state = stateWith({ balance: 0 });
    expect(playerBet(state, 'negro', LOSE)).toBeNull();
  });

  it('spin rechaza apuestas mayores que el saldo', () => {
    const state = stateWith({ balance: 5 });
    expect(spin(state, { bettor: 'jugador', color: 'negro', bet: 6 }, LOSE)).toBeNull();
    expect(state.balance).toBe(5);
  });

  it('el saldo nunca baja de 0', () => {
    const state = stateWith({ balance: 10, betFractionIndex: 3 });
    playerBet(state, 'negro', LOSE);
    expect(state.balance).toBe(0);
  });
});
