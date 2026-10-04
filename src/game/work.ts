import { CONFIG } from './config';
import type { Rng } from './rng';
import type { GameState, TrashItem } from './state';
import {
  cleanerIntervalFor,
  collectFrom,
  collectNearestFrom,
  hostItemValue,
  itemAtPoint,
  updateWorkHost,
  type Collected,
  type WorkDef,
  type WorkHost,
} from './workCore';

export { nearestItem, type Collected } from './workCore';

const { work } = CONFIG;

/** Números del trabajo de la mesa 1 en la forma del núcleo común. */
export const WORK_DEF: WorkDef = work;

/** Multiplicador de valor de la bolsa grande. */
export function bagMultiplier(state: GameState): number {
  return 1 + work.bagValuePerLevel * state.upgrades.bigBag;
}

/** La trastienda de la mesa 1 vista por el núcleo común: pinzas, bolsa y limpiador. */
export function workHost(state: GameState): WorkHost {
  return {
    def: WORK_DEF,
    work: state.work,
    valueMultiplier: bagMultiplier(state),
    extraPerClick: state.upgrades.tweezers * work.tweezersExtraPerLevel,
    cleanerLevel: state.upgrades.cleaner,
    credit: (value) => {
      state.balance += value;
      state.stats.workEarned += value;
    },
  };
}

/** Fichas que da un objeto con las mejoras actuales. */
export function itemValue(state: GameState, kind: string): number {
  return hostItemValue(workHost(state), kind);
}

/** Segundos entre recogidas del ayudante de limpieza (Infinity si no está contratado). */
export function cleanerInterval(level: number): number {
  return cleanerIntervalFor(WORK_DEF, level);
}

/** El objeto bajo un clic, con zona generosa. */
export function itemAt(items: readonly TrashItem[], x: number, y: number, radius: number = work.clickRadius): TrashItem | null {
  return itemAtPoint(items, x, y, radius);
}

/**
 * El jugador recoge un objeto. Con pinzas, recoge además los más cercanos a ese objeto.
 * Devuelve lo recogido (vacío si el objeto ya no existe).
 */
export function collectItem(state: GameState, itemId: number): Collected[] {
  return collectFrom(workHost(state), itemId);
}

/** Atajo de teclado: recoge el objeto más cercano al jugador. */
export function collectNearest(state: GameState): Collected[] {
  return collectNearestFrom(workHost(state));
}

/**
 * Hace aparecer basura (una cada respawnInterval si hay hueco; el suelo empieza lleno) y hace
 * trabajar al ayudante de limpieza. Devuelve lo que ha recogido el ayudante.
 */
export function updateWork(state: GameState, dt: number, rng: Rng): Collected[] {
  return updateWorkHost(workHost(state), dt, rng);
}
