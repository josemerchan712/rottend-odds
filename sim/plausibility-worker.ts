/**
 * Worker de npm run plausibility: juega las partidas de la mesa 1 que le tocan (estrategia y semilla
 * fijas por partida) y devuelve su curva de fichas ganadas. Mismo motor que la versión secuencial.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { DEFAULT_PLAYER, runOne, type PlayerModel } from './engine';
import { HELPER_STUDY, STRATEGIES } from './strategies';

export interface PlausibilityJob {
  index: number;
  strategy: number;
  seed: number;
}

export interface PlausibilityResult {
  index: number;
  curve: number[];
  debtTime: number | null;
}

const strategies = [...STRATEGIES, ...HELPER_STUDY];

export function runJob(job: PlausibilityJob, player: PlayerModel): PlausibilityResult {
  const r = runOne(strategies[job.strategy], job.seed, player);
  return { index: job.index, curve: r.earnedCurve, debtTime: r.debtTime };
}

// Pide lotes al hilo principal hasta que no quedan: así ningún worker se queda parado mientras otro
// termina partidas largas.
if (parentPort && workerData) {
  const port = parentPort;
  const { horizon, sampleEvery } = workerData as { horizon: number; sampleEvery: number };
  const player: PlayerModel = { ...DEFAULT_PLAYER, timeLimit: horizon, continueAfterDebt: true, sampleEvery };
  port.on('message', (jobs: PlausibilityJob[]) => port.postMessage(jobs.map((job) => runJob(job, player))));
  port.postMessage([]);
}
