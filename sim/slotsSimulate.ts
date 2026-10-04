/**
 * Simulación de la mesa 2 (tragaperras).
 *
 *   npm run simulate:slots
 *   npm run simulate:slots -- --runs 100 --only c,d
 *   npm run simulate:slots -- --override cambios.json
 */
import { readFileSync } from 'node:fs';
import { CONFIG } from '../src/game/config';
import { formatNumber, formatTime } from '../src/util/format';
import { DEFAULT_PLAYER, PHASES } from './engine';
import { runSlots, SLOT_STRATEGIES, ZOMBIE_STUDY, type SlotRunResult, type SlotStrategy } from './slotsEngine';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const runs = Number(arg('runs') ?? 200);
const only = arg('only')?.split(',');
const overridePath = arg('override');
if (overridePath) applyOverrides(CONFIG as unknown as Record<string, unknown>, JSON.parse(readFileSync(overridePath, 'utf-8')));

const limit = DEFAULT_PLAYER.timeLimit;
const strategies = SLOT_STRATEGIES.filter((s) => !only || only.includes(s.id));
const started = Date.now();
console.log(`\nSimulación mesa 2 · ${runs} partidas por estrategia · límite ${formatTime(limit)}`);
console.log('Empieza al pagar la deuda de la mesa 1 (estado real de una partida (c) de la mesa 1, misma semilla).');
console.log(overridePath ? `Con cambios de ${overridePath}` : 'Con config.ts tal cual');

const results = new Map<SlotStrategy, SlotRunResult[]>();
for (const s of strategies) results.set(s, Array.from({ length: runs }, (_, i) => runSlots(s, i + 1)));

section('Tiempo hasta 10M de monedas (desde que se abre la mesa 2)');
table(
  ['Estrategia', 'Terminan', 'Media', 'p10', 'p50', 'p90', 'Mesa 1 + 2 (media)'],
  strategies.map((s) => {
    const r = results.get(s)!;
    const times = r.map((x) => x.time);
    const total = r.map((x) => x.time + x.table1Time);
    return [s.label, pct(r.filter((x) => x.finished).length / r.length), t(mean(times)), t(q(times, 0.1)), t(q(times, 0.5)), t(q(times, 0.9)), formatTime(mean(total))];
  }),
);

section('Último tramo: desde suerte 20 hasta 10M');
table(
  ['Estrategia', 'Suerte 20 (p50)', 'Tramo (media)', 'Tramo (p90)', '1ª suerte (media)'],
  strategies.map((s) => {
    const r = results.get(s)!.filter((x) => x.luckMaxTime !== null && x.finished);
    const tail = r.map((x) => x.time - x.luckMaxTime!);
    const first = results.get(s)!.map((x) => x.firstLuckTime ?? limit);
    return r.length ? [s.label, t(q(r.map((x) => x.luckMaxTime!), 0.5)), t(mean(tail)), t(q(tail, 0.9)), t(mean(first))] : [s.label, '-', '-', '-', t(mean(first))];
  }),
);

section('Bancarrota: % de partidas que se quedan a 0 en cada fase (suerte 0-4 / 5-11 / 12-19 / 20)');
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

section('De dónde salen las monedas (bruto), jackpot y retención');
table(
  ['Estrategia', 'Máquina', 'Jackpot', 'Pasivo', 'Jackpots/partida', 'Con tope', 'Retenidas', 'Pasivo/s inicio→fin'],
  strategies.map((s) => {
    const r = results.get(s)!;
    const machine = sum(r.map((x) => x.earned.machine));
    const jackpot = sum(r.map((x) => x.earned.jackpot));
    const passive = sum(r.map((x) => x.earned.passive));
    const total = machine + jackpot + passive;
    const spins = sum(r.map((x) => x.spins.player + x.spins.helper));
    const jackpots = sum(r.map((x) => x.jackpots));
    return [
      s.label,
      pct(machine / total),
      pct(jackpot / total),
      pct(passive / total),
      (jackpots / runs).toFixed(1),
      jackpots ? pct(sum(r.map((x) => x.jackpotsCapped)) / jackpots) : '-',
      pct(sum(r.map((x) => x.spins.held)) / spins),
      `${formatNumber(mean(r.map((x) => x.passive.start)))} → ${formatNumber(mean(r.map((x) => x.passive.end)))}`,
    ];
  }),
);

section('Cuánto importa la conversión: (d) con y sin pasivo de la mesa 1');
{
  const d = SLOT_STRATEGIES.find((s) => s.id === 'd')!;
  const k = CONFIG.slots.conversion.k;
  const withK = results.get(d) ?? Array.from({ length: runs }, (_, i) => runSlots(d, i + 1));
  (CONFIG.slots.conversion as { k: number }).k = 0;
  const without = Array.from({ length: runs }, (_, i) => runSlots(d, i + 1));
  (CONFIG.slots.conversion as { k: number }).k = k;
  table(
    ['Variante', 'Media', 'p50', 'p90', '1ª suerte (media)'],
    [
      [`k = ${k}`, t(mean(withK.map((x) => x.time))), t(q(withK.map((x) => x.time), 0.5)), t(q(withK.map((x) => x.time), 0.9)), t(mean(withK.map((x) => x.firstLuckTime ?? limit)))],
      ['k = 0 (sin pasivo)', t(mean(without.map((x) => x.time))), t(q(without.map((x) => x.time), 0.5)), t(q(without.map((x) => x.time), 0.9)), t(mean(without.map((x) => x.firstLuckTime ?? limit)))],
    ],
  );
}

section('Zombi con perfil fijo (el jugador juega como (d) y compra el zombi en cuanto puede)');
const zombie = ZOMBIE_STUDY.map((s) => ({ s, r: Array.from({ length: runs }, (_, i) => runSlots(s, i + 1)) }));
table(
  ['Perfil', 'Tiempo p50', ...PHASES.map((p) => `VE ${p}`), ...PHASES.map((p) => `quiebra ${p}`)],
  zombie.map(({ s, r }) => [
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
console.log('  VE: cambio medio del saldo por moneda apostada por el zombi en esa fase.');
console.log('  quiebra: % de partidas en que una tirada del ZOMBI deja el saldo a 0 en esa fase.');

console.log(`\n(${((Date.now() - started) / 1000).toFixed(1)} s de cálculo)\n`);

function section(title: string) {
  console.log(`\n== ${title}`);
}
function table(header: string[], rows: string[][]) {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ');
  console.log(line(header));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
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
