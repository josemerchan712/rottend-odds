import type { KeyValueStorage } from './save';

/** Ajustes del jugador. Se guardan aparte de la partida: borrarla no los toca. */
export interface Settings {
  /** Filtro CRT: scanlines, viñeta y grano (suave o fuerte); apagado quita también parpadeo y temblor. */
  crt: CrtSetting;
  /** Volumen general, 0-1. */
  volume: number;
  /** Pedir pantalla completa al entrar (primer clic o tecla) y al pulsar Continuar o Nueva partida. */
  startFullscreen: boolean;
  /** Diálogos de los prestamistas. */
  dialogues: boolean;
  /** Silencio (todo el sonido; también con la tecla N). */
  muted: boolean;
}

export type CrtSetting = 'apagado' | 'suave' | 'fuerte';
export const CRT_LEVELS: readonly CrtSetting[] = ['apagado', 'suave', 'fuerte'];

/** v2: el filtro CRT pasa de sí/no a tres niveles (sí → suave, no → apagado). */
export const SETTINGS_VERSION = 2;

export function defaultSettings(): Settings {
  return { crt: 'suave', volume: 0.7, startFullscreen: false, dialogues: true, muted: false };
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
    if (CRT_LEVELS.includes(parsed?.crt)) settings.crt = parsed.crt;
    else if (typeof parsed?.crtEnabled === 'boolean') settings.crt = parsed.crtEnabled ? 'suave' : 'apagado';
    if (typeof parsed?.startFullscreen === 'boolean') settings.startFullscreen = parsed.startFullscreen;
    if (typeof parsed?.dialogues === 'boolean') settings.dialogues = parsed.dialogues;
    if (typeof parsed?.muted === 'boolean') settings.muted = parsed.muted;
    if (typeof parsed?.volume === 'number' && Number.isFinite(parsed.volume)) {
      settings.volume = Math.min(Math.max(parsed.volume, 0), 1);
    }
  } catch {
    // JSON roto: valores por defecto.
  }
  return settings;
}
