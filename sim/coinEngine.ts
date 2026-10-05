import { payCardsDebt } from '../src/game/cards/table';
import { CONFIG, COIN_UPGRADE_IDS, HEIRLOOM_IDS, type CoinKind, type CoinUpgradeId, type HeirloomId } from '../src/game/config';
import {
  acceptLoss,
  armHold,
  cashOut,
  CHAIN_CAP,
  COIN_JACKPOT_CAP,
  coinCeiling,
  coinChips,
  continueChain,
  flipChance,
  heirloomCharges,
  loadedUnlocked,
  markedFace,
  startChain,
  stepMultiplier,
  useGoldenZero,
  useMark,
  useReroll,
} from '../src/game/coin/game';
import type { CoinChain, CoinState } from '../src/game/coin/state';
import {
  buyCoinUpgrade,
  buyHeirloom,
  canBuyCoin,
  canBuyHeirloom,
  coinNextCost,
  coinPassiveRate,
  recommendedImpProfile,
  selectImpProfile,
} from '../src/game/coin/table';
import { seededRng, type Rng } from '../src/game/rng';
import type { GameState } from '../src/game/state';
import { updateGame } from '../src/game/update';
import { CARDS_STRATEGIES, runCards } from './cardsEngine';
import { DEFAULT_PLAYER, phaseOf, type Phase, type PlayerModel } from './engine';

/**
 * Simulación de la mesa 5 (sesión 8: multiplicadores acumulativos; herencias y dos monedas): empieza al pagar la deuda
 * de la mesa 4 (estado real de una partida (d) de la mesa 4, misma semilla) y juega hasta reunir los
 * 10M de oro. Las mesas 1-4 siguen solas (sus ayudantes ganan la moneda con la que se compran las
 * herencias); la 4 alimenta la conversión. Cada decisión gasta una acción (0,5 s) y entre lanzamientos
 * pasa como mínimo betInterval (lo que tarda la moneda en caer).
 */
export interface CoinStrategy {
  id: string;
  label: string;
  /** Apuesta con la que empezar una cadena (cantidad), o null para no jugar. */
  chooseStake(state: GameState): number | null;
  /** Qué hacer tras una cara (o al empezar, con chain = null): seguir con una moneda o retirarse. */
  decide(state: GameState, chain: CoinChain | null): CoinKind | 'stop';
  /** Usa las herencias (con el criterio sencillo de siempre). */
  useHeirlooms: boolean;
  /** Niveles de herencia que compra (con la moneda de cada mesa) en cuanto puede. */
  heirlooms: Partial<Record<HeirloomId, number>>;
  impProfile(state: GameState): number;
  buys(id: CoinUpgradeId, state: GameState): boolean;
  reserve(state: GameState): number;
  priority?: readonly CoinUpgradeId[];
}

export interface CoinRunResult {
  finished: boolean;
  time: number;
  previousTime: number;
  luckMaxTime: number | null;
  bankruptcies: Record<Phase, number>;
  reachedPhase: Record<Phase, boolean>;
  earned: { chains: number; jackpot: number; passive: number };
  chains: { player: number; helper: number; cashouts: number; full: number; meanStop: number };
  heirloomsUsed: number;
  loadedShare: number;
  heirloomLevels: Record<HeirloomId, number>;
  /** Segundo en que llegó a tener las herencias que buscaba (o null). */
  heirloomsReady: number | null;
  jackpots: number;
  helper: Record<Phase, { bets: number; delta: number; staked: number; bankruptcies: number }>;
  passive: { start: number; end: number };
  timeline: { t: number; id: string; level: number; balance: number }[];
}

const startCache = new Map<number, { state: GameState; time: number }>();

export function table4Start(seed: number): { state: GameState; time: number } {
  // Estados guardados en disco por coinSimulate --cache (las cuatro mesas anteriores tardan mucho).
  const disk = (globalThis as { __coinStarts?: Record<string, { state: GameState; time: number }> }).__coinStarts?.[seed];
  if (disk) return { state: migrateStart(structuredClone(disk.state)), time: disk.time };
  let cached = startCache.get(seed);
  if (!cached) {
    const d = CARDS_STRATEGIES.find((s) => s.id === 'd')!;
    const run = runCards(d, seed);
    payCardsDebt(run.finalState.cards);
    cached = { state: run.finalState, time: run.previousTime + run.time };
    startCache.set(seed, cached);
  }
  return { state: migrateStart(structuredClone(cached.state)), time: cached.time };
}

/** Estados de la caché anteriores al rediseño: la mesa 5 sin herencias ni moneda elegida. */
function migrateStart(state: GameState): GameState {
  const coin = state.coin as CoinState & { seconds?: unknown };
  delete coin.seconds;
  // Cadenas guardadas con la fatiga de antes (sesión 8: `decay`).
  for (const c of [coin.chain, coin.helper.chain, ...coin.recentChains]) {
    if (c && (c as { fatigue?: number }).fatigue !== undefined) {
      c.decay = (c as { fatigue?: number }).fatigue ?? 0;
      delete (c as { fatigue?: number }).fatigue;
    }
  }
  coin.heirlooms ??= { zero: 0, hold: 0, reroll: 0, mark: 0 };
  coin.coinChoice ??= 'justa';
  coin.upgrades.loaded ??= 0;
  coin.stats.heirloomsUsed ??= 0;
  coin.stats.loadedFlips ??= 0;
  coin.pot = Math.max(coin.pot, CONFIG.coin.jackpot.potSeed);
  // Contadores del libro de cuentas (sesión 7) que no tenían los estados de la caché.
  state.stats.paidAt ??= [-1, -1, -1, -1, 0];
  state.endingSeen ??= false;
  for (const stats of [state.stats, state.slots.stats, state.dice.stats, state.cards.stats, coin.stats]) stats.won ??= 0;
  return state;
}

export function runCoin(strategy: CoinStrategy, seed: number, player: PlayerModel = DEFAULT_PLAYER): CoinRunResult {
  const start = table4Start(seed);
  const state = start.state;
  state.activeTable = 5;
  const coin = state.coin;
  const rng: Rng = seededRng(seed * 32452843 + 17);
  const empty = () => ({ bets: 0, delta: 0, staked: 0, bankruptcies: 0 });
  const result: CoinRunResult = {
    finished: false,
    time: 0,
    previousTime: start.time,
    luckMaxTime: null,
    bankruptcies: { inicio: 0, media: 0, alta: 0, final: 0 },
    reachedPhase: { inicio: true, media: false, alta: false, final: false },
    earned: { chains: 0, jackpot: 0, passive: 0 },
    chains: { player: 0, helper: 0, cashouts: 0, full: 0, meanStop: 0 },
    heirloomsUsed: 0,
    loadedShare: 0,
    heirloomLevels: { zero: 0, hold: 0, reroll: 0, mark: 0 },
    heirloomsReady: null,
    jackpots: 0,
    helper: { inicio: empty(), media: empty(), alta: empty(), final: empty() },
    passive: { start: coinPassiveRate(state), end: 0 },
    timeline: [],
  };

  let actionTimer = 0;
  let sinceFlip = player.betInterval;
  let jackpotTotal = 0;
  let spent = 0;
  let stopSum = 0;
  const startBalance = coin.balance;
  const counted = new WeakSet<object>();
  const wanted = HEIRLOOM_IDS.filter((id) => (strategy.heirlooms[id] ?? 0) > 0);

  const record = () => {
    const phase = phaseOf(coin.upgrades.luck);
    const fresh = coin.recentChains.filter((c) => !counted.has(c)).reverse();
    for (const c of fresh) {
      counted.add(c);
      jackpotTotal += c.jackpot;
      if (c.result === 'retirado' || c.result === 'cadena') {
        result.chains.cashouts++;
        stopSum += c.wins;
      }
      if (c.result === 'cadena') result.chains.full++;
      if (c.bettor === 'jugador') result.chains.player++;
      else {
        result.chains.helper++;
        const h = result.helper[phase];
        h.bets++;
        h.delta += c.delta;
        h.staked += c.stake;
      }
    }
    const open = coin.chain !== null && coin.chain.status !== 'fin';
    if (fresh.length && coin.balance < CONFIG.coin.bet.minBet && !open) {
      result.bankruptcies[phase]++;
      if (fresh[fresh.length - 1]?.bettor === 'ayudante') result.helper[phase].bankruptcies++;
    }
  };

  while (coin.playTime < player.timeLimit) {
    updateGame(state, player.dt, rng);
    record();
    if (coin.balance >= CONFIG.coin.debt.amount) break;

    const open = coin.chain !== null && coin.chain.status !== 'fin';
    if (!open) {
      // Herencias: con la moneda de su mesa, hasta el nivel que busca la estrategia.
      for (const id of wanted) {
        while (heirloomCharges(coin, id) < (strategy.heirlooms[id] ?? 0) && canBuyHeirloom(state, id)) {
          buyHeirloom(state, id);
          result.timeline.push({ t: Math.round(coin.playTime), id, level: coin.heirlooms[id], balance: 0 });
        }
      }
      if (result.heirloomsReady === null && wanted.every((id) => heirloomCharges(coin, id) >= (strategy.heirlooms[id] ?? 0))) result.heirloomsReady = coin.playTime;
      for (;;) {
        let best: CoinUpgradeId | null = strategy.priority?.find((id) => canBuyCoin(coin, id) && strategy.buys(id, state)) ?? null;
        if (!best) {
          for (const id of COIN_UPGRADE_IDS) {
            if (!canBuyCoin(coin, id) || !strategy.buys(id, state)) continue;
            const cost = coinNextCost(coin, id)!;
            if (coin.balance - cost < strategy.reserve(state)) continue;
            if (id === 'helperLuck' && cost > coin.balance * 0.25) continue;
            if (best === null || cost < coinNextCost(coin, best)!) best = id;
          }
        }
        if (best === null) break;
        spent += coinNextCost(coin, best)!;
        buyCoinUpgrade(coin, best);
        result.timeline.push({ t: Math.round(coin.playTime), id: best, level: coin.upgrades[best], balance: Math.round(coin.balance) });
        if (best === 'luck') {
          result.reachedPhase[phaseOf(coin.upgrades.luck)] = true;
          if (coin.upgrades.luck >= CONFIG.coin.upgrades.luck.maxLevel) result.luckMaxTime ??= coin.playTime;
        }
      }
      if (coin.upgrades.imp > 0) selectImpProfile(coin, Math.min(strategy.impProfile(state), coin.upgrades.helperProfile));
    }

    sinceFlip += player.dt;
    actionTimer += player.dt;
    if (actionTimer < player.actionInterval) continue;
    actionTimer -= player.actionInterval;

    const chain = coin.chain;
    if (chain && chain.status !== 'fin') {
      if (chain.status === 'decidir') {
        let choice = strategy.decide(state, chain);
        if (strategy.useHeirlooms) {
          // Con 2+ caras, Marcar antes de decidir (también si iba a retirarse: mirar es gratis): con cara
          // sigue con la moneda que acierta; con cruz, se retira. Retener en cuanto sigue.
          if (chain.wins >= 2 && chain.charges.mark > 0 && chain.mark === null) useMark(coin, chain, rng);
          if (chain.mark !== null) {
            const preferred: CoinKind = choice === 'stop' ? 'justa' : choice;
            const other: CoinKind = preferred === 'justa' ? 'cargada' : 'justa';
            choice = markedFace(coin, chain, 0, preferred) === 'cara' ? preferred : loadedUnlocked(coin) && markedFace(coin, chain, 0, other) === 'cara' ? other : 'stop';
          }
          if (choice !== 'stop') armHold(coin, chain);
        }
        if (choice !== 'stop') {
          if (sinceFlip < player.betInterval) continue;
          continueChain(coin, chain, rng, 0, choice);
          sinceFlip = 0;
        } else cashOut(coin, chain);
      } else if (chain.status === 'fallo') {
        if (strategy.useHeirlooms && chain.wins > 0 && chain.charges.reroll > 0) {
          if (sinceFlip < player.betInterval) continue;
          useReroll(coin, chain, rng);
          sinceFlip = 0;
        } else if (strategy.useHeirlooms && chain.wins > 0 && chain.charges.zero > 0) useGoldenZero(coin, chain);
        else acceptLoss(coin, chain);
      }
      record();
      continue;
    }

    const stake = strategy.chooseStake(state);
    if (stake !== null && stake >= CONFIG.coin.bet.minBet && sinceFlip >= player.betInterval) {
      const kind = strategy.decide(state, null);
      startChain(coin, { bettor: 'jugador', stake, kind: kind === 'stop' ? 'justa' : kind }, rng);
      sinceFlip = 0;
      record();
    }
    if (coin.balance >= CONFIG.coin.debt.amount) break;
  }

  result.time = coin.playTime;
  result.finished = coin.balance >= CONFIG.coin.debt.amount;
  result.passive.end = coinPassiveRate(state);
  result.jackpots = coin.stats.jackpots;
  result.heirloomsUsed = coin.stats.heirloomsUsed;
  result.loadedShare = coin.stats.flips ? coin.stats.loadedFlips / coin.stats.flips : 0;
  result.heirloomLevels = { ...coin.heirlooms };
  result.earned.passive = coin.stats.passiveEarned;
  result.earned.jackpot = jackpotTotal;
  result.chains.meanStop = result.chains.cashouts ? stopSum / result.chains.cashouts : 0;
  const totalGain = coin.balance - startBalance + spent;
  result.earned.chains = totalGain - result.earned.passive - result.earned.jackpot;
  return result;
}

// ---------------------------------------------------------------------------
// Estrategia óptima: programación dinámica sobre moneda y parada (apuesta con Kelly, parada con valor esperado)

interface PlanInput {
  coin: CoinState;
  stake: number;
  rest: number;
  kinds: readonly CoinKind[];
  heirlooms: boolean;
  /** Exponente de la utilidad (0 = logaritmo). */
  alpha: number;
}

type Plan = { v: number; act: CoinKind | 'stop' };

/**
 * Utilidad del saldo para la programación dinámica: (W^α − 1)/α; α = 0 es el logaritmo. Sesión 8: la
 * apuesta se elige con el logaritmo (Kelly: con el valor esperado apostaba todo, quebraba y tardaba más) y
 * retirarse o seguir con el valor esperado (α = 1): con pagos que crecen tanto, decidir la parada con el
 * logaritmo era demasiado prudente para la meta (llegar a 10M cuanto antes).
 */
const STAKE_ALPHA = 0;
const STOP_ALPHA = 1;
const utilityOf = (w: number, alpha: number) => (alpha === 0 ? Math.log(Math.max(w, 1)) : (Math.max(w, 1) ** alpha - 1) / alpha);

/**
 * Mejor jugada desde una cadena con `wins` caras, `value` acumulado y `decay` pasos de caída: retirarse
 * o seguir con una moneda. Cuenta Retener (con carga, ese lanzamiento cae un paso menos),
 * Relanzar (una cruz se repite, más difícil) y Cero dorado (una cruz devuelve una parte), una vez cada
 * uno. Devuelve el valor (log del saldo) y la jugada.
 */
function plan(input: PlanInput, wins: number, value: number, decay: number, hold: number, reroll: boolean, zero: boolean, memo: Map<string, Plan>): Plan {
  const key = `${wins}|${value}|${decay}|${hold}|${reroll ? 1 : 0}|${zero ? 1 : 0}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const { coin, stake, rest } = input;
  const utility = (w: number) => utilityOf(w, input.alpha);
  const fraction = stake / coinCeiling(coin);
  const pot = Math.min(coin.pot, COIN_JACKPOT_CAP);
  let best: Plan = { v: wins > 0 ? utility(rest + 1 + value) : -Infinity, act: 'stop' };
  const lossBase = utility(rest + 1);
  for (const kind of input.kinds) {
    const usesHold = input.heirlooms && hold > 0 && wins > 0 && decay > 0;
    const d = decay - (usesHold ? 1 : 0);
    const p = flipChance(coin.upgrades.luck, coin.upgrades.temple, d, fraction, 0, kind);
    const next = Math.min(value * stepMultiplier(wins + 1, kind), CHAIN_CAP);
    const w2 = wins + 1;
    let winV: number;
    if (w2 >= CONFIG.coin.chain.maxWins) winV = utility(rest + 1 + next + pot);
    else if (next >= CHAIN_CAP) winV = utility(rest + 1 + next);
    else winV = plan(input, w2, next, decay + 1, hold - (usesHold ? 1 : 0), reroll, zero, memo).v;
    const saved = input.heirlooms && zero && wins > 0 ? utility(rest + 1 + value * CONFIG.coin.heirlooms.zero.refund) : lossBase;
    const pRe = input.heirlooms && reroll ? flipChance(coin.upgrades.luck, coin.upgrades.temple, d + CONFIG.coin.heirlooms.reroll.extraSteps, fraction, 0, kind) : 0;
    const lossV = input.heirlooms && reroll && wins > 0 ? pRe * winV + (1 - pRe) * saved : saved;
    const v = p * winV + (1 - p) * lossV;
    if (v > best.v) best = { v, act: kind };
  }
  memo.set(key, best);
  return best;
}

function planFor(state: GameState, chain: CoinChain | null, stake: number, kinds: readonly CoinKind[], heirlooms: boolean, alpha = STOP_ALPHA): Plan {
  const coin = state.coin;
  const allowed = kinds.filter((k) => k === 'justa' || loadedUnlocked(coin));
  const input: PlanInput = { coin, stake, rest: chain ? coin.balance : coin.balance - stake, kinds: allowed.length ? allowed : ['justa'], heirlooms, alpha };
  const charges = chain?.charges ?? { zero: heirloomCharges(coin, 'zero'), hold: heirloomCharges(coin, 'hold'), reroll: heirloomCharges(coin, 'reroll'), mark: 0 };
  return plan(input, chain?.wins ?? 0, chain?.value ?? stake, chain?.decay ?? 0, charges.hold, charges.reroll > 0, charges.zero > 0, new Map());
}

function bestStake(state: GameState, kinds: readonly CoinKind[], heirlooms: boolean): number | null {
  const coin = state.coin;
  const now = utilityOf(coin.balance + 1, STAKE_ALPHA);
  let best: { amount: number; g: number } | null = null;
  for (const chip of coinChips(coin)) {
    if (!chip.affordable || chip.amount < 1) continue;
    const g = planFor(state, null, chip.amount, kinds, heirlooms, STAKE_ALPHA).v - now;
    if (g > (best?.g ?? 0)) best = { amount: chip.amount, g };
  }
  return best?.amount ?? null;
}

function ceilingIsBinding(state: GameState): boolean {
  const coin = state.coin;
  return coin.balance * 0.05 >= coinCeiling(coin);
}

const BOTH: readonly CoinKind[] = ['justa', 'cargada'];
const FAIR: readonly CoinKind[] = ['justa'];
const LOADED: readonly CoinKind[] = ['cargada'];
/** Herencias con cargas medias (nivel 2 de cada una). */
export const MEDIUM: Partial<Record<HeirloomId, number>> = { zero: 2, hold: 2, reroll: 2, mark: 2 };

const smartBuys = (id: CoinUpgradeId, state: GameState) => id !== 'maxBet' || ceilingIsBinding(state);
/**
 * Lo que se guarda antes de comprar mejoras: la apuesta óptima, como mucho el 20% del saldo (con
 * cadenas la apuesta de Kelly llega a ser casi todo el saldo y retrasaba la suerte hasta el final).
 */
const smartReserve = (kinds: readonly CoinKind[], heirlooms: boolean) => (state: GameState) =>
  Math.min(bestStake(state, kinds, heirlooms) ?? 0, state.coin.balance * 0.2);
const recommended = (state: GameState) => recommendedImpProfile(state.coin);
const minChip = (state: GameState) => coinChips(state.coin)[0]?.amount ?? null;
const allIn = (state: GameState) => {
  const chips = coinChips(state.coin).filter((c) => c.affordable);
  return chips[chips.length - 1]?.amount ?? null;
};

/** Estrategia de programación dinámica con unas monedas y, si acaso, herencias. */
function optimal(id: string, label: string, kinds: readonly CoinKind[], heirlooms: Partial<Record<HeirloomId, number>>): CoinStrategy {
  const use = Object.values(heirlooms).some((x) => (x ?? 0) > 0);
  return {
    id,
    label,
    chooseStake: (s) => bestStake(s, kinds, use),
    decide: (s, chain) => {
      const stake = chain?.stake ?? bestStake(s, kinds, use) ?? 1;
      return planFor(s, chain, stake, kinds, use).act;
    },
    useHeirlooms: use,
    heirlooms,
    impProfile: recommended,
    buys: (u, s) => (u === 'loaded' ? kinds.includes('cargada') : smartBuys(u, s)),
    reserve: smartReserve(kinds, use),
    priority: ['luck'] as const,
  };
}

const asKind = (a: CoinKind | 'stop'): CoinKind => (a === 'stop' ? 'justa' : a);

export const COIN_STRATEGIES: CoinStrategy[] = [
  {
    id: 'a',
    label: '(a) Ficha mínima, justa, se retira a la primera',
    chooseStake: minChip,
    decide: (_, chain) => (chain ? 'stop' : 'justa'),
    useHeirlooms: false,
    heirlooms: {},
    impProfile: () => 0,
    buys: (u) => u !== 'loaded',
    reserve: () => 0,
  },
  {
    id: 'b',
    label: '(b) Siempre TODO, justa, sigue hasta el final',
    chooseStake: allIn,
    decide: () => 'justa',
    useHeirlooms: true,
    heirlooms: MEDIUM,
    impProfile: recommended,
    buys: (u) => u !== 'loaded',
    reserve: (s) => coinCeiling(s.coin),
  },
  optimal('bj', '(bj) Siempre justa (óptima), herencias medias', FAIR, MEDIUM),
  { ...optimal('bc', '(bc) Siempre cargada (óptima), herencias medias', LOADED, MEDIUM), priority: ['loaded', 'luck'] as const },
  {
    ...optimal('b3', '(b3) Apuesta óptima, sigue hasta el final, herencias medias', BOTH, MEDIUM),
    decide: (s, chain) => asKind(planFor(s, chain, chain?.stake ?? bestStake(s, BOTH, true) ?? 1, BOTH, true).act),
  },
  {
    ...optimal('bn', '(bn) Apuesta óptima, sigue hasta 3 aciertos, herencias medias', BOTH, MEDIUM),
    decide: (s, chain) => ((chain?.wins ?? 0) >= 3 ? 'stop' : asKind(planFor(s, chain, chain?.stake ?? bestStake(s, BOTH, true) ?? 1, BOTH, true).act)),
  },
  {
    ...optimal('b4', '(b4) Apuesta óptima, se retira a la primera, herencias medias', BOTH, MEDIUM),
    decide: (s, chain) => (chain ? 'stop' : asKind(planFor(s, null, bestStake(s, BOTH, true) ?? 1, BOTH, true).act)),
  },
  optimal('c', '(c) Óptima, las dos monedas, sin herencias', BOTH, {}),
  optimal('cj', '(cj) Óptima, solo la justa, sin herencias', FAIR, {}),
  optimal('d', '(d) Óptima, las dos monedas, herencias medias', BOTH, MEDIUM),
];

/** Cada herencia sola (nivel 2), para medir su ventaja frente a (c). */
export const HEIRLOOM_STUDY: CoinStrategy[] = HEIRLOOM_IDS.map((id) => optimal(`h-${id}`, `(c) + solo ${CONFIG.coin.heirlooms[id].name} (2)`, BOTH, { [id]: 2 }));

export const IMP_STUDY: CoinStrategy[] = CONFIG.coin.helper.profiles.map((profile, index) => ({
  ...COIN_STRATEGIES.find((s) => s.id === 'd')!,
  id: `i${index}`,
  label: `Diablillo ${profile.name.toLowerCase()}`,
  impProfile: () => index,
  buys: (id: CoinUpgradeId, s: GameState) => (id === 'helperProfile' ? s.coin.upgrades.helperProfile < index : smartBuys(id, s)),
  priority: ['imp', 'helperProfile'] as const,
}));
