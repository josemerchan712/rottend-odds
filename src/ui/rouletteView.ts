import type { SpinResult } from '../game/state';
import { ready } from './sprites';
import { POCKET_ANGLE, POCKETS, planSpin, pocketColor, spinPose, type SpinPlan, type SpinPose } from './wheelMath';

/** Tamaño del sprite de la rueda y radios del anillo de casillas (medidos sobre el arte a 150 px). */
export const WHEEL_SIZE = 150;
const RING_INNER = 31;
const POCKET_INNER = 37;
const RING_OUTER = 55;
const BALL_TRACK = 58;
const BALL_REST = 46;

const PLAYER_SPIN_SECONDS = 1.1;
const HELPER_SPIN_SECONDS = 0.55;
const FLASH_SECONDS = 0.7;

const POCKET_COLORS = {
  verde: '#3f7a2e',
  dorado: '#d4ad48',
  negro: '#141110',
  blanco: '#cfc5a6',
};

export interface Landed {
  spin: SpinResult;
  /** Número de apuesta (stats.bets cuando se hizo). */
  number: number;
  bigLoss: boolean;
}

interface Running {
  plan: SpinPlan;
  elapsed: number;
  landed: Landed;
}

/**
 * La ruleta de la escena. La rueda del arte lleva la bola y el marcador pintados: se tapan con un
 * anillo de casillas propio (verde, dorado, negro y blanco), que además garantiza que el color de la
 * casilla donde cae la bola es el del resultado. La bola y el indicador se dibujan aparte.
 */
export class RouletteView {
  private wheelAngle = 0;
  private ballAngle = Math.PI * 0.75;
  private running: Running | null = null;
  private flash = 0;
  private composed = new Map<string, HTMLCanvasElement>();

  /** Empieza a girar hacia el resultado; si había otra tirada en marcha, esa se da por terminada. */
  start(landed: Landed): Landed | null {
    const interrupted = this.running ? this.running.landed : null;
    const duration = landed.spin.bettor === 'jugador' ? PLAYER_SPIN_SECONDS : HELPER_SPIN_SECONDS;
    this.running = { plan: planSpin(landed.spin.slot, this.wheelAngle, this.ballAngle, duration), elapsed: 0, landed };
    return interrupted;
  }

  get spinning(): boolean {
    return this.running !== null;
  }

  /** Avanza la animación; devuelve la tirada si la bola acaba de caer. */
  update(dt: number): Landed | null {
    this.flash = Math.max(0, this.flash - dt);
    if (!this.running) return null;
    const run = this.running;
    run.elapsed += dt;
    const pose = spinPose(run.plan, run.elapsed);
    this.wheelAngle = pose.wheel;
    this.ballAngle = pose.ball;
    if (run.elapsed < run.plan.duration) return null;
    this.running = null;
    if (run.landed.spin.outcome === 'jackpot') this.flash = FLASH_SECONDS;
    return run.landed;
  }

  private pose(): SpinPose {
    return this.running ? spinPose(this.running.plan, this.running.elapsed) : { wheel: this.wheelAngle, ball: this.ballAngle, drop: 1 };
  }

  draw(ctx: CanvasRenderingContext2D, wheelImg: HTMLImageElement | undefined, version: string, cx: number, cy: number): void {
    const sprite = this.compose(wheelImg, version);
    if (!sprite) return;
    const pose = this.pose();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(pose.wheel);
    ctx.drawImage(sprite, -WHEEL_SIZE / 2, -WHEEL_SIZE / 2);
    ctx.restore();

    if (this.flash > 0) {
      ctx.save();
      ctx.globalAlpha = (this.flash / FLASH_SECONDS) * 0.5;
      ctx.fillStyle = POCKET_COLORS.dorado;
      ctx.beginPath();
      ctx.arc(cx, cy, RING_OUTER, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Indicador fijo arriba (el marcador del arte queda tapado por el anillo y giraría con la rueda).
    ctx.fillStyle = '#0d0b09';
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy - RING_OUTER - 9);
    ctx.lineTo(cx + 5, cy - RING_OUTER - 9);
    ctx.lineTo(cx, cy - RING_OUTER + 1);
    ctx.fill();
    ctx.fillStyle = '#cfc5a6';
    ctx.beginPath();
    ctx.moveTo(cx - 3, cy - RING_OUTER - 8);
    ctx.lineTo(cx + 3, cy - RING_OUTER - 8);
    ctx.lineTo(cx, cy - RING_OUTER - 1);
    ctx.fill();

    // La bola: rueda por el borde y cae a la casilla al final.
    const r = BALL_TRACK + (BALL_REST - BALL_TRACK) * pose.drop;
    const bx = Math.round(cx + Math.sin(pose.ball) * r);
    const by = Math.round(cy - Math.cos(pose.ball) * r);
    // Contorno oscuro: si no, sobre una casilla blanca la bola no se vería.
    ctx.fillStyle = '#0b0908';
    ctx.fillRect(bx - 3, by - 3, 6, 6);
    ctx.fillStyle = '#ece6d4';
    ctx.fillRect(bx - 2, by - 2, 4, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx - 1, by - 2, 1, 1);
  }

  /** Rueda del arte con el anillo de casillas encima, en un lienzo propio (se calcula una vez). */
  private compose(img: HTMLImageElement | undefined, version: string): HTMLCanvasElement | null {
    const cached = this.composed.get(version);
    if (cached) return cached;
    if (!ready(img)) return null;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = WHEEL_SIZE;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, WHEEL_SIZE, WHEEL_SIZE);
    const c = WHEEL_SIZE / 2;

    ctx.fillStyle = '#0f0c09';
    ctx.beginPath();
    ctx.arc(c, c, RING_OUTER, 0, Math.PI * 2);
    ctx.arc(c, c, RING_INNER, 0, Math.PI * 2, true);
    ctx.fill();

    POCKETS.forEach((slot, i) => {
      const mid = i * POCKET_ANGLE - Math.PI / 2;
      ctx.fillStyle = POCKET_COLORS[pocketColor(slot)];
      ctx.beginPath();
      ctx.arc(c, c, RING_OUTER - 1, mid - POCKET_ANGLE / 2, mid + POCKET_ANGLE / 2);
      ctx.arc(c, c, POCKET_INNER, mid + POCKET_ANGLE / 2, mid - POCKET_ANGLE / 2, true);
      ctx.fill();
    });

    // Separadores dorados y bordes del anillo.
    ctx.strokeStyle = '#6b5428';
    ctx.lineWidth = 1;
    POCKETS.forEach((_, i) => {
      const a = (i + 0.5) * POCKET_ANGLE - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * POCKET_INNER, c + Math.sin(a) * POCKET_INNER);
      ctx.lineTo(c + Math.cos(a) * (RING_OUTER - 1), c + Math.sin(a) * (RING_OUTER - 1));
      ctx.stroke();
    });
    ctx.strokeStyle = '#8a6a2a';
    for (const radius of [RING_OUTER - 0.5, POCKET_INNER - 0.5, RING_INNER + 0.5]) {
      ctx.beginPath();
      ctx.arc(c, c, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.composed.set(version, canvas);
    return canvas;
  }
}
