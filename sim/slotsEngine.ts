import { CONFIG, UPGRADE_IDS, type SlotUpgradeId, type UpgradeId } from '../src/game/config';
import { payDebt } from '../src/game/debt';
import { selectHelperProfile } from '../src/game/helper';
import { seededRng, type Rng } from '../src/game/rng';
import {
  holdFee,
  MEAN_WIN_PAYOUT,
  slotCeiling,
  slotChips,
  slotJackpotChance,
  slotJackpotPayout,
  slotWinChance,
  heldWinChance,
  holdableReel,
  spinSlots,
} from '../src/game/slots/machine';
import {
  buySlotUpgrade,
  canBuySlot,
  collectSlotItem,
  passiveRate,
  selectZombieProfile,
  slotItemValue,
  slotNextCost,
  zombieLuckBonus,
} from '../src/game/slots/table';
import type { GameState } from '../src/game/state';
import { updateGame } from '../src/game/update';
import { buyUpgrade, canBuy, nextCost } from '../src/game/upgrades';
import { DEFAULT_PLAYER, phaseOf, PHASES, runOne, type Phase, type PlayerModel, type Strategy } from './engine';
import { STRATEGIES } from './strategies';

/**
 * Simulación de la mesa 2: empieza en el momento en que se paga la deuda de la mesa 1 (con el
 * estado real de una partida de la estrategia (c) de la mesa 1) y juega la tragaperras hasta
 * reunir 10M de monedas. La mesa 1 sigue sola con su ayudante y su limpiador, y alimenta la
 * conversión. Mismo jugador que en la mesa 1: una acción cada 0,5 s, salas con 1,5 s por cambio.
 */
export interface SlotStrategy {
  id: string;
  label: string;
  /** Qué tira ahora: cantidad de la ficha y si retiene (carrete) o no. null = no tira. */
  chooseSpin(state: GameState): { chipIndex: number; hold: number | null } | null;
  zombieProfile(state: GameState): number;
  buys(id: SlotUpgradeId, state: GameState): boolean;
  reserve(state: GameState): number;
  /** Gasta las fichas de la mesa 1 en mejoras que suben su ingreso (y con él el pasivo). */
  investTable1?: boolean;
  priority?: readonly SlotUpgradeId[];
}

export interface SlotRunResult {
  finished: boolean;
  /** Segundos desde que se abre la mesa 2 hasta tener 10M de monedas. */
  time: number;
  /** Tiempo de la mesa 1 que se usó como punto de partida. */
  table1Time: number;
  luckMaxTime: number | null;
  firstLuckTime: number | null;
  bankruptcies: Record<Phase, number>;
  reachedPhase: Record<Phase, boolean>;
  earned: { work: number; machine: number; jackpot: number; passive: number };
  lost: number;
  spins: { player: number; helper: number; held: number };
  jackpots: number;
  jackpotsCapped: number;
  purchases: { id: SlotUpgradeId; level: number; time: number }[];
  table1Purchases: number;
  helper: Record<Phase, { bets: number; delta: number; staked: number; bankruptcies: number }>;
  /** Pasivo por segundo al empezar y al terminar. */
  passive: { start: number; end: number };
}

const SIDE: readonly SlotUpgradeId[] = ['helperLuck', 'jackpot'];
const SIDE_BUDGET = 0.25;
/** Mejoras de la mesa 1 que suben su ingreso cuando juega sola. */
const TABLE1_INCOME: readonly UpgradeId[] = ['crupier', 'helperSpeed', 'helperProfile', 'helperLuck', 'cleaner', 'bigBag', 'maxBet', 'luck'];

/** Estados de partida de la mesa 1 al pagar la deuda, uno por semilla (con la estrategia c). */
const startCache = new Map<number, { state: GameState; time: number }>();

export function table1Start(seed: number): { state: GameState; time: number } {
  let cached = startCache.get(seed);
  if (!cached) {
    const c = STRATEGIES.find((s) => s.id === 'c')!;
    const run = runOne(c, seed);
    payDebt(run.finalState);
    cached = { state: run.finalState, time: run.time };
    startCache.set(seed, cached);
  }
  return { state: structuredClone(cached.state), time: cached.time };
}

export function runSlots(strategy: SlotStrategy, seed: number, player: PlayerModel = DEFAULT_PLAYER): SlotRunResult {
  const start = table1Start(seed);
  const state = start.state;
  state.activeTable = 2;
  const slots = state.slots;
  const rng: Rng = seededRng(seed * 7919 + 13);
  const empty = () => ({ bets: 0, delta: 0, staked: 0, bankruptcies: 0 });
  const result: SlotRunResult = {
    finished: false,
    time: 0,
    table1Time: start.time,
    luckMaxTime: null,
    firstLuckTime: null,
    bankruptcies: { inicio: 0, media: 0, alta: 0, final: 0 },
    reachedPhase: { inicio: true, media: false, alta: false, final: false },
    earned: { work: 0, machine: 0, jackpot: 0, passive: 0 },
    lost: 0,
    spins: { player: 0, helper: 0, held: 0 },
    jackpots: 0,
    jackpotsCapped: 0,
    purchases: [],
    table1Purchases: 0,
    helper: { inicio: empty(), media: empty(), alta: empty(), final: empty() },
    passive: { start: passiveRate(state), end: 0 },
  };

  let actionTimer = 0;
  let betTimer = player.betInterval;
  let room: 'casino' | 'trastienda' = 'casino';
  let switchLeft = 0;
  let seen = slots.stats.spins;
  const goTo = (next: typeof room) => {
    room = next;
    switchLeft = player.roomSwitchSeconds;
  };

  const record = () => {
    const count = Math.min(slots.stats.spins - seen, CONFIG.tech.recentSpins);
    seen = slots.stats.spins;
    const phase = phaseOf(slots.upgrades.luck);
    for (let i = count - 1; i >= 0; i--) {
      const spin = slots.recentSpins[i];
      if (spin.bettor === 'jugador') result.spins.player++;
      else {
        result.spins.helper++;
        const h = result.helper[phase];
        h.bets++;
        h.delta += spin.delta;
        h.staked += spin.bet;
      }
      if (spin.held !== null) result.spins.held++;
      if (spin.outcome === 'jackpot') {
        result.earned.jackpot += spin.delta;
        result.jackpots++;
        if (spin.jackpotCapped) result.jackpotsCapped++;
      } else if (spin.delta > 0) result.earned.machine += spin.delta;
      else result.lost -= spin.delta;
    }
    if (count > 0 && slots.balance < CONFIG.slots.bet.minBet) {
      result.bankruptcies[phase]++;
      if (slots.recentSpins[0]?.bettor === 'ayudante') result.helper[phase].bankruptcies++;
    }
  };

  while (slots.playTime < player.timeLimit) {
    const passiveBefore = slots.stats.passiveEarned;
    const tick = updateGame(state, player.dt, rng);
    result.earned.passive += slots.stats.passiveEarned - passiveBefore;
    for (const c of tick.slots.cleaned) result.earned.work += c.value;
    record();
    if (slots.balance >= CONFIG.slots.debt.amount) break;

    // Compras en la mesa 2.
    for (;;) {
      let best: SlotUpgradeId | null = strategy.priority?.find((id) => strategy.buys(id, state) && canBuySlot(slots, id)) ?? null;
      if (!best) {
        for (const id of Object.keys(CONFIG.slots.upgrades) as SlotUpgradeId[]) {
          if (!strategy.buys(id, state) || !canBuySlot(slots, id)) continue;
          const cost = slotNextCost(slots, id)!;
          if (slots.balance - cost < strategy.reserve(state)) continue;
          if (SIDE.includes(id) && cost > slots.balance * SIDE_BUDGET) continue;
          if (best === null || cost < slotNextCost(slots, best)!) best = id;
        }
      }
      if (best === null) break;
      buySlotUpgrade(slots, best);
      result.purchases.push({ id: best, level: slots.upgrades[best], time: slots.playTime });
      if (best === 'luck') {
        result.firstLuckTime ??= slots.playTime;
        result.reachedPhase[phaseOf(slots.upgrades.luck)] = true;
        if (slots.upgrades.luck >= CONFIG.slots.upgrades.luck.maxLevel) result.luckMaxTime = slots.playTime;
      }
    }
    selectZombieProfile(slots, Math.min(strategy.zombieProfile(state), slots.upgrades.helperProfile));

    // La mesa 1: el jugador vuelve a gastar sus fichas en lo que sube su ingreso (la más barata).
    if (strategy.investTable1) {
      for (;;) {
        let best: UpgradeId | null = null;
        for (const id of TABLE1_INCOME) {
          if (!canBuy(state, id)) continue;
          if (best === null || nextCost(state, id)! < nextCost(state, best)!) best = id;
        }
        if (best === null) break;
        buyUpgrade(state, best);
        result.table1Purchases++;
      }
      selectHelperProfile(state, state.upgrades.helperProfile);
    }

    betTimer += player.dt;
    if (switchLeft > 0) {
      switchLeft -= player.dt;
      continue;
    }
    actionTimer += player.dt;
    if (actionTimer < player.actionInterval) continue;
    actionTimer -= player.actionInterval;

    const wanted = strategy.chooseSpin(state);
    const items = slots.work.items.length;
    const trashWorthIt = slotCeiling(slots) <= player.ignoreTrashAboveCeiling;
    if (room === 'casino') {
      if ((trashWorthIt && items >= player.collectAtItems) || (!wanted && items > 0)) {
        goTo('trastienda');
        continue;
      }
    } else {
      if (items > 0 && (trashWorthIt || !wanted)) {
        const top = slots.work.items.reduce((a, b) => (slotItemValue(slots, b.kind) > slotItemValue(slots, a.kind) ? b : a));
        for (const c of collectSlotItem(slots, top.id)) result.earned.work += c.value;
      } else if (wanted) goTo('casino');
      continue;
    }
    if (wanted && betTimer >= player.betInterval) {
      const chip = slotChips(slots).find((c) => c.index === wanted.chipIndex);
      if (!chip?.affordable) continue;
      const spin = spinSlots(slots, { bettor: 'jugador', bet: chip.amount, hold: wanted.hold, from: slots.reels }, rng);
      if (spin) {
        slots.reels = spin.reels;
        betTimer = 0;
        record();
      }
    }
    if (slots.balance >= CONFIG.slots.debt.amount) break;
  }

  result.time = slots.playTime;
  result.finished = slots.balance >= CONFIG.slots.debt.amount;
  result.passive.end = passiveRate(state);
  return result;
}

// ---------------------------------------------------------------------------
// Estrategias

const TODO = CONFIG.bet.quickFractions.length - 1;
const T = CONFIG.slots.tripleShare;

/** Crecimiento logarítmico esperado del saldo con una tirada (Kelly), con o sin retener. */
function slotGrowth(state: GameState, bet: number, hold: boolean): number {
  const slots = state.slots;
  const B = slots.balance;
  const fee = hold ? holdFee(bet) : 0;
  if (bet <= 0 || bet + fee >= B) return -Infinity;
  const ceiling = slotCeiling(slots);
  let p = slotWinChance(slots.upgrades.luck, bet / ceiling);
  if (hold) p = heldWinChance(p, slots.upgrades.hold);
  const pj = hold ? 0 : slotJackpotChance(slots.upgrades.luck, slots.upgrades.jackpot);
  const x = bet / B;
  const f = fee / B;
  const lose = Math.log1p(-x - f);
  const pair = Math.log1p((CONFIG.slots.pairPayout - 1) * x - f);
  const trio = Math.log1p((CONFIG.slots.triplePayout - 1) * x - f);
  const jack = Math.log1p(slotJackpotPayout(bet, slots.pot).gain / B - f);
  return pj * jack + (1 - pj) * (p * ((1 - T) * pair + T * trio) + (1 - p) * lose);
}

export function bestSpin(state: GameState, allowHold: boolean): { chipIndex: number; hold: number | null } | null {
  const slots = state.slots;
  let best: { chipIndex: number; hold: number | null; growth: number } | null = null;
  const holdReel = holdableReel(slots.reels);
  for (const chip of slotChips(slots)) {
    if (!chip.affordable) continue;
    for (const hold of allowHold && slots.upgrades.hold > 0 && holdReel !== null ? [false, true] : [false]) {
      const growth = slotGrowth(state, chip.amount, hold);
      if (growth > (best?.growth ?? 0)) best = { chipIndex: chip.index, hold: hold ? holdReel : null, growth };
    }
  }
  return best && { chipIndex: best.chipIndex, hold: best.hold };
}

/** Perfil del zombi con mayor crecimiento (el más prudente si ninguno crece). */
function bestZombieProfile(state: GameState): number {
  const slots = state.slots;
  const ceiling = slotCeiling(slots);
  let best = 0;
  let bestGrowth = 0;
  CONFIG.slots.helper.profiles.forEach((profile, i) => {
    if (i > slots.upgrades.helperProfile) return;
    const bet = Math.min(Math.floor(ceiling * profile.fraction), Math.floor(slots.balance * profile.maxBalanceFraction));
    if (bet < 1) return;
    const p = slotWinChance(slots.upgrades.luck, bet / ceiling, zombieLuckBonus(slots.upgrades.helperLuck));
    const x = bet / slots.balance;
    const growth = p * ((1 - T) * Math.log1p(0.5 * x) + T * Math.log1p(9 * x)) + (1 - p) * Math.log1p(-x);
    if (growth > bestGrowth) {
      best = i;
      bestGrowth = growth;
    }
  });
  return best;
}

/** El techo solo se sube cuando limita (como en la mesa 1). */
function ceilingIsBinding(state: GameState): boolean {
  const slots = state.slots;
  const p = slotWinChance(slots.upgrades.luck, 0.5);
  const edge = Math.max(p * MEAN_WIN_PAYOUT - 1, 0);
  return slots.balance * edge >= slotCeiling(slots) * 0.5;
}

const smartBuys = (hold: boolean) => (id: SlotUpgradeId, state: GameState) => {
  if (id === 'hold' && !hold) return false;
  return id !== 'maxBet' || ceilingIsBinding(state);
};

function smartReserve(state: GameState): number {
  const spin = bestSpin(state, false);
  return spin ? (slotChips(state.slots).find((c) => c.index === spin.chipIndex)?.amount ?? 0) : 0;
}

export const SLOT_STRATEGIES: SlotStrategy[] = [
  {
    id: 'a',
    label: '(a) Ficha mínima, sin retener',
    chooseSpin: () => ({ chipIndex: 0, hold: null }),
    zombieProfile: () => 0,
    buys: (id) => id !== 'hold',
    reserve: () => 0,
  },
  {
    id: 'b',
    label: '(b) Siempre TODO, sin retener',
    chooseSpin: () => ({ chipIndex: TODO, hold: null }),
    zombieProfile: (s) => s.slots.upgrades.helperProfile,
    buys: (id) => id !== 'hold',
    reserve: (s) => slotCeiling(s.slots),
  },
  {
    id: 'c',
    label: '(c) Ficha óptima, sin retener',
    chooseSpin: (s) => bestSpin(s, false),
    zombieProfile: bestZombieProfile,
    buys: smartBuys(false),
    reserve: smartReserve,
  },
  {
    id: 'd',
    label: '(d) Ficha óptima y retener cuando compensa',
    chooseSpin: (s) => bestSpin(s, true),
    zombieProfile: bestZombieProfile,
    buys: smartBuys(true),
    reserve: smartReserve,
  },
  // Una (d) que además gaste las fichas de la mesa 1 en ella sale igual: el jugador simulado llega
  // a pagar la mesa 1 con todo comprado, así que el pasivo solo sube por el saldo que rehace su ayudante.
];

/** Zombi con perfil fijo: el jugador juega como (d) y compra el zombi en cuanto puede. */
export const ZOMBIE_STUDY: SlotStrategy[] = CONFIG.slots.helper.profiles.map((profile, index) => ({
  id: `z${index}`,
  label: `Zombi ${profile.name.toLowerCase()}`,
  chooseSpin: (s: GameState) => bestSpin(s, true),
  zombieProfile: () => index,
  buys: (id: SlotUpgradeId, s: GameState) => (id === 'helperProfile' ? s.slots.upgrades.helperProfile < index : smartBuys(true)(id, s)),
  reserve: smartReserve,
  priority: ['zombie', 'helperProfile'] as const,
}));

export { PHASES };
export type { Strategy };
// UPGRADE_IDS se reexporta para el informe.
export { UPGRADE_IDS };
