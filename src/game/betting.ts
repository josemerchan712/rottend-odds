import { CONFIG } from './config';
import type { GameState } from './state';

/** Techo de apuesta según el nivel de la mejora. */
export function maxBet(level: number): number {
  return Math.floor(CONFIG.bet.baseMaxBet * CONFIG.bet.maxBetMultiplierPerLevel ** level);
}

/**
 * Apuesta para una fracción del saldo: al menos la mínima, como mucho el techo y el saldo.
 * Devuelve 0 si no hay saldo para la mínima.
 */
export function betAmount(balance: number, fraction: number, ceiling: number): number {
  if (balance < CONFIG.bet.minBet) return 0;
  const wanted = Math.max(Math.floor(balance * fraction), CONFIG.bet.minBet);
  return Math.min(wanted, Math.floor(ceiling), Math.floor(balance));
}

export function selectedFraction(state: GameState): number {
  const fractions = CONFIG.bet.quickFractions;
  return fractions[Math.min(Math.max(state.betFractionIndex, 0), fractions.length - 1)];
}

/** Lo que apostaría ahora el jugador con el botón elegido. */
export function playerBetAmount(state: GameState): number {
  return betAmount(state.balance, selectedFraction(state), maxBet(state.upgrades.maxBet));
}

export function isAllInSelected(state: GameState): boolean {
  return selectedFraction(state) >= 1;
}
