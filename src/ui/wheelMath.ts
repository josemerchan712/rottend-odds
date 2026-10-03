import { slotColor } from '../game/roulette';

/**
 * Geometría de la ruleta dibujada (sin DOM, con tests). El anillo de casillas se dibuja encima de la
 * rueda del arte: así el color de la casilla en la que cae la bola es siempre el del resultado lógico.
 *
 * Orden de las casillas en el anillo, en el sentido de las agujas del reloj desde arriba:
 * el 0 verde, el Cero Dorado (casilla -1) y del 1 al 36 (impares negras, pares blancas).
 */
export const POCKETS: readonly number[] = [0, -1, ...Array.from({ length: 36 }, (_, i) => i + 1)];
export const POCKET_ANGLE = (Math.PI * 2) / POCKETS.length;

export type PocketColor = 'verde' | 'dorado' | 'negro' | 'blanco';

const TAU = Math.PI * 2;

export function pocketIndex(slot: number): number {
  const index = POCKETS.indexOf(slot);
  if (index < 0) throw new Error(`casilla desconocida: ${slot}`);
  return index;
}

/** Ángulo del centro de la casilla en el marco de la rueda (0 = arriba, sentido horario). */
export function pocketAngle(slot: number): number {
  return pocketIndex(slot) * POCKET_ANGLE;
}

export function pocketColor(slot: number): PocketColor {
  return slotColor(slot);
}

/** La casilla que hay en un ángulo del marco de la rueda (la inversa de pocketAngle). */
export function slotAt(angleInWheel: number): number {
  const a = ((angleInWheel % TAU) + TAU) % TAU;
  return POCKETS[Math.round(a / POCKET_ANGLE) % POCKETS.length];
}

export interface SpinPlan {
  slot: number;
  duration: number;
  wheelFrom: number;
  wheelTo: number;
  ballFrom: number;
  ballTo: number;
}

/**
 * Planifica una tirada desde la posición actual. La rueda gira en sentido horario y se para recta
 * (ángulo múltiplo de 2π, para que el pixel art quede sin rotar en reposo); la bola gira al revés
 * y se para en el centro de la casilla del resultado.
 */
export function planSpin(slot: number, wheelNow: number, ballNow: number, duration: number, turns = 2): SpinPlan {
  const wheelTo = Math.ceil(wheelNow / TAU + turns) * TAU;
  const target = wheelTo + pocketAngle(slot); // ángulo absoluto final de la bola
  // La bola da al menos `turns + 1` vueltas en sentido antihorario y acaba en `target` (mod 2π).
  const ballTo = target - Math.ceil((target - ballNow) / TAU + turns + 1) * TAU;
  return { slot, duration, wheelFrom: wheelNow, wheelTo, ballFrom: ballNow, ballTo };
}

/** Frenada suave: rápido al principio, despacio al final. */
export function easeOutCubic(t: number): number {
  const u = 1 - Math.min(Math.max(t, 0), 1);
  return 1 - u * u * u;
}

export interface SpinPose {
  wheel: number;
  ball: number;
  /** 0 = la bola rueda por el borde exterior; 1 = ha caído en la casilla. */
  drop: number;
}

/** Posición de la rueda y la bola en el instante `elapsed` de la tirada. */
export function spinPose(plan: SpinPlan, elapsed: number): SpinPose {
  const t = plan.duration > 0 ? elapsed / plan.duration : 1;
  const e = easeOutCubic(t);
  return {
    wheel: plan.wheelFrom + (plan.wheelTo - plan.wheelFrom) * e,
    ball: plan.ballFrom + (plan.ballTo - plan.ballFrom) * e,
    drop: Math.min(Math.max((t - 0.65) / 0.3, 0), 1),
  };
}

/** La casilla bajo la bola en una pose (lo que ve el jugador). */
export function slotUnderBall(pose: SpinPose): number {
  return slotAt(pose.ball - pose.wheel);
}
