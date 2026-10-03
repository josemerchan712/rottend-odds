import { updateHelper } from './helper';
import type { Rng } from './rng';
import type { GameState } from './state';
import { updateWork } from './work';

/** Avanza la simulación dt segundos. Muta el estado. */
export function update(state: GameState, dt: number, rng: Rng): void {
  if (dt <= 0) return;
  state.playTime += dt;
  updateWork(state, dt);
  updateHelper(state, dt, rng);
}
