import type { Rng } from '../src/game/rng';
import { createInitialState, type GameState } from '../src/game/state';

/** RNG que devuelve los valores dados en bucle, para forzar resultados concretos. */
export function sequenceRng(...values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length];
}

/** Valores para spin(): [jackpot?, gana?, casilla]. */
export const LOSE = sequenceRng(0.999, 0.999, 0.5);
export const WIN = sequenceRng(0.999, 0, 0.5);
export const JACKPOT = sequenceRng(0, 0, 0.5);

export function stateWith(overrides: Partial<GameState> = {}): GameState {
  return { ...createInitialState(), ...overrides };
}
