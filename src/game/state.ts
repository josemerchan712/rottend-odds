/** Estado completo de la partida. Datos planos, serializables a JSON. */
export interface GameState {
  /** Fichas de la mesa 1. Nunca baja de 0. */
  balance: number;
  /** Segundos de juego activo acumulados. */
  playTime: number;
}

export function createInitialState(): GameState {
  return {
    balance: 0,
    playTime: 0,
  };
}
