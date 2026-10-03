import type { KeyValueStorage } from './save';

/** Ajustes del jugador. Se guardan aparte de la partida: borrarla no los toca. */
export interface Settings {
  /** Filtro CRT (scanlines, viñeta, grano). Aún sin efecto visual. */
  crtEnabled: boolean;
  /** Volumen general, 0-1. Aún sin audio. */
  volume: number;
}

export const SETTINGS_VERSION = 1;

export function defaultSettings(): Settings {
  return { crtEnabled: true, volume: 0.7 };
}

export function saveSettings(storage: KeyValueStorage, key: string, settings: Settings): boolean {
  try {
    storage.setItem(key, JSON.stringify({ version: SETTINGS_VERSION, settings }));
    return true;
  } catch {
    return false;
  }
}

/** Carga los ajustes; lo que falte o esté mal vuelve al valor por defecto. */
export function loadSettings(storage: KeyValueStorage, key: string): Settings {
  const settings = defaultSettings();
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return settings;
  }
  if (raw === null) return settings;
  try {
    const parsed = JSON.parse(raw)?.settings;
    if (typeof parsed?.crtEnabled === 'boolean') settings.crtEnabled = parsed.crtEnabled;
    if (typeof parsed?.volume === 'number' && Number.isFinite(parsed.volume)) {
      settings.volume = Math.min(Math.max(parsed.volume, 0), 1);
    }
  } catch {
    // JSON roto: valores por defecto.
  }
  return settings;
}
