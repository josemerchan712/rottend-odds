import { CONFIG } from '../game/config';
import type { Reels, SlotSpin } from '../game/slots/state';
import { ready, type Sprites } from './sprites';
import { fillPixelText } from './pixelText';

/**
 * Los tres carretes de la tragaperras, que giran de verdad: cada uno es una tira de símbolos que
 * se desplaza y se para, de izquierda a derecha, en el símbolo del resultado lógico. El carrete
 * retenido no gira. Lo que se ve al pararse siempre es lo que se ha cobrado.
 */
export const REEL = { x: 254, y: 148, width: 32, gap: 2, height: 68 };
const SYMBOL = 32;
/** Segundos hasta que se para cada carrete en una tirada del jugador. */
const STOP_SECONDS = [0.7, 0.95, 1.2];
/** Símbolos por segundo a los que gira un carrete. */
const SPEED = 22;
const BOUNCE_SECONDS = 0.12;
const FLASH_SECONDS = 0.8;

export interface ReelsLanded {
  spin: SlotSpin;
}

interface Spinning {
  spin: SlotSpin;
  from: Reels;
  elapsed: number;
}

export function reelRect(i: number): { x: number; y: number; width: number; height: number } {
  return { x: REEL.x + i * (REEL.width + REEL.gap), y: REEL.y, width: REEL.width, height: REEL.height };
}

export function reelAt(x: number, y: number): number | null {
  for (let i = 0; i < 3; i++) {
    const r = reelRect(i);
    if (x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height) return i;
  }
  return null;
}

export class SlotsView {
  private spinning: Spinning | null = null;
  private shown: Reels = [0, 1, 3];
  private flash = 0;
  private flashOutcome: SlotSpin['outcome'] = 'nada';

  /** Carretes en reposo (al cargar o al volver a la mesa). */
  setReels(reels: Reels): void {
    this.spinning = null;
    this.shown = [...reels] as Reels;
  }

  get busy(): boolean {
    return this.spinning !== null;
  }

  /** Empieza a girar hacia el resultado. Si había otra tirada girando, se da por vista y la devuelve. */
  start(spin: SlotSpin, from: Reels): SlotSpin | null {
    const interrupted = this.spinning?.spin ?? null;
    if (interrupted) this.shown = interrupted.reels;
    this.spinning = { spin, from: interrupted ? interrupted.reels : from, elapsed: 0 };
    return interrupted;
  }

  /** Avanza la animación; devuelve la tirada cuando se para el último carrete. */
  update(dt: number): SlotSpin | null {
    this.flash = Math.max(0, this.flash - dt);
    const s = this.spinning;
    if (!s) return null;
    s.elapsed += dt;
    if (s.elapsed < STOP_SECONDS[2] + BOUNCE_SECONDS) return null;
    this.shown = s.spin.reels;
    this.spinning = null;
    if (s.spin.outcome !== 'nada') {
      this.flash = FLASH_SECONDS;
      this.flashOutcome = s.spin.outcome;
    }
    return s.spin;
  }

  draw(ctx: CanvasRenderingContext2D, sprites: Sprites, hold: number | null, holdable: boolean, hovered: number | null): void {
    const symbols = CONFIG.slots.symbols;
    const s = this.spinning;
    for (let i = 0; i < 3; i++) {
      const r = reelRect(i);
      // Fondo del carrete: hueso sucio con sombra arriba y abajo (cilindro).
      ctx.fillStyle = '#0c0a08';
      ctx.fillRect(r.x - 1, r.y - 1, r.width + 2, r.height + 2);
      ctx.fillStyle = '#cfc5a6';
      ctx.fillRect(r.x, r.y, r.width, r.height);

      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.width, r.height);
      ctx.clip();
      const center = r.y + r.height / 2;
      const held = s?.spin.held === i;
      const stop = STOP_SECONDS[i];
      if (s && !held && s.elapsed < stop + BOUNCE_SECONDS) {
        if (s.elapsed < stop) {
          // Girando: la tira avanza; los símbolos bajan.
          const travel = s.elapsed * SPEED;
          const base = Math.floor(travel);
          const offset = (travel - base) * SYMBOL;
          for (let k = -2; k <= 2; k++) {
            const symbol = ((s.from[i] - base - k) % symbols.length + symbols.length * 8) % symbols.length;
            this.drawSymbol(ctx, sprites, symbol, r.x, Math.round(center - SYMBOL / 2 + k * SYMBOL + offset));
          }
        } else {
          // Parado con un pequeño rebote.
          const t = (s.elapsed - stop) / BOUNCE_SECONDS;
          const bounce = Math.round(Math.sin(t * Math.PI) * 4);
          this.drawStill(ctx, sprites, s.spin.reels[i], r.x, center + bounce);
        }
      } else {
        const symbol = s ? s.spin.reels[i] : this.shown[i];
        this.drawStill(ctx, sprites, symbol, r.x, center);
      }
      // Sombras del cilindro.
      const shade = ctx.createLinearGradient(0, r.y, 0, r.y + r.height);
      shade.addColorStop(0, 'rgba(0,0,0,0.55)');
      shade.addColorStop(0.28, 'rgba(0,0,0,0)');
      shade.addColorStop(0.72, 'rgba(0,0,0,0)');
      shade.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = shade;
      ctx.fillRect(r.x, r.y, r.width, r.height);
      ctx.restore();

      // Retenido: marco dorado y cartel debajo. Al pasar el ratón (con la mejora), un aviso tenue.
      if (hold === i || held) {
        ctx.strokeStyle = '#d4ad48';
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x + 1, r.y + 1, r.width - 2, r.height - 2);
        label(ctx, 'RET', r.x + r.width / 2, r.y + r.height + 6, '#d4ad48');
      } else if (holdable && hovered === i && !s) {
        ctx.strokeStyle = 'rgba(212, 173, 72, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.width - 1, r.height - 1);
      }
    }
    // Línea de premio y destello al ganar.
    const left = REEL.x - 3;
    const right = REEL.x + 3 * REEL.width + 2 * REEL.gap + 3;
    const midY = REEL.y + REEL.height / 2;
    ctx.fillStyle = this.flash > 0 && Math.floor(this.flash * 10) % 2 === 0 ? flashColor(this.flashOutcome) : 'rgba(170, 40, 30, 0.8)';
    ctx.fillRect(left, midY, 3, 1);
    ctx.fillRect(right - 3, midY, 3, 1);
    if (this.flash > 0) {
      ctx.fillStyle = flashColor(this.flashOutcome).replace('1)', `${(this.flash / FLASH_SECONDS) * 0.25})`);
      ctx.fillRect(REEL.x, REEL.y, right - left - 6, REEL.height);
    }
  }

  private drawStill(ctx: CanvasRenderingContext2D, sprites: Sprites, symbol: number, x: number, center: number): void {
    const symbols = CONFIG.slots.symbols;
    const n = symbols.length;
    this.drawSymbol(ctx, sprites, (symbol + n - 1) % n, x, Math.round(center - SYMBOL / 2 - SYMBOL));
    this.drawSymbol(ctx, sprites, symbol, x, Math.round(center - SYMBOL / 2));
    this.drawSymbol(ctx, sprites, (symbol + 1) % n, x, Math.round(center + SYMBOL / 2));
  }

  private drawSymbol(ctx: CanvasRenderingContext2D, sprites: Sprites, symbol: number, x: number, y: number): void {
    const img = sprites.slots.get(CONFIG.slots.symbols[symbol].id);
    if (ready(img)) ctx.drawImage(img, x, y, SYMBOL, SYMBOL);
    else {
      ctx.fillStyle = '#3a2f1e';
      ctx.fillRect(x + 8, y + 8, 16, 16);
    }
  }
}

function flashColor(outcome: SlotSpin['outcome']): string {
  if (outcome === 'jackpot') return 'rgba(240, 220, 140, 1)';
  if (outcome === 'trio') return 'rgba(212, 173, 72, 1)';
  return 'rgba(200, 190, 150, 1)';
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): void {
  ctx.font = '10px VT323, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  fillPixelText(ctx, text, x + 1, y + 1);
  ctx.fillStyle = color;
  fillPixelText(ctx, text, x, y);
}
