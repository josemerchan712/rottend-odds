/**
 * Simulación de la mesa 5 (doble o nada).
 *
 *   npm run simulate:coin
 *   npm run simulate:coin -- --runs 40 --only c,d
 *   npm run simulate:coin -- --override cambios.json
 *   npm run simulate:coin -- --cache        (guarda/reutiliza los estados de salida de la mesa 4)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { CONFIG } from '../src/game/config';
import type { GameState } from '../src/game/state';
import { formatNumber, formatTime } from '../src/util/format';
import { COIN_STRATEGIES, IMP_STUDY, runCoin, table4Start, type CoinRunResult, type CoinStrategy } from './coinEngine';
import { DEFAULT_PLAYER, PHASES } from './engine';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
// --quick: 40 partidas y sin los estudios (para calibrar sin gastar).
const quick = args.includes('--quick');
const runs = Number(arg('runs') ?? (quick ? 40 : 120));
const only = arg('only')?.split(',');
const noStudy = quick || args.includes('--no-study');
const useCache = args.includes('--cache');
const overridePath = arg('override');
if (overridePath) applyOverrides(CONFIG as unknown as Record<string, unknown>, JSON.parse(readFileSync(overridePath, 'utf-8')));

// Los estados de salida de la mesa 4 cuestan mucho (simulan las cuatro mesas): con --cache se guardan.
const CACHE = 'sim/.cache/coin-starts.json';
if (useCache) {
  const cached: Record<string, { state: GameState; time: number }> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf-8')) : {};
  let dirty = false;
  for (let seed = 1; seed <= runs; seed++) {
    if (!cached[seed]) {
      cached[seed] = table4Start(seed);
      dirty = true;
    }
  }
  if (dirty) {
    mkdirSync('sim/.cache', { recursive: true });
    writeFileSync(CACHE, JSON.stringify(cached));
  }
  (globalThis as { __coinStarts?: typeof cached }).__coinStarts = cached;
}

const limit = DEFAULT_PLAYER.timeLimit;
const strategies = COIN_STRATEGIES.filter((s) => !only || only.includes(s.id));
const started = Date.now();
console.log(`\nSimulación mesa 5 · ${runs} partidas por estrategia · límite ${formatTime(limit)}`);
console.log('Empieza al pagar la deuda de la mesa 4 (estado real de una partida (d) de la mesa 4, misma semilla).');
console.log(overridePath ? `Con cambios de ${overridePath}` : 'Con config.ts tal cual');

const results = new Map<CoinStrategy, CoinRunResult[]>();
for (const s of strategies) results.set(s, Array.from({ length: runs }, (_, i) => runCoin(s, i + 1)));

section('Tiempo hasta 10M de oro (desde que se abre la mesa 5)');
table(
  ['Estrategia', 'Terminan', 'Media', 'p10', 'p50', 'p90', 'Tramo final', 'Mesas 1-5'],
  strategies.map((s) => {
    const r = results.get(s)!;
    const times = r.map((x) => x.time);
    const tail = r.filter((x) => x.luckMaxTime !== null && x.finished).map((x) => x.time - x.luckMaxTime!);
    return [
      s.label,
      pct(r.filter((x) => x.finished).length / r.length),
      t(mean(times)),
      t(q(times, 0.1)),
      t(q(times, 0.5)),
      t(q(times, 0.9)),
      tail.length ? t(mean(tail)) : '-',
      formatTime(mean(r.map((x) => x.time + x.previousTime))),
    ];
  }),
);

section('Bancarrota: % de partidas que se quedan a 0 en cada fase');
table(
  ['Estrategia', ...PHASES.map((p) => `${p} %`)],
  strategies.map((s) => {
    const r = results.get(s)!;
    return [
      s.label,
      ...PHASES.map((p) => {
        const inPhase = r.filter((x) => x.reachedPhase[p]);
        return inPhase.length ? pct(inPhase.filter((x) => x.bankruptcies[p] > 0).length / inPhase.length) : '-';
      }),
    ];
  }),
);

section('De dónde sale el oro, cadenas, jackpot y segundas oportunidades');
table(
  ['Estrategia', 'Cadenas', 'Jackpot', 'Pasivo', 'Cadenas jugador', 'Se retira en (media)', 'Completas', 'Segundas/partida', 'Pasivo/s'],
  strategies.map((s) => {
    const r = results.get(s)!;
    const chains = sum(r.map((x) => x.earned.chains));
    const jackpot = sum(r.map((x) => x.earned.jackpot));
    const passive = sum(r.map((x) => x.earned.passive));
    const total = chains + jackpot + passive;
    return [
      s.label,
      pct(chains / total),
      pct(jackpot / total),
      pct(passive / total),
      (sum(r.map((x) => x.chains.player)) / runs).toFixed(0),
      mean(r.map((x) => x.chains.meanStop)).toFixed(1),
      (sum(r.map((x) => x.chains.full)) / runs).toFixed(1),
      (sum(r.map((x) => x.seconds)) / runs).toFixed(0),
      `${formatNumber(mean(r.map((x) => x.passive.start)))} → ${formatNumber(mean(r.map((x) => x.passive.end)))}`,
    ];
  }),
);

if (!noStudy) {
  section('Conversión: (d) con y sin pasivo de la mesa 4');
  const d = COIN_STRATEGIES.find((s) => s.id === 'd')!;
  const k = CONFIG.coin.conversion.k;
  const withK = results.get(d) ?? Array.from({ length: runs }, (_, i) => runCoin(d, i + 1));
  (CONFIG.coin.conversion as { k: number }).k = 0;
  const without = Array.from({ length: runs }, (_, i) => runCoin(d, i + 1));
  (CONFIG.coin.conversion as { k: number }).k = k;
  table(
    ['Variante', 'Media', 'p50', 'p90'],
    [
      [`k = ${k}`, t(mean(withK.map((x) => x.time))), t(q(withK.map((x) => x.time), 0.5)), t(q(withK.map((x) => x.time), 0.9))],
      ['k = 0 (solo el suelo)', t(mean(without.map((x) => x.time))), t(q(without.map((x) => x.time), 0.5)), t(q(without.map((x) => x.time), 0.9))],
    ],
  );

  section('Diablillo con perfil fijo (el jugador juega como (d))');
  table(
    ['Perfil', 'Tiempo p50', ...PHASES.map((p) => `VE ${p}`), ...PHASES.map((p) => `quiebra ${p}`)],
    IMP_STUDY.map((s) => {
      const r = Array.from({ length: runs }, (_, i) => runCoin(s, i + 1));
      return [
        s.label,
        t(q(r.map((x) => x.time), 0.5)),
        ...PHASES.map((p) => {
          const staked = sum(r.map((x) => x.helper[p].staked));
          return staked ? `${((sum(r.map((x) => x.helper[p].delta)) / staked) * 100).toFixed(1)}%` : '-';
        }),
        ...PHASES.map((p) => {
          const inPhase = r.filter((x) => x.reachedPhase[p] && x.helper[p].bets > 0);
          return inPhase.length ? pct(inPhase.filter((x) => x.helper[p].bankruptcies > 0).length / inPhase.length) : '-';
        }),
      ];
    }),
  );
}

console.log(`\n(${((Date.now() - started) / 1000).toFixed(1)} s de cálculo)\n`);

function section(title: string) {
  console.log(`\n== ${title}`);
}
function table(header: string[], rows: string[][]) {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ');
  console.log(line(header));
  for (const r of rows) console.log(line(r));
}
function t(seconds: number) {
  return seconds >= limit ? `>${formatTime(limit)}` : formatTime(seconds);
}
function pct(x: number) {
  return `${(x * 100).toFixed(0)}%`;
}
function sum(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0);
}
function mean(xs: number[]) {
  return xs.length ? sum(xs) / xs.length : NaN;
}
function q(xs: number[], p: number) {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}
function applyOverrides(target: Record<string, unknown>, patch: Record<string, unknown>) {
  for (const [key, value] of Object.entries(patch)) {
    const current = target[key];
    if (value && typeof value === 'object' && !Array.isArray(value) && current && typeof current === 'object') {
      applyOverrides(current as Record<string, unknown>, value as Record<string, unknown>);
    } else target[key] = value;
  }
}
