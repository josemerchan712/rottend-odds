import type { KeyValueStorage } from '../game/save';

/**
 * Sesión con el servidor, guardada aparte de la partida y de los ajustes.
 * El token va en localStorage (sin refresh token, caduca en 24 h): ver "Limitaciones" en el README.
 */
export interface Session {
  token: string;
  displayName: string;
  expiresAt: string;
  /** Revisión del guardado de la nube con la que está sincronizada la partida local (null = ninguna). */
  cloudRevision: number | null;
}

export function loadSession(storage: KeyValueStorage, key: string, now: number): Session | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Session>;
    if (typeof s.token !== 'string' || typeof s.displayName !== 'string' || typeof s.expiresAt !== 'string') return null;
    if (Date.parse(s.expiresAt) <= now) return null;
    return {
      token: s.token,
      displayName: s.displayName,
      expiresAt: s.expiresAt,
      cloudRevision: typeof s.cloudRevision === 'number' ? s.cloudRevision : null,
    };
  } catch {
    return null;
  }
}

export function saveSession(storage: KeyValueStorage, key: string, session: Session | null): void {
  try {
    if (session) storage.setItem(key, JSON.stringify(session));
    else storage.removeItem(key);
  } catch {
    // Almacenamiento bloqueado: la sesión dura lo que la pestaña.
  }
}
