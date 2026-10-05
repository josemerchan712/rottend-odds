import { CONFIG } from '../game/config';
import { fadeAlpha, type Room, type RoomState } from '../game/rooms';
import { JACKPOT_CAP, selectedSlotChip, slotChips } from '../game/slots/machine';
import type { SlotSpin } from '../game/slots/state';
import { hasZombie, slotsLenderPhase } from '../game/slots/table';
import type { GameState } from '../game/state';
import type { SelectorChip } from '../game/betting';
import { formatNumber } from '../util/format';
import { chipAt } from './casinoLayout';
import { Effects } from './effects';
import { SCENE_HEIGHT, SCENE_WIDTH } from './scene';
import { reelAt, SlotsView } from './slotsView';
import { ready, type Sprites } from './sprites';
import { drawChipColumn } from './tapeteView';
import { drawButton, drawFloatTexts, drawText } from './sceneText';
import { prepareCanvas } from './stage';
import { NetAggregator, netText } from './helperMeter';

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
const ZOMBIE_SPOT = { x: 84, y: 332 }; // a la izquierda de la etiqueta TODO de las fichas
const PAYTABLE = { x: 430, y: 112, width: 116, height: 112 };
const PLAYER_SIZE = 64;
const FLOAT_SECONDS = 1.2;
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
  private hover: { x: number; y: number } | null = null;
  private room: Room = 'casino';
  private floats: FloatingText[] = [];
  /** Resultados del ayudante agregados unos segundos (un solo aviso con el neto). */
  private readonly helperNet = new NetAggregator();
  private seenSpins: number | null = null;
  private lenderTime = 0;
  private zombieBob = 0;
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
    this.effects = new Effects();
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

  private addFloat(text: string, x: number, y: number, color = TEXT): void {
    this.floats.push({ text, x, y, age: 0, color });
  }

  render(state: GameState, dt: number, rooms: RoomState): void {
    this.room = rooms.current;
    this.track(state);
    this.advance(state, dt);
    const ctx = this.ctx;
    prepareCanvas(this.canvas, ctx);
    const shake = this.effects.shakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);
    this.drawHall(state);
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
          if (spin.outcome === 'jackpot') this.addFloat(`JACKPOT +${formatNumber(spin.delta)}`, ZOMBIE_SPOT.x, ZOMBIE_SPOT.y - 70, TEXT);
          else this.helperNet.add(spin.delta);
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
    const helperNet = this.helperNet.tick(dt);
    if (helperNet) this.addFloat(netText(helperNet.net, helperNet.count), ZOMBIE_SPOT.x, ZOMBIE_SPOT.y - 70, helperNet.net >= 0 ? TEXT : '#c0473d');
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
    for (const f of this.floats) f.age += dt;
    this.floats = this.floats.filter((f) => f.age < FLOAT_SECONDS);

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
    drawButton(ctx, b, this.reels.busy ? '...' : 'TIRAR [Esp]', this.reels.busy ? 'disabled' : hovered ? 'hover' : 'active');
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
    drawText(ctx, 'value', 'PREMIOS', cx, p.y + 10);
    if (ready(diamond)) for (let i = 0; i < 3; i++) ctx.drawImage(diamond, cx - 28 + i * 19, p.y + 19, 16, 16);
    drawText(ctx, 'value', 'x1000', cx, p.y + 45);
    const pot = Math.min(state.slots.pot, JACKPOT_CAP);
    drawText(ctx, 'label', `POZO ${formatNumber(pot)}`, cx, p.y + 59);
    drawText(ctx, 'label', 'TRES IGUALES x10', cx, p.y + 75);
    drawText(ctx, 'label', 'DOS IGUALES x1,5', cx, p.y + 89);
    if (state.slots.upgrades.hold > 0) drawText(ctx, 'muted', 'CLIC: RETENER', cx, p.y + 103);
  }

  // ---------------------------------------------------------------------------

  private drawFloats(): void {
    drawFloatTexts(this.ctx, this.floats, FLOAT_SECONDS);
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

