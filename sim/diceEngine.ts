import { CONFIG, DICE_TARGETS, DICE_UPGRADE_IDS, type DiceTarget, type DiceUpgradeId } from '../src/game/config';
import { seededRng, type Rng } from '../src/game/rng';
import { paySlotsDebt } from '../src/game/slots/table';
import {
  bestReroll,
  closeOpenRoll,
  diceChips,
  diceCeiling,
  hits,
  isTargetUnlocked,
  openRoll,
  reroll,
  rollDice,
  targetChance,
} from '../src/game/dice/game';
import {
  buyDiceUpgrade,
  canBuyDice,
  collectDiceItem,
  diceItemValue,
  diceNextCost,
  dicePassiveRate,
  ghostLuckBonus,
  selectGhostProfile,
} from '../src/game/dice/table';
import type { GameState } from '../src/game/state';
import { updateGame } from '../src/game/update';
import { DEFAULT_PLAYER, phaseOf, type Phase, type PlayerModel } from './engine';
import { runSlots, SLOT_STRATEGIES } from './slotsEngine';

/**
 * Simulación de la mesa 3: empieza al pagar la deuda de la mesa 2 (estado real de una partida (d)
 * de la mesa 2, que a su vez empieza desde una (c) de la mesa 1, misma semilla) y juega a los dados
 * hasta reunir 10M de chapas. Las mesas 1 y 2 siguen solas; la 2 alimenta la conversión.
 */
export interface DiceStrategy {
  id: string;
  label: string;
  chooseRoll(state: GameState): { chipIndex: number; target: DiceTarget } | null;
  /** Tras una tirada perdida abierta: qué dado relanzar, o null para aceptarla. */
  rerollDie(state: GameState): number | null;
  ghostProfile(state: GameState): number;
  buys(id: DiceUpgradeId, state: GameState): boolean;
  reserve(state: GameState): number;
  priority?: readonly DiceUpgradeId[];
}

export interface DiceRunResult {
  finished: boolean;
  time: number;
  /** Tiempo de las mesas 1 y 2 hasta llegar aquí. */
  previousTime: number;
  luckMaxTime: number | null;
  bankruptcies: Record<Phase, number>;
  reachedPhase: Record<Phase, boolean>;
  earned: { work: number; dice: number; jackpot: number; passive: number };
  rolls: { player: number; helper: number };
  rerolls: number;
  rerollWins: number;
  jackpots: number;
  targets: Record<DiceTarget, number>;
  helper: Record<Phase, { bets: number; delta: number; staked: number; bankruptcies: number }>;
  passive: { start: number; end: number };
}

const SIDE: readonly DiceUpgradeId[] = ['helperLuck', 'jackpot'];
const SIDE_BUDGET = 0.25;

const startCache = new Map<number, { state: GameState; time: number }>();

export function table2Start(seed: number): { state: GameState; time: number } {
  let cached = startCache.get(seed);
  if (!cached) {
    const d = SLOT_STRATEGIES.find((s) => s.id === 'd')!;
    const run = runSlots(d, seed);
    paySlotsDebt(run.finalState.slots);
    cached = { state: run.finalState, time: run.table1Time + run.time };
    startCache.set(seed, cached);
  }
  return { state: structuredClone(cached.state), time: cached.time };
}

export function runDice(strategy: DiceStrategy, seed: number, player: PlayerModel = DEFAULT_PLAYER): DiceRunResult {
  const start = table2Start(seed);
  const state = start.state;
  state.activeTable = 3;
  const dice = state.dice;
  const rng: Rng = seededRng(seed * 104729 + 7);
  const empty = () => ({ bets: 0, delta: 0, staked: 0, bankruptcies: 0 });
  const result: DiceRunResult = {
    finished: false,
    time: 0,
    previousTime: start.time,
    luckMaxTime: null,
    bankruptcies: { inicio: 0, media: 0, alta: 0, final: 0 },
    reachedPhase: { inicio: true, media: false, alta: false, final: false },
    earned: { work: 0, dice: 0, jackpot: 0, passive: 0 },
    rolls: { player: 0, helper: 0 },
    rerolls: 0,
    rerollWins: 0,
    jackpots: 0,
    targets: Object.fromEntries(DICE_TARGETS.map((t) => [t, 0])) as Record<DiceTarget, number>,
    helper: { inicio: empty(), media: empty(), alta: empty(), final: empty() },
    passive: { start: dicePassiveRate(state), end: 0 },
  };

  let actionTimer = 0;
  let betTimer = player.betInterval;
  let room: 'casino' | 'trastienda' = 'casino';
  let switchLeft = 0;
  let seen = dice.stats.rolls;
  const goTo = (next: typeof room) => {
    room = next;
    switchLeft = player.roomSwitchSeconds;
  };

  let jackpotTotal = 0;
  /** Contabiliza las tiradas nuevas (las del ayudante ya llegan cerradas). */
  const record = () => {
    const count = Math.min(dice.stats.rolls - seen, CONFIG.tech.recentSpins);
    seen = dice.stats.rolls;
    const phase = phaseOf(dice.upgrades.luck);
    for (let i = count - 1; i >= 0; i--) {
      const roll = dice.recentRolls[i];
      jackpotTotal += roll.jackpot;
      if (roll.bettor === 'jugador') {
        result.rolls.player++;
        result.targets[roll.target]++;
      } else {
        result.rolls.helper++;
        const h = result.helper[phase];
        h.bets++;
        h.delta += roll.delta;
        h.staked += roll.bet;
      }
    }
    if (count > 0 && dice.balance < CONFIG.dice.bet.minBet) {
      result.bankruptcies[phase]++;
      if (dice.recentRolls[0]?.bettor === 'ayudante') result.helper[phase].bankruptcies++;
    }
  };

  const startBalance = dice.balance;
  let spent = 0;

  while (dice.playTime < player.timeLimit) {
    updateGame(state, player.dt, rng);
    record();
    if (dice.balance >= CONFIG.dice.debt.amount) break;

    for (;;) {
      let best: DiceUpgradeId | null = strategy.priority?.find((id) => strategy.buys(id, state) && canBuyDice(dice, id)) ?? null;
      if (!best) {
        for (const id of DICE_UPGRADE_IDS) {
          if (!strategy.buys(id, state) || !canBuyDice(dice, id)) continue;
          const cost = diceNextCost(dice, id)!;
          if (dice.balance - cost < strategy.reserve(state)) continue;
          if (SIDE.includes(id) && cost > dice.balance * SIDE_BUDGET) continue;
          if (best === null || cost < diceNextCost(dice, best)!) best = id;
        }
      }
      if (best === null) break;
      spent += diceNextCost(dice, best)!;
      buyDiceUpgrade(dice, best);
      if (best === 'luck') {
        result.reachedPhase[phaseOf(dice.upgrades.luck)] = true;
        if (dice.upgrades.luck >= CONFIG.dice.upgrades.luck.maxLevel) result.luckMaxTime ??= dice.playTime;
      }
    }
    selectGhostProfile(dice, Math.min(strategy.ghostProfile(state), dice.upgrades.helperProfile));

    betTimer += player.dt;
    if (switchLeft > 0) {
      switchLeft -= player.dt;
      continue;
    }
    actionTimer += player.dt;
    if (actionTimer < player.actionInterval) continue;
    actionTimer -= player.actionInterval;

    // Una tirada perdida abierta se decide en la siguiente acción.
    const open = openRoll(dice);
    if (open) {
      const die = strategy.rerollDie(state);
      if (die !== null && reroll(dice, open, die, rng)) {
        result.rerolls++;
        if (open.won) result.rerollWins++;
        jackpotTotal += open.jackpot;
      } else closeOpenRoll(dice);
      continue;
    }

    const wanted = strategy.chooseRoll(state);
    const items = dice.work.items.length;
    const trashWorthIt = diceCeiling(dice) <= player.ignoreTrashAboveCeiling;
    if (room === 'casino') {
      if ((trashWorthIt && items >= player.collectAtItems) || (!wanted && items > 0)) {
        goTo('trastienda');
        continue;
      }
    } else {
      if (items > 0 && (trashWorthIt || !wanted)) {
        const top = dice.work.items.reduce((a, b) => (diceItemValue(dice, b.kind) > diceItemValue(dice, a.kind) ? b : a));
        collectDiceItem(dice, top.id);
      } else if (wanted) goTo('casino');
      continue;
    }
    if (wanted && betTimer >= player.betInterval) {
      const chip = diceChips(dice).find((c) => c.index === wanted.chipIndex);
      if (!chip?.affordable) continue;
      if (rollDice(dice, { bettor: 'jugador', target: wanted.target, bet: chip.amount }, rng)) {
        betTimer = 0;
        record();
      }
    }
    if (dice.balance >= CONFIG.dice.debt.amount) break;
  }

  result.time = dice.playTime;
  result.finished = dice.balance >= CONFIG.dice.debt.amount;
  result.passive.end = dicePassiveRate(state);
  result.earned.work = dice.stats.workEarned;
  result.earned.passive = dice.stats.passiveEarned;
  result.jackpots = dice.stats.jackpots;
  result.earned.jackpot = jackpotTotal;
  // Neto de los dados (sin jackpot): lo ganado en total menos el resto de fuentes.
  const totalGain = dice.balance - startBalance + spent;
  result.earned.dice = totalGain - result.earned.work - result.earned.passive - result.earned.jackpot;
  return result;
}

// ---------------------------------------------------------------------------
// Estrategias

const TODO = CONFIG.bet.quickFractions.length - 1;

/** Probabilidad media de convertir una tirada perdida relanzando el mejor dado (dados perdedores al azar). */
const AVG_REROLL: Record<DiceTarget, number> = Object.fromEntries(
  DICE_TARGETS.map((t) => {
    const losing: [number, number][] = [];
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (!hits(t, [a, b])) losing.push([a, b]);
    const avg = losing.reduce((acc, p) => acc + bestReroll(t, p).chance, 0) / losing.length;
    return [t, avg];
  }),
) as Record<DiceTarget, number>;

/** Crecimiento logarítmico esperado (Kelly) de una tirada; con relanzamiento si hay cargas. */
function growth(state: GameState, target: DiceTarget, bet: number, useRerolls: boolean): number {
  const dice = state.dice;
  const B = dice.balance;
  if (bet <= 0 || bet >= B) return -Infinity;
  let p = targetChance(target, dice.upgrades.luck, bet / diceCeiling(dice));
  if (useRerolls && dice.rerolls.charges > 0) p += (1 - p) * AVG_REROLL[target];
  const x = bet / B;
  return p * Math.log1p(CONFIG.dice.targets[target].payout * x) + (1 - p) * Math.log1p(-x);
}

function bestRoll(state: GameState, useRerolls: boolean, targets?: DiceTarget[]): { chipIndex: number; target: DiceTarget } | null {
  const dice = state.dice;
  let best: { chipIndex: number; target: DiceTarget; g: number } | null = null;
  for (const target of targets ?? DICE_TARGETS) {
    if (!isTargetUnlocked(dice, target)) continue;
    for (const chip of diceChips(dice)) {
      if (!chip.affordable) continue;
      const g = growth(state, target, chip.amount, useRerolls);
      if (g > (best?.g ?? 0)) best = { chipIndex: chip.index, target, g };
    }
  }
  return best && { chipIndex: best.chipIndex, target: best.target };
}

/** Relanza el mejor dado si convierte con al menos 1/3, o con cualquier probabilidad si las cargas están llenas. */
function smartReroll(state: GameState): number | null {
  const roll = openRoll(state.dice);
  if (!roll) return null;
  const best = bestReroll(roll.target, roll.dice);
  const full = state.dice.rerolls.charges >= 1 + Math.floor(state.dice.upgrades.luck / CONFIG.dice.rerolls.perLevels);
  return best.chance >= (full ? 1 / 6 : 1 / 3) ? best.die : null;
}

function bestGhostProfile(state: GameState): number {
  const dice = state.dice;
  const ceiling = diceCeiling(dice);
  let best = 0;
  let bestGrowth = 0;
  CONFIG.dice.helper.profiles.forEach((profile, i) => {
    if (i > dice.upgrades.helperProfile) return;
    const bet = Math.min(Math.floor(ceiling * profile.fraction), Math.floor(dice.balance * profile.maxBalanceFraction));
    if (bet < 1) return;
    const p = targetChance('par', dice.upgrades.luck, bet / ceiling, ghostLuckBonus(dice.upgrades.helperLuck));
    const x = bet / dice.balance;
    const g = p * Math.log1p(x) + (1 - p) * Math.log1p(-x);
    if (g > bestGrowth) {
      best = i;
      bestGrowth = g;
    }
  });
  return best;
}

function ceilingIsBinding(state: GameState): boolean {
  const dice = state.dice;
  const p = targetChance('par', dice.upgrades.luck, 0.5);
  return dice.balance * Math.max(2 * p - 1, 0) >= diceCeiling(dice) * 0.5;
}

const smartBuys = (special: boolean) => (id: DiceUpgradeId, state: GameState) => {
  if (!special && (id === 'hardTargets' || id === 'boxcars')) return false;
  return id !== 'maxBet' || ceilingIsBinding(state);
};

function smartReserve(state: GameState): number {
  const r = bestRoll(state, false, ['par']);
  return r ? (diceChips(state.dice).find((c) => c.index === r.chipIndex)?.amount ?? 0) : 0;
}

export const DICE_STRATEGIES: DiceStrategy[] = [
  {
    id: 'a',
    label: '(a) Par, ficha mínima, sin relanzar',
    chooseRoll: () => ({ chipIndex: 0, target: 'par' }),
    rerollDie: () => null,
    ghostProfile: () => 0,
    buys: (id) => id !== 'hardTargets' && id !== 'boxcars',
    reserve: () => 0,
  },
  {
    id: 'b',
    label: '(b) Par, siempre TODO, sin relanzar',
    chooseRoll: () => ({ chipIndex: TODO, target: 'par' }),
    rerollDie: () => null,
    ghostProfile: (s) => s.dice.upgrades.helperProfile,
    buys: (id) => id !== 'hardTargets' && id !== 'boxcars',
    reserve: (s) => diceCeiling(s.dice),
  },
  {
    id: 'b2',
    label: '(b2) Siempre doble seis, ficha óptima',
    chooseRoll: (s) => bestRoll(s, true, s.dice.upgrades.boxcars > 0 ? ['boxcars'] : ['par']),
    rerollDie: smartReroll,
    ghostProfile: bestGhostProfile,
    buys: smartBuys(true),
    reserve: smartReserve,
    priority: ['hardTargets', 'boxcars'],
  },
  {
    id: 'c',
    label: '(c) Óptima, solo par, sin relanzar',
    chooseRoll: (s) => bestRoll(s, false, ['par']),
    rerollDie: () => null,
    ghostProfile: bestGhostProfile,
    buys: smartBuys(false),
    reserve: smartReserve,
  },
  {
    id: 'c2',
    label: '(c2) Óptima, todos los objetivos, sin relanzar',
    chooseRoll: (s) => bestRoll(s, false),
    rerollDie: () => null,
    ghostProfile: bestGhostProfile,
    buys: smartBuys(true),
    reserve: smartReserve,
  },
  {
    id: 'd',
    label: '(d) Óptima, todos los objetivos y relanzando',
    chooseRoll: (s) => bestRoll(s, true),
    rerollDie: smartReroll,
    ghostProfile: bestGhostProfile,
    buys: smartBuys(true),
    reserve: smartReserve,
  },
];

export const GHOST_STUDY: DiceStrategy[] = CONFIG.dice.helper.profiles.map((profile, index) => ({
  id: `g${index}`,
  label: `Camarero ${profile.name.toLowerCase()}`,
  chooseRoll: (s: GameState) => bestRoll(s, true),
  rerollDie: smartReroll,
  ghostProfile: () => index,
  buys: (id: DiceUpgradeId, s: GameState) => (id === 'helperProfile' ? s.dice.upgrades.helperProfile < index : smartBuys(true)(id, s)),
  reserve: smartReserve,
  priority: ['ghost', 'helperProfile'] as const,
}));
