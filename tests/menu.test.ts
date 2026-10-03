import { describe, expect, it, vi } from 'vitest';
import { continueGame, continueInfo, startNewGame } from '../src/game/menu';
import { clearSave, saveGame } from '../src/game/save';
import { defaultSettings, loadSettings, saveSettings } from '../src/game/settings';
import { memoryStorage, stateWith } from './helpers';

const GAME = 'partida';
const SETTINGS = 'ajustes';

describe('pantalla de inicio', () => {
  it('sin guardado no aparece Continuar', () => {
    const storage = memoryStorage();
    expect(continueInfo(storage, GAME)).toBeNull();
    expect(continueGame(storage, GAME)).toBeNull();
  });

  it('un guardado corrupto tampoco ofrece Continuar', () => {
    const storage = memoryStorage();
    storage.setItem(GAME, '{roto');
    expect(continueInfo(storage, GAME)).toBeNull();
  });

  it('con guardado, Continuar muestra tiempo y estado de la deuda', () => {
    const storage = memoryStorage();
    saveGame(storage, GAME, stateWith({ balance: 2_500_000, playTime: 125 }), 0);
    expect(continueInfo(storage, GAME)).toEqual({ playTime: 125, debtProgress: 0.25, debtPaid: false });
    expect(continueGame(storage, GAME)?.balance).toBe(2_500_000);
  });

  it('nueva partida sin guardado no pide confirmación', () => {
    const storage = memoryStorage();
    const confirm = vi.fn(() => false);
    const state = startNewGame(storage, GAME, confirm, 0);
    expect(confirm).not.toHaveBeenCalled();
    expect(state?.balance).toBe(0);
    expect(continueInfo(storage, GAME)).not.toBeNull();
  });

  it('nueva partida con guardado pide confirmación', () => {
    const storage = memoryStorage();
    saveGame(storage, GAME, stateWith({ balance: 999 }), 0);
    const confirm = vi.fn(() => true);
    const state = startNewGame(storage, GAME, confirm, 0);
    expect(confirm).toHaveBeenCalledOnce();
    expect(state?.balance).toBe(0);
    expect(continueGame(storage, GAME)?.balance).toBe(0);
  });

  it('si se cancela la confirmación, el guardado sigue intacto', () => {
    const storage = memoryStorage();
    saveGame(storage, GAME, stateWith({ balance: 999 }), 0);
    expect(startNewGame(storage, GAME, () => false, 0)).toBeNull();
    expect(continueGame(storage, GAME)?.balance).toBe(999);
  });
});

describe('ajustes', () => {
  it('sobreviven a borrar la partida', () => {
    const storage = memoryStorage();
    saveSettings(storage, SETTINGS, { crtEnabled: false, volume: 0.25 });
    saveGame(storage, GAME, stateWith({ balance: 5 }), 0);
    clearSave(storage, GAME);
    expect(continueInfo(storage, GAME)).toBeNull();
    expect(loadSettings(storage, SETTINGS)).toEqual({ crtEnabled: false, volume: 0.25 });
  });

  it('también sobreviven a empezar una partida nueva', () => {
    const storage = memoryStorage();
    saveSettings(storage, SETTINGS, { crtEnabled: false, volume: 0.1 });
    saveGame(storage, GAME, stateWith(), 0);
    startNewGame(storage, GAME, () => true, 0);
    expect(loadSettings(storage, SETTINGS)).toEqual({ crtEnabled: false, volume: 0.1 });
  });

  it('valores ausentes o inválidos vuelven al defecto', () => {
    const storage = memoryStorage();
    expect(loadSettings(storage, SETTINGS)).toEqual(defaultSettings());
    storage.setItem(SETTINGS, JSON.stringify({ version: 1, settings: { crtEnabled: 'sí', volume: 7 } }));
    expect(loadSettings(storage, SETTINGS)).toEqual({ crtEnabled: true, volume: 1 });
    storage.setItem(SETTINGS, 'no es json');
    expect(loadSettings(storage, SETTINGS)).toEqual(defaultSettings());
  });
});
