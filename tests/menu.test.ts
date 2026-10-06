import { describe, expect, it, vi } from 'vitest';
import { continueGame, continueInfo, menuItems, nextIndex, startNewGame } from '../src/game/menu';
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
    expect(continueInfo(storage, GAME)).toEqual({ playTime: 125, activeTable: 1, debtProgress: 0.25, debtPaid: false, finished: false });
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

describe('menú principal: opciones y navegación', () => {
  const base = { hasSave: false, online: false, loggedIn: false, finished: false };

  it('sin guardado ni servidor: Nueva partida, Ajustes, Modo demo y Créditos', () => {
    expect(menuItems(base)).toEqual(['newGame', 'settings', 'demo', 'credits']);
  });

  it('con guardado sale Continuar arriba; Ver final solo con el juego completado', () => {
    expect(menuItems({ ...base, hasSave: true })).toEqual(['continue', 'newGame', 'settings', 'demo', 'credits']);
    expect(menuItems({ ...base, hasSave: true, finished: true })).toEqual(['continue', 'newGame', 'settings', 'ending', 'demo', 'credits']);
    // Sin guardado no hay final que ver aunque llegue la marca.
    expect(menuItems({ ...base, finished: true })).not.toContain('ending');
  });

  it('con servidor: Ranking e Iniciar sesión; Sincronizar solo con sesión', () => {
    expect(menuItems({ ...base, online: true })).toEqual(['newGame', 'settings', 'ranking', 'login', 'demo', 'credits']);
    expect(menuItems({ ...base, online: true, loggedIn: true, hasSave: true })).toEqual(['continue', 'newGame', 'settings', 'ranking', 'login', 'sync', 'demo', 'credits']);
    // Sin servidor, la sesión no importa.
    expect(menuItems({ ...base, loggedIn: true })).not.toContain('sync');
  });

  it('flechas: da la vuelta por arriba y por abajo; sin foco empieza por el extremo', () => {
    expect(nextIndex(0, 1, 3)).toBe(1);
    expect(nextIndex(2, 1, 3)).toBe(0);
    expect(nextIndex(0, -1, 3)).toBe(2);
    expect(nextIndex(-1, 1, 3)).toBe(0);
    expect(nextIndex(-1, -1, 3)).toBe(2);
    expect(nextIndex(5, 1, 3)).toBe(0);
    expect(nextIndex(0, 1, 0)).toBe(-1);
  });

  it('Continuar describe la mesa actual y su deuda; la partida completada lo marca', () => {
    const storage = memoryStorage();
    const state = stateWith({ playTime: 3000 });
    state.debtPaid = state.slots.debtPaid = true;
    state.activeTable = 3;
    saveGame(storage, GAME, state, 0);
    const info = continueInfo(storage, GAME)!;
    expect(info.activeTable).toBe(3);
    expect(info.debtPaid).toBe(false);
    expect(info.finished).toBe(false);
    state.cards.debtPaid = state.dice.debtPaid = state.coin.debtPaid = true;
    state.activeTable = 5;
    saveGame(storage, GAME, state, 0);
    expect(continueInfo(storage, GAME)).toMatchObject({ activeTable: 5, debtPaid: true, debtProgress: 1, finished: true });
  });
});

describe('ajustes', () => {
  it('sobreviven a borrar la partida', () => {
    const storage = memoryStorage();
    saveSettings(storage, SETTINGS, { crt: 'fuerte', volume: 0.25, startFullscreen: true, dialogues: false, muted: false });
    saveGame(storage, GAME, stateWith({ balance: 5 }), 0);
    clearSave(storage, GAME);
    expect(continueInfo(storage, GAME)).toBeNull();
    expect(loadSettings(storage, SETTINGS)).toEqual({ crt: 'fuerte', volume: 0.25, startFullscreen: true, dialogues: false, muted: false });
  });

  it('también sobreviven a empezar una partida nueva', () => {
    const storage = memoryStorage();
    saveSettings(storage, SETTINGS, { crt: 'apagado', volume: 0.1, startFullscreen: false, dialogues: true, muted: false });
    saveGame(storage, GAME, stateWith(), 0);
    startNewGame(storage, GAME, () => true, 0);
    expect(loadSettings(storage, SETTINGS)).toEqual({ crt: 'apagado', volume: 0.1, startFullscreen: false, dialogues: true, muted: false });
  });

  it('"Iniciar en pantalla completa" está desactivado por defecto y se guarda', () => {
    const storage = memoryStorage();
    expect(loadSettings(storage, SETTINGS).startFullscreen).toBe(false);
    // Un guardado de ajustes antiguo, sin el campo, sigue cargando.
    storage.setItem(SETTINGS, JSON.stringify({ version: 1, settings: { crtEnabled: false, volume: 0.5 } }));
    expect(loadSettings(storage, SETTINGS)).toEqual({ crt: 'apagado', volume: 0.5, startFullscreen: false, dialogues: true, muted: false });
    saveSettings(storage, SETTINGS, { ...defaultSettings(), startFullscreen: true });
    expect(loadSettings(storage, SETTINGS).startFullscreen).toBe(true);
  });

  it('"Diálogos del Encargado" está activado por defecto, se guarda y sobrevive a borrar la partida', () => {
    const storage = memoryStorage();
    expect(loadSettings(storage, SETTINGS).dialogues).toBe(true);
    saveSettings(storage, SETTINGS, { ...defaultSettings(), dialogues: false, muted: false });
    saveGame(storage, GAME, stateWith(), 0);
    clearSave(storage, GAME);
    expect(loadSettings(storage, SETTINGS).dialogues).toBe(false);
  });

  it('el silencio se guarda con los ajustes (por defecto, con sonido)', () => {
    const storage = memoryStorage();
    expect(loadSettings(storage, SETTINGS).muted).toBe(false);
    saveSettings(storage, SETTINGS, { ...defaultSettings(), muted: true });
    expect(loadSettings(storage, SETTINGS).muted).toBe(true);
  });

  it('valores ausentes o inválidos vuelven al defecto', () => {
    const storage = memoryStorage();
    expect(loadSettings(storage, SETTINGS)).toEqual(defaultSettings());
    storage.setItem(SETTINGS, JSON.stringify({ version: 1, settings: { crtEnabled: 'sí', volume: 7 } }));
    expect(loadSettings(storage, SETTINGS)).toEqual({ ...defaultSettings(), volume: 1 });
    storage.setItem(SETTINGS, 'no es json');
    expect(loadSettings(storage, SETTINGS)).toEqual(defaultSettings());
  });
});
