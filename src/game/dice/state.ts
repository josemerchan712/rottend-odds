import { CONFIG, DICE_UPGRADE_IDS, type DiceTarget, type DiceUpgradeId } from '../config';
import type { Bettor } from '../state';
import { createWorkSlot, type WorkSlot } from '../workCore';

/** Dos dados, de 1 a 6. */
export type Dice = [number, number];

/** Una tirada de la mesa 3. */
export interface DiceRoll {
  bettor: Bettor;
  target: DiceTarget;
  bet: number;
  dice: Dice;
  won: boolean;
  /** Probabilidad de acertar con la que se tiró (sin el relanzamiento). */
  winChance: number;
  /** Cambio neto del saldo (con lo que pague el relanzamiento o el jackpot). */
  delta: number;
  /** Dado relanzado (0-1) o null. */
  rerolled: number | null;
  /** Ganancia del jackpot si esta tirada completó la racha (0 si no). */
  jackpot: number;
  jackpotCapped: boolean;
  /** false mientras el jugador aún puede relanzar un dado (tirada perdida con cargas). */
  final: boolean;
}

/** Estado de la mesa 3. Datos planos, serializables. */
export interface DiceState {
  /** Chapas. Nunca baja de 0. */
  balance: number;
  playTime: number;
  upgrades: Record<DiceUpgradeId, number>;
  betFractionIndex: number;
  /** Objetivo elegido para la siguiente tirada. */
  target: DiceTarget;
  /** Lo que muestran los dados del jugador. */
  dice: Dice;
  /** Dobles seises seguidos del jugador (la racha del jackpot que se ve) y del ayudante. */
  streak: number;
  /** Cargas de relanzamiento (reserva común con el ayudante) y tiempo hacia la siguiente. */
  rerolls: { charges: number; timer: number };
  helper: { timer: number; profile: number; streak: number };
  work: WorkSlot;
  pot: number;
  passiveCarry: number;
  recentRolls: DiceRoll[];
  debtPaid: boolean;
  visited: boolean;
  stats: {
    rolls: number;
    wins: number;
    rerolls: number;
    rerollWins: number;
    jackpots: number;
    jackpotsCapped: number;
    workEarned: number;
    passiveEarned: number;
  };
}

export function createDiceState(): DiceState {
  return {
    balance: 0,
    playTime: 0,
    upgrades: Object.fromEntries(DICE_UPGRADE_IDS.map((id) => [id, 0])) as Record<DiceUpgradeId, number>,
    betFractionIndex: 1,
    target: 'par',
    dice: [3, 4],
    streak: 0,
    rerolls: { charges: CONFIG.dice.rerolls.base, timer: 0 },
    helper: { timer: 0, profile: 0, streak: 0 },
    work: createWorkSlot(CONFIG.dice.work),
    pot: CONFIG.dice.jackpot.potSeed,
    passiveCarry: 0,
    recentRolls: [],
    debtPaid: false,
    visited: false,
    stats: { rolls: 0, wins: 0, rerolls: 0, rerollWins: 0, jackpots: 0, jackpotsCapped: 0, workEarned: 0, passiveEarned: 0 },
  };
}
