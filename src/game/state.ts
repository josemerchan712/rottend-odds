import { CONFIG, UPGRADE_IDS, type UpgradeId } from './config';
import { createCardsState, type CardsState } from './cards/state';
import { createCoinState, type CoinState } from './coin/state';
import { createDiceState, type DiceState } from './dice/state';
import { createSlotsState, type SlotsState } from './slots/state';

export type BetColor = 'negro' | 'blanco';

/** A qué se apuesta. La docena y el número concretos solo cambian la casilla que se enseña. */
export type BetChoice =
  | { type: 'color'; color: BetColor }
  | { type: 'dozen'; dozen: 1 | 2 | 3 }
  | { type: 'number'; number: number };
export type Bettor = 'jugador' | 'ayudante';

/** Un objeto de basura en el suelo de la escena (coordenadas de 640x360, base del objeto). */
export interface TrashItem {
  id: number;
  /** id del objeto en CONFIG.work.items (colilla, vaso...). */
  kind: string;
  x: number;
  y: number;
}
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

export type TableId = 1 | 2 | 3 | 4 | 5;

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
    items: TrashItem[];
    /** Segundos acumulados hacia la siguiente aparición. */
    spawnTimer: number;
    /** Siguiente id de objeto; 0 = aún no se ha sembrado el suelo inicial. */
    nextId: number;
    /** Ayudante de limpieza: temporizador y dónde está. */
    cleaner: { timer: number; x: number; y: number };
    /** Último objeto recogido (para la interfaz). */
    lastItem: string | null;
  };
  /** Tiradas más recientes, la última primero. */
  recentSpins: SpinResult[];
  debtPaid: boolean;
  /** Mesa que se está viendo (1 ruleta, 2 tragaperras, 3 dados, 4 blackjack, 5 doble o nada). Cada una requiere saldar la anterior. */
  activeTable: TableId;
  /** Mesa 2: la tragaperras. Existe siempre; se juega al saldar la deuda de la mesa 1. */
  slots: SlotsState;
  /** Mesa 3: los dados del Barman. Se juega al saldar la deuda de la mesa 2. */
  dice: DiceState;
  /** Mesa 4: el blackjack de la Crupier. Se juega al saldar la deuda de la mesa 3. */
  cards: CardsState;
  /** Mesa 5: doble o nada, el escritorio del Dueño. Se juega al saldar la deuda de la mesa 4. */
  coin: CoinState;
  stats: {
    bets: number;
    wins: number;
    jackpots: number;
    jackpotsCapped: number;
    workEarned: number;
    /** Veces que el saldo de alguna mesa se quedó por debajo de la apuesta mínima (pantalla final). */
    zeros: number;
  };
}

export function createInitialState(): GameState {
  return {
    balance: 0,
    playTime: 0,
    upgrades: Object.fromEntries(UPGRADE_IDS.map((id) => [id, 0])) as Record<UpgradeId, number>,
    betFractionIndex: 1,
    helper: { timer: 0, lockout: 0, profile: 0 },
    work: {
      items: [],
      spawnTimer: 0,
      nextId: 0,
      cleaner: { timer: 0, x: CONFIG.work.cleaner.start.x, y: CONFIG.work.cleaner.start.y },
      lastItem: null,
    },
    recentSpins: [],
    debtPaid: false,
    activeTable: 1,
    slots: createSlotsState(),
    dice: createDiceState(),
    cards: createCardsState(),
    coin: createCoinState(),
    stats: { bets: 0, wins: 0, jackpots: 0, jackpotsCapped: 0, workEarned: 0, zeros: 0 },
  };
}
