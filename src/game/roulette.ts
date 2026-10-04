import { currentMaxBet, isBetTypeUnlocked } from './betting';
import { CONFIG } from './config';
import { betWinChance, jackpotChance, jackpotPayout } from './luck';
import type { Rng } from './rng';
import type { BetChoice, BetColor, Bettor, GameState, SpinResult } from './state';

export interface SpinRequest {
  bettor: Bettor;
  choice: BetChoice;
  bet: number;
  /** Bonus de probabilidad propio de quien apuesta (suerte del ayudante). */
  luckBonus?: number;
}

/**
 * Resuelve una tirada y la aplica al estado.
 * Primero se sortea el Cero Dorado (paga sea cual sea la apuesta); si no sale,
 * se gana con la probabilidad efectiva del tipo de apuesta. La fracción para la
 * penalización es apuesta / techo. Devuelve null si la apuesta no es válida.
 */
export function spin(state: GameState, req: SpinRequest, rng: Rng): SpinResult | null {
  const bet = Math.floor(req.bet);
  const ceiling = currentMaxBet(state);
  if (bet < CONFIG.bet.minBet || bet > state.balance || bet > ceiling) return null;
  if (!isBetTypeUnlocked(state, req.choice.type)) return null;

  const winChance = betWinChance(req.choice.type, state.upgrades.luck, bet / ceiling, req.luckBonus ?? 0);
  const jpChance = jackpotChance(state.upgrades.luck, state.upgrades.jackpot);
  const base = { bettor: req.bettor, choice: req.choice, bet, winChance };
  const { win: winners, lose: losers } = slotsFor(req.choice);

  let result: SpinResult;
  if (rng() < jpChance) {
    const { gain, capped } = jackpotPayout(bet);
    result = { ...base, outcome: 'jackpot', slot: -1, delta: gain, jackpotCapped: capped };
  } else if (rng() < winChance) {
    const delta = bet * CONFIG.betTypes[req.choice.type].payout;
    result = { ...base, outcome: 'gana', slot: pick(winners, rng), delta, jackpotCapped: false };
  } else {
    const slot = pick(losers, rng);
    result = { ...base, outcome: 'pierde', slot, delta: -bet, jackpotCapped: false };
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

/** Casillas ganadoras y perdedoras de cada apuesta, calculadas una vez (se tira muchas veces por segundo). */
const slotCache = new Map<string, { win: readonly number[]; lose: readonly number[] }>();

function choiceKey(choice: BetChoice): string {
  return choice.type === 'color' ? `c${choice.color}` : choice.type === 'dozen' ? `d${choice.dozen}` : `n${choice.number}`;
}

function slotsFor(choice: BetChoice): { win: readonly number[]; lose: readonly number[] } {
  const key = choiceKey(choice);
  let entry = slotCache.get(key);
  if (!entry) {
    const all = Array.from({ length: CONFIG.roulette.slots - 1 }, (_, i) => i + 1);
    const win =
      choice.type === 'color'
        ? all.filter((s) => slotColor(s) === choice.color)
        : choice.type === 'dozen'
          ? all.filter((s) => Math.ceil(s / 12) === choice.dozen)
          : [choice.number];
    // Las perdedoras incluyen el cero verde.
    const lose = Array.from({ length: CONFIG.roulette.slots }, (_, i) => i).filter((s) => !win.includes(s));
    entry = { win, lose };
    slotCache.set(key, entry);
  }
  return entry;
}

/** Casillas (1-36) que hacen ganar la apuesta. */
export function winningSlots(choice: BetChoice): number[] {
  return [...slotsFor(choice).win];
}

function pick(slots: readonly number[], rng: Rng): number {
  return slots[Math.floor(rng() * slots.length)];
}
