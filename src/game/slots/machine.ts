import { niceFloor, type SelectorChip } from '../betting';
import { CONFIG } from '../config';
import type { Rng } from '../rng';
import type { Bettor } from '../state';
import type { Reels, SlotOutcome, SlotSpin, SlotsState } from './state';

/**
 * La tragaperras (lógica pura). Como en la ruleta, primero se decide el resultado con la suerte
 * (probabilidad de premio con curva convexa, penalización por apostar fuerte y jackpot aparte) y
 * después se eligen unos carretes que lo enseñen: lo que se ve siempre coincide con lo que se cobra.
 */
const S = CONFIG.slots;
const SYMBOLS = S.symbols.length;

// ---------------------------------------------------------------------------
// Suerte, techo y jackpot

/** Progreso de la curva de suerte, de 0 (nivel 0) a 1 (nivel máximo). */
export function slotLuckProgress(level: number): number {
  const max = S.upgrades.luck.maxLevel;
  const n = Math.min(Math.max(level, 0), max);
  return (n / max) ** S.luck.curveExponent;
}

/** Probabilidad de premio (dos o tres iguales) que da la suerte, sin penalización. */
export function slotLuckChance(level: number): number {
  return Math.min(S.luck.base + (S.luck.cap - S.luck.base) * slotLuckProgress(level), S.luck.cap);
}

export function slotPenalty(fraction: number, luckLevel: number): number {
  const L = slotLuckProgress(luckLevel);
  const factor = S.risk.penaltyFactorAtMinLuck + (S.risk.penaltyFactorAtMaxLuck - S.risk.penaltyFactorAtMinLuck) * L;
  return factor * Math.min(Math.max(fraction, 0), 1) ** S.risk.penaltyExponent;
}

/** Probabilidad de premio con la penalización por la fracción del techo apostada (y un bonus propio). */
export function slotWinChance(luckLevel: number, fraction: number, bonus = 0): number {
  const p = Math.min(slotLuckChance(luckLevel) + bonus, S.luck.cap);
  return Math.max(p - slotPenalty(fraction, luckLevel), 0);
}

/** Parte de las tiradas perdedoras que la retención convierte en premio (0 sin la mejora). */
export function holdShare(holdLevel: number): number {
  if (holdLevel <= 0) return 0;
  return S.hold.shareBase + S.hold.sharePerLevel * (holdLevel - 1);
}

export function heldWinChance(p: number, holdLevel: number): number {
  return p + (1 - p) * holdShare(holdLevel);
}

export function holdFee(bet: number): number {
  return Math.ceil(bet * S.hold.feeFraction);
}

export function slotJackpotChance(luckLevel: number, jackpotLevel: number): number {
  const level = Math.min(Math.max(jackpotLevel, 0), S.upgrades.jackpot.maxLevel);
  const chance = S.jackpot.baseChance + S.jackpot.luckBonusMax * slotLuckProgress(luckLevel) + S.jackpot.upgradeBonusPerLevel * level;
  return Math.min(chance, S.jackpot.maxChance);
}

/** Tope absoluto del jackpot: el 25% de la deuda. */
export const JACKPOT_CAP = S.debt.amount * S.jackpot.payoutCapDebtFraction;

/** Ganancia de un jackpot: apuesta × 1000, como mucho el pozo y el 25% de la deuda. `capped` = se recortó. */
export function slotJackpotPayout(bet: number, pot: number = JACKPOT_CAP): { gain: number; capped: boolean } {
  const raw = bet * S.jackpot.payoutMultiplier;
  const limit = Math.min(Math.max(pot, 0), JACKPOT_CAP);
  return raw > limit ? { gain: Math.floor(limit), capped: true } : { gain: raw, capped: false };
}

export function slotMaxBet(level: number): number {
  return Math.floor(S.bet.baseMaxBet * S.bet.maxBetMultiplierPerLevel ** level);
}

export function slotCeiling(slots: SlotsState): number {
  return slotMaxBet(slots.upgrades.maxBet);
}

/** Premio bruto medio de una tirada ganadora (apuesta incluida). */
export const MEAN_WIN_PAYOUT = (1 - S.tripleShare) * S.pairPayout + S.tripleShare * S.triplePayout;

/**
 * Valor esperado neto de una tirada. `held` = símbolo del carrete retenido (o null sin retener);
 * retener anula el jackpot de esa tirada.
 */
export function slotExpectedValue(
  bet: number,
  ceiling: number,
  luckLevel: number,
  jackpotLevel: number,
  opts: { bonus?: number; holdLevel?: number; heldSymbol?: number | null; pot?: number } = {},
): number {
  if (bet <= 0) return 0;
  const holding = opts.heldSymbol !== undefined && opts.heldSymbol !== null && (opts.holdLevel ?? 0) > 0;
  let p = slotWinChance(luckLevel, bet / ceiling, opts.bonus ?? 0);
  if (holding) p = heldWinChance(p, opts.holdLevel!);
  const pj = holding ? 0 : slotJackpotChance(luckLevel, jackpotLevel);
  const fee = holding ? holdFee(bet) : 0;
  const normal = p * MEAN_WIN_PAYOUT * bet - bet;
  return pj * slotJackpotPayout(bet, opts.pot).gain + (1 - pj) * normal - fee;
}

/** El primer carrete que se puede retener (cualquiera que no sea un diamante), o null. */
export function holdableReel(reels: Reels): number | null {
  const i = reels.findIndex((s) => s !== S.diamond);
  return i >= 0 ? i : null;
}

/**
 * ¿Compensa retener? Compara el valor esperado con y sin retener (con su extra y sin jackpot).
 * Devuelve el carrete a retener o null.
 */
export function bestHold(
  reels: Reels,
  bet: number,
  ceiling: number,
  luckLevel: number,
  jackpotLevel: number,
  holdLevel: number,
  bonus = 0,
  pot?: number,
): number | null {
  const reel = holdableReel(reels);
  if (holdLevel <= 0 || bet <= 0 || reel === null) return null;
  const plain = slotExpectedValue(bet, ceiling, luckLevel, jackpotLevel, { bonus, pot });
  const held = slotExpectedValue(bet, ceiling, luckLevel, jackpotLevel, { bonus, holdLevel, heldSymbol: reels[reel], pot });
  return held > plain ? reel : null;
}

// ---------------------------------------------------------------------------
// Selector de apuesta (las mismas fichas de cantidades reales que la ruleta)

export function slotChips(slots: SlotsState): SelectorChip[] {
  const ceiling = slotCeiling(slots);
  const fractions = CONFIG.bet.quickFractions;
  const chips: SelectorChip[] = [];
  for (let index = 0; index < fractions.length - 1; index++) {
    const amount = niceFloor(ceiling * fractions[index]);
    if (chips.some((c) => c.amount === amount)) continue;
    chips.push({ index, amount, all: false, affordable: amount <= slots.balance });
  }
  const all = Math.floor(Math.min(slots.balance, ceiling));
  chips.push({ index: fractions.length - 1, amount: all, all: true, affordable: all >= S.bet.minBet });
  return chips;
}

export function selectedSlotChip(slots: SlotsState): SelectorChip {
  const chips = slotChips(slots);
  const below = chips.filter((c) => c.index <= slots.betFractionIndex);
  return below[below.length - 1] ?? chips[0];
}

export function selectSlotChip(slots: SlotsState, index: number): boolean {
  if (index < 0 || index >= CONFIG.bet.quickFractions.length) return false;
  slots.betFractionIndex = index;
  return true;
}

// ---------------------------------------------------------------------------
// Carretes

function randomSymbol(rng: Rng, exclude: readonly number[] = []): number {
  const pool = [...Array(SYMBOLS).keys()].filter((s) => !exclude.includes(s));
  return pool[Math.floor(rng() * pool.length)];
}

function shuffle3(values: Reels, rng: Rng): Reels {
  const out = [...values] as Reels;
  for (let i = 2; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Unos carretes que muestran el resultado. Con un carrete retenido (nunca un diamante), ese
 * conserva su símbolo. Fuera del jackpot nunca salen tres diamantes.
 */
export function reelsFor(outcome: SlotOutcome, rng: Rng, held: { reel: number; symbol: number } | null = null): Reels {
  const D = S.diamond;
  if (outcome === 'jackpot') return [D, D, D];
  if (!held) {
    if (outcome === 'trio') {
      const s = randomSymbol(rng, [D]);
      return [s, s, s];
    }
    if (outcome === 'pareja') {
      const a = randomSymbol(rng);
      const b = randomSymbol(rng, [a]);
      return shuffle3([a, a, b], rng);
    }
    const a = randomSymbol(rng);
    const b = randomSymbol(rng, [a]);
    return shuffle3([a, b, randomSymbol(rng, [a, b])], rng);
  }

  const { reel, symbol } = held;
  const others = [0, 1, 2].filter((i) => i !== reel);
  const out = [0, 0, 0] as Reels;
  out[reel] = symbol;
  if (outcome === 'trio') {
    out[others[0]] = symbol;
    out[others[1]] = symbol;
  } else if (outcome === 'pareja') {
    // O el retenido forma la pareja con otro carrete, o los otros dos forman la suya.
    if (rng() < 0.5) {
      const [mate, odd] = rng() < 0.5 ? others : [others[1], others[0]];
      out[mate] = symbol;
      out[odd] = randomSymbol(rng, [symbol]);
    } else {
      const s = randomSymbol(rng, [symbol]);
      out[others[0]] = s;
      out[others[1]] = s;
    }
  } else {
    out[others[0]] = randomSymbol(rng, [symbol]);
    out[others[1]] = randomSymbol(rng, [symbol, out[others[0]]]);
  }
  return out;
}

/** Qué premio enseñan unos carretes (para tests y para la escena). */
export function outcomeOf(reels: Reels): SlotOutcome {
  const [a, b, c] = reels;
  if (a === b && b === c) return a === S.diamond ? 'jackpot' : 'trio';
  return a === b || b === c || a === c ? 'pareja' : 'nada';
}

// ---------------------------------------------------------------------------
// Tirada

export interface SlotRequest {
  bettor: Bettor;
  bet: number;
  /** Carrete a retener (0-2) o null. Solo cuenta con la mejora comprada. */
  hold: number | null;
  /** Símbolos de partida (los que se ven antes de tirar), para saber qué se retiene. */
  from: Reels;
  luckBonus?: number;
}

/**
 * Hace una tirada: cobra apuesta y extra de retención, decide el resultado y paga. Devuelve null
 * si no hay monedas para la apuesta (y el extra). No toca los carretes del jugador: eso lo hace
 * quien llama, según de quién sea la máquina.
 */
export function spinSlots(slots: SlotsState, req: SlotRequest, rng: Rng): SlotSpin | null {
  const bet = Math.floor(req.bet);
  if (bet < S.bet.minBet) return null;
  const holding =
    req.hold !== null && slots.upgrades.hold > 0 && req.hold >= 0 && req.hold <= 2 && req.from[req.hold] !== S.diamond;
  const fee = holding ? holdFee(bet) : 0;
  if (slots.balance < bet + fee) return null;

  const ceiling = slotCeiling(slots);
  const held = holding ? { reel: req.hold!, symbol: req.from[req.hold!] } : null;
  let p = slotWinChance(slots.upgrades.luck, bet / ceiling, req.luckBonus ?? 0);
  if (held) p = heldWinChance(p, slots.upgrades.hold);
  const pj = held ? 0 : slotJackpotChance(slots.upgrades.luck, slots.upgrades.jackpot);

  let outcome: SlotOutcome;
  if (rng() < pj) outcome = 'jackpot';
  else if (rng() < p) outcome = rng() < S.tripleShare ? 'trio' : 'pareja';
  else outcome = 'nada';

  let delta = -bet - fee;
  let jackpotCapped = false;
  if (outcome === 'jackpot') {
    const { gain, capped } = slotJackpotPayout(bet, slots.pot);
    delta = gain - fee;
    jackpotCapped = capped;
    slots.pot = S.jackpot.potSeed;
  } else {
    slots.pot = Math.min(slots.pot + bet * S.jackpot.potContribution, JACKPOT_CAP);
    // x1,5 con apuestas impares se redondea (1 → 2, 3 → 5): con 1 moneda la pareja no puede devolver solo 1.
    if (outcome === 'trio') delta += Math.round(bet * S.triplePayout);
    else if (outcome === 'pareja') delta += Math.round(bet * S.pairPayout);
  }

  slots.balance = Math.max(0, slots.balance + delta);
  const result: SlotSpin = {
    bettor: req.bettor,
    bet,
    holdFee: fee,
    held: held ? held.reel : null,
    reels: reelsFor(outcome, rng, held),
    outcome,
    winChance: p,
    delta,
    jackpotCapped,
  };
  slots.stats.spins++;
  if (outcome !== 'nada') slots.stats.wins++;
  if (held) slots.stats.holds++;
  if (outcome === 'jackpot') {
    slots.stats.jackpots++;
    if (jackpotCapped) slots.stats.jackpotsCapped++;
  }
  slots.recentSpins.unshift(result);
  slots.recentSpins.length = Math.min(slots.recentSpins.length, CONFIG.tech.recentSpins);
  return result;
}

/** El jugador tira con la ficha elegida y el carrete que haya marcado para retener. */
export function playerSpin(slots: SlotsState, rng: Rng): SlotSpin | null {
  const chip = selectedSlotChip(slots);
  if (!chip.affordable) return null;
  // Si no llega para el extra de retener, tira sin retener.
  const hold = slots.hold !== null && slots.balance >= chip.amount + holdFee(chip.amount) ? slots.hold : null;
  const result = spinSlots(slots, { bettor: 'jugador', bet: chip.amount, hold, from: slots.reels }, rng);
  if (!result) return null;
  slots.reels = result.reels;
  slots.hold = null;
  return result;
}

/** Marca o desmarca un carrete para retenerlo en la siguiente tirada (requiere la mejora; no un diamante). */
export function toggleHold(slots: SlotsState, reel: number): boolean {
  if (slots.upgrades.hold <= 0 || reel < 0 || reel > 2 || slots.reels[reel] === S.diamond) return false;
  slots.hold = slots.hold === reel ? null : reel;
  return true;
}
