import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DIALOGUE_ES } from '../src/content/dialogue.es';
import { CONFIG } from '../src/game/config';
import { BACKROOM_SIGN, BROKE_AGAIN, BROKE_FIRST, brokeNotice, hasCollected, showBackroomSign } from '../src/game/onboarding';
import { seededRng } from '../src/game/rng';
import { createInitialState, type GameState, type TableId } from '../src/game/state';
import { collectItem, updateWork } from '../src/game/work';

/** Partida nueva con la basura del suelo ya sembrada. */
function freshWithTrash(): GameState {
  const state = createInitialState();
  updateWork(state, 0.1, seededRng(3));
  return state;
}

describe('primeros pasos de la mesa 1: la trastienda', () => {
  it('el rótulo sale solo en una partida nueva, sin nada recogido', () => {
    const state = freshWithTrash();
    expect(state.balance).toBe(0);
    expect(showBackroomSign(state)).toBe(true);
  });

  it('desaparece al recoger el primer objeto y no vuelve aunque se quede sin fichas', () => {
    const state = freshWithTrash();
    expect(state.work.items.length).toBeGreaterThan(0);
    collectItem(state, state.work.items[0].id);
    expect(hasCollected(state)).toBe(true);
    expect(showBackroomSign(state)).toBe(false);
    state.balance = 0;
    expect(showBackroomSign(state)).toBe(false);
  });

  it('tampoco sale si ya tiene fichas o ya ha apostado', () => {
    const rich = createInitialState();
    rich.balance = CONFIG.bet.minBet;
    expect(showBackroomSign(rich)).toBe(false);
    const played = createInitialState();
    played.stats.bets = 1;
    expect(showBackroomSign(played)).toBe(false);
  });

  it('aviso en el tapete sin fichas: largo si nunca recogió nada, corto si ya recogió; nada con fichas', () => {
    const state = freshWithTrash();
    expect(brokeNotice(state)).toBe(BROKE_FIRST);
    collectItem(state, state.work.items[0].id);
    state.balance = 0;
    expect(brokeNotice(state)).toBe(BROKE_AGAIN);
    state.balance = CONFIG.bet.minBet;
    expect(brokeNotice(state)).toBeNull();
  });

  it('en las mesas 2 a 5 no aparece nada de esto', () => {
    for (const table of [2, 3, 4, 5] as TableId[]) {
      const state = createInitialState();
      state.activeTable = table;
      expect(showBackroomSign(state), `mesa ${table}`).toBe(false);
      expect(brokeNotice(state), `mesa ${table}`).toBeNull();
    }
  });

  it('el rótulo y el aviso no dependen de los diálogos (se ven aunque estén desactivados)', () => {
    // Las funciones no reciben los ajustes, la escena dibuja el rótulo solo con el estado de la partida y
    // el aviso del tapete no pasa por el ajuste de diálogos.
    expect(showBackroomSign.length).toBe(1);
    const scene = readFileSync('src/ui/scene.ts', 'utf8');
    expect(scene).toContain('if (showBackroomSign(state)) this.drawBackroomSign();');
    expect(scene).not.toMatch(/dialogues/);
    const main = readFileSync('src/main.ts', 'utf8');
    const click = main.slice(main.indexOf('const notice = brokeNotice(state);'), main.indexOf('const notice = brokeNotice(state);') + 200);
    expect(click).toContain('scene.showNotice(notice)');
    expect(click).not.toMatch(/dialogues/);
  });

  it('el rótulo y los avisos caben (≤ 40 caracteres por línea; los avisos, una línea de la mesa)', () => {
    const text = [BACKROOM_SIGN.title, ...BACKROOM_SIGN.lines].join(' ');
    expect(text.length).toBeLessThanOrEqual(40);
    // Líneas cortas (≈ 5 unidades por carácter a 14 px): desde x 26 no llegan a la tira (x 156) ni a la ruleta.
    for (const line of [BACKROOM_SIGN.title, ...BACKROOM_SIGN.lines]) expect(26 + line.length * 5.5).toBeLessThan(156);
    expect(BROKE_FIRST.length).toBeLessThanOrEqual(60);
  });

  it('al empezar una partida nueva el Encargado nombra la trastienda (todas sus líneas, ≤ 90 caracteres)', () => {
    const lines = DIALOGUE_ES.newGame.any ?? [];
    expect(lines.length).toBeGreaterThanOrEqual(5);
    for (const line of lines) {
      const text = typeof line === 'string' ? line : line.text;
      expect(text).toMatch(/trastienda/i);
      expect(text.length).toBeLessThanOrEqual(90);
    }
  });
});
