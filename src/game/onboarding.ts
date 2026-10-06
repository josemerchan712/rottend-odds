import { CONFIG } from './config';
import type { GameState } from './state';

/**
 * Primeros pasos de la mesa 1 (sesión 9): al empezar con 0 fichas, que se vea que el primer dinero sale
 * de la trastienda. Todo se deriva del estado ya guardado, sin campos nuevos:
 * - "ha recogido algo": `stats.workEarned > 0` (sube con cada objeto, el del jugador y el del limpiador);
 * - "ha apostado": `stats.bets > 0`.
 * Las dos cosas solo crecen, así que el rótulo, una vez apagado, no vuelve. No depende de los ajustes:
 * se ve aunque los diálogos estén desactivados.
 */

/** El rótulo, en tres líneas cortas para no tocar la ruleta ni la pestaña del cajón Mesa. */
export const BACKROOM_SIGN = { title: 'TRASTIENDA', lines: ['aquí se gana', 'el primer dinero'] } as const;
export const BROKE_FIRST = 'Sin fichas. Ve a la trastienda a recoger basura.';
export const BROKE_AGAIN = 'Sin fichas. A la trastienda.';

/** ¿Ha recogido ya algún objeto de la trastienda? */
export function hasCollected(state: GameState): boolean {
  return state.stats.workEarned > 0;
}

/**
 * El rótulo sobre la puerta de la trastienda: solo en la mesa 1, en una partida que aún no ha recogido
 * nada, no ha apostado nunca y no tiene fichas para apostar.
 */
export function showBackroomSign(state: GameState): boolean {
  return state.activeTable === 1 && !hasCollected(state) && state.stats.bets === 0 && state.balance < CONFIG.bet.minBet;
}

/**
 * Aviso en el tapete al intentar apostar sin fichas (saldo por debajo de la apuesta mínima), solo en la
 * mesa 1: largo si nunca ha recogido nada; si ya recogió alguna vez (se ha quedado sin fichas después),
 * el recordatorio corto. null si tiene fichas o no está en la mesa 1.
 */
export function brokeNotice(state: GameState): string | null {
  if (state.activeTable !== 1 || state.balance >= CONFIG.bet.minBet) return null;
  return hasCollected(state) ? BROKE_AGAIN : BROKE_FIRST;
}
