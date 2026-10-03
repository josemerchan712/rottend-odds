/**
 * Genera shared/plausibility.json: los límites estadísticos con los que el servidor marca un
 * guardado como "no verificado". El servidor no simula nada; solo consulta esta tabla.
 *
 *   npm run plausibility                (300 partidas por estrategia, ~1-2 min)
 *   npm run plausibility -- --runs 100  (más rápido, menos preciso)
 *
 * Hay que regenerarla cada vez que cambie shared/config.json (un test lo comprueba con un hash)
 * o la economía del juego.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { DEFAULT_PLAYER, runOne, type PlayerModel } from './engine';
import { configHash } from './plausibility-hash';
import { HELPER_STUDY, STRATEGIES } from './strategies';

const args = process.argv.slice(2);
const runs = Number(args[args.indexOf('--runs') + 1] || 300);

/** Margen sobre el percentil 99,9 de fichas ganadas. */
const EARNED_MARGIN = 2;
/** Margen sobre el tiempo mínimo observado para saldar la deuda. */
const TIME_MARGIN = 0.5;
const PERCENTILE = 0.999;
const SAMPLE_EVERY = 10;
const HORIZON = 1800;

const configPath = new URL('../shared/config.json', import.meta.url);
const outPath = new URL('../shared/plausibility.json', import.meta.url);

const player: PlayerModel = { ...DEFAULT_PLAYER, timeLimit: HORIZON, continueAfterDebt: true, sampleEvery: SAMPLE_EVERY };
const strategies = [...STRATEGIES, ...HELPER_STUDY];
const samples = HORIZON / SAMPLE_EVERY + 1;

const curves: number[][] = [];
let minDebtTime = Infinity;
const started = Date.now();
for (const strategy of strategies) {
  for (let i = 0; i < runs; i++) {
    const r = runOne(strategy, 50_000 + i, player);
    curves.push(r.earnedCurve);
    if (r.debtTime !== null) minDebtTime = Math.min(minDebtTime, r.debtTime);
  }
}

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
const maxRateAfterHorizon = Math.ceil(rates[Math.floor(PERCENTILE * rates.length)] * EARNED_MARGIN);

const output = {
  description:
    'Límites estadísticos (no imposibles) generados por npm run plausibility. maxEarned[k] = fichas ganadas como ' +
    'mínimo (saldo + coste de mejoras + deuda pagada) que se consideran plausibles a los k*sampleEverySeconds ' +
    'segundos de juego; más allá del horizonte, se suma maxEarnedPerSecondAfterHorizon por segundo.',
  configHash: configHash(readFileSync(configPath, 'utf-8')),
  runsPerStrategy: runs,
  strategies: strategies.map((s) => s.id),
  percentile: PERCENTILE,
  earnedMargin: EARNED_MARGIN,
  timeMargin: TIME_MARGIN,
  sampleEverySeconds: SAMPLE_EVERY,
  horizonSeconds: HORIZON,
  minDebtSeconds: Math.floor(minDebtTime * TIME_MARGIN),
  maxEarnedPerSecondAfterHorizon: maxRateAfterHorizon,
  maxEarned,
};
writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
console.log(
  `shared/plausibility.json: ${curves.length} partidas en ${((Date.now() - started) / 1000).toFixed(0)} s · ` +
    `deuda saldada como pronto en ${minDebtTime.toFixed(0)} s → mínimo plausible ${output.minDebtSeconds} s · ` +
    `a los 8 min se aceptan hasta ${maxEarned[48].toLocaleString('es-ES')} fichas ganadas`,
);
