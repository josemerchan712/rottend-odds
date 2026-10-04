import { CONFIG, DICE_TARGETS, type DiceTarget } from '../game/config';
import { DICE_JACKPOT_CAP, diceChips, isTargetUnlocked, maxRerolls, openRoll, selectedDiceChip } from '../game/dice/game';
import type { Dice, DiceRoll } from '../game/dice/state';
import { diceLenderPhase, hasGhost } from '../game/dice/table';
import { fadeAlpha, type Room, type RoomState } from '../game/rooms';
import type { GameState } from '../game/state';
import type { SelectorChip } from '../game/betting';
import { formatNumber } from '../util/format';
import { chipAt } from './casinoLayout';
import { Effects } from './effects';
import { SCENE_HEIGHT, SCENE_WIDTH } from './scene';
import { ready, type Sprites } from './sprites';
import { drawChipColumn } from './tapeteView';

/**
 * La escena de la mesa 3 (dados), en el mismo canvas de 640x360:
 * - Bar: el fondo de la mesa 3, el Barman detrás de la barra (recortado por ella), el tapete de los
 *   dados delante, los objetivos, la columna de fichas, la racha del jackpot, las cargas de
 *   relanzamiento y el camarero fantasma.
 * - Trastienda: servir copas (provisional hasta que llegue su arte).
 */
const COUNTER_TOP = 204;
const LENDER = { x: 322, top: 110, size: 96 };
export const TRAY = { x: 232, y: 222, width: 176, height: 58 };
export const ROLL_BUTTON = { x: 418, y: 236, width: 58, height: 18 };
export const ACCEPT_BUTTON = { x: 418, y: 258, width: 58, height: 14 };
const TARGET_ROW = { x: 196, y: 290, width: 50, height: 18, gap: 2 };
const DIE_SIZE = 32;
const DIE_REST = [
  { x: TRAY.x + 58, y: TRAY.y + 14 },
  { x: TRAY.x + 98, y: TRAY.y + 12 },
];
const GHOST_SPOT = { x: 556, y: 330 };
const ROLL_SECONDS = 0.75;
const REROLL_SECONDS = 0.5;
const FLOAT_SECONDS = 1.2;
const TEXT = '#c9a443';

export type DiceTargetHit =
  | { kind: 'chip'; chip: SelectorChip; position: number }
  | { kind: 'target'; target: DiceTarget; locked: boolean }
  | { kind: 'die'; die: number }
  | { kind: 'roll' }
  | { kind: 'accept' };

interface FloatingText {
  text: string;
  x: number;
  y: number;
  age: number;
  color: string;
}

/** Animación de un dado: rueda desde la izquierda del tapete y se para en su cara. */
interface DieAnim {
  elapsed: number;
  duration: number;
  fromX: number;
}

function inside(r: { x: number; y: number; width: number; height: number }, p: { x: number; y: number }): boolean {
  return p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;
}

export function targetRect(i: number) {
  return { x: TARGET_ROW.x + i * (TARGET_ROW.width + TARGET_ROW.gap), y: TARGET_ROW.y, width: TARGET_ROW.width, height: TARGET_ROW.height };
}

function dieRect(i: number) {
  return { x: DIE_REST[i].x, y: DIE_REST[i].y, width: DIE_SIZE, height: DIE_SIZE };
}

export class DiceScene {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly effects: Effects;
  private hover: { x: number; y: number } | null = null;
  private room: Room = 'casino';
  private floats: FloatingText[] = [];
  private seenRolls: number | null = null;
  private lenderTime = 0;
  private ghostBob = 0;
  private shown: Dice = [3, 4];
  private anims: (DieAnim | null)[] = [null, null];
  /** Tirada del jugador que se está enseñando, si ya se ha avisado de su resultado y si se vio su relanzamiento. */
  private current: { roll: DiceRoll; notified: boolean; rerollSeen: boolean } | null = null;
  private time = 0;
  onRollShown: ((roll: DiceRoll) => void) | null = null;
  onAwayResult: ((roll: DiceRoll) => void) | null = null;

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

  reset(state: GameState): void {
    this.seenRolls = state.dice.stats.rolls;
    this.shown = [...state.dice.dice] as Dice;
    this.anims = [null, null];
    this.current = null;
    this.floats = [];
  }

  /** ¿Hay dados rodando a la vista? */
  rollInFlight(): boolean {
    return this.room === 'casino' && this.anims.some((a) => a !== null);
  }

  target(state: GameState, point = this.hover): DiceTargetHit | null {
    if (!point || this.room !== 'casino') return null;
    const dice = state.dice;
    const chips = diceChips(dice);
    const position = chipAt(point.x, point.y, chips.length);
    if (position !== null) return { kind: 'chip', chip: chips[position], position };
    for (let i = 0; i < DICE_TARGETS.length; i++) {
      if (inside(targetRect(i), point)) return { kind: 'target', target: DICE_TARGETS[i], locked: !isTargetUnlocked(dice, DICE_TARGETS[i]) };
    }
    if (openRoll(dice) && !this.rollInFlight()) {
      for (let i = 0; i < 2; i++) if (inside(dieRect(i), point)) return { kind: 'die', die: i };
      if (inside(ACCEPT_BUTTON, point)) return { kind: 'accept' };
    }
    if (inside(ROLL_BUTTON, point)) return { kind: 'roll' };
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
    ctx.imageSmoothingEnabled = false;
    const shake = this.effects.shakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);
    this.drawBar(state);
    this.drawFloats();
    ctx.restore();
    const fade = fadeAlpha(rooms);
    if (fade > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${fade})`;
      ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
    }
  }

  /** Tiradas nuevas: las del jugador ruedan en el tapete; las del camarero salen como texto junto a él. */
  private track(state: GameState): void {
    const dice = state.dice;
    const total = dice.stats.rolls;
    if (this.seenRolls === null || total < this.seenRolls) {
      this.reset(state);
      return;
    }
    const fresh = Math.min(total - this.seenRolls, CONFIG.tech.recentSpins);
    this.seenRolls = total;
    for (let i = fresh - 1; i >= 0; i--) {
      const roll = dice.recentRolls[i];
      if (!roll) continue;
      if (roll.bettor === 'ayudante') {
        if (this.room === 'casino') {
          this.ghostBob = 0.3;
          const text = roll.jackpot > 0 ? `JACKPOT +${formatNumber(roll.jackpot)}` : roll.delta >= 0 ? `+${formatNumber(roll.delta)}` : `−${formatNumber(-roll.delta)}`;
          this.addFloat(text, GHOST_SPOT.x, GHOST_SPOT.y - 70, roll.delta >= 0 ? TEXT : '#c0473d');
        } else this.onAwayResult?.(roll);
        this.onRollShown?.(roll);
        continue;
      }
      // Tirada nueva del jugador: la anterior, si no se había avisado, se da por vista.
      if (this.current && !this.current.notified && this.current.roll.final) this.onRollShown?.(this.current.roll);
      this.current = { roll, notified: false, rerollSeen: false };
      if (this.room === 'casino') {
        this.anims = [0, 1].map((d) => ({ elapsed: 0, duration: ROLL_SECONDS + d * 0.08, fromX: TRAY.x + 6 })) as DieAnim[];
      } else this.anims = [null, null];
    }
    // Relanzamiento de la tirada abierta: rueda solo ese dado.
    const cur = this.current;
    if (cur && cur.roll.rerolled !== null && !cur.rerollSeen) {
      cur.rerollSeen = true;
      cur.notified = false;
      if (this.room === 'casino') this.anims[cur.roll.rerolled] = { elapsed: 0, duration: REROLL_SECONDS, fromX: TRAY.x + 6 };
    }
  }

  private advance(state: GameState, dt: number): void {
    this.effects.update(dt);
    this.time += dt;
    this.lenderTime += dt;
    this.ghostBob = Math.max(0, this.ghostBob - dt);
    let landed = false;
    this.anims = this.anims.map((a) => {
      if (!a) return null;
      a.elapsed += dt;
      if (a.elapsed >= a.duration) {
        landed = true;
        return null;
      }
      return a;
    });
    const cur = this.current;
    if (cur && !this.anims.some((a) => a !== null)) {
      this.shown = [...cur.roll.dice] as Dice;
      if (landed) {
        const roll = cur.roll;
        const text = roll.jackpot > 0 ? `JACKPOT +${formatNumber(roll.jackpot)}` : roll.won ? `+${formatNumber(roll.delta)}` : roll.final ? `−${formatNumber(-roll.delta)}` : '';
        if (text) this.addFloat(text, TRAY.x + TRAY.width / 2, TRAY.y - 6, roll.won ? TEXT : '#c0473d');
        if (!roll.won && roll.final && roll.bet >= (state.dice.balance + roll.bet) * 0.25) this.effects.shake();
      }
      if (!cur.notified && cur.roll.final) {
        cur.notified = true;
        this.onRollShown?.(cur.roll);
      }
    }
    for (const f of this.floats) f.age += dt;
    this.floats = this.floats.filter((f) => f.age < FLOAT_SECONDS);
  }

  // ---------------------------------------------------------------------------
  // Bar

  private drawBar(state: GameState): void {
    const ctx = this.ctx;
    const bg = this.sprites.backgrounds.get('mesa3');
    if (ready(bg)) ctx.drawImage(bg, 0, 0);
    this.drawLender(state);
    const dice = state.dice;
    const hit = this.target(state);
    this.drawTray(state, hit);
    this.drawTargets(state, hit);
    this.drawButtons(state, hit);
    drawChipColumn(ctx, diceChips(dice), selectedDiceChip(dice).index, this.sprites, hit?.kind === 'chip' ? hit.position : null);
    if (hasGhost(dice)) this.drawSprite(this.sprites.helpers.get('ghost'), GHOST_SPOT.x, GHOST_SPOT.y + (this.ghostBob > 0 ? -2 : 0), 64, -1);
    const clickable = hit && !(hit.kind === 'target' && hit.locked);
    this.canvas.style.cursor = clickable ? 'pointer' : 'default';
  }

  /** El Barman, detrás de la barra (la barra le tapa de cintura para abajo). */
  private drawLender(state: GameState): void {
    const ctx = this.ctx;
    const img = this.sprites.lender3Scene.get(diceLenderPhase(state.dice));
    if (!ready(img)) return;
    const breath = Math.round(Math.sin(this.lenderTime * 1.6));
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, SCENE_WIDTH, COUNTER_TOP);
    ctx.clip();
    ctx.drawImage(img, Math.round(LENDER.x - LENDER.size / 2), LENDER.top + breath, LENDER.size, LENDER.size);
    ctx.restore();
  }

  /** Tapete de los dados con la racha del jackpot, el pozo y las cargas de relanzamiento. */
  private drawTray(state: GameState, hit: DiceTargetHit | null): void {
    const ctx = this.ctx;
    const dice = state.dice;
    const t = TRAY;
    ctx.fillStyle = '#0b0908';
    ctx.fillRect(t.x - 2, t.y - 2, t.width + 4, t.height + 4);
    ctx.fillStyle = '#5a3a1e';
    ctx.fillRect(t.x - 1, t.y - 1, t.width + 2, t.height + 2);
    ctx.fillStyle = '#24331b';
    ctx.fillRect(t.x, t.y, t.width, t.height);
    // Racha de dobles seises: tres casillas.
    label(ctx, 'RACHA 6·6', t.x + 4, t.y + 6, '#8f8670', 9, 'left');
    for (let i = 0; i < CONFIG.dice.jackpot.streak; i++) {
      ctx.fillStyle = i < dice.streak ? '#d4ad48' : '#3b4f28';
      ctx.fillRect(t.x + 48 + i * 9, t.y + 3, 7, 6);
    }
    label(ctx, `${dice.streak}/${CONFIG.dice.jackpot.streak}`, t.x + 78, t.y + 6, dice.streak > 0 ? '#f0d27a' : '#8f8670', 9, 'left');
    label(ctx, `POZO ${formatNumber(Math.min(dice.pot, DICE_JACKPOT_CAP))}`, t.x + t.width - 4, t.y + 6, '#e3dcc6', 9, 'right');
    // Cargas de relanzamiento.
    const max = maxRerolls(dice.upgrades.luck);
    label(ctx, 'RELANZ.', t.x + 4, t.y + t.height - 6, '#8f8670', 9, 'left');
    for (let i = 0; i < max; i++) {
      ctx.fillStyle = i < dice.rerolls.charges ? '#c0473d' : '#3a2f1e';
      ctx.beginPath();
      ctx.arc(t.x + 44 + i * 8, t.y + t.height - 6, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Los dados.
    const open = openRoll(dice);
    for (let i = 0; i < 2; i++) {
      const a = this.anims[i];
      const rest = DIE_REST[i];
      if (a) {
        const k = Math.min(a.elapsed / a.duration, 1);
        const ease = 1 - (1 - k) ** 2;
        const x = a.fromX + (rest.x - a.fromX) * ease;
        const bounce = Math.abs(Math.sin(k * Math.PI * 3)) * (1 - k) * 12;
        const frame = Math.floor(a.elapsed * 14 + i) % 3;
        const sprite = frame === 0 ? this.sprites.dice.get('tumble') : this.sprites.dice.get(`face-${1 + Math.floor((this.time * 23 + i * 3) % 6)}`);
        if (ready(sprite)) ctx.drawImage(sprite, Math.round(x), Math.round(rest.y - bounce), DIE_SIZE, DIE_SIZE);
      } else {
        const face = this.sprites.dice.get(`face-${this.shown[i]}`);
        if (ready(face)) ctx.drawImage(face, rest.x, rest.y, DIE_SIZE, DIE_SIZE);
        if (open && !this.rollInFlight()) {
          // Tirada perdida con cargas: los dados se pueden relanzar.
          const hovered = hit?.kind === 'die' && hit.die === i;
          ctx.strokeStyle = hovered ? '#f0d27a' : 'rgba(212, 173, 72, 0.6)';
          ctx.lineWidth = 1;
          ctx.strokeRect(rest.x - 1.5, rest.y - 1.5, DIE_SIZE + 3, DIE_SIZE + 3);
        }
      }
    }
    if (open && !this.rollInFlight()) label(ctx, 'CLIC EN UN DADO', t.x + t.width - 4, t.y + t.height - 6, '#f0d27a', 9, 'right');
  }

  private drawTargets(state: GameState, hit: DiceTargetHit | null): void {
    const ctx = this.ctx;
    const dice = state.dice;
    DICE_TARGETS.forEach((target, i) => {
      const r = targetRect(i);
      const def = CONFIG.dice.targets[target];
      const locked = !isTargetUnlocked(dice, target);
      const selected = dice.target === target;
      const hovered = hit?.kind === 'target' && hit.target === target;
      ctx.fillStyle = '#0b0908';
      ctx.fillRect(r.x - 1, r.y - 1, r.width + 2, r.height + 2);
      ctx.fillStyle = selected ? '#5e4a1e' : hovered ? '#3a2f1e' : '#1b1612';
      ctx.fillRect(r.x, r.y, r.width, r.height);
      if (selected) {
        ctx.strokeStyle = '#d4ad48';
        ctx.lineWidth = 1;
        ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.width - 1, r.height - 1);
      }
      const payout = def.payout === Math.floor(def.payout) ? `${def.payout}:1` : `${String(def.payout).replace('.', ',')}:1`;
      label(ctx, def.short, r.x + r.width / 2, r.y + 5, locked ? '#5a5245' : selected ? '#f0d27a' : '#e3dcc6', 9);
      label(ctx, locked ? 'BLOQ.' : payout, r.x + r.width / 2, r.y + 13, locked ? '#5a5245' : '#8f8670', 9);
    });
  }

  private drawButtons(state: GameState, hit: DiceTargetHit | null): void {
    const ctx = this.ctx;
    const button = (r: typeof ROLL_BUTTON, text: string, hovered: boolean, color: string) => {
      ctx.fillStyle = '#0b0908';
      ctx.fillRect(r.x - 1, r.y - 1, r.width + 2, r.height + 2);
      ctx.fillStyle = hovered ? '#8a2f2a' : color;
      ctx.fillRect(r.x, r.y, r.width, r.height);
      label(ctx, text, r.x + r.width / 2, r.y + r.height / 2, hovered ? '#f0d27a' : '#d4ad48', r.height > 15 ? 12 : 9);
    };
    button(ROLL_BUTTON, this.rollInFlight() ? '...' : 'TIRAR', hit?.kind === 'roll', '#5e1f1b');
    if (openRoll(state.dice) && !this.rollInFlight()) button(ACCEPT_BUTTON, 'ACEPTAR', hit?.kind === 'accept', '#2e261c');
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
    if (!ready(img)) return;
    const left = Math.round(x - size / 2);
    const top = Math.round(y - size + offsetY);
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

function label(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, color: string, size = 11, align: CanvasTextAlign = 'center'): void {
  ctx.font = `${size}px VT323, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillText(value, x + 1, y + 1.5);
  ctx.fillStyle = color;
  ctx.fillText(value, x, y + 0.5);
}
