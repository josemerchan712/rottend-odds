import { createInitialState, type GameState } from './state';

/** Súbelo cada vez que cambie la forma de GameState y añade su migración. */
export const SAVE_VERSION = 1;

/** Lo mínimo de localStorage que necesitamos; así los tests pasan un objeto falso. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SaveFile {
  version: number;
  /** Marca de tiempo (ms) del guardado; servirá para el progreso offline. */
  savedAt: number;
  state: GameState;
}

/**
 * migrations[v] convierte un guardado de la versión v en uno de la v+1.
 * Vacío mientras solo exista la versión 1.
 */
const migrations: Record<number, (state: Record<string, unknown>) => Record<string, unknown>> = {};

export function serialize(state: GameState, now: number): string {
  const file: SaveFile = { version: SAVE_VERSION, savedAt: now, state };
  return JSON.stringify(file);
}

export function deserialize(raw: string): SaveFile | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.version !== 'number' || !isRecord(parsed.state)) {
    return null;
  }
  let version = parsed.version;
  if (version > SAVE_VERSION || version < 1) return null;

  let state = parsed.state;
  while (version < SAVE_VERSION) {
    const migrate = migrations[version];
    if (!migrate) return null;
    state = migrate(state);
    version++;
  }

  // Rellena con valores por defecto lo que falte y descarta tipos incorrectos.
  const merged = createInitialState() as unknown as Record<string, unknown>;
  for (const key of Object.keys(merged)) {
    if (key in state && typeof state[key] === typeof merged[key]) merged[key] = state[key];
  }
  const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : 0;
  return { version: SAVE_VERSION, savedAt, state: sanitize(merged as unknown as GameState) };
}

export function saveGame(storage: KeyValueStorage, key: string, state: GameState, now: number): boolean {
  try {
    storage.setItem(key, serialize(state, now));
    return true;
  } catch {
    return false;
  }
}

/** Devuelve la partida guardada o null si no hay o está corrupta. */
export function loadGame(storage: KeyValueStorage, key: string): SaveFile | null {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  return raw === null ? null : deserialize(raw);
}

export function clearSave(storage: KeyValueStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Almacenamiento bloqueado: no hay nada que borrar.
  }
}

function sanitize(state: GameState): GameState {
  if (!Number.isFinite(state.balance) || state.balance < 0) state.balance = 0;
  if (!Number.isFinite(state.playTime) || state.playTime < 0) state.playTime = 0;
  return state;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
