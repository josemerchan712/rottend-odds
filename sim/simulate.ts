/**
 * Simulación de la mesa 1: juega muchas partidas con cada estrategia y resume cuánto tardan.
 *
 *   npm run simulate                         todas las estrategias, 200 partidas cada una
 *   npm run simulate -- --runs 500
 *   npm run simulate -- --only c,d
 *   npm run simulate -- --override cambios.json   prueba números sin tocar config.ts
 */
import { readFileSync } from 'node:fs';
import { CONFIG, UPGRADE_IDS, type UpgradeId } from '../src/game/config';
import { effectiveWinChance } from '../src/game/luck';
import { formatNumber, formatTime } from '../src/util/format';
import { DEFAULT_PLAYER, PHASES, runOne, type RunResult, type Strategy } from './engine';
import { HELPER_STUDY, STRATEGIES } from './strategies';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const runs = Number(arg('runs') ?? 200);
const only = arg('only')?.split(',');
const overridePath = arg('override');

if (overridePath) {
  applyOverrides(CONFIG as unknown as Record<string, unknown>, JSON.parse(readFileSync(overridePath, 'utf-8')));
}

const strategies = STRATEGIES.filter((s) => !only || only.includes(s.id));
const limit = DEFAULT_PLAYER.timeLimit;

console.log(`\nSimulación mesa 1 · ${runs} partidas por estrategia · límite ${formatTime(limit)}`);
console.log(overridePath ? `Con cambios de ${overridePath} (config.ts sin tocar)` : 'Con config.ts tal cual');
console.log(
  `Jugador: una acción cada ${DEFAULT_PLAYER.actionInterval} s, una apuesta como mucho cada ${DEFAULT_PLAYER.betInterval} s, ` +
    `recoge basura si hay ${DEFAULT_PLAYER.collectAtItems}+ en el suelo o si no quiere apostar. Compra la mejora principal más barata; las secundarias (suerte del ayudante, jackpot, docena, número) solo si cuestan ≤25% del saldo.`,
);

const started = Date.now();
const results = new Map<Strategy, RunResult[]>();
for (const strategy of strategies) {
  results.set(strategy, Array.from({ length: runs }, (_, i) => runOne(strategy, i + 1)));
}

section('Tiempo hasta 10M');
table(
  ['Estrategia', 'Terminan', 'Media', 'p10', 'p50', 'p90'],
  strategies.map((s) => {
    const r = results.get(s)!;
    const times = r.map((x) => x.time);
    return [s.label, pct(r.filter((x) => x.finished).length / r.length), t(mean(times)), t(q(times, 0.1)), t(q(times, 0.5)), t(q(times, 0.9))];
  }),
);

section('Arranque');
table(
  ['Estrategia', '1ª apuesta (media)', '1ª apuesta (p90)', '1ª suerte (media)', '1ª suerte (p90)'],
  strategies.map((s) => {
    const r = results.get(s)!;
    const bet = r.map((x) => x.firstBetTime ?? limit);
    const luck = r.map((x) => x.firstLuckTime ?? limit);
    return [s.label, t(mean(bet)), t(q(bet, 0.9)), t(mean(luck)), t(q(luck, 0.9))];
  }),
);

section('Último tramo: desde suerte máxima (nivel 20) hasta 10M');
table(
  ['Estrategia', 'Llegan a suerte 20', 'Suerte 20 (p50)', 'Tramo (media)', 'Tramo (p10)', 'Tramo (p90)'],
  strategies.map((s) => {
    const r = results.get(s)!;
    const withMax = r.filter((x) => x.luckMaxTime !== null && x.finished);
    const reached = r.filter((x) => x.luckMaxTime !== null).length;
    const tail = withMax.map((x) => x.time - x.luckMaxTime!);
    const at = withMax.map((x) => x.luckMaxTime!);
    return withMax.length
      ? [s.label, pct(reached / r.length), t(q(at, 0.5)), t(mean(tail)), t(q(tail, 0.1)), t(q(tail, 0.9))]
      : [s.label, pct(reached / r.length), '-', '-', '-', '-'];
  }),
);

section('Bancarrota: % de partidas que se quedan a 0 al menos una vez en cada fase (suerte 0-4 / 5-11 / 12-19 / 20)');
table(
  ['Estrategia', ...PHASES.map((p) => `${p} %`), ...PHASES.map((p) => `${p} veces`)],
  strategies.map((s) => {
    const r = results.get(s)!;
    const rate = PHASES.map((p) => {
      const inPhase = r.filter((x) => x.reachedPhase[p]);
      return inPhase.length ? pct(inPhase.filter((x) => x.bankruptcies[p] > 0).length / inPhase.length) : '-';
    });
    const avg = PHASES.map((p) => {
      const inPhase = r.filter((x) => x.reachedPhase[p]);
      return inPhase.length ? mean(inPhase.map((x) => x.bankruptcies[p])).toFixed(1) : '-';
    });
    return [s.label, ...rate, ...avg];
  }),
);

section('De dónde salen las fichas (bruto) y Cero Dorado');
table(
  ['Estrategia', 'Trabajo', 'Ruleta', 'Cero Dorado', 'Ruleta neta', 'Jackpots/partida', 'Con tope', 'Apuestas/s'],
  strategies.map((s) => {
    const r = results.get(s)!;
    const work = sum(r.map((x) => x.earned.work));
    const roulette = sum(r.map((x) => x.earned.roulette));
    const jackpot = sum(r.map((x) => x.earned.jackpot));
    const lost = sum(r.map((x) => x.lost));
    const total = work + roulette + jackpot;
    const jackpots = sum(r.map((x) => x.jackpots));
    const capped = sum(r.map((x) => x.jackpotsCapped));
    const betsPerSec = sum(r.map((x) => x.bets.player + x.bets.helper)) / sum(r.map((x) => x.time));
    return [
      s.label,
      pct(work / total),
      pct(roulette / total),
      pct(jackpot / total),
      formatNumber((roulette - lost) / r.length),
      (jackpots / r.length).toFixed(1),
      jackpots ? pct(capped / jackpots) : '-',
      betsPerSec.toFixed(2),
    ];
  }),
);

section('Momento mediano de cada compra (solo partidas que la hacen)');
const milestones: [UpgradeId, number][] = [
  ['luck', 1], ['luck', 3], ['luck', 5], ['luck', 10], ['luck', 15], ['luck', 20],
  ['maxBet', 1], ['maxBet', 6], ['maxBet', CONFIG.upgrades.maxBet.maxLevel],
  ['crupier', 1], ['helperSpeed', 15], ['jackpot', 20], ['dozenBet', 1], ['numberBet', 1],
];
table(
  ['Mejora', ...strategies.map((s) => s.id)],
  milestones.map(([id, level]) => [
    `${CONFIG.upgrades[id].name} ${level}`,
    ...strategies.map((s) => {
      const times = results
        .get(s)!
        .map((x) => x.purchases.find((p) => p.id === id && p.level === level)?.time)
        .filter((x): x is number => x !== undefined);
      return times.length ? `${t(q(times, 0.5))} (${pct(times.length / runs)})` : '-';
    }),
  ]),
);

section('Ayudante con perfil fijo (el jugador juega como (c) y compra el Crupier en cuanto puede)');
const helperResults = HELPER_STUDY.map((s) => ({ s, r: Array.from({ length: runs }, (_, i) => runOne(s, i + 1)) }));
table(
  ['Perfil', 'Tiempo p50', 'Crupier (p50)', ...PHASES.map((p) => `VE/apuesta ${p}`)],
  helperResults.map(({ s, r }) => {
    const crupier = r.map((x) => x.purchases.find((p) => p.id === 'crupier')?.time ?? limit);
    return [
      s.label,
      t(q(r.map((x) => x.time), 0.5)),
      t(q(crupier, 0.5)),
      ...PHASES.map((p) => {
        const bets = sum(r.map((x) => x.helper[p].bets));
        if (!bets) return '-';
        const delta = sum(r.map((x) => x.helper[p].delta));
        const staked = sum(r.map((x) => x.helper[p].staked));
        const sign = delta >= 0 ? '+' : '';
        return `${sign}${formatNumber(delta / bets)} (${sign}${((delta / staked) * 100).toFixed(1)}%)`;
      }),
    ];
  }),
);
console.log('  VE/apuesta: cambio medio de saldo por apuesta del ayudante en esa fase (entre paréntesis, % de lo apostado).');
table(
  ['Perfil', ...PHASES.map((p) => `quiebra ${p}`), ...PHASES.map((p) => `caída ${p}`), ...PHASES.map((p) => `apuestas ${p}`)],
  helperResults.map(({ s, r }) => [
    s.label,
    ...PHASES.map((p) => {
      const inPhase = r.filter((x) => x.reachedPhase[p] && x.helper[p].bets > 0);
      return inPhase.length ? pct(inPhase.filter((x) => x.helper[p].bankruptcies > 0).length / inPhase.length) : '-';
    }),
    ...PHASES.map((p) => {
      const inPhase = r.filter((x) => x.reachedPhase[p] && x.helper[p].bets > 0);
      return inPhase.length ? pct(inPhase.filter((x) => x.helper[p].drawdowns > 0).length / inPhase.length) : '-';
    }),
    ...PHASES.map((p) => (sum(r.map((x) => x.helper[p].bets)) / runs).toFixed(0)),
  ]),
);
console.log('  quiebra: % de partidas en que una apuesta del AYUDANTE deja el saldo a 0 en esa fase.');
console.log('  caída: % de partidas en que una racha de pérdidas del ayudante se lleva al menos la mitad del saldo.');
console.log('  apuestas: media por partida.');

section('Ayudante: valor teórico de cada perfil según la suerte (sin suerte propia ni Cero Dorado)');
const luckLevels = [0, 3, 6, 9, 12, 15, 18, 20];
table(
  ['Perfil', ...luckLevels.map((l) => `suerte ${l}`)],
  CONFIG.helper.profiles.flatMap((profile) => {
    const cells = luckLevels.map((l) => {
      const p = effectiveWinChance(l, profile.fraction);
      const x = profile.maxBalanceFraction;
      const growth = p * Math.log1p(x) + (1 - p) * Math.log1p(-x);
      return { ev: `${((2 * p - 1) * 100).toFixed(0)}%`, growth: `${(growth * 100).toFixed(2)}%` };
    });
    return [
      [`${profile.name}: VE por ficha`, ...cells.map((c) => c.ev)],
      [`${profile.name}: crecimiento/apuesta`, ...cells.map((c) => c.growth)],
    ];
  }),
);
console.log('  VE por ficha: 2p - 1 con la penalización de apostar su fracción del techo.');
console.log('  crecimiento/apuesta: cambio logarítmico esperado del saldo cuando apuesta su máximo del saldo');
console.log('  (prudente 3%, normal 10%, agresivo 30%). Negativo = a la larga hunde el saldo aunque el VE sea positivo.');

section('Coste total de todas las mejoras');
const totalCost = UPGRADE_IDS.reduce((acc, id) => {
  const def = CONFIG.upgrades[id];
  let c = 0;
  for (let n = 0; n < def.maxLevel; n++) c += Math.round(def.baseCost * def.growth ** n);
  console.log(`  ${def.name.padEnd(24)} ${formatNumber(c).padStart(8)}`);
  return acc + c;
}, 0);
console.log(`  ${'TOTAL'.padEnd(24)} ${formatNumber(totalCost).padStart(8)}   (deuda: ${formatNumber(CONFIG.debt.amount)})`);

console.log(`\n(${((Date.now() - started) / 1000).toFixed(1)} s de cálculo)\n`);

// ---------------------------------------------------------------------------

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

/** Mezcla los valores de `patch` en `target` sin reemplazar los objetos anidados (otros módulos guardan referencias). */
function applyOverrides(target: Record<string, unknown>, patch: Record<string, unknown>) {
  for (const [key, value] of Object.entries(patch)) {
    const current = target[key];
    if (value && typeof value === 'object' && !Array.isArray(value) && current && typeof current === 'object') {
      applyOverrides(current as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      target[key] = value;
    }
  }
}
