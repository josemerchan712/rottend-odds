import type { GameState } from './state';

/** Avanza la simulación dt segundos. Muta el estado. */
export function update(state: GameState, dt: number): void {
  if (dt <= 0) return;
  state.playTime += dt;
}
