import { pickWeighted, type Rng } from './rng';
import type { TrashItem } from './state';

/**
 * El trabajo manual de cualquier mesa (lógica pura): objetos con posición en el suelo de la
 * trastienda, que aparecen solos, se recogen con un clic (más los extra de la mejora de cada
 * mesa) y que un ayudante de limpieza recoge cada cierto tiempo. Cada mesa pone sus números
 * (WorkDef), su suelo (WorkSlot) y cómo cobra (WorkHost).
 */
export interface WorkDef {
  maxItems: number;
  respawnInterval: number;
  floor: { x: number; y: number; width: number; height: number };
  player: { x: number; y: number };
  clickRadius: number;
  minItemDistance: number;
  cleaner: { baseInterval: number; reductionPerLevel: number; start: { x: number; y: number } };
  items: readonly { id: string; name: string; value: number; weight: number }[];
}

/** El suelo de una trastienda (se guarda con la partida). */
export interface WorkSlot {
  items: TrashItem[];
  spawnTimer: number;
  /** Siguiente id de objeto; 0 = aún no se ha sembrado el suelo inicial. */
  nextId: number;
  cleaner: { timer: number; x: number; y: number };
  lastItem: string | null;
}

/** Lo que cada mesa aporta: su suelo, sus mejoras y dónde van las monedas. */
export interface WorkHost {
  def: WorkDef;
  work: WorkSlot;
  /** Multiplicador de valor (bolsa grande, caja de herramientas). */
  valueMultiplier: number;
  /** Objetos extra por clic (pinzas, trapo). */
  extraPerClick: number;
  /** Nivel del ayudante de limpieza (0 = no contratado). */
  cleanerLevel: number;
  credit(value: number): void;
}

export interface Collected {
  kind: string;
  name: string;
  value: number;
  x: number;
  y: number;
}

export function createWorkSlot(def: WorkDef): WorkSlot {
  return { items: [], spawnTimer: 0, nextId: 0, cleaner: { timer: 0, ...def.cleaner.start }, lastItem: null };
}

export function hostItemValue(host: WorkHost, kind: string): number {
  const def = host.def.items.find((i) => i.id === kind);
  return def ? Math.round(def.value * host.valueMultiplier) : 0;
}

/** Segundos entre recogidas del ayudante de limpieza (Infinity si no está contratado). */
export function cleanerIntervalFor(def: WorkDef, level: number): number {
  if (level <= 0) return Infinity;
  return def.cleaner.baseInterval * (1 - def.cleaner.reductionPerLevel) ** (level - 1);
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
export function itemAtPoint(items: readonly TrashItem[], x: number, y: number, radius: number): TrashItem | null {
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

function take(host: WorkHost, item: TrashItem): Collected {
  host.work.items = host.work.items.filter((i) => i.id !== item.id);
  const def = host.def.items.find((i) => i.id === item.kind)!;
  const value = hostItemValue(host, item.kind);
  host.credit(value);
  host.work.lastItem = def.name;
  return { kind: item.kind, name: def.name, value, x: item.x, y: item.y };
}

/** El jugador recoge un objeto y, con la mejora, los más cercanos a él. Vacío si ya no existe. */
export function collectFrom(host: WorkHost, itemId: number): Collected[] {
  const first = host.work.items.find((i) => i.id === itemId);
  if (!first) return [];
  const collected = [take(host, first)];
  for (let n = 0; n < host.extraPerClick; n++) {
    const next = nearestItem(host.work.items, first);
    if (!next) break;
    collected.push(take(host, next));
  }
  return collected;
}

/** Atajo de teclado: recoge el objeto más cercano al jugador. */
export function collectNearestFrom(host: WorkHost): Collected[] {
  const item = nearestItem(host.work.items, host.def.player);
  return item ? collectFrom(host, item.id) : [];
}

/** Una posición libre en el suelo, lejos de los demás objetos si se puede. */
function spawnPosition(def: WorkDef, items: readonly TrashItem[], rng: Rng): { x: number; y: number } {
  const { floor, minItemDistance } = def;
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

function spawn(host: WorkHost, rng: Rng): void {
  const kind = pickWeighted(host.def.items, rng).id;
  const { x, y } = spawnPosition(host.def, host.work.items, rng);
  host.work.items.push({ id: host.work.nextId++, kind, x, y });
}

/**
 * Hace aparecer basura (una cada respawnInterval si hay hueco; el suelo empieza lleno) y hace
 * trabajar al ayudante de limpieza. Devuelve lo que ha recogido el ayudante.
 */
export function updateWorkHost(host: WorkHost, dt: number, rng: Rng): Collected[] {
  const { def, work } = host;
  if (work.nextId === 0) {
    work.nextId = 1;
    while (work.items.length < def.maxItems) spawn(host, rng);
  }

  if (work.items.length >= def.maxItems) {
    work.spawnTimer = 0;
  } else {
    work.spawnTimer += dt;
    while (work.spawnTimer >= def.respawnInterval && work.items.length < def.maxItems) {
      work.spawnTimer -= def.respawnInterval;
      spawn(host, rng);
    }
    if (work.items.length >= def.maxItems) work.spawnTimer = 0;
  }

  return updateCleaner(host, dt);
}

/** El ayudante de limpieza recoge el objeto más cercano a él cada cierto tiempo (sin mejoras de clic). */
function updateCleaner(host: WorkHost, dt: number): Collected[] {
  const interval = cleanerIntervalFor(host.def, host.cleanerLevel);
  if (!Number.isFinite(interval)) return [];
  const cleaner = host.work.cleaner;
  const collected: Collected[] = [];
  cleaner.timer += dt;
  while (cleaner.timer >= interval) {
    const item = nearestItem(host.work.items, cleaner);
    if (!item) {
      cleaner.timer = interval; // espera lleno: recoge en cuanto aparezca algo
      break;
    }
    cleaner.timer -= interval;
    cleaner.x = item.x;
    cleaner.y = item.y;
    collected.push(take(host, item));
  }
  return collected;
}

/**
 * Ingreso esperado por segundo del ayudante de limpieza: recoge cada `intervalo`, pero no más
 * rápido de lo que aparece la basura. Valor medio ponderado por la probabilidad de aparición.
 */
export function cleanerIncomeRate(def: WorkDef, level: number, valueMultiplier: number): number {
  const interval = cleanerIntervalFor(def, level);
  if (!Number.isFinite(interval)) return 0;
  const total = def.items.reduce((acc, i) => acc + i.weight, 0);
  const mean = def.items.reduce((acc, i) => acc + i.value * i.weight, 0) / total;
  return (mean * valueMultiplier) / Math.max(interval, def.respawnInterval);
}

/** Sanea un suelo cargado de un guardado. */
export function sanitizeWorkSlot(def: WorkDef, work: WorkSlot): void {
  const kinds = new Set(def.items.map((i) => i.id));
  const ok = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  work.items = work.items
    .filter((i) => typeof i === 'object' && i !== null && Number.isInteger(i.id) && kinds.has(i.kind) && ok(i.x) && ok(i.y))
    .slice(0, def.maxItems);
  work.spawnTimer = ok(work.spawnTimer) && work.spawnTimer > 0 ? work.spawnTimer : 0;
  const next = ok(work.nextId) && work.nextId > 0 ? Math.floor(work.nextId) : 0;
  work.nextId = Math.max(next, ...work.items.map((i) => i.id + 1));
  work.cleaner.timer = ok(work.cleaner.timer) && work.cleaner.timer > 0 ? work.cleaner.timer : 0;
  if (!ok(work.cleaner.x) || !ok(work.cleaner.y)) {
    work.cleaner.x = def.cleaner.start.x;
    work.cleaner.y = def.cleaner.start.y;
  }
}
