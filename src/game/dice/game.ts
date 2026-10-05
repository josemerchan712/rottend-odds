import { selectorChips, type SelectorChip } from '../betting';
import { CONFIG, DICE_TARGETS, type DiceTarget } from '../config';
import type { Rng } from '../rng';
import type { Bettor } from '../state';
import type { Dice, DiceRoll, DiceState } from './state';

/**
 * Los dados del Barman (lógica pura). Como en las otras mesas, primero se decide el resultado con
 * la suerte y luego se eligen unos dados que lo enseñen. El relanzamiento sí es honrado: el dado
 * nuevo sale al azar, y la probabilidad de convertir la tirada depende del dado que se queda.
 */
const D = CONFIG.dice;

// ---------------------------------------------------------------------------
// Objetivos

/** ¿Aciertan estos dados el objetivo? */
export function hits(target: DiceTarget, [a, b]: Dice): boolean {
  switch (target) {
    case 'par':
      return (a + b) % 2 === 0;
    case 'over7':
      return a + b >= 8;
    case 'over9':
      return a + b >= 10;
    case 'double':
      return a === b;
    case 'boxcars':
      return a === 6 && b === 6;
  }
}

export function isTargetUnlocked(dice: DiceState, target: DiceTarget): boolean {
  const unlock = D.targets[target].unlock;
  return unlock === null || dice.upgrades[unlock as keyof DiceState['upgrades']] > 0;
}

export function unlockedTargets(dice: DiceState): DiceTarget[] {
  return DICE_TARGETS.filter((t) => isTargetUnlocked(dice, t));
}

export function selectTarget(dice: DiceState, target: DiceTarget): boolean {
  if (!isTargetUnlocked(dice, target)) return false;
  dice.target = target;
  return true;
}

// ---------------------------------------------------------------------------
// Suerte, techo, penalización y jackpot

export function diceLuckProgress(level: number): number {
  const max = D.upgrades.luck.maxLevel;
  return (Math.min(Math.max(level, 0), max) / max) ** D.luck.curveExponent;
}

/** Probabilidad de acertar "par" con la suerte, sin penalización. */
export function diceLuckChance(level: number): number {
  return Math.min(D.luck.base + (D.luck.cap - D.luck.base) * diceLuckProgress(level), D.luck.cap);
}

export function dicePenalty(fraction: number, luckLevel: number): number {
  const L = diceLuckProgress(luckLevel);
  const factor = D.risk.penaltyFactorAtMinLuck + (D.risk.penaltyFactorAtMaxLuck - D.risk.penaltyFactorAtMinLuck) * L;
  return factor * Math.min(Math.max(fraction, 0), 1) ** D.risk.penaltyExponent;
}

/** Multiplicador de suerte del objetivo: < 1 con poca suerte en los arriesgados, > 1 con mucha. */
export function targetLuckMultiplier(target: DiceTarget, luckLevel: number): number {
  const t = D.targets[target];
  return t.luckMin + (t.luckMax - t.luckMin) * diceLuckProgress(luckLevel);
}

/** Probabilidad de acertar un objetivo: la de "par" con penalización, escalada por r y m. */
export function targetChance(target: DiceTarget, luckLevel: number, fraction: number, bonus = 0): number {
  const par = Math.max(Math.min(diceLuckChance(luckLevel) + bonus, D.luck.cap) - dicePenalty(fraction, luckLevel), 0);
  return Math.min(par * D.targets[target].ratio * targetLuckMultiplier(target, luckLevel), D.luck.cap);
}

/** Valor esperado neto de una tirada, sin relanzamiento ni jackpot. */
export function targetExpectedValue(target: DiceTarget, bet: number, ceiling: number, luckLevel: number, bonus = 0): number {
  const p = targetChance(target, luckLevel, bet / ceiling, bonus);
  return p * D.targets[target].payout * bet - (1 - p) * bet;
}

export function diceJackpotChance(luckLevel: number, jackpotLevel: number): number {
  const level = Math.min(Math.max(jackpotLevel, 0), D.upgrades.jackpot.maxLevel);
  const j = D.jackpot.baseChance + D.jackpot.luckBonusMax * diceLuckProgress(luckLevel) + D.jackpot.upgradeBonusPerLevel * level;
  return Math.min(j, D.jackpot.maxChance);
}

/** Probabilidad de que salga doble seis en una tirada (dados cargados): j^(1/3). */
export function boxcarsChance(luckLevel: number, jackpotLevel: number): number {
  return Math.cbrt(diceJackpotChance(luckLevel, jackpotLevel));
}

export const DICE_JACKPOT_CAP = D.debt.amount * D.jackpot.payoutCapDebtFraction;

export function diceJackpotPayout(bet: number, pot: number): { gain: number; capped: boolean } {
  const raw = bet * D.jackpot.payoutMultiplier;
  const limit = Math.min(Math.max(pot, 0), DICE_JACKPOT_CAP);
  return raw > limit ? { gain: Math.floor(limit), capped: true } : { gain: raw, capped: false };
}

export function diceMaxBet(level: number): number {
  return Math.floor(D.bet.baseMaxBet * D.bet.maxBetMultiplierPerLevel ** level);
}

export function diceCeiling(dice: DiceState): number {
  return diceMaxBet(dice.upgrades.maxBet);
}

export function diceChips(dice: DiceState): SelectorChip[] {
  return selectorChips(dice.balance, diceCeiling(dice));
}

export function selectedDiceChip(dice: DiceState): SelectorChip {
  const chips = diceChips(dice);
  const below = chips.filter((c) => c.index <= dice.betFractionIndex);
  return below[below.length - 1] ?? chips[0];
}

export function selectDiceChip(dice: DiceState, index: number): boolean {
  if (index < 0 || index >= CONFIG.bet.quickFractions.length) return false;
  dice.betFractionIndex = index;
  return true;
}

// ---------------------------------------------------------------------------
// Relanzamientos

export function maxRerolls(luckLevel: number): number {
  return D.rerolls.base + Math.floor(Math.max(luckLevel, 0) / D.rerolls.perLevels);
}

export function rerollInterval(luckLevel: number): number {
  return D.rerolls.rechargeSeconds * D.rerolls.rechargeFactor ** Math.max(luckLevel, 0);
}

/** Recarga las cargas con el tiempo (sin pasar del máximo). */
export function updateRerolls(dice: DiceState, dt: number): void {
  const max = maxRerolls(dice.upgrades.luck);
  const r = dice.rerolls;
  if (r.charges >= max) {
    r.charges = max;
    r.timer = 0;
    return;
  }
  r.timer += dt;
  const interval = rerollInterval(dice.upgrades.luck);
  while (r.timer >= interval && r.charges < max) {
    r.timer -= interval;
    r.charges++;
  }
  if (r.charges >= max) r.timer = 0;
}

/** Probabilidad de acertar si se relanza el dado `die` (el otro se queda). Honrada: 1/6 por cara. */
export function rerollChance(target: DiceTarget, dice: Dice, die: number): number {
  const kept = dice[1 - die];
  let n = 0;
  for (let v = 1; v <= 6; v++) if (hits(target, die === 0 ? [v, kept] : [kept, v])) n++;
  return n / 6;
}

/** El mejor dado para relanzar y su probabilidad de convertir la tirada. */
export function bestReroll(target: DiceTarget, dice: Dice): { die: number; chance: number } {
  const a = rerollChance(target, dice, 0);
  const b = rerollChance(target, dice, 1);
  return a >= b ? { die: 0, chance: a } : { die: 1, chance: b };
}

// ---------------------------------------------------------------------------
// Dados que enseñan el resultado

const PAIRS: Dice[] = [];
for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) PAIRS.push([a, b]);

const RESCUE = new Map<DiceTarget, number>();

/**
 * Parte media de las tiradas perdidas a un objetivo que un relanzamiento convierte, contando solo
 * los relanzamientos que hace el ayudante (los que convierten con al menos su umbral).
 */
export function rerollRescue(target: DiceTarget): number {
  let r = RESCUE.get(target);
  if (r === undefined) {
    const pool = PAIRS.filter((p) => !hits(target, p) && !(p[0] === 6 && p[1] === 6));
    let sum = 0;
    for (const p of pool) {
      const best = bestReroll(target, p);
      if (best.chance >= D.rerolls.helperThreshold) sum += best.chance;
    }
    r = pool.length ? sum / pool.length : 0;
    RESCUE.set(target, r);
  }
  return r;
}

function pick<T>(items: T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

/** Unos dados al azar que aciertan (o fallan) el objetivo; `boxcars` = doble seis. */
export function diceFor(target: DiceTarget, won: boolean, boxcars: boolean, rng: Rng): Dice {
  if (won && boxcars) return [6, 6];
  const pool = PAIRS.filter((p) => hits(target, p) === won && !(p[0] === 6 && p[1] === 6));
  return pool.length ? [...pick(pool, rng)] as Dice : [6, 6];
}

// ---------------------------------------------------------------------------
// Tirada

export interface RollRequest {
  bettor: Bettor;
  target: DiceTarget;
  bet: number;
  luckBonus?: number;
}

/**
 * Tira: cobra la apuesta, decide si acierta y con qué dados, y paga si acierta. Si falla y quedan
 * cargas, la tirada queda abierta (final: false) para que se pueda relanzar un dado; si no, se cierra
 * y cuenta para la racha del jackpot. Devuelve null si no hay chapas o el objetivo está bloqueado.
 */
export function rollDice(dice: DiceState, req: RollRequest, rng: Rng): DiceRoll | null {
  const bet = Math.floor(req.bet);
  if (bet < D.bet.minBet || dice.balance < bet || !isTargetUnlocked(dice, req.target)) return null;
  // Una tirada abierta del jugador se cierra al tirar otra vez.
  if (req.bettor === 'jugador') closeOpenRoll(dice);
  const ceiling = diceCeiling(dice);
  const p = targetChance(req.target, dice.upgrades.luck, bet / ceiling, req.luckBonus ?? 0);
  const won = rng() < p;
  const box = won && rng() < Math.min(boxcarsChance(dice.upgrades.luck, dice.upgrades.jackpot) / Math.max(p, 1e-9), 1);
  const shown = diceFor(req.target, won, box, rng);
  const delta = won ? Math.round(bet * D.targets[req.target].payout) : -bet;
  dice.balance = Math.max(0, dice.balance + delta);
  dice.pot = Math.min(dice.pot + bet * D.jackpot.potContribution, DICE_JACKPOT_CAP);
  const roll: DiceRoll = {
    bettor: req.bettor,
    target: req.target,
    bet,
    dice: shown,
    won,
    winChance: p,
    delta,
    rerolled: null,
    jackpot: 0,
    jackpotCapped: false,
    final: false,
  };
  dice.stats.rolls++;
  if (won) dice.stats.wins++;
  if (req.bettor === 'jugador') dice.dice = shown;
  dice.recentRolls.unshift(roll);
  dice.recentRolls.length = Math.min(dice.recentRolls.length, CONFIG.tech.recentSpins);
  if (won || dice.rerolls.charges <= 0) finalize(dice, roll);
  return roll;
}

/** La tirada abierta del jugador (perdida, con cargas para relanzar), o null. */
export function openRoll(dice: DiceState): DiceRoll | null {
  const roll = dice.recentRolls.find((r) => r.bettor === 'jugador');
  return roll && !roll.final ? roll : null;
}

/** El jugador acepta la tirada perdida sin relanzar. */
export function closeOpenRoll(dice: DiceState): void {
  const roll = openRoll(dice);
  if (roll) finalize(dice, roll);
}

/**
 * Relanza un dado de una tirada perdida abierta: gasta una carga, el dado sale al azar y, si ahora
 * acierta, paga. Cierra la tirada. Devuelve false si no se puede.
 */
export function reroll(dice: DiceState, roll: DiceRoll, die: number, rng: Rng): boolean {
  if (roll.final || roll.won || dice.rerolls.charges <= 0 || (die !== 0 && die !== 1)) return false;
  dice.rerolls.charges--;
  dice.stats.rerolls++;
  const next = [...roll.dice] as Dice;
  next[die] = 1 + Math.floor(rng() * 6);
  roll.dice = next;
  roll.rerolled = die;
  if (hits(roll.target, next)) {
    const gain = roll.bet + Math.round(roll.bet * D.targets[roll.target].payout);
    dice.balance += gain;
    roll.delta += gain;
    roll.won = true;
    dice.stats.wins++;
    dice.stats.rerollWins++;
  }
  if (roll.bettor === 'jugador') dice.dice = next;
  finalize(dice, roll);
  return true;
}

/** Cierra una tirada (una sola vez): actualiza la racha de dobles seises y paga el jackpot al completarla. */
function finalize(dice: DiceState, roll: DiceRoll): void {
  if (roll.final) return;
  roll.final = true;
  const isPlayer = roll.bettor === 'jugador';
  const boxcars = roll.dice[0] === 6 && roll.dice[1] === 6;
  let streak = (isPlayer ? dice.streak : dice.helper.streak) + 1;
  if (!boxcars) streak = 0;
  if (streak >= D.jackpot.streak) {
    const { gain, capped } = diceJackpotPayout(roll.bet, dice.pot);
    dice.balance += gain;
    roll.delta += gain;
    roll.jackpot = gain;
    roll.jackpotCapped = capped;
    dice.pot = D.jackpot.potSeed;
    dice.stats.jackpots++;
    if (capped) dice.stats.jackpotsCapped++;
    streak = 0;
  }
  if (isPlayer) dice.streak = streak;
  else dice.helper.streak = streak;
  if (roll.delta > 0) dice.stats.won += roll.delta;
}

/** El jugador tira con la ficha y el objetivo elegidos. */
export function playerRoll(dice: DiceState, rng: Rng): DiceRoll | null {
  const chip = selectedDiceChip(dice);
  if (!chip.affordable) return null;
  return rollDice(dice, { bettor: 'jugador', target: dice.target, bet: chip.amount }, rng);
}

/** Cierra una tirada abierta sin relanzar (la usa el ayudante cuando no le compensa). */
export function closeRoll(dice: DiceState, roll: DiceRoll): void {
  finalize(dice, roll);
}
