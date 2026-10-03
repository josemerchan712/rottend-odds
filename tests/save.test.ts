import { describe, expect, it } from 'vitest';
import { deserialize, loadGame, SAVE_VERSION, saveGame, serialize, type KeyValueStorage } from '../src/game/save';
import { createInitialState } from '../src/game/state';
import { memoryStorage } from './helpers';

describe('guardado', () => {
  it('ida y vuelta conserva el estado y la versión', () => {
    const state = { ...createInitialState(), balance: 4321, playTime: 99.5 };
    const file = deserialize(serialize(state, 1000));
    expect(file).toEqual({ version: SAVE_VERSION, savedAt: 1000, state });
  });

  it('saveGame/loadGame usan el almacenamiento', () => {
    const storage = memoryStorage();
    const state = { ...createInitialState(), balance: 50 };
    expect(saveGame(storage, 'k', state, 5)).toBe(true);
    expect(loadGame(storage, 'k')?.state.balance).toBe(50);
    expect(loadGame(storage, 'otra')).toBeNull();
  });

  it('rechaza JSON roto, versiones futuras y formas inválidas', () => {
    expect(deserialize('{no es json')).toBeNull();
    expect(deserialize(JSON.stringify({ version: SAVE_VERSION + 1, state: {} }))).toBeNull();
    expect(deserialize(JSON.stringify({ state: {} }))).toBeNull();
    expect(deserialize('[]')).toBeNull();
  });

  it('rellena campos que faltan y corrige valores imposibles', () => {
    const raw = JSON.stringify({ version: SAVE_VERSION, savedAt: 1, state: { balance: -5, playTime: 'x' } });
    expect(deserialize(raw)?.state).toEqual(createInitialState());
    const raw2 = JSON.stringify({
      version: SAVE_VERSION,
      state: { upgrades: { luck: 99, maxBet: -3 }, helper: { profile: 2 }, work: { items: 50 } },
    });
    const state = deserialize(raw2)!.state;
    expect(state.upgrades.luck).toBe(20);
    expect(state.upgrades.maxBet).toBe(0);
    expect(state.helper.profile).toBe(0); // perfil no desbloqueado
    expect(state.work.items).toBe(6);
  });

  it('migra un guardado de la versión 1', () => {
    const raw = JSON.stringify({ version: 1, savedAt: 3, state: { balance: 77, playTime: 12 } });
    const file = deserialize(raw)!;
    expect(file.version).toBe(SAVE_VERSION);
    expect(file.state).toEqual({ ...createInitialState(), balance: 77, playTime: 12 });
  });

  it('no revienta si el almacenamiento lanza', () => {
    const broken: KeyValueStorage = {
      getItem: () => { throw new Error('bloqueado'); },
      setItem: () => { throw new Error('lleno'); },
      removeItem: () => {},
    };
    expect(saveGame(broken, 'k', createInitialState(), 0)).toBe(false);
    expect(loadGame(broken, 'k')).toBeNull();
  });
});
