import { expect, it } from 'vitest';
import { createInitialState } from '../src/game/state';
import { update } from '../src/game/update';

it('update acumula tiempo de juego e ignora deltas no positivos', () => {
  const state = createInitialState();
  update(state, 0.5);
  update(state, 0.25);
  update(state, -1);
  expect(state.playTime).toBeCloseTo(0.75);
});
