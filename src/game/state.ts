import { UPGRADE_IDS, type UpgradeId } from './config';

export type BetColor = 'negro' | 'blanco';

/** A qué se apuesta. La docena y el número concretos solo cambian la casilla que se enseña. */
export type BetChoice =
  | { type: 'color'; color: BetColor }
  | { type: 'dozen'; dozen: 1 | 2 | 3 }
  | { type: 'number'; number: number };
export type Bettor = 'jugador' | 'ayudante';
export type SpinOutcome = 'gana' | 'pierde' | 'jackpot';

/** Resultado de una tirada, para mostrarlo y para la simulación. */
export interface SpinResult {
  bettor: Bettor;
  choice: BetChoice;
  bet: number;
  /** Probabilidad efectiva de ganar con la que se jugó. */
  winChance: number;
  outcome: SpinOutcome;
  /** Casilla que salió: 0 = cero verde, 1-36 (impar negro, par blanco), -1 = Cero Dorado. */
  slot: number;
  /** Cambio neto del saldo. */
  delta: number;
  /** Si el pago del jackpot se recortó por el tope. */
  jackpotCapped: boolean;
}

/** Estado completo de la partida. Datos planos, serializables a JSON. */
export interface GameState {
  /** Fichas de la mesa 1. Nunca baja de 0. */
  balance: number;
  /** Segundos de juego activo acumulados. */
  playTime: number;
  /** Nivel comprado de cada mejora. */
  upgrades: Record<UpgradeId, number>;
  /** Índice del botón rápido elegido en CONFIG.bet.quickFractions. */
  betFractionIndex: number;
  helper: {
    /** Segundos acumulados hacia la siguiente apuesta. */
    timer: number;
    /** Segundos de bloqueo restantes. */
    lockout: number;
    /** Índice del perfil activo en CONFIG.helper.profiles. */
    profile: number;
  };
  work: {
    /** Basura en el suelo ahora mismo. */
    items: number;
    /** Segundos acumulados hacia la siguiente aparición. */
    spawnTimer: number;
    /** Último objeto recogido (para la interfaz). */
    lastItem: string | null;
  };
  /** Tiradas más recientes, la última primero. */
  recentSpins: SpinResult[];
  debtPaid: boolean;
  stats: {
    bets: number;
    wins: number;
    jackpots: number;
    jackpotsCapped: number;
    workEarned: number;
  };
}

export function createInitialState(): GameState {
  return {
    balance: 0,
    playTime: 0,
    upgrades: Object.fromEntries(UPGRADE_IDS.map((id) => [id, 0])) as Record<UpgradeId, number>,
    betFractionIndex: 1,
    helper: { timer: 0, lockout: 0, profile: 0 },
    work: { items: 6, spawnTimer: 0, lastItem: null },
    recentSpins: [],
    debtPaid: false,
    stats: { bets: 0, wins: 0, jackpots: 0, jackpotsCapped: 0, workEarned: 0 },
  };
}
