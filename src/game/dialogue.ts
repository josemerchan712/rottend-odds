import { CONFIG } from './config';
import type { LenderPhase } from './lender';
import type { Rng } from './rng';

/**
 * Qué dice el prestamista de cada mesa y cuándo (lógica pura, sin DOM). El texto vive en
 * src/content/. Reglas: una sola línea a la vez; cooldown mínimo entre líneas (salvo el pago de la
 * deuda); como mucho una línea cada pocas apuestas para lo que disparan las apuestas; nunca durante
 * un cambio de sala; sin repetir las últimas líneas; como mucho 2 líneas de silencio seguidas sin
 * que el jugador haga nada; si coinciden varios motivos, gana la prioridad.
 */
export type DialogueTrigger =
  | 'newGame'
  | 'sessionResume'
  | 'bigLoss'
  | 'bigWin'
  | 'jackpot'
  | 'broke'
  | 'enterBackroom'
  | 'returnCasino'
  | 'buyCrupier'
  | 'phaseUneasy'
  | 'phaseDeformed'
  | 'debtPaid'
  | 'silence'
  /** Mesa 5: la cadena llega a 3, 6 o 9 caras (las otras mesas no tienen líneas para estos). */
  | 'chain3'
  | 'chain6'
  | 'chain9';

/** Condición de ausencia de una línea de "volver a la partida": menos de una hora o una hora o más. */
export type Absence = 'short' | 'long';

/** Una línea: texto solo, o texto con condición. */
export type DialogueEntry = string | { text: string; absence: Absence };

export type DialogueLines = Record<DialogueTrigger, Partial<Record<LenderPhase | 'any', DialogueEntry[]>>>;

/** Prioridad: si saltan varios a la vez (perder grande y quedarse sin fichas), se dice el mayor. */
export const PRIORITY: Record<DialogueTrigger, number> = {
  debtPaid: 100,
  newGame: 95,
  sessionResume: 95,
  jackpot: 90,
  chain9: 88,
  chain6: 78,
  chain3: 72,
  phaseDeformed: 85,
  phaseUneasy: 80,
  buyCrupier: 70,
  broke: 60,
  bigLoss: 50,
  bigWin: 45,
  returnCasino: 30,
  enterBackroom: 30,
  silence: 10,
};

/** Los que dispara una apuesta: sujetos a "como mucho una línea cada pocas apuestas". */
const BET_TRIGGERS = new Set<DialogueTrigger>(['bigLoss', 'bigWin', 'broke']);

export interface DialogueState {
  /** Tiempo de juego (s) de la última línea dicha. */
  lastLineAt: number | null;
  /** Apuestas desde la última línea. */
  betsSinceLine: number;
  /** Últimas líneas dichas (ids), para no repetirlas. */
  recent: string[];
  /** Tiempo de juego de la última acción del jugador (clic o tecla). */
  lastActivityAt: number;
  /** Líneas de silencio dichas desde la última acción del jugador. */
  silenceLines: number;
}

export interface DialogueLine {
  id: string;
  trigger: DialogueTrigger;
  text: string;
}

export interface SpeakOptions {
  inTransition?: boolean;
  /** Segundos reales de ausencia (para "volver a la partida"). */
  absenceSeconds?: number;
}

export function createDialogueState(now = 0): DialogueState {
  return { lastLineAt: null, betsSinceLine: Infinity, recent: [], lastActivityAt: now, silenceLines: 0 };
}

/** El de más prioridad de los candidatos (o null si no hay). */
export function chooseTrigger(candidates: readonly DialogueTrigger[]): DialogueTrigger | null {
  let best: DialogueTrigger | null = null;
  for (const t of candidates) if (best === null || PRIORITY[t] > PRIORITY[best]) best = t;
  return best;
}

/** Una apuesta resuelta (del jugador o del ayudante): cuenta para el límite por apuestas. */
export function noteBet(dialogue: DialogueState): void {
  dialogue.betsSinceLine++;
}

/** Una acción del jugador (clic o tecla): reinicia el silencio. */
export function noteActivity(dialogue: DialogueState, now: number): void {
  dialogue.lastActivityAt = now;
  dialogue.silenceLines = 0;
}

/**
 * ¿Toca el comentario de silencio largo? 75 s sin acciones del jugador (y sin líneas), y como
 * mucho 2 líneas de silencio hasta la siguiente acción.
 */
export function isSilent(dialogue: DialogueState, now: number): boolean {
  const { silenceSeconds, maxSilenceLines } = CONFIG.dialogue;
  if (dialogue.silenceLines >= maxSilenceLines) return false;
  return now - dialogue.lastActivityAt >= silenceSeconds && (dialogue.lastLineAt === null || now - dialogue.lastLineAt >= silenceSeconds);
}

/** Apuesta grande: al menos la mitad del techo y al menos 20 fichas (config). */
export function isBigBet(bet: number, ceiling: number): boolean {
  const { bigBetCeilingFraction, bigBetMinChips } = CONFIG.dialogue;
  return bet >= ceiling * bigBetCeilingFraction && bet >= bigBetMinChips;
}

/** "Volver a la partida" solo tras una ausencia real mínima (5 min por defecto). */
export function shouldGreetReturn(absenceSeconds: number): boolean {
  return absenceSeconds >= CONFIG.dialogue.resumeMinAbsenceSeconds;
}

/** ¿Se puede decir algo por este motivo ahora mismo? */
export function canSpeak(dialogue: DialogueState, trigger: DialogueTrigger, now: number, inTransition: boolean): boolean {
  if (inTransition) return false;
  const { cooldownSeconds, minBetsBetweenLines } = CONFIG.dialogue;
  if (trigger !== 'debtPaid' && dialogue.lastLineAt !== null && now - dialogue.lastLineAt < cooldownSeconds) return false;
  if (BET_TRIGGERS.has(trigger) && dialogue.betsSinceLine < minBetsBetweenLines) return false;
  return true;
}

function entryText(entry: DialogueEntry): string {
  return typeof entry === 'string' ? entry : entry.text;
}

function entryFits(entry: DialogueEntry, absenceSeconds: number | undefined): boolean {
  if (typeof entry === 'string') return true;
  if (absenceSeconds === undefined) return false;
  const long = absenceSeconds >= CONFIG.dialogue.longAbsenceSeconds;
  return entry.absence === (long ? 'long' : 'short');
}

/**
 * Las líneas posibles para un motivo en una fase (las de la fase o, si no hay, las genéricas),
 * quitando las que no cumplen su condición de ausencia.
 */
export function linesFor(lines: DialogueLines, trigger: DialogueTrigger, phase: LenderPhase, absenceSeconds?: number): DialogueLine[] {
  const byPhase = lines[trigger];
  const key = byPhase[phase] ? phase : 'any';
  return (byPhase[key] ?? [])
    .map((entry, i) => ({ entry, line: { id: `${trigger}.${key}.${i}`, trigger, text: entryText(entry) } }))
    .filter(({ entry }) => entryFits(entry, absenceSeconds))
    .map(({ line }) => line);
}

/**
 * Pide una línea. Si se puede hablar, elige al azar una que no esté entre las últimas dichas,
 * la registra y la devuelve; si no, devuelve null.
 */
export function speak(
  dialogue: DialogueState,
  lines: DialogueLines,
  trigger: DialogueTrigger,
  phase: LenderPhase,
  now: number,
  rng: Rng,
  options: SpeakOptions = {},
): DialogueLine | null {
  if (!canSpeak(dialogue, trigger, now, options.inTransition ?? false)) return null;
  const pool = linesFor(lines, trigger, phase, options.absenceSeconds);
  if (!pool.length) return null;
  const fresh = pool.filter((l) => !dialogue.recent.includes(l.id));
  // Si todas se han dicho hace poco, la que se dijo hace más tiempo.
  const line = fresh.length
    ? fresh[Math.floor(rng() * fresh.length)]
    : pool.reduce((oldest, l) => (dialogue.recent.lastIndexOf(l.id) < dialogue.recent.lastIndexOf(oldest.id) ? l : oldest));
  dialogue.lastLineAt = now;
  dialogue.betsSinceLine = 0;
  if (trigger === 'silence') dialogue.silenceLines++;
  dialogue.recent.push(line.id);
  if (dialogue.recent.length > CONFIG.dialogue.recentMemory) dialogue.recent.shift();
  return line;
}
