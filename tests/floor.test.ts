import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import { seededRng } from '../src/game/rng';
import { deserialize } from '../src/game/save';
import { createInitialState, type GameState } from '../src/game/state';
import { updateGame } from '../src/game/update';

/** Partida con las mesas 2 a 4 abiertas, todo a cero: sin mejoras, sin ayudantes y sin saldo. */
function allOpen(): GameState {
  const state = createInitialState();
  state.debtPaid = true;
  state.slots.debtPaid = true;
  state.dice.debtPaid = true;
  state.balance = 0;
  return state;
}

const TABLES = [
  { id: 2, balance: (s: GameState) => s.slots.balance, min: CONFIG.slots.bet.minBet },
  { id: 3, balance: (s: GameState) => s.dice.balance, min: CONFIG.dice.bet.minBet },
  { id: 4, balance: (s: GameState) => s.cards.balance, min: CONFIG.cards.bet.minBet },
] as const;

describe('suelo pasivo de las mesas sin trastienda', () => {
  for (const table of TABLES) {
    it(`mesa ${table.id}: con saldo 0 y sin nada, la apuesta mínima llega en 10 s como mucho`, () => {
      const state = allOpen();
      state.activeTable = table.id;
      const rng = seededRng(table.id);
      let time = 0;
      while (table.balance(state) < table.min && time < 10) {
        updateGame(state, 0.1, rng);
        time += 0.1;
      }
      expect(table.balance(state)).toBeGreaterThanOrEqual(table.min);
      expect(time).toBeLessThanOrEqual(10 + 1e-9);
    });

    it(`mesa ${table.id}: ningún ayudante deja la mesa sin poder seguir`, () => {
      const state = allOpen();
      state.activeTable = table.id;
      // El ayudante comprado, con el perfil más agresivo y a toda velocidad.
      const ups = { 2: state.slots.upgrades, 3: state.dice.upgrades, 4: state.cards.upgrades }[table.id] as Record<string, number>;
      const helperId = { 2: 'zombie', 3: 'ghost', 4: 'skeleton' }[table.id];
      ups[helperId] = 1;
      ups.helperProfile = 2;
      ups.helperSpeed = 5;
      const tableState = { 2: state.slots, 3: state.dice, 4: state.cards }[table.id];
      tableState.helper.profile = 2;
      const rng = seededRng(100 + table.id);
      let below = 0;
      let longest = 0;
      for (let t = 0; t < 600; t += 0.1) {
        updateGame(state, 0.1, rng);
        below = table.balance(state) < table.min ? below + 0.1 : 0;
        longest = Math.max(longest, below);
      }
      expect(longest).toBeLessThanOrEqual(10);
    });
  }
});

describe('migración a la versión 8 (sin trastienda en las mesas 2 a 4)', () => {
  it('quita las mejoras de trabajo y devuelve lo que costaron en la moneda de cada mesa', () => {
    const state = allOpen() as unknown as Record<string, Record<string, unknown>>;
    const v7 = {
      version: 7,
      savedAt: 1,
      state: {
        ...state,
        slots: { ...state.slots, balance: 10, upgrades: { ...(state.slots.upgrades as object), rag: 1, toolbox: 2 }, work: { items: [] } },
        dice: { ...state.dice, balance: 0, upgrades: { ...(state.dice.upgrades as object), busboy: 1 } },
        cards: { ...state.cards, balance: 5, upgrades: { ...(state.cards.upgrades as object) } },
      },
    };
    const file = deserialize(JSON.stringify(v7))!;
    expect(file).not.toBeNull();
    // Trapo 80 + caja 60 + 135.
    expect(file.state.slots.balance).toBe(10 + 80 + 60 + 135);
    expect(file.state.dice.balance).toBe(400);
    expect(file.state.cards.balance).toBe(5);
    expect('rag' in file.state.slots.upgrades).toBe(false);
    expect('work' in file.state.slots).toBe(false);
  });
});
