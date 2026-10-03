import { CONFIG } from './config';
import { pickWeighted, type Rng } from './rng';
import type { GameState } from './state';

/** Trabajo manual provisional: recoge un objeto de la basura disponible. */
export function collectTrash(state: GameState, rng: Rng): { name: string; value: number } | null {
  if (state.work.items <= 0) return null;
  const item = pickWeighted(CONFIG.work.items, rng);
  state.work.items--;
  state.balance += item.value;
  state.stats.workEarned += item.value;
  state.work.lastItem = item.name;
  return { name: item.name, value: item.value };
}

/** Reaparece basura si hay hueco. El temporizador no corre con el suelo lleno. */
export function updateWork(state: GameState, dt: number): void {
  const { maxItems, respawnInterval } = CONFIG.work;
  if (state.work.items >= maxItems) {
    state.work.spawnTimer = 0;
    return;
  }
  state.work.spawnTimer += dt;
  while (state.work.spawnTimer >= respawnInterval && state.work.items < maxItems) {
    state.work.spawnTimer -= respawnInterval;
    state.work.items++;
  }
  if (state.work.items >= maxItems) state.work.spawnTimer = 0;
}
