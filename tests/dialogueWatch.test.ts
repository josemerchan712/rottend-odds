import { describe, expect, it } from 'vitest';
import { DIALOGUE_ES } from '../src/content/dialogue.es';
import { CONFIG } from '../src/game/config';
import {
  createWatch,
  noteRoomEntered,
  noteSessionStart,
  noteSpinShown,
  notePlayerActivity,
  observe,
  tickWatch,
  type WatchSnapshot,
} from '../src/game/dialogueWatch';
import { seededRng } from '../src/game/rng';
import type { SpinResult } from '../src/game/state';

const rng = seededRng(7);
const snap = (over: Partial<WatchSnapshot> = {}): WatchSnapshot => ({ balance: 100, phase: 'calm', helperBought: false, debtPaid: false, ...over });
const spin = (over: Partial<SpinResult>): SpinResult => ({
  bettor: 'jugador',
  choice: { type: 'color', color: 'negro' },
  bet: 50,
  winChance: 0.5,
  outcome: 'pierde',
  slot: 3,
  delta: -50,
  jackpotCapped: false,
  ...over,
});
const tick = (w: ReturnType<typeof createWatch>, dt = 0.1, blocked = false) => tickWatch(w, dt, DIALOGUE_ES, 'calm', rng, blocked);

describe('cuándo habla el Encargado', () => {
  it('no dice "sin fichas" al empezar con 0 fichas; sí cuando el saldo pasa de >0 a 0', () => {
    const w = createWatch(snap({ balance: 0 }));
    observe(w, snap({ balance: 0 }));
    expect(tick(w)).toBeNull();
    observe(w, snap({ balance: 5 }));
    observe(w, snap({ balance: 0 }));
    expect(tick(w)?.trigger).toBe('broke');
  });

  it('el ayudante no dispara perder/ganar grande, pero sí el Cero Dorado', () => {
    const w = createWatch(snap());
    noteSpinShown(w, spin({ bettor: 'ayudante', bet: 500 }), 600);
    noteSpinShown(w, spin({ bettor: 'ayudante', bet: 500, outcome: 'gana', delta: 500 }), 600);
    expect(tick(w)).toBeNull();
    noteSpinShown(w, spin({ bettor: 'ayudante', bet: 1, outcome: 'jackpot', delta: 50 }), 600);
    expect(tick(w)?.trigger).toBe('jackpot');
  });

  it('una apuesta manual grande dispara perder grande; una pequeña no', () => {
    const w = createWatch(snap());
    noteSpinShown(w, spin({ bet: 19 }), 30);
    expect(tick(w)).toBeNull();
    noteSpinShown(w, spin({ bet: 20 }), 40);
    expect(tick(w)?.trigger).toBe('bigLoss');
  });

  it('volver a la partida solo tras 5 minutos fuera, y con la línea de la ausencia', () => {
    const w = createWatch(snap());
    noteSessionStart(w, 'resume', 120);
    expect(tick(w)).toBeNull();
    noteSessionStart(w, 'resume', 2 * 3600);
    const line = tick(w)!;
    expect(line.trigger).toBe('sessionResume');
    expect(line.text).not.toBe('Qué rapidez. Casi parece que te gusta este sitio.');
  });

  it('los motivos esperan al cambio de sala y caducan si tardan', () => {
    const w = createWatch(snap());
    noteRoomEntered(w, 'trastienda');
    expect(tick(w, 0.1, true)).toBeNull();
    expect(tick(w)?.trigger).toBe('enterBackroom');
    const late = createWatch(snap());
    noteRoomEntered(late, 'casino');
    tick(late, 10, true);
    expect(tick(late)).toBeNull();
  });

  it('la fase sube una vez y el pago de la deuda se dice siempre', () => {
    const w = createWatch(snap());
    observe(w, snap({ phase: 'uneasy' }));
    expect(tick(w)?.trigger).toBe('phaseUneasy');
    observe(w, snap({ phase: 'calm' }));
    observe(w, snap({ phase: 'uneasy' }));
    tick(w, CONFIG.dialogue.cooldownSeconds + 1);
    expect(w.pending).toHaveLength(0);
    observe(w, snap({ debtPaid: true }));
    expect(tick(w)?.trigger).toBe('debtPaid');
  });

  it('silencio: 75 s sin acciones, como mucho 2 líneas hasta la siguiente acción', () => {
    const w = createWatch(snap());
    const said: string[] = [];
    for (let i = 0; i < 4000; i++) {
      const line = tick(w, 0.1);
      if (line) said.push(line.trigger);
    }
    expect(said).toEqual(['silence', 'silence']);
    notePlayerActivity(w);
    for (let i = 0; i < 800; i++) {
      const line = tick(w, 0.1);
      if (line) said.push(line.trigger);
    }
    expect(said).toHaveLength(3);
  });
});
