import { CONFIG, type DiceTarget, type DiceUpgradeId } from '../config';
import type { LenderPhase } from '../lender';
import type { Rng } from '../rng';
import {
  binaryOutcomes,
  bucket,
  chooseHelperBet,
  memoRate,
  stateKey,
  HELPER_RETRY_SECONDS,
  recommendedProfile,
  RISK_WINDOW_SECONDS,
  type HelperChoice,
} from '../helperPolicy';
import { hasZombie, zombieBet, zombieInterval, zombieLuckBonus } from '../slots/table';
import { slotCeiling, slotExpectedValue } from '../slots/machine';
import type { GameState } from '../state';
import {
  bestReroll,
  closeRoll,
  diceCeiling,
  rerollInterval,
  rerollRescue,
  rollDice,
  reroll,
  targetChance,
  updateRerolls,
  unlockedTargets,
} from './game';
import type { DiceRoll, DiceState } from './state';

/**
 * El resto de la mesa 3 (lógica pura): desbloqueo y deuda, mejoras, ayudante (el camarero
 * fantasma), conversión desde la mesa 2 y el paso del tiempo. Sin trastienda.
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

/**
 * Decisión del camarero con un perfil (criterio común de helperPolicy): objetivo y apuesta. Entre
 * objetivos gana el que más hace crecer el saldo a su fracción de Kelly, y el umbral de riesgo del
 * perfil descarta los que, con su apuesta, pierden demasiado a menudo en 2 minutos (el doble seis
 * con prudente). Sin contar relanzamientos ni jackpot.
 */
export function ghostChoiceFor(dice: DiceState, profileIndex = dice.helper.profile): HelperChoice<DiceTarget> | null {
  const unlocked = Math.min(dice.upgrades.helperProfile, D.helper.profiles.length - 1);
  const profile = D.helper.profiles[Math.min(Math.max(profileIndex, 0), unlocked)];
  const bonus = ghostLuckBonus(dice.upgrades.helperLuck);
  const ceiling = diceCeiling(dice);
  const interval = ghostInterval(dice.upgrades.helperSpeed);
  // Cargas por apuesta: las que se recargan más las que hay, repartidas en la ventana de riesgo.
  const perBet = interval / rerollInterval(dice.upgrades.luck) + (dice.rerolls.charges * interval) / RISK_WINDOW_SECONDS;
  return chooseHelperBet(
    unlockedTargets(dice),
    (t, bet) => {
      const p = targetChance(t, dice.upgrades.luck, bet / ceiling, bonus);
      const covered = Math.min(1, perBet / Math.max(1 - p, 0.01));
      return binaryOutcomes(p + (1 - p) * rerollRescue(t) * covered, CONFIG.dice.targets[t].payout);
    },
    profile,
    { balance: dice.balance, ceiling, minBet: D.bet.minBet, interval },
  );
}

/** Perfil recomendado del camarero para la suerte y el saldo de ahora. */
export function recommendedGhostProfile(dice: DiceState): number {
  return memoRate(
    dice,
    'recommendedGhostProfile',
    stateKey(dice.upgrades, bucket(dice.balance), dice.rerolls.charges, Math.floor(dice.playTime * 2)),
    () => recommendedProfile(Math.min(dice.upgrades.helperProfile, D.helper.profiles.length - 1), (i) => ghostChoiceFor(dice, i)),
  );
}

/** Apuesta del camarero. 0 = espera. */
export function ghostBet(dice: DiceState): number {
  return ghostChoiceFor(dice)?.bet ?? 0;
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
    const choice = ghostChoiceFor(dice);
    if (!choice) {
      dice.helper.timer = Math.max(interval - HELPER_RETRY_SECONDS, 0);
      break;
    }
    const bet = choice.bet;
    dice.helper.timer -= interval;
    const roll = rollDice(
      dice,
      {
        bettor: 'ayudante',
        target: choice.key,
        bet,
        luckBonus: ghostLuckBonus(dice.upgrades.helperLuck),
      },
      rng,
    );
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
// Conversión desde la mesa 2

/** Ingreso esperado por segundo de la mesa 2 jugando sola: su zombi (sin retener). */
export function table2IncomeRate(state: GameState): number {
  return memoRate(
    state.slots,
    'table2IncomeRate',
    stateKey(
      state.slots.upgrades,
      state.slots.helper.profile,
      bucket(state.slots.balance),
      bucket(state.slots.pot),
      Math.floor(state.slots.playTime),
    ),
    () => computeTable2IncomeRate(state),
  );
}

function computeTable2IncomeRate(state: GameState): number {
  const slots = state.slots;
  let rate = 0;
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
  return Math.max(D.conversion.floor, D.conversion.k * Math.sqrt(Math.max(table2IncomeRate(state), 0)));
}

// ---------------------------------------------------------------------------
// Paso del tiempo

export interface DiceTick {
  ghost: DiceRoll[];
}

export function updateDice(state: GameState, dt: number, rng: Rng): DiceTick {
  if (!isDiceUnlocked(state) || dt <= 0) return { ghost: [] };
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
  const ghost = updateGhost(dice, dt, rng);
  return { ghost };
}
