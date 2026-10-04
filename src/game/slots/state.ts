import { CONFIG, SLOT_UPGRADE_IDS, type SlotUpgradeId } from '../config';
import type { Bettor } from '../state';

/** Tres carretes: índices en CONFIG.slots.symbols. */
export type Reels = [number, number, number];

export type SlotOutcome = 'nada' | 'pareja' | 'trio' | 'jackpot';

/** Resultado de una tirada de la tragaperras. */
export interface SlotSpin {
  bettor: Bettor;
  bet: number;
  /** Extra pagado por retener un carrete (0 si no se retuvo). */
  holdFee: number;
  /** Carrete retenido (0-2) o null. */
  held: number | null;
  reels: Reels;
  outcome: SlotOutcome;
  /** Probabilidad de premio con la que se jugó (con la retención, si la hubo). */
  winChance: number;
  /** Cambio neto del saldo (apuesta y extra incluidos). */
  delta: number;
  jackpotCapped: boolean;
}

/** Estado de la mesa 2. Datos planos, serializables. */
export interface SlotsState {
  /** Monedas. Nunca baja de 0. */
  balance: number;
  /** Segundos jugados desde que se desbloqueó la mesa. */
  playTime: number;
  upgrades: Record<SlotUpgradeId, number>;
  /** Ficha elegida del selector (índice en CONFIG.bet.quickFractions). */
  betFractionIndex: number;
  /** Lo que muestran los carretes de la máquina del jugador (para retener uno). */
  reels: Reels;
  /** Carrete que el jugador quiere retener en la siguiente tirada, o null. */
  hold: number | null;
  helper: { timer: number; profile: number; reels: Reels };
  /** Pozo del jackpot: lo máximo que puede pagar ahora (además del x1000 y del tope). */
  pot: number;
  /** Fracción de moneda pendiente de la conversión (se suma entera al saldo). */
  passiveCarry: number;
  recentSpins: SlotSpin[];
  debtPaid: boolean;
  /** Si el jugador ya ha entrado alguna vez (para la bienvenida de la Tragaperras viviente). */
  visited: boolean;
  stats: {
    spins: number;
    wins: number;
    jackpots: number;
    jackpotsCapped: number;
    holds: number;
    passiveEarned: number;
  };
}

export function createSlotsState(): SlotsState {
  return {
    balance: 0,
    playTime: 0,
    upgrades: Object.fromEntries(SLOT_UPGRADE_IDS.map((id) => [id, 0])) as Record<SlotUpgradeId, number>,
    betFractionIndex: 1,
    reels: [0, 1, 3],
    hold: null,
    helper: { timer: 0, profile: 0, reels: [4, 5, 0] },
    pot: CONFIG.slots.jackpot.potSeed,
    passiveCarry: 0,
    recentSpins: [],
    debtPaid: false,
    visited: false,
    stats: { spins: 0, wins: 0, jackpots: 0, jackpotsCapped: 0, holds: 0, passiveEarned: 0 },
  };
}
