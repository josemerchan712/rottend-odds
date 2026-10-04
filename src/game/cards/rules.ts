import type { Rng } from '../rng';
import type { Card } from './state';

/**
 * Reglas del blackjack simplificado (lógica pura): cartas, valor de una mano, estrategia básica de
 * pedir o plantarse y la baraja que favorece. Sin suerte ni configuración: la tabla de calibración
 * (sim/cardsRig.ts) usa esto mismo.
 */

export const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUIT_LABELS = ['♠', '♥', '♦', '♣'];

export function rank(card: Card): number {
  return card % 13;
}

export function suit(card: Card): number {
  return Math.floor(card / 13);
}

/** Valor de una carta: as 1 (o 11 en la mano), figuras 10. */
export function cardValue(card: Card): number {
  const r = rank(card);
  return r === 0 ? 1 : Math.min(r + 1, 10);
}

export function isSeven(card: Card): boolean {
  return rank(card) === 6;
}

/** Total de una mano y si es blanda (un as contando 11). */
export function handTotal(cards: readonly Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardValue(c);
    if (rank(c) === 0) aces++;
  }
  if (aces > 0 && total + 10 <= 21) return { total: total + 10, soft: true };
  return { total, soft: false };
}

export function isBust(cards: readonly Card[]): boolean {
  return handTotal(cards).total > 21;
}

export function isBlackjack(cards: readonly Card[]): boolean {
  return cards.length === 2 && handTotal(cards).total === 21;
}

/** Una baraja nueva barajada (Fisher-Yates). */
export function shuffledDeck(rng: Rng): Card[] {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * Estrategia básica de pedir o plantarse (sin doblar ni dividir, la banca se planta con 17).
 * `dealerUp` = valor de la carta visible de la banca (as = 1). Devuelve true si conviene pedir.
 */
export function basicHit(player: readonly Card[], dealerUp: number): boolean {
  const { total, soft } = handTotal(player);
  const up = dealerUp === 1 ? 11 : dealerUp;
  if (soft) {
    if (total <= 17) return true;
    if (total === 18) return up >= 9;
    return false;
  }
  if (total <= 11) return true;
  if (total === 12) return !(up >= 4 && up <= 6);
  if (total <= 16) return up >= 7;
  return false;
}

/**
 * Cómo de buena es una carta para quien la recibe, si quiere acercarse a 21 sin pasarse: el total
 * resultante (más alto, mejor) o muy malo si se pasa.
 */
function closeTo21(hand: readonly Card[], card: Card): number {
  const t = handTotal([...hand, card]).total;
  return t > 21 ? -100 + (30 - t) : t;
}

/** Cómo de mala es una carta para la banca (más, peor para ella): pasarse; luego quedarse corta. */
function badForDealer(hand: readonly Card[], card: Card, stands: number): number {
  const t = handTotal([...hand, card]).total;
  if (t > 21) return 100;
  if (t >= stands) return 30 - t; // plantada: cuanto más baja, mejor para el jugador
  if (t >= 12) return 40; // tendrá que pedir con riesgo de pasarse
  return 20;
}

export type Recipient = 'jugador' | 'banca';

/**
 * Saca una carta de la baraja. Con intensidad |rig| > 0 se miran varias candidatas (1 + parte
 * entera, y una más con la probabilidad de la parte decimal) y se queda la que más conviene al
 * favorecido: al jugador si rig > 0, a la banca si rig < 0. Con rig = 0 es una baraja honrada.
 */
export function drawCard(deck: Card[], recipient: Recipient, playerHand: readonly Card[], dealerHand: readonly Card[], rig: number, stands: number, rng: Rng): Card {
  const strength = Math.abs(rig);
  let candidates = 1 + Math.floor(strength);
  if (rng() < strength - Math.floor(strength)) candidates++;
  candidates = Math.min(candidates, deck.length);
  if (candidates <= 1) return deck.pop()!;
  // Candidatas: las de arriba de la baraja (ya barajada).
  const options = deck.slice(deck.length - candidates);
  const favorsPlayer = rig > 0;
  const score = (card: Card): number => {
    if (recipient === 'jugador') {
      const good = closeTo21(playerHand, card);
      return favorsPlayer ? good : -good;
    }
    const bad = badForDealer(dealerHand, card, stands);
    return favorsPlayer ? bad : -bad;
  };
  let best = options[0];
  for (const c of options) if (score(c) > score(best)) best = c;
  deck.splice(deck.lastIndexOf(best), 1);
  return best;
}

/** La banca pide hasta llegar a `stands` (también con blando). */
export function playDealer(deck: Card[], player: readonly Card[], dealer: Card[], rig: number, stands: number, rng: Rng): void {
  while (handTotal(dealer).total < stands) dealer.push(drawCard(deck, 'banca', player, dealer, rig, stands, rng));
}

export type Outcome = 'gana' | 'pierde' | 'empate';

/** Resultado de una mano ya terminada. */
export function compareHands(player: readonly Card[], dealer: readonly Card[]): Outcome {
  const p = handTotal(player).total;
  const d = handTotal(dealer).total;
  if (p > 21) return 'pierde';
  if (d > 21) return 'gana';
  if (p > d) return 'gana';
  if (p < d) return 'pierde';
  return 'empate';
}

/** Una mano completa con estrategia básica y sin descartes (para calibrar y para el ayudante). */
export function playBasicHand(rig: number, stands: number, rng: Rng): Outcome {
  const deck = shuffledDeck(rng);
  const player: Card[] = [];
  const dealer: Card[] = [];
  player.push(drawCard(deck, 'jugador', player, dealer, rig, stands, rng));
  dealer.push(drawCard(deck, 'banca', player, dealer, rig, stands, rng));
  player.push(drawCard(deck, 'jugador', player, dealer, rig, stands, rng));
  dealer.push(drawCard(deck, 'banca', player, dealer, rig, stands, rng));
  while (basicHit(player, cardValue(dealer[0])) && !isBust(player)) player.push(drawCard(deck, 'jugador', player, dealer, rig, stands, rng));
  if (isBust(player)) return 'pierde';
  playDealer(deck, player, dealer, rig, stands, rng);
  return compareHands(player, dealer);
}
