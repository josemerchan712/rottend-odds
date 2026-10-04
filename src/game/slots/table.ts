import { currentMaxBet } from '../betting';
import { CONFIG, type SlotUpgradeId } from '../config';
import { hasHelper, helperBetAmount, helperInterval, helperLuckBonus } from '../helper';
import { expectedValue } from '../luck';
import type { Rng } from '../rng';
import type { LenderPhase } from '../lender';
import type { GameState } from '../state';
import { WORK_DEF, bagMultiplier } from '../work';
import { cleanerIncomeRate } from '../workCore';
import { bestHold, slotCeiling, spinSlots } from './machine';
import type { SlotSpin, SlotsState } from './state';

/**
 * El resto de la mesa 2 (lógica pura): mejoras, ayudante (el empleado zombi), conversión desde la
 * mesa 1 y el paso del tiempo. Sin trastienda: la red de seguridad es el pasivo (con un suelo).
 */
const S = CONFIG.slots;

// ---------------------------------------------------------------------------
// Desbloqueo y pago

/** La mesa 2 se abre al saldar la deuda de la mesa 1. */
export function isSlotsUnlocked(state: GameState): boolean {
  return state.debtPaid;
}

export function slotsDebtProgress(slots: SlotsState): number {
  if (slots.debtPaid) return 1;
  return Math.min(slots.balance / S.debt.amount, 1);
}

export function canPaySlotsDebt(slots: SlotsState): boolean {
  return !slots.debtPaid && slots.balance >= S.debt.amount;
}

export function paySlotsDebt(slots: SlotsState): boolean {
  if (!canPaySlotsDebt(slots)) return false;
  slots.balance -= S.debt.amount;
  slots.debtPaid = true;
  return true;
}

// ---------------------------------------------------------------------------
// Mejoras

const NEEDS_ZOMBIE: readonly SlotUpgradeId[] = ['helperSpeed', 'helperProfile', 'helperLuck'];

export function slotUpgradeCost(id: SlotUpgradeId, level: number): number {
  const def = S.upgrades[id];
  return Math.round(def.baseCost * def.growth ** level);
}

export function isSlotMaxed(slots: SlotsState, id: SlotUpgradeId): boolean {
  return slots.upgrades[id] >= S.upgrades[id].maxLevel;
}

export function isSlotUnlocked(slots: SlotsState, id: SlotUpgradeId): boolean {
  return !NEEDS_ZOMBIE.includes(id) || slots.upgrades.zombie > 0;
}

export function slotNextCost(slots: SlotsState, id: SlotUpgradeId): number | null {
  return isSlotMaxed(slots, id) ? null : slotUpgradeCost(id, slots.upgrades[id]);
}

export function canBuySlot(slots: SlotsState, id: SlotUpgradeId): boolean {
  const cost = slotNextCost(slots, id);
  return cost !== null && isSlotUnlocked(slots, id) && slots.balance >= cost;
}

export function buySlotUpgrade(slots: SlotsState, id: SlotUpgradeId): boolean {
  if (!canBuySlot(slots, id)) return false;
  slots.balance -= slotUpgradeCost(id, slots.upgrades[id]);
  slots.upgrades[id]++;
  if (id === 'helperProfile') slots.helper.profile = slots.upgrades.helperProfile;
  return true;
}

// ---------------------------------------------------------------------------
// Ayudante: el empleado zombi juega en la máquina de al lado

export function hasZombie(slots: SlotsState): boolean {
  return slots.upgrades.zombie > 0;
}

export function zombieInterval(speedLevel: number): number {
  return S.helper.baseInterval * (1 - S.helper.speedReductionPerLevel) ** speedLevel;
}

export function zombieLuckBonus(level: number): number {
  return S.helper.luckPerLevel * level;
}

export function zombieProfile(slots: SlotsState) {
  const unlocked = Math.min(slots.upgrades.helperProfile, S.helper.profiles.length - 1);
  return S.helper.profiles[Math.min(Math.max(slots.helper.profile, 0), unlocked)];
}

export function selectZombieProfile(slots: SlotsState, index: number): boolean {
  if (index < 0 || index > slots.upgrades.helperProfile || index >= S.helper.profiles.length) return false;
  slots.helper.profile = index;
  return true;
}

/** Apuesta del zombi: su fracción del techo, como mucho su fracción del saldo. 0 = espera. */
export function zombieBet(slots: SlotsState): number {
  const profile = zombieProfile(slots);
  const ceiling = slotCeiling(slots);
  const wanted = Math.max(Math.floor(ceiling * profile.fraction), S.bet.minBet);
  const bet = Math.min(wanted, Math.floor(slots.balance * profile.maxBalanceFraction));
  return bet >= S.bet.minBet ? bet : 0;
}

/**
 * El zombi apuesta cuando le toca. Retiene con un criterio sencillo: si el valor esperado con
 * retención (y su extra) supera al de no retener, y le llega para pagarla.
 */
export function updateZombie(slots: SlotsState, dt: number, rng: Rng): SlotSpin[] {
  if (!hasZombie(slots)) return [];
  const results: SlotSpin[] = [];
  const interval = zombieInterval(slots.upgrades.helperSpeed);
  slots.helper.timer += dt;
  while (slots.helper.timer >= interval) {
    const bet = zombieBet(slots);
    if (bet <= 0) {
      slots.helper.timer = interval;
      break;
    }
    slots.helper.timer -= interval;
    const bonus = zombieLuckBonus(slots.upgrades.helperLuck);
    let hold = bestHold(slots.helper.reels, bet, slotCeiling(slots), slots.upgrades.luck, slots.upgrades.jackpot, slots.upgrades.hold, bonus, slots.pot);
    if (hold !== null && slots.balance < bet + Math.ceil(bet * S.hold.feeFraction)) hold = null;
    const result = spinSlots(slots, { bettor: 'ayudante', bet, hold, from: slots.helper.reels, luckBonus: bonus }, rng);
    if (!result) break;
    slots.helper.reels = result.reels;
    results.push(result);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Conversión desde la mesa 1

/**
 * Ingreso esperado por segundo de la mesa 1 cuando juega sola: su ayudante (valor esperado de
 * su apuesta actual entre su intervalo, si es positivo) más su ayudante de limpieza.
 */
export function table1IncomeRate(state: GameState): number {
  let rate = cleanerIncomeRate(WORK_DEF, state.upgrades.cleaner, bagMultiplier(state));
  if (hasHelper(state)) {
    const bet = helperBetAmount(state);
    if (bet > 0) {
      const ev = expectedValue('color', bet, currentMaxBet(state), state.upgrades.luck, state.upgrades.jackpot, helperLuckBonus(state.upgrades.helperLuck));
      rate += Math.max(ev, 0) / helperInterval(state.upgrades.helperSpeed);
    }
  }
  return rate;
}

/** Monedas por segundo que recibe la mesa 2: k * (ingreso/s de la mesa 1)^0,5. */
export function passiveRate(state: GameState): number {
  // Suelo mínimo: sin trastienda, el pasivo es la red de seguridad (nunca hay bloqueo).
  return Math.max(S.conversion.floor, S.conversion.k * Math.sqrt(Math.max(table1IncomeRate(state), 0)));
}

// ---------------------------------------------------------------------------
// Paso del tiempo

export interface SlotsTick {
  zombie: SlotSpin[];
}

/** Avanza la mesa 2 dt segundos (si está desbloqueada): conversión y zombi. */
export function updateSlots(state: GameState, dt: number, rng: Rng): SlotsTick {
  if (!isSlotsUnlocked(state) || dt <= 0) return { zombie: [] };
  const slots = state.slots;
  slots.playTime += dt;
  slots.passiveCarry += passiveRate(state) * dt;
  const whole = Math.floor(slots.passiveCarry);
  if (whole > 0) {
    slots.passiveCarry -= whole;
    slots.balance += whole;
    slots.stats.passiveEarned += whole;
  }
  const zombie = updateZombie(slots, dt, rng);
  return { zombie };
}

/** Fase de la Tragaperras viviente, como la del Encargado: por el % de la deuda de la mesa 2 reunido. */
export function slotsLenderPhase(slots: SlotsState): LenderPhase {
  if (slots.debtPaid) return 'calm';
  const progress = slotsDebtProgress(slots);
  const [uneasyFrom, deformedFrom] = CONFIG.lender.phaseThresholds;
  if (progress >= deformedFrom) return 'deformed';
  if (progress >= uneasyFrom) return 'uneasy';
  return 'calm';
}
