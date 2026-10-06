/**
 * Prueba de extremo a extremo del backend real (Docker con PostgreSQL), con el mismo cliente HTTP que el juego.
 *
 *   API_URL=http://localhost:8080 npx tsx scripts/e2e/backend.ts flujo        registro … ranking, restablecer, exportar
 *   API_URL=http://localhost:8080 npx tsx scripts/e2e/backend.ts persistencia tras reiniciar: sigue todo; borra la cuenta
 *
 * Las contraseñas y códigos son aleatorios y no se imprimen; entre las dos fases se guardan en E2E_STATE
 * (archivo temporal con permisos 600, fuera del repositorio). Necesita AUTH_RATE_LIMIT alto en el servidor
 * (el flujo hace más de 10 peticiones de credenciales desde la misma IP).
 */
import { randomBytes } from 'node:crypto';
import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApi } from '../../src/api/client';
import { createInitialState } from '../../src/game/state';
import { deserialize, serialize } from '../../src/game/save';

const api = createApi({ baseUrl: process.env.API_URL ?? 'http://localhost:8080', timeoutMs: 15_000 });
const statePath = process.env.E2E_STATE ?? join(tmpdir(), 'rottenodds-e2e-state.json');
const secret = () => randomBytes(18).toString('base64url');

let failures = 0;
function check(label: string, ok: boolean, extra = ''): void {
  console.log(`${ok ? 'OK  ' : 'FALLO'} ${label}${extra ? ` (${extra})` : ''}`);
  if (!ok) failures++;
}

/** Partida con la mesa 1 saldada en 600 s, como SaveFixtures.finished del servidor (verificada). */
function finishedSave() {
  const state = createInitialState();
  state.balance = 50_000;
  state.playTime = 600;
  state.debtPaid = true;
  Object.assign(state.upgrades, { luck: 20, maxBet: 11, crupier: 1, helperSpeed: 15 });
  return deserialize(serialize(state, Date.now()))!;
}

async function flujo(): Promise<void> {
  const name = `E2e_${randomBytes(3).toString('hex')}`;
  const password = secret();

  const reg = await api.register(name, password);
  check('registro 201 con código de recuperación', reg.ok && reg.status === 201 && /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test(reg.data.recoveryCode ?? ''));
  if (!reg.ok) throw new Error(`registro: ${reg.status} ${reg.message}`);
  const code = reg.data.recoveryCode!;

  const dup = await api.register(name.toUpperCase(), secret());
  check('mismo nombre con otras mayúsculas → 409 con sugerencias', !dup.ok && dup.status === 409 && (dup.suggestions?.length ?? 0) > 0, dup.ok ? '' : dup.suggestions?.join(', '));
  if (!dup.ok && dup.suggestions?.[0]) {
    const free = await api.nameAvailable(dup.suggestions[0]);
    check('la primera sugerencia está libre', free.ok && free.data.available);
  }

  const raceName = `Carrera_${randomBytes(3).toString('hex')}`;
  const race = await Promise.all(Array.from({ length: 6 }, () => api.register(raceName, secret())));
  const statuses = race.map((r) => r.status).sort();
  check('6 registros simultáneos del mismo nombre → un 201 y el resto 409 (nunca 500)',
    statuses.filter((s) => s === 201).length === 1 && statuses.filter((s) => s === 409).length === 5, statuses.join(','));

  const bad = await api.login(name, 'contraseña-que-no-es');
  const ghost = await api.login(`Nadie_${randomBytes(3).toString('hex')}`, 'contraseña-que-no-es');
  check('login fallido con error genérico (igual exista o no el nombre)', !bad.ok && !ghost.ok && bad.status === 401 && bad.message === ghost.message);

  const login = await api.login(name.toLowerCase(), password);
  check('login sin distinguir mayúsculas; el nombre se muestra como se escribió', login.ok && login.data.playerName === name);
  if (!login.ok) throw new Error('login');
  const token = login.data.token;

  const save = finishedSave();
  const put = await api.putSave(token, null, save);
  check('guardar partida en la nube', put.ok && put.data.revision === 1 && put.data.verified, put.ok ? `revisión ${put.data.revision}` : put.message);
  const got = await api.getSave(token);
  check('leer partida de la nube', got.ok && got.data.revision === 1 && got.data.data.state.playTime === 600);

  const paid = await api.debtPaid(token, save);
  check('registrar deuda saldada', paid.ok);
  const ranking = await api.ranking(0, 50);
  check('el jugador sale en el ranking', ranking.ok && ranking.data.content.some((r) => r.playerName === name));

  const newPassword = secret();
  const reset = await api.resetPassword(name, code.toLowerCase().replace(/-/g, ' '), newPassword);
  check('restablecer con el código → código nuevo', reset.ok && !!reset.data.recoveryCode && reset.data.recoveryCode !== code);
  const reuse = await api.resetPassword(name, code, secret());
  check('el código usado ya no vale', !reuse.ok && reuse.status === 401);
  const oldLogin = await api.login(name, password);
  const newLogin = await api.login(name, newPassword);
  check('la contraseña vieja ya no vale y la nueva sí', !oldLogin.ok && newLogin.ok);

  const exported = newLogin.ok ? await api.exportData(newLogin.data.token) : null;
  check('exportar mis datos', !!exported?.ok && exported.data.playerName === name && JSON.stringify(exported.data).indexOf('Hash') === -1);

  writeFileSync(statePath, JSON.stringify({ name, password: newPassword }), { mode: 0o600 });
  chmodSync(statePath, 0o600);
}

async function persistencia(): Promise<void> {
  const { name, password } = JSON.parse(readFileSync(statePath, 'utf8')) as { name: string; password: string };
  const login = await api.login(name, password);
  check('tras reiniciar: login', login.ok);
  if (!login.ok) throw new Error('login tras reiniciar');
  const token = login.data.token;
  const got = await api.getSave(token);
  check('tras reiniciar: la partida sigue en la nube', got.ok && got.data.revision === 1);
  const before = await api.ranking(0, 50);
  check('tras reiniciar: sigue en el ranking', before.ok && before.data.content.some((r) => r.playerName === name));

  const del = await api.deleteAccount(token);
  check('borrar la cuenta → 204', del.ok && del.status === 204);
  const after = await api.ranking(0, 50);
  check('ya no sale en el ranking', after.ok && !after.data.content.some((r) => r.playerName === name));
  const gone = await api.login(name, password);
  check('ya no se puede entrar', !gone.ok && gone.status === 401);
  const free = await api.nameAvailable(name);
  check('el nombre vuelve a estar libre', free.ok && free.data.available);
  rmSync(statePath, { force: true });
}

const phase = process.argv[2];
await (phase === 'persistencia' ? persistencia() : flujo());
console.log(failures === 0 ? '\nTodo bien.' : `\n${failures} comprobación(es) fallida(s).`);
process.exit(failures === 0 ? 0 : 1);
