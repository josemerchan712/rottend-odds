import { isCardsUnlocked } from './cards/table';
import { isCoinUnlocked } from './coin/table';
import { isDiceUnlocked } from './dice/table';
import type { GameState, TableId } from './state';

/** ¿Está abierta esa mesa? Cada una requiere haber saldado la deuda de la anterior. */
export function isTableUnlocked(state: GameState, table: TableId): boolean {
  if (table === 1) return true;
  if (table === 2) return state.debtPaid;
  if (table === 3) return isDiceUnlocked(state);
  if (table === 4) return isCardsUnlocked(state);
  return isCoinUnlocked(state);
}

/** ¿Se puede pasar a esa mesa (pestañas)? */
export function canSwitchTo(state: GameState, to: TableId): boolean {
  return state.activeTable !== to && isTableUnlocked(state, to);
}
