import { describe, expect, it } from 'vitest';
import { DIALOGUE_ES } from '../src/content/dialogue.es';
import { CONFIG } from '../src/game/config';
import {
  canSpeak,
  chooseTrigger,
  createDialogueState,
  isSilent,
  linesFor,
  noteBet,
  speak,
  type DialogueTrigger,
} from '../src/game/dialogue';
import { seededRng } from '../src/game/rng';

const { cooldownSeconds, minBetsBetweenLines, silenceSeconds } = CONFIG.dialogue;
const PHASED: DialogueTrigger[] = ['sessionResume', 'bigLoss', 'bigWin', 'jackpot', 'broke', 'enterBackroom', 'returnCasino', 'silence'];
const SINGLE: DialogueTrigger[] = ['newGame', 'buyCrupier', 'phaseUneasy', 'phaseDeformed', 'debtPaid'];

describe('contenido del diálogo', () => {
  it('al menos 5 líneas por disparador y por fase, de 90 caracteres como mucho', () => {
    for (const t of PHASED) {
      for (const phase of ['calm', 'uneasy', 'deformed'] as const) {
        expect(DIALOGUE_ES[t][phase]!.length, `${t}.${phase}`).toBeGreaterThanOrEqual(5);
      }
    }
    for (const t of SINGLE) expect(DIALOGUE_ES[t].any!.length, t).toBeGreaterThanOrEqual(5);
    for (const byPhase of Object.values(DIALOGUE_ES)) {
      for (const list of Object.values(byPhase)) for (const line of list!) expect(line.length, line).toBeLessThanOrEqual(90);
    }
  });

  it('usa las líneas de la fase y, si no hay, las genéricas', () => {
    expect(linesFor(DIALOGUE_ES, 'bigLoss', 'deformed')[0].id).toBe('bigLoss.deformed.0');
    expect(linesFor(DIALOGUE_ES, 'debtPaid', 'calm')[0].id).toBe('debtPaid.any.0');
  });
});

describe('reglas del diálogo', () => {
  it('cooldown mínimo de 25 s entre líneas', () => {
    const d = createDialogueState();
    const rng = seededRng(1);
    expect(speak(d, DIALOGUE_ES, 'enterBackroom', 'calm', 10, rng)).not.toBeNull();
    expect(speak(d, DIALOGUE_ES, 'returnCasino', 'calm', 10 + cooldownSeconds - 1, rng)).toBeNull();
    expect(speak(d, DIALOGUE_ES, 'returnCasino', 'calm', 10 + cooldownSeconds, rng)).not.toBeNull();
  });

  it('el pago de la deuda se salta el cooldown', () => {
    const d = createDialogueState();
    const rng = seededRng(2);
    speak(d, DIALOGUE_ES, 'bigWin', 'calm', 100, rng);
    expect(speak(d, DIALOGUE_ES, 'debtPaid', 'calm', 101, rng)?.trigger).toBe('debtPaid');
  });

  it('como mucho una línea cada pocas apuestas para lo que disparan las apuestas', () => {
    const d = createDialogueState();
    const rng = seededRng(3);
    speak(d, DIALOGUE_ES, 'bigLoss', 'calm', 0, rng);
    const later = cooldownSeconds + 1;
    for (let i = 0; i < minBetsBetweenLines - 1; i++) noteBet(d, later);
    expect(canSpeak(d, 'bigLoss', later, false)).toBe(false);
    noteBet(d, later);
    expect(canSpeak(d, 'bigLoss', later, false)).toBe(true);
  });

  it('nunca durante un cambio de sala', () => {
    const d = createDialogueState();
    expect(speak(d, DIALOGUE_ES, 'enterBackroom', 'calm', 0, seededRng(4), true)).toBeNull();
    expect(d.lastLineAt).toBeNull();
  });

  it('no repite ninguna de las últimas líneas', () => {
    const d = createDialogueState();
    const rng = seededRng(5);
    const said: string[] = [];
    for (let i = 0; i < 40; i++) {
      const line = speak(d, DIALOGUE_ES, 'jackpot', 'calm', i * (cooldownSeconds + 1), rng)!;
      // Solo hay 5 líneas de este motivo: ninguna de las 4 anteriores puede repetirse.
      expect(said.slice(-4)).not.toContain(line.id);
      said.push(line.id);
    }
  });

  it('si coinciden varios motivos, gana el de más prioridad', () => {
    expect(chooseTrigger(['bigLoss', 'broke'])).toBe('broke');
    expect(chooseTrigger(['bigWin', 'jackpot', 'phaseUneasy'])).toBe('jackpot');
    expect(chooseTrigger(['silence', 'debtPaid', 'jackpot'])).toBe('debtPaid');
    expect(chooseTrigger([])).toBeNull();
  });

  it('el silencio largo salta tras un rato sin actividad ni líneas', () => {
    const d = createDialogueState(0);
    expect(isSilent(d, silenceSeconds - 1)).toBe(false);
    expect(isSilent(d, silenceSeconds)).toBe(true);
    noteBet(d, silenceSeconds);
    expect(isSilent(d, silenceSeconds + 10)).toBe(false);
  });
});
