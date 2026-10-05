import { CONFIG } from './config';
import type { GameState } from './state';

/** Resumen de la partida para la pantalla final. */
export interface GameSummary {
  /** Segundos de juego en total (todas las mesas). */
  totalTime: number;
  /** Apuestas de todas las mesas (tiradas, manos, cadenas; del jugador y de los ayudantes). */
  bets: number;
  /** Parte de las apuestas que ganaron (0-1). */
  winRate: number;
  jackpots: number;
  /** Veces que el saldo de alguna mesa se quedó sin llegar a la apuesta mínima. */
  zeros: number;
}

export function gameSummary(state: GameState): GameSummary {
  const bets = state.stats.bets + state.slots.stats.spins + state.dice.stats.rolls + state.cards.stats.hands + state.coin.stats.chains;
  const wins = state.stats.wins + state.slots.stats.wins + state.dice.stats.wins + state.cards.stats.wins + state.coin.stats.cashouts;
  const jackpots = state.stats.jackpots + state.slots.stats.jackpots + state.dice.stats.jackpots + state.cards.stats.jackpots + state.coin.stats.jackpots;
  return { totalTime: state.playTime, bets, winRate: bets ? wins / bets : 0, jackpots, zeros: state.stats.zeros };
}

/** ¿Se ha pagado la última deuda (la del Dueño)? */
export function isGameFinished(state: GameState): boolean {
  return state.coin.debtPaid;
}

const lastBalances = new WeakMap<GameState, number[]>();

/**
 * Cuenta las veces que el saldo de una mesa abierta baja de la apuesta mínima (de tener para
 * apostar a no tener). Se llama en cada paso; la primera vez solo toma nota.
 */
export function trackZeros(state: GameState): void {
  const now = [state.balance, state.slots.balance, state.dice.balance, state.cards.balance, state.coin.balance];
  const mins = [CONFIG.bet.minBet, CONFIG.slots.bet.minBet, CONFIG.dice.bet.minBet, CONFIG.cards.bet.minBet, CONFIG.coin.bet.minBet];
  const before = lastBalances.get(state);
  if (before) {
    for (let i = 0; i < now.length; i++) if (before[i] >= mins[i] && now[i] < mins[i]) state.stats.zeros++;
  }
  lastBalances.set(state, now);
}
