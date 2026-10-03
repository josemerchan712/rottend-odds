import { playerBet, selectBetFraction } from '../src/game/actions';
import { currentMaxBet } from '../src/game/betting';
import { CONFIG, UPGRADE_IDS, type UpgradeId } from '../src/game/config';
import { selectHelperProfile } from '../src/game/helper';
import { seededRng, type Rng } from '../src/game/rng';
import { createInitialState, type BetChoice, type GameState } from '../src/game/state';
import { buyUpgrade, canBuy, nextCost } from '../src/game/upgrades';
import { update } from '../src/game/update';
import { collectTrash } from '../src/game/work';

/** Cómo juega un jugador simulado. */
export interface Strategy {
  id: string;
  label: string;
  /** Qué apuesta hace ahora, o null si prefiere no apostar. */
  chooseBet(state: GameState): { choice: BetChoice; fractionIndex: number } | null;
  /** Perfil del ayudante que quiere usar (se limita a los desbloqueados). */
  helperProfile(state: GameState): number;
  /** Si esta estrategia compra esa mejora ahora. */
  buys(id: UpgradeId, state: GameState): boolean;
  /** Fichas que no gasta en la tienda para poder seguir apostando. */
  reserve(state: GameState): number;
}

/** Ritmo del jugador activo simulado. */
export interface PlayerModel {
  /** Segundos entre acciones (clic de apostar o de recoger). */
  actionInterval: number;
  /** Segundos mínimos entre dos apuestas del jugador (lo que tarda en girar la ruleta). */
  betInterval: number;
  /** Con esta basura o más en el suelo, recoge antes de apostar para no desperdiciar apariciones. */
  collectAtItems: number;
  /** Con un techo de apuesta mayor que esto, la basura ya no compensa el clic y solo apuesta. */
  ignoreTrashAboveCeiling: number;
  /** Paso de simulación (s). */
  dt: number;
  /** Tiempo máximo antes de darse por vencido (s). */
  timeLimit: number;
}

export const DEFAULT_PLAYER: PlayerModel = {
  actionInterval: 0.5,
  betInterval: 1.0,
  collectAtItems: 4,
  ignoreTrashAboveCeiling: 1000,
  dt: 0.1,
  timeLimit: 3600,
};

/**
 * Mejoras secundarias: solo se compran si cuestan como mucho esta fracción del saldo.
 * Las principales (suerte, techo, ayudante y su velocidad/perfil) se compran en cuanto se puede.
 */
export const SIDE_UPGRADES: readonly UpgradeId[] = ['helperLuck', 'jackpot', 'dozenBet', 'numberBet'];
export const SIDE_BUDGET = 0.25;

export const PHASES = ['inicio', 'media', 'alta', 'final'] as const;
export type Phase = (typeof PHASES)[number];

/** Fase según el nivel de suerte: 0-4, 5-11, 12-19, 20. */
export function phaseOf(luckLevel: number): Phase {
  if (luckLevel >= CONFIG.upgrades.luck.maxLevel) return 'final';
  if (luckLevel >= 12) return 'alta';
  if (luckLevel >= 5) return 'media';
  return 'inicio';
}

export interface RunResult {
  finished: boolean;
  /** Segundos hasta tener 10M (o el límite). */
  time: number;
  firstBetTime: number | null;
  firstLuckTime: number | null;
  /** Momento en que se compra el último nivel de suerte. */
  luckMaxTime: number | null;
  /** Veces que el saldo llegó a 0 tras perder una apuesta, por fase. */
  bankruptcies: Record<Phase, number>;
  /** Si la partida llegó a pasar por cada fase. */
  reachedPhase: Record<Phase, boolean>;
  /** Fichas ganadas por cada fuente (bruto, sin restar pérdidas). */
  earned: { work: number; roulette: number; jackpot: number };
  lost: number;
  bets: { player: number; helper: number };
  jackpots: number;
  jackpotsCapped: number;
  /** Momento de cada compra. */
  purchases: { id: UpgradeId; level: number; time: number }[];
}

export function runOne(strategy: Strategy, seed: number, player: PlayerModel = DEFAULT_PLAYER): RunResult {
  const rng: Rng = seededRng(seed);
  const state = createInitialState();
  const result: RunResult = {
    finished: false,
    time: 0,
    firstBetTime: null,
    firstLuckTime: null,
    luckMaxTime: null,
    bankruptcies: { inicio: 0, media: 0, alta: 0, final: 0 },
    reachedPhase: { inicio: true, media: false, alta: false, final: false },
    earned: { work: 0, roulette: 0, jackpot: 0 },
    lost: 0,
    bets: { player: 0, helper: 0 },
    jackpots: 0,
    jackpotsCapped: 0,
    purchases: [],
  };

  let actionTimer = 0;
  let betTimer = player.betInterval;
  let spinsSeen = 0;

  /** Contabiliza las tiradas nuevas (las más recientes van primero en recentSpins). */
  const recordSpins = (count: number) => {
    for (let i = count - 1; i >= 0; i--) {
      const spin = state.recentSpins[i];
      if (!spin) continue;
      if (spin.bettor === 'jugador') result.bets.player++;
      else result.bets.helper++;
      if (spin.outcome === 'jackpot') {
        result.earned.jackpot += spin.delta;
        result.jackpots++;
        if (spin.jackpotCapped) result.jackpotsCapped++;
      } else if (spin.delta > 0) result.earned.roulette += spin.delta;
      else result.lost -= spin.delta;
    }
    if (count > 0 && state.balance < CONFIG.bet.minBet) result.bankruptcies[phaseOf(state.upgrades.luck)]++;
  };

  while (state.playTime < player.timeLimit) {
    // 1. El mundo avanza: basura y ayudante.
    update(state, player.dt, rng);
    const helperSpins = state.stats.bets - spinsSeen;
    spinsSeen = state.stats.bets;
    recordSpins(Math.min(helperSpins, CONFIG.tech.recentSpins));

    if (state.balance >= CONFIG.debt.amount) break;

    // 2. Compras: siempre la más barata que pueda pagar.
    for (;;) {
      let best: UpgradeId | null = null;
      for (const id of UPGRADE_IDS) {
        if (!strategy.buys(id, state) || !canBuy(state, id)) continue;
        if (state.balance - nextCost(state, id)! < strategy.reserve(state)) continue;
        if (SIDE_UPGRADES.includes(id) && nextCost(state, id)! > state.balance * SIDE_BUDGET) continue;
        if (best === null || nextCost(state, id)! < nextCost(state, best)!) best = id;
      }
      if (best === null) break;
      buyUpgrade(state, best);
      result.purchases.push({ id: best, level: state.upgrades[best], time: state.playTime });
      if (best === 'luck') {
        result.firstLuckTime ??= state.playTime;
        result.reachedPhase[phaseOf(state.upgrades.luck)] = true;
        if (state.upgrades.luck >= CONFIG.upgrades.luck.maxLevel) result.luckMaxTime = state.playTime;
      }
    }
    selectHelperProfile(state, Math.min(strategy.helperProfile(state), state.upgrades.helperProfile));

    // 3. El jugador actúa: recoger o apostar.
    actionTimer += player.dt;
    betTimer += player.dt;
    if (actionTimer < player.actionInterval) continue;
    actionTimer -= player.actionInterval;

    // Sin saldo para la apuesta mínima no puede apostar: le toca recoger basura.
    const wanted = betTimer >= player.betInterval ? strategy.chooseBet(state) : null;
    const bet = wanted && state.balance >= CONFIG.bet.minBet ? wanted : null;
    const trashWorthIt = currentMaxBet(state) <= player.ignoreTrashAboveCeiling;
    if ((trashWorthIt && state.work.items >= player.collectAtItems) || (!bet && state.work.items > 0)) {
      const item = collectTrash(state, rng);
      if (item) result.earned.work += item.value;
    } else if (bet) {
      selectBetFraction(state, bet.fractionIndex);
      if (playerBet(state, bet.choice, rng)) {
        betTimer = 0;
        result.firstBetTime ??= state.playTime;
        spinsSeen = state.stats.bets;
        recordSpins(1);
      }
    }
    if (state.balance >= CONFIG.debt.amount) break;
  }

  result.time = state.playTime;
  result.finished = state.balance >= CONFIG.debt.amount;
  return result;
}
