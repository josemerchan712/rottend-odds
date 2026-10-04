/**
 * Simulación de la mesa 3 (dados).
 *
 *   npm run simulate:dice
 *   npm run simulate:dice -- --runs 40 --only c,d
 *   npm run simulate:dice -- --override cambios.json
 */
import { readFileSync } from 'node:fs';
import { CONFIG, DICE_TARGETS } from '../src/game/config';
import { formatNumber, formatTime } from '../src/util/format';
import { DEFAULT_PLAYER, PHASES } from './engine';
import { DICE_STRATEGIES, GHOST_STUDY, runDice, type DiceRunResult, type DiceStrategy } from './diceEngine';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const runs = Number(arg('runs') ?? 200);
const only = arg('only')?.split(',');
const noStudy = args.includes('--no-study');
const overridePath = arg('override');
if (overridePath) applyOverrides(CONFIG as unknown as Record<string, unknown>, JSON.parse(readFileSync(overridePath, 'utf-8')));

const limit = DEFAULT_PLAYER.timeLimit;
const strategies = DICE_STRATEGIES.filter((s) => !only || only.includes(s.id));
const started = Date.now();
console.log(`\nSimulación mesa 3 · ${runs} partidas por estrategia · límite ${formatTime(limit)}`);
console.log('Empieza al pagar la deuda de la mesa 2 (estado real de una partida (d) de la mesa 2, misma semilla).');
console.log(overridePath ? `Con cambios de ${overridePath}` : 'Con config.ts tal cual');

const results = new Map<DiceStrategy, DiceRunResult[]>();
for (const s of strategies) results.set(s, Array.from({ length: runs }, (_, i) => runDice(s, i + 1)));

section('Tiempo hasta 10M de chapas (desde que se abre la mesa 3)');
table(
  ['Estrategia', 'Terminan', 'Media', 'p10', 'p50', 'p90', 'Tramo final', 'Mesas 1+2+3'],
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
    return [s.label, ...PHASES.map((p) => {
      const inPhase = r.filter((x) => x.reachedPhase[p]);
      return inPhase.length ? pct(inPhase.filter((x) => x.bankruptcies[p] > 0).length / inPhase.length) : '-';
    })];
  }),
);

section('De dónde salen las chapas (neto de los dados), jackpot, relanzamientos y objetivos');
table(
  ['Estrategia', 'Trabajo', 'Dados', 'Jackpot', 'Pasivo', 'Jackpots', 'Relanz./partida', 'Convierten', ...DICE_TARGETS.map((x) => CONFIG.dice.targets[x].short), 'Pasivo/s'],
  strategies.map((s) => {
    const r = results.get(s)!;
    const work = sum(r.map((x) => x.earned.work));
    const dice = sum(r.map((x) => x.earned.dice));
    const jackpot = sum(r.map((x) => x.earned.jackpot));
    const passive = sum(r.map((x) => x.earned.passive));
    const total = work + dice + jackpot + passive;
    const rolls = sum(r.map((x) => x.rolls.player)) || 1;
    const rerolls = sum(r.map((x) => x.rerolls));
    return [
      s.label,
      pct(work / total),
      pct(dice / total),
      pct(jackpot / total),
      pct(passive / total),
      (sum(r.map((x) => x.jackpots)) / runs).toFixed(1),
      (rerolls / runs).toFixed(0),
      rerolls ? pct(sum(r.map((x) => x.rerollWins)) / rerolls) : '-',
      ...DICE_TARGETS.map((x) => pct(sum(r.map((y) => y.targets[x])) / rolls)),
      `${formatNumber(mean(r.map((x) => x.passive.start)))} → ${formatNumber(mean(r.map((x) => x.passive.end)))}`,
    ];
  }),
);

if (!noStudy) {
  section('Conversión: (d) con y sin pasivo de la mesa 2');
  const d = DICE_STRATEGIES.find((s) => s.id === 'd')!;
  const k = CONFIG.dice.conversion.k;
  const withK = results.get(d) ?? Array.from({ length: runs }, (_, i) => runDice(d, i + 1));
  (CONFIG.dice.conversion as { k: number }).k = 0;
  const without = Array.from({ length: runs }, (_, i) => runDice(d, i + 1));
  (CONFIG.dice.conversion as { k: number }).k = k;
  table(
    ['Variante', 'Media', 'p50', 'p90'],
    [
      [`k = ${k}`, t(mean(withK.map((x) => x.time))), t(q(withK.map((x) => x.time), 0.5)), t(q(withK.map((x) => x.time), 0.9))],
      ['k = 0', t(mean(without.map((x) => x.time))), t(q(without.map((x) => x.time), 0.5)), t(q(without.map((x) => x.time), 0.9))],
    ],
  );

  section('Camarero con perfil fijo (el jugador juega como (d))');
  const ghost = GHOST_STUDY.map((s) => ({ s, r: Array.from({ length: runs }, (_, i) => runDice(s, i + 1)) }));
  table(
    ['Perfil', 'Tiempo p50', ...PHASES.map((p) => `VE ${p}`), ...PHASES.map((p) => `quiebra ${p}`)],
    ghost.map(({ s, r }) => [
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
    ]),
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
