import { cardsDebtProgress } from './cards/table';
import { coinDebtProgress } from './coin/table';
import { debtProgress } from './debt';
import { diceDebtProgress } from './dice/table';
import { clearSave, loadGame, saveGame, type KeyValueStorage } from './save';
import { slotsDebtProgress } from './slots/table';
import { createInitialState, type GameState, type TableId } from './state';

/** Lo que necesita la pantalla de título para pintar "Continuar" y decidir qué opciones salen. */
export interface ContinueInfo {
  playTime: number;
  /** Mesa en la que se dejó la partida. */
  activeTable: TableId;
  /** Fracción de la deuda de esa mesa reunida (0-1). */
  debtProgress: number;
  /** ¿Está pagada la deuda de esa mesa? */
  debtPaid: boolean;
  /** ¿Se pagó la última deuda (la del Dueño)? Entonces el menú ofrece "Ver final". */
  finished: boolean;
}

/** Deuda de la mesa activa: fracción reunida y si está pagada. */
function tableDebt(state: GameState): { progress: number; paid: boolean } {
  switch (state.activeTable) {
    case 2:
      return { progress: slotsDebtProgress(state.slots), paid: state.slots.debtPaid };
    case 3:
      return { progress: diceDebtProgress(state.dice), paid: state.dice.debtPaid };
    case 4:
      return { progress: cardsDebtProgress(state.cards), paid: state.cards.debtPaid };
    case 5:
      return { progress: coinDebtProgress(state.coin), paid: state.coin.debtPaid };
    default:
      return { progress: debtProgress(state), paid: state.debtPaid };
  }
}

/** Datos para "Continuar", o null si no hay partida guardada (y entonces no se muestra). */
export function continueInfo(storage: KeyValueStorage, key: string): ContinueInfo | null {
  const file = loadGame(storage, key);
  if (!file) return null;
  const { state } = file;
  const debt = tableDebt(state);
  return {
    playTime: state.playTime,
    activeTable: state.activeTable,
    debtProgress: debt.paid ? 1 : Math.min(Math.max(debt.progress, 0), 1),
    debtPaid: debt.paid,
    finished: state.coin.debtPaid,
  };
}

/** Opciones del menú principal, de arriba abajo. */
export type MenuItem = 'continue' | 'newGame' | 'settings' | 'ranking' | 'login' | 'sync' | 'ending' | 'credits';

export interface MenuContext {
  hasSave: boolean;
  /** ¿Hay servidor (VITE_API_URL)? Sin él no salen Ranking, Iniciar sesión ni Sincronizar. */
  online: boolean;
  /** ¿Hay sesión iniciada? Sincronizar solo sale con sesión. */
  loggedIn: boolean;
  /** ¿Completó el juego la partida guardada? */
  finished: boolean;
}

/** Qué opciones se ven: Continuar con guardado, lo en línea con servidor y Ver final con el juego completado. */
export function menuItems(ctx: MenuContext): MenuItem[] {
  const items: MenuItem[] = [];
  if (ctx.hasSave) items.push('continue');
  items.push('newGame', 'settings');
  if (ctx.online) {
    items.push('ranking', 'login');
    if (ctx.loggedIn) items.push('sync');
  }
  if (ctx.hasSave && ctx.finished) items.push('ending');
  items.push('credits');
  return items;
}

/** Siguiente opción al pulsar arriba (-1) o abajo (+1), dando la vuelta. Sin opciones, -1. */
export function nextIndex(current: number, delta: number, count: number): number {
  if (count <= 0) return -1;
  if (current < 0 || current >= count) return delta < 0 ? count - 1 : 0;
  return (((current + delta) % count) + count) % count;
}

/**
 * Empieza una partida nueva en el único hueco de guardado.
 * Si ya hay una, pregunta (`confirm`); si el jugador cancela, no toca nada y devuelve null.
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
