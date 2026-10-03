import { betAmount, maxBet } from './betting';
import { CONFIG } from './config';
import type { Rng } from './rng';
import { spin } from './roulette';
import type { GameState, SpinResult } from './state';

export function hasHelper(state: GameState): boolean {
  return state.upgrades.crupier > 0;
}

/** Segundos entre apuestas del ayudante. */
export function helperInterval(speedLevel: number): number {
  return CONFIG.helper.baseInterval * (1 - CONFIG.helper.speedReductionPerLevel) ** speedLevel;
}

export function helperLuckBonus(level: number): number {
  return CONFIG.helper.luckPerLevel * level;
}

/** Perfil activo, limitado a los desbloqueados. */
export function helperProfile(state: GameState) {
  const unlocked = Math.min(state.upgrades.helperProfile, CONFIG.helper.profiles.length - 1);
  return CONFIG.helper.profiles[Math.min(Math.max(state.helper.profile, 0), unlocked)];
}

export function helperBetAmount(state: GameState): number {
  return betAmount(state.balance, helperProfile(state).fraction, maxBet(state.upgrades.maxBet));
}

export function selectHelperProfile(state: GameState, index: number): boolean {
  if (index < 0 || index > state.upgrades.helperProfile || index >= CONFIG.helper.profiles.length) return false;
  state.helper.profile = index;
  return true;
}

/** Bloquea al ayudante (castigo por perder un TODO). */
export function lockHelper(state: GameState): void {
  state.helper.lockout = CONFIG.helper.allInLossLockout;
}

/**
 * Avanza el temporizador del ayudante y apuesta cuantas veces toque.
 * Si está bloqueado o sin fichas, el temporizador espera lleno para apostar en cuanto pueda.
 */
export function updateHelper(state: GameState, dt: number, rng: Rng): SpinResult[] {
  if (!hasHelper(state)) return [];
  const results: SpinResult[] = [];

  let time = dt;
  if (state.helper.lockout > 0) {
    const used = Math.min(state.helper.lockout, time);
    state.helper.lockout -= used;
    time -= used;
  }

  const interval = helperInterval(state.upgrades.helperSpeed);
  state.helper.timer += time;
  while (state.helper.timer >= interval) {
    const bet = helperBetAmount(state);
    if (bet <= 0) {
      state.helper.timer = interval;
      break;
    }
    state.helper.timer -= interval;
    const color = rng() < 0.5 ? 'negro' : 'blanco';
    const luckBonus = helperLuckBonus(state.upgrades.helperLuck);
    const result = spin(state, { bettor: 'ayudante', color, bet, luckBonus }, rng);
    if (result) results.push(result);
  }
  return results;
}
