import { CONFIG, GAME_TAGLINE, GAME_TITLE } from './config';
import type { GameState } from './state';

/** Moneda de cada mesa (1 a 5), para el libro de cuentas. */
export const TABLE_CURRENCIES = ['fichas', 'monedas', 'chapas', 'fichas negras', 'oro'] as const;

/** Resumen de la partida para la pantalla final (el "libro de cuentas"). */
export interface GameSummary {
  /** Segundos de juego en total (todas las mesas). */
  totalTime: number;
  /** Lo que tardó cada mesa en pagarse (desde que se pagó la anterior); null si no se sabe o no se pagó. */
  tableTimes: (number | null)[];
  /** Apuestas de todas las mesas (tiradas, manos, cadenas; del jugador y de los ayudantes). */
  bets: number;
  /** Parte de las apuestas que ganaron (0-1). */
  winRate: number;
  jackpots: number;
  /** Veces que el saldo de alguna mesa se quedó sin llegar a la apuesta mínima. */
  zeros: number;
  /** Ganado en las apuestas de cada mesa, en su moneda. */
  won: number[];
  /** Ganado en total (todas las monedas juntas). */
  totalWon: number;
  /** Ayudantes comprados (crupier, zombi, camarero, esqueleto, diablillo) de 5. */
  helpers: number;
  /** Mejor racha de la mesa 5: caras seguidas en una cadena. */
  bestChain: number;
}

/** Tiempo de cada mesa a partir del momento de pago de cada deuda. */
export function tableTimes(paidAt: readonly number[]): (number | null)[] {
  return paidAt.map((t, i) => {
    if (!(t > 0)) return null;
    if (i === 0) return t;
    const before = paidAt[i - 1];
    return before > 0 ? Math.max(0, t - before) : null;
  });
}

export function gameSummary(state: GameState): GameSummary {
  const bets = state.stats.bets + state.slots.stats.spins + state.dice.stats.rolls + state.cards.stats.hands + state.coin.stats.chains;
  const wins = state.stats.wins + state.slots.stats.wins + state.dice.stats.wins + state.cards.stats.wins + state.coin.stats.cashouts;
  const jackpots = state.stats.jackpots + state.slots.stats.jackpots + state.dice.stats.jackpots + state.cards.stats.jackpots + state.coin.stats.jackpots;
  const won = [state.stats.won, state.slots.stats.won, state.dice.stats.won, state.cards.stats.won, state.coin.stats.won].map((n) => Math.max(0, n || 0));
  const helpers = [state.upgrades.crupier, state.slots.upgrades.zombie, state.dice.upgrades.ghost, state.cards.upgrades.skeleton, state.coin.upgrades.imp].filter((l) => l > 0).length;
  return {
    totalTime: state.playTime,
    tableTimes: tableTimes(state.stats.paidAt),
    bets,
    winRate: bets ? wins / bets : 0,
    jackpots,
    zeros: state.stats.zeros,
    won,
    totalWon: won.reduce((a, b) => a + b, 0),
    helpers,
    bestChain: state.coin.stats.bestChain,
  };
}

/** Tiempo como 1:02:03 o 12:03 (para el texto que se copia; el juego usa formatTime). */
function clock(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

const int = (n: number) => Math.floor(n).toLocaleString('es-ES');

/** Texto del resumen para copiar al portapapeles (sin servidor). */
export function summaryText(summary: GameSummary): string {
  const times = summary.tableTimes.map((t, i) => `Mesa ${i + 1}: ${t === null ? '—' : clock(t)}`).join(' · ');
  return [
    `${GAME_TITLE} — ${GAME_TAGLINE}`,
    'Libro de cuentas',
    `Tiempo total: ${clock(summary.totalTime)}`,
    times,
    `Apuestas: ${int(summary.bets)} (${Math.round(summary.winRate * 100)}% ganadas)`,
    `Jackpots: ${int(summary.jackpots)}`,
    `Veces a cero: ${int(summary.zeros)}`,
    `Ganado: ${summary.won.map((n, i) => `${int(n)} ${TABLE_CURRENCIES[i]}`).join(' · ')}`,
    `Ayudantes comprados: ${summary.helpers} de 5`,
    `Mejor racha en la mesa 5: ${summary.bestChain} caras`,
  ].join('\n');
}

/** ¿Se ha pagado la última deuda (la del Dueño)? */
export function isGameFinished(state: GameState): boolean {
  return state.coin.debtPaid;
}

const lastBalances = new WeakMap<GameState, number[]>();

/**
 * Cuenta las veces que el saldo de una mesa abierta baja de la apuesta mínima (de tener para
 * apostar a no tener). Se llama en cada paso; la primera vez solo toma nota.
 */
export function trackZeros(state: GameState): void {
  const now = [state.balance, state.slots.balance, state.dice.balance, state.cards.balance, state.coin.balance];
  const mins = [CONFIG.bet.minBet, CONFIG.slots.bet.minBet, CONFIG.dice.bet.minBet, CONFIG.cards.bet.minBet, CONFIG.coin.bet.minBet];
  const before = lastBalances.get(state);
  if (before) {
    for (let i = 0; i < now.length; i++) if (before[i] >= mins[i] && now[i] < mins[i]) state.stats.zeros++;
  }
  lastBalances.set(state, now);
}

/** Apunta el tiempo de juego al pagar cada deuda (se llama en cada paso; la deuda se paga con un clic). */
export function trackPaidAt(state: GameState): void {
  const paid = [state.debtPaid, state.slots.debtPaid, state.dice.debtPaid, state.cards.debtPaid, state.coin.debtPaid];
  const at = state.stats.paidAt;
  for (let i = 0; i < paid.length; i++) if (paid[i] && at[i] === 0) at[i] = Math.max(state.playTime, 0.001);
}
