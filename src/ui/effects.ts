/**
 * Efectos de pantalla de la escena (sección 8): parpadeo de las lámparas del fondo y temblor. Se
 * apagan con el filtro CRT en "Apagado". Las scanlines, la viñeta y el grano son la capa CRT de CSS
 * (stage.ts), aparte del contenido.
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
  private readonly lamps: Lamp[] = LAMPS.map((l, i) => ({ ...l, dip: 0, phase: i * 1.7 }));
  private time = 0;
  private shakeLeft = 0;

  constructor(private readonly random: () => number = Math.random) {}

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

}
