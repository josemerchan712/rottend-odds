import { CONFIG } from './config';
import { clearSave, loadGame, saveGame, type KeyValueStorage } from './save';
import { createInitialState, type GameState } from './state';

/** Lo que necesita la pantalla de inicio para pintar "Continuar". */
export interface ContinueInfo {
  playTime: number;
  /** Fracción de la deuda reunida (0-1). */
  debtProgress: number;
  debtPaid: boolean;
}

/** Datos para "Continuar", o null si no hay partida guardada (y entonces no se muestra). */
export function continueInfo(storage: KeyValueStorage, key: string): ContinueInfo | null {
  const file = loadGame(storage, key);
  if (!file) return null;
  const { state } = file;
  return {
    playTime: state.playTime,
    debtProgress: state.debtPaid ? 1 : Math.min(state.balance / CONFIG.debt.amount, 1),
    debtPaid: state.debtPaid,
  };
}

/**
 * Empieza una partida nueva en el único hueco de guardado.
 * Si ya hay una, pregunta con `confirm`; si el jugador cancela, no toca nada y devuelve null.
 */
export function startNewGame(
  storage: KeyValueStorage,
  key: string,
  confirm: () => boolean,
  now: number,
): GameState | null {
  if (loadGame(storage, key) !== null && !confirm()) return null;
  clearSave(storage, key);
  const state = createInitialState();
  saveGame(storage, key, state, now);
  return state;
}

/** Carga la partida para continuarla. */
export function continueGame(storage: KeyValueStorage, key: string): GameState | null {
  return loadGame(storage, key)?.state ?? null;
}
