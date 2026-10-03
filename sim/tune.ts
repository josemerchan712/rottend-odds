/**
 * Barrido de parámetros para encontrar una economía que cumpla los objetivos con la estrategia (c).
 * No toca config.ts: aplica cada combinación en memoria y simula.
 *
 *   npx tsx sim/tune.ts [--runs 24]
 */
import { CONFIG } from '../src/game/config';
import { formatTime } from '../src/util/format';
import { DEFAULT_PLAYER, runOne } from './engine';
import { STRATEGIES } from './strategies';

const args = process.argv.slice(2);
const runs = Number(args[args.indexOf('--runs') + 1] || 24);
const strategy = STRATEGIES.find((s) => s.id === 'c')!;

type Params = {
  luckBase: number;
  luckGrowth: number;
  betBase: number;
  betGrowth: number;
  betMult: number;
  betLevels: number;
};

function apply(p: Params) {
  const c = CONFIG as unknown as {
    upgrades: Record<string, { baseCost: number; growth: number; maxLevel: number }>;
    bet: { maxBetMultiplierPerLevel: number };
    jackpot: Record<string, number>;
  };
  // Fijos de la propuesta: Cero Dorado contenido y mejoras secundarias baratas.
  Object.assign(c.jackpot, { payoutMultiplier: 50, payoutCapDebtFraction: 0.05, upgradeBonusPerLevel: 0.0007 });
  Object.assign(c.upgrades.jackpot, { baseCost: 2000, growth: 1.8, maxLevel: 10 });
  Object.assign(c.upgrades.helperSpeed, { baseCost: 300, growth: 1.6 });
  Object.assign(c.upgrades.helperLuck, { baseCost: 800, growth: 1.8 });
  Object.assign(c.upgrades.luck, { baseCost: p.luckBase, growth: p.luckGrowth });
  Object.assign(c.upgrades.maxBet, { baseCost: p.betBase, growth: p.betGrowth, maxLevel: p.betLevels });
  c.bet.maxBetMultiplierPerLevel = p.betMult;
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

const grid: Params[] = [];
for (const luckBase of [1, 2])
  for (const luckGrowth of [1.6, 1.75, 1.9])
    for (const betBase of [5, 10])
      for (const betGrowth of [1.8, 2.1])
        for (const [betMult, betLevels] of [
          [2, 14],
          [2.5, 11],
          [3, 9],
        ])
          grid.push({ luckBase, luckGrowth, betBase, betGrowth, betMult, betLevels });

const scored = grid.map((p) => {
  apply(p);
  const r = Array.from({ length: runs }, (_, i) => runOne(strategy, 1000 + i, { ...defaultPlayer(), timeLimit: 1800 }));
  const total = median(r.map((x) => x.time));
  const finished = r.filter((x) => x.finished).length / runs;
  const tails = r.filter((x) => x.finished && x.luckMaxTime !== null).map((x) => x.time - x.luckMaxTime!);
  const tail = tails.length ? median(tails) : Infinity;
  const score = Math.abs(total - 480) / 480 + Math.max(0, tail - 90) / 60 + (1 - finished) * 5;
  return { p, total, tail, finished, score };
});

scored.sort((a, b) => a.score - b.score);
for (const s of scored.slice(0, 12)) {
  console.log(
    `${s.score.toFixed(2)}  total ${formatTime(s.total)}  tramo ${Number.isFinite(s.tail) ? formatTime(s.tail) : '-'}  terminan ${(s.finished * 100).toFixed(0)}%  `,
    JSON.stringify(s.p),
  );
}

function defaultPlayer() {
  return { ...DEFAULT_PLAYER };
}
