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
 * Devuelve 0 si no hay saldo para la mínima. La usa el ayudante (sus perfiles son fracciones).
 */
export function betAmount(balance: number, fraction: number, ceiling: number): number {
  if (balance < CONFIG.bet.minBet) return 0;
  const wanted = Math.max(Math.floor(ceiling * Math.min(fraction, 1)), CONFIG.bet.minBet);
  return Math.min(wanted, Math.floor(balance));
}

/**
 * El número "redondo" más alto que no pasa de x, en la secuencia 1, 2, 5, 10, 20, 50, 100...
 * (mínimo 1).
 */
export function niceFloor(x: number): number {
  if (!(x >= 1)) return 1;
  let magnitude = 10 ** Math.floor(Math.log10(x));
  // log10 puede quedarse corto por coma flotante.
  if (magnitude * 10 <= x) magnitude *= 10;
  for (const step of [5, 2, 1]) if (step * magnitude <= x) return step * magnitude;
  return magnitude;
}

/** Una ficha del selector de apuesta. */
export interface SelectorChip {
  /** Índice en CONFIG.bet.quickFractions (3 = TODO). Identifica la ficha aunque cambie su cantidad. */
  index: number;
  /** Fichas que se apuestan con ella: exactamente esta cantidad. */
  amount: number;
  all: boolean;
  /** Se puede usar con el saldo actual. */
  affordable: boolean;
}

/**
 * Las fichas del selector con cantidades reales. Por debajo siguen siendo las fracciones del techo
 * (1%, 10%, 50%), redondeadas hacia abajo a un número redondo; si dos coinciden tras redondear, la
 * repetida se elimina. TODO apuesta el mínimo entre el saldo y el techo.
 */
export function selectorChips(balance: number, ceiling: number): SelectorChip[] {
  const fractions = CONFIG.bet.quickFractions;
  const chips: SelectorChip[] = [];
  for (let index = 0; index < fractions.length - 1; index++) {
    const amount = niceFloor(ceiling * fractions[index]);
    if (chips.some((c) => c.amount === amount)) continue;
    chips.push({ index, amount, all: false, affordable: amount <= balance });
  }
  const all = Math.floor(Math.min(balance, ceiling));
  chips.push({ index: fractions.length - 1, amount: all, all: true, affordable: all >= CONFIG.bet.minBet });
  return chips;
}

export function stateChips(state: GameState): SelectorChip[] {
  return selectorChips(state.balance, currentMaxBet(state));
}

/**
 * La ficha elegida. Si la elegida ha desaparecido al redondear (techo pequeño), se usa la visible
 * más cercana por debajo.
 */
export function selectedChip(state: GameState): SelectorChip {
  const chips = stateChips(state);
  const below = chips.filter((c) => c.index <= state.betFractionIndex);
  return below[below.length - 1] ?? chips[0];
}

/** Lo que apostaría ahora el jugador: exactamente la cantidad de la ficha elegida (0 si no le llega). */
export function playerBetAmount(state: GameState): number {
  const chip = selectedChip(state);
  return chip.affordable ? chip.amount : 0;
}

export function isAllInSelected(state: GameState): boolean {
  return selectedChip(state).all;
}

/** Nivel de riesgo que se muestra en la interfaz, a partir de apuesta/techo (sin enseñar porcentajes). */
export type RiskLevel = 'bajo' | 'medio' | 'alto' | 'máximo';

export function riskLevel(bet: number, ceiling: number): RiskLevel {
  const f = ceiling > 0 ? bet / ceiling : 1;
  if (f >= 0.99) return 'máximo';
  if (f >= 0.4) return 'alto';
  if (f >= 0.08) return 'medio';
  return 'bajo';
}

/** El color siempre está disponible; docena y número se desbloquean en la tienda. */
export function isBetTypeUnlocked(state: GameState, type: BetType): boolean {
  if (type === 'dozen') return state.upgrades.dozenBet > 0;
  if (type === 'number') return state.upgrades.numberBet > 0;
  return true;
}
