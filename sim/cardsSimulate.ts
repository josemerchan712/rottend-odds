/**
 * Simulación de la mesa 4 (blackjack).
 *
 *   npm run simulate:cards
 *   npm run simulate:cards -- --runs 40 --only c,d
 *   npm run simulate:cards -- --override cambios.json
 */
import { readFileSync } from 'node:fs';
import { CONFIG } from '../src/game/config';
import { formatNumber, formatTime } from '../src/util/format';
import { DEFAULT_PLAYER, PHASES } from './engine';
import { CARDS_STRATEGIES, SKELETON_STUDY, runCards, type CardsRunResult, type CardsStrategy } from './cardsEngine';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
// --quick: 40 partidas y sin los estudios (para calibrar sin gastar).
const quick = args.includes('--quick');
const runs = Number(arg('runs') ?? (quick ? 40 : 200));
const only = arg('only')?.split(',');
const noStudy = quick || args.includes('--no-study');
const overridePath = arg('override');
if (overridePath) applyOverrides(CONFIG as unknown as Record<string, unknown>, JSON.parse(readFileSync(overridePath, 'utf-8')));

const limit = DEFAULT_PLAYER.timeLimit;
const strategies = CARDS_STRATEGIES.filter((s) => !only || only.includes(s.id));
const started = Date.now();
console.log(`\nSimulación mesa 3 · ${runs} partidas por estrategia · límite ${formatTime(limit)}`);
console.log('Empieza al pagar la deuda de la mesa 3 (estado real de una partida (d) de la mesa 3, misma semilla).');
console.log(overridePath ? `Con cambios de ${overridePath}` : 'Con config.ts tal cual');

const results = new Map<CardsStrategy, CardsRunResult[]>();
for (const s of strategies) results.set(s, Array.from({ length: runs }, (_, i) => runCards(s, i + 1)));

section('Tiempo hasta 10M de fichas negras (desde que se abre la mesa 4)');
table(
  ['Estrategia', 'Terminan', 'Media', 'p10', 'p50', 'p90', 'Tramo final', 'Mesas 1-4'],
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

section('De dónde salen las fichas (neto de las manos), jackpot y descartes');
table(
  ['Estrategia', 'Manos', 'Jackpot', 'Pasivo', 'Jackpots', 'Descartes/partida', 'Manos jugador', 'Ganadas', 'Empates', 'Pasivo/s'],
  strategies.map((s) => {
    const r = results.get(s)!;
    const cards = sum(r.map((x) => x.earned.cards));
    const jackpot = sum(r.map((x) => x.earned.jackpot));
    const passive = sum(r.map((x) => x.earned.passive));
    const total = cards + jackpot + passive;
    const hands = sum(r.map((x) => x.hands.player + x.hands.helper)) || 1;
    return [
      s.label,
      pct(cards / total),
      pct(jackpot / total),
      pct(passive / total),
      (sum(r.map((x) => x.jackpots)) / runs).toFixed(1),
      (sum(r.map((x) => x.discards)) / runs).toFixed(0),
      (sum(r.map((x) => x.hands.player)) / runs).toFixed(0),
      pct(sum(r.map((x) => x.hands.wins)) / hands),
      pct(sum(r.map((x) => x.hands.pushes)) / hands),
      `${formatNumber(mean(r.map((x) => x.passive.start)))} → ${formatNumber(mean(r.map((x) => x.passive.end)))}`,
    ];
  }),
);

if (!noStudy) {
  section('Conversión: (d) con y sin pasivo de la mesa 3');
  const d = CARDS_STRATEGIES.find((s) => s.id === 'd')!;
  const k = CONFIG.cards.conversion.k;
  const withK = results.get(d) ?? Array.from({ length: runs }, (_, i) => runCards(d, i + 1));
  (CONFIG.cards.conversion as { k: number }).k = 0;
  const without = Array.from({ length: runs }, (_, i) => runCards(d, i + 1));
  (CONFIG.cards.conversion as { k: number }).k = k;
  table(
    ['Variante', 'Media', 'p50', 'p90'],
    [
      [`k = ${k}`, t(mean(withK.map((x) => x.time))), t(q(withK.map((x) => x.time), 0.5)), t(q(withK.map((x) => x.time), 0.9))],
      ['k = 0', t(mean(without.map((x) => x.time))), t(q(without.map((x) => x.time), 0.5)), t(q(without.map((x) => x.time), 0.9))],
    ],
  );

  section('Esqueleto con perfil fijo (el jugador juega como (d))');
  const ghost = SKELETON_STUDY.map((s) => ({ s, r: Array.from({ length: runs }, (_, i) => runCards(s, i + 1)) }));
  table(
    ['Perfil', 'Fase inicial (media)', 'Fase media (media)', 'Fase alta (media)', 'Final (media)'],
    ghost.map(({ s, r }) => {
      const span = (from: (typeof PHASES)[number], to: (typeof PHASES)[number] | null) => {
        const xs = r.filter((x) => x.phaseStart[from] !== null && (to === null ? x.finished : x.phaseStart[to] !== null))
          .map((x) => (to === null ? x.time : x.phaseStart[to]!) - x.phaseStart[from]!);
        return xs.length ? t(mean(xs)) : '-';
      };
      return [s.label, span('inicio', 'media'), span('media', 'alta'), span('alta', 'final'), span('final', null)];
    }),
  );
  console.log('  Tiempo medio en cada fase (suerte 0-4 / 5-11 / 12-19 / 20): el perfil que menos tarda en una fase es el que compensa en ella.');
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
