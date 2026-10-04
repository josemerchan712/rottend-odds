import { CONFIG, CARD_UPGRADE_IDS, type CardUpgradeId } from '../config';
import type { Bettor } from '../state';

/**
 * Una carta: 0-51. rango = c % 13 (0 = as, 1-8 = 2-9, 9 = 10, 10 = J, 11 = Q, 12 = K) y
 * palo = floor(c / 13) (0 picas, 1 corazones, 2 diamantes, 3 tréboles).
 */
export type Card = number;

export type HandResult = 'gana' | 'pierde' | 'empate';

/** Una mano de blackjack (del jugador o del esqueleto). */
export interface CardHand {
  bettor: Bettor;
  bet: number;
  player: Card[];
  dealer: Card[];
  /** Lo que queda de la baraja (se baraja en cada mano). */
  deck: Card[];
  /** Intensidad de la baraja: > 0 favorece al jugador, < 0 a la banca. */
  rig: number;
  /** Probabilidad de ganar con la que se jugó (de la tabla, con estrategia básica). */
  winChance: number;
  /** Un 7 esperando arriba de la baraja para el jugador (la mano del jackpot). */
  stackedSeven: Card | null;
  /** 'jugando': decide el jugador; 'pasado': se ha pasado y puede descartar; 'fin': resuelta. */
  status: 'jugando' | 'pasado' | 'fin';
  /** Si la última carta del jugador se puede descartar (acaba de recibirla). */
  canDiscard: boolean;
  discards: number;
  result: HandResult | null;
  /** Cambio neto del saldo (apuesta incluida). */
  delta: number;
  jackpot: number;
  jackpotCapped: boolean;
}

/** Estado de la mesa 4. Datos planos, serializables. */
export interface CardsState {
  /** Fichas negras. Nunca baja de 0. */
  balance: number;
  playTime: number;
  upgrades: Record<CardUpgradeId, number>;
  betFractionIndex: number;
  /** La mano del jugador en curso (o la última resuelta, para enseñarla), o null. */
  hand: CardHand | null;
  /** Cargas de descarte (reserva común con el ayudante) y tiempo hacia la siguiente. */
  discards: { charges: number; timer: number };
  helper: { timer: number; profile: number };
  pot: number;
  passiveCarry: number;
  /** Manos recientes ya resueltas (la última primero). */
  recentHands: CardHand[];
  debtPaid: boolean;
  visited: boolean;
  stats: {
    hands: number;
    wins: number;
    pushes: number;
    discards: number;
    jackpots: number;
    jackpotsCapped: number;
    passiveEarned: number;
  };
}

export function createCardsState(): CardsState {
  return {
    balance: 0,
    playTime: 0,
    upgrades: Object.fromEntries(CARD_UPGRADE_IDS.map((id) => [id, 0])) as Record<CardUpgradeId, number>,
    betFractionIndex: 1,
    hand: null,
    discards: { charges: CONFIG.cards.discards.base, timer: 0 },
    helper: { timer: 0, profile: 0 },
    pot: CONFIG.cards.jackpot.potSeed,
    passiveCarry: 0,
    recentHands: [],
    debtPaid: false,
    visited: false,
    stats: { hands: 0, wins: 0, pushes: 0, discards: 0, jackpots: 0, jackpotsCapped: 0, passiveEarned: 0 },
  };
}
