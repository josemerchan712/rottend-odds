import { CONFIG } from './config';
import { pickWeighted, type Rng } from './rng';
import type { GameState, TrashItem } from './state';

const { work } = CONFIG;

export interface Collected {
  kind: string;
  name: string;
  value: number;
  x: number;
  y: number;
}

/** Multiplicador de valor de la bolsa grande. */
export function bagMultiplier(state: GameState): number {
  return 1 + work.bagValuePerLevel * state.upgrades.bigBag;
}

/** Fichas que da un objeto con las mejoras actuales. */
export function itemValue(state: GameState, kind: string): number {
  const def = work.items.find((i) => i.id === kind);
  return def ? Math.round(def.value * bagMultiplier(state)) : 0;
}

/** Segundos entre recogidas del ayudante de limpieza (Infinity si no está contratado). */
export function cleanerInterval(level: number): number {
  if (level <= 0) return Infinity;
  return work.cleaner.baseInterval * (1 - work.cleaner.reductionPerLevel) ** (level - 1);
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** El objeto más cercano a un punto (o null si no hay). */
export function nearestItem(items: readonly TrashItem[], point: { x: number; y: number }, exclude?: number): TrashItem | null {
  let best: TrashItem | null = null;
  for (const item of items) {
    if (item.id === exclude) continue;
    if (!best || distance(item, point) < distance(best, point)) best = item;
  }
  return best;
}

/**
 * El objeto bajo un clic, con zona generosa: el más cercano dentro de `radius`. La posición del
 * objeto es su base, así que el centro visual queda un poco más arriba.
 */
export function itemAt(items: readonly TrashItem[], x: number, y: number, radius: number = work.clickRadius): TrashItem | null {
  let best: TrashItem | null = null;
  let bestDistance: number = radius;
  for (const item of items) {
    const d = Math.hypot(item.x - x, item.y - 12 - y);
    if (d <= bestDistance) {
      best = item;
      bestDistance = d;
    }
  }
  return best;
}

function take(state: GameState, item: TrashItem): Collected {
  state.work.items = state.work.items.filter((i) => i.id !== item.id);
  const def = work.items.find((i) => i.id === item.kind)!;
  const value = itemValue(state, item.kind);
  state.balance += value;
  state.stats.workEarned += value;
  state.work.lastItem = def.name;
  return { kind: item.kind, name: def.name, value, x: item.x, y: item.y };
}

/**
 * El jugador recoge un objeto. Con pinzas, recoge además los más cercanos a ese objeto.
 * Devuelve lo recogido (vacío si el objeto ya no existe).
 */
export function collectItem(state: GameState, itemId: number): Collected[] {
  const first = state.work.items.find((i) => i.id === itemId);
  if (!first) return [];
  const collected = [take(state, first)];
  const extra = state.upgrades.tweezers * work.tweezersExtraPerLevel;
  for (let n = 0; n < extra; n++) {
    const next = nearestItem(state.work.items, first);
    if (!next) break;
    collected.push(take(state, next));
  }
  return collected;
}

/** Atajo de teclado: recoge el objeto más cercano al jugador. */
export function collectNearest(state: GameState): Collected[] {
  const item = nearestItem(state.work.items, work.player);
  return item ? collectItem(state, item.id) : [];
}

/** Una posición libre en el suelo, lejos de los demás objetos si se puede. */
function spawnPosition(items: readonly TrashItem[], rng: Rng): { x: number; y: number } {
  const { floor, minItemDistance } = work;
  let candidate = { x: 0, y: 0 };
  for (let attempt = 0; attempt < 12; attempt++) {
    candidate = {
      x: Math.round(floor.x + rng() * floor.width),
      y: Math.round(floor.y + rng() * floor.height),
    };
    if (items.every((i) => distance(i, candidate) >= minItemDistance)) break;
  }
  return candidate;
}

function spawn(state: GameState, rng: Rng): void {
  const kind = pickWeighted(work.items, rng).id;
  const { x, y } = spawnPosition(state.work.items, rng);
  state.work.items.push({ id: state.work.nextId++, kind, x, y });
}

/**
 * Hace aparecer basura (una cada respawnInterval si hay hueco; el suelo empieza lleno) y hace
 * trabajar al ayudante de limpieza. Devuelve lo que ha recogido el ayudante.
 */
export function updateWork(state: GameState, dt: number, rng: Rng): Collected[] {
  if (state.work.nextId === 0) {
    state.work.nextId = 1;
    while (state.work.items.length < work.maxItems) spawn(state, rng);
  }

  if (state.work.items.length >= work.maxItems) {
    state.work.spawnTimer = 0;
  } else {
    state.work.spawnTimer += dt;
    while (state.work.spawnTimer >= work.respawnInterval && state.work.items.length < work.maxItems) {
      state.work.spawnTimer -= work.respawnInterval;
      spawn(state, rng);
    }
    if (state.work.items.length >= work.maxItems) state.work.spawnTimer = 0;
  }

  return updateCleaner(state, dt);
}

/** El ayudante de limpieza recoge el objeto más cercano a él cada cierto tiempo (sin pinzas). */
function updateCleaner(state: GameState, dt: number): Collected[] {
  const interval = cleanerInterval(state.upgrades.cleaner);
  if (!Number.isFinite(interval)) return [];
  const cleaner = state.work.cleaner;
  const collected: Collected[] = [];
  cleaner.timer += dt;
  while (cleaner.timer >= interval) {
    const item = nearestItem(state.work.items, cleaner);
    if (!item) {
      cleaner.timer = interval; // espera lleno: recoge en cuanto aparezca algo
      break;
    }
    cleaner.timer -= interval;
    cleaner.x = item.x;
    cleaner.y = item.y;
    collected.push(take(state, item));
  }
  return collected;
}
