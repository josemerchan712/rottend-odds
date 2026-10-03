/**
 * Efectos de pantalla de la escena (sección 8): scanlines, viñeta, grano, parpadeo de las lámparas
 * del fondo y temblor. Solo se dibujan con el filtro CRT activado en Ajustes.
 */

/** Lámparas del fondo de la mesa 1, en coordenadas de la escena 640x360. */
const LAMPS = [184, 251, 319, 387, 455].map((x) => ({ x, y: 71 }));

const SHAKE_SECONDS = 0.35;
const SHAKE_PIXELS = 3;

interface Lamp {
  x: number;
  y: number;
  /** Segundos que le quedan apagada (parpadeo). */
  dip: number;
  phase: number;
}

export class Effects {
  enabled = true;
  private readonly scanlines: HTMLCanvasElement;
  private readonly vignette: HTMLCanvasElement;
  private readonly grain: HTMLCanvasElement[];
  private readonly lamps: Lamp[] = LAMPS.map((l, i) => ({ ...l, dip: 0, phase: i * 1.7 }));
  private time = 0;
  private shakeLeft = 0;

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly random: () => number = Math.random,
  ) {
    this.scanlines = this.layer((ctx) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      for (let y = 1; y < height; y += 2) ctx.fillRect(0, y, width, 1);
    });
    this.vignette = this.layer((ctx) => {
      const g = ctx.createRadialGradient(width / 2, height / 2, height * 0.35, width / 2, height / 2, width * 0.62);
      g.addColorStop(0, 'rgba(0, 0, 0, 0)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
    });
    this.grain = Array.from({ length: 4 }, () =>
      this.layer((ctx) => {
        const img = ctx.createImageData(width, height);
        for (let i = 0; i < width * height; i++) {
          const v = this.random() * 255;
          img.data.set([v, v, v, this.random() < 0.5 ? 18 : 0], i * 4);
        }
        ctx.putImageData(img, 0, 0);
      }),
    );
  }

  private layer(draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;
    draw(canvas.getContext('2d')!);
    return canvas;
  }

  /** Temblor de pantalla (al perder una apuesta grande). */
  shake(): void {
    if (this.enabled) this.shakeLeft = SHAKE_SECONDS;
  }

  update(dt: number): void {
    this.time += dt;
    this.shakeLeft = Math.max(0, this.shakeLeft - dt);
    for (const lamp of this.lamps) {
      lamp.dip = Math.max(0, lamp.dip - dt);
      // De vez en cuando, una lámpara se apaga un instante.
      if (lamp.dip === 0 && this.random() < dt * 0.12) lamp.dip = 0.05 + this.random() * 0.2;
    }
  }

  /** Desplazamiento entero de la escena por el temblor. */
  shakeOffset(): { x: number; y: number } {
    if (!this.enabled || this.shakeLeft <= 0) return { x: 0, y: 0 };
    const strength = (this.shakeLeft / SHAKE_SECONDS) * SHAKE_PIXELS;
    return { x: Math.round((this.random() * 2 - 1) * strength), y: Math.round((this.random() * 2 - 1) * strength) };
  }

  /** Brillo y apagones de las lámparas, encima del fondo. */
  drawLamps(ctx: CanvasRenderingContext2D): void {
    if (!this.enabled) return;
    for (const lamp of this.lamps) {
      if (lamp.dip > 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.beginPath();
        ctx.ellipse(lamp.x, lamp.y, 22, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const flicker = 0.6 + 0.25 * Math.sin(this.time * 9 + lamp.phase) * Math.sin(this.time * 2.3 + lamp.phase * 2);
      const glow = ctx.createRadialGradient(lamp.x, lamp.y, 2, lamp.x, lamp.y, 26);
      glow.addColorStop(0, `rgba(150, 230, 130, ${0.28 * flicker})`);
      glow.addColorStop(1, 'rgba(150, 230, 130, 0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = glow;
      ctx.fillRect(lamp.x - 26, lamp.y - 26, 52, 52);
      ctx.restore();
    }
  }

  /** Capa CRT final: grano, scanlines y viñeta. */
  drawOverlay(ctx: CanvasRenderingContext2D): void {
    if (!this.enabled) return;
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.drawImage(this.grain[Math.floor(this.random() * this.grain.length)], 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.scanlines, 0, 0);
    ctx.drawImage(this.vignette, 0, 0);
    ctx.restore();
  }
}
