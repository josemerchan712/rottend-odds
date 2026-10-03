import { isAllInSelected, playerBetAmount } from './betting';
import { CONFIG } from './config';
import { lockHelper } from './helper';
import type { Rng } from './rng';
import { spin } from './roulette';
import type { BetChoice, GameState, SpinResult } from './state';

/** El jugador apuesta con el botón rápido elegido. Perder un TODO bloquea al ayudante. */
export function playerBet(state: GameState, choice: BetChoice, rng: Rng): SpinResult | null {
  const bet = playerBetAmount(state);
  if (bet <= 0) return null;
  const allIn = isAllInSelected(state);
  const result = spin(state, { bettor: 'jugador', choice, bet }, rng);
  if (result && allIn && result.outcome === 'pierde') lockHelper(state);
  return result;
}

export function selectBetFraction(state: GameState, index: number): boolean {
  if (index < 0 || index >= CONFIG.bet.quickFractions.length) return false;
  state.betFractionIndex = index;
  return true;
}
