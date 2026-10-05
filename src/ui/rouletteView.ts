import geometry from '../../assets/sprites/roulette/geometry.json';
import type { SpinResult } from '../game/state';
import { drawText, type TextStyleName } from './sceneText';
import { ready } from './sprites';
import { POCKET_ANGLE, POCKETS, planSpin, pocketColor, spinPose, type SpinPlan, type SpinPose } from './wheelMath';

/**
 * Radios de la rueda en la escena (unidades), medidos por el pipeline sobre la imagen
 * (assets/sprites/roulette/geometry.json): del arte solo se usan el aro de madera (de WOOD_INNER a
 * WHEEL_RADIUS) y el cono con su pomo (hasta CONE_RADIUS). El anillo de casillas se dibuja en código.
 */
export const WHEEL_RADIUS = geometry.healthy.outer;
export const WHEEL_SIZE = geometry.size;
const WOOD_INNER = Math.floor(Math.min(geometry.healthy.woodInner, geometry.broken.woodInner));
const CONE_RADIUS = Math.max(geometry.healthy.cone, geometry.broken.cone);
/** Anillo de casillas: color de RING_INNER a POCKET_OUTER; números en la banda exterior. */
export const POCKET_OUTER = WOOD_INNER;
export const RING_INNER = Math.ceil(CONE_RADIUS) + 5;
/** Borde interior de la banda de los números (por dentro, el fondo de la casilla donde cae la bola). */
export const NUMBER_INNER = POCKET_OUTER - 15;
export const NUMBER_RADIUS = (NUMBER_INNER + POCKET_OUTER) / 2;
/** La bola rueda sobre el filo del aro y cae al fondo de la casilla. */
export const BALL_TRACK = POCKET_OUTER + 3;
export const BALL_REST = (RING_INNER + NUMBER_INNER) / 2;

const PLAYER_SPIN_SECONDS = 1.1;
const HELPER_SPIN_SECONDS = 0.55;
const FLASH_SECONDS = 0.7;

/** Colores del tapete (tapeteView): negro, blanco hueso y el cero verde. */
const POCKET_COLORS = { verde: '#2f5f24', dorado: '#d4ad48', negro: '#141110', blanco: '#cfc5a6' } as const;
const NUMBER_STYLE: Record<'verde' | 'negro' | 'blanco', TextStyleName> = { verde: 'wheelOnGreen', negro: 'wheelOnDark', blanco: 'wheelOnBone' };

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

/** Generador determinista para el desgaste de la rueda rota (el mismo en cada carga). */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * La ruleta de la escena (sesión 8). Del arte: el aro de madera y el cono (sana o rota). En código: el
 * anillo de 37 casillas en orden europeo, negras y blanco hueso alternadas y un cero verde, con sus
 * números en la capa de texto. Aro, anillo y cono giran como una sola pieza; la bola y el marcador son
 * sprites aparte que no giran (el marcador, fijo arriba).
 */
export class RouletteView {
  private wheelAngle = 0;
  private ballAngle = Math.PI * 0.75;
  private running: Running | null = null;
  private flash = 0;
  private rings = new Map<string, HTMLCanvasElement>();

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

  draw(ctx: CanvasRenderingContext2D, sprites: Map<string, HTMLImageElement>, version: 'healthy' | 'broken', cx: number, cy: number): void {
    const pose = this.pose();
    const half = WHEEL_SIZE / 2;
    const wood = sprites.get(`${version}-wood`);
    const cone = sprites.get(`${version}-cone`);

    // La rueda entera (anillo, aro, números y cono) gira junta.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(pose.wheel);
    ctx.drawImage(this.ring(version), -half, -half);
    if (this.flash > 0) {
      ctx.globalAlpha = (this.flash / FLASH_SECONDS) * 0.55;
      ctx.fillStyle = POCKET_COLORS.dorado;
      ctx.beginPath();
      ctx.arc(0, 0, POCKET_OUTER, 0, Math.PI * 2);
      ctx.arc(0, 0, RING_INNER, 0, Math.PI * 2, true);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (ready(wood)) ctx.drawImage(wood, -half, -half, WHEEL_SIZE, WHEEL_SIZE);
    if (ready(cone)) ctx.drawImage(cone, -half, -half, WHEEL_SIZE, WHEEL_SIZE);
    // Números en la capa de texto, a lo largo del radio (leídos desde el centro hacia fuera).
    POCKETS.forEach((slot, i) => {
      ctx.save();
      ctx.rotate(i * POCKET_ANGLE - Math.PI / 2);
      const color = pocketColor(slot);
      drawText(ctx, NUMBER_STYLE[color === 'dorado' ? 'verde' : color], String(slot), NUMBER_RADIUS, 0.5);
      ctx.restore();
    });
    ctx.restore();

    // Marcador fijo arriba: la punta toca el borde exterior del anillo.
    const marker = sprites.get('marker');
    if (ready(marker)) ctx.drawImage(marker, Math.round(cx - marker.width / 2), Math.round(cy - POCKET_OUTER - marker.height + 3));

    // La bola: rueda por el filo del aro y cae al fondo de la casilla al final.
    const r = BALL_TRACK + (BALL_REST - BALL_TRACK) * pose.drop;
    const bx = cx + Math.sin(pose.ball) * r;
    const by = cy - Math.cos(pose.ball) * r;
    const ball = sprites.get('ball');
    if (ready(ball)) ctx.drawImage(ball, Math.round(bx - ball.width / 2), Math.round(by - ball.height / 2));
    else {
      ctx.fillStyle = '#ece6d4';
      ctx.fillRect(Math.round(bx) - 3, Math.round(by) - 3, 6, 6);
    }
  }

  /** El anillo de casillas (sin números), dibujado una vez por versión en un lienzo propio. */
  private ring(version: 'healthy' | 'broken'): HTMLCanvasElement {
    const cached = this.rings.get(version);
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = WHEEL_SIZE;
    const ctx = canvas.getContext('2d')!;
    const c = WHEEL_SIZE / 2;
    // Fondo oscuro del anillo y del hueco entre el cono y las casillas.
    ctx.fillStyle = '#0f0c09';
    ctx.beginPath();
    ctx.arc(c, c, POCKET_OUTER + 1, 0, Math.PI * 2);
    ctx.fill();
    const sector = (from: number, to: number, start: number, end: number) => {
      ctx.beginPath();
      ctx.arc(c, c, to, start, end);
      ctx.arc(c, c, from, end, start, true);
      ctx.fill();
    };
    POCKETS.forEach((slot, i) => {
      const mid = i * POCKET_ANGLE - Math.PI / 2;
      const a0 = mid - POCKET_ANGLE / 2;
      const a1 = mid + POCKET_ANGLE / 2;
      const color = POCKET_COLORS[pocketColor(slot)];
      ctx.fillStyle = color;
      sector(RING_INNER, POCKET_OUTER, a0, a1);
      // El fondo de la casilla (donde cae la bola), algo más oscuro: da profundidad.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
      sector(RING_INNER, NUMBER_INNER, a0, a1);
    });
    // Separadores y filos dorados.
    ctx.strokeStyle = '#6b5428';
    ctx.lineWidth = 1;
    POCKETS.forEach((_, i) => {
      const a = (i + 0.5) * POCKET_ANGLE - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * RING_INNER, c + Math.sin(a) * RING_INNER);
      ctx.lineTo(c + Math.cos(a) * POCKET_OUTER, c + Math.sin(a) * POCKET_OUTER);
      ctx.stroke();
    });
    ctx.strokeStyle = '#8a6a2a';
    for (const radius of [NUMBER_INNER, RING_INNER]) {
      ctx.beginPath();
      ctx.arc(c, c, radius - 0.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (version === 'broken') this.wear(ctx, c);
    this.rings.set(version, canvas);
    return canvas;
  }

  /** Desgaste de la rueda rota, en código: casillas sucias, desconchones, arañazos y verdín. */
  private wear(ctx: CanvasRenderingContext2D, c: number): void {
    const rng = seeded(1337);
    const at = (r: number, a: number) => [c + Math.cos(a) * r, c + Math.sin(a) * r] as const;
    POCKETS.forEach((_, i) => {
      const mid = i * POCKET_ANGLE - Math.PI / 2;
      // Mugre irregular: cada casilla más o menos apagada.
      ctx.fillStyle = `rgba(40, 28, 16, ${(0.12 + rng() * 0.3).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(c, c, POCKET_OUTER, mid - POCKET_ANGLE / 2, mid + POCKET_ANGLE / 2);
      ctx.arc(c, c, RING_INNER, mid + POCKET_ANGLE / 2, mid - POCKET_ANGLE / 2, true);
      ctx.fill();
      // Desconchones en los extremos de la casilla (no tapan el número).
      if (rng() < 0.45) {
        const [x, y] = at(rng() < 0.5 ? POCKET_OUTER - 1.5 : RING_INNER + 2, mid + (rng() - 0.5) * POCKET_ANGLE * 0.7);
        ctx.fillStyle = rng() < 0.5 ? '#5a4630' : '#2a2018';
        ctx.fillRect(Math.round(x - 1), Math.round(y - 1), 2, 2);
      }
    });
    // Arañazos que cruzan varias casillas.
    ctx.strokeStyle = 'rgba(20, 14, 10, 0.7)';
    for (let k = 0; k < 7; k++) {
      const a = rng() * Math.PI * 2;
      const [x0, y0] = at(RING_INNER + rng() * 6, a);
      const [x1, y1] = at(POCKET_OUTER - rng() * 4, a + (rng() - 0.5) * 0.5);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    // Verdín en el borde exterior, junto al aro roto.
    ctx.fillStyle = '#4f6b2a';
    for (let k = 0; k < 40; k++) {
      const [x, y] = at(POCKET_OUTER - rng() * 3, rng() * Math.PI * 2);
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }
}
