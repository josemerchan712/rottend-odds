import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONFIG, HEIRLOOM_IDS } from '../src/game/config';
import { DEMO_SAVE_KEY, demoFinalState, demoStartState, demoState, parseDemoParam } from '../src/game/demo';
import { loadGame, saveGame } from '../src/game/save';
import { isTableUnlocked } from '../src/game/tables';
import type { TableId } from '../src/game/state';
import { memoryStorage } from './helpers';

describe('modo demo público', () => {
  it('los enlaces ?demo=mesa1 … mesa5 y ?demo=final; lo demás no hace nada', () => {
    for (const n of [1, 2, 3, 4, 5]) expect(parseDemoParam(`?demo=mesa${n}`)).toEqual({ kind: 'table', table: n });
    expect(parseDemoParam('?demo=final')).toEqual({ kind: 'final' });
    for (const bad of ['', '?demo=', '?demo=mesa6', '?demo=MESA1', '?dev=mesa5', '?demo=mesa1x']) expect(parseDemoParam(bad)).toBeNull();
  });

  it('cada enlace abre su mesa, también sobre una partida demo ya guardada', () => {
    for (const n of [1, 2, 3, 4, 5] as TableId[]) {
      expect(demoStartState(null, { kind: 'table', table: n }).activeTable).toBe(n);
      expect(demoStartState(demoState(1), { kind: 'table', table: n }).activeTable).toBe(n);
    }
    // Desde el menú (sin enlace), se sigue donde se dejó.
    expect(demoStartState(demoState(4), null).activeTable).toBe(4);
  });

  it('empieza con las cinco mesas abiertas y lo necesario para ver cada mecánica', () => {
    const s = demoState();
    for (const n of [1, 2, 3, 4, 5] as TableId[]) expect(isTableUnlocked(s, n), `mesa ${n}`).toBe(true);
    for (const id of HEIRLOOM_IDS) expect(s.coin.heirlooms[id]).toBeGreaterThan(0);
    expect(s.coin.upgrades.loaded).toBe(CONFIG.coin.upgrades.loaded.maxLevel);
    expect(s.coin.upgrades.imp).toBe(1);
    expect(s.coin.debtPaid).toBe(false);
    for (const balance of [s.balance, s.slots.balance, s.dice.balance, s.cards.balance, s.coin.balance]) expect(balance).toBeGreaterThan(1000);
    expect(demoFinalState().coin.debtPaid).toBe(true);
  });

  it('su hueco de guardado es otro: nunca escribe en la partida normal (ni en los del desarrollador)', () => {
    expect(DEMO_SAVE_KEY).not.toBe(CONFIG.tech.saveKey);
    expect(DEMO_SAVE_KEY).not.toMatch(/-dev/);
    const storage = memoryStorage();
    saveGame(storage, DEMO_SAVE_KEY, demoFinalState(), 1);
    expect(loadGame(storage, CONFIG.tech.saveKey)).toBeNull();
    expect(loadGame(storage, DEMO_SAVE_KEY)?.state.coin.debtPaid).toBe(true);
  });

  it('el demo no se sincroniza ni registra en el ranking, y su final no marca la partida real', () => {
    const main = readFileSync('src/main.ts', 'utf8');
    // Guardar en juego va al hueco del demo; sincronizar y exportar leen siempre el hueco normal.
    expect(main).toContain('saveGame(localStorage, demoActive ? DEMO_SAVE_KEY : saveKey, state, Date.now())');
    expect(main).toMatch(/syncGame\(api, s\.token, loadGame\(localStorage, saveKey\)/);
    expect(main).not.toMatch(/syncGame\([^)]*DEMO_SAVE_KEY/);
    // El ranking corta en seco en modo demo.
    const report = main.slice(main.indexOf('async function reportDebtPaid'), main.indexOf('async function reportDebtPaid') + 260);
    expect(report).toMatch(/if \(demoActive\) \{[\s\S]*return;/);
  });

  it('el modo desarrollador (?dev=) solo existe con npm run dev (import.meta.env.DEV)', () => {
    const main = readFileSync('src/main.ts', 'utf8');
    expect(main).toContain("const DEV_MODE = import.meta.env.DEV ? new URLSearchParams(location.search).get('dev') : null;");
    // Nada más lee ?dev= (el modo demo usa ?demo=).
    expect(main.match(/get\('dev'\)/g)).toHaveLength(1);
  });
});
