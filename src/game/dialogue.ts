import { CONFIG } from './config';
import type { LenderPhase } from './lender';
import type { Rng } from './rng';

/**
 * Qué dice el Encargado y cuándo (lógica pura, sin DOM). El texto vive en src/content/.
 * Reglas: una sola línea a la vez; cooldown mínimo entre líneas (salvo el pago de la deuda);
 * como mucho una línea cada pocas apuestas para lo que disparan las apuestas; nunca durante un
 * cambio de sala; sin repetir las últimas líneas; si coinciden varios motivos, gana la prioridad.
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
  | 'silence';

export type DialogueLines = Record<DialogueTrigger, Partial<Record<LenderPhase | 'any', string[]>>>;

/** Prioridad: si saltan varios a la vez (perder grande y quedarse sin fichas), se dice el mayor. */
export const PRIORITY: Record<DialogueTrigger, number> = {
  debtPaid: 100,
  newGame: 95,
  sessionResume: 95,
  jackpot: 90,
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
  /** Tiempo de juego de la última acción del jugador (para el silencio largo). */
  lastActivityAt: number;
}

export interface DialogueLine {
  id: string;
  trigger: DialogueTrigger;
  text: string;
}

export function createDialogueState(now = 0): DialogueState {
  return { lastLineAt: null, betsSinceLine: Infinity, recent: [], lastActivityAt: now };
}

/** El de más prioridad de los candidatos (o null si no hay). */
export function chooseTrigger(candidates: readonly DialogueTrigger[]): DialogueTrigger | null {
  let best: DialogueTrigger | null = null;
  for (const t of candidates) if (best === null || PRIORITY[t] > PRIORITY[best]) best = t;
  return best;
}

export function noteBet(dialogue: DialogueState, now: number): void {
  dialogue.betsSinceLine++;
  dialogue.lastActivityAt = now;
}

export function noteActivity(dialogue: DialogueState, now: number): void {
  dialogue.lastActivityAt = now;
}

/** ¿Toca ya el comentario por silencio largo? */
export function isSilent(dialogue: DialogueState, now: number): boolean {
  const { silenceSeconds } = CONFIG.dialogue;
  return now - dialogue.lastActivityAt >= silenceSeconds && (dialogue.lastLineAt === null || now - dialogue.lastLineAt >= silenceSeconds);
}

/** ¿Se puede decir algo por este motivo ahora mismo? */
export function canSpeak(dialogue: DialogueState, trigger: DialogueTrigger, now: number, inTransition: boolean): boolean {
  if (inTransition) return false;
  const { cooldownSeconds, minBetsBetweenLines } = CONFIG.dialogue;
  if (trigger !== 'debtPaid' && dialogue.lastLineAt !== null && now - dialogue.lastLineAt < cooldownSeconds) return false;
  if (BET_TRIGGERS.has(trigger) && dialogue.betsSinceLine < minBetsBetweenLines) return false;
  return true;
}

/** Las líneas posibles para un motivo en una fase (las de la fase o, si no hay, las genéricas). */
export function linesFor(lines: DialogueLines, trigger: DialogueTrigger, phase: LenderPhase): DialogueLine[] {
  const byPhase = lines[trigger];
  const key = byPhase[phase] ? phase : 'any';
  return (byPhase[key] ?? []).map((text, i) => ({ id: `${trigger}.${key}.${i}`, trigger, text }));
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
  inTransition = false,
): DialogueLine | null {
  if (!canSpeak(dialogue, trigger, now, inTransition)) return null;
  const pool = linesFor(lines, trigger, phase);
  if (!pool.length) return null;
  const fresh = pool.filter((l) => !dialogue.recent.includes(l.id));
  // Si todas se han dicho hace poco, la que se dijo hace más tiempo.
  const line = fresh.length
    ? fresh[Math.floor(rng() * fresh.length)]
    : pool.reduce((oldest, l) => (dialogue.recent.lastIndexOf(l.id) < dialogue.recent.lastIndexOf(oldest.id) ? l : oldest));
  dialogue.lastLineAt = now;
  dialogue.betsSinceLine = 0;
  dialogue.lastActivityAt = now;
  dialogue.recent.push(line.id);
  if (dialogue.recent.length > CONFIG.dialogue.recentMemory) dialogue.recent.shift();
  return line;
}
