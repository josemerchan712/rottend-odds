import { CONFIG } from './config';
import type { GameState } from './state';

export function canPayDebt(state: GameState): boolean {
  return !state.debtPaid && state.balance >= CONFIG.debt.amount;
}

/** Descuenta la deuda del saldo; lo que sobra se conserva. */
export function payDebt(state: GameState): boolean {
  if (!canPayDebt(state)) return false;
  state.balance -= CONFIG.debt.amount;
  state.debtPaid = true;
  return true;
}

/** Fracción de la deuda reunida (0-1), para la barra. */
export function debtProgress(state: GameState): number {
  if (state.debtPaid) return 1;
  return Math.min(state.balance / CONFIG.debt.amount, 1);
}
