import { selectorChips, type SelectorChip } from '../betting';
import { CONFIG } from '../config';
import type { Rng } from '../rng';
import type { Bettor } from '../state';
import { RIG_TABLE } from './rigTable';
import { basicHit, cardValue, compareHands, drawCard, handTotal, isBust, isSeven, playDealer, rank, shuffledDeck } from './rules';
import type { Card, CardHand, CardsState } from './state';

/**
 * El blackjack de la Crupier (lógica pura). La suerte no decide el resultado de antemano: elige la
 * intensidad con la que la baraja favorece al jugador (o a la banca), y el jugador sigue decidiendo
 * pedir, plantarse y descartar con cartas reales.
 */
const K = CONFIG.cards;

// ---------------------------------------------------------------------------
// Suerte → probabilidad de ganar → intensidad de la baraja

/** Probabilidad de ganar con la baraja honrada y estrategia básica. */
export const HONEST_WIN = interpolate(0, 'win');

function interpolate(rig: number, field: 'win' | 'push'): number {
  const t = RIG_TABLE;
  if (rig <= t[0].rig) return t[0][field];
  if (rig >= t[t.length - 1].rig) return t[t.length - 1][field];
  let i = 0;
  while (t[i + 1].rig < rig) i++;
  const k = (rig - t[i].rig) / (t[i + 1].rig - t[i].rig);
  return t[i][field] + (t[i + 1][field] - t[i][field]) * k;
}

/** La intensidad que da esa probabilidad de ganar (la tabla es creciente). */
export function rigForWinChance(p: number): number {
  const t = RIG_TABLE;
  if (p <= t[0].win) return t[0].rig;
  if (p >= t[t.length - 1].win) return t[t.length - 1].rig;
  let i = 0;
  while (t[i + 1].win < p) i++;
  const k = (p - t[i].win) / Math.max(t[i + 1].win - t[i].win, 1e-9);
  return t[i].rig + (t[i + 1].rig - t[i].rig) * k;
}

export function cardsLuckProgress(level: number): number {
  const max = K.upgrades.luck.maxLevel;
  return (Math.min(Math.max(level, 0), max) / max) ** K.luck.curveExponent;
}

/** Probabilidad de ganar una mano con la suerte (estrategia básica, sin penalización). */
export function cardsLuckChance(level: number): number {
  return Math.min(HONEST_WIN + (K.luck.cap - HONEST_WIN) * cardsLuckProgress(level), K.luck.cap);
}

export function cardsPenalty(fraction: number, luckLevel: number): number {
  const L = cardsLuckProgress(luckLevel);
  const factor = K.risk.penaltyFactorAtMinLuck + (K.risk.penaltyFactorAtMaxLuck - K.risk.penaltyFactorAtMinLuck) * L;
  return factor * Math.min(Math.max(fraction, 0), 1) ** K.risk.penaltyExponent;
}

/** Probabilidad de ganar con la suerte, un bonus propio y la penalización por la fracción del techo. */
export function cardsWinChance(luckLevel: number, fraction: number, bonus = 0): number {
  const p = Math.min(cardsLuckChance(luckLevel) + bonus, K.luck.cap) - cardsPenalty(fraction, luckLevel);
  return Math.max(p, RIG_TABLE[0].win);
}

/** Probabilidad de empatar con esa probabilidad de ganar (de la tabla). */
export function pushChanceFor(winChance: number): number {
  return interpolate(rigForWinChance(winChance), 'push');
}

/** Valor esperado neto de una mano con estrategia básica (sin descartes ni jackpot). */
export function cardsExpectedValue(bet: number, ceiling: number, luckLevel: number, bonus = 0): number {
  const p = cardsWinChance(luckLevel, bet / ceiling, bonus);
  const push = pushChanceFor(p);
  return bet * (p - (1 - p - push));
}

export function cardsJackpotChance(luckLevel: number, jackpotLevel: number): number {
  const level = Math.min(Math.max(jackpotLevel, 0), K.upgrades.jackpot.maxLevel);
  const j = K.jackpot.baseChance + K.jackpot.luckBonusMax * cardsLuckProgress(luckLevel) + K.jackpot.upgradeBonusPerLevel * level;
  return Math.min(j, K.jackpot.maxChance);
}

export const CARDS_JACKPOT_CAP = K.debt.amount * K.jackpot.payoutCapDebtFraction;

export function cardsJackpotPayout(bet: number, pot: number): { gain: number; capped: boolean } {
  const raw = bet * K.jackpot.payoutMultiplier;
  const limit = Math.min(Math.max(pot, 0), CARDS_JACKPOT_CAP);
  return raw > limit ? { gain: Math.floor(limit), capped: true } : { gain: raw, capped: false };
}

export function cardsMaxBet(level: number): number {
  return Math.floor(K.bet.baseMaxBet * K.bet.maxBetMultiplierPerLevel ** level);
}

export function cardsCeiling(cards: CardsState): number {
  return cardsMaxBet(cards.upgrades.maxBet);
}

export function cardsChips(cards: CardsState): SelectorChip[] {
  return selectorChips(cards.balance, cardsCeiling(cards));
}

export function selectedCardsChip(cards: CardsState): SelectorChip {
  const chips = cardsChips(cards);
  const below = chips.filter((c) => c.index <= cards.betFractionIndex);
  return below[below.length - 1] ?? chips[0];
}

export function selectCardsChip(cards: CardsState, index: number): boolean {
  if (index < 0 || index >= CONFIG.bet.quickFractions.length) return false;
  cards.betFractionIndex = index;
  return true;
}

// ---------------------------------------------------------------------------
// Descartes

export function maxDiscards(luckLevel: number): number {
  return K.discards.base + Math.floor(Math.max(luckLevel, 0) / K.discards.perLevels);
}

export function discardInterval(luckLevel: number): number {
  return K.discards.rechargeSeconds * K.discards.rechargeFactor ** Math.max(luckLevel, 0);
}

export function updateDiscards(cards: CardsState, dt: number): void {
  const max = maxDiscards(cards.upgrades.luck);
  const d = cards.discards;
  if (d.charges >= max) {
    d.charges = max;
    d.timer = 0;
    return;
  }
  d.timer += dt;
  const interval = discardInterval(cards.upgrades.luck);
  while (d.timer >= interval && d.charges < max) {
    d.timer -= interval;
    d.charges++;
  }
  if (d.charges >= max) d.timer = 0;
}

// ---------------------------------------------------------------------------
// La mano

export interface DealRequest {
  bettor: Bettor;
  bet: number;
  luckBonus?: number;
}

/** ¿Hay una mano del jugador sin terminar? */
export function handInPlay(cards: CardsState): boolean {
  return cards.hand !== null && cards.hand.status !== 'fin';
}

function playerDraw(hand: CardHand, rng: Rng, rig = hand.rig): Card {
  if (hand.stackedSeven !== null) {
    const seven = hand.stackedSeven;
    hand.stackedSeven = null;
    return seven;
  }
  return drawCard(hand.deck, 'jugador', hand.player, hand.dealer, rig, K.dealerStands, rng);
}

/**
 * Reparte una mano: cobra la apuesta, fija la intensidad de la baraja según la suerte y la
 * apuesta, y reparte dos cartas a cada uno (una de la banca boca abajo). Con probabilidad j la
 * baraja trae 7-7 al jugador y otro 7 arriba (la mano del jackpot: hay que pedir con 14).
 * Devuelve null si no hay fichas o si ya hay una mano del jugador en juego.
 */
export function dealHand(cards: CardsState, req: DealRequest, rng: Rng): CardHand | null {
  const bet = Math.floor(req.bet);
  if (bet < K.bet.minBet || cards.balance < bet) return null;
  if (req.bettor === 'jugador' && handInPlay(cards)) return null;
  cards.balance -= bet;
  cards.pot = Math.min(cards.pot + bet * K.jackpot.potContribution, CARDS_JACKPOT_CAP);
  const p = cardsWinChance(cards.upgrades.luck, bet / cardsCeiling(cards), req.luckBonus ?? 0);
  const hand: CardHand = {
    bettor: req.bettor,
    bet,
    player: [],
    dealer: [],
    deck: shuffledDeck(rng),
    rig: rigForWinChance(p),
    winChance: p,
    stackedSeven: null,
    status: 'jugando',
    canDiscard: false,
    discards: 0,
    result: null,
    delta: -bet,
    jackpot: 0,
    jackpotCapped: false,
  };
  if (rng() < cardsJackpotChance(cards.upgrades.luck, cards.upgrades.jackpot)) {
    // Tres sietes: dos para el jugador ahora y uno esperando para cuando pida.
    const sevens = hand.deck.filter(isSeven).slice(0, 3);
    hand.deck = hand.deck.filter((c) => !sevens.includes(c));
    hand.player.push(sevens[0]);
    hand.dealer.push(drawCard(hand.deck, 'banca', hand.player, hand.dealer, hand.rig, K.dealerStands, rng));
    hand.player.push(sevens[1]);
    hand.stackedSeven = sevens[2];
  } else {
    hand.player.push(playerDraw(hand, rng));
    hand.dealer.push(drawCard(hand.deck, 'banca', hand.player, hand.dealer, hand.rig, K.dealerStands, rng));
    hand.player.push(playerDraw(hand, rng));
  }
  hand.dealer.push(drawCard(hand.deck, 'banca', hand.player, hand.dealer, hand.rig, K.dealerStands, rng));
  hand.canDiscard = true;
  cards.stats.hands++;
  if (req.bettor === 'jugador') cards.hand = hand;
  // Con 21 de salida se planta sola (si no quiere descartar, que no tendría sentido).
  if (handTotal(hand.player).total === 21) stand(cards, hand, rng);
  return hand;
}

/** Pide carta. Si se pasa y quedan descartes, la mano espera (descartar o aceptar). */
export function hit(cards: CardsState, hand: CardHand, rng: Rng): boolean {
  if (hand.status !== 'jugando') return false;
  hand.player.push(playerDraw(hand, rng));
  hand.canDiscard = true;
  afterPlayerCard(cards, hand, rng);
  return true;
}

function afterPlayerCard(cards: CardsState, hand: CardHand, rng: Rng): void {
  const total = handTotal(hand.player).total;
  if (total > 21) {
    if (cards.discards.charges > 0) hand.status = 'pasado';
    else resolve(cards, hand);
  } else if (total === 21) stand(cards, hand, rng);
}

/**
 * Descarta la última carta recibida y recibe otra (gasta una carga). Se puede justo después de
 * recibirla, también si te has pasado.
 */
export function discard(cards: CardsState, hand: CardHand, rng: Rng): boolean {
  if (hand.status === 'fin' || !hand.canDiscard || cards.discards.charges <= 0 || hand.player.length === 0) return false;
  cards.discards.charges--;
  cards.stats.discards++;
  hand.discards++;
  hand.player.pop();
  hand.status = 'jugando';
  // La sustituta se elige con una candidata más, y nunca a favor de la banca.
  hand.player.push(playerDraw(hand, rng, Math.max(hand.rig, 0) + K.discards.extraCandidates));
  hand.canDiscard = true;
  afterPlayerCard(cards, hand, rng);
  return true;
}

/** Acepta haberse pasado (sin descartar). */
export function acceptBust(cards: CardsState, hand: CardHand): void {
  if (hand.status === 'pasado') resolve(cards, hand);
}

/** Se planta: la banca destapa y pide hasta 17; se resuelve. */
export function stand(cards: CardsState, hand: CardHand, rng: Rng): void {
  if (hand.status !== 'jugando') return;
  playDealer(hand.deck, hand.player, hand.dealer, hand.rig, K.dealerStands, rng);
  resolve(cards, hand);
}

/** ¿Es 21 con tres sietes? */
export function isTripleSeven(player: readonly Card[]): boolean {
  return player.length === 3 && player.every(isSeven);
}

function resolve(cards: CardsState, hand: CardHand): void {
  hand.status = 'fin';
  hand.canDiscard = false;
  hand.stackedSeven = null;
  const result = compareHands(hand.player, hand.dealer);
  hand.result = result;
  if (result === 'gana') {
    cards.balance += hand.bet * 2;
    hand.delta = hand.bet;
    cards.stats.wins++;
  } else if (result === 'empate') {
    cards.balance += hand.bet;
    hand.delta = 0;
    cards.stats.pushes++;
  }
  if (isTripleSeven(hand.player)) {
    const { gain, capped } = cardsJackpotPayout(hand.bet, cards.pot);
    cards.balance += gain;
    hand.delta += gain;
    hand.jackpot = gain;
    hand.jackpotCapped = capped;
    cards.pot = K.jackpot.potSeed;
    cards.stats.jackpots++;
    if (capped) cards.stats.jackpotsCapped++;
  }
  hand.deck = [];
  cards.recentHands.unshift(hand);
  cards.recentHands.length = Math.min(cards.recentHands.length, CONFIG.tech.recentSpins);
}

/** El jugador reparte con la ficha elegida. */
export function playerDeal(cards: CardsState, rng: Rng): CardHand | null {
  const chip = selectedCardsChip(cards);
  if (!chip.affordable) return null;
  return dealHand(cards, { bettor: 'jugador', bet: chip.amount }, rng);
}

// ---------------------------------------------------------------------------
// Decisiones sencillas (el ayudante y la simulación)

/**
 * Estrategia básica con dos retoques: con 7-7 pide (si la baraja trae el tercer 7, es el jackpot) y
 * con la mano ya hecha no pide.
 */
export function simpleHit(hand: CardHand): boolean {
  if (hand.player.length === 2 && hand.player.every(isSeven)) return true;
  return basicHit(hand.player, cardValue(hand.dealer[0]));
}

/**
 * ¿Descartar la última carta? Si me ha pasado; o si me deja en 12-16 duro y la banca enseña 7 o más
 * (o tengo todas las cargas: no tiene sentido desperdiciar la recarga).
 */
export function simpleDiscard(hand: CardHand, charges: number, maxCharges: number): boolean {
  if (!hand.canDiscard || charges <= 0) return false;
  if (isBust(hand.player)) return true;
  const { total, soft } = handTotal(hand.player);
  const up = cardValue(hand.dealer[0]);
  return !soft && total >= 12 && total <= 16 && (up >= 7 || up === 1 || charges >= maxCharges);
}

/**
 * Juega una mano entera con las decisiones sencillas (el ayudante): estrategia básica, y descarta
 * solo si se ha pasado y quedan al menos 2 cargas (deja una para el jugador).
 */
export function playHandAuto(cards: CardsState, hand: CardHand, rng: Rng): void {
  let guard = 0;
  while (hand.status !== 'fin' && guard++ < 30) {
    if (hand.status === 'pasado' && cards.discards.charges >= 2 && discard(cards, hand, rng)) continue;
    if (hand.status === 'pasado') {
      acceptBust(cards, hand);
      break;
    }
    if (simpleHit(hand)) {
      hit(cards, hand, rng);
      continue;
    }
    stand(cards, hand, rng);
  }
}

/** Rango de una carta para la interfaz (A, 2-10, J, Q, K). */
export function cardLabel(card: Card): string {
  return ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][rank(card)];
}
