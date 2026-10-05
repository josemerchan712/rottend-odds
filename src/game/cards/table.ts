import { CONFIG, type CardUpgradeId } from '../config';
import { diceCeiling, targetExpectedValue } from '../dice/game';
import { ghostChoiceFor, ghostInterval, ghostLuckBonus, hasGhost } from '../dice/table';
import {
  binaryOutcomes,
  bucket,
  chooseHelperBet,
  memoRate,
  stateKey,
  HELPER_RETRY_SECONDS,
  recommendedProfile,
  type HelperChoice,
} from '../helperPolicy';
import type { LenderPhase } from '../lender';
import type { Rng } from '../rng';
import type { GameState } from '../state';
import { cardsCeiling, cardsWinChance, dealHand, playHandAuto, pushChanceFor, updateDiscards } from './game';
import type { CardHand, CardsState } from './state';

/**
 * El resto de la mesa 4 (lógica pura): desbloqueo y deuda, mejoras, ayudante (el esqueleto
 * barajador), conversión desde la mesa 3 y el paso del tiempo. Sin trastienda.
 */
const K = CONFIG.cards;

export function isCardsUnlocked(state: GameState): boolean {
  return state.debtPaid && state.slots.debtPaid && state.dice.debtPaid;
}

export function cardsDebtProgress(cards: CardsState): number {
  return cards.debtPaid ? 1 : Math.min(cards.balance / K.debt.amount, 1);
}

export function canPayCardsDebt(cards: CardsState): boolean {
  return !cards.debtPaid && cards.balance >= K.debt.amount;
}

export function payCardsDebt(cards: CardsState): boolean {
  if (!canPayCardsDebt(cards)) return false;
  cards.balance -= K.debt.amount;
  cards.debtPaid = true;
  return true;
}

export function cardsLenderPhase(cards: CardsState): LenderPhase {
  if (cards.debtPaid) return 'calm';
  const progress = cardsDebtProgress(cards);
  const [uneasyFrom, deformedFrom] = CONFIG.lender.phaseThresholds;
  if (progress >= deformedFrom) return 'deformed';
  if (progress >= uneasyFrom) return 'uneasy';
  return 'calm';
}

// ---------------------------------------------------------------------------
// Mejoras

const NEEDS_SKELETON: readonly CardUpgradeId[] = ['helperSpeed', 'helperProfile', 'helperLuck'];

export function cardsUpgradeCost(id: CardUpgradeId, level: number): number {
  const def = K.upgrades[id];
  return Math.round(def.baseCost * def.growth ** level);
}

export function isCardsMaxed(cards: CardsState, id: CardUpgradeId): boolean {
  return cards.upgrades[id] >= K.upgrades[id].maxLevel;
}

export function isCardsUpgradeUnlocked(cards: CardsState, id: CardUpgradeId): boolean {
  return !NEEDS_SKELETON.includes(id) || cards.upgrades.skeleton > 0;
}

export function cardsNextCost(cards: CardsState, id: CardUpgradeId): number | null {
  return isCardsMaxed(cards, id) ? null : cardsUpgradeCost(id, cards.upgrades[id]);
}

export function canBuyCards(cards: CardsState, id: CardUpgradeId): boolean {
  const cost = cardsNextCost(cards, id);
  return cost !== null && isCardsUpgradeUnlocked(cards, id) && cards.balance >= cost;
}

export function buyCardsUpgrade(cards: CardsState, id: CardUpgradeId): boolean {
  if (!canBuyCards(cards, id)) return false;
  cards.balance -= cardsUpgradeCost(id, cards.upgrades[id]);
  cards.upgrades[id]++;
  if (id === 'helperProfile') cards.helper.profile = cards.upgrades.helperProfile;
  return true;
}

// ---------------------------------------------------------------------------
// Ayudante: el esqueleto barajador

export function hasSkeleton(cards: CardsState): boolean {
  return cards.upgrades.skeleton > 0;
}

export function skeletonInterval(speedLevel: number): number {
  return K.helper.baseInterval * (1 - K.helper.speedReductionPerLevel) ** speedLevel;
}

export function skeletonLuckBonus(level: number): number {
  return K.helper.luckPerLevel * level;
}

export function skeletonProfile(cards: CardsState) {
  const unlocked = Math.min(cards.upgrades.helperProfile, K.helper.profiles.length - 1);
  return K.helper.profiles[Math.min(Math.max(cards.helper.profile, 0), unlocked)];
}

export function selectSkeletonProfile(cards: CardsState, index: number): boolean {
  if (index < 0 || index > cards.upgrades.helperProfile || index >= K.helper.profiles.length) return false;
  cards.helper.profile = index;
  return true;
}

/**
 * Fracción de Kelly de una apuesta a la par con empates: f* = (p − q) / (p + q), con q = pérdida.
 * Negativa si la mano tiene valor esperado negativo.
 */
export function kellyFraction(win: number, push: number): number {
  const lose = 1 - win - push;
  return win + lose > 0 ? (win - lose) / (win + lose) : 0;
}

/**
 * Apuesta del esqueleto (criterio de crecimiento): lo menor entre su fracción del techo, su máximo
 * del saldo y `kelly` veces la fracción de Kelly del saldo. Si la mano no tiene valor esperado
 * positivo, espera (0).
 */
export function skeletonChoiceFor(cards: CardsState, profileIndex = cards.helper.profile): HelperChoice<'hand'> | null {
  const unlocked = Math.min(cards.upgrades.helperProfile, K.helper.profiles.length - 1);
  const profile = K.helper.profiles[Math.min(Math.max(profileIndex, 0), unlocked)];
  const ceiling = cardsCeiling(cards);
  const bonus = skeletonLuckBonus(cards.upgrades.helperLuck);
  return chooseHelperBet(
    ['hand'] as const,
    (_, bet) => {
      const win = cardsWinChance(cards.upgrades.luck, bet / ceiling, bonus);
      return binaryOutcomes(win, 1, pushChanceFor(win));
    },
    profile,
    {
      balance: cards.balance,
      ceiling,
      minBet: K.bet.minBet,
      interval: skeletonInterval(cards.upgrades.helperSpeed),
    },
  );
}

/** Perfil recomendado del esqueleto para la suerte y el saldo de ahora. */
export function recommendedSkeletonProfile(cards: CardsState): number {
  return memoRate(
    cards,
    'recommendedSkeletonProfile',
    stateKey(cards.upgrades, bucket(cards.balance), Math.floor(cards.playTime * 2)),
    () => recommendedProfile(Math.min(cards.upgrades.helperProfile, K.helper.profiles.length - 1), (i) => skeletonChoiceFor(cards, i)),
  );
}

/** Apuesta del esqueleto. 0 = espera. */
export function skeletonBet(cards: CardsState): number {
  return skeletonChoiceFor(cards)?.bet ?? 0;
}

/** El esqueleto juega cuando le toca: estrategia básica, descarta si se pasa (reserva común). */
export function updateSkeleton(cards: CardsState, dt: number, rng: Rng): CardHand[] {
  if (!hasSkeleton(cards)) return [];
  const hands: CardHand[] = [];
  const interval = skeletonInterval(cards.upgrades.helperSpeed);
  cards.helper.timer += dt;
  while (cards.helper.timer >= interval) {
    const bet = skeletonBet(cards);
    if (bet <= 0) {
      cards.helper.timer = Math.max(interval - HELPER_RETRY_SECONDS, 0);
      break;
    }
    cards.helper.timer -= interval;
    const hand = dealHand(
      cards,
      {
        bettor: 'ayudante',
        bet,
        luckBonus: skeletonLuckBonus(cards.upgrades.helperLuck),
      },
      rng,
    );
    if (!hand) break;
    playHandAuto(cards, hand, rng);
    hands.push(hand);
  }
  return hands;
}

// ---------------------------------------------------------------------------
// Conversión desde la mesa 3

/** Ingreso esperado por segundo de la mesa 3 jugando sola: su camarero (sin relanzar). */
export function table3IncomeRate(state: GameState): number {
  return memoRate(
    state.dice,
    'table3IncomeRate',
    stateKey(
      state.dice.upgrades,
      state.dice.helper.profile,
      bucket(state.dice.balance),
      state.dice.rerolls.charges,
      Math.floor(state.dice.playTime),
    ),
    () => computeTable3IncomeRate(state),
  );
}

function computeTable3IncomeRate(state: GameState): number {
  const dice = state.dice;
  let rate = 0;
  if (hasGhost(dice)) {
    const choice = ghostChoiceFor(dice);
    const bet = choice?.bet ?? 0;
    if (bet > 0) {
      const ev = targetExpectedValue(choice!.key, bet, diceCeiling(dice), dice.upgrades.luck, ghostLuckBonus(dice.upgrades.helperLuck));
      rate += Math.max(ev, 0) / ghostInterval(dice.upgrades.helperSpeed);
    }
  }
  return rate;
}

export function cardsPassiveRate(state: GameState): number {
  return Math.max(K.conversion.floor, K.conversion.k * Math.sqrt(Math.max(table3IncomeRate(state), 0)));
}

// ---------------------------------------------------------------------------
// Paso del tiempo

export interface CardsTick {
  skeleton: CardHand[];
}

export function updateCards(state: GameState, dt: number, rng: Rng): CardsTick {
  if (!isCardsUnlocked(state) || dt <= 0) return { skeleton: [] };
  const cards = state.cards;
  cards.playTime += dt;
  cards.passiveCarry += cardsPassiveRate(state) * dt;
  const whole = Math.floor(cards.passiveCarry);
  if (whole > 0) {
    cards.passiveCarry -= whole;
    cards.balance += whole;
    cards.stats.passiveEarned += whole;
  }
  updateDiscards(cards, dt);
  const skeleton = updateSkeleton(cards, dt, rng);
  return { skeleton };
}
