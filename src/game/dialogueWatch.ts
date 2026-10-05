import { CONFIG } from './config';
import {
  chooseTrigger,
  createDialogueState,
  isBigBet,
  isSilent,
  noteActivity,
  noteBet,
  speak,
  type DialogueLine,
  type DialogueLines,
  type DialogueState,
  type DialogueTrigger,
} from './dialogue';
import type { LenderPhase } from './lender';
import type { Rng } from './rng';
import type { Room } from './rooms';
import type { SpinResult } from './state';

/**
 * Decide cuándo habla el prestamista a partir de lo que pasa en la partida (lógica pura, sin DOM;
 * vale para cualquier mesa). La interfaz le cuenta lo que ve (tiradas que acaban de verse, salas,
 * acciones del jugador) y le pasa una foto del estado en cada fotograma; él junta los motivos y,
 * cuando se puede hablar, pide la línea de más prioridad.
 *
 * - Perder/ganar grande: solo apuestas manuales grandes. El jackpot: cualquiera, también del ayudante.
 * - Quedarse sin fichas: solo cuando el saldo pasa de más de 0 a 0 durante la partida.
 * - Los motivos esperan mientras hay un cambio de sala o una tirada girando a la vista, y caducan
 *   a los pocos segundos: una línea que llega tarde suena rara.
 */
export interface WatchSnapshot {
  balance: number;
  phase: LenderPhase;
  /** Ayudante comprado (crupier en la mesa 1). */
  helperBought: boolean;
  debtPaid: boolean;
}

interface Pending {
  trigger: DialogueTrigger;
  at: number;
  absenceSeconds?: number;
}

export interface DialogueWatch {
  dialogue: DialogueState;
  /** Reloj propio (s), solo avanza mientras se juega. */
  now: number;
  prev: WatchSnapshot;
  /** Fase más alta alcanzada en esta sesión (las de cambio de fase salen una vez). */
  maxPhase: LenderPhase;
  pending: Pending[];
}

const PHASE_ORDER: LenderPhase[] = ['calm', 'uneasy', 'deformed'];
/** Segundos que un motivo espera su turno antes de caducar. */
export const PENDING_SECONDS = 6;

export function createWatch(snapshot: WatchSnapshot): DialogueWatch {
  return { dialogue: createDialogueState(0), now: 0, prev: { ...snapshot }, maxPhase: snapshot.phase, pending: [] };
}

function push(watch: DialogueWatch, trigger: DialogueTrigger, absenceSeconds?: number): void {
  watch.pending.push({ trigger, at: watch.now, absenceSeconds });
}

/** Al entrar en la partida: bienvenida de partida nueva, o "has vuelto" tras al menos 5 minutos fuera. */
export function noteSessionStart(watch: DialogueWatch, kind: 'new' | 'resume', absenceSeconds = 0): void {
  if (kind === 'new') push(watch, 'newGame');
  else if (absenceSeconds >= CONFIG.dialogue.resumeMinAbsenceSeconds) push(watch, 'sessionResume', absenceSeconds);
}

/** Lo mínimo de una tirada (de cualquier mesa) que importa al diálogo. */
export type ShownSpin = Pick<SpinResult, 'bettor' | 'bet' | 'outcome'>;

/** Una tirada que el jugador acaba de ver resolverse (la bola cae, o el aviso fuera del casino). */
export function noteSpinShown(watch: DialogueWatch, spin: ShownSpin, ceiling: number): void {
  noteBet(watch.dialogue);
  if (spin.outcome === 'jackpot') {
    push(watch, 'jackpot');
    return;
  }
  if (spin.bettor !== 'jugador' || !isBigBet(spin.bet, ceiling)) return;
  push(watch, spin.outcome === 'pierde' ? 'bigLoss' : 'bigWin');
}

/** Mesa 5: la cadena del jugador acaba de llegar a 3, 6 o 9 caras. */
export function noteChainMilestone(watch: DialogueWatch, wins: number): void {
  if (wins === 3) push(watch, 'chain3');
  else if (wins === 6) push(watch, 'chain6');
  else if (wins === 9) push(watch, 'chain9');
}

/** El jugador ha terminado de cambiar de sala. */
export function noteRoomEntered(watch: DialogueWatch, room: Room): void {
  push(watch, room === 'casino' ? 'returnCasino' : 'enterBackroom');
}

/** Un clic o una tecla del jugador. */
export function notePlayerActivity(watch: DialogueWatch): void {
  noteActivity(watch.dialogue, watch.now);
}

/** Compara con el fotograma anterior: compra del ayudante, fase, deuda pagada y quedarse sin fichas. */
export function observe(watch: DialogueWatch, snap: WatchSnapshot): void {
  const prev = watch.prev;
  if (!prev.helperBought && snap.helperBought) push(watch, 'buyCrupier');
  if (!prev.debtPaid && snap.debtPaid) push(watch, 'debtPaid');
  if (prev.balance > 0 && snap.balance <= 0) push(watch, 'broke');
  if (PHASE_ORDER.indexOf(snap.phase) > PHASE_ORDER.indexOf(watch.maxPhase)) {
    watch.maxPhase = snap.phase;
    push(watch, snap.phase === 'deformed' ? 'phaseDeformed' : 'phaseUneasy');
  }
  watch.prev = { ...snap };
}

/**
 * Avanza el reloj y, si nada lo impide, devuelve la línea que toca (o null). `blocked` = cambio de
 * sala o tirada girando a la vista: los motivos esperan. Si el cooldown no deja hablar, se pierden.
 */
export function tickWatch(
  watch: DialogueWatch,
  dt: number,
  lines: DialogueLines,
  phase: LenderPhase,
  rng: Rng,
  blocked: boolean,
): DialogueLine | null {
  watch.now += dt;
  watch.pending = watch.pending.filter((p) => watch.now - p.at <= PENDING_SECONDS);
  if (blocked) return null;
  if (!watch.pending.length && isSilent(watch.dialogue, watch.now)) push(watch, 'silence');
  const trigger = chooseTrigger(watch.pending.map((p) => p.trigger));
  if (!trigger) return null;
  const chosen = watch.pending.find((p) => p.trigger === trigger)!;
  watch.pending = [];
  return speak(watch.dialogue, lines, trigger, phase, watch.now, rng, { absenceSeconds: chosen.absenceSeconds });
}

/**
 * Al volver a una mesa: toma lo que hay ahora como punto de partida, sin decir nada por lo que
 * pasó mientras no se miraba (su ayudante siguió jugando). Lo pendiente se descarta.
 */
export function rebaseWatch(watch: DialogueWatch, snap: WatchSnapshot): void {
  watch.prev = { ...snap };
  if (PHASE_ORDER.indexOf(snap.phase) > PHASE_ORDER.indexOf(watch.maxPhase)) watch.maxPhase = snap.phase;
  watch.pending = [];
}
