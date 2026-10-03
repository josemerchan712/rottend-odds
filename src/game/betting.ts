import { CONFIG, type BetType } from './config';
import type { GameState } from './state';

/** Techo de apuesta según el nivel de la mejora. */
export function maxBet(level: number): number {
  return Math.floor(CONFIG.bet.baseMaxBet * CONFIG.bet.maxBetMultiplierPerLevel ** level);
}

export function currentMaxBet(state: GameState): number {
  return maxBet(state.upgrades.maxBet);
}

/**
 * Apuesta para una fracción del techo: al menos la mínima, como mucho el saldo.
 * Devuelve 0 si no hay saldo para la mínima.
 */
export function betAmount(balance: number, fraction: number, ceiling: number): number {
  if (balance < CONFIG.bet.minBet) return 0;
  const wanted = Math.max(Math.floor(ceiling * Math.min(fraction, 1)), CONFIG.bet.minBet);
  return Math.min(wanted, Math.floor(balance));
}

export function selectedFraction(state: GameState): number {
  const fractions = CONFIG.bet.quickFractions;
  return fractions[Math.min(Math.max(state.betFractionIndex, 0), fractions.length - 1)];
}

/** Lo que apostaría ahora el jugador con el botón elegido. */
export function playerBetAmount(state: GameState): number {
  return betAmount(state.balance, selectedFraction(state), currentMaxBet(state));
}

export function isAllInSelected(state: GameState): boolean {
  return selectedFraction(state) >= 1;
}

/** El color siempre está disponible; docena y número se desbloquean en la tienda. */
export function isBetTypeUnlocked(state: GameState, type: BetType): boolean {
  if (type === 'dozen') return state.upgrades.dozenBet > 0;
  if (type === 'number') return state.upgrades.numberBet > 0;
  return true;
}
