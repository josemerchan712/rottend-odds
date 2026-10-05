import type { SelectorChip } from '../game/betting';
import { CONFIG } from '../game/config';
import { chainValue, COIN_JACKPOT_CAP, coinChips, maxSeconds, selectedCoinChip } from '../game/coin/game';
import type { CoinChain, CoinFace } from '../game/coin/state';
import { coinLenderPhase, hasImp } from '../game/coin/table';
import { fadeAlpha, type Room, type RoomState } from '../game/rooms';
import type { GameState } from '../game/state';
import { formatNumber } from '../util/format';
import { chipAt } from './casinoLayout';
import { Effects } from './effects';
import { fillPixelText } from './pixelText';
import { SCENE_HEIGHT, SCENE_WIDTH } from './scene';
import { ready, type Sprites } from './sprites';
import { prepareCanvas } from './stage';
import { drawChipColumn } from './tapeteView';

/**
 * La escena de la mesa 5 (doble o nada), en el mismo canvas de 640x360: el despacho del Dueño, él
 * sentado en su trono detrás del escritorio (recortado por la mesa), la moneda que gira sobre el
 * escritorio (se estrecha entre sus dos caras), la cadena como una pila de monedas que crece, el
 * indicador de caras (n/10), el pozo, las segundas oportunidades y los botones impresos en el paño
 * del escritorio: APOSTAR, SEGUIR y RETIRARSE (o SEGUNDA OPORTUNIDAD y ACEPTAR tras una cruz).
 */
const DESK_TOP = 236;
const LENDER = { x: 320, top: 142, size: 96 };
const COIN = { x: 320, y: 222, size: 48 };
export const PANEL = { x: 196, y: 262, width: 248, height: 66 };
const STACK = { x: 404, y: 252 };
export const ZONES5 = {
  bet: { x: PANEL.x + 8, y: PANEL.y + 38, width: 112, height: 20, label: 'APOSTAR [Esp]' },
  more: { x: PANEL.x + 8, y: PANEL.y + 38, width: 112, height: 20, label: 'SEGUIR [Esp]' },
  stop: { x: PANEL.x + 128, y: PANEL.y + 38, width: 112, height: 20, label: 'RETIRARSE [R]' },
  second: { x: PANEL.x + 8, y: PANEL.y + 38, width: 112, height: 20, label: 'OTRA VEZ [S]' },
  accept: { x: PANEL.x + 128, y: PANEL.y + 38, width: 112, height: 20, label: 'ACEPTAR [Esp]' },
};
const IMP_SPOT = { x: 560, y: 334 };
const FLIP_SECONDS = 0.9;
const FLOAT_SECONDS = 1.3;
const TEXT = '#c9a443';
const BAD = '#c0473d';

export type CoinTarget =
  | { kind: 'chip'; chip: SelectorChip; position: number }
  | { kind: 'bet' }
  | { kind: 'more' }
  | { kind: 'stop' }
  | { kind: 'second' }
  | { kind: 'accept' };

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

export class CoinScene {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly effects: Effects;
  private hover: { x: number; y: number } | null = null;
  private room: Room = 'casino';
  private floats: FloatingText[] = [];
  private lenderTime = 0;
  private impBob = 0;
  private chain: CoinChain | null = null;
  /** Lanzamientos de la cadena ya enseñados (caras y cruces + segundas oportunidades). */
  private shownFlips = 0;
  /** Segundos que lleva girando la moneda (null = quieta). */
  private flipAge: number | null = null;
  private face: CoinFace = 'cara';
  private notified = true;
  private seenChains = new WeakSet<CoinChain>();
  onChainShown: ((chain: CoinChain) => void) | null = null;
  onAwayResult: ((chain: CoinChain) => void) | null = null;

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

  reset(state: GameState): void {
    const coin = state.coin;
    this.chain = coin.chain;
    this.shownFlips = coin.chain ? coin.chain.faces.length + coin.chain.seconds : 0;
    this.face = coin.chain?.faces[coin.chain.faces.length - 1] ?? 'cara';
    this.flipAge = null;
    this.notified = true;
    this.floats = [];
    this.seenChains = new WeakSet(coin.recentChains);
  }

  /** ¿Está girando la moneda? (mientras, no se aceptan decisiones) */
  flipping(): boolean {
    return this.room === 'casino' && this.flipAge !== null;
  }

  target(state: GameState, point = this.hover): CoinTarget | null {
    if (!point || this.room !== 'casino') return null;
    const coin = state.coin;
    const chips = coinChips(coin);
    const position = chipAt(point.x, point.y, chips.length);
    if (position !== null) return { kind: 'chip', chip: chips[position], position };
    if (this.flipping()) return null;
    const chain = coin.chain;
    const open = chain !== null && chain.status !== 'fin';
    if (!open) return inside(ZONES5.bet, point) ? { kind: 'bet' } : null;
    if (chain.status === 'decidir') {
      if (inside(ZONES5.more, point)) return { kind: 'more' };
      if (inside(ZONES5.stop, point)) return { kind: 'stop' };
    } else if (chain.status === 'fallo') {
      if (coin.seconds.charges > 0 && inside(ZONES5.second, point)) return { kind: 'second' };
      if (inside(ZONES5.accept, point)) return { kind: 'accept' };
    }
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

  /** Sigue la cadena del jugador (lanzamientos nuevos) y las cadenas del diablillo. */
  private track(state: GameState): void {
    const coin = state.coin;
    for (const c of [...coin.recentChains].reverse()) {
      if (this.seenChains.has(c)) continue;
      this.seenChains.add(c);
      if (c.bettor !== 'ayudante') continue;
      if (this.room === 'casino') {
        this.impBob = 0.3;
        const text = c.jackpot > 0 ? `10 CARAS +${formatNumber(c.jackpot)}` : c.delta > 0 ? `+${formatNumber(c.delta)}` : `−${formatNumber(-c.delta)}`;
        this.addFloat(text, IMP_SPOT.x, IMP_SPOT.y - 70, c.delta >= 0 ? TEXT : BAD);
      } else this.onAwayResult?.(c);
      this.onChainShown?.(c);
    }
    const chain = coin.chain;
    if (chain !== this.chain) {
      this.chain = chain;
      this.shownFlips = 0;
      this.notified = !chain;
    }
    if (!chain) return;
    const flips = chain.faces.length + chain.seconds;
    if (flips > this.shownFlips) {
      this.shownFlips = flips;
      this.flipAge = 0;
      this.face = chain.faces[chain.faces.length - 1] ?? 'cruz';
    }
  }

  private advance(state: GameState, dt: number): void {
    this.effects.update(dt);
    this.lenderTime += dt;
    this.impBob = Math.max(0, this.impBob - dt);
    if (this.flipAge !== null) {
      this.flipAge += dt;
      if (this.flipAge >= FLIP_SECONDS) {
        this.flipAge = null;
        this.onFlipLanded(state);
      }
    }
    for (const f of this.floats) f.age += dt;
    this.floats = this.floats.filter((f) => f.age < FLOAT_SECONDS);
  }

  private onFlipLanded(state: GameState): void {
    const chain = this.chain;
    if (!chain) return;
    if (this.face === 'cara' && chain.status !== 'fin') this.addFloat(`CARA ×${2 ** chain.wins}`, COIN.x, COIN.y - 30);
    if (this.face === 'cruz' && chain.status === 'fallo') this.addFloat('CRUZ', COIN.x, COIN.y - 30, BAD);
    if (chain.status === 'fin' && !this.notified) {
      this.notified = true;
      const text =
        chain.result === 'cadena'
          ? `10 CARAS · POZO +${formatNumber(chain.jackpot)}`
          : chain.result === 'retirado'
            ? `+${formatNumber(chain.delta)}`
            : `−${formatNumber(chain.stake)}`;
      this.addFloat(text, COIN.x, COIN.y - 34, chain.result === 'perdido' ? BAD : TEXT);
      if (chain.result === 'perdido' && chain.wins > 0 && chainValue(chain.stake, chain.wins) >= (state.coin.balance + chain.stake) * 0.25) this.effects.shake();
      this.onChainShown?.(chain);
    }
  }

  /** Se ha retirado (o aceptado) sin lanzar: el resultado se enseña ya. */
  notifyResolved(): void {
    const chain = this.chain;
    if (!chain || chain.status !== 'fin' || this.notified) return;
    this.notified = true;
    const text = chain.result === 'perdido' ? `−${formatNumber(chain.stake)}` : `+${formatNumber(chain.delta)}`;
    this.addFloat(text, COIN.x, COIN.y - 34, chain.result === 'perdido' ? BAD : TEXT);
    this.onChainShown?.(chain);
  }

  // ---------------------------------------------------------------------------
  // Sala

  private drawHall(state: GameState): void {
    const ctx = this.ctx;
    const bg = this.sprites.backgrounds.get('mesa5');
    if (ready(bg)) ctx.drawImage(bg, 0, 0);
    else {
      ctx.fillStyle = '#120d0a';
      ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
    }
    this.drawLender(state);
    const coin = state.coin;
    const hit = this.target(state);
    this.drawStack(state);
    this.drawCoin();
    this.drawPanel(state, hit);
    drawChipColumn(ctx, coinChips(coin), selectedCoinChip(coin).index, this.sprites, hit?.kind === 'chip' ? hit.position : null);
    if (hasImp(coin)) this.drawSprite(this.sprites.helpers.get('imp'), IMP_SPOT.x, IMP_SPOT.y + (this.impBob > 0 ? -2 : 0), 64);
    this.canvas.style.cursor = hit ? 'pointer' : 'default';
  }

  /** El Dueño, en su trono detrás del escritorio (el escritorio lo tapa de cintura para abajo). */
  private drawLender(state: GameState): void {
    const ctx = this.ctx;
    const img = this.sprites.lender5Scene.get(coinLenderPhase(state.coin));
    if (!ready(img)) return;
    const breath = Math.round(Math.sin(this.lenderTime * 0.9));
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, SCENE_WIDTH, DESK_TOP);
    ctx.clip();
    ctx.drawImage(img, Math.round(LENDER.x - LENDER.size / 2), LENDER.top + breath, LENDER.size, LENDER.size);
    ctx.restore();
  }

  /** La moneda: quieta enseña su última cara; al lanzarla sube, gira (se estrecha entre caras) y cae. */
  private drawCoin(): void {
    const ctx = this.ctx;
    let width = 1;
    let lift = 0;
    let face: CoinFace = this.face;
    if (this.flipAge !== null) {
      const t = this.flipAge / FLIP_SECONDS;
      const turns = 5.5; // medias vueltas; acaba en la cara del resultado
      const angle = t * turns * Math.PI;
      width = Math.abs(Math.cos(angle));
      lift = Math.round(Math.sin(t * Math.PI) * 34);
      const halfTurns = Math.floor(t * turns + 0.5);
      const other: CoinFace = this.face === 'cara' ? 'cruz' : 'cara';
      face = (Math.ceil(turns) - halfTurns) % 2 === 0 ? this.face : other;
    }
    const img = this.sprites.coin.get(face);
    const w = Math.max(2, Math.round(COIN.size * width));
    const x = Math.round(COIN.x - w / 2);
    const y = Math.round(COIN.y - COIN.size / 2 - lift);
    // Sombra en el escritorio.
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(COIN.x - Math.round(18 * (1 - lift / 60)), COIN.y + COIN.size / 2 - 2, Math.round(36 * (1 - lift / 60)), 3);
    if (ready(img)) ctx.drawImage(img, x, y, w, COIN.size);
    else {
      ctx.fillStyle = face === 'cara' ? '#c9a443' : '#8a6a2a';
      ctx.fillRect(x, y, w, COIN.size);
    }
  }

  /** La cadena como una pila de monedas que crece con cada cara. */
  private drawStack(state: GameState): void {
    const chain = this.chain;
    const ctx = this.ctx;
    if (!chain || chain.status === 'fin' || this.flipping()) return;
    const coins = Math.min(chain.wins * 2 + 1, 21);
    for (let i = 0; i < coins; i++) {
      const y = STACK.y - i * 3;
      ctx.fillStyle = '#3a2a10';
      ctx.fillRect(STACK.x - 9, y, 18, 3);
      ctx.fillStyle = i % 2 ? '#c9a443' : '#a8841f';
      ctx.fillRect(STACK.x - 8, y, 16, 2);
    }
    if (chain.wins > 0) label(ctx, formatNumber(chainValue(chain.stake, chain.wins)), STACK.x, STACK.y - coins * 3 - 8, '#f0d27a', 10);
    void state;
  }

  private drawPanel(state: GameState, hit: CoinTarget | null): void {
    const ctx = this.ctx;
    const coin = state.coin;
    const p = PANEL;
    ctx.fillStyle = '#0b0908';
    ctx.fillRect(p.x - 2, p.y - 2, p.width + 4, p.height + 4);
    ctx.fillStyle = '#6b5428';
    ctx.fillRect(p.x - 1, p.y - 1, p.width + 2, p.height + 2);
    ctx.fillStyle = '#2a1414';
    ctx.fillRect(p.x, p.y, p.width, p.height);

    const chain = this.chain;
    const open = chain !== null && chain.status !== 'fin';
    const wins = open || this.flipping() ? (chain?.wins ?? 0) : 0;
    // Indicador de la cadena: 10 casillas.
    const max = CONFIG.coin.chain.maxWins;
    for (let i = 0; i < max; i++) {
      const x = p.x + 8 + i * 13;
      ctx.fillStyle = '#0b0908';
      ctx.fillRect(x, p.y + 7, 11, 9);
      ctx.fillStyle = i < wins && !this.flipping() ? '#d4ad48' : i < wins ? '#8a6a2a' : '#3a2a1e';
      ctx.fillRect(x + 1, p.y + 8, 9, 7);
    }
    label(ctx, `${wins}/${max}`, p.x + 8 + max * 13 + 4, p.y + 12, '#e3dcc6', 10, 'left');
    label(ctx, `POZO ${formatNumber(Math.min(coin.pot, COIN_JACKPOT_CAP))}`, p.x + p.width - 6, p.y + 12, wins >= 7 ? '#f0d27a' : '#8f8670', 9, 'right');
    // En juego y segundas oportunidades.
    const stakeText = open && chain ? `EN JUEGO ${formatNumber(chainValue(chain.stake, chain.wins))}` : `APUESTA ${formatNumber(selectedCoinChip(coin).amount)}`;
    label(ctx, stakeText, p.x + 8, p.y + 27, '#e3dcc6', 10, 'left');
    label(ctx, 'OTRA VEZ', p.x + 150, p.y + 27, '#8f8670', 9, 'left');
    const seconds = maxSeconds(coin.upgrades.luck);
    for (let i = 0; i < seconds; i++) {
      ctx.fillStyle = i < coin.seconds.charges ? '#c9a443' : '#3a2f1e';
      ctx.fillRect(p.x + 192 + i * 7, p.y + 25, 5, 5);
    }

    const busy = this.flipping();
    const zone = (z: (typeof ZONES5)[keyof typeof ZONES5], active: boolean, hovered: boolean) => {
      ctx.strokeStyle = active ? (hovered ? '#f0d27a' : '#d4ad48') : 'rgba(212, 173, 72, 0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(z.x + 0.5, z.y + 0.5, z.width - 1, z.height - 1);
      if (hovered) {
        ctx.fillStyle = 'rgba(212, 173, 72, 0.15)';
        ctx.fillRect(z.x + 1, z.y + 1, z.width - 2, z.height - 2);
      }
      label(ctx, z.label, z.x + z.width / 2, z.y + z.height / 2, active ? (hovered ? '#f0d27a' : '#d4ad48') : 'rgba(212, 173, 72, 0.35)', 11);
    };
    if (!open) {
      zone(ZONES5.bet, !busy, hit?.kind === 'bet');
      zone(ZONES5.stop, false, false);
    } else if (chain!.status === 'decidir') {
      zone(ZONES5.more, !busy, hit?.kind === 'more');
      zone(ZONES5.stop, !busy, hit?.kind === 'stop');
    } else {
      zone(ZONES5.second, !busy && coin.seconds.charges > 0, hit?.kind === 'second');
      zone(ZONES5.accept, !busy, hit?.kind === 'accept');
    }
  }

  private drawFloats(): void {
    const ctx = this.ctx;
    ctx.font = '12px VT323, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (const f of this.floats) {
      const fx = Math.round(f.x);
      const fy = Math.round(f.y - f.age * 18);
      ctx.globalAlpha = Math.max(0, 1 - f.age / FLOAT_SECONDS);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      fillPixelText(ctx, f.text, fx + 1, fy + 1);
      ctx.fillStyle = f.color;
      fillPixelText(ctx, f.text, fx, fy);
    }
    ctx.globalAlpha = 1;
  }

  private drawSprite(img: HTMLImageElement | undefined, x: number, y: number, size: number): void {
    if (!ready(img)) return;
    this.ctx.drawImage(img, Math.round(x - size / 2), Math.round(y - size), size, size);
  }
}

function label(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, color: string, size = 11, align: CanvasTextAlign = 'center'): void {
  ctx.font = `${size}px VT323, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  fillPixelText(ctx, value, x + 1, y + 1.5);
  ctx.fillStyle = color;
  fillPixelText(ctx, value, x, y + 0.5);
}
