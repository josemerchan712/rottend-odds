import { updateHelper } from './helper';
import type { Rng } from './rng';
import type { GameState } from './state';
import { updateWork, type Collected } from './work';

/** Avanza la simulación dt segundos. Muta el estado. Devuelve lo que ha recogido el ayudante de limpieza. */
export function update(state: GameState, dt: number, rng: Rng): Collected[] {
  if (dt <= 0) return [];
  state.playTime += dt;
  const cleaned = updateWork(state, dt, rng);
  updateHelper(state, dt, rng);
  return cleaned;
}
