import type { Rng } from '../src/game/rng';
import type { KeyValueStorage } from '../src/game/save';
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

/** localStorage falso en memoria. */
export function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}
