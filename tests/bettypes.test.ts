import { describe, expect, it } from 'vitest';
import { maxBet } from '../src/game/betting';
import { CONFIG, type BetType } from '../src/game/config';
import { betWinChance, effectiveWinChance, jackpotChance } from '../src/game/luck';
import { seededRng } from '../src/game/rng';
import { spin, winningSlots } from '../src/game/roulette';
import type { BetChoice } from '../src/game/state';
import { LOSE, WIN, stateWith } from './helpers';

const DOZEN: BetChoice = { type: 'dozen', dozen: 2 };
const NUMBER: BetChoice = { type: 'number', number: 17 };

/** Valor esperado de la parte de ruleta (sin Cero Dorado) por ficha apostada. */
function rouletteEvPerChip(type: BetType, luck: number, fraction: number): number {
  const p = betWinChance(type, luck, fraction);
  return p * CONFIG.betTypes[type].payout - (1 - p);
}

function unlockedState(balance: number) {
  const state = stateWith({ balance });
  state.upgrades.dozenBet = 1;
  state.upgrades.numberBet = 1;
  state.upgrades.maxBet = 12;
  return state;
}

describe('docena y número', () => {
  it('sin suerte tienen las probabilidades de una ruleta real', () => {
    expect(betWinChance('color', 0, 0)).toBeCloseTo(18 / 37, 3);
    expect(betWinChance('dozen', 0, 0)).toBeCloseTo(12 / 37, 3);
    expect(betWinChance('number', 0, 0)).toBeCloseTo(1 / 37, 3);
  });

  it('la suerte y la penalización se aplican en proporción a las casillas', () => {
    for (const luck of [0, 8, 20]) {
      for (const f of [0, 0.5, 1]) {
        const color = effectiveWinChance(luck, f);
        expect(betWinChance('dozen', luck, f)).toBeCloseTo((color * 12) / 18, 10);
        expect(betWinChance('number', luck, f)).toBeCloseTo(color / 18, 10);
      }
    }
  });

  it('los tres tipos tienen el mismo valor esperado; solo cambia la varianza', () => {
    for (const luck of [0, 5, 12, 20]) {
      for (const f of [0.01, 0.3, 1]) {
        const color = rouletteEvPerChip('color', luck, f);
        expect(rouletteEvPerChip('dozen', luck, f)).toBeCloseTo(color, 10);
        expect(rouletteEvPerChip('number', luck, f)).toBeCloseTo(color, 10);
      }
    }
  });

  it('pagan 2:1 y 35:1 y la casilla mostrada es coherente', () => {
    const state = unlockedState(1000);
    const dozen = spin(state, { bettor: 'jugador', choice: DOZEN, bet: 10 }, WIN)!;
    expect(dozen.delta).toBe(20);
    expect(winningSlots(DOZEN)).toContain(dozen.slot);
    const number = spin(state, { bettor: 'jugador', choice: NUMBER, bet: 10 }, WIN)!;
    expect(number.delta).toBe(350);
    expect(number.slot).toBe(17);
    const lost = spin(state, { bettor: 'jugador', choice: NUMBER, bet: 10 }, LOSE)!;
    expect(lost.delta).toBe(-10);
    expect(lost.slot).not.toBe(17);
  });

  it('hay que desbloquearlas en la tienda', () => {
    const state = stateWith({ balance: 1000 });
    expect(spin(state, { bettor: 'jugador', choice: DOZEN, bet: 1 }, WIN)).toBeNull();
    expect(spin(state, { bettor: 'jugador', choice: NUMBER, bet: 1 }, WIN)).toBeNull();
    expect(state.balance).toBe(1000);
  });

  it('la frecuencia real de la docena coincide con la teórica (RNG con semilla)', () => {
    const rng = seededRng(11);
    const state = unlockedState(0);
    state.upgrades.luck = 10;
    let wins = 0;
    const n = 50_000;
    for (let i = 0; i < n; i++) {
      state.balance = 1e9;
      const r = spin(state, { bettor: 'jugador', choice: DOZEN, bet: 1 }, rng)!;
      if (r.outcome === 'gana') wins++;
    }
    // "gana" excluye el Cero Dorado, que se sortea antes.
    const expected = (1 - jackpotChance(10, 0)) * betWinChance('dozen', 10, 1 / maxBet(12));
    expect(wins / n).toBeCloseTo(expected, 2);
  });
});

describe('penalización y fracción óptima', () => {
  it('con poca suerte apostar el techo a color tiene valor esperado negativo', () => {
    for (const luck of [0, 3, 6, 9]) expect(rouletteEvPerChip('color', luck, 1)).toBeLessThan(0);
  });

  it('la fracción óptima de apuesta sube con la suerte', () => {
    const fractions = Array.from({ length: 101 }, (_, i) => i / 100);
    const gain = (luck: number, f: number) => f * rouletteEvPerChip('color', luck, f);
    const best = (luck: number) => fractions.reduce((a, f) => (gain(luck, f) > gain(luck, a) ? f : a), 0);
    const optimal = [8, 12, 16, 20].map(best);
    for (let i = 1; i < optimal.length; i++) expect(optimal[i]).toBeGreaterThan(optimal[i - 1]);
    expect(best(2)).toBe(0); // suerte 2 = 49,8%: por debajo del 50% no conviene apostar
    expect(best(3)).toBeGreaterThan(0); // suerte 3 = 50,9%
  });
});
