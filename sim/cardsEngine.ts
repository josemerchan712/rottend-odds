import { CARD_UPGRADE_IDS, CONFIG, type CardUpgradeId } from '../src/game/config';
import { seededRng, type Rng } from '../src/game/rng';
import { payDiceDebt } from '../src/game/dice/table';
import {
  acceptBust,
  cardsCeiling,
  cardsChips,
  cardsWinChance,
  dealHand,
  discard,
  hit,
  maxDiscards,
  pushChanceFor,
  simpleDiscard,
  simpleHit,
  stand,
} from '../src/game/cards/game';
import { handTotal } from '../src/game/cards/rules';
import {
  buyCardsUpgrade,
  canBuyCards,
  cardsItemValue,
  cardsNextCost,
  cardsPassiveRate,
  collectCardsItem,
  selectSkeletonProfile,
  skeletonLuckBonus,
} from '../src/game/cards/table';
import type { CardHand } from '../src/game/cards/state';
import type { GameState } from '../src/game/state';
import { updateGame } from '../src/game/update';
import { DEFAULT_PLAYER, phaseOf, type Phase, type PlayerModel } from './engine';
import { DICE_STRATEGIES, runDice } from './diceEngine';

/**
 * Simulación de la mesa 4: empieza al pagar la deuda de la mesa 3 (estado real de una partida (d)
 * de la mesa 3, que viene de una (d) de la mesa 2 y una (c) de la mesa 1, misma semilla) y juega al
 * blackjack hasta reunir 10M de fichas negras. Las mesas 1-3 siguen solas; la 3 alimenta la conversión.
 * Cada decisión (repartir, pedir, plantarse, descartar, aceptar) gasta una acción del jugador (0,5 s)
 * y entre manos pasa como mínimo betInterval (lo que tarda la banca en destapar y pagar).
 */
export interface CardsStrategy {
  id: string;
  label: string;
  /** Ficha con la que repartir, o null para no jugar. */
  chooseChip(state: GameState): number | null;
  /** ¿Pedir? */
  wantsHit(hand: CardHand, state: GameState): boolean;
  /** ¿Descartar la última carta? */
  wantsDiscard(hand: CardHand, state: GameState): boolean;
  skeletonProfile(state: GameState): number;
  buys(id: CardUpgradeId, state: GameState): boolean;
  reserve(state: GameState): number;
  priority?: readonly CardUpgradeId[];
}

export interface CardsRunResult {
  finished: boolean;
  time: number;
  previousTime: number;
  luckMaxTime: number | null;
  phaseStart: Record<Phase, number | null>;
  bankruptcies: Record<Phase, number>;
  reachedPhase: Record<Phase, boolean>;
  earned: { work: number; cards: number; jackpot: number; passive: number };
  hands: { player: number; helper: number; wins: number; pushes: number };
  discards: number;
  jackpots: number;
  helper: Record<Phase, { bets: number; delta: number; staked: number; bankruptcies: number }>;
  passive: { start: number; end: number };
}

const SIDE: readonly CardUpgradeId[] = ['helperLuck', 'jackpot'];
const SIDE_BUDGET = 0.25;
const startCache = new Map<number, { state: GameState; time: number }>();

export function table3Start(seed: number): { state: GameState; time: number } {
  let cached = startCache.get(seed);
  if (!cached) {
    const d = DICE_STRATEGIES.find((s) => s.id === 'd')!;
    const run = runDice(d, seed);
    payDiceDebt(run.finalState.dice);
    cached = { state: run.finalState, time: run.previousTime + run.time };
    startCache.set(seed, cached);
  }
  return { state: structuredClone(cached.state), time: cached.time };
}

export function runCards(strategy: CardsStrategy, seed: number, player: PlayerModel = DEFAULT_PLAYER): CardsRunResult {
  const start = table3Start(seed);
  const state = start.state;
  state.activeTable = 4;
  const cards = state.cards;
  const rng: Rng = seededRng(seed * 15485863 + 11);
  const empty = () => ({ bets: 0, delta: 0, staked: 0, bankruptcies: 0 });
  const result: CardsRunResult = {
    finished: false,
    time: 0,
    previousTime: start.time,
    luckMaxTime: null,
    phaseStart: { inicio: 0, media: null, alta: null, final: null },
    bankruptcies: { inicio: 0, media: 0, alta: 0, final: 0 },
    reachedPhase: { inicio: true, media: false, alta: false, final: false },
    earned: { work: 0, cards: 0, jackpot: 0, passive: 0 },
    hands: { player: 0, helper: 0, wins: 0, pushes: 0 },
    discards: 0,
    jackpots: 0,
    helper: { inicio: empty(), media: empty(), alta: empty(), final: empty() },
    passive: { start: cardsPassiveRate(state), end: 0 },
  };

  let actionTimer = 0;
  let sinceHand = player.betInterval;
  let room: 'casino' | 'trastienda' = 'casino';
  let switchLeft = 0;
  let seenHands = 0;
  let jackpotTotal = 0;
  let spent = 0;
  const startBalance = cards.balance;
  const goTo = (next: typeof room) => {
    room = next;
    switchLeft = player.roomSwitchSeconds;
  };

  /** Contabiliza las manos resueltas nuevas. */
  const record = () => {
    const total = cards.recentHands.length ? cards.stats.hands : 0;
    void total;
    const phase = phaseOf(cards.upgrades.luck);
    // recentHands guarda las últimas; contamos por el contador de manos resueltas (wins + pushes + pérdidas).
    const resolved = cards.recentHands.filter((h) => !(h as { counted?: boolean }).counted);
    for (const h of resolved.reverse()) {
      (h as { counted?: boolean }).counted = true;
      jackpotTotal += h.jackpot;
      if (h.result === 'gana') result.hands.wins++;
      if (h.result === 'empate') result.hands.pushes++;
      if (h.bettor === 'jugador') result.hands.player++;
      else {
        result.hands.helper++;
        const x = result.helper[phase];
        x.bets++;
        x.delta += h.delta;
        x.staked += h.bet;
      }
    }
    if (resolved.length && cards.balance < CONFIG.cards.bet.minBet && !(cards.hand && cards.hand.status !== 'fin')) {
      result.bankruptcies[phase]++;
      if (resolved[resolved.length - 1]?.bettor === 'ayudante') result.helper[phase].bankruptcies++;
    }
    seenHands = cards.stats.hands;
  };
  void seenHands;

  while (cards.playTime < player.timeLimit) {
    updateGame(state, player.dt, rng);
    record();
    if (cards.balance >= CONFIG.cards.debt.amount) break;

    const handOpen = cards.hand !== null && cards.hand.status !== 'fin';
    if (!handOpen) {
      for (;;) {
        let best: CardUpgradeId | null = strategy.priority?.find((id) => canBuyCards(cards, id) && strategy.buys(id, state)) ?? null;
        if (!best) {
          for (const id of CARD_UPGRADE_IDS) {
            if (!canBuyCards(cards, id) || !strategy.buys(id, state)) continue;
            const cost = cardsNextCost(cards, id)!;
            if (cards.balance - cost < strategy.reserve(state)) continue;
            if (SIDE.includes(id) && cost > cards.balance * SIDE_BUDGET) continue;
            if (best === null || cost < cardsNextCost(cards, best)!) best = id;
          }
        }
        if (best === null) break;
        spent += cardsNextCost(cards, best)!;
        buyCardsUpgrade(cards, best);
        if (best === 'luck') {
          const phase = phaseOf(cards.upgrades.luck);
          result.reachedPhase[phase] = true;
          result.phaseStart[phase] ??= cards.playTime;
          if (cards.upgrades.luck >= CONFIG.cards.upgrades.luck.maxLevel) result.luckMaxTime ??= cards.playTime;
        }
      }
      if (cards.upgrades.skeleton > 0) selectSkeletonProfile(cards, Math.min(strategy.skeletonProfile(state), cards.upgrades.helperProfile));
    }

    sinceHand += player.dt;
    if (switchLeft > 0) {
      switchLeft -= player.dt;
      continue;
    }
    actionTimer += player.dt;
    if (actionTimer < player.actionInterval) continue;
    actionTimer -= player.actionInterval;

    // Mano en juego: una decisión por acción.
    const hand = cards.hand;
    if (hand && hand.status !== 'fin') {
      if (strategy.wantsDiscard(hand, state) && discard(cards, hand, rng)) result.discards++;
      else if (hand.status === 'pasado') acceptBust(cards, hand);
      else if (strategy.wantsHit(hand, state)) hit(cards, hand, rng);
      else stand(cards, hand, rng);
      if ((hand.status as CardHand['status']) === 'fin') sinceHand = 0;
      record();
      continue;
    }

    const chip = strategy.chooseChip(state);
    const items = cards.work.items.length;
    const trashWorthIt = cardsCeiling(cards) <= player.ignoreTrashAboveCeiling;
    if (room === 'casino') {
      if ((trashWorthIt && items >= player.collectAtItems) || (chip === null && items > 0)) {
        goTo('trastienda');
        continue;
      }
    } else {
      if (items > 0 && (trashWorthIt || chip === null)) {
        const top = cards.work.items.reduce((a, b) => (cardsItemValue(cards, b.kind) > cardsItemValue(cards, a.kind) ? b : a));
        collectCardsItem(cards, top.id);
      } else if (chip !== null) goTo('casino');
      continue;
    }
    if (chip !== null && sinceHand >= player.betInterval) {
      const amount = cardsChips(cards).find((c) => c.index === chip);
      if (!amount?.affordable) continue;
      const dealt = dealHand(cards, { bettor: 'jugador', bet: amount.amount }, rng);
      if (dealt && dealt.status === 'fin') sinceHand = 0;
      record();
    }
    if (cards.balance >= CONFIG.cards.debt.amount) break;
  }

  result.time = cards.playTime;
  result.finished = cards.balance >= CONFIG.cards.debt.amount;
  result.passive.end = cardsPassiveRate(state);
  result.discards = cards.stats.discards;
  result.jackpots = cards.stats.jackpots;
  result.earned.work = cards.stats.workEarned;
  result.earned.passive = cards.stats.passiveEarned;
  result.earned.jackpot = jackpotTotal;
  const totalGain = cards.balance - startBalance + spent;
  result.earned.cards = totalGain - result.earned.work - result.earned.passive - result.earned.jackpot;
  return result;
}

// ---------------------------------------------------------------------------
// Estrategias

const TODO = CONFIG.bet.quickFractions.length - 1;

/** Lo que suben (de media) los descartes la probabilidad de ganar una mano, si hay cargas. */
const DISCARD_BOOST = 0.04;

/** Crecimiento logarítmico esperado de una mano con esa apuesta (Kelly, con empates). */
function growth(state: GameState, bet: number, withDiscards = false): number {
  const cards = state.cards;
  const B = cards.balance;
  if (bet <= 0 || bet >= B) return -Infinity;
  let p = cardsWinChance(cards.upgrades.luck, bet / cardsCeiling(cards));
  if (withDiscards && cards.discards.charges > 0) p = Math.min(p + DISCARD_BOOST, 0.99);
  const push = pushChanceFor(p);
  const x = bet / B;
  return p * Math.log1p(x) + (1 - p - push) * Math.log1p(-x);
}

function bestChip(state: GameState, withDiscards = false): number | null {
  let best: { index: number; g: number } | null = null;
  for (const chip of cardsChips(state.cards)) {
    if (!chip.affordable) continue;
    const g = growth(state, chip.amount, withDiscards);
    if (g > (best?.g ?? 0)) best = { index: chip.index, g };
  }
  return best?.index ?? null;
}

function bestSkeletonProfile(state: GameState): number {
  return state.cards.upgrades.helperProfile; // el criterio de Kelly ya limita cada perfil
}

function ceilingIsBinding(state: GameState): boolean {
  const cards = state.cards;
  const p = cardsWinChance(cards.upgrades.luck, 0.5);
  const push = pushChanceFor(p);
  return cards.balance * Math.max(p - (1 - p - push), 0) >= cardsCeiling(cards) * 0.5;
}

const smartBuys = (id: CardUpgradeId, state: GameState) => id !== 'maxBet' || ceilingIsBinding(state);

function smartReserve(state: GameState): number {
  const i = bestChip(state);
  return i === null ? 0 : (cardsChips(state.cards).find((c) => c.index === i)?.amount ?? 0);
}

const basic = (hand: CardHand) => simpleHit(hand);
const noDiscard = () => false;
const smartDiscard = (hand: CardHand, state: GameState) => simpleDiscard(hand, state.cards.discards.charges, maxDiscards(state.cards.upgrades.luck));

export const CARDS_STRATEGIES: CardsStrategy[] = [
  {
    id: 'a',
    label: '(a) Ficha mínima, estrategia básica',
    chooseChip: () => 0,
    wantsHit: basic,
    wantsDiscard: noDiscard,
    skeletonProfile: () => 0,
    buys: () => true,
    reserve: () => 0,
  },
  {
    id: 'b',
    label: '(b) Siempre TODO, estrategia básica',
    chooseChip: () => TODO,
    wantsHit: basic,
    wantsDiscard: noDiscard,
    skeletonProfile: (s) => s.cards.upgrades.helperProfile,
    buys: () => true,
    reserve: (s) => cardsCeiling(s.cards),
  },
  {
    id: 'e',
    label: '(e) Óptima, nunca pide (no se pasa)',
    chooseChip: bestChip,
    wantsHit: (hand) => handTotal(hand.player).total <= 11,
    wantsDiscard: noDiscard,
    skeletonProfile: bestSkeletonProfile,
    buys: smartBuys,
    reserve: smartReserve,
  },
  {
    id: 'c',
    label: '(c) Óptima, estrategia básica, sin descartes',
    chooseChip: bestChip,
    wantsHit: basic,
    wantsDiscard: noDiscard,
    skeletonProfile: bestSkeletonProfile,
    buys: smartBuys,
    reserve: smartReserve,
  },
  {
    id: 'd',
    label: '(d) Óptima, estrategia básica y descartes',
    chooseChip: (s) => bestChip(s, true),
    wantsHit: basic,
    wantsDiscard: smartDiscard,
    skeletonProfile: bestSkeletonProfile,
    buys: smartBuys,
    reserve: smartReserve,
  },
];

export const SKELETON_STUDY: CardsStrategy[] = CONFIG.cards.helper.profiles.map((profile, index) => ({
  id: `s${index}`,
  label: `Esqueleto ${profile.name.toLowerCase()}`,
  chooseChip: bestChip,
  wantsHit: basic,
  wantsDiscard: smartDiscard,
  skeletonProfile: () => index,
  buys: (id: CardUpgradeId, s: GameState) => (id === 'helperProfile' ? s.cards.upgrades.helperProfile < index : smartBuys(id, s)),
  reserve: smartReserve,
  priority: ['skeleton', 'helperProfile'] as const,
}));

void skeletonLuckBonus;
