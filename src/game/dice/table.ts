import { CONFIG, type DiceUpgradeId } from '../config';
import type { LenderPhase } from '../lender';
import type { Rng } from '../rng';
import { hasZombie, slotsWorkHost, toolboxMultiplier, zombieBet, zombieInterval, zombieLuckBonus } from '../slots/table';
import { slotCeiling, slotExpectedValue } from '../slots/machine';
import type { GameState } from '../state';
import {
  cleanerIncomeRate,
  cleanerIntervalFor,
  collectFrom,
  collectNearestFrom,
  hostItemValue,
  updateWorkHost,
  type Collected,
  type WorkHost,
} from '../workCore';
import { bestReroll, closeRoll, diceCeiling, rollDice, reroll, targetChance, updateRerolls, unlockedTargets } from './game';
import type { DiceRoll, DiceState } from './state';

/**
 * El resto de la mesa 3 (lógica pura): desbloqueo y deuda, mejoras, ayudante (el camarero
 * fantasma), trabajo (servir copas), conversión desde la mesa 2 y el paso del tiempo.
 */
const D = CONFIG.dice;

export function isDiceUnlocked(state: GameState): boolean {
  return state.debtPaid && state.slots.debtPaid;
}

export function diceDebtProgress(dice: DiceState): number {
  return dice.debtPaid ? 1 : Math.min(dice.balance / D.debt.amount, 1);
}

export function canPayDiceDebt(dice: DiceState): boolean {
  return !dice.debtPaid && dice.balance >= D.debt.amount;
}

export function payDiceDebt(dice: DiceState): boolean {
  if (!canPayDiceDebt(dice)) return false;
  dice.balance -= D.debt.amount;
  dice.debtPaid = true;
  return true;
}

export function diceLenderPhase(dice: DiceState): LenderPhase {
  if (dice.debtPaid) return 'calm';
  const progress = diceDebtProgress(dice);
  const [uneasyFrom, deformedFrom] = CONFIG.lender.phaseThresholds;
  if (progress >= deformedFrom) return 'deformed';
  if (progress >= uneasyFrom) return 'uneasy';
  return 'calm';
}

// ---------------------------------------------------------------------------
// Mejoras

const NEEDS_GHOST: readonly DiceUpgradeId[] = ['helperSpeed', 'helperProfile', 'helperLuck'];

export function diceUpgradeCost(id: DiceUpgradeId, level: number): number {
  const def = D.upgrades[id];
  return Math.round(def.baseCost * def.growth ** level);
}

export function isDiceMaxed(dice: DiceState, id: DiceUpgradeId): boolean {
  return dice.upgrades[id] >= D.upgrades[id].maxLevel;
}

export function isDiceUpgradeUnlocked(dice: DiceState, id: DiceUpgradeId): boolean {
  return !NEEDS_GHOST.includes(id) || dice.upgrades.ghost > 0;
}

export function diceNextCost(dice: DiceState, id: DiceUpgradeId): number | null {
  return isDiceMaxed(dice, id) ? null : diceUpgradeCost(id, dice.upgrades[id]);
}

export function canBuyDice(dice: DiceState, id: DiceUpgradeId): boolean {
  const cost = diceNextCost(dice, id);
  return cost !== null && isDiceUpgradeUnlocked(dice, id) && dice.balance >= cost;
}

export function buyDiceUpgrade(dice: DiceState, id: DiceUpgradeId): boolean {
  if (!canBuyDice(dice, id)) return false;
  dice.balance -= diceUpgradeCost(id, dice.upgrades[id]);
  dice.upgrades[id]++;
  if (id === 'helperProfile') dice.helper.profile = dice.upgrades.helperProfile;
  return true;
}

// ---------------------------------------------------------------------------
// Ayudante: el camarero fantasma, en el otro extremo de la barra

export function hasGhost(dice: DiceState): boolean {
  return dice.upgrades.ghost > 0;
}

export function ghostInterval(speedLevel: number): number {
  return D.helper.baseInterval * (1 - D.helper.speedReductionPerLevel) ** speedLevel;
}

export function ghostLuckBonus(level: number): number {
  return D.helper.luckPerLevel * level;
}

export function ghostProfile(dice: DiceState) {
  const unlocked = Math.min(dice.upgrades.helperProfile, D.helper.profiles.length - 1);
  return D.helper.profiles[Math.min(Math.max(dice.helper.profile, 0), unlocked)];
}

export function selectGhostProfile(dice: DiceState, index: number): boolean {
  if (index < 0 || index > dice.upgrades.helperProfile || index >= D.helper.profiles.length) return false;
  dice.helper.profile = index;
  return true;
}

export function ghostBet(dice: DiceState): number {
  const profile = ghostProfile(dice);
  const wanted = Math.max(Math.floor(diceCeiling(dice) * profile.fraction), D.bet.minBet);
  const bet = Math.min(wanted, Math.floor(dice.balance * profile.maxBalanceFraction));
  return bet >= D.bet.minBet ? bet : 0;
}

/**
 * El objetivo del ayudante (criterio sencillo): el que más hace crecer su saldo con esa apuesta,
 * p·ln(1 + pago·x) + (1 − p)·ln(1 − x), con x = apuesta / saldo. Así no persigue el doble seis con
 * una apuesta grande solo porque su valor esperado sea alto.
 */
export function ghostTarget(dice: DiceState, bet: number) {
  const bonus = ghostLuckBonus(dice.upgrades.helperLuck);
  const ceiling = diceCeiling(dice);
  const x = Math.min(bet / Math.max(dice.balance, 1), 0.999);
  const growth = (t: ReturnType<typeof unlockedTargets>[number]) => {
    const p = targetChance(t, dice.upgrades.luck, bet / ceiling, bonus);
    return p * Math.log1p(CONFIG.dice.targets[t].payout * x) + (1 - p) * Math.log1p(-x);
  };
  return unlockedTargets(dice).reduce((best, t) => (growth(t) > growth(best) ? t : best));
}

/**
 * El camarero tira cuando le toca. Si falla y quedan cargas, relanza el mejor dado si la
 * probabilidad de convertir es al menos 1/3 (la reserva de cargas es común con el jugador).
 */
export function updateGhost(dice: DiceState, dt: number, rng: Rng): DiceRoll[] {
  if (!hasGhost(dice)) return [];
  const rolls: DiceRoll[] = [];
  const interval = ghostInterval(dice.upgrades.helperSpeed);
  dice.helper.timer += dt;
  while (dice.helper.timer >= interval) {
    const bet = ghostBet(dice);
    if (bet <= 0) {
      dice.helper.timer = interval;
      break;
    }
    dice.helper.timer -= interval;
    const roll = rollDice(dice, { bettor: 'ayudante', target: ghostTarget(dice, bet), bet, luckBonus: ghostLuckBonus(dice.upgrades.helperLuck) }, rng);
    if (!roll) break;
    if (!roll.final) {
      const best = bestReroll(roll.target, roll.dice);
      if (best.chance >= D.rerolls.helperThreshold) reroll(dice, roll, best.die, rng);
      else closeRoll(dice, roll);
    }
    rolls.push(roll);
  }
  return rolls;
}

// ---------------------------------------------------------------------------
// Trabajo: servir copas

export function cartMultiplier(dice: DiceState): number {
  return 1 + D.work.valuePerLevel * dice.upgrades.cart;
}

const hosts = new WeakMap<DiceState, WorkHost>();

/** La trastienda de la mesa 3 para el núcleo común (una por estado, con getters). */
export function diceWorkHost(dice: DiceState): WorkHost {
  let host = hosts.get(dice);
  if (!host) {
    host = {
      def: D.work,
      get work() {
        return dice.work;
      },
      get valueMultiplier() {
        return cartMultiplier(dice);
      },
      get extraPerClick() {
        return dice.upgrades.tray * D.work.extraPerLevel;
      },
      get cleanerLevel() {
        return dice.upgrades.busboy;
      },
      credit(value: number) {
        dice.balance += value;
        dice.stats.workEarned += value;
      },
    };
    hosts.set(dice, host);
  }
  return host;
}

export function diceItemValue(dice: DiceState, kind: string): number {
  return hostItemValue(diceWorkHost(dice), kind);
}

export function busboyInterval(level: number): number {
  return cleanerIntervalFor(D.work, level);
}

export function collectDiceItem(dice: DiceState, itemId: number): Collected[] {
  return collectFrom(diceWorkHost(dice), itemId);
}

export function collectNearestDiceItem(dice: DiceState): Collected[] {
  return collectNearestFrom(diceWorkHost(dice));
}

// ---------------------------------------------------------------------------
// Conversión desde la mesa 2

/** Ingreso esperado por segundo de la mesa 2 jugando sola: su zombi (sin retener) y su aprendiz. */
export function table2IncomeRate(state: GameState): number {
  const slots = state.slots;
  let rate = cleanerIncomeRate(slotsWorkHost(slots).def, slots.upgrades.apprentice, toolboxMultiplier(slots));
  if (hasZombie(slots)) {
    const bet = zombieBet(slots);
    if (bet > 0) {
      const ev = slotExpectedValue(bet, slotCeiling(slots), slots.upgrades.luck, slots.upgrades.jackpot, {
        bonus: zombieLuckBonus(slots.upgrades.helperLuck),
        pot: slots.pot,
      });
      rate += Math.max(ev, 0) / zombieInterval(slots.upgrades.helperSpeed);
    }
  }
  return rate;
}

export function dicePassiveRate(state: GameState): number {
  return D.conversion.k * Math.sqrt(Math.max(table2IncomeRate(state), 0));
}

// ---------------------------------------------------------------------------
// Paso del tiempo

export interface DiceTick {
  ghost: DiceRoll[];
  cleaned: Collected[];
}

export function updateDice(state: GameState, dt: number, rng: Rng): DiceTick {
  if (!isDiceUnlocked(state) || dt <= 0) return { ghost: [], cleaned: [] };
  const dice = state.dice;
  dice.playTime += dt;
  dice.passiveCarry += dicePassiveRate(state) * dt;
  const whole = Math.floor(dice.passiveCarry);
  if (whole > 0) {
    dice.passiveCarry -= whole;
    dice.balance += whole;
    dice.stats.passiveEarned += whole;
  }
  updateRerolls(dice, dt);
  const cleaned = updateWorkHost(diceWorkHost(dice), dt, rng);
  const ghost = updateGhost(dice, dt, rng);
  return { ghost, cleaned };
}

/** ¿Se puede pasar a esa mesa? La 2 con la 1 saldada; la 3 con la 2 saldada. */
export function canSwitchTo(state: GameState, to: 1 | 2 | 3): boolean {
  if (state.activeTable === to) return false;
  if (to === 1) return true;
  if (to === 2) return state.debtPaid;
  return isDiceUnlocked(state);
}
