/**
 * Barrido de los multiplicadores de suerte de docena y número: compara (d) con (c).
 * No toca config.ts.
 *
 *   npx tsx sim/tune-bets.ts [--runs 100]
 */
import { CONFIG } from '../src/game/config';
import { formatTime } from '../src/util/format';
import { runOne } from './engine';
import { STRATEGIES } from './strategies';

const args = process.argv.slice(2);
const runs = Number(args[args.indexOf('--runs') + 1] || 100);
const c = STRATEGIES.find((s) => s.id === 'c')!;
const d = STRATEGIES.find((s) => s.id === 'd')!;
const types = CONFIG.betTypes as unknown as Record<string, { luckMin: number; luckMax: number }>;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const timeOf = (s: typeof c) => mean(Array.from({ length: runs }, (_, i) => runOne(s, i + 1).time));

const base = timeOf(c);
console.log(`(c) media ${formatTime(base)}`);
for (const [dMin, dMax, nMin, nMax] of [
  [0.99, 1.3, 0.96, 1.6],
  [0.9, 1.3, 0.8, 1.6],
  [0.9, 1.35, 0.8, 1.8],
  [0.9, 1.4, 0.8, 1.8],
]) {
  Object.assign(types.dozen, { luckMin: dMin, luckMax: dMax });
  Object.assign(types.number, { luckMin: nMin, luckMax: nMax });
  const t = timeOf(d);
  const evD = 2 * 0.97 * dMax - 1;
  const evN = 2 * 0.97 * nMax - 1;
  console.log(
    `docena ${dMin}-${dMax} (VE máx +${((evD / 0.94 - 1) * 100).toFixed(0)}%)  número ${nMin}-${nMax} (+${((evN / 0.94 - 1) * 100).toFixed(0)}%)  ` +
      `(d) media ${formatTime(t)}  → ${((1 - t / base) * 100).toFixed(1)}% más rápida que (c)`,
  );
}
