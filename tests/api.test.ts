import { describe, expect, it } from 'vitest';
import { createApi, type CloudSave } from '../src/api/client';
import { loadSession, saveSession } from '../src/api/session';
import { keepLocal, syncGame } from '../src/api/sync';
import { serialize, type SaveFile } from '../src/game/save';
import { memoryStorage, stateWith } from './helpers';

const local: SaveFile = JSON.parse(serialize(stateWith({ balance: 100, playTime: 60 }), 1));

function cloud(revision: number, balance = 900): CloudSave {
  return {
    revision,
    saveVersion: 3,
    data: JSON.parse(serialize(stateWith({ balance }), 2)),
    playTime: 200,
    balance,
    debtPaid: false,
    verified: true,
    updatedAt: '2026-10-03T00:00:00Z',
  };
}

/** Servidor falso: responde según método y ruta, y anota las peticiones. */
function fakeServer(routes: Record<string, (body: unknown) => [number, unknown]>) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    const path = url.replace('http://test', '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    const handler = routes[`${method} ${path}`];
    if (!handler) return new Response(JSON.stringify({ message: 'no existe' }), { status: 404 });
    const [status, data] = handler(body);
    return new Response(JSON.stringify(data), { status });
  }) as typeof fetch;
  return { api: createApi({ baseUrl: 'http://test', fetch: fetchFn }), calls };
}

describe('cliente del servidor', () => {
  it('si el servidor no responde, devuelve un error sin lanzar', async () => {
    const api = createApi({ baseUrl: 'http://test', fetch: (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch });
    const res = await api.ranking(0, 10);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(0);
  });

  it('corta la petición si el servidor tarda demasiado', async () => {
    const slow = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('abort'))))) as typeof fetch;
    const api = createApi({ baseUrl: 'http://test', fetch: slow, timeoutMs: 20 });
    const res = await api.login('Ana', 'x');
    expect(res).toMatchObject({ ok: false, status: 0 });
  });

  it('envía el token y transmite los errores del servidor', async () => {
    const { api, calls } = fakeServer({ 'GET /api/save': () => [401, { message: 'Hace falta iniciar sesión' }] });
    const res = await api.getSave('tkn');
    expect(res).toMatchObject({ ok: false, status: 401, message: 'Hace falta iniciar sesión' });
    expect(calls[0].method).toBe('GET');
  });
});

describe('sincronización', () => {
  it('sin guardado en la nube, sube el local', async () => {
    const { api, calls } = fakeServer({ 'PUT /api/save': () => [200, cloud(1, 100)] });
    const out = await syncGame(api, 't', local, null);
    expect(out.kind).toBe('uploaded');
    expect(calls[1].body).toMatchObject({ baseRevision: null });
  });

  it('si la nube no ha cambiado desde la última vez, sube encima', async () => {
    const { api, calls } = fakeServer({
      'GET /api/save': () => [200, cloud(4)],
      'PUT /api/save': () => [200, cloud(5)],
    });
    const out = await syncGame(api, 't', local, 4);
    expect(out).toMatchObject({ kind: 'uploaded', save: { revision: 5 } });
    expect(calls[1].body).toMatchObject({ baseRevision: 4 });
  });

  it('si la nube es más reciente, hay conflicto y no se sube nada', async () => {
    const { api, calls } = fakeServer({ 'GET /api/save': () => [200, cloud(7)] });
    const out = await syncGame(api, 't', local, 4);
    expect(out).toMatchObject({ kind: 'conflict', server: { revision: 7 } });
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
  });

  it('quedarse con la local sobrescribe con la revisión del servidor', async () => {
    const { api, calls } = fakeServer({ 'PUT /api/save': () => [200, cloud(8, 100)] });
    const out = await keepLocal(api, 't', cloud(7), local);
    expect(out.kind).toBe('uploaded');
    expect(calls[0].body).toMatchObject({ baseRevision: 7 });
  });

  it('un 409 al subir también es un conflicto', async () => {
    const { api } = fakeServer({
      'GET /api/save': () => [200, cloud(4)],
      'PUT /api/save': () => [409, { message: 'conflicto', server: cloud(5) }],
    });
    expect(await syncGame(api, 't', local, 4)).toMatchObject({ kind: 'conflict', server: { revision: 5 } });
  });

  it('sin partida local se queda con la de la nube', async () => {
    const { api } = fakeServer({ 'GET /api/save': () => [200, cloud(3)] });
    expect(await syncGame(api, 't', null, null)).toMatchObject({ kind: 'downloaded' });
  });

  it('distingue servidor caído, sesión caducada y guardado rechazado', async () => {
    const down = createApi({ baseUrl: 'http://test', fetch: (async () => { throw new Error('down'); }) as typeof fetch });
    expect((await syncGame(down, 't', local, null)).kind).toBe('offline');
    const { api: expired } = fakeServer({ 'GET /api/save': () => [401, {}] });
    expect((await syncGame(expired, 't', local, null)).kind).toBe('expired');
    const { api: rejecting } = fakeServer({ 'PUT /api/save': () => [422, { message: 'Guardado imposible', details: ['x'] }] });
    expect(await syncGame(rejecting, 't', local, null)).toMatchObject({ kind: 'rejected', details: ['x'] });
  });
});

describe('sesión', () => {
  it('se guarda aparte y caduca', () => {
    const storage = memoryStorage();
    const session = { token: 't', displayName: 'Ana', expiresAt: '2026-10-04T00:00:00Z', cloudRevision: 3 };
    saveSession(storage, 's', session);
    expect(loadSession(storage, 's', Date.parse('2026-10-03T12:00:00Z'))).toEqual(session);
    expect(loadSession(storage, 's', Date.parse('2026-10-05T00:00:00Z'))).toBeNull();
    saveSession(storage, 's', null);
    expect(loadSession(storage, 's', 0)).toBeNull();
  });
});
