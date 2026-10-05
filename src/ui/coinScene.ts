import type { SelectorChip } from '../game/betting';
import { CONFIG, HEIRLOOM_IDS, type CoinKind, type HeirloomId } from '../game/config';
import { COIN_JACKPOT_CAP, coinChips, heirloomCharges, loadedUnlocked, markedFace, selectedCoinChip } from '../game/coin/game';
import type { CoinChain, CoinFace } from '../game/coin/state';
import { coinLenderPhase, hasImp } from '../game/coin/table';
import { fadeAlpha, type Room, type RoomState } from '../game/rooms';
import type { GameState } from '../game/state';
import { formatNumber } from '../util/format';
import { chipAt } from './casinoLayout';
import { Effects } from './effects';
import { drawButton, drawFloatTexts, drawText } from './sceneText';
import { SCENE_HEIGHT, SCENE_WIDTH } from './scene';
import { ready, type Sprites } from './sprites';
import { prepareCanvas } from './stage';
import { drawChipColumn } from './tapeteView';
import { NetAggregator, netText } from './helperMeter';

/**
 * La escena de la mesa 5 (doble o nada), en el mismo canvas de 640x360: el despacho del Dueño, él
 * sentado en su trono detrás del escritorio (recortado por la mesa), la moneda que gira sobre el
 * escritorio (se estrecha entre sus dos caras), los montones del escritorio que representan la
 * cadena (crecen con cada cara; el Dueño empuja monedas hacia el jugador al ganar y las barre al
 * fallar), el paño con la cadena (n/10), el pozo, la moneda elegida (justa o cargada), las herencias
 * con sus cargas y los botones: APOSTAR, SEGUIR y RETIRARSE (o ACEPTAR tras una cruz).
 */
const DESK_TOP = 236;
const LENDER = { x: 320, top: 142, size: 96 };
const COIN = { x: 320, y: 220, size: 44 };
export const PANEL = { x: 190, y: 250, width: 262, height: 104 };
/** Montón de la cadena (delante del jugador) y de la casa (delante del Dueño). */
const PILE = { x: 400, y: 246 };
const HOUSE_PILE = { x: 250, y: 238 };
const ROW = { chain: PANEL.y + 11, stake: PANEL.y + 30, tools: PANEL.y + 42, main: PANEL.y + 74 };
export const ZONES5 = {
  bet: { x: PANEL.x + 8, y: ROW.main, width: 120, height: 22, label: 'APOSTAR [Esp]' },
  more: { x: PANEL.x + 8, y: ROW.main, width: 120, height: 22, label: 'SEGUIR [Esp]' },
  stop: { x: PANEL.x + 134, y: ROW.main, width: 120, height: 22, label: 'RETIRARSE [R]' },
  accept: { x: PANEL.x + 134, y: ROW.main, width: 120, height: 22, label: 'ACEPTAR [Esp]' },
};
/** Selector de moneda (Q): justa ×2 y cargada ×3. */
export const COIN_TOGGLE: Record<CoinKind, { x: number; y: number; width: number; height: number; label: string }> = {
  justa: { x: PANEL.x + 132, y: ROW.stake - 9, width: 60, height: 18, label: 'JUSTA ×2' },
  cargada: { x: PANEL.x + 194, y: ROW.stake - 9, width: 62, height: 18, label: 'CARGADA ×3' },
};
/** Botones de las herencias, con su tecla. */
const TOOL_LABEL: Record<HeirloomId, string> = { zero: 'CERO', hold: 'RETENER', reroll: 'RELANZAR', mark: 'MARCAR' };
export function toolRect(i: number) {
  return { x: PANEL.x + 6 + i * 63, y: ROW.tools, width: 60, height: 26 };
}
const IMP_SPOT = { x: 560, y: 334 };
const FLIP_SECONDS = 0.9;
const SLIDE_SECONDS = 0.45;
const FLOAT_SECONDS = 1.3;
const TEXT = '#c9a443';
const BAD = '#c0473d';

export type CoinTarget =
  | { kind: 'chip'; chip: SelectorChip; position: number }
  | { kind: 'bet' }
  | { kind: 'more' }
  | { kind: 'stop' }
  | { kind: 'accept' }
  | { kind: 'coin'; coin: CoinKind }
  | { kind: 'tool'; tool: HeirloomId };

interface FloatingText {
  text: string;
  x: number;
  y: number;
  age: number;
  color: string;
}

/** Monedas que se deslizan por el escritorio (el Dueño empuja o barre). */
interface Slide {
  from: { x: number; y: number };
  to: { x: number; y: number };
  count: number;
  age: number;
  fade: boolean;
}

function inside(r: { x: number; y: number; width: number; height: number }, p: { x: number; y: number }): boolean {
  return p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;
}

/** ¿Se puede usar esa herencia ahora mismo en esa cadena? */
export function toolUsable(chain: CoinChain | null, tool: HeirloomId): boolean {
  if (!chain || chain.status === 'fin' || chain.charges[tool] <= 0) return false;
  if (tool === 'zero' || tool === 'reroll') return chain.status === 'fallo';
  if (tool === 'hold') return chain.status === 'decidir' && !chain.holdArmed;
  return chain.status === 'decidir' && chain.mark === null;
}

export class CoinScene {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly effects: Effects;
  private hover: { x: number; y: number } | null = null;
  private room: Room = 'casino';
  private floats: FloatingText[] = [];
  /** Resultados del ayudante agregados unos segundos (un solo aviso con el neto). */
  private readonly helperNet = new NetAggregator();
  private lenderTime = 0;
  private impBob = 0;
  private chain: CoinChain | null = null;
  /** Lanzamientos de la cadena ya enseñados (caras y cruces + relanzamientos). */
  private shownFlips = 0;
  /** Segundos que lleva girando la moneda (null = quieta). */
  private flipAge: number | null = null;
  private face: CoinFace = 'cara';
  private notified = true;
  private seenChains = new WeakSet<CoinChain>();
  /** Monedas del montón de la cadena que se ven (sigue a las caras, con la animación). */
  private pileShown = 0;
  private slides: Slide[] = [];
  /** El Dueño se inclina al empujar o barrer (segundos que quedan del gesto). */
  private gesture = 0;
  onChainShown: ((chain: CoinChain) => void) | null = null;
  /** La cadena del jugador llega a una cara nueva (para los hitos 3, 6 y 9 del Dueño). */
  onChainStep: ((wins: number) => void) | null = null;
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
    this.shownFlips = coin.chain ? coin.chain.faces.length + coin.chain.used.reroll : 0;
    this.face = coin.chain?.faces[coin.chain.faces.length - 1] ?? 'cara';
    this.flipAge = null;
    this.notified = true;
    this.floats = [];
    this.slides = [];
    this.pileShown = coin.chain && coin.chain.status !== 'fin' ? pileFor(coin.chain.wins) : 0;
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
    for (const kind of ['justa', 'cargada'] as const) if (inside(COIN_TOGGLE[kind], point)) return { kind: 'coin', coin: kind };
    if (this.flipping()) return null;
    const chain = coin.chain;
    const open = chain !== null && chain.status !== 'fin';
    for (let i = 0; i < HEIRLOOM_IDS.length; i++) if (inside(toolRect(i), point)) return { kind: 'tool', tool: HEIRLOOM_IDS[i] };
    if (!open) return inside(ZONES5.bet, point) ? { kind: 'bet' } : null;
    if (chain.status === 'decidir') {
      if (inside(ZONES5.more, point)) return { kind: 'more' };
      if (inside(ZONES5.stop, point)) return { kind: 'stop' };
    } else if (chain.status === 'fallo' && inside(ZONES5.accept, point)) return { kind: 'accept' };
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
        if (c.jackpot > 0) this.addFloat(`10 CARAS +${formatNumber(c.jackpot)}`, IMP_SPOT.x, IMP_SPOT.y - 70, TEXT);
        else this.helperNet.add(c.delta);
      } else this.onAwayResult?.(c);
      this.onChainShown?.(c);
    }
    const chain = coin.chain;
    if (chain !== this.chain) {
      this.chain = chain;
      this.shownFlips = 0;
      this.notified = !chain;
      this.pileShown = 0;
    }
    if (!chain) return;
    const flips = chain.faces.length + chain.used.reroll;
    if (flips > this.shownFlips) {
      this.shownFlips = flips;
      this.flipAge = 0;
      this.face = chain.faces[chain.faces.length - 1] ?? 'cruz';
    }
    // Cobrada sin lanzar (retirarse, cero dorado, aceptar la cruz): el montón se va ya.
    if (chain.status === 'fin' && this.flipAge === null && !this.notified) this.finish(state);
  }

  private advance(state: GameState, dt: number): void {
    this.effects.update(dt);
    const helperNet = this.helperNet.tick(dt);
    if (helperNet) this.addFloat(netText(helperNet.net, helperNet.count), IMP_SPOT.x, IMP_SPOT.y - 70, helperNet.net >= 0 ? TEXT : BAD);
    this.lenderTime += dt;
    this.impBob = Math.max(0, this.impBob - dt);
    this.gesture = Math.max(0, this.gesture - dt);
    for (const s of this.slides) s.age += dt;
    this.slides = this.slides.filter((s) => s.age < SLIDE_SECONDS);
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
    if (this.face === 'cara') {
      // El Dueño empuja monedas de su montón al de la cadena.
      const target = pileFor(chain.wins);
      this.slides.push({ from: HOUSE_PILE, to: PILE, count: Math.max(target - this.pileShown, 1), age: 0, fade: false });
      this.pileShown = target;
      this.gesture = SLIDE_SECONDS;
      if (chain.status !== 'fin') this.addFloat(`CARA ×${chain.coins[chain.coins.length - 1] === 'cargada' ? 3 : 2}`, COIN.x, COIN.y - 30);
      if (chain.bettor === 'jugador') this.onChainStep?.(chain.wins);
    } else if (chain.status === 'fallo') this.addFloat('CRUZ', COIN.x, COIN.y - 30, BAD);
    if (chain.status === 'fin') this.finish(state);
  }

  /** La cadena se ha resuelto: el montón va al jugador (cobra) o vuelve al Dueño (pierde). */
  private finish(state: GameState): void {
    const chain = this.chain;
    if (!chain || this.notified) return;
    this.notified = true;
    const won = chain.result === 'retirado' || chain.result === 'cadena' || chain.result === 'salvado';
    if (this.pileShown > 0) {
      // Cobrar: el montón baja hacia el jugador. Perder: el Dueño lo barre hacia su lado.
      this.slides.push({ from: PILE, to: won ? { x: PILE.x, y: PILE.y + 70 } : HOUSE_PILE, count: this.pileShown, age: 0, fade: true });
      this.gesture = SLIDE_SECONDS;
    }
    this.pileShown = 0;
    const text =
      chain.result === 'cadena'
        ? `10 CARAS · POZO +${formatNumber(chain.jackpot)}`
        : chain.result === 'salvado'
          ? `CERO DORADO ${chain.delta >= 0 ? '+' : '−'}${formatNumber(Math.abs(chain.delta))}`
          : won
            ? `+${formatNumber(chain.delta)}`
            : `−${formatNumber(chain.stake)}`;
    this.addFloat(text, COIN.x, COIN.y - 34, won ? TEXT : BAD);
    if (chain.result === 'perdido' && chain.wins > 0 && chain.value >= (state.coin.balance + chain.stake) * 0.25) this.effects.shake();
    this.onChainShown?.(chain);
  }

  /** Compatibilidad: retirarse o aceptar sin lanzar se enseñan en el siguiente fotograma (track). */
  notifyResolved(): void {}

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
    this.drawPiles();
    this.drawCoin(state);
    this.drawPanel(state, hit);
    drawChipColumn(ctx, coinChips(coin), selectedCoinChip(coin).index, this.sprites, hit?.kind === 'chip' ? hit.position : null);
    if (hasImp(coin)) this.drawSprite(this.sprites.helpers.get('imp'), IMP_SPOT.x, IMP_SPOT.y + (this.impBob > 0 ? -2 : 0), 64);
    this.canvas.style.cursor = hit ? 'pointer' : 'default';
  }

  /** El Dueño, en su trono detrás del escritorio; se inclina un poco al empujar o barrer monedas. */
  private drawLender(state: GameState): void {
    const ctx = this.ctx;
    const img = this.sprites.lender5Scene.get(coinLenderPhase(state.coin));
    if (!ready(img)) return;
    const breath = Math.round(Math.sin(this.lenderTime * 0.9));
    const lean = this.gesture > 0 ? Math.round(Math.sin((this.gesture / SLIDE_SECONDS) * Math.PI) * 4) : 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, SCENE_WIDTH, DESK_TOP);
    ctx.clip();
    ctx.drawImage(img, Math.round(LENDER.x - LENDER.size / 2), LENDER.top + breath + lean, LENDER.size, LENDER.size);
    ctx.restore();
  }

  /** Una moneda pequeña del escritorio (el sprite de la cara, a 10 px). */
  private drawSmallCoin(x: number, y: number, alpha = 1): void {
    const ctx = this.ctx;
    const img = this.sprites.coin.get('cara');
    ctx.globalAlpha = alpha;
    if (ready(img)) ctx.drawImage(img, Math.round(x - 5), Math.round(y - 3), 10, 6);
    else {
      ctx.fillStyle = '#c9a443';
      ctx.fillRect(Math.round(x - 5), Math.round(y - 3), 10, 6);
    }
    ctx.globalAlpha = 1;
  }

  /** El montón de la cadena (crece con cada cara) y las monedas que se deslizan. */
  private drawPiles(): void {
    const settling = this.slides.some((s) => !s.fade);
    const shown = settling ? Math.max(0, this.pileShown - this.slides.filter((s) => !s.fade).reduce((t, s) => t + s.count, 0)) : this.pileShown;
    for (let i = 0; i < shown; i++) this.drawSmallCoin(PILE.x + ((i % 3) - 1) * 6, PILE.y - Math.floor(i / 3) * 3);
    for (const s of this.slides) {
      const k = Math.min(s.age / SLIDE_SECONDS, 1);
      const ease = 1 - (1 - k) ** 2;
      for (let i = 0; i < Math.min(s.count, 12); i++) {
        const x = s.from.x + (s.to.x - s.from.x) * ease + ((i % 3) - 1) * 6;
        const y = s.from.y + (s.to.y - s.from.y) * ease - Math.floor(i / 3) * 3 - Math.sin(k * Math.PI) * 6;
        this.drawSmallCoin(x, y, s.fade ? 1 - k : 1);
      }
    }
    if (this.chain && this.chain.status !== 'fin' && this.chain.wins > 0 && !this.flipping())
      drawText(this.ctx, 'value', formatNumber(this.chain.value), PILE.x, PILE.y - Math.ceil(this.pileShown / 3) * 3 - 12);
  }

  /** La moneda: quieta enseña su última cara; al lanzarla sube, gira (se estrecha entre caras) y cae. */
  private drawCoin(state: GameState): void {
    const ctx = this.ctx;
    let width = 1;
    let lift = 0;
    let face: CoinFace = this.face;
    if (this.flipAge !== null) {
      const t = this.flipAge / FLIP_SECONDS;
      const turns = 5.5; // medias vueltas; acaba en la cara del resultado
      const angle = t * turns * Math.PI;
      width = Math.abs(Math.cos(angle));
      lift = Math.round(Math.sin(t * Math.PI) * 30);
      const halfTurns = Math.floor(t * turns + 0.5);
      const other: CoinFace = this.face === 'cara' ? 'cruz' : 'cara';
      face = (Math.ceil(turns) - halfTurns) % 2 === 0 ? this.face : other;
    }
    const img = this.sprites.coin.get(face);
    const w = Math.max(2, Math.round(COIN.size * width));
    const x = Math.round(COIN.x - w / 2);
    const y = Math.round(COIN.y - COIN.size / 2 - lift);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(COIN.x - Math.round(16 * (1 - lift / 60)), COIN.y + COIN.size / 2 - 2, Math.round(32 * (1 - lift / 60)), 3);
    if (ready(img)) ctx.drawImage(img, x, y, w, COIN.size);
    else {
      ctx.fillStyle = face === 'cara' ? '#c9a443' : '#8a6a2a';
      ctx.fillRect(x, y, w, COIN.size);
    }
    // Marcar: el siguiente lanzamiento ya se ve.
    const chain = this.chain;
    if (chain && chain.status === 'decidir' && chain.mark !== null && !this.flipping()) {
      const next = markedFace(state.coin, chain);
      drawText(ctx, next === 'cara' ? 'value' : 'danger', `MARCADA: ${next === 'cara' ? 'CARA' : 'CRUZ'}`, COIN.x, COIN.y - COIN.size / 2 - 12);
    } else if (chain && chain.status === 'decidir' && chain.holdArmed && !this.flipping())
      drawText(ctx, 'value', 'RETENIDA', COIN.x, COIN.y - COIN.size / 2 - 12);
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
    // Fila 1: la cadena (10 casillas, las de la cargada en rojo), n/10 y el pozo.
    const max = CONFIG.coin.chain.maxWins;
    for (let i = 0; i < max; i++) {
      const x = p.x + 8 + i * 12;
      ctx.fillStyle = '#0b0908';
      ctx.fillRect(x, ROW.chain - 5, 10, 10);
      const kind = chain?.coins.filter((_, j) => chain.faces[j] === 'cara')[i];
      ctx.fillStyle = i < wins ? (kind === 'cargada' ? '#c0473d' : '#d4ad48') : '#3a2a1e';
      if (i < wins && this.flipping() && i === wins - 1) ctx.fillStyle = '#8a6a2a';
      ctx.fillRect(x + 1, ROW.chain - 4, 8, 8);
    }
    drawText(ctx, 'label', `${wins}/${max}`, p.x + 8 + max * 12 + 4, ROW.chain + 1, 'left');
    drawText(ctx, wins >= 7 ? 'value' : 'muted', `POZO ${formatNumber(Math.min(coin.pot, COIN_JACKPOT_CAP))}`, p.x + p.width - 6, ROW.chain + 1, 'right');
    // Fila 2: en juego / apuesta, y la moneda elegida.
    const stakeText = open && chain ? `EN JUEGO ${formatNumber(chain.value)}` : `APUESTA ${formatNumber(selectedCoinChip(coin).amount)}`;
    drawText(ctx, 'label', stakeText, p.x + 8, ROW.stake + 1, 'left');
    for (const kind of ['justa', 'cargada'] as const) {
      const r = COIN_TOGGLE[kind];
      const locked = kind === 'cargada' && !loadedUnlocked(coin);
      const label = locked ? 'CARGADA –' : r.label;
      drawButton(ctx, r, label, locked ? 'disabled' : coin.coinChoice === kind ? 'hover' : hit?.kind === 'coin' && hit.coin === kind ? 'active' : 'disabled');
    }
    // Fila 3: las herencias (nombre y cargas que le quedan a la cadena, o las que tendrá).
    HEIRLOOM_IDS.forEach((tool, i) => {
      const r = toolRect(i);
      const charges = open && chain ? chain.charges[tool] : heirloomCharges(coin, tool);
      const owned = heirloomCharges(coin, tool) > 0;
      const usable = toolUsable(chain, tool) && !this.flipping();
      const state = !owned || !usable ? 'disabled' : hit?.kind === 'tool' && hit.tool === tool ? 'hover' : 'active';
      drawButton(ctx, { ...r, height: 14 }, TOOL_LABEL[tool], state);
      drawText(ctx, owned ? 'muted' : 'locked', owned ? `${charges} [${CONFIG.coin.heirlooms[tool].key}]` : '—', r.x + r.width / 2, r.y + 21);
    });
    // Fila 4: los botones principales.
    const busy = this.flipping();
    const zone = (z: (typeof ZONES5)[keyof typeof ZONES5], active: boolean, hovered: boolean) =>
      drawButton(ctx, z, z.label, !active ? 'disabled' : hovered ? 'hover' : 'active');
    if (!open) {
      zone(ZONES5.bet, !busy, hit?.kind === 'bet');
      zone(ZONES5.stop, false, false);
    } else if (chain!.status === 'decidir') {
      zone(ZONES5.more, !busy, hit?.kind === 'more');
      zone(ZONES5.stop, !busy, hit?.kind === 'stop');
    } else {
      zone(ZONES5.more, false, false);
      zone(ZONES5.accept, !busy, hit?.kind === 'accept');
    }
  }

  private drawFloats(): void {
    drawFloatTexts(this.ctx, this.floats, FLOAT_SECONDS);
  }

  private drawSprite(img: HTMLImageElement | undefined, x: number, y: number, size: number): void {
    if (!ready(img)) return;
    this.ctx.drawImage(img, Math.round(x - size / 2), Math.round(y - size), size, size);
  }
}

/** Monedas del montón de la cadena según sus caras: crece más deprisa al principio. */
function pileFor(wins: number): number {
  return Math.min(wins * 3, 30);
}
