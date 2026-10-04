import { CONFIG } from '../game/config';
import { debtProgress } from '../game/debt';
import { lenderPhase } from '../game/lender';
import type { GameState } from '../game/state';
import { itemAt, type Collected } from '../game/work';
import { formatNumber } from '../util/format';
import { Effects } from './effects';
import { RouletteView } from './rouletteView';
import { ready, type PlayerFrame, type Sprites } from './sprites';

/** Resolución interna de la escena (sección 8 del diseño). */
export const SCENE_WIDTH = 640;
export const SCENE_HEIGHT = 360;

const TRASH_SIZE = 32;
const PLAYER_SIZE = 64;
const CHIP_SIZE = 32;
const PORTRAIT_SIZE = 128;
const CROUCH_SECONDS = 0.14;
const LIFT_SECONDS = 0.3;
const FLOAT_SECONDS = 1.1;
const CLEANER_SPEED = 220; // px/s en la escena
const ARM_REACH_SECONDS = 0.25;
/** Una apuesta perdida es "grande" (tiembla la pantalla) si se jugó al menos esta fracción del saldo. */
const BIG_LOSS_FRACTION = 0.25;

/** Posiciones en la escena de 640x360 (sección 9.2), ajustadas al fondo de la mesa 1. */
const LAYOUT = {
  wheel: { x: 320, y: 140 },
  chips: { x: 376, y: 236 },
  arm: { x: 458, y: 252 },
  portrait: { x: SCENE_WIDTH - PORTRAIT_SIZE - 6, y: 6 },
};

/** Ficha o pila sobre la mesa según el botón de apuesta elegido (1%, 10%, 50%, TODO). */
const BET_CHIPS = ['chip-1', 'chip-2', 'stack-3', 'stack-8'];

const COLORS = {
  wall: '#100e0b',
  floor: '#221d16',
  hover: 'rgba(201, 164, 67, 0.35)',
  text: '#c9a443',
  shadow: 'rgba(0, 0, 0, 0.55)',
  frame: '#0b0908',
  frameEdge: '#3a2f1e',
  debtBack: '#1a1410',
  debtFill: '#9a2a22',
  debtFill2: '#b0602a',
};

interface FloatingText {
  text: string;
  x: number;
  y: number;
  age: number;
  color: string;
}

/**
 * La escena de la mesa 1 en un canvas de 640x360, escalado a un múltiplo entero de píxeles físicos
 * y sin suavizado. Solo lee el estado del juego: la ruleta, las animaciones y los efectos son
 * visuales. Lleva la cuenta de qué tiradas ya se han "visto" caer (revealedBets) para que la
 * interfaz no adelante el resultado.
 */
export class Scene {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly roulette = new RouletteView();
  private readonly effects: Effects;
  private hover: { x: number; y: number } | null = null;
  private playerAnim: { phase: 'idle' | 'crouch' | 'lift'; time: number } = { phase: 'idle', time: 0 };
  private floats: FloatingText[] = [];
  private cleanerShown: { x: number; y: number; facing: 1 | -1; walk: number } | null = null;
  private armReach = 0;
  private seenBets: number | null = null;
  /** Número de la última apuesta cuyo resultado ya se ha mostrado. */
  revealedBets = 0;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly sprites: Sprites,
  ) {
    canvas.width = SCENE_WIDTH;
    canvas.height = SCENE_HEIGHT;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.effects = new Effects(SCENE_WIDTH, SCENE_HEIGHT);
  }

  /** Activa o desactiva todos los efectos de pantalla (ajuste "Filtro CRT"). */
  setEffectsEnabled(enabled: boolean): void {
    this.effects.enabled = enabled;
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
    items.forEach((item, i) => this.addFloat(`+${formatNumber(item.value)}`, item.x, item.y - 24 - i * 10));
  }

  /** El ayudante de limpieza ha recogido algo. */
  cleanerCollected(items: Collected[]): void {
    for (const item of items) this.addFloat(`+${formatNumber(item.value)}`, item.x, item.y - 24);
  }

  /** Se ha cargado o empezado otra partida: nada pendiente de mostrar. */
  reset(state: GameState): void {
    this.seenBets = state.stats.bets;
    this.revealedBets = state.stats.bets;
    this.cleanerShown = null;
    this.floats = [];
  }

  private addFloat(text: string, x: number, y: number, color = COLORS.text): void {
    this.floats.push({ text, x, y, age: 0, color });
  }

  render(state: GameState, dt: number): void {
    this.trackSpins(state);
    this.advance(state, dt);
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;

    const shake = this.effects.shakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);

    this.drawBackground();
    this.effects.drawLamps(ctx);
    this.roulette.draw(ctx, this.sprites.roulette.get(state.debtPaid ? 'broken' : 'healthy'), state.debtPaid ? 'broken' : 'healthy', LAYOUT.wheel.x, LAYOUT.wheel.y);
    this.drawSprite(this.sprites.chips.get(BET_CHIPS[state.betFractionIndex] ?? BET_CHIPS[0]), LAYOUT.chips.x, LAYOUT.chips.y, CHIP_SIZE, 1);
    if (state.upgrades.crupier > 0) {
      // El brazo mecánico del crupier, junto a la mesa; se estira un poco cuando apuesta.
      const reach = Math.round((this.armReach / ARM_REACH_SECONDS) * 4);
      this.drawSprite(this.sprites.helpers.get('arm'), LAYOUT.arm.x - reach, LAYOUT.arm.y, PLAYER_SIZE, -1);
    }

    const hovered = this.hover ? itemAt(state.work.items, this.hover.x, this.hover.y) : null;
    this.canvas.style.cursor = hovered ? 'pointer' : 'default';
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
    drawables.push({ y: CONFIG.work.player.y, draw: () => this.drawPlayer() });
    if (this.cleanerShown) {
      const c = this.cleanerShown;
      drawables.push({ y: c.y, draw: () => this.drawCleaner(c) });
    }
    drawables.sort((a, b) => a.y - b.y).forEach((d) => d.draw());
    this.drawFloats();
    ctx.restore();

    this.drawPortrait(state);
  }

  /** Detecta tiradas nuevas en el estado y lanza la animación de la última. */
  private trackSpins(state: GameState): void {
    const bets = state.stats.bets;
    if (this.seenBets === null || bets < this.seenBets) {
      this.reset(state);
      return;
    }
    if (bets === this.seenBets) return;
    const latest = state.recentSpins[0];
    // Si entran varias a la vez (ayudante muy rápido), las anteriores se dan por vistas.
    this.revealedBets = Math.max(this.revealedBets, bets - 1);
    this.seenBets = bets;
    if (!latest) return;
    const balanceBefore = state.balance - latest.delta;
    const bigLoss = latest.outcome === 'pierde' && latest.bet >= balanceBefore * BIG_LOSS_FRACTION;
    if (latest.bettor === 'ayudante') this.armReach = ARM_REACH_SECONDS;
    const interrupted = this.roulette.start({ spin: latest, number: bets, bigLoss });
    if (interrupted) this.revealedBets = Math.max(this.revealedBets, interrupted.number);
  }

  private advance(state: GameState, dt: number): void {
    this.effects.update(dt);
    this.armReach = Math.max(0, this.armReach - dt);
    const landed = this.roulette.update(dt);
    if (landed) {
      this.revealedBets = Math.max(this.revealedBets, landed.number);
      const { spin } = landed;
      const text = spin.delta >= 0 ? `+${formatNumber(spin.delta)}` : `−${formatNumber(-spin.delta)}`;
      this.addFloat(text, LAYOUT.wheel.x, LAYOUT.wheel.y - 70, spin.delta >= 0 ? COLORS.text : '#c0473d');
      if (landed.bigLoss) this.effects.shake();
    }

    const anim = this.playerAnim;
    anim.time += dt;
    if (anim.phase === 'crouch' && anim.time >= CROUCH_SECONDS) this.playerAnim = { phase: 'lift', time: 0 };
    else if (anim.phase === 'lift' && anim.time >= LIFT_SECONDS) this.playerAnim = { phase: 'idle', time: 0 };

    for (const f of this.floats) f.age += dt;
    this.floats = this.floats.filter((f) => f.age < FLOAT_SECONDS);

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

  private drawBackground(): void {
    const ctx = this.ctx;
    const bg = this.sprites.backgrounds.get('mesa1');
    if (ready(bg)) {
      ctx.drawImage(bg, 0, 0);
      return;
    }
    ctx.fillStyle = COLORS.wall;
    ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
    ctx.fillStyle = COLORS.floor;
    ctx.fillRect(0, 240, SCENE_WIDTH, SCENE_HEIGHT - 240);
  }

  /** Retrato del Encargado en la esquina, con su fase según la deuda, y la barra de deuda debajo. */
  private drawPortrait(state: GameState): void {
    const ctx = this.ctx;
    const { x, y } = LAYOUT.portrait;
    ctx.fillStyle = COLORS.frame;
    ctx.fillRect(x - 3, y - 3, PORTRAIT_SIZE + 6, PORTRAIT_SIZE + 16);
    ctx.fillStyle = COLORS.frameEdge;
    ctx.fillRect(x - 3, y - 3, PORTRAIT_SIZE + 6, 1);
    ctx.fillRect(x - 3, y + PORTRAIT_SIZE + 12, PORTRAIT_SIZE + 6, 1);
    const img = this.sprites.lender.get(lenderPhase(state));
    if (ready(img)) ctx.drawImage(img, x, y, PORTRAIT_SIZE, PORTRAIT_SIZE);
    const barY = y + PORTRAIT_SIZE + 4;
    ctx.fillStyle = COLORS.debtBack;
    ctx.fillRect(x, barY, PORTRAIT_SIZE, 5);
    const width = Math.round(PORTRAIT_SIZE * debtProgress(state));
    ctx.fillStyle = COLORS.debtFill;
    ctx.fillRect(x, barY, width, 5);
    ctx.fillStyle = COLORS.debtFill2;
    ctx.fillRect(x, barY, width, 2);
  }

  private drawFloats(): void {
    const ctx = this.ctx;
    ctx.font = '10px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    for (const f of this.floats) {
      const fx = Math.round(f.x);
      const fy = Math.round(f.y - f.age * 18);
      ctx.globalAlpha = Math.max(0, 1 - f.age / FLOAT_SECONDS);
      ctx.fillStyle = COLORS.shadow;
      ctx.fillText(f.text, fx + 1, fy + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, fx, fy);
    }
    ctx.globalAlpha = 1;
  }

  /** Dibuja un sprite con la base en (x, y). Si aún no ha cargado, un marcador. */
  private drawSprite(img: HTMLImageElement | undefined, x: number, y: number, size: number, facing: 1 | -1, offsetY = 0): void {
    const ctx = this.ctx;
    const left = Math.round(x - size / 2);
    const top = Math.round(y - size + offsetY);
    if (!ready(img)) {
      ctx.fillStyle = COLORS.frameEdge;
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
