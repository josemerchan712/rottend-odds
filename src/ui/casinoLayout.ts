import type { BetType } from '../game/config';
import type { BetChoice } from '../game/state';

/**
 * Geometría de la sala del casino en la escena de 640x360 (sin DOM, con tests). Los elementos
 * clave (rueda, mesa, Encargado) quedan en el 60% central (x 128-512) para que los cajones
 * laterales nunca los tapen.
 */
export const CENTER_LEFT = 128;
export const CENTER_RIGHT = 512;

export const WHEEL_CENTER = { x: 250, y: 118 };
/** Base del Encargado (96 px), detrás de la mesa: el borde del tapete le tapa el torso. */
export const LENDER_SPOT = { x: 392, y: 222 };
export const LENDER_SIZE = 96;
export const ARM_SPOT = { x: 478, y: 270 };
export const STRIP = { x: 162, y: 58, step: 14 };

/** El tapete, dibujado sobre el fieltro de la mesa. */
export const TAPETE = { x: 192, y: 200, width: 256, height: 62 };

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Zone extends Rect {
  id: string;
  label: string;
  choice: BetChoice;
  /** Tipo de apuesta: docena y número hay que desbloquearlos. */
  type: BetType;
}

const NUMBER_GRID = { x: 250, y: 204, cols: 12, rows: 3, cell: { width: 16, height: 10 } };

/** Número de la cuadrícula: columnas de tres, como en un tapete real (fila de arriba 3, 6... 36). */
export function numberAt(col: number, row: number): number {
  return col * 3 + (3 - row);
}

function buildZones(): Zone[] {
  const zones: Zone[] = [
    { id: 'negro', label: 'NEGRO', type: 'color', choice: { type: 'color', color: 'negro' }, x: 196, y: 204, width: 48, height: 26 },
    { id: 'blanco', label: 'BLANCO', type: 'color', choice: { type: 'color', color: 'blanco' }, x: 196, y: 232, width: 48, height: 26 },
  ];
  for (let d = 1; d <= 3; d++) {
    zones.push({
      id: `dozen-${d}`,
      label: `${d}ª DOCENA`,
      type: 'dozen',
      choice: { type: 'dozen', dozen: d as 1 | 2 | 3 },
      x: NUMBER_GRID.x + (d - 1) * 64,
      y: 236,
      width: 64,
      height: 22,
    });
  }
  for (let col = 0; col < NUMBER_GRID.cols; col++) {
    for (let row = 0; row < NUMBER_GRID.rows; row++) {
      const n = numberAt(col, row);
      zones.push({
        id: `n-${n}`,
        label: String(n),
        type: 'number',
        choice: { type: 'number', number: n },
        x: NUMBER_GRID.x + col * NUMBER_GRID.cell.width,
        y: NUMBER_GRID.y + row * NUMBER_GRID.cell.height,
        width: NUMBER_GRID.cell.width,
        height: NUMBER_GRID.cell.height,
      });
    }
  }
  return zones;
}

export const ZONES: readonly Zone[] = buildZones();

function inside(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
}

export function zoneAt(x: number, y: number): Zone | null {
  return ZONES.find((z) => inside(z, x, y)) ?? null;
}

/** Fichas del selector: columna en el lateral izquierdo de la mesa. */
const CHIP_COLUMN = { x: 168, y: 216, step: 30, size: 32 };

/** Caja de clic de la ficha visible número i (de arriba abajo = de izquierda a derecha en las teclas 1-4). */
export function chipRect(i: number): Rect {
  return { x: CHIP_COLUMN.x - 14, y: CHIP_COLUMN.y - 28 + i * CHIP_COLUMN.step, width: 28, height: 28 };
}

/** Base (abajo-centro) donde se dibuja la ficha visible número i. */
export function chipBase(i: number): { x: number; y: number } {
  return { x: CHIP_COLUMN.x, y: CHIP_COLUMN.y + i * CHIP_COLUMN.step };
}

export function chipAt(x: number, y: number, count: number): number | null {
  for (let i = 0; i < count; i++) if (inside(chipRect(i), x, y)) return i;
  return null;
}

/** ¿Está el rectángulo dentro del 60% central? */
export function inCenter(r: Rect): boolean {
  return r.x >= CENTER_LEFT && r.x + r.width <= CENTER_RIGHT;
}
