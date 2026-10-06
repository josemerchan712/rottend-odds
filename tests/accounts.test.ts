import { describe, expect, it } from 'vitest';
import { createApi, isServerDown, SERVER_DOWN } from '../src/api/client';
import { passwordError, playerNameFormatError } from '../src/api/playerName';
import { AUTH_TEXT, REAL_NAME_WARNING, RECOVERY_WARNING, recoveryFileText } from '../src/ui/online';

/** Servidor falso mínimo: responde según método y ruta (con la query) y anota las peticiones. */
function fakeServer(routes: Record<string, (body: unknown) => [number, unknown?]>) {
  const calls: { method: string; path: string; body: unknown; auth?: string }[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    const path = url.replace('http://test', '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body, auth: (init?.headers as Record<string, string> | undefined)?.Authorization });
    const handler = routes[`${method} ${path}`];
    if (!handler) return new Response(JSON.stringify({ message: 'no existe' }), { status: 404 });
    const [status, data] = handler(body);
    return new Response(data === undefined ? null : JSON.stringify(data), { status });
  }) as typeof fetch;
  return { api: createApi({ baseUrl: 'http://test', fetch: fetchFn }), calls };
}

describe('nombre de jugador (formato, igual que el servidor)', () => {
  it('acepta nombres válidos', () => {
    for (const ok of ['Pepe', 'abc', 'a_b', 'Mano-Negra', 'x1y2z3', 'A'.repeat(20)]) expect(playerNameFormatError(ok), ok).toBeNull();
  });
  it('rechaza longitud, caracteres raros y símbolos en los extremos', () => {
    expect(playerNameFormatError('ab')).toMatch(/Mínimo/);
    expect(playerNameFormatError('A'.repeat(21))).toMatch(/Máximo/);
    expect(playerNameFormatError('peña')).toMatch(/sin tilde/);
    expect(playerNameFormatError('pe pe')).toMatch(/sin tilde/);
    expect(playerNameFormatError('ana@b.c')).toMatch(/sin tilde/);
    expect(playerNameFormatError('-pepe')).toMatch(/empezar/);
    expect(playerNameFormatError('pepe_')).toMatch(/acabar/);
  });
  it('contraseña de 10+ y distinta del nombre', () => {
    expect(passwordError('corta', 'Ana')).toMatch(/10/);
    expect(passwordError('MANO-NEGRA', 'mano-negra')).toMatch(/igual/);
    expect(passwordError('una-contraseña-larga', 'Ana')).toBeNull();
  });
});

describe('API de cuentas sin email', () => {
  it('registro y login con nombre de jugador (sin email)', async () => {
    const token = { token: 't', expiresAt: '2026-10-07T00:00:00Z', playerName: 'Ana', recoveryCode: 'ABCD-EFGH-JKLM-NPQR' };
    const { api, calls } = fakeServer({
      'POST /api/auth/register': () => [201, token],
      'POST /api/auth/login': () => [200, { ...token, recoveryCode: undefined }],
    });
    const reg = await api.register('Ana', 'una-contraseña-larga');
    expect(reg.ok && reg.data.recoveryCode).toBe('ABCD-EFGH-JKLM-NPQR');
    await api.login('Ana', 'una-contraseña-larga');
    expect(calls.map((c) => c.body)).toEqual([
      { playerName: 'Ana', password: 'una-contraseña-larga' },
      { playerName: 'Ana', password: 'una-contraseña-larga' },
    ]);
    expect(JSON.stringify(calls)).not.toMatch(/email/i);
  });

  it('nombre ocupado: 409 con las sugerencias del servidor', async () => {
    const { api } = fakeServer({
      'POST /api/auth/register': () => [409, { message: 'Ese nombre ya está en uso', suggestions: ['Ana_Deuda', 'Ana7'] }],
    });
    const res = await api.register('ana', 'una-contraseña-larga');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(409);
      expect(res.suggestions).toEqual(['Ana_Deuda', 'Ana7']);
    }
  });

  it('disponibilidad con el nombre codificado en la URL', async () => {
    const { api, calls } = fakeServer({
      'GET /api/auth/name-available?name=Ana%20B': () => [200, { playerName: 'Ana B', available: false, reason: 'formato' }],
    });
    const res = await api.nameAvailable('Ana B');
    expect(res.ok && res.data.reason).toBe('formato');
    expect(calls[0].path).toBe('/api/auth/name-available?name=Ana%20B');
  });

  it('restablecer, borrar la cuenta y exportar los datos', async () => {
    const { api, calls } = fakeServer({
      'POST /api/auth/reset': () => [200, { token: 't2', expiresAt: 'x', playerName: 'Ana', recoveryCode: 'NUEV-OCOD-IGOX-XXXX' }],
      'DELETE /api/me': () => [204],
      'GET /api/me/export': () => [200, { playerName: 'Ana', cloudSave: null }],
    });
    const reset = await api.resetPassword('Ana', 'abcd-efgh-jklm-npqr', 'otra-contraseña-larga');
    expect(reset.ok && reset.data.recoveryCode).toBe('NUEV-OCOD-IGOX-XXXX');
    expect(calls[0].body).toEqual({ playerName: 'Ana', recoveryCode: 'abcd-efgh-jklm-npqr', newPassword: 'otra-contraseña-larga' });
    expect((await api.deleteAccount('tok')).ok).toBe(true);
    const exported = await api.exportData('tok');
    expect(exported.ok && exported.data.playerName).toBe('Ana');
    expect(calls.slice(1).map((c) => c.auth)).toEqual(['Bearer tok', 'Bearer tok']);
  });
});

describe('textos de la pantalla de cuenta', () => {
  it('avisos de nombre real y del código, y ningún modo pide email', () => {
    expect(REAL_NAME_WARNING).toMatch(/^No uses tu nombre real/);
    expect(RECOVERY_WARNING).toBe('Sin email no podemos recuperar tu cuenta: guarda este código.');
    expect(AUTH_TEXT.register.intro).toMatch(/Sin email/);
    expect(AUTH_TEXT.reset.intro).toMatch(/código de recuperación/);
    const file = recoveryFileText('Ana', 'ABCD-EFGH-JKLM-NPQR');
    expect(file).toContain('Nombre de jugador: Ana');
    expect(file).toContain('Código: ABCD-EFGH-JKLM-NPQR');
  });
});

describe('servidor caído', () => {
  it('sin conexión o con el proxy sin API (502-504): mensaje claro y se puede reintentar', async () => {
    const down = createApi({ baseUrl: 'http://test', fetch: (async () => { throw new TypeError('fetch failed'); }) as typeof fetch });
    const offline = await down.ranking(0, 10);
    expect(offline.ok).toBe(false);
    if (!offline.ok) expect(offline.message).toBe(SERVER_DOWN);
    expect(isServerDown(offline)).toBe(true);

    const { api } = fakeServer({ 'GET /api/ranking?page=0&size=10': () => [502, '<html>Bad Gateway</html>'] });
    const gateway = await api.ranking(0, 10);
    expect(isServerDown(gateway)).toBe(true);
    if (!gateway.ok) expect(gateway.message).toBe(SERVER_DOWN);
  });

  it('un error de la petición (401, 409, 429) no es «servidor caído»', () => {
    for (const status of [400, 401, 409, 429, 500]) expect(isServerDown({ ok: false, status })).toBe(false);
    expect(isServerDown({ ok: true, status: 200 })).toBe(false);
  });
});
