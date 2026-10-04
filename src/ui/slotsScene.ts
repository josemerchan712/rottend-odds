import { CONFIG } from '../game/config';
import { fadeAlpha, type Room, type RoomState } from '../game/rooms';
import { JACKPOT_CAP, selectedSlotChip, slotChips } from '../game/slots/machine';
import type { SlotSpin } from '../game/slots/state';
import { hasZombie, slotsLenderPhase } from '../game/slots/table';
import type { GameState } from '../game/state';
import type { SelectorChip } from '../game/betting';
import { itemAtPoint, type Collected } from '../game/workCore';
import { formatNumber } from '../util/format';
import { chipAt } from './casinoLayout';
import { Effects } from './effects';
import { provisionalTrash } from './provisional';
import { SCENE_HEIGHT, SCENE_WIDTH } from './scene';
import { reelAt, SlotsView } from './slotsView';
import { ready, type PlayerFrame, type Sprites } from './sprites';
import { drawChipColumn } from './tapeteView';

/**
 * La escena de la mesa 2 (tragaperras), en el mismo canvas de 640x360 que la mesa 1:
 * - Sala: el fondo de las tragaperras, la Tragaperras viviente asomando por detrás de la máquina
 *   central, la máquina con sus tres carretes, la columna de fichas, la tabla de premios y el
 *   empleado zombi jugando en la máquina de al lado.
 * - Trastienda: el suelo con la basura de las tragaperras, el jugador y el aprendiz de limpieza.
 */
export const MACHINE = { x: 220, y: 88, width: 200, height: 252 };
/** Palanca (dentro del sprite de la máquina) y placa de "TIRAR" bajo los carretes. */
export const LEVER = { x: 385, y: 160, width: 36, height: 86 };
export const SPIN_BUTTON = { x: 276, y: 268, width: 88, height: 18 };
const LENDER = { x: 320, top: 20, size: 96 };
const ZOMBIE_SPOT = { x: 112, y: 332 };
const PAYTABLE = { x: 434, y: 118, width: 92, height: 92 };
const DOORS2: Record<Room, { x: number; y: number; width: number; height: number; label: string }> = {
  casino: { x: 6, y: 120, width: 44, height: 150, label: 'TRASTIENDA' },
  trastienda: { x: 44, y: 28, width: 88, height: 222, label: 'SALA' },
};
const TRASH_SIZE = 32;
const PLAYER_SIZE = 64;
const FLOAT_SECONDS = 1.2;
const CLEANER_SPEED = 220;
const CROUCH_SECONDS = 0.14;
const LIFT_SECONDS = 0.3;
const ZOMBIE_BOB_SECONDS = 0.3;
const TEXT = '#c9a443';

export type SlotsTarget =
  | { kind: 'chip'; chip: SelectorChip; position: number }
  | { kind: 'reel'; reel: number }
  | { kind: 'spin' };

interface FloatingText {
  text: string;
  x: number;
  y: number;
  age: number;
  color: string;
}

function inside(r: { x: number; y: number; width: number; height: number }, p: { x: number; y: number }): boolean {
  return p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;
}

export class SlotsScene {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly reels = new SlotsView();
  private readonly effects: Effects;
  private readonly trash = provisionalTrash();
  private hover: { x: number; y: number } | null = null;
  private room: Room = 'casino';
  private floats: FloatingText[] = [];
  private seenSpins: number | null = null;
  private lenderTime = 0;
  private zombieBob = 0;
  private playerAnim: { phase: 'idle' | 'crouch' | 'lift'; time: number } = { phase: 'idle', time: 0 };
  private cleanerShown: { x: number; y: number; facing: 1 | -1; walk: number } | null = null;
  /** Tiradas del jugador que ya se han visto parar. */
  revealedSpins = 0;
  /** Cada tirada en cuanto se ve resolverse (del jugador al pararse los carretes; del zombi al momento). */
  onSpinShown: ((spin: SlotSpin) => void) | null = null;
  /** Tiradas del zombi fuera de la sala (para el aviso del HUD). */
  onAwayResult: ((spin: SlotSpin) => void) | null = null;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly sprites: Sprites,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.effects = new Effects(SCENE_WIDTH, SCENE_HEIGHT);
  }

  setEffectsEnabled(enabled: boolean): void {
    this.effects.enabled = enabled;
  }

  setHover(point: { x: number; y: number } | null): void {
    this.hover = point;
  }

  get hoverPoint(): { x: number; y: number } | null {
    return this.hover;
  }

  reset(state: GameState): void {
    this.seenSpins = state.slots.stats.spins;
    this.revealedSpins = state.slots.stats.spins;
    this.reels.setReels(state.slots.reels);
    this.floats = [];
    this.cleanerShown = null;
  }

  doorAt(point: { x: number; y: number }, room: Room): boolean {
    return inside(DOORS2[room], point);
  }

  /** ¿Hay una tirada del jugador girando a la vista? */
  spinInFlight(): boolean {
    return this.room === 'casino' && this.reels.busy;
  }

  /** Lo que hay bajo el ratón en la sala: ficha, carrete (para retener) o la palanca/placa de tirar. */
  target(state: GameState, point = this.hover): SlotsTarget | null {
    if (!point || this.room !== 'casino') return null;
    const chips = slotChips(state.slots);
    const position = chipAt(point.x, point.y, chips.length);
    if (position !== null) return { kind: 'chip', chip: chips[position], position };
    const reel = reelAt(point.x, point.y);
    if (reel !== null) return { kind: 'reel', reel };
    if (inside(LEVER, point) || inside(SPIN_BUTTON, point)) return { kind: 'spin' };
    return null;
  }

  trashAt(state: GameState, point: { x: number; y: number }) {
    return itemAtPoint(state.slots.work.items, point.x, point.y, CONFIG.slots.work.clickRadius);
  }

  playerCollected(items: Collected[]): void {
    if (!items.length) return;
    this.playerAnim = { phase: 'crouch', time: 0 };
    items.forEach((item, i) => this.addFloat(`+${formatNumber(item.value)}`, item.x, item.y - 24 - i * 10));
  }

  cleanerCollected(items: Collected[]): void {
    for (const item of items) this.addFloat(`+${formatNumber(item.value)}`, item.x, item.y - 24);
  }

  private addFloat(text: string, x: number, y: number, color = TEXT): void {
    this.floats.push({ text, x, y, age: 0, color });
  }

  render(state: GameState, dt: number, rooms: RoomState): void {
    this.room = rooms.current;
    this.track(state);
    this.advance(state, dt);
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    const shake = this.effects.shakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);
    if (rooms.current === 'casino') this.drawHall(state);
    else this.drawBackroom(state);
    this.drawDoor(rooms);
    this.drawFloats();
    ctx.restore();
    const fade = fadeAlpha(rooms);
    if (fade > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${fade})`;
      ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
    }
  }

  /** Tiradas nuevas: las del jugador giran en los carretes; las del zombi salen como texto junto a él. */
  private track(state: GameState): void {
    const slots = state.slots;
    const total = slots.stats.spins;
    if (this.seenSpins === null || total < this.seenSpins) {
      this.reset(state);
      return;
    }
    const fresh = Math.min(total - this.seenSpins, CONFIG.tech.recentSpins);
    this.seenSpins = total;
    for (let i = fresh - 1; i >= 0; i--) {
      const spin = slots.recentSpins[i];
      if (!spin) continue;
      if (spin.bettor === 'ayudante') {
        if (this.room === 'casino') {
          this.zombieBob = ZOMBIE_BOB_SECONDS;
          const text = spin.outcome === 'nada' ? `−${formatNumber(-spin.delta)}` : `+${formatNumber(spin.delta)}`;
          this.addFloat(spin.outcome === 'jackpot' ? `JACKPOT +${formatNumber(spin.delta)}` : text, ZOMBIE_SPOT.x, ZOMBIE_SPOT.y - 70, spin.delta >= 0 ? TEXT : '#c0473d');
        } else this.onAwayResult?.(spin);
        this.onSpinShown?.(spin);
      } else if (this.room === 'casino') {
        const interrupted = this.reels.start(spin, slots.reels === spin.reels ? this.previousReels(state, i) : slots.reels);
        if (interrupted) this.onSpinShown?.(interrupted);
      } else {
        this.reels.setReels(spin.reels);
        this.onSpinShown?.(spin);
      }
    }
  }

  /** Lo que enseñaban los carretes del jugador antes de esta tirada (la anterior del jugador). */
  private previousReels(state: GameState, index: number) {
    const before = state.slots.recentSpins.slice(index + 1).find((s) => s.bettor === 'jugador');
    return before ? before.reels : state.slots.reels;
  }

  private advance(state: GameState, dt: number): void {
    this.effects.update(dt);
    this.lenderTime += dt;
    this.zombieBob = Math.max(0, this.zombieBob - dt);
    const landed = this.reels.update(dt);
    if (landed) {
      const text =
        landed.outcome === 'jackpot'
          ? `JACKPOT +${formatNumber(landed.delta)}`
          : landed.delta >= 0
            ? `+${formatNumber(landed.delta)}`
            : `−${formatNumber(-landed.delta)}`;
      this.addFloat(text, MACHINE.x + MACHINE.width / 2, MACHINE.y + 52, landed.delta >= 0 ? TEXT : '#c0473d');
      // Pierde una tirada grande (un cuarto del saldo o más): tiembla.
      if (landed.outcome === 'nada' && landed.bet + landed.holdFee >= (state.slots.balance + landed.bet + landed.holdFee) * 0.25) this.effects.shake();
      this.onSpinShown?.(landed);
    }
    const anim = this.playerAnim;
    anim.time += dt;
    if (anim.phase === 'crouch' && anim.time >= CROUCH_SECONDS) this.playerAnim = { phase: 'lift', time: 0 };
    else if (anim.phase === 'lift' && anim.time >= LIFT_SECONDS) this.playerAnim = { phase: 'idle', time: 0 };
    for (const f of this.floats) f.age += dt;
    this.floats = this.floats.filter((f) => f.age < FLOAT_SECONDS);

    if (state.slots.upgrades.apprentice > 0) {
      const target = state.slots.work.cleaner;
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
      } else c.walk = 0;
    } else this.cleanerShown = null;
  }

  // ---------------------------------------------------------------------------
  // Sala de las tragaperras

  private drawHall(state: GameState): void {
    const ctx = this.ctx;
    const bg = this.sprites.backgrounds.get('mesa2');
    if (ready(bg)) ctx.drawImage(bg, 0, 0);
    else {
      ctx.fillStyle = '#120d0b';
      ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
    }
    // Penumbra para que destaque la máquina central.
    const glow = ctx.createRadialGradient(320, 200, 40, 320, 200, 300);
    glow.addColorStop(0, 'rgba(0,0,0,0)');
    glow.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);

    this.drawLender(state);
    const machine = this.sprites.slots.get('machine');
    if (ready(machine)) ctx.drawImage(machine, MACHINE.x, MACHINE.y, MACHINE.width, MACHINE.height);
    const slots = state.slots;
    const target = this.target(state);
    const holdable = slots.upgrades.hold > 0;
    const hoveredReel = target?.kind === 'reel' ? target.reel : null;
    this.reels.draw(ctx, this.sprites, slots.hold, holdable, hoveredReel);
    this.drawSpinButton(target?.kind === 'spin');
    drawChipColumn(ctx, slotChips(slots), selectedSlotChip(slots).index, this.sprites, target?.kind === 'chip' ? target.position : null);
    this.drawPaytable(state);
    if (hasZombie(slots)) {
      const bob = this.zombieBob > 0 ? -2 : 0;
      this.drawSprite(this.sprites.helpers.get('zombie'), ZOMBIE_SPOT.x, ZOMBIE_SPOT.y + bob, PLAYER_SIZE, 1);
    }
    const clickable =
      target?.kind === 'chip' || target?.kind === 'spin' || (target?.kind === 'reel' && holdable && slots.reels[target.reel] !== CONFIG.slots.diamond);
    this.canvas.style.cursor = clickable ? 'pointer' : 'default';
  }

  /** La Tragaperras viviente, detrás de la máquina: asoma la cabeza; respira 1 px. */
  private drawLender(state: GameState): void {
    const ctx = this.ctx;
    const img = this.sprites.lender2Scene.get(slotsLenderPhase(state.slots));
    const breath = Math.round(Math.sin(this.lenderTime * 1.5));
    const left = Math.round(LENDER.x - LENDER.size / 2);
    const top = LENDER.top + breath;
    const light = ctx.createRadialGradient(LENDER.x, top + 30, 4, LENDER.x, top + 30, 60);
    light.addColorStop(0, 'rgba(120, 220, 140, 0.14)');
    light.addColorStop(1, 'rgba(120, 220, 140, 0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = light;
    ctx.fillRect(LENDER.x - 60, top - 30, 120, 120);
    ctx.restore();
    if (ready(img)) ctx.drawImage(img, left, top, LENDER.size, LENDER.size);
  }

  private drawSpinButton(hovered: boolean): void {
    const ctx = this.ctx;
    const b = SPIN_BUTTON;
    ctx.fillStyle = '#0b0908';
    ctx.fillRect(b.x - 1, b.y - 1, b.width + 2, b.height + 2);
    ctx.fillStyle = hovered ? '#8a2f2a' : '#5e1f1b';
    ctx.fillRect(b.x, b.y, b.width, b.height);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(b.x, b.y, b.width, 2);
    text(ctx, this.reels.busy ? '...' : 'TIRAR', b.x + b.width / 2, b.y + b.height / 2, hovered ? '#f0d27a' : '#d4ad48', 12);
  }

  /** Tabla de premios con el pozo del jackpot. */
  private drawPaytable(state: GameState): void {
    const ctx = this.ctx;
    const p = PAYTABLE;
    ctx.fillStyle = 'rgba(10, 8, 6, 0.82)';
    ctx.fillRect(p.x, p.y, p.width, p.height);
    ctx.strokeStyle = '#6b5428';
    ctx.lineWidth = 1;
    ctx.strokeRect(p.x + 0.5, p.y + 0.5, p.width - 1, p.height - 1);
    const diamond = this.sprites.slots.get('diamante');
    const cx = p.x + p.width / 2;
    text(ctx, 'PREMIOS', cx, p.y + 8, '#d4ad48', 11);
    if (ready(diamond)) for (let i = 0; i < 3; i++) ctx.drawImage(diamond, p.x + 18 + i * 19, p.y + 15, 16, 16);
    text(ctx, 'x1000', cx, p.y + 38, '#f0d27a', 11);
    const pot = Math.min(state.slots.pot, JACKPOT_CAP);
    text(ctx, `POZO ${formatNumber(pot)}`, cx, p.y + 49, '#e3dcc6', 10);
    text(ctx, 'TRES IGUALES x10', cx, p.y + 63, '#e3dcc6', 10);
    text(ctx, 'DOS IGUALES x1,5', cx, p.y + 74, '#e3dcc6', 10);
    if (state.slots.upgrades.hold > 0) text(ctx, 'CLIC: RETENER', cx, p.y + 85, '#8f8670', 9);
  }

  // ---------------------------------------------------------------------------
  // Trastienda de la mesa 2

  private drawBackroom(state: GameState): void {
    const ctx = this.ctx;
    const own = this.sprites.backgrounds.get('trastienda2');
    const fallback = this.sprites.backgrounds.get('trastienda');
    if (ready(own)) ctx.drawImage(own, 0, 0);
    else if (ready(fallback)) {
      // Provisional: la trastienda de la mesa 1 bañada en el verde enfermizo de las tragaperras.
      ctx.drawImage(fallback, 0, 0);
      ctx.fillStyle = 'rgba(20, 60, 30, 0.35)';
      ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
    }
    const items = state.slots.work.items;
    const hovered = this.hover ? this.trashAt(state, this.hover) : null;
    this.canvas.style.cursor = hovered ? 'pointer' : 'default';
    const drawables: { y: number; draw: () => void }[] = items.map((item) => ({
      y: item.y,
      draw: () => {
        if (item.id === hovered?.id) {
          ctx.fillStyle = 'rgba(201, 164, 67, 0.35)';
          ctx.beginPath();
          ctx.ellipse(item.x, item.y - 2, 18, 7, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        const art = this.sprites.trash2.get(item.kind) ?? this.trash.get(item.kind);
        const left = Math.round(item.x - TRASH_SIZE / 2);
        const top = Math.round(item.y - TRASH_SIZE);
        if (art instanceof HTMLImageElement ? ready(art) : art) ctx.drawImage(art!, left, top, TRASH_SIZE, TRASH_SIZE);
      },
    }));
    drawables.push({ y: CONFIG.slots.work.player.y, draw: () => this.drawPlayer() });
    if (this.cleanerShown) {
      const c = this.cleanerShown;
      drawables.push({ y: c.y, draw: () => this.drawCleaner(c) });
    }
    drawables.sort((a, b) => a.y - b.y).forEach((d) => d.draw());
  }

  private drawPlayer(): void {
    const { phase } = this.playerAnim;
    const frame: PlayerFrame = phase === 'lift' ? 'lift' : 'crouch';
    const { player } = CONFIG.slots.work;
    this.drawSprite(this.sprites.player.get(frame), player.x, player.y, PLAYER_SIZE, 1, phase === 'crouch' ? 2 : 0);
  }

  private drawCleaner(c: { x: number; y: number; facing: 1 | -1; walk: number }): void {
    const frame: PlayerFrame = c.walk > 0 && Math.floor(c.walk * 6) % 2 === 1 ? 'walk-2' : 'walk-1';
    this.drawSprite(this.sprites.player.get(frame), c.x, c.y, PLAYER_SIZE, c.facing);
  }

  // ---------------------------------------------------------------------------

  private drawDoor(rooms: RoomState): void {
    const ctx = this.ctx;
    const d = DOORS2[rooms.current];
    const hovered = this.hover !== null && this.doorAt(this.hover, rooms.current) && !rooms.transition;
    if (rooms.current === 'casino' && !hovered) {
      // Indicación discreta de la puerta (el fondo no tiene una a la vista).
      text(ctx, '◂', d.x + 8, d.y + d.height / 2, 'rgba(201, 164, 67, 0.55)', 14);
    }
    if (!hovered) return;
    ctx.strokeStyle = TEXT;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.strokeRect(d.x + 0.5, d.y + 0.5, d.width - 1, d.height - 1);
    ctx.setLineDash([]);
    text(ctx, d.label, d.x + d.width / 2 + (rooms.current === 'casino' ? 22 : 0), d.y - 6, TEXT, 12);
    this.canvas.style.cursor = 'pointer';
  }

  private drawFloats(): void {
    const ctx = this.ctx;
    ctx.font = '12px VT323, monospace';
    ctx.textAlign = 'center';
    for (const f of this.floats) {
      const fx = Math.round(f.x);
      const fy = Math.round(f.y - f.age * 18);
      ctx.globalAlpha = Math.max(0, 1 - f.age / FLOAT_SECONDS);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillText(f.text, fx + 1, fy + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, fx, fy);
    }
    ctx.globalAlpha = 1;
  }

  private drawSprite(img: HTMLImageElement | undefined, x: number, y: number, size: number, facing: 1 | -1, offsetY = 0): void {
    const ctx = this.ctx;
    const left = Math.round(x - size / 2);
    const top = Math.round(y - size + offsetY);
    if (!ready(img)) return;
    if (facing === 1) ctx.drawImage(img, left, top, size, size);
    else {
      ctx.save();
      ctx.translate(left + size, top);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, size, size);
      ctx.restore();
    }
  }
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, color: string, size = 11): void {
  ctx.font = `${size}px VT323, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillText(value, x + 1, y + 1.5);
  ctx.fillStyle = color;
  ctx.fillText(value, x, y + 0.5);
}
