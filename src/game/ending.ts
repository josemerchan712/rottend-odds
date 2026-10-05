/**
 * Pantalla final: máquina de estados pura (sin DOM ni tiempo real; main.ts la avanza cada fotograma).
 *
 *   lastLine  la última línea del Dueño en su mesa; cuando termina, 2 s de pausa
 *   fadeOut   fundido a negro
 *   epilogue  la imagen final aparece y las 4 líneas se escriben a máquina, una por clic o cada ~5 s
 *   ledger    el libro de cuentas (espera un clic)
 *   credits   créditos que suben solos (un clic los salta)
 *   buttons   Volver al menú, Seguir jugando, Copiar resumen
 *
 * Esc o mantener una tecla pulsada salta a los botones. "Ver final" desde el menú empieza en el epílogo.
 */
export type EndingPhase = 'lastLine' | 'fadeOut' | 'epilogue' | 'ledger' | 'credits' | 'buttons';

export const ENDING_TIMING = {
  /** Lo más que se espera a que termine la línea del Dueño (s). */
  lastLineMax: 9,
  /** Pausa tras la línea, antes del fundido (s). */
  pause: 2,
  fadeOut: 1.5,
  /** La imagen final sale de negro (s); la primera línea empieza a escribirse después. */
  fadeIn: 1.5,
  charsPerSecond: 28,
  /** Con la línea ya escrita, pasa sola a la siguiente a los ~5 s. */
  autoAdvance: 5,
  /** Mantener una tecla este tiempo salta el final (s). */
  holdToSkip: 1.2,
  /** Velocidad de los créditos (unidades por segundo). */
  creditsSpeed: 24,
  /** Intensidad del zumbido durante el epílogo y el libro (vuelve a 1 en los créditos). */
  quietAmbient: 0.3,
} as const;

export interface EndingState {
  phase: EndingPhase;
  /** Segundos en la fase actual. */
  t: number;
  /** lastLine: segundos desde que la línea del Dueño ya no se ve. */
  lineGone: number;
  /** Epílogo: línea actual, letras escritas y segundos desde que se terminó de escribir. */
  line: number;
  chars: number;
  lineDone: number;
  /** Créditos: cuánto han subido (unidades). */
  creditsOffset: number;
  /** Tecla mantenida (para saltar). */
  held: number;
}

export function createEnding(replay = false): EndingState {
  return { phase: replay ? 'epilogue' : 'lastLine', t: 0, lineGone: 0, line: 0, chars: 0, lineDone: 0, creditsOffset: 0, held: 0 };
}

function enter(s: EndingState, phase: EndingPhase): void {
  s.phase = phase;
  s.t = 0;
}

/** El epílogo ya muestra la imagen (terminó el fundido de entrada). */
function artShown(s: EndingState): boolean {
  return s.phase !== 'epilogue' || s.t >= ENDING_TIMING.fadeIn;
}

export interface EndingInput {
  /** ¿Se ve aún la línea del Dueño (el bocadillo)? */
  lineVisible?: boolean;
  /** Alto total de los créditos (unidades): al subirlos enteros salen los botones. */
  creditsHeight?: number;
}

/** Avanza el final `dt` segundos. */
export function tickEnding(s: EndingState, dt: number, lines: readonly string[], input: EndingInput = {}): void {
  if (dt <= 0) return;
  s.t += dt;
  switch (s.phase) {
    case 'lastLine':
      if (!input.lineVisible || s.t >= ENDING_TIMING.lastLineMax) s.lineGone += dt;
      if (s.lineGone >= ENDING_TIMING.pause) enter(s, 'fadeOut');
      return;
    case 'fadeOut':
      if (s.t >= ENDING_TIMING.fadeOut) enter(s, 'epilogue');
      return;
    case 'epilogue': {
      if (!artShown(s)) return;
      const text = lines[s.line] ?? '';
      if (s.chars < text.length) {
        s.chars = Math.min(text.length, s.chars + ENDING_TIMING.charsPerSecond * dt);
        return;
      }
      s.lineDone += dt;
      if (s.lineDone >= ENDING_TIMING.autoAdvance) nextLine(s, lines);
      return;
    }
    case 'credits':
      s.creditsOffset += ENDING_TIMING.creditsSpeed * dt;
      if (input.creditsHeight !== undefined && s.creditsOffset >= input.creditsHeight) enter(s, 'buttons');
      return;
    default:
      return;
  }
}

function nextLine(s: EndingState, lines: readonly string[]): void {
  s.chars = 0;
  s.lineDone = 0;
  if (s.line + 1 < lines.length) s.line++;
  else enter(s, 'ledger');
}

/** Un clic, Intro o Espacio: completa la línea, pasa a la siguiente o a la fase siguiente. */
export function advanceEnding(s: EndingState, lines: readonly string[]): void {
  switch (s.phase) {
    case 'epilogue': {
      if (!artShown(s)) {
        s.t = ENDING_TIMING.fadeIn;
        return;
      }
      const text = lines[s.line] ?? '';
      if (s.chars < text.length) s.chars = text.length;
      else nextLine(s, lines);
      return;
    }
    case 'ledger':
      s.creditsOffset = 0;
      enter(s, 'credits');
      return;
    case 'credits':
      enter(s, 'buttons');
      return;
    default:
      return;
  }
}

/** Esc: directo a los botones finales. */
export function skipEnding(s: EndingState): void {
  if (s.phase !== 'buttons') enter(s, 'buttons');
}

/** Tecla mantenida: al cabo de `holdToSkip` salta el final. Devuelve true si ha saltado. */
export function holdEnding(s: EndingState, dt: number, held: boolean): boolean {
  if (!held || s.phase === 'buttons') {
    s.held = 0;
    return false;
  }
  s.held += dt;
  if (s.held < ENDING_TIMING.holdToSkip) return false;
  s.held = 0;
  skipEnding(s);
  return true;
}

/** Texto visible del epílogo (la línea actual, tantas letras como van escritas). */
export function endingText(s: EndingState, lines: readonly string[]): string {
  if (s.phase !== 'epilogue') return '';
  return (lines[s.line] ?? '').slice(0, Math.floor(s.chars));
}

/** ¿Está la línea actual entera (para el indicador de "sigue")? */
export function endingLineComplete(s: EndingState, lines: readonly string[]): boolean {
  return s.phase === 'epilogue' && artShown(s) && Math.floor(s.chars) >= (lines[s.line] ?? '').length;
}

/** Negro por encima de la escena (0-1): sube en el fundido y baja al aparecer la imagen final. */
export function endingFade(s: EndingState): number {
  if (s.phase === 'fadeOut') return Math.min(1, s.t / ENDING_TIMING.fadeOut);
  if (s.phase === 'epilogue') return Math.max(0, 1 - s.t / ENDING_TIMING.fadeIn);
  return 0;
}

/** Intensidad del zumbido ambiente: baja durante el epílogo y el libro y vuelve en los créditos. */
export function endingAmbient(s: EndingState): number {
  const quiet = ENDING_TIMING.quietAmbient;
  if (s.phase === 'lastLine') return 1;
  if (s.phase === 'fadeOut') return 1 - (1 - quiet) * Math.min(1, s.t / ENDING_TIMING.fadeOut);
  if (s.phase === 'epilogue' || s.phase === 'ledger') return quiet;
  return 1;
}
