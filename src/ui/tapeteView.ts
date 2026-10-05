import { isBetTypeUnlocked, selectedChip, stateChips, type SelectorChip } from '../game/betting';
import { slotColor } from '../game/roulette';
import type { GameState, SpinResult } from '../game/state';
import { chipBase, STRIP, TAPETE, ZONES, type Zone } from './casinoLayout';
import { ready, type Sprites } from './sprites';
import { fillPixelText } from './pixelText';

const C = {
  felt: '#24331b',
  feltEdge: '#3b4f28',
  frame: '#8a6a2a',
  frameDark: '#0b0908',
  black: '#141110',
  bone: '#cfc5a6',
  boneDark: '#8f8670',
  green: '#3f7a2e',
  gold: '#d4ad48',
  text: '#e3dcc6',
  lockShade: 'rgba(8, 6, 4, 0.66)',
  hover: '#d4ad48',
};

/** Dígitos de 3x5 píxeles para los números del tapete (nítidos a cualquier escala). */
const DIGITS: Record<string, string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '.##', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
};

function drawDigits(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, color: string): void {
  const width = text.length * 4 - 1;
  let x = Math.round(cx - width / 2);
  const y = Math.round(cy - 2.5);
  ctx.fillStyle = color;
  for (const ch of text) {
    DIGITS[ch]?.forEach((row, r) => {
      for (let c = 0; c < 3; c++) if (row[c] === '#') ctx.fillRect(x + c, y + r, 1, 1);
    });
    x += 4;
  }
}

/** Candado de 7x8 píxeles. */
function drawLock(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  const x = Math.round(cx - 4);
  const y = Math.round(cy - 5);
  ctx.fillStyle = C.frameDark;
  ctx.fillRect(x - 1, y - 1, 10, 12);
  ctx.fillStyle = C.boneDark;
  ctx.fillRect(x + 2, y, 4, 1);
  ctx.fillRect(x + 1, y + 1, 1, 3);
  ctx.fillRect(x + 6, y + 1, 1, 3);
  ctx.fillStyle = C.gold;
  ctx.fillRect(x, y + 4, 8, 6);
  ctx.fillStyle = C.frameDark;
  ctx.fillRect(x + 3, y + 6, 2, 2);
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, color: string, size = 11): void {
  ctx.font = `${size}px VT323, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  fillPixelText(ctx, value, x, y + 0.5);
}

function zoneColors(zone: Zone): { fill: string; ink: string } {
  if (zone.id === 'negro') return { fill: C.black, ink: C.bone };
  if (zone.id === 'blanco') return { fill: C.bone, ink: C.black };
  if (zone.type === 'dozen') return { fill: C.feltEdge, ink: C.text };
  const n = zone.choice.type === 'number' ? zone.choice.number : 0;
  return n % 2 === 1 ? { fill: C.black, ink: C.bone } : { fill: C.bone, ink: C.black };
}

/** El tapete sobre el fieltro: zonas, números, candados y el resaltado de la zona bajo el ratón. */
export function drawTapete(ctx: CanvasRenderingContext2D, state: GameState, hovered: Zone | null): void {
  const { x, y, width, height } = TAPETE;
  ctx.fillStyle = C.frameDark;
  ctx.fillRect(x - 2, y - 2, width + 4, height + 4);
  ctx.fillStyle = C.frame;
  ctx.fillRect(x - 1, y - 1, width + 2, height + 2);
  ctx.fillStyle = C.felt;
  ctx.fillRect(x, y, width, height);

  for (const zone of ZONES) {
    const { fill, ink } = zoneColors(zone);
    ctx.fillStyle = fill;
    ctx.fillRect(zone.x + 1, zone.y + 1, zone.width - 2, zone.height - 2);
    if (zone.type === 'number') drawDigits(ctx, zone.label, zone.x + zone.width / 2, zone.y + zone.height / 2, ink);
    else if (zone.type === 'dozen') {
      const d = zone.choice.type === 'dozen' ? zone.choice.dozen : 1;
      text(ctx, `${d * 12 - 11}-${d * 12}`, zone.x + zone.width / 2, zone.y + zone.height / 2, ink);
    } else text(ctx, zone.label, zone.x + zone.width / 2, zone.y + zone.height / 2, ink, 12);
  }

  // Lo bloqueado, apagado y con candado.
  for (const type of ['dozen', 'number'] as const) {
    if (isBetTypeUnlocked(state, type)) continue;
    const zones = ZONES.filter((z) => z.type === type);
    const left = Math.min(...zones.map((z) => z.x));
    const top = Math.min(...zones.map((z) => z.y));
    const right = Math.max(...zones.map((z) => z.x + z.width));
    const bottom = Math.max(...zones.map((z) => z.y + z.height));
    ctx.fillStyle = C.lockShade;
    ctx.fillRect(left, top, right - left, bottom - top);
    drawLock(ctx, (left + right) / 2, (top + bottom) / 2);
  }

  if (hovered) {
    ctx.strokeStyle = C.hover;
    ctx.lineWidth = 1;
    ctx.strokeRect(hovered.x + 0.5, hovered.y + 0.5, hovered.width - 1, hovered.height - 1);
  }
}

/** Sprite de cada ficha del selector, de la más sucia a la pila dorada del TODO. */
const CHIP_SPRITES = ['chip-1', 'chip-2', 'chip-3', 'stack-8'];

function chipLabel(chip: SelectorChip): string {
  const n = chip.amount;
  if (n >= 1e6) return `${+(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${+(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
  return String(n);
}

/** Columna de fichas del selector: cantidad en la cara, la elegida resaltada, las que no alcanzan apagadas. */
export function drawChips(ctx: CanvasRenderingContext2D, state: GameState, sprites: Sprites, hoveredIndex: number | null): SelectorChip[] {
  const chips = stateChips(state);
  drawChipColumn(ctx, chips, selectedChip(state).index, sprites, hoveredIndex);
  return chips;
}

/** La columna de fichas para cualquier mesa: las fichas, la elegida (índice de fracción) y la del ratón. */
export function drawChipColumn(
  ctx: CanvasRenderingContext2D,
  chips: SelectorChip[],
  selectedIndex: number,
  sprites: Sprites,
  hoveredIndex: number | null,
): void {
  chips.forEach((chip, i) => {
    const base = chipBase(i);
    const isSelected = chip.index === selectedIndex;
    const lift = isSelected ? 2 : 0;
    ctx.globalAlpha = chip.affordable ? 1 : 0.35;
    if (isSelected) {
      ctx.fillStyle = 'rgba(212, 173, 72, 0.35)';
      ctx.beginPath();
      ctx.ellipse(base.x, base.y - 4, 15, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const img = sprites.chips.get(CHIP_SPRITES[chip.index] ?? 'chip-1');
    if (ready(img)) ctx.drawImage(img, Math.round(base.x - 16), Math.round(base.y - 32 - lift), 32, 32);
    const labelY = base.y - 15 - lift;
    const label = chip.all ? `${chipLabel(chip)}` : chipLabel(chip);
    ctx.fillStyle = C.frameDark;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) text(ctx, label, base.x + dx, labelY + dy, C.frameDark, 12);
    text(ctx, label, base.x, labelY, isSelected || i === hoveredIndex ? C.gold : C.text, 12);
    if (chip.all) {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) text(ctx, 'TODO', base.x + dx, base.y - 34 - lift + dy, C.frameDark, 10);
      text(ctx, 'TODO', base.x, base.y - 34 - lift, C.gold, 10);
    }
    ctx.globalAlpha = 1;
  });
}

/** Tira de los últimos resultados junto a la rueda: puntos de color, el más reciente arriba. */
export function drawStrip(ctx: CanvasRenderingContext2D, spins: SpinResult[]): void {
  spins.slice(0, 8).forEach((spin, i) => {
    const color = slotColor(spin.slot);
    const fill = color === 'negro' ? C.black : color === 'blanco' ? C.bone : color === 'verde' ? C.green : C.gold;
    const r = i === 0 ? 5 : 4;
    const cx = STRIP.x;
    const cy = STRIP.y + i * STRIP.step;
    ctx.fillStyle = C.frameDark;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = i === 0 ? C.gold : C.frame;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
    ctx.fill();
  });
}
