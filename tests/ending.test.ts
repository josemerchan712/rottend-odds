import { describe, expect, it } from 'vitest';
import { ENDING_LINES_ES } from '../src/content/ending.es';
import {
  advanceEnding,
  createEnding,
  endingAmbient,
  endingFade,
  endingLineComplete,
  endingText,
  ENDING_TIMING as T,
  holdEnding,
  skipEnding,
  tickEnding,
} from '../src/game/ending';
import { deserialize, serialize } from '../src/game/save';
import { createInitialState } from '../src/game/state';
import { gameSummary, summaryText, tableTimes, trackPaidAt } from '../src/game/summary';
import { wrapText } from '../src/ui/ending';

const LINES = ['Uno dos tres.', 'Cuatro cinco.'];

/** Avanza en pasos pequeños (como los fotogramas). */
function run(s: ReturnType<typeof createEnding>, seconds: number, input = {}, lines: readonly string[] = LINES): void {
  for (let t = 0; t < seconds; t += 0.05) tickEnding(s, 0.05, lines, input);
}

describe('pantalla final: máquina de estados', () => {
  it('última línea del Dueño, 2 s de pausa al terminar y fundido a negro', () => {
    const s = createEnding();
    expect(s.phase).toBe('lastLine');
    run(s, 4, { lineVisible: true });
    expect(s.phase).toBe('lastLine'); // la línea sigue en pantalla
    run(s, T.pause - 0.2, { lineVisible: false });
    expect(s.phase).toBe('lastLine');
    run(s, 0.3, { lineVisible: false });
    expect(s.phase).toBe('fadeOut');
    expect(endingAmbient(s)).toBeLessThanOrEqual(1);
    run(s, T.fadeOut / 2);
    expect(endingFade(s)).toBeGreaterThan(0.3);
    run(s, T.fadeOut);
    expect(s.phase).toBe('epilogue');
  });

  it('si la línea no termina nunca, no se queda colgado', () => {
    const s = createEnding();
    run(s, T.lastLineMax + T.pause + 0.2, { lineVisible: true });
    expect(s.phase).toBe('fadeOut');
  });

  it('epílogo: la imagen sale de negro y cada línea se escribe letra a letra', () => {
    const s = createEnding(true);
    expect(s.phase).toBe('epilogue');
    expect(endingFade(s)).toBe(1);
    run(s, T.fadeIn - 0.1);
    expect(endingText(s, LINES)).toBe('');
    run(s, 0.3);
    const partial = endingText(s, LINES);
    expect(partial.length).toBeGreaterThan(0);
    expect(LINES[0].startsWith(partial)).toBe(true);
    run(s, 2);
    expect(endingText(s, LINES)).toBe(LINES[0]);
    expect(endingLineComplete(s, LINES)).toBe(true);
    expect(endingAmbient(s)).toBe(T.quietAmbient);
  });

  it('un clic completa la línea y otro pasa a la siguiente; tras la última, el libro de cuentas', () => {
    const s = createEnding(true);
    advanceEnding(s, LINES); // salta el fundido de entrada
    run(s, 0.1);
    advanceEnding(s, LINES);
    expect(endingText(s, LINES)).toBe(LINES[0]);
    advanceEnding(s, LINES);
    expect(s.line).toBe(1);
    expect(endingText(s, LINES)).toBe('');
    advanceEnding(s, LINES);
    advanceEnding(s, LINES);
    expect(s.phase).toBe('ledger');
  });

  it('sin tocar nada, cada línea pasa sola a los ~5 s', () => {
    const s = createEnding(true);
    run(s, T.fadeIn + 1 + T.autoAdvance + 0.2);
    expect(s.line).toBe(1);
  });

  it('libro → créditos que suben → botones; el zumbido vuelve en los créditos', () => {
    const s = createEnding(true);
    // Fundido de entrada, y por cada línea: completar y pasar.
    for (let i = 0; i < 5; i++) advanceEnding(s, LINES);
    expect(s.phase).toBe('ledger');
    advanceEnding(s, LINES);
    expect(s.phase).toBe('credits');
    expect(endingAmbient(s)).toBe(1);
    run(s, 2, { creditsHeight: 1000 });
    expect(s.creditsOffset).toBeGreaterThan(30);
    expect(s.phase).toBe('credits');
    run(s, 1000 / T.creditsSpeed, { creditsHeight: 1000 });
    expect(s.phase).toBe('buttons');
  });

  it('Esc o mantener una tecla salta a los botones', () => {
    const a = createEnding();
    skipEnding(a);
    expect(a.phase).toBe('buttons');
    const b = createEnding(true);
    expect(holdEnding(b, T.holdToSkip / 2, true)).toBe(false);
    expect(holdEnding(b, 0.1, false)).toBe(false); // soltar reinicia
    expect(holdEnding(b, T.holdToSkip / 2, true)).toBe(false);
    expect(holdEnding(b, T.holdToSkip / 2 + 0.01, true)).toBe(true);
    expect(b.phase).toBe('buttons');
  });

  it('las líneas del epílogo: 4, sobrias y de ≤ 90 caracteres', () => {
    expect(ENDING_LINES_ES).toHaveLength(4);
    for (const line of ENDING_LINES_ES) {
      expect(line.length).toBeLessThanOrEqual(90);
      expect(line).not.toMatch(/!|¡|jaja/i);
    }
    expect(ENDING_LINES_ES[3]).toMatch(/sombra/);
  });

  it('el texto se parte en renglones que caben en la caja', () => {
    const measure = (v: string) => v.length * 8;
    const rows = wrapText(ENDING_LINES_ES[3], 300, measure);
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) expect(measure(row)).toBeLessThanOrEqual(300);
    expect(rows.join(' ')).toBe(ENDING_LINES_ES[3]);
  });
});

describe('libro de cuentas y guardado v11', () => {
  it('tiempo por mesa a partir del momento de pago (desconocido o sin pagar: sin dato)', () => {
    expect(tableTimes([300, 900, 0, 0, 0])).toEqual([300, 600, null, null, null]);
    expect(tableTimes([-1, -1, 2000, 2600, 3300])).toEqual([null, null, null, 600, 700]);
  });

  it('se apunta el tiempo al pagar cada deuda, una sola vez', () => {
    const state = createInitialState();
    state.playTime = 480;
    state.debtPaid = true;
    trackPaidAt(state);
    state.playTime = 900;
    trackPaidAt(state);
    expect(state.stats.paidAt).toEqual([480, 0, 0, 0, 0]);
  });

  it('el resumen junta lo ganado, los ayudantes y la mejor racha; se puede copiar como texto', () => {
    const state = createInitialState();
    state.playTime = 3600;
    state.stats.won = 1000;
    state.coin.stats.won = 50;
    state.upgrades.crupier = 1;
    state.coin.upgrades.imp = 1;
    state.coin.stats.bestChain = 7;
    const s = gameSummary(state);
    expect(s).toMatchObject({ totalWon: 1050, helpers: 2, bestChain: 7 });
    const text = summaryText(s);
    expect(text).toContain('ROTTEN ODDS');
    expect(text).toContain('1:00:00');
    expect(text).toContain('7 caras');
    expect(text).toContain('2 de 5');
  });

  it('una partida v10 terminada ya ha visto el final (no se repite) y sus mesas pagadas no tienen tiempo', () => {
    const state = createInitialState();
    state.debtPaid = state.slots.debtPaid = state.dice.debtPaid = state.cards.debtPaid = state.coin.debtPaid = true;
    const raw = JSON.parse(serialize(state, 1));
    raw.version = 10;
    delete raw.state.endingSeen;
    delete raw.state.stats.paidAt;
    delete raw.state.stats.won;
    const file = deserialize(JSON.stringify(raw))!;
    expect(file.state.endingSeen).toBe(true);
    expect(file.state.stats.paidAt).toEqual([-1, -1, -1, -1, -1]);
    expect(file.state.stats.won).toBe(0);
    // Sin terminar: el final aún no se ha visto.
    const fresh = JSON.parse(serialize(createInitialState(), 1));
    fresh.version = 10;
    delete fresh.state.endingSeen;
    expect(deserialize(JSON.stringify(fresh))!.state.endingSeen).toBe(false);
  });

  it('finalVisto se guarda y se recupera; valores raros se corrigen', () => {
    const state = createInitialState();
    state.coin.debtPaid = true;
    state.endingSeen = true;
    state.playTime = 100;
    state.stats.paidAt = [50, -1, 'x' as unknown as number, 500, -7];
    const back = deserialize(serialize(state, 1))!.state;
    expect(back.endingSeen).toBe(true);
    expect(back.stats.paidAt).toEqual([50, -1, 0, 100, 0]);
  });
});
