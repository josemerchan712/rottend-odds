import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import {
  effectiveWinChance,
  jackpotChance,
  jackpotPayout,
  luckChance,
  riskPenalty,
} from '../src/game/luck';
import { seededRng } from '../src/game/rng';
import { spin } from '../src/game/roulette';
import { JACKPOT, stateWith } from './helpers';

const MAX_LUCK = CONFIG.upgrades.luck.maxLevel;
const MAX_JACKPOT = CONFIG.upgrades.jackpot.maxLevel;

describe('curva de suerte', () => {
  it('empieza en 48,6% y llega a 97% en el nivel 20', () => {
    expect(luckChance(0)).toBeCloseTo(0.486, 10);
    expect(luckChance(MAX_LUCK)).toBeCloseTo(0.97, 10);
  });

  it('nunca supera el 97%, ni por encima del nivel máximo ni con bonus', () => {
    for (let level = 0; level <= MAX_LUCK + 10; level++) {
      expect(luckChance(level)).toBeLessThanOrEqual(0.97);
      expect(effectiveWinChance(level, 0, 0.5)).toBeLessThanOrEqual(0.97);
    }
  });

  it('crece siempre pero con rendimientos decrecientes', () => {
    let prevGain = Infinity;
    for (let level = 1; level <= MAX_LUCK; level++) {
      const gain = luckChance(level) - luckChance(level - 1);
      expect(gain).toBeGreaterThan(0);
      expect(gain).toBeLessThan(prevGain);
      prevGain = gain;
    }
  });
});

describe('penalización por apostar fuerte', () => {
  it('sigue p - 0,08 * fraccion^1,5', () => {
    expect(riskPenalty(0)).toBe(0);
    expect(riskPenalty(1)).toBeCloseTo(0.08, 10);
    expect(effectiveWinChance(0, 0.5)).toBeCloseTo(0.486 - 0.08 * 0.5 ** 1.5, 10);
  });

  it('baja la probabilidad al subir la fracción apostada', () => {
    const fractions = [0, 0.01, 0.1, 0.5, 1];
    for (const level of [0, 5, MAX_LUCK]) {
      const chances = fractions.map((f) => effectiveWinChance(level, f));
      for (let i = 1; i < chances.length; i++) expect(chances[i]).toBeLessThan(chances[i - 1]);
    }
  });

  it('nunca deja la probabilidad por debajo de 0', () => {
    expect(effectiveWinChance(0, 1, -1)).toBe(0);
    expect(effectiveWinChance(0, 5)).toBeGreaterThanOrEqual(0);
  });

  it('la frecuencia real de victorias coincide con la efectiva (RNG con semilla)', () => {
    const rng = seededRng(42);
    const state = stateWith({ balance: 1e12 });
    state.upgrades.luck = 5;
    const expected = effectiveWinChance(5, 0);
    let wins = 0;
    const n = 50_000;
    for (let i = 0; i < n; i++) {
      state.balance = 1e12;
      const r = spin(state, { bettor: 'jugador', color: 'negro', bet: 1 }, rng)!;
      if (r.outcome !== 'pierde') wins++;
    }
    // La victoria incluye el jackpot, que sale antes del sorteo normal.
    const jp = jackpotChance(5, 0);
    expect(wins / n).toBeCloseTo(jp + (1 - jp) * expected, 2);
  });
});

describe('Cero Dorado', () => {
  const cap = CONFIG.debt.amount * 0.25;

  it('paga x500 hasta el tope del 25% de la deuda', () => {
    expect(jackpotPayout(100)).toEqual({ gain: 50_000, capped: false });
    expect(jackpotPayout(5000)).toEqual({ gain: cap, capped: false });
    expect(jackpotPayout(5001)).toEqual({ gain: cap, capped: true });
    expect(jackpotPayout(1e9)).toEqual({ gain: cap, capped: true });
  });

  it('spin aplica el tope al saldo y lo anota', () => {
    const state = stateWith({ balance: 100_000 });
    const result = spin(state, { bettor: 'jugador', color: 'blanco', bet: 50_000 }, JACKPOT)!;
    expect(result.outcome).toBe('jackpot');
    expect(result.delta).toBe(cap);
    expect(state.balance).toBe(100_000 + cap);
    expect(state.stats.jackpotsCapped).toBe(1);
  });

  it('la probabilidad total va de 0,1% a 1,5% y nunca lo supera', () => {
    expect(jackpotChance(0, 0)).toBeCloseTo(0.001, 10);
    expect(jackpotChance(MAX_LUCK, 0)).toBeCloseTo(0.008, 10);
    expect(jackpotChance(0, MAX_JACKPOT)).toBeCloseTo(0.008, 10);
    expect(jackpotChance(MAX_LUCK, MAX_JACKPOT)).toBeCloseTo(0.015, 10);
    for (let l = 0; l <= MAX_LUCK + 5; l++) {
      for (let j = 0; j <= MAX_JACKPOT + 5; j++) expect(jackpotChance(l, j)).toBeLessThanOrEqual(0.015);
    }
  });

  it('la frecuencia real al máximo ronda el 1,5% (RNG con semilla)', () => {
    const rng = seededRng(7);
    const state = stateWith();
    state.upgrades.luck = MAX_LUCK;
    state.upgrades.jackpot = MAX_JACKPOT;
    const n = 100_000;
    for (let i = 0; i < n; i++) {
      state.balance = 1e9;
      spin(state, { bettor: 'jugador', color: 'negro', bet: 1 }, rng);
    }
    expect(state.stats.jackpots / n).toBeGreaterThan(0.013);
    expect(state.stats.jackpots / n).toBeLessThan(0.017);
  });
});
