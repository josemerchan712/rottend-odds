import { GAME_TAGLINE, GAME_TITLE } from '../game/config';
import { drawText } from './sceneText';
import { ready, type Sprites } from './sprites';
import { prepareCanvas } from './stage';

/** Dónde cuelga la lámpara verde del pasillo en la imagen de la portada (unidades de 640x360). */
const LAMP = { x: 232, y: 152 };
/** Centro del subtítulo: justo bajo el título dibujado en la imagen. */
const TAGLINE = { x: 320, y: 139 };
const DUST_COUNT = 40;

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  phase: number;
}

/** Generador pequeño y determinista para el polvo (la misma nube en cada carga). */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export interface TitleFrame {
  /** Antes de entrar: negro con "Pulsa para entrar". */
  press: boolean;
  /** Negro por encima de todo (0-1) para los fundidos. */
  fade: number;
}

/**
 * La portada, dibujada en el canvas de la escena: la imagen tal cual (ya trae el título), la luz de
 * la lámpara verde que respira muy despacio, polvo lento en el aire y una oscilación de 1 px; el
 * subtítulo va en la capa de texto. Con el filtro CRT apagado no oscila (como el temblor de las mesas).
 */
export class TitleScene {
  private readonly ctx: CanvasRenderingContext2D;
  private t = 0;
  private effects = true;
  private readonly dust: Mote[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly sprites: Sprites,
  ) {
    this.ctx = canvas.getContext('2d')!;
    const rng = seeded(7);
    for (let i = 0; i < DUST_COUNT; i++) {
      this.dust.push({
        x: 120 + rng() * 330,
        y: 130 + rng() * 220,
        vx: (rng() - 0.5) * 3,
        vy: -1 - rng() * 2.5,
        alpha: 0.12 + rng() * 0.3,
        phase: rng() * Math.PI * 2,
      });
    }
  }

  setEffectsEnabled(on: boolean): void {
    this.effects = on;
  }

  render(dt: number, frame: TitleFrame): void {
    const ctx = this.ctx;
    prepareCanvas(this.canvas, ctx);
    this.t += dt;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 640, 360);
    if (frame.press) {
      // Parpadeo suave: el texto respira entre medio y lleno, nunca desaparece del todo.
      ctx.globalAlpha = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this.t * 2.4));
      drawText(ctx, 'prompt', 'Pulsa para entrar', 320, 184);
      ctx.globalAlpha = 1;
      return;
    }
    this.drawArt();
    this.drawLamp();
    this.drawDust(dt);
    drawText(ctx, 'tagline', GAME_TAGLINE, TAGLINE.x, TAGLINE.y);
    if (frame.fade > 0) {
      ctx.globalAlpha = Math.min(frame.fade, 1);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 640, 360);
      ctx.globalAlpha = 1;
    }
  }

  /** La imagen, con una oscilación lenta de 1 px (arriba, abajo). Sin imagen: provisional en código. */
  private drawArt(): void {
    const ctx = this.ctx;
    const img = this.sprites.screens.get('titulo');
    const bob = this.effects ? Math.round(0.5 + 0.5 * Math.sin((this.t * Math.PI * 2) / 7)) : 0;
    if (ready(img)) {
      ctx.drawImage(img, 0, bob, 640, 360);
      return;
    }
    const g = ctx.createLinearGradient(0, 0, 0, 360);
    g.addColorStop(0, '#0d0b08');
    g.addColorStop(1, '#1d1a12');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 640, 360);
    drawText(ctx, 'provisionalTitle', GAME_TITLE, 320, 80 + bob);
  }

  /** La luz verde de la lámpara: un halo que respira (periodo de ~6 s) con un temblor mínimo. */
  private drawLamp(): void {
    const ctx = this.ctx;
    const breath = 0.5 + 0.5 * Math.sin((this.t * Math.PI * 2) / 6);
    const flicker = this.effects ? 0.012 * Math.sin(this.t * 23) * Math.sin(this.t * 7.1) : 0;
    const alpha = 0.07 + 0.05 * breath + flicker;
    const glow = ctx.createRadialGradient(LAMP.x, LAMP.y, 2, LAMP.x, LAMP.y + 30, 96);
    glow.addColorStop(0, `rgba(170, 220, 130, ${alpha.toFixed(3)})`);
    glow.addColorStop(1, 'rgba(170, 220, 130, 0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = glow;
    ctx.fillRect(LAMP.x - 110, LAMP.y - 60, 220, 220);
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Motas de polvo: 1 px, suben y derivan muy despacio; más visibles cerca de la luz. */
  private drawDust(dt: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#e4dcb8';
    for (const m of this.dust) {
      m.x += (m.vx + Math.sin(this.t * 0.5 + m.phase) * 1.5) * dt;
      m.y += m.vy * dt;
      if (m.y < 120) m.y = 350;
      if (m.x < 110) m.x = 460;
      if (m.x > 460) m.x = 110;
      const near = Math.max(0, 1 - Math.hypot(m.x - LAMP.x, m.y - (LAMP.y + 40)) / 150);
      ctx.globalAlpha = Math.min(0.75, m.alpha * (0.5 + near * 1.6) * (0.7 + 0.3 * Math.sin(this.t * 1.3 + m.phase)));
      ctx.fillRect(Math.round(m.x), Math.round(m.y), 1, 1);
    }
    ctx.globalAlpha = 1;
  }
}
