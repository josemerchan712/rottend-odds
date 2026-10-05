import { CONFIG } from '../game/config';
import { lenderPhase } from '../game/lender';
import { fadeAlpha, type Room, type RoomState } from '../game/rooms';
import type { GameState, SpinResult } from '../game/state';
import { itemAt, type Collected } from '../game/work';
import { formatNumber } from '../util/format';
import { Effects } from './effects';
import { RouletteView } from './rouletteView';
import { ready, type PlayerFrame, type Sprites } from './sprites';
import { ARM_SPOT, chipAt, LENDER_SIZE, LENDER_SPOT, WHEEL_CENTER, zoneAt, type Zone } from './casinoLayout';
import { drawChips, drawStrip, drawTapete } from './tapeteView';
import { isBetTypeUnlocked, stateChips, type SelectorChip } from '../game/betting';
import { drawFloatTexts, drawText } from './sceneText';
import { prepareCanvas } from './stage';

/** Resolución interna de la escena (sección 8 del diseño). */
export const SCENE_WIDTH = 640;
export const SCENE_HEIGHT = 360;

const TRASH_SIZE = 32;
const PLAYER_SIZE = 64;
const CROUCH_SECONDS = 0.14;
const LIFT_SECONDS = 0.3;
const FLOAT_SECONDS = 1.1;
const CLEANER_SPEED = 220; // px/s en la escena
const ARM_REACH_SECONDS = 0.25;
/** Segundos que el Encargado mira hacia la rueda tras una tirada. */
const LOOK_SECONDS = 1.6;
/** Fracción superior del sprite que se desplaza al "girar la cabeza". */
const HEAD_FRACTION = 0.56;
/** Una apuesta perdida es "grande" (tiembla la pantalla) si se jugó al menos esta fracción del saldo. */
const BIG_LOSS_FRACTION = 0.25;

/**
 * Puertas entre salas: el hueco oscuro de la izquierda del casino y la puerta metálica de la
 * izquierda de la trastienda (solo su parte alta, para no chocar con el jugador, que está delante).
 */
export const DOORS: Record<Room, { x: number; y: number; width: number; height: number; label: string }> = {
  casino: { x: 30, y: 88, width: 62, height: 168, label: 'TRASTIENDA' },
  trastienda: { x: 44, y: 28, width: 88, height: 222, label: 'CASINO' },
};

/** Lo que hay bajo el ratón en el casino (para el tooltip y el clic). */
export type CasinoTarget =
  | { kind: 'zone'; zone: Zone; locked: boolean }
  | { kind: 'chip'; chip: SelectorChip; position: number };

const COLORS = {
  wall: '#100e0b',
  floor: '#221d16',
  hover: 'rgba(201, 164, 67, 0.35)',
  text: '#c9a443',
  shadow: 'rgba(0, 0, 0, 0.55)',
  frameEdge: '#3a2f1e',
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
  /** Reloj de la respiración del Encargado y giro de cabeza hacia la rueda tras una tirada. */
  private lenderTime = 0;
  private lenderLook = 0;
  private seenBets: number | null = null;
  /** Número de la última apuesta cuyo resultado ya se ha mostrado. */
  revealedBets = 0;
  /** Tiradas del ayudante mientras el jugador no está en el casino (para el aviso del HUD). */
  onAwayResult: ((spin: SpinResult) => void) | null = null;
  /** Cada tirada en cuanto el jugador la ve resolverse (cae la bola, o el aviso fuera del casino). */
  onSpinShown: ((spin: SpinResult) => void) | null = null;
  private room: Room = 'casino';

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly sprites: Sprites,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.effects = new Effects();
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

  get hoverPoint(): { x: number; y: number } | null {
    return this.hover;
  }

  /** ¿Hay una puerta en ese punto de la sala actual? */
  doorAt(point: { x: number; y: number }, room: Room): boolean {
    const d = DOORS[room];
    return point.x >= d.x && point.x <= d.x + d.width && point.y >= d.y && point.y <= d.y + d.height;
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

  render(state: GameState, dt: number, rooms: RoomState): void {
    this.room = rooms.current;
    this.trackSpins(state);
    this.advance(state, dt);
    const ctx = this.ctx;
    prepareCanvas(this.canvas, ctx);

    const shake = this.effects.shakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);
    if (rooms.current === 'casino') this.drawCasino(state);
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

  /** Sala del casino: ruleta, mesa, fichas, brazo del crupier y Encargado. Sin basura. */
  private drawCasino(state: GameState): void {
    const ctx = this.ctx;
    this.drawBackground();
    this.effects.drawLamps(ctx);
    const version = state.debtPaid ? 'broken' : 'healthy';
    this.roulette.draw(ctx, this.sprites.roulette.get(version), version, WHEEL_CENTER.x, WHEEL_CENTER.y);
    drawStrip(ctx, this.shownSpins(state));
    this.drawLender(state);
    const target = this.casinoTarget(state);
    drawTapete(ctx, state, target?.kind === 'zone' ? target.zone : null);
    drawChips(ctx, state, this.sprites, target?.kind === 'chip' ? target.position : null);
    if (state.upgrades.crupier > 0) {
      // El brazo mecánico del crupier, junto a la mesa; se estira un poco cuando apuesta.
      const reach = Math.round((this.armReach / ARM_REACH_SECONDS) * 4);
      this.drawSprite(this.sprites.helpers.get('arm'), ARM_SPOT.x - reach, ARM_SPOT.y, PLAYER_SIZE, -1);
    }
    this.canvas.style.cursor = target && !(target.kind === 'zone' && target.locked) ? 'pointer' : 'default';
  }

  /** Tiradas cuya bola ya ha caído (la tira de resultados no adelanta el resultado). */
  /** ¿Hay una tirada girando a la vista? */
  spinInFlight(state: GameState): boolean {
    return this.room === 'casino' && this.revealedBets < state.stats.bets;
  }

  shownSpins(state: GameState): SpinResult[] {
    return state.recentSpins.filter((_, i) => state.stats.bets - i <= this.revealedBets);
  }

  /** Zona del tapete o ficha bajo el ratón (solo en el casino). */
  casinoTarget(state: GameState, point = this.hover): CasinoTarget | null {
    if (!point || this.room !== 'casino') return null;
    const chips = stateChips(state);
    const position = chipAt(point.x, point.y, chips.length);
    if (position !== null) return { kind: 'chip', chip: chips[position], position };
    const zone = zoneAt(point.x, point.y);
    if (zone) return { kind: 'zone', zone, locked: !isBetTypeUnlocked(state, zone.type) };
    return null;
  }

  /** Trastienda: el jugador, la basura y el ayudante de limpieza. */
  private drawBackroom(state: GameState): void {
    const ctx = this.ctx;
    this.drawBackroomBackground();
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
  }

  /** Fondo de la trastienda (assets/raw/trastienda.*); si faltara, el del casino reflejado y oscurecido. */
  private drawBackroomBackground(): void {
    const ctx = this.ctx;
    const own = this.sprites.backgrounds.get('trastienda');
    if (ready(own)) {
      ctx.drawImage(own, 0, 0);
      return;
    }
    const bg = this.sprites.backgrounds.get('mesa1');
    if (ready(bg)) {
      // Reflejado: la puerta por la que se ha entrado queda a la derecha.
      ctx.save();
      ctx.translate(SCENE_WIDTH, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(bg, 0, 0);
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(4, 3, 2, 0.62)';
    ctx.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
  }

  /** Puerta de la sala actual: se resalta al pasar el ratón. */
  private drawDoor(rooms: RoomState): void {
    const hoveredDoor = this.hover !== null && this.doorAt(this.hover, rooms.current) && !rooms.transition;
    if (!hoveredDoor) return;
    const ctx = this.ctx;
    const d = DOORS[rooms.current];
    ctx.strokeStyle = COLORS.text;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.strokeRect(d.x + 0.5, d.y + 0.5, d.width - 1, d.height - 1);
    ctx.setLineDash([]);
    drawText(ctx, 'label', d.label, d.x + d.width / 2, d.y - 8);
    this.canvas.style.cursor = 'pointer';
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
    if (this.room !== 'casino') {
      // Fuera del casino no se ve la ruleta: el resultado se muestra ya, como aviso en el HUD.
      this.revealedBets = bets;
      this.onAwayResult?.(latest);
      this.onSpinShown?.(latest);
      return;
    }
    const balanceBefore = state.balance - latest.delta;
    const bigLoss = latest.outcome === 'pierde' && latest.bet >= balanceBefore * BIG_LOSS_FRACTION;
    if (latest.bettor === 'ayudante') this.armReach = ARM_REACH_SECONDS;
    this.lenderLook = LOOK_SECONDS;
    const interrupted = this.roulette.start({ spin: latest, number: bets, bigLoss });
    if (interrupted) {
      this.revealedBets = Math.max(this.revealedBets, interrupted.number);
      this.onSpinShown?.(interrupted.spin);
    }
  }

  private advance(state: GameState, dt: number): void {
    this.effects.update(dt);
    this.armReach = Math.max(0, this.armReach - dt);
    this.lenderTime += dt;
    this.lenderLook = Math.max(0, this.lenderLook - dt);
    const landed = this.roulette.update(dt);
    if (landed) {
      this.revealedBets = Math.max(this.revealedBets, landed.number);
      const { spin } = landed;
      const text = spin.delta >= 0 ? `+${formatNumber(spin.delta)}` : `−${formatNumber(-spin.delta)}`;
      this.addFloat(text, WHEEL_CENTER.x, WHEEL_CENTER.y - 70, spin.delta >= 0 ? COLORS.text : '#c0473d');
      if (landed.bigLoss) this.effects.shake();
      this.onSpinShown?.(spin);
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

  /**
   * El Encargado, detrás de la mesa y a un lado de la rueda, supervisando. Foco tenue encima,
   * respiración de 1 px y la cabeza (la parte de arriba del sprite) girada 2 px hacia la rueda
   * cuando alguien apuesta. El tapete se dibuja después y le tapa el torso.
   */
  private drawLender(state: GameState): void {
    const ctx = this.ctx;
    const img = this.sprites.lenderScene.get(lenderPhase(state));
    const left = Math.round(LENDER_SPOT.x - LENDER_SIZE / 2);
    const breath = Math.round(Math.sin(this.lenderTime * 1.7));
    const top = LENDER_SPOT.y - LENDER_SIZE + breath;

    // Foco de luz tenue.
    const light = ctx.createRadialGradient(LENDER_SPOT.x, top + 30, 4, LENDER_SPOT.x, top + 30, 62);
    light.addColorStop(0, 'rgba(225, 190, 120, 0.16)');
    light.addColorStop(1, 'rgba(225, 190, 120, 0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = light;
    ctx.fillRect(LENDER_SPOT.x - 62, top - 32, 124, 124);
    ctx.restore();

    if (!ready(img)) return;
    // Giro de cabeza: sube rápido y vuelve despacio.
    const look = this.lenderLook > 0 ? Math.min(1, (LOOK_SECONDS - this.lenderLook) / 0.15, this.lenderLook / 0.5) : 0;
    const headShift = -Math.round(2 * look); // la rueda está a su izquierda
    const headHeight = Math.round(LENDER_SIZE * HEAD_FRACTION);
    const scale = img.naturalWidth / LENDER_SIZE;
    ctx.drawImage(img, 0, headHeight * scale, img.naturalWidth, (LENDER_SIZE - headHeight) * scale, left, top + headHeight, LENDER_SIZE, LENDER_SIZE - headHeight);
    ctx.drawImage(img, 0, 0, img.naturalWidth, headHeight * scale, left + headShift, top, LENDER_SIZE, headHeight);
  }

  private drawFloats(): void {
    drawFloatTexts(this.ctx, this.floats, FLOAT_SECONDS);
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
