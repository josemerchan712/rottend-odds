import { describe, expect, it } from 'vitest';
import { DIALOGUE_ES } from '../src/content/dialogue.es';
import { DIALOGUE2_ES } from '../src/content/dialogue2.es';
import { DIALOGUE3_ES } from '../src/content/dialogue3.es';
import { DIALOGUE4_ES } from '../src/content/dialogue4.es';
import { CONFIG } from '../src/game/config';
import {
  canSpeak,
  chooseTrigger,
  createDialogueState,
  isBigBet,
  isSilent,
  linesFor,
  noteActivity,
  noteBet,
  shouldGreetReturn,
  speak,
  type DialogueTrigger,
} from '../src/game/dialogue';
import { seededRng } from '../src/game/rng';

const { cooldownSeconds, minBetsBetweenLines, silenceSeconds } = CONFIG.dialogue;
const PHASED: DialogueTrigger[] = ['sessionResume', 'bigLoss', 'bigWin', 'jackpot', 'broke', 'enterBackroom', 'returnCasino', 'silence'];
const SINGLE: DialogueTrigger[] = ['newGame', 'buyCrupier', 'phaseUneasy', 'phaseDeformed', 'debtPaid'];

describe('contenido del diálogo de la mesa 2 (Tragaperras viviente)', () => {
  it('al menos 5 líneas por disparador y por fase, de 90 caracteres como mucho, distintas de las del Encargado', () => {
    for (const t of PHASED) {
      for (const phase of ['calm', 'uneasy', 'deformed'] as const) {
        expect(DIALOGUE2_ES[t][phase]!.length, `${t}.${phase}`).toBeGreaterThanOrEqual(5);
      }
    }
    for (const t of SINGLE) expect(DIALOGUE2_ES[t].any!.length, t).toBeGreaterThanOrEqual(5);
    const first = JSON.stringify(DIALOGUE_ES);
    for (const byPhase of Object.values(DIALOGUE2_ES)) {
      for (const list of Object.values(byPhase)) {
        for (const entry of list!) {
          const text = typeof entry === 'string' ? entry : entry.text;
          expect(text.length, text).toBeLessThanOrEqual(90);
          expect(first.includes(`"${text}"`), text).toBe(false);
        }
      }
    }
  });
});

describe('contenido del diálogo de la mesa 4 (la Crupier)', () => {
  it('al menos 5 líneas por disparador y fase, ≤ 90 caracteres, distintas de las otras mesas', () => {
    for (const t of PHASED) for (const phase of ['calm', 'uneasy', 'deformed'] as const) expect(DIALOGUE4_ES[t][phase]!.length, `${t}.${phase}`).toBeGreaterThanOrEqual(5);
    for (const t of SINGLE) expect(DIALOGUE4_ES[t].any!.length, t).toBeGreaterThanOrEqual(5);
    const others = JSON.stringify(DIALOGUE_ES) + JSON.stringify(DIALOGUE2_ES) + JSON.stringify(DIALOGUE3_ES);
    for (const byPhase of Object.values(DIALOGUE4_ES)) {
      for (const list of Object.values(byPhase)) {
        for (const entry of list!) {
          const text = typeof entry === 'string' ? entry : entry.text;
          expect(text.length, text).toBeLessThanOrEqual(90);
          expect(others.includes(`"${text}"`), text).toBe(false);
        }
      }
    }
  });
});

describe('contenido del diálogo de la mesa 3 (el Barman)', () => {
  it('al menos 5 líneas por disparador y fase, ≤ 90 caracteres, distintas de las otras mesas', () => {
    for (const t of PHASED) for (const phase of ['calm', 'uneasy', 'deformed'] as const) expect(DIALOGUE3_ES[t][phase]!.length, `${t}.${phase}`).toBeGreaterThanOrEqual(5);
    for (const t of SINGLE) expect(DIALOGUE3_ES[t].any!.length, t).toBeGreaterThanOrEqual(5);
    const others = JSON.stringify(DIALOGUE_ES) + JSON.stringify(DIALOGUE2_ES);
    for (const byPhase of Object.values(DIALOGUE3_ES)) {
      for (const list of Object.values(byPhase)) {
        for (const entry of list!) {
          const text = typeof entry === 'string' ? entry : entry.text;
          expect(text.length, text).toBeLessThanOrEqual(90);
          expect(others.includes(`"${text}"`), text).toBe(false);
        }
      }
    }
  });
});

describe('contenido del diálogo', () => {
  it('al menos 5 líneas por disparador y por fase, de 90 caracteres como mucho', () => {
    for (const t of PHASED) {
      for (const phase of ['calm', 'uneasy', 'deformed'] as const) {
        expect(DIALOGUE_ES[t][phase]!.length, `${t}.${phase}`).toBeGreaterThanOrEqual(5);
      }
    }
    for (const t of SINGLE) expect(DIALOGUE_ES[t].any!.length, t).toBeGreaterThanOrEqual(5);
    for (const byPhase of Object.values(DIALOGUE_ES)) {
      for (const list of Object.values(byPhase)) {
        for (const entry of list!) {
          const text = typeof entry === 'string' ? entry : entry.text;
          expect(text.length, text).toBeLessThanOrEqual(90);
        }
      }
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
    for (let i = 0; i < minBetsBetweenLines - 1; i++) noteBet(d);
    expect(canSpeak(d, 'bigLoss', later, false)).toBe(false);
    noteBet(d);
    expect(canSpeak(d, 'bigLoss', later, false)).toBe(true);
  });

  it('nunca durante un cambio de sala', () => {
    const d = createDialogueState();
    expect(speak(d, DIALOGUE_ES, 'enterBackroom', 'calm', 0, seededRng(4), { inTransition: true })).toBeNull();
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
    noteActivity(d, silenceSeconds);
    expect(isSilent(d, silenceSeconds + 10)).toBe(false);
  });
});

describe('cambios aprobados del diálogo', () => {
  const texts = (absence?: number) => linesFor(DIALOGUE_ES, 'sessionResume', 'uneasy', absence).map((l) => l.text);
  const calmTexts = (absence?: number) => linesFor(DIALOGUE_ES, 'sessionResume', 'calm', absence).map((l) => l.text);

  it('volver a la partida solo tras 5 minutos reales', () => {
    expect(shouldGreetReturn(299)).toBe(false);
    expect(shouldGreetReturn(300)).toBe(true);
  });

  it('condiciones de ausencia: corta (< 1 h) y larga (≥ 1 h)', () => {
    const quick = 'Qué rapidez. Casi parece que te gusta este sitio.';
    expect(calmTexts(600)).toContain(quick);
    expect(calmTexts(3600)).not.toContain(quick);
    for (const late of ['Llegas tarde. Lo he apuntado.', 'Has tardado. He contado cada segundo.', 'Has tardado. Yo no me he movido de aquí.']) {
      expect(texts(3600)).toContain(late);
      expect(texts(600)).not.toContain(late);
    }
    // Las que no tienen condición salen siempre.
    expect(texts(600)).toContain('Vuelves. Los que no vuelven me preocupan más.');
    expect(texts(7200)).toContain('Vuelves. Los que no vuelven me preocupan más.');
  });

  it('apuesta grande: ≥ 50 % del techo y ≥ 20 fichas', () => {
    expect(isBigBet(20, 40)).toBe(true);
    expect(isBigBet(19, 38)).toBe(false); // mitad del techo, pero menos de 20 fichas
    expect(isBigBet(400, 1000)).toBe(false); // 20 fichas o más, pero menos de la mitad
    expect(isBigBet(500, 1000)).toBe(true);
  });

  it('como mucho 2 líneas de silencio hasta la siguiente acción', () => {
    const d = createDialogueState(0);
    const rng = seededRng(9);
    let t = silenceSeconds;
    let said = 0;
    for (let i = 0; i < 6; i++, t += silenceSeconds + 1) {
      if (isSilent(d, t) && speak(d, DIALOGUE_ES, 'silence', 'calm', t, rng)) said++;
    }
    expect(said).toBe(2);
    noteActivity(d, t);
    expect(isSilent(d, t + silenceSeconds)).toBe(true);
  });

  it('textos cambiados', () => {
    const all = JSON.stringify(DIALOGUE_ES);
    expect(all).toContain('Gracias. De verdad. Cobrarte ha sido un placer.');
    expect(all).toContain('Sin fichas. Así es como mejor se te ve.');
    expect(all).toContain('Mírame bien. Así me pongo cuando alguien está a punto de pagar.');
    expect(all).not.toContain('ser tu dueño');
  });
});
