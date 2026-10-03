import { CONFIG } from '../game/config';
import type { GameState } from '../game/state';
import { itemAt, type Collected } from '../game/work';
import { formatNumber } from '../util/format';
import { ready, type PlayerFrame, type Sprites } from './sprites';

/** Resolución interna de la escena (sección 8 del diseño). */
export const SCENE_WIDTH = 640;
export const SCENE_HEIGHT = 360;

const TRASH_SIZE = 32;
const PLAYER_SIZE = 64;
const CROUCH_SECONDS = 0.14;
const LIFT_SECONDS = 0.3;
const FLOAT_SECONDS = 1.1;
const CLEANER_SPEED = 220; // px/s en la escena

const COLORS = {
  wall: '#100e0b',
  wallStripe: '#16130f',
  floor: '#221d16',
  floorEdge: '#2e271e',
  floorLine: '#1a1611',
  hover: 'rgba(201, 164, 67, 0.35)',
  text: '#c9a443',
  shadow: 'rgba(0, 0, 0, 0.45)',
};

interface FloatingText {
  text: string;
  x: number;
  y: number;
  age: number;
}

/**
 * La escena del suelo del casino en un canvas de 640x360, escalado a un múltiplo entero y sin
 * suavizado. Solo lee el estado del juego; las animaciones (jugador, ayudante de limpieza,
 * textos flotantes) son puramente visuales.
 */
export class Scene {
  private readonly ctx: CanvasRenderingContext2D;
  private hover: { x: number; y: number } | null = null;
  private playerAnim: { phase: 'idle' | 'crouch' | 'lift'; time: number } = { phase: 'idle', time: 0 };
  private floats: FloatingText[] = [];
  private cleanerShown: { x: number; y: number; facing: 1 | -1; walk: number } | null = null;
  private scale = 1;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly sprites: Sprites,
  ) {
    canvas.width = SCENE_WIDTH;
    canvas.height = SCENE_HEIGHT;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
  }

  /**
   * Escalado entero en píxeles físicos (con devicePixelRatio 1,5, un x1 en CSS serían 1,5 píxeles
   * físicos por píxel y el pixel art se deformaría). Elige el mayor entero que cabe, mínimo 1.
   */
  fit(availableWidth: number, availableHeight: number, dpr = window.devicePixelRatio || 1): void {
    const k = Math.max(1, Math.floor(Math.min((availableWidth * dpr) / SCENE_WIDTH, (availableHeight * dpr) / SCENE_HEIGHT)));
    const key = k / dpr;
    if (key === this.scale && this.canvas.style.width) return;
    this.scale = key;
    this.canvas.style.width = `${(SCENE_WIDTH * k) / dpr}px`;
    this.canvas.style.height = `${(SCENE_HEIGHT * k) / dpr}px`;
  }

  /** Coordenadas de la escena para un punto de la pantalla. */
  toScene(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) * SCENE_WIDTH) / rect.width,
      y: ((clientY - rect.top) * SCENE_HEIGHT) / rect.height,
    };
  }

  setHover(point: { x: number; y: number } | null): void {
    this.hover = point;
  }

  /** El jugador ha recogido algo: se agacha, levanta el objeto y salen los "+N". */
  playerCollected(items: Collected[]): void {
    if (!items.length) return;
    this.playerAnim = { phase: 'crouch', time: 0 };
    items.forEach((item, i) => this.floats.push({ text: `+${formatNumber(item.value)}`, x: item.x, y: item.y - 24 - i * 10, age: 0 }));
  }

  /** El ayudante de limpieza ha recogido algo. */
  cleanerCollected(items: Collected[]): void {
    for (const item of items) this.floats.push({ text: `+${formatNumber(item.value)}`, x: item.x, y: item.y - 24, age: 0 });
  }

  render(state: GameState, dt: number): void {
    this.advance(state, dt);
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    this.drawRoom();

    const hovered = this.hover ? itemAt(state.work.items, this.hover.x, this.hover.y) : null;
    this.canvas.style.cursor = hovered ? 'pointer' : 'default';

    // De arriba abajo, para que lo que está más cerca tape a lo de detrás.
    const drawables: { y: number; draw: () => void }[] = state.work.items.map((item) => ({
      y: item.y,
      draw: () => {
        if (item.id === hovered?.id) {
          ctx.fillStyle = COLORS.hover;
          ctx.beginPath();
          ctx.ellipse(item.x, item.y - 2, 18, 7, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        this.drawSprite(this.sprites.trash.get(item.kind), item.x, item.y, TRASH_SIZE, 1);
      },
    }));
    const { player } = CONFIG.work;
    drawables.push({ y: player.y, draw: () => this.drawPlayer() });
    if (this.cleanerShown) {
      const c = this.cleanerShown;
      drawables.push({ y: c.y, draw: () => this.drawCleaner(c) });
    }
    drawables.sort((a, b) => a.y - b.y).forEach((d) => d.draw());

    ctx.font = '10px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    for (const f of this.floats) {
      ctx.globalAlpha = Math.max(0, 1 - f.age / FLOAT_SECONDS);
      ctx.fillStyle = COLORS.shadow;
      ctx.fillText(f.text, Math.round(f.x) + 1, Math.round(f.y - f.age * 18) + 1);
      ctx.fillStyle = COLORS.text;
      ctx.fillText(f.text, Math.round(f.x), Math.round(f.y - f.age * 18));
    }
    ctx.globalAlpha = 1;
  }

  private advance(state: GameState, dt: number): void {
    const anim = this.playerAnim;
    anim.time += dt;
    if (anim.phase === 'crouch' && anim.time >= CROUCH_SECONDS) this.playerAnim = { phase: 'lift', time: 0 };
    else if (anim.phase === 'lift' && anim.time >= LIFT_SECONDS) this.playerAnim = { phase: 'idle', time: 0 };

    for (const f of this.floats) f.age += dt;
    this.floats = this.floats.filter((f) => f.age < FLOAT_SECONDS);

    // El ayudante de limpieza camina hacia donde recogió lo último.
    if (state.upgrades.cleaner > 0) {
      const target = state.work.cleaner;
      this.cleanerShown ??= { x: target.x, y: target.y, facing: -1, walk: 0 };
      const c = this.cleanerShown;
      const dx = target.x - c.x;
      const dy = target.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d > 1) {
        const step = Math.min(d, CLEANER_SPEED * dt);
        c.x += (dx / d) * step;
        c.y += (dy / d) * step;
        c.facing = dx >= 0 ? 1 : -1;
        c.walk += dt;
      } else {
        c.walk = 0;
      }
    } else {
      this.cleanerShown = null;
    }
  }

  private drawRoom(): void {
    const ctx = this.ctx;
    const floorTop = CONFIG.work.floor.y - 30;
    ctx.fillStyle = COLORS.wall;
    ctx.fillRect(0, 0, SCENE_WIDTH, floorTop);
    ctx.fillStyle = COLORS.wallStripe;
    for (let x = 0; x < SCENE_WIDTH; x += 48) ctx.fillRect(x, 0, 2, floorTop);
    ctx.fillStyle = COLORS.floor;
    ctx.fillRect(0, floorTop, SCENE_WIDTH, SCENE_HEIGHT - floorTop);
    ctx.fillStyle = COLORS.floorEdge;
    ctx.fillRect(0, floorTop, SCENE_WIDTH, 2);
    ctx.fillStyle = COLORS.floorLine;
    for (let y = floorTop + 16; y < SCENE_HEIGHT; y += 18) ctx.fillRect(0, y, SCENE_WIDTH, 1);
  }

  /** Dibuja un sprite con la base en (x, y). Si aún no ha cargado, un marcador. */
  private drawSprite(img: HTMLImageElement | undefined, x: number, y: number, size: number, facing: 1 | -1, offsetY = 0): void {
    const ctx = this.ctx;
    const left = Math.round(x - size / 2);
    const top = Math.round(y - size + offsetY);
    if (!ready(img)) {
      ctx.fillStyle = COLORS.floorEdge;
      ctx.fillRect(left + size / 4, top + size / 2, size / 2, size / 2);
      return;
    }
    if (facing === 1) {
      ctx.drawImage(img, left, top, size, size);
    } else {
      ctx.save();
      ctx.translate(left + size, top);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, size, size);
      ctx.restore();
    }
  }

  private drawPlayer(): void {
    // Idle pendiente de arte: mientras tanto, el frame 3 (agachado). Al agacharse baja 2 px.
    const { phase } = this.playerAnim;
    const frame: PlayerFrame = phase === 'lift' ? 'lift' : 'crouch';
    const { player } = CONFIG.work;
    this.drawSprite(this.sprites.player.get(frame), player.x, player.y, PLAYER_SIZE, 1, phase === 'crouch' ? 2 : 0);
  }

  private drawCleaner(c: { x: number; y: number; facing: 1 | -1; walk: number }): void {
    const frame: PlayerFrame = c.walk > 0 && Math.floor(c.walk * 6) % 2 === 1 ? 'walk-2' : 'walk-1';
    this.drawSprite(this.sprites.player.get(frame), c.x, c.y, PLAYER_SIZE, c.facing);
  }
}
