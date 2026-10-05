import { CONFIG, COIN_UPGRADE_IDS, HEIRLOOM_IDS, type CoinKind, type CoinUpgradeId, type HeirloomId } from '../config';
import type { Bettor } from '../state';

export type CoinFace = 'cara' | 'cruz';

/**
 * Una cadena de doble o nada: se apuesta una cantidad y se lanza la moneda; con CARA lo acumulado se
 * multiplica (×2 la justa, ×3 la cargada) y se decide retirarse o seguir, con CRUZ se pierde todo
 * (salvo Relanzar o Cero dorado).
 */
export interface CoinChain {
  bettor: Bettor;
  /** Lo apostado al empezar. */
  stake: number;
  /** Lo que vale ahora (apuesta × multiplicadores de las caras, con el tope de la casa). */
  value: number;
  /** Caras seguidas: pasos de la cadena (0-10; la cargada también cuenta uno). */
  wins: number;
  /** Caras que han cansado la suerte (las que se ganaron con Retener no cuentan). */
  fatigue: number;
  /** 'decidir': tras una cara, retirarse o seguir. 'fallo': tras una cruz, relanzar, cero dorado o aceptar. 'fin': resuelta. */
  status: 'decidir' | 'fallo' | 'fin';
  /** Las caras y cruces que han salido, en orden (sin las repetidas con Relanzar). */
  faces: CoinFace[];
  /** Con qué moneda salió cada cara. */
  coins: CoinKind[];
  /** Probabilidad de cara con la que se lanzó la última vez. */
  lastChance: number;
  /** Cargas que le quedan a esta cadena de cada herencia (se llenan al empezarla). */
  charges: Record<HeirloomId, number>;
  /** Retener armado: el próximo acierto no suma fatiga. */
  holdArmed: boolean;
  /** Marcar: el resultado (número 0-1) del próximo lanzamiento, ya decidido y a la vista, o null. */
  mark: number | null;
  /** Usos de cada herencia en esta cadena. */
  used: Record<HeirloomId, number>;
  result: 'retirado' | 'perdido' | 'cadena' | 'salvado' | null;
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
  /** Niveles de las herencias (cargas por cadena), comprados con la moneda de cada mesa. */
  heirlooms: Record<HeirloomId, number>;
  /** Moneda elegida para el siguiente lanzamiento. */
  coinChoice: CoinKind;
  betFractionIndex: number;
  /** La cadena del jugador en curso (o la última resuelta, para enseñarla), o null. */
  chain: CoinChain | null;
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
    /** Usos de las herencias (todas). */
    heirloomsUsed: number;
    loadedFlips: number;
    bestChain: number;
    passiveEarned: number;
  };
}

export function emptyHeirlooms(): Record<HeirloomId, number> {
  return Object.fromEntries(HEIRLOOM_IDS.map((id) => [id, 0])) as Record<HeirloomId, number>;
}

export function createCoinState(): CoinState {
  return {
    balance: 0,
    playTime: 0,
    upgrades: Object.fromEntries(COIN_UPGRADE_IDS.map((id) => [id, 0])) as Record<CoinUpgradeId, number>,
    heirlooms: emptyHeirlooms(),
    coinChoice: 'justa',
    betFractionIndex: 1,
    chain: null,
    helper: { timer: 0, profile: 0, chain: null, stopAt: 1 },
    pot: CONFIG.coin.jackpot.potSeed,
    passiveCarry: 0,
    recentChains: [],
    debtPaid: false,
    visited: false,
    stats: { chains: 0, flips: 0, heads: 0, cashouts: 0, fullChains: 0, jackpots: 0, heirloomsUsed: 0, loadedFlips: 0, bestChain: 0, passiveEarned: 0 },
  };
}
