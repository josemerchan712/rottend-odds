import type { SaveFile } from '../game/save';

/**
 * Cliente del servidor opcional (cuentas, nube, ranking). El juego funciona sin él: ninguna
 * función lanza excepciones; si el servidor no responde, devuelven `{ ok: false, status: 0 }`.
 */

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; message: string; details?: string[]; suggestions?: string[]; data?: unknown };

/** Sesión iniciada. `recoveryCode` solo llega al registrarse y al restablecer la contraseña (una sola vez). */
export interface TokenResponse {
  token: string;
  expiresAt: string;
  playerName: string;
  recoveryCode?: string;
}

/** Disponibilidad de un nombre mientras se escribe. */
export interface NameCheck {
  playerName: string;
  available: boolean;
  reason?: 'ocupado' | 'reservado' | 'no-permitido' | 'formato';
  message?: string;
  suggestions?: string[];
}

export interface CloudSave {
  revision: number;
  saveVersion: number;
  data: SaveFile;
  playTime: number;
  balance: number;
  debtPaid: boolean;
  verified: boolean;
  verificationNote?: string;
  updatedAt: string;
}

export interface DebtPaidResponse {
  playTimeSeconds: number;
  verified: boolean;
  verificationNote?: string;
  rank?: number;
  newBest: boolean;
}

export interface RankingPage {
  content: { rank: number; playerName: string; playTimeSeconds: number; achievedAt: string }[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface ApiOptions {
  baseUrl: string;
  timeoutMs: number;
  /** Inyectable para tests. */
  fetch: typeof fetch;
}

/** URL del servidor (VITE_API_URL). Sin ella, el juego va sin servidor: se ocultan sesión, sincronizar y ranking. */
export const DEFAULT_API_URL: string = import.meta.env?.VITE_API_URL ?? '';
export const ONLINE_ENABLED = DEFAULT_API_URL !== '';

export function createApi(options: Partial<ApiOptions> = {}) {
  const { baseUrl, timeoutMs, fetch: doFetch } = {
    baseUrl: DEFAULT_API_URL,
    timeoutMs: 6000,
    fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
    ...options,
  };

  async function request<T>(method: string, path: string, body?: unknown, token?: string): Promise<ApiResult<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = {};
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await doFetch(baseUrl + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const data: unknown = await res.json().catch(() => undefined);
      if (res.ok) return { ok: true, status: res.status, data: data as T };
      const err = (data ?? {}) as { message?: string; details?: string[]; suggestions?: string[] };
      return { ok: false, status: res.status, message: err.message ?? `Error ${res.status}`, details: err.details, suggestions: err.suggestions, data };
    } catch {
      return { ok: false, status: 0, message: 'No se puede conectar con el servidor' };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    register: (playerName: string, password: string) => request<TokenResponse>('POST', '/api/auth/register', { playerName, password }),
    login: (playerName: string, password: string) => request<TokenResponse>('POST', '/api/auth/login', { playerName, password }),
    nameAvailable: (name: string) => request<NameCheck>('GET', `/api/auth/name-available?name=${encodeURIComponent(name)}`),
    resetPassword: (playerName: string, recoveryCode: string, newPassword: string) =>
      request<TokenResponse>('POST', '/api/auth/reset', { playerName, recoveryCode, newPassword }),
    deleteAccount: (token: string) => request<void>('DELETE', '/api/me', undefined, token),
    exportData: (token: string) => request<Record<string, unknown>>('GET', '/api/me/export', undefined, token),
    getSave: (token: string) => request<CloudSave>('GET', '/api/save', undefined, token),
    putSave: (token: string, baseRevision: number | null, data: SaveFile) =>
      request<CloudSave>('PUT', '/api/save', { baseRevision, data }, token),
    debtPaid: (token: string, data: SaveFile) => request<DebtPaidResponse>('POST', '/api/debt-paid', { data }, token),
    ranking: (page: number, size: number) => request<RankingPage>('GET', `/api/ranking?page=${page}&size=${size}`),
  };
}

export type Api = ReturnType<typeof createApi>;
