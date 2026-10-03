import { CONFIG, UPGRADE_IDS } from './config';
import { createInitialState, type GameState } from './state';

/** Súbelo cada vez que cambie la forma de GameState y añade su migración. */
export const SAVE_VERSION = 3;

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

type Json = Record<string, unknown>;

/** migrations[v] convierte un guardado de la versión v en uno de la v+1. */
const migrations: Record<number, (state: Json) => Json> = {
  // v1 solo tenía saldo y tiempo; el resto lo rellenan los valores por defecto.
  1: (state) => ({ balance: state.balance, playTime: state.playTime }),
  // v3 cambia la forma de las tiradas (choice en vez de color) y añade mejoras nuevas.
  2: (state) => ({ ...state, recentSpins: [] }),
};

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

  const merged = mergeDefaults(createInitialState() as unknown as Json, state) as unknown as GameState;
  const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : 0;
  return { version: SAVE_VERSION, savedAt, state: sanitize(merged) };
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

/**
 * Copia de `saved` lo que tenga el mismo tipo que en `defaults`, recursivamente.
 * Lo que falte o tenga un tipo incorrecto se queda con el valor por defecto.
 * Los campos que son null por defecto (lastItem) aceptan string.
 */
function mergeDefaults(defaults: Json, saved: Json): Json {
  const out: Json = {};
  for (const [key, def] of Object.entries(defaults)) {
    const value = saved[key];
    if (isRecord(def)) out[key] = isRecord(value) ? mergeDefaults(def, value) : def;
    else if (Array.isArray(def)) out[key] = Array.isArray(value) ? value : def;
    else if (def === null) out[key] = typeof value === 'string' ? value : null;
    else out[key] = typeof value === typeof def ? value : def;
  }
  return out;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function sanitize(state: GameState): GameState {
  state.balance = nonNegative(state.balance);
  state.playTime = nonNegative(state.playTime);
  for (const id of UPGRADE_IDS) {
    state.upgrades[id] = Math.min(Math.floor(nonNegative(state.upgrades[id])), CONFIG.upgrades[id].maxLevel);
  }
  state.betFractionIndex = clampIndex(state.betFractionIndex, CONFIG.bet.quickFractions.length);
  state.helper.timer = nonNegative(state.helper.timer);
  state.helper.lockout = Math.min(nonNegative(state.helper.lockout), CONFIG.helper.allInLossLockout);
  state.helper.profile = Math.min(clampIndex(state.helper.profile, CONFIG.helper.profiles.length), state.upgrades.helperProfile);
  state.work.items = Math.min(Math.floor(nonNegative(state.work.items)), CONFIG.work.maxItems);
  state.work.spawnTimer = nonNegative(state.work.spawnTimer);
  state.recentSpins = state.recentSpins.filter(isRecord).slice(0, CONFIG.tech.recentSpins) as GameState['recentSpins'];
  return state;
}

function clampIndex(value: number, length: number): number {
  return Math.min(Math.floor(nonNegative(value)), length - 1);
}

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
