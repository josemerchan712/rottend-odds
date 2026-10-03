import { CONFIG } from './config';
import { effectiveWinChance, jackpotChance, jackpotPayout } from './luck';
import type { Rng } from './rng';
import type { BetColor, Bettor, GameState, SpinResult } from './state';

export interface SpinRequest {
  bettor: Bettor;
  color: BetColor;
  bet: number;
  /** Bonus de probabilidad propio de quien apuesta (suerte del ayudante). */
  luckBonus?: number;
}

/**
 * Resuelve una tirada y la aplica al estado.
 * Primero se sortea el Cero Dorado (paga sea cual sea el color); si no sale,
 * se gana con la probabilidad efectiva. La fracción para la penalización es apuesta / saldo.
 * Devuelve null si la apuesta no es válida.
 */
export function spin(state: GameState, req: SpinRequest, rng: Rng): SpinResult | null {
  const bet = Math.floor(req.bet);
  if (bet < CONFIG.bet.minBet || bet > state.balance) return null;

  const fraction = bet / state.balance;
  const winChance = effectiveWinChance(state.upgrades.luck, fraction, req.luckBonus ?? 0);
  const jpChance = jackpotChance(state.upgrades.luck, state.upgrades.jackpot);
  const base = { bettor: req.bettor, color: req.color, bet, winChance };

  let result: SpinResult;
  if (rng() < jpChance) {
    const { gain, capped } = jackpotPayout(bet);
    result = { ...base, outcome: 'jackpot', slot: -1, delta: gain, jackpotCapped: capped };
  } else if (rng() < winChance) {
    const slot = randomSlotOfColor(req.color, rng);
    result = { ...base, outcome: 'gana', slot, delta: bet * CONFIG.roulette.payout, jackpotCapped: false };
  } else {
    result = { ...base, outcome: 'pierde', slot: losingSlot(req.color, rng), delta: -bet, jackpotCapped: false };
  }

  state.balance = Math.max(state.balance + result.delta, 0);
  state.stats.bets++;
  if (result.outcome !== 'pierde') state.stats.wins++;
  if (result.outcome === 'jackpot') {
    state.stats.jackpots++;
    if (result.jackpotCapped) state.stats.jackpotsCapped++;
  }
  state.recentSpins.unshift(result);
  state.recentSpins.length = Math.min(state.recentSpins.length, CONFIG.tech.recentSpins);
  return result;
}

export function slotColor(slot: number): BetColor | 'verde' | 'dorado' {
  if (slot === -1) return 'dorado';
  if (slot === 0) return 'verde';
  return slot % 2 === 1 ? 'negro' : 'blanco';
}

/** Casilla al azar del color pedido (impares negro, pares blanco). */
function randomSlotOfColor(color: BetColor, rng: Rng): number {
  const perColor = (CONFIG.roulette.slots - 1) / 2;
  const k = Math.floor(rng() * perColor);
  return color === 'negro' ? 2 * k + 1 : 2 * k + 2;
}

/** Al perder sale el cero verde o una casilla del otro color, en proporción a cuántas hay. */
function losingSlot(color: BetColor, rng: Rng): number {
  const perColor = (CONFIG.roulette.slots - 1) / 2;
  if (rng() < 1 / (perColor + 1)) return 0;
  return randomSlotOfColor(color === 'negro' ? 'blanco' : 'negro', rng);
}
