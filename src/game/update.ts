import { updateHelper } from './helper';
import type { Rng } from './rng';
import { updateCards, type CardsTick } from './cards/table';
import { updateDice, type DiceTick } from './dice/table';
import { updateSlots, type SlotsTick } from './slots/table';
import type { GameState } from './state';
import { updateWork, type Collected } from './work';

export interface Tick {
  /** Lo que ha recogido el ayudante de limpieza de la mesa 1. */
  cleaned: Collected[];
  /** Lo que ha pasado en la mesa 2 (tiradas del zombi y lo que ha limpiado el aprendiz). */
  slots: SlotsTick;
  /** Lo que ha pasado en la mesa 3 (tiradas del camarero y lo que ha recogido el friegaplatos). */
  dice: DiceTick;
  /** Lo que ha pasado en la mesa 4 (manos del esqueleto y lo que ha recogido el repartidor). */
  cards: CardsTick;
}

/**
 * Avanza la partida dt segundos: las dos mesas a la vez (la que no se ve sigue con sus ayudantes).
 * Muta el estado.
 */
export function updateGame(state: GameState, dt: number, rng: Rng): Tick {
  if (dt <= 0) return { cleaned: [], slots: { zombie: [], cleaned: [] }, dice: { ghost: [], cleaned: [] }, cards: { skeleton: [], cleaned: [] } };
  state.playTime += dt;
  const cleaned = updateWork(state, dt, rng);
  updateHelper(state, dt, rng);
  return { cleaned, slots: updateSlots(state, dt, rng), dice: updateDice(state, dt, rng), cards: updateCards(state, dt, rng) };
}

/** Como updateGame, pero solo devuelve lo recogido por el limpiador de la mesa 1. */
export function update(state: GameState, dt: number, rng: Rng): Collected[] {
  return updateGame(state, dt, rng).cleaned;
}
