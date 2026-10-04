/**
 * Genera shared/plausibility.json: los límites estadísticos con los que el servidor marca un
 * guardado como "no verificado". El servidor no simula nada; solo consulta esta tabla.
 *
 *   npm run plausibility              (--full: 300 partidas por estrategia, la versión que se sube)
 *   npm run plausibility -- --quick   (200 partidas en total, para desarrollo; el test la rechaza)
 *   npm run plausibility -- --workers 1   (secuencial, para comparar)
 *   npm run plausibility -- --no-cache    (simula aunque la caché sirva)
 *
 * Rápido sin bajar el rigor:
 * - Paralelo: un worker por núcleo; cada partida tiene su estrategia y su semilla fijas y los
 *   resultados se juntan en el orden de las partidas, así que la tabla es idéntica a la secuencial.
 * - Caché por mesa (shared/plausibility-cache.json): cada mesa guarda su resultado con el hash de lo
 *   que la determina (su parte de shared/config.json, su parte de src/game/config.ts y el código del
 *   motor). Solo se vuelve a simular la mesa cuyo hash cambió. Hoy la tabla estadística es solo de la
 *   mesa 1 (el servidor no valida estadísticamente las demás), así que cambiar los números de las
 *   mesas 2 en adelante solo recalcula el hash del archivo.
 *
 * Hay que regenerarla cada vez que cambie shared/config.json (un test lo comprueba con un hash).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { Worker } from 'node:worker_threads';
import { CONFIG } from '../src/game/config';
import { configHash } from './plausibility-hash';
import { HELPER_STUDY, STRATEGIES } from './strategies';
import type { PlausibilityJob, PlausibilityResult } from './plausibility-worker';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const mode: 'full' | 'quick' = flag('quick') ? 'quick' : 'full';
const strategies = [...STRATEGIES, ...HELPER_STUDY];
/** --full: 300 por estrategia; --quick: 200 partidas en total. */
const runs = Number(value('runs') ?? (mode === 'full' ? 300 : Math.ceil(200 / strategies.length)));
const workers = Math.max(1, Number(value('workers') ?? cpus().length));

/** Margen sobre el percentil 99,9 de fichas ganadas. */
const EARNED_MARGIN = 2;
/** Margen sobre el tiempo mínimo observado para saldar la deuda. */
const TIME_MARGIN = 0.5;
const PERCENTILE = 0.999;
const SAMPLE_EVERY = 10;
const HORIZON = 1800;

const root = new URL('../', import.meta.url);
const configPath = new URL('shared/config.json', root);
const outPath = new URL('shared/plausibility.json', root);
const cachePath = new URL('shared/plausibility-cache.json', root);

/** Archivos de código que determinan la simulación de la mesa 1. */
const TABLE1_SOURCES = [
  'sim/engine.ts',
  'sim/strategies.ts',
  'sim/plausibility.ts',
  'sim/plausibility-worker.ts',
  'src/game/actions.ts',
  'src/game/betting.ts',
  'src/game/debt.ts',
  'src/game/helper.ts',
  'src/game/luck.ts',
  'src/game/rng.ts',
  'src/game/roulette.ts',
  'src/game/state.ts',
  'src/game/update.ts',
  'src/game/upgrades.ts',
  'src/game/work.ts',
  'src/game/workCore.ts',
];

/** Lo que determina la tabla de la mesa 1: sin las secciones de las otras mesas ni la versión del guardado. */
function table1Hash(): string {
  const shared = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
  delete shared.slots;
  delete shared.dice;
  delete shared.cards;
  delete shared.saveVersion;
  const { slots: _s, dice: _d, dialogue: _di, ...config } = CONFIG as unknown as Record<string, unknown>;
  void _s;
  void _d;
  void _di;
  const h = createHash('sha256');
  h.update(JSON.stringify(shared));
  h.update(JSON.stringify(config));
  for (const file of TABLE1_SOURCES) h.update(readFileSync(new URL(file, root), 'utf-8').replace(/\r\n/g, '\n'));
  h.update(JSON.stringify({ runs, EARNED_MARGIN, TIME_MARGIN, PERCENTILE, SAMPLE_EVERY, HORIZON }));
  return h.digest('hex');
}

interface Table1 {
  runsPerStrategy: number;
  minDebtSeconds: number;
  maxEarnedPerSecondAfterHorizon: number;
  maxEarned: number[];
  minDebtTime: number;
}

/** Juega todas las partidas de la mesa 1 repartidas entre los workers, en el orden de las partidas. */
async function simulateTable1(): Promise<PlausibilityResult[]> {
  const jobs: PlausibilityJob[] = [];
  strategies.forEach((_, s) => {
    for (let i = 0; i < runs; i++) jobs.push({ index: jobs.length, strategy: s, seed: 50_000 + i });
  });
  // Reparto dinámico en lotes pequeños: cada worker pide otro lote al terminar el suyo. Cada partida
  // lleva su índice y el resultado se coloca en su sitio: el orden no depende del reparto.
  const BATCH = 8;
  let next = 0;
  const results: PlausibilityResult[] = new Array(jobs.length);
  await Promise.all(
    Array.from(
      { length: Math.min(workers, jobs.length) },
      () =>
        new Promise<void>((resolve, reject) => {
          const worker = new Worker(new URL('./plausibility-worker.ts', import.meta.url), {
            workerData: { horizon: HORIZON, sampleEvery: SAMPLE_EVERY },
          });
          worker.on('message', (out: PlausibilityResult[]) => {
            for (const r of out) results[r.index] = r;
            if (next >= jobs.length) {
              void worker.terminate().then(() => resolve());
              return;
            }
            worker.postMessage(jobs.slice(next, next + BATCH));
            next += BATCH;
          });
          worker.once('error', reject);
        }),
    ),
  );
  return results;
}

function summarize(results: PlausibilityResult[]): Table1 {
  const curves = results.map((r) => r.curve);
  const minDebtTime = Math.min(...results.map((r) => r.debtTime ?? Infinity));
  const samples = HORIZON / SAMPLE_EVERY + 1;
  // Percentil 99,9 de cada instante, con margen y sin bajar nunca.
  const maxEarned: number[] = [];
  for (let k = 0; k < samples; k++) {
    const values = curves.map((c) => c[Math.min(k, c.length - 1)]).sort((a, b) => a - b);
    const p = values[Math.min(values.length - 1, Math.floor(PERCENTILE * values.length))];
    maxEarned.push(Math.ceil(Math.max(p * EARNED_MARGIN, maxEarned[k - 1] ?? 0)));
  }
  // Más allá del horizonte: el ritmo máximo observado en el último minuto, con margen.
  const lastMinute = 60 / SAMPLE_EVERY;
  const rates = curves.map((c) => (c[c.length - 1] - c[c.length - 1 - lastMinute]) / 60).sort((a, b) => a - b);
  return {
    runsPerStrategy: runs,
    minDebtTime,
    minDebtSeconds: Math.floor(minDebtTime * TIME_MARGIN),
    maxEarnedPerSecondAfterHorizon: Math.ceil(rates[Math.floor(PERCENTILE * rates.length)] * EARNED_MARGIN),
    maxEarned,
  };
}

const started = Date.now();
const cache = existsSync(cachePath) ? (JSON.parse(readFileSync(cachePath, 'utf-8')) as Record<string, { hash: string; mode: string; table: Table1 }>) : {};
const hash1 = table1Hash();
let table1: Table1;
let source: string;
if (!flag('no-cache') && cache.mesa1?.hash === hash1 && cache.mesa1.mode === mode) {
  table1 = cache.mesa1.table;
  source = 'caché (mesa 1 sin cambios)';
} else {
  table1 = summarize(await simulateTable1());
  cache.mesa1 = { hash: hash1, mode, table: table1 };
  writeFileSync(cachePath, JSON.stringify(cache, null, 2) + '\n');
  source = `${runs * strategies.length} partidas de la mesa 1 en ${workers} workers`;
}

const output = {
  description:
    'Límites estadísticos (no imposibles) generados por npm run plausibility. maxEarned[k] = fichas ganadas como ' +
    'mínimo (saldo + coste de mejoras + deuda pagada) que se consideran plausibles a los k*sampleEverySeconds ' +
    'segundos de juego; más allá del horizonte, se suma maxEarnedPerSecondAfterHorizon por segundo.',
  configHash: configHash(readFileSync(configPath, 'utf-8')),
  mode,
  runsPerStrategy: table1.runsPerStrategy,
  strategies: strategies.map((s) => s.id),
  percentile: PERCENTILE,
  earnedMargin: EARNED_MARGIN,
  timeMargin: TIME_MARGIN,
  sampleEverySeconds: SAMPLE_EVERY,
  horizonSeconds: HORIZON,
  minDebtSeconds: table1.minDebtSeconds,
  maxEarnedPerSecondAfterHorizon: table1.maxEarnedPerSecondAfterHorizon,
  maxEarned: table1.maxEarned,
};
writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
console.log(
  `shared/plausibility.json (${mode}): ${source} · ${((Date.now() - started) / 1000).toFixed(1)} s · ` +
    `deuda saldada como pronto en ${table1.minDebtTime.toFixed(0)} s → mínimo plausible ${output.minDebtSeconds} s · ` +
    `a los 8 min se aceptan hasta ${table1.maxEarned[48].toLocaleString('es-ES')} fichas ganadas`,
);
process.exit(0);
