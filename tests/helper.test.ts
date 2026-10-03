import { describe, expect, it } from 'vitest';
import { playerBet, selectBetFraction } from '../src/game/actions';
import { maxBet } from '../src/game/betting';
import { CONFIG } from '../src/game/config';
import { helperInterval, selectHelperProfile, updateHelper } from '../src/game/helper';
import { seededRng } from '../src/game/rng';
import { spin } from '../src/game/roulette';
import { LOSE, NEGRO, WIN, stateWith } from './helpers';

function withHelper(balance: number, fractionIndex = 3) {
  const state = stateWith({ balance, betFractionIndex: fractionIndex });
  state.upgrades.crupier = 1;
  return state;
}

describe('bloqueo del ayudante', () => {
  it('salta cuando el jugador pierde una apuesta de TODO', () => {
    const state = withHelper(5);
    playerBet(state, NEGRO, LOSE);
    expect(state.helper.lockout).toBe(5);
  });

  it('también salta si el TODO estaba recortado por la apuesta máxima', () => {
    const state = withHelper(1000);
    const result = playerBet(state, NEGRO, LOSE)!;
    expect(result.bet).toBe(10);
    expect(state.helper.lockout).toBe(5);
  });

  it('no salta si el jugador gana un TODO', () => {
    const state = withHelper(5);
    playerBet(state, NEGRO, WIN);
    expect(state.helper.lockout).toBe(0);
  });

  it('no salta si el jugador pierde con 1%, 10% o 50%', () => {
    for (const index of [0, 1, 2]) {
      const state = withHelper(100, index);
      playerBet(state, NEGRO, LOSE);
      expect(state.helper.lockout).toBe(0);
    }
  });

  it('no salta cuando pierde el ayudante, aunque apueste todo', () => {
    const state = withHelper(1);
    spin(state, { bettor: 'ayudante', choice: { type: 'color', color: 'negro' }, bet: 1 }, LOSE);
    updateHelper(state, 10, LOSE);
    expect(state.helper.lockout).toBe(0);
  });

  it('mientras dura el bloqueo el ayudante no apuesta', () => {
    const state = withHelper(1000);
    selectBetFraction(state, 3);
    playerBet(state, NEGRO, LOSE);
    const bets = state.stats.bets;
    expect(updateHelper(state, 4.9, seededRng(3))).toHaveLength(0);
    expect(state.stats.bets).toBe(bets);
    // 0,1 s de bloqueo + 4 s de intervalo → primera apuesta
    expect(updateHelper(state, 4.2, seededRng(3))).toHaveLength(1);
  });
});

describe('ayudante', () => {
  it('apuesta cada 4 s y la velocidad baja el intervalo un 12% por nivel', () => {
    expect(helperInterval(0)).toBe(4);
    expect(helperInterval(15)).toBeCloseTo(4 * 0.88 ** 15, 10);
    const state = withHelper(1e6);
    expect(updateHelper(state, 12.01, seededRng(5))).toHaveLength(3);
  });

  it('usa la fracción de su perfil sobre el techo de apuesta', () => {
    const state = withHelper(1e9);
    state.upgrades.maxBet = 11;
    const [r] = updateHelper(state, 4, LOSE);
    expect(r.bet).toBe(Math.floor(maxBet(11) * CONFIG.helper.profiles[0].fraction));
  });

  it('nunca apuesta más de su fracción máxima del saldo', () => {
    CONFIG.helper.profiles.forEach((profile, index) => {
      const state = withHelper(100_000);
      state.upgrades.maxBet = 11;
      state.upgrades.helperProfile = 2;
      state.helper.profile = index;
      const [r] = updateHelper(state, 4, LOSE);
      expect(r.bet).toBe(
        Math.min(Math.floor(maxBet(11) * profile.fraction), Math.floor(100_000 * profile.maxBalanceFraction)),
      );
      expect(r.bet).toBeLessThanOrEqual(100_000 * profile.maxBalanceFraction);
    });
  });

  it('ningún perfil puede dejar el saldo a 0, aunque pierda siempre', () => {
    CONFIG.helper.profiles.forEach((_, index) => {
      const state = withHelper(1000);
      state.upgrades.helperProfile = 2;
      state.helper.profile = index;
      updateHelper(state, 4000, LOSE); // 1.000 apuestas perdidas seguidas
      expect(state.balance).toBeGreaterThan(0);
    });
  });

  it('si su límite no llega a la apuesta mínima, espera sin apostar', () => {
    const state = withHelper(20); // 3% de 20 = 0,6 fichas < 1
    expect(updateHelper(state, 40, LOSE)).toHaveLength(0);
    expect(state.balance).toBe(20);
  });

  it('solo deja elegir perfiles desbloqueados', () => {
    const state = withHelper(0);
    expect(selectHelperProfile(state, 1)).toBe(false);
    state.upgrades.helperProfile = 1;
    expect(selectHelperProfile(state, 1)).toBe(true);
    expect(selectHelperProfile(state, 2)).toBe(false);
  });

  it('su suerte propia sube su probabilidad sin pasar del tope', () => {
    const state = withHelper(1e9);
    state.upgrades.helperLuck = 10;
    const [r] = updateHelper(state, 4, LOSE);
    expect(r.winChance).toBeGreaterThan(0.486);
    state.upgrades.luck = 20;
    const [r2] = updateHelper(state, 4, LOSE);
    expect(r2.winChance).toBeLessThanOrEqual(0.97);
  });

  it('sin Crupier no hace nada', () => {
    const state = stateWith({ balance: 1000 });
    expect(updateHelper(state, 100, seededRng(1))).toHaveLength(0);
  });
});
