import { playerBet, selectBetFraction } from '../src/game/actions';
import { currentMaxBet } from '../src/game/betting';
import { CONFIG, UPGRADE_IDS, type UpgradeId } from '../src/game/config';
import { selectHelperProfile } from '../src/game/helper';
import { seededRng, type Rng } from '../src/game/rng';
import { createInitialState, type BetChoice, type GameState } from '../src/game/state';
import { payDebt } from '../src/game/debt';
import { buyUpgrade, canBuy, nextCost, upgradeCost } from '../src/game/upgrades';
import { update } from '../src/game/update';
import { collectItem, itemValue } from '../src/game/work';

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
  /** Mejoras que compra antes que nada en cuanto puede pagarlas, sin respetar la reserva. */
  priority?: readonly UpgradeId[];
  /** Con el ayudante comprado deja de apostar y de recoger: solo compra (jugar "solo con ayudante"). */
  idleAfterHelper?: boolean;
}

/** Ritmo del jugador activo simulado. */
export interface PlayerModel {
  /** Segundos entre acciones (clic de apostar o de recoger). */
  actionInterval: number;
  /** Segundos mínimos entre dos apuestas del jugador (lo que tarda en girar la ruleta). */
  betInterval: number;
  /** Con esta basura o más en el suelo, va a la trastienda a recogerla (y vuelve cuando la limpia). */
  collectAtItems: number;
  /** Lo que tarda en cambiar de sala, en cada sentido (s). Apuesta en el casino; recoge en la trastienda. */
  roomSwitchSeconds: number;
  /** Con un techo de apuesta mayor que esto, la basura ya no compensa el clic y solo apuesta. */
  ignoreTrashAboveCeiling: number;
  /** Paso de simulación (s). */
  dt: number;
  /** Tiempo máximo antes de darse por vencido (s). */
  timeLimit: number;
  /** Si al llegar a 10M paga la deuda y sigue jugando hasta timeLimit (para la tabla de plausibilidad). */
  continueAfterDebt?: boolean;
  /** Cada cuántos segundos se anota earnedCurve (0 = no se anota). */
  sampleEvery?: number;
}

/**
 * Fichas que el jugador ha tenido que ganar como mínimo: saldo + coste de lo comprado
 * (+ la deuda si la pagó). Es la misma cuenta que hace el servidor para validar un guardado.
 */
export function minimumEarned(state: GameState): number {
  let spent = 0;
  for (const id of UPGRADE_IDS) {
    for (let n = 0; n < state.upgrades[id]; n++) spent += upgradeCost(id, n);
  }
  return state.balance + spent + (state.debtPaid ? CONFIG.debt.amount : 0);
}

export const DEFAULT_PLAYER: PlayerModel = {
  actionInterval: 0.5,
  betInterval: 1.0,
  collectAtItems: 6,
  roomSwitchSeconds: 1.5,
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
  /** Momento en que reunió 10M por primera vez. */
  debtTime: number | null;
  /** minimumEarned() cada `sampleEvery` segundos. */
  earnedCurve: number[];
  /** Veces que cambia de sala (ida o vuelta). */
  roomSwitches: number;
  /** Estado al terminar (para empezar la mesa 2 desde ahí). */
  finalState: GameState;
  /** Apuestas del ayudante por fase: cuántas, suma de cambios de saldo y de fichas apostadas. */
  helper: Record<Phase, { bets: number; delta: number; staked: number; bankruptcies: number; drawdowns: number }>;
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
    debtTime: null,
    earnedCurve: [],
    roomSwitches: 0,
    finalState: state,
    helper: {
      inicio: { bets: 0, delta: 0, staked: 0, bankruptcies: 0, drawdowns: 0 },
      media: { bets: 0, delta: 0, staked: 0, bankruptcies: 0, drawdowns: 0 },
      alta: { bets: 0, delta: 0, staked: 0, bankruptcies: 0, drawdowns: 0 },
      final: { bets: 0, delta: 0, staked: 0, bankruptcies: 0, drawdowns: 0 },
    },
  };

  let actionTimer = 0;
  let betTimer = player.betInterval;
  /** Sala en la que está y, si está cambiando, segundos que le quedan. */
  let room: 'casino' | 'trastienda' = 'casino';
  let switchLeft = 0;
  const goTo = (next: 'casino' | 'trastienda') => {
    room = next;
    switchLeft = player.roomSwitchSeconds;
    result.roomSwitches++;
  };
  let spinsSeen = 0;
  /** Racha de pérdidas del ayudante: saldo al empezarla y fichas perdidas en ella. */
  let helperStreakStart: number | null = null;
  let helperStreakLoss = 0;
  let helperStreakCounted = false;

  /** Contabiliza las tiradas nuevas (las más recientes van primero en recentSpins). */
  const recordSpins = (count: number) => {
    const phase = phaseOf(state.upgrades.luck);
    for (let i = count - 1; i >= 0; i--) {
      const spin = state.recentSpins[i];
      if (!spin) continue;
      if (spin.bettor === 'jugador') result.bets.player++;
      else {
        result.bets.helper++;
        result.helper[phase].bets++;
        result.helper[phase].delta += spin.delta;
        result.helper[phase].staked += spin.bet;
        if (spin.delta < 0) {
          // Solo cuenta lo que pierde el ayudante, no las compras ni las apuestas del jugador.
          if (helperStreakStart === null) {
            const after = state.balance - state.recentSpins.slice(0, i).reduce((acc, sp) => acc + sp.delta, 0);
            helperStreakStart = after - spin.delta;
          }
          helperStreakLoss -= spin.delta;
          if (!helperStreakCounted && helperStreakLoss >= helperStreakStart * 0.5) {
            result.helper[phase].drawdowns++;
            helperStreakCounted = true;
          }
        } else {
          helperStreakStart = null;
          helperStreakLoss = 0;
          helperStreakCounted = false;
        }
      }
      if (spin.outcome === 'jackpot') {
        result.earned.jackpot += spin.delta;
        result.jackpots++;
        if (spin.jackpotCapped) result.jackpotsCapped++;
      } else if (spin.delta > 0) result.earned.roulette += spin.delta;
      else result.lost -= spin.delta;
    }
    if (count > 0 && state.balance < CONFIG.bet.minBet) {
      result.bankruptcies[phase]++;
      // La última tirada es la que dejó el saldo a 0.
      if (state.recentSpins[0]?.bettor === 'ayudante') result.helper[phase].bankruptcies++;
    }
  };

  /** true si hay que terminar la partida (10M sin continuar). */
  const reachedDebt = (): boolean => {
    if (state.balance < CONFIG.debt.amount || state.debtPaid) return false;
    result.debtTime ??= state.playTime;
    if (!player.continueAfterDebt) return true;
    payDebt(state);
    return false;
  };
  let nextSample = 0;

  while (state.playTime < player.timeLimit) {
    if (player.sampleEvery && state.playTime >= nextSample) {
      result.earnedCurve.push(minimumEarned(state));
      nextSample += player.sampleEvery;
    }
    // 1. El mundo avanza: basura y ayudante.
    for (const cleaned of update(state, player.dt, rng)) result.earned.work += cleaned.value;
    const helperSpins = state.stats.bets - spinsSeen;
    spinsSeen = state.stats.bets;
    recordSpins(Math.min(helperSpins, CONFIG.tech.recentSpins));

    if (reachedDebt()) break;

    // 2. Compras: primero las prioritarias; después siempre la más barata que pueda pagar.
    for (;;) {
      let best: UpgradeId | null =
        strategy.priority?.find((id) => strategy.buys(id, state) && canBuy(state, id)) ?? null;
      for (const id of best ? [] : UPGRADE_IDS) {
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

    // 3. El jugador actúa: apostar (solo en el casino) o recoger (solo en la trastienda).
    betTimer += player.dt;
    if (switchLeft > 0) {
      // Cambiando de sala: ni apuesta ni recoge.
      switchLeft -= player.dt;
      continue;
    }
    if (strategy.idleAfterHelper && state.upgrades.crupier > 0) continue;
    actionTimer += player.dt;
    if (actionTimer < player.actionInterval) continue;
    actionTimer -= player.actionInterval;

    // Sin saldo para la apuesta mínima no puede apostar: le toca recoger basura.
    const wanted = strategy.chooseBet(state);
    const bet = wanted && state.balance >= CONFIG.bet.minBet ? wanted : null;
    const items = state.work.items.length;
    const trashWorthIt = currentMaxBet(state) <= player.ignoreTrashAboveCeiling;
    if (room === 'casino') {
      // Va a la trastienda con el suelo lleno, o si no quiere (o no puede) apostar y hay algo que recoger.
      if ((trashWorthIt && items >= player.collectAtItems) || (!bet && items > 0)) {
        goTo('trastienda');
        continue;
      }
    } else {
      // En la trastienda recoge hasta dejar el suelo limpio; si no puede apostar, se queda esperando basura.
      if (items > 0 && (trashWorthIt || !bet)) {
        const best = state.work.items.reduce((a, b) => (itemValue(state, b.kind) > itemValue(state, a.kind) ? b : a));
        for (const item of collectItem(state, best.id)) result.earned.work += item.value;
      } else if (bet) goTo('casino');
      continue;
    }
    if (bet && betTimer >= player.betInterval) {
      selectBetFraction(state, bet.fractionIndex);
      if (playerBet(state, bet.choice, rng)) {
        betTimer = 0;
        result.firstBetTime ??= state.playTime;
        spinsSeen = state.stats.bets;
        recordSpins(1);
      }
    }
    if (reachedDebt()) break;
  }

  result.time = result.debtTime ?? state.playTime;
  result.finished = result.debtTime !== null;
  return result;
}
