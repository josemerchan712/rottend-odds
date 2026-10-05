import { CONFIG, COIN_UPGRADE_IDS, type CoinUpgradeId } from '../config';
import type { Bettor } from '../state';

export type CoinFace = 'cara' | 'cruz';

/**
 * Una cadena de doble o nada: se apuesta una cantidad y se lanza la moneda; con CARA se dobla y se
 * decide retirarse o seguir, con CRUZ se pierde todo (salvo segunda oportunidad).
 */
export interface CoinChain {
  bettor: Bettor;
  /** Lo apostado al empezar. */
  stake: number;
  /** Caras seguidas (0-10). */
  wins: number;
  /** 'decidir': tras una cara, retirarse o seguir. 'fallo': tras una cruz, segunda oportunidad o aceptar. 'fin': resuelta. */
  status: 'decidir' | 'fallo' | 'fin';
  /** Las caras y cruces que han salido, en orden (también las repetidas). */
  faces: CoinFace[];
  /** Probabilidad de cara con la que se lanzó la última vez. */
  lastChance: number;
  /** Segundas oportunidades usadas en esta cadena. */
  seconds: number;
  result: 'retirado' | 'perdido' | 'cadena' | null;
  /** Cambio neto del saldo al resolverse (apuesta incluida, jackpot incluido). */
  delta: number;
  jackpot: number;
  /** Se cobró recortada por el tope de la casa. */
  capped: boolean;
}

/** Estado de la mesa 5. Datos planos, serializables. */
export interface CoinState {
  /** Monedas de oro. Nunca baja de 0. */
  balance: number;
  playTime: number;
  upgrades: Record<CoinUpgradeId, number>;
  betFractionIndex: number;
  /** La cadena del jugador en curso (o la última resuelta, para enseñarla), o null. */
  chain: CoinChain | null;
  /** Segundas oportunidades (reserva común con el ayudante) y tiempo hacia la siguiente. */
  seconds: { charges: number; timer: number };
  /** El diablillo coronado: su temporizador, su perfil, su cadena y dónde piensa retirarse. */
  helper: { timer: number; profile: number; chain: CoinChain | null; stopAt: number };
  /** Pozo del jackpot (cadena completa de 10 caras). */
  pot: number;
  passiveCarry: number;
  recentChains: CoinChain[];
  debtPaid: boolean;
  visited: boolean;
  stats: {
    chains: number;
    flips: number;
    heads: number;
    cashouts: number;
    fullChains: number;
    jackpots: number;
    seconds: number;
    bestChain: number;
    passiveEarned: number;
  };
}

export function createCoinState(): CoinState {
  return {
    balance: 0,
    playTime: 0,
    upgrades: Object.fromEntries(COIN_UPGRADE_IDS.map((id) => [id, 0])) as Record<CoinUpgradeId, number>,
    betFractionIndex: 1,
    chain: null,
    seconds: { charges: CONFIG.coin.seconds.base, timer: 0 },
    helper: { timer: 0, profile: 0, chain: null, stopAt: 1 },
    pot: CONFIG.coin.jackpot.potSeed,
    passiveCarry: 0,
    recentChains: [],
    debtPaid: false,
    visited: false,
    stats: { chains: 0, flips: 0, heads: 0, cashouts: 0, fullChains: 0, jackpots: 0, seconds: 0, bestChain: 0, passiveEarned: 0 },
  };
}
