import { payCardsDebt } from '../src/game/cards/table';
import { CONFIG, COIN_UPGRADE_IDS, type CoinUpgradeId } from '../src/game/config';
import {
  acceptLoss,
  cashOut,
  chainValue,
  coinCeiling,
  coinChips,
  continueChain,
  flipChance,
  startChain,
  useSecondChance,
} from '../src/game/coin/game';
import type { CoinState } from '../src/game/coin/state';
import { buyCoinUpgrade, canBuyCoin, coinNextCost, coinPassiveRate, recommendedImpProfile, selectImpProfile } from '../src/game/coin/table';
import { seededRng, type Rng } from '../src/game/rng';
import type { GameState } from '../src/game/state';
import { updateGame } from '../src/game/update';
import { CARDS_STRATEGIES, runCards } from './cardsEngine';
import { DEFAULT_PLAYER, phaseOf, type Phase, type PlayerModel } from './engine';

/**
 * Simulación de la mesa 5 (doble o nada): empieza al pagar la deuda de la mesa 4 (estado real de una
 * partida (d) de la mesa 4, que viene de las anteriores, misma semilla) y juega hasta reunir los 10M
 * de oro. Las mesas 1-4 siguen solas; la 4 alimenta la conversión. Cada decisión (apostar, seguir,
 * retirarse, segunda oportunidad, aceptar) gasta una acción (0,5 s) y entre lanzamientos pasa como
 * mínimo betInterval (lo que tarda la moneda en caer).
 */
export interface CoinStrategy {
  id: string;
  label: string;
  /** Apuesta con la que empezar una cadena (cantidad), o null para no jugar. */
  chooseStake(state: GameState): number | null;
  /** Tras una cara: ¿seguir? */
  wantsContinue(state: GameState): boolean;
  /** Tras una cruz con cargas: ¿segunda oportunidad? */
  wantsSecond(state: GameState): boolean;
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
  seconds: number;
  jackpots: number;
  helper: Record<Phase, { bets: number; delta: number; staked: number; bankruptcies: number }>;
  passive: { start: number; end: number };
  /** Compras (para estudiar la progresión): segundo, mejora, nivel y saldo después. */
  timeline: { t: number; id: CoinUpgradeId; level: number; balance: number }[];
}

const startCache = new Map<number, { state: GameState; time: number }>();

export function table4Start(seed: number): { state: GameState; time: number } {
  // Estados guardados en disco por coinSimulate --cache (las cuatro mesas anteriores tardan mucho).
  const disk = (globalThis as { __coinStarts?: Record<string, { state: GameState; time: number }> }).__coinStarts?.[seed];
  if (disk) return { state: structuredClone(disk.state), time: disk.time };
  let cached = startCache.get(seed);
  if (!cached) {
    const d = CARDS_STRATEGIES.find((s) => s.id === 'd')!;
    const run = runCards(d, seed);
    payCardsDebt(run.finalState.cards);
    cached = { state: run.finalState, time: run.previousTime + run.time };
    startCache.set(seed, cached);
  }
  return { state: structuredClone(cached.state), time: cached.time };
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
    seconds: 0,
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

  const record = () => {
    const phase = phaseOf(coin.upgrades.luck);
    const fresh = coin.recentChains.filter((c) => !counted.has(c)).reverse();
    for (const c of fresh) {
      counted.add(c);
      jackpotTotal += c.jackpot;
      if (c.result !== 'perdido') {
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
        if (strategy.wantsContinue(state)) {
          if (sinceFlip < player.betInterval) continue;
          continueChain(coin, chain, rng);
          sinceFlip = 0;
        } else cashOut(coin, chain);
      } else if (chain.status === 'fallo') {
        if (coin.seconds.charges > 0 && strategy.wantsSecond(state)) {
          if (sinceFlip < player.betInterval) continue;
          useSecondChance(coin, chain, rng);
          result.seconds++;
          sinceFlip = 0;
        } else acceptLoss(coin, chain);
      }
      record();
      continue;
    }

    const stake = strategy.chooseStake(state);
    if (stake !== null && stake >= CONFIG.coin.bet.minBet && sinceFlip >= player.betInterval) {
      startChain(coin, { bettor: 'jugador', stake }, rng);
      sinceFlip = 0;
      record();
    }
    if (coin.balance >= CONFIG.coin.debt.amount) break;
  }

  result.time = coin.playTime;
  result.finished = coin.balance >= CONFIG.coin.debt.amount;
  result.passive.end = coinPassiveRate(state);
  result.jackpots = coin.stats.jackpots;
  result.earned.passive = coin.stats.passiveEarned;
  result.earned.jackpot = jackpotTotal;
  result.chains.meanStop = result.chains.cashouts ? stopSum / result.chains.cashouts : 0;
  const totalGain = coin.balance - startBalance + spent;
  result.earned.chains = totalGain - result.earned.passive - result.earned.jackpot;
  return result;
}

// ---------------------------------------------------------------------------
// Estrategia óptima: programación dinámica sobre las caras que quedan (crecimiento logarítmico)

/**
 * Valor (log del saldo) de una cadena con `stake` apostado y `wins` caras, jugando de forma óptima
 * desde ahí: retirarse o seguir; tras una cruz, una segunda oportunidad si `seconds` y hay cargas.
 * `rest` es el saldo sin la cadena.
 */
export function chainPlan(coin: CoinState, stake: number, rest: number, seconds: boolean): { continueAt: boolean[]; value0: number } {
  const max = CONFIG.coin.chain.maxWins;
  const fraction = stake / coinCeiling(coin);
  const base = Math.log(Math.max(rest, 0) + 1);
  const V: number[] = new Array(max + 1).fill(0);
  const cont: boolean[] = new Array(max + 1).fill(false);
  V[max] = Math.log(rest + 1 + chainValue(stake, max) + Math.min(coin.pot, CONFIG.coin.debt.amount * CONFIG.coin.jackpot.payoutCapDebtFraction));
  const charges = seconds && coin.seconds.charges > 0;
  for (let w = max - 1; w >= 0; w--) {
    const p = flipChance(coin.upgrades.luck, coin.upgrades.temple, w, fraction);
    const next = V[w + 1];
    const lose = charges && w > 0 ? p * next + (1 - p) * base : base;
    const goOn = p * next + (1 - p) * lose;
    const stop = w > 0 ? Math.log(rest + 1 + chainValue(stake, w)) : -Infinity;
    if (stake * 2 ** w >= CONFIG.coin.debt.amount * CONFIG.coin.chain.payoutCapDebtFraction && w > 0) {
      V[w] = stop;
      cont[w] = false;
      continue;
    }
    cont[w] = goOn > stop;
    V[w] = Math.max(goOn, stop);
  }
  return { continueAt: cont, value0: V[0] };
}

function bestStake(state: GameState, seconds: boolean): number | null {
  const coin = state.coin;
  const now = Math.log(coin.balance + 1);
  let best: { amount: number; g: number } | null = null;
  for (const chip of coinChips(coin)) {
    if (!chip.affordable || chip.amount < 1) continue;
    const g = chainPlan(coin, chip.amount, coin.balance - chip.amount, seconds).value0 - now;
    if (g > (best?.g ?? 0)) best = { amount: chip.amount, g };
  }
  return best?.amount ?? null;
}

function optimalContinue(state: GameState, seconds: boolean): boolean {
  const coin = state.coin;
  const chain = coin.chain!;
  return chainPlan(coin, chain.stake, coin.balance, seconds).continueAt[chain.wins];
}

function ceilingIsBinding(state: GameState): boolean {
  const coin = state.coin;
  return coin.balance * 0.05 >= coinCeiling(coin);
}

const smartBuys = (id: CoinUpgradeId, state: GameState) => id !== 'maxBet' || ceilingIsBinding(state);
/**
 * Lo que se guarda antes de comprar mejoras: la apuesta óptima, como mucho el 20% del saldo. Con
 * cadenas la apuesta de Kelly llega a ser casi todo el saldo, y reservarla entera retrasaba la
 * suerte hasta el final (un jugador de verdad la compra en cuanto puede).
 */
const smartReserve = (seconds: boolean) => (state: GameState) => Math.min(bestStake(state, seconds) ?? 0, state.coin.balance * 0.2);
const recommended = (state: GameState) => recommendedImpProfile(state.coin);
const minChip = (state: GameState) => coinChips(state.coin)[0]?.amount ?? null;
const allIn = (state: GameState) => {
  const chips = coinChips(state.coin).filter((c) => c.affordable);
  return chips[chips.length - 1]?.amount ?? null;
};

export const COIN_STRATEGIES: CoinStrategy[] = [
  {
    id: 'a',
    label: '(a) Ficha mínima, se retira a la primera',
    chooseStake: minChip,
    wantsContinue: () => false,
    wantsSecond: () => false,
    impProfile: () => 0,
    buys: () => true,
    reserve: () => 0,
  },
  {
    id: 'b',
    label: '(b) Siempre TODO y siempre sigue hasta 10',
    chooseStake: allIn,
    wantsContinue: () => true,
    wantsSecond: () => true,
    impProfile: recommended,
    buys: () => true,
    reserve: (s) => coinCeiling(s.coin),
  },
  {
    id: 'b2',
    label: '(b2) Apuesta óptima, siempre se retira a la primera',
    chooseStake: (s) => bestStake(s, false),
    wantsContinue: () => false,
    wantsSecond: () => false,
    impProfile: recommended,
    buys: smartBuys,
    reserve: smartReserve(false),
    priority: ['luck'] as const,
  },
  {
    id: 'b3',
    label: '(b3) Apuesta óptima, siempre sigue hasta 10',
    chooseStake: (s) => bestStake(s, true),
    wantsContinue: () => true,
    wantsSecond: () => true,
    impProfile: recommended,
    buys: smartBuys,
    reserve: smartReserve(true),
    priority: ['luck'] as const,
  },
  {
    id: 'c',
    label: '(c) Óptima, sin segunda oportunidad',
    chooseStake: (s) => bestStake(s, false),
    wantsContinue: (s) => optimalContinue(s, false),
    wantsSecond: () => false,
    impProfile: recommended,
    buys: smartBuys,
    reserve: smartReserve(false),
    priority: ['luck'] as const,
  },
  {
    id: 'd',
    label: '(d) Óptima, con segunda oportunidad',
    chooseStake: (s) => bestStake(s, true),
    wantsContinue: (s) => optimalContinue(s, true),
    wantsSecond: (s) => (s.coin.chain?.wins ?? 0) > 0,
    impProfile: recommended,
    buys: smartBuys,
    reserve: smartReserve(true),
    priority: ['luck'] as const,
  },
];

export const IMP_STUDY: CoinStrategy[] = CONFIG.coin.helper.profiles.map((profile, index) => ({
  ...COIN_STRATEGIES.find((s) => s.id === 'd')!,
  id: `i${index}`,
  label: `Diablillo ${profile.name.toLowerCase()}`,
  impProfile: () => index,
  buys: (id: CoinUpgradeId, s: GameState) => (id === 'helperProfile' ? s.coin.upgrades.helperProfile < index : smartBuys(id, s)),
  priority: ['imp', 'helperProfile'] as const,
}));
