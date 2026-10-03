import type { SaveFile } from '../game/save';
import type { Api, CloudSave } from './client';

/** Lo que pasó al sincronizar, para que la interfaz lo cuente o pregunte. */
export type SyncOutcome =
  | { kind: 'uploaded'; save: CloudSave }
  | { kind: 'downloaded'; save: CloudSave }
  | { kind: 'conflict'; server: CloudSave; local: SaveFile }
  | { kind: 'nothing' }
  | { kind: 'rejected'; message: string; details: string[] }
  | { kind: 'expired' }
  | { kind: 'offline'; message: string };

/**
 * Sincroniza la partida local con la nube.
 * - Sin guardado en la nube: sube el local (si hay).
 * - La nube está en la revisión en la que se basa el local: sube el local encima.
 * - La nube ha cambiado desde la última sincronización: conflicto; decide el jugador.
 * - Sin partida local: se queda con la de la nube.
 */
export async function syncGame(api: Api, token: string, local: SaveFile | null, knownRevision: number | null): Promise<SyncOutcome> {
  const remote = await api.getSave(token);
  if (!remote.ok && remote.status !== 404) return failure(remote);

  if (!remote.ok) {
    if (!local) return { kind: 'nothing' };
    return upload(api, token, null, local);
  }
  if (!local) return { kind: 'downloaded', save: remote.data };
  if (knownRevision !== remote.data.revision) return { kind: 'conflict', server: remote.data, local };
  return upload(api, token, remote.data.revision, local);
}

/** El jugador eligió quedarse con su partida local: sobrescribe la de la nube. */
export function keepLocal(api: Api, token: string, server: CloudSave, local: SaveFile): Promise<SyncOutcome> {
  return upload(api, token, server.revision, local);
}

async function upload(api: Api, token: string, baseRevision: number | null, local: SaveFile): Promise<SyncOutcome> {
  const res = await api.putSave(token, baseRevision, local);
  if (res.ok) return { kind: 'uploaded', save: res.data };
  if (res.status === 409) {
    const server = (res.data as { server?: CloudSave } | undefined)?.server;
    if (server) return { kind: 'conflict', server, local };
  }
  return failure(res);
}

function failure(res: { status: number; message: string; details?: string[] }): SyncOutcome {
  if (res.status === 0) return { kind: 'offline', message: res.message };
  if (res.status === 401) return { kind: 'expired' };
  return { kind: 'rejected', message: res.message, details: res.details ?? [] };
}
