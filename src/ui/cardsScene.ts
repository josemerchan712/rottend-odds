import { CONFIG } from '../game/config';
import { CARDS_JACKPOT_CAP, cardLabel, cardsChips, maxDiscards, selectedCardsChip } from '../game/cards/game';
import { handTotal, isSeven, rank, suit } from '../game/cards/rules';
import type { Card, CardHand } from '../game/cards/state';
import { cardsLenderPhase, hasSkeleton } from '../game/cards/table';
import { fadeAlpha, type Room, type RoomState } from '../game/rooms';
import type { GameState } from '../game/state';
import type { SelectorChip } from '../game/betting';
import { itemAtPoint, type Collected } from '../game/workCore';
import { formatNumber } from '../util/format';
import { chipAt } from './casinoLayout';
import { Effects } from './effects';
import { provisionalTrash } from './provisional';
import { SCENE_HEIGHT, SCENE_WIDTH } from './scene';
import { ready, type PlayerFrame, type Sprites } from './sprites';
import { drawChipColumn } from './tapeteView';

/**
 * La escena de la mesa 4 (blackjack), en el mismo canvas de 640x360:
 * - Sala: el fondo de la mesa 4, la Crupier detrás de la mesa (recortada por ella), un tapete delante
 *   con las cartas de la banca y del jugador (salen del zapato, se deslizan y se voltean), las zonas
 *   de PEDIR / PLANTARSE / REPARTIR / ACEPTAR impresas en el propio tapete, el descarte con un clic en
 *   la última carta, los contadores (manos, descartes, pozo, 7·7·7), las fichas y el esqueleto.
 * - Trastienda: barajar y repartir (provisional hasta que llegue su arte).
 */
const TABLE_TOP = 192;
const LENDER = { x: 320, top: 98, size: 96 };
export const FELT = { x: 186, y: 198, width: 274, height: 104 };
const CARD = { width: 32, height: 48, step: 22 };
const DEALER_ROW = { x: FELT.x + 10, y: FELT.y + 6 };
const PLAYER_ROW = { x: FELT.x + 10, y: FELT.y + 54 };
const SHOE = { x: FELT.x + FELT.width - 30, y: FELT.y - 20 };
export const ZONES4 = {
  deal: { x: FELT.x + 196, y: FELT.y + 8, width: 70, height: 20, label: 'REPARTIR' },
  hit: { x: FELT.x + 196, y: FELT.y + 56, width: 70, height: 20, label: 'PEDIR' },
  stand: { x: FELT.x + 196, y: FELT.y + 80, width: 70, height: 20, label: 'PLANTARSE' },
  accept: { x: FELT.x + 196, y: FELT.y + 56, width: 70, height: 20, label: 'ACEPTAR' },
};
const SKELETON_SPOT = { x: 556, y: 330 };
const DOORS4: Record<Room, { x: number; y: number; width: number; height: number; label: string }> = {
  casino: { x: 6, y: 120, width: 44, height: 150, label: 'TRASTIENDA' },
  trastienda: { x: 44, y: 28, width: 88, height: 222, label: 'SALA' },
};
const DEAL_SECONDS = 0.22;
const FLIP_SECONDS = 0.14;
const STAGGER = 0.2;
const FLOAT_SECONDS = 1.2;
const CLEANER_SPEED = 220;
const CROUCH_SECONDS = 0.14;
const LIFT_SECONDS = 0.3;
const TEXT = '#c9a443';
const RED = '#a3261e';
const INK = '#141110';

export type CardsTarget =
  | { kind: 'chip'; chip: SelectorChip; position: number }
  | { kind: 'deal' }
  | { kind: 'hit' }
  | { kind: 'stand' }
  | { kind: 'accept' }
  | { kind: 'discard' };

interface FloatingText {
  text: string;
  x: number;
  y: number;
  age: number;
  color: string;
}

/** Una carta en la mesa: cuándo empieza a moverse y si está boca arriba. */
interface ShownCard {
  card: Card;
  /** Segundos desde que se repartió (negativo = aún en el zapato, esperando su turno). */
  age: number;
  faceUp: boolean;
  /** Edad a la que empieza a voltearse (null = no se voltea). */
  flipAt: number | null;
}

function inside(r: { x: number; y: number; width: number; height: number }, p: { x: number; y: number }): boolean {
  return p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;
}

function slot(row: { x: number; y: number }, i: number) {
  return { x: row.x + i * CARD.step, y: row.y };
}

export class CardsScene {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly effects: Effects;
  private readonly trash = provisionalTrash(4);
  private hover: { x: number; y: number } | null = null;
  private room: Room = 'casino';
  private floats: FloatingText[] = [];
  private seenHands: number | null = null;
  private lenderTime = 0;
  private skeletonBob = 0;
  private hand: CardHand | null = null;
  private player: ShownCard[] = [];
  private dealer: ShownCard[] = [];
  private notified = false;
  private playerAnim: { phase: 'idle' | 'crouch' | 'lift'; time: number } = { phase: 'idle', time: 0 };
  private cleanerShown: { x: number; y: number; facing: 1 | -1; walk: number } | null = null;
  onHandShown: ((hand: CardHand) => void) | null = null;
  onAwayResult: ((hand: CardHand) => void) | null = null;

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
    this.seenHands = state.cards.stats.hands;
    this.hand = state.cards.hand;
    const all = (cards: readonly Card[], hide: boolean) =>
      cards.map((card, i) => ({ card, age: 10, faceUp: !(hide && i === 1), flipAt: null }));
    this.player = this.hand ? all(this.hand.player, false) : [];
    this.dealer = this.hand ? all(this.hand.dealer, this.hand.status !== 'fin') : [];
    this.notified = true;
    this.floats = [];
    this.cleanerShown = null;
  }

  doorAt(point: { x: number; y: number }, room: Room): boolean {
    return inside(DOORS4[room], point);
  }

  /** ¿Hay cartas moviéndose o volteándose a la vista? */
  dealing(): boolean {
    if (this.room !== 'casino') return false;
    return [...this.player, ...this.dealer].some((c) => c.age < DEAL_SECONDS || (c.flipAt !== null && c.age < c.flipAt + FLIP_SECONDS));
  }

  target(state: GameState, point = this.hover): CardsTarget | null {
    if (!point || this.room !== 'casino') return null;
    const cards = state.cards;
    const chips = cardsChips(cards);
    const position = chipAt(point.x, point.y, chips.length);
    if (position !== null) return { kind: 'chip', chip: chips[position], position };
    const hand = cards.hand;
    const open = hand !== null && hand.status !== 'fin';
    if (this.dealing()) return null;
    if (!open && inside(ZONES4.deal, point)) return { kind: 'deal' };
    if (open && hand.status === 'jugando') {
      if (inside(ZONES4.hit, point)) return { kind: 'hit' };
      if (inside(ZONES4.stand, point)) return { kind: 'stand' };
    }
    if (open && hand.status === 'pasado' && inside(ZONES4.accept, point)) return { kind: 'accept' };
    if (open && hand.canDiscard && cards.discards.charges > 0) {
      const last = slot(PLAYER_ROW, hand.player.length - 1);
      if (inside({ x: last.x, y: last.y, width: CARD.width, height: CARD.height }, point)) return { kind: 'discard' };
    }
    return null;
  }

  trashAt(state: GameState, point: { x: number; y: number }) {
    return itemAtPoint(state.cards.work.items, point.x, point.y, CONFIG.cards.work.clickRadius);
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

  /** Sigue la mano del jugador (cartas nuevas, descartes, destape) y las manos del esqueleto. */
  private track(state: GameState): void {
    const cards = state.cards;
    if (this.seenHands === null || cards.stats.hands < this.seenHands) {
      this.reset(state);
      return;
    }
    // Manos del esqueleto resueltas desde la última vez.
    const fresh = cards.stats.hands - this.seenHands;
    this.seenHands = cards.stats.hands;
    if (fresh > 0) {
      for (const h of cards.recentHands.slice(0, Math.min(fresh, CONFIG.tech.recentSpins)).reverse()) {
        if (h.bettor !== 'ayudante') continue;
        if (this.room === 'casino') {
          this.skeletonBob = 0.3;
          const text = h.jackpot > 0 ? `JACKPOT +${formatNumber(h.jackpot)}` : h.delta > 0 ? `+${formatNumber(h.delta)}` : h.delta < 0 ? `−${formatNumber(-h.delta)}` : '=';
          this.addFloat(text, SKELETON_SPOT.x, SKELETON_SPOT.y - 70, h.delta >= 0 ? TEXT : '#c0473d');
        } else this.onAwayResult?.(h);
        this.onHandShown?.(h);
      }
    }
    const hand = cards.hand;
    if (hand !== this.hand) {
      // Mano nueva: cartas desde el zapato, alternando jugador y banca.
      this.hand = hand;
      this.player = [];
      this.dealer = [];
      this.notified = false;
      if (!hand) return;
      const order: [ShownCard[], Card, boolean][] = [];
      hand.player.forEach((c, i) => {
        order.push([this.player, c, true]);
        if (hand.dealer[i] !== undefined && i < 2) order.push([this.dealer, hand.dealer[i], i === 0]);
      });
      order.forEach(([row, card, up], k) => row.push({ card, age: -k * STAGGER, faceUp: false, flipAt: up ? DEAL_SECONDS : null }));
    }
    if (!hand) return;
    // Cartas nuevas del jugador (pedir) o descartes (cambia la última).
    hand.player.forEach((c, i) => {
      const shown = this.player[i];
      if (!shown) {
        const wait = Math.max(0, ...this.player.map((p) => -p.age));
        this.player.push({ card: c, age: -wait, faceUp: false, flipAt: DEAL_SECONDS });
      } else if (shown.card !== c) {
        this.player[i] = { card: c, age: 0, faceUp: false, flipAt: DEAL_SECONDS };
      }
    });
    this.player.length = hand.player.length;
    // La banca destapa y pide al plantarse.
    if (hand.status === 'fin') {
      const base = Math.max(0, ...this.player.map((p) => -p.age + DEAL_SECONDS));
      const hole = this.dealer[1];
      if (hole && !hole.faceUp && hole.flipAt === null) hole.flipAt = hole.age + base;
      hand.dealer.forEach((c, i) => {
        if (!this.dealer[i]) this.dealer.push({ card: c, age: -(base + 0.25 + (i - 2) * STAGGER), faceUp: false, flipAt: DEAL_SECONDS });
      });
    }
  }

  private advance(state: GameState, dt: number): void {
    this.effects.update(dt);
    this.lenderTime += dt;
    this.skeletonBob = Math.max(0, this.skeletonBob - dt);
    for (const c of [...this.player, ...this.dealer]) {
      c.age += dt;
      if (c.flipAt !== null && c.age >= c.flipAt + FLIP_SECONDS / 2) c.faceUp = true;
    }
    const hand = this.hand;
    if (hand && hand.status === 'fin' && !this.notified && !this.dealing()) {
      this.notified = true;
      const text = hand.jackpot > 0 ? `7·7·7 JACKPOT +${formatNumber(hand.jackpot)}` : hand.result === 'gana' ? `+${formatNumber(hand.delta)}` : hand.result === 'empate' ? 'EMPATE' : `−${formatNumber(hand.bet)}`;
      this.addFloat(text, FELT.x + 110, FELT.y - 4, hand.result === 'pierde' ? '#c0473d' : TEXT);
      if (hand.result === 'pierde' && hand.bet >= (state.cards.balance + hand.bet) * 0.25) this.effects.shake();
      this.onHandShown?.(hand);
    }
    const anim = this.playerAnim;
    anim.time += dt;
    if (anim.phase === 'crouch' && anim.time >= CROUCH_SECONDS) this.playerAnim = { phase: 'lift', time: 0 };
    else if (anim.phase === 'lift' && anim.time >= LIFT_SECONDS) this.playerAnim = { phase: 'idle', time: 0 };
    for (const f of this.floats) f.age += dt;
    this.floats = this.floats.filter((f) => f.age < FLOAT_SECONDS);
    if (state.cards.upgrades.dealer > 0) {
      const target = state.cards.work.cleaner;
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
  // Sala

  private drawHall(state: GameState): void {
    const ctx = this.ctx;
    const bg = this.sprites.backgrounds.get('mesa4');
    if (ready(bg)) ctx.drawImage(bg, 0, 0);
    this.drawLender(state);
    const cards = state.cards;
    const hit = this.target(state);
    this.drawFelt(state, hit);
    drawChipColumn(ctx, cardsChips(cards), selectedCardsChip(cards).index, this.sprites, hit?.kind === 'chip' ? hit.position : null);
    if (hasSkeleton(cards)) this.drawSprite(this.sprites.helpers.get('skeleton'), SKELETON_SPOT.x, SKELETON_SPOT.y + (this.skeletonBob > 0 ? -2 : 0), 64, -1);
    this.canvas.style.cursor = hit ? 'pointer' : 'default';
  }

  /** La Crupier, detrás de la mesa (la mesa la tapa de cintura para abajo). */
  private drawLender(state: GameState): void {
    const ctx = this.ctx;
    const img = this.sprites.lender4Scene.get(cardsLenderPhase(state.cards));
    if (!ready(img)) return;
    const breath = Math.round(Math.sin(this.lenderTime * 1.4));
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, SCENE_WIDTH, TABLE_TOP);
    ctx.clip();
    ctx.drawImage(img, Math.round(LENDER.x - LENDER.size / 2), LENDER.top + breath, LENDER.size, LENDER.size);
    ctx.restore();
  }

  private drawFelt(state: GameState, hit: CardsTarget | null): void {
    const ctx = this.ctx;
    const cards = state.cards;
    const f = FELT;
    ctx.fillStyle = '#0b0908';
    ctx.fillRect(f.x - 2, f.y - 2, f.width + 4, f.height + 4);
    ctx.fillStyle = '#5a3a1e';
    ctx.fillRect(f.x - 1, f.y - 1, f.width + 2, f.height + 2);
    ctx.fillStyle = '#21321b';
    ctx.fillRect(f.x, f.y, f.width, f.height);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(f.x, f.y + f.height / 2, f.width, 1);
    // El zapato.
    ctx.fillStyle = '#2a2018';
    ctx.fillRect(SHOE.x - 2, SHOE.y + 14, 28, 10);
    const back = this.sprites.cards.get('back');

    const hand = this.hand;
    const open = cards.hand !== null && cards.hand.status !== 'fin';
    // Las cartas.
    const drawRow = (row: ShownCard[], at: { x: number; y: number }) =>
      row.forEach((c, i) => {
        if (c.age < 0) return;
        const to = slot(at, i);
        const k = Math.min(c.age / DEAL_SECONDS, 1);
        const ease = 1 - (1 - k) ** 2;
        const x = SHOE.x + (to.x - SHOE.x) * ease;
        const y = SHOE.y + (to.y - SHOE.y) * ease;
        // Volteo: se estrecha y se ensancha.
        let w = 1;
        if (c.flipAt !== null && c.age >= c.flipAt && c.age < c.flipAt + FLIP_SECONDS) w = Math.abs(1 - (2 * (c.age - c.flipAt)) / FLIP_SECONDS);
        const drawW = Math.max(2, Math.round(CARD.width * w));
        const dx = Math.round(x + (CARD.width - drawW) / 2);
        if (c.faceUp) this.drawFace(c.card, dx, Math.round(y), drawW);
        else if (ready(back)) ctx.drawImage(back, dx, Math.round(y), drawW, CARD.height);
      });
    drawRow(this.dealer, DEALER_ROW);
    drawRow(this.player, PLAYER_ROW);

    if (hand) {
      const playerShown = this.player.filter((c) => c.faceUp).map((c) => c.card);
      const dealerShown = this.dealer.filter((c) => c.faceUp).map((c) => c.card);
      if (dealerShown.length) label(ctx, `BANCA ${handTotal(dealerShown).total}`, DEALER_ROW.x + 150, DEALER_ROW.y + 40, '#e3dcc6', 10, 'right');
      if (playerShown.length) {
        const t = handTotal(playerShown);
        label(ctx, `TÚ ${t.total}${t.soft && t.total < 21 ? ' (BLANDO)' : ''}`, PLAYER_ROW.x + 150, PLAYER_ROW.y + 40, t.total > 21 ? '#c0473d' : '#f0d27a', 10, 'right');
      }
      // Descarte: la última carta del jugador se resalta.
      if (open && cards.hand!.canDiscard && cards.discards.charges > 0 && !this.dealing()) {
        const last = slot(PLAYER_ROW, cards.hand!.player.length - 1);
        ctx.strokeStyle = hit?.kind === 'discard' ? '#f0d27a' : 'rgba(212, 173, 72, 0.9)';
        ctx.lineWidth = 2;
        ctx.strokeRect(last.x - 2, last.y - 2, CARD.width + 4, CARD.height + 4);
        // Etiqueta "D" (descartar) en la esquina de la carta.
        ctx.fillStyle = '#5e1f1b';
        ctx.fillRect(last.x + CARD.width - 8, last.y - 6, 10, 9);
        label(ctx, 'D', last.x + CARD.width - 3, last.y - 2, '#f0d27a', 9);
      }
      if (open && cards.hand!.status === 'pasado' && !this.dealing()) label(ctx, 'TE HAS PASADO', PLAYER_ROW.x + 150, PLAYER_ROW.y + 28, '#c0473d', 10, 'right');
    }

    // Zonas impresas en el tapete.
    const zone = (z: (typeof ZONES4)[keyof typeof ZONES4], active: boolean, hovered: boolean) => {
      ctx.strokeStyle = active ? (hovered ? '#f0d27a' : '#d4ad48') : 'rgba(212, 173, 72, 0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(z.x + 0.5, z.y + 0.5, z.width - 1, z.height - 1);
      if (hovered) {
        ctx.fillStyle = 'rgba(212, 173, 72, 0.15)';
        ctx.fillRect(z.x + 1, z.y + 1, z.width - 2, z.height - 2);
      }
      label(ctx, z.label, z.x + z.width / 2, z.y + z.height / 2, active ? (hovered ? '#f0d27a' : '#d4ad48') : 'rgba(212, 173, 72, 0.35)', 11);
    };
    const busy = this.dealing();
    zone(ZONES4.deal, !open && !busy, hit?.kind === 'deal');
    if (open && cards.hand!.status === 'pasado') zone(ZONES4.accept, !busy, hit?.kind === 'accept');
    else zone(ZONES4.hit, open && !busy, hit?.kind === 'hit');
    zone(ZONES4.stand, open && cards.hand!.status === 'jugando' && !busy, hit?.kind === 'stand');

    // Contadores: manos, descartes, pozo y 7·7·7.
    const s = cards.stats;
    label(ctx, `MANOS ${s.hands} · GANADAS ${s.wins}`, f.x + 4, f.y + f.height + 8, '#8f8670', 9, 'left');
    const max = maxDiscards(cards.upgrades.luck);
    label(ctx, 'DESCARTES', f.x + 120, f.y + f.height + 8, '#8f8670', 9, 'left');
    for (let i = 0; i < max; i++) {
      ctx.fillStyle = i < cards.discards.charges ? '#c0473d' : '#3a2f1e';
      ctx.beginPath();
      ctx.arc(f.x + 166 + i * 7, f.y + f.height + 8, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const sevens = hand ? hand.player.filter(isSeven).length : 0;
    const sevenOn = open && sevens >= 2 && hand!.player.length <= 3;
    label(ctx, `7·7·7 POZO ${formatNumber(Math.min(cards.pot, CARDS_JACKPOT_CAP))}`, f.x + f.width - 2, f.y - 6, sevenOn ? '#f0d27a' : '#8f8670', 9, 'right');
  }

  /** Cara de una carta dibujada en código (32x48): papel viejo, índices y palo grande. */
  private drawFace(card: Card, x: number, y: number, w: number): void {
    const ctx = this.ctx;
    const h = CARD.height;
    ctx.fillStyle = INK;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#e3d9bd';
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    if (w < CARD.width - 4) return; // a mitad del volteo, sin detalle
    // Manchas de uso, fijas por carta.
    ctx.fillStyle = 'rgba(138, 74, 30, 0.35)';
    ctx.fillRect(x + 2 + (card % 5) * 4, y + h - 8 - (card % 3) * 3, 5, 3);
    ctx.fillRect(x + w - 8 - (card % 4), y + 3 + (card % 6), 4, 2);
    const red = suit(card) === 1 || suit(card) === 2;
    const color = red ? RED : INK;
    const glyph = ['♠', '♥', '♦', '♣'][suit(card)];
    const r = cardLabel(card);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.font = '11px VT323, monospace';
    ctx.fillStyle = color;
    ctx.fillText(r, x + 3, y + 1);
    ctx.font = '9px VT323, monospace';
    ctx.fillText(glyph, x + 3, y + 10);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.font = '11px VT323, monospace';
    ctx.fillText(r, x + w - 3, y + h - 1);
    // Palo grande en el centro (figuras: una corona encima).
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '20px VT323, monospace';
    ctx.fillText(glyph, x + w / 2, y + h / 2 + 1);
    if (rank(card) >= 10) {
      ctx.fillStyle = '#a8841f';
      ctx.fillRect(x + w / 2 - 5, y + 13, 10, 2);
      ctx.fillRect(x + w / 2 - 5, y + 11, 2, 2);
      ctx.fillRect(x + w / 2 - 1, y + 10, 2, 3);
      ctx.fillRect(x + w / 2 + 3, y + 11, 2, 2);
    }
  }

  // ---------------------------------------------------------------------------
  // Trastienda (provisional)

  private drawBackroom(state: GameState): void {
    const ctx = this.ctx;
    const own = this.sprites.backgrounds.get('trastienda4');
    const fallback = this.sprites.backgrounds.get('trastienda');
    if (ready(own)) ctx.drawImage(own, 0, 0);
    else if (ready(fallback)) {
      // Provisional: la trastienda de la mesa 1 con la luz roja del salón de la Crupier.
      ctx.drawImage(fallback, 0, 0);
      ctx.fillStyle = 'rgba(80, 10, 20, 0.33)';
      ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
    }
    const hovered = this.hover ? this.trashAt(state, this.hover) : null;
    this.canvas.style.cursor = hovered ? 'pointer' : 'default';
    const drawables: { y: number; draw: () => void }[] = state.cards.work.items.map((item) => ({
      y: item.y,
      draw: () => {
        if (item.id === hovered?.id) {
          ctx.fillStyle = 'rgba(201, 164, 67, 0.35)';
          ctx.beginPath();
          ctx.ellipse(item.x, item.y - 2, 18, 7, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        const own = this.sprites.trash4.get(item.kind);
        const art = ready(own) ? own : this.trash.get(item.kind);
        if (art) ctx.drawImage(art, Math.round(item.x - 16), Math.round(item.y - 32), 32, 32);
      },
    }));
    drawables.push({ y: CONFIG.cards.work.player.y, draw: () => this.drawPlayer() });
    if (this.cleanerShown) {
      const c = this.cleanerShown;
      drawables.push({ y: c.y, draw: () => this.drawCleaner(c) });
    }
    drawables.sort((a, b) => a.y - b.y).forEach((d) => d.draw());
  }

  private drawPlayer(): void {
    const { phase } = this.playerAnim;
    const frame: PlayerFrame = phase === 'lift' ? 'lift' : 'crouch';
    const { player } = CONFIG.cards.work;
    this.drawSprite(this.sprites.player.get(frame), player.x, player.y, 64, 1, phase === 'crouch' ? 2 : 0);
  }

  /** El repartidor: su sprite si existe; si no, el del limpiador de la mesa 1 (provisional). */
  private drawCleaner(c: { x: number; y: number; facing: 1 | -1; walk: number }): void {
    const frame: PlayerFrame = c.walk > 0 && Math.floor(c.walk * 6) % 2 === 1 ? 'walk-2' : 'walk-1';
    const own = this.sprites.cardsDealer.get(frame);
    this.drawSprite(ready(own) ? own : this.sprites.player.get(frame), c.x, c.y, 64, c.facing);
  }

  private drawDoor(rooms: RoomState): void {
    const ctx = this.ctx;
    const d = DOORS4[rooms.current];
    const hovered = this.hover !== null && this.doorAt(this.hover, rooms.current) && !rooms.transition;
    if (rooms.current === 'casino' && !hovered) label(ctx, '◂', d.x + 8, d.y + d.height / 2, 'rgba(201, 164, 67, 0.55)', 14);
    if (!hovered) return;
    ctx.strokeStyle = TEXT;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.strokeRect(d.x + 0.5, d.y + 0.5, d.width - 1, d.height - 1);
    ctx.setLineDash([]);
    label(ctx, d.label, d.x + d.width / 2 + (rooms.current === 'casino' ? 22 : 0), d.y - 6, TEXT, 12);
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
