import './ui/style.css';
import { createApi, type CloudSave, type TokenResponse } from './api/client';
import { loadSession, saveSession, type Session } from './api/session';
import { keepLocal, syncGame, type SyncOutcome } from './api/sync';
import { setVolume, unlockAudio } from './audio';
import { CONFIG } from './game/config';
import { continueGame, continueInfo, startNewGame } from './game/menu';
import { defaultRng } from './game/rng';
import { clearSave, deserialize, loadGame, saveGame, serialize } from './game/save';
import { loadSettings, saveSettings } from './game/settings';
import type { GameState } from './game/state';
import { update } from './game/update';
import { startLoop } from './loop';
import { bindControls } from './ui/controls';
import { mountMenu, mountSettings, renderMenu, renderSettings } from './ui/menu';
import {
  mountAuth,
  mountRanking,
  mountSync,
  renderAuthMode,
  renderRanking,
  showSyncStatus,
} from './ui/online';
import { mountUi, render, setText } from './ui/render';
import { Scene } from './ui/scene';
import { loadSprites } from './ui/sprites';
import { collectItem, collectNearest, itemAt } from './game/work';

const { saveKey, settingsKey, sessionKey, autosaveInterval, maxFrameDt } = CONFIG.tech;

type Screen = 'menu' | 'settings' | 'game' | 'auth' | 'sync' | 'ranking';

const app = document.querySelector<HTMLElement>('#app')!;
app.innerHTML = `
  <div data-screen="menu"></div>
  <div data-screen="settings" hidden></div>
  <div data-screen="game" hidden></div>
  <div data-screen="auth" hidden></div>
  <div data-screen="sync" hidden></div>
  <div data-screen="ranking" hidden></div>
`;
const screens = Object.fromEntries(
  (['menu', 'settings', 'game', 'auth', 'sync', 'ranking'] as Screen[]).map((name) => [
    name,
    app.querySelector<HTMLElement>(`[data-screen="${name}"]`)!,
  ]),
) as Record<Screen, HTMLElement>;

const menuUi = mountMenu(screens.menu);
const settingsUi = mountSettings(screens.settings);
const gameUi = mountUi(screens.game);
const authUi = mountAuth(screens.auth);
const syncUi = mountSync(screens.sync);
const rankingUi = mountRanking(screens.ranking);

const scene = new Scene(gameUi.sceneCanvas, loadSprites());

const api = createApi();
let session: Session | null = loadSession(localStorage, sessionKey, Date.now());

let screen: Screen = 'menu';
/** Partida en curso; null fuera del juego. */
let state: GameState | null = null;
const settings = loadSettings(localStorage, settingsKey);

function show(next: Screen): void {
  screen = next;
  for (const [name, el] of Object.entries(screens)) el.hidden = name !== next;
  if (next === 'menu') renderMenu(menuUi, continueInfo(localStorage, saveKey), currentSession()?.displayName ?? null);
  if (next === 'settings') renderSettings(settingsUi, settings, continueInfo(localStorage, saveKey) !== null);
  if (next === 'game' && state) {
    fitScene();
    render(gameUi, state, scene.revealedBets);
  }
}

function fitScene(): void {
  scene.fit(gameUi.sceneWrap.clientWidth || window.innerWidth - 32, window.innerHeight * 0.7);
}
window.addEventListener('resize', fitScene);

// Escena: clic en la basura (zona generosa), resaltado al pasar por encima y tecla E.
gameUi.sceneCanvas.addEventListener('click', (event) => {
  if (!state) return;
  const point = scene.toScene(event.clientX, event.clientY);
  const item = itemAt(state.work.items, point.x, point.y);
  if (!item) return;
  scene.playerCollected(collectItem(state, item.id));
  render(gameUi, state, scene.revealedBets);
});
gameUi.sceneCanvas.addEventListener('mousemove', (event) => scene.setHover(scene.toScene(event.clientX, event.clientY)));
gameUi.sceneCanvas.addEventListener('mouseleave', () => scene.setHover(null));
window.addEventListener('keydown', (event) => {
  if (screen !== 'game' || !state || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.key !== 'e' && event.key !== 'E') return;
  scene.playerCollected(collectNearest(state));
  render(gameUi, state, scene.revealedBets);
});

function enterGame(loaded: GameState): void {
  unlockAudio();
  state = loaded;
  scene.reset(loaded);
  show('game');
}

/** Solo se guarda la partida mientras se juega: así borrarla desde Ajustes no la resucita. */
function save(): void {
  if (screen !== 'game' || !state) return;
  const ok = saveGame(localStorage, saveKey, state, Date.now());
  setText(gameUi.saveStatus, ok ? `Guardado ${new Date().toLocaleTimeString()}` : 'No se pudo guardar');
}

function applySettings(): void {
  document.documentElement.dataset.crt = settings.crtEnabled ? 'on' : 'off';
  setVolume(settings.volume);
  scene.setEffectsEnabled(settings.crtEnabled);
  saveSettings(localStorage, settingsKey, settings);
}

// Pantalla de inicio
menuUi.continueButton.addEventListener('click', () => {
  const loaded = continueGame(localStorage, saveKey);
  if (loaded) enterGame(loaded);
  else show('menu');
});
menuUi.newGame.addEventListener('click', () => {
  const fresh = startNewGame(
    localStorage,
    saveKey,
    () => confirm('Ya hay una partida guardada. ¿Empezar de cero y borrarla?'),
    Date.now(),
  );
  if (fresh) enterGame(fresh);
});
menuUi.settings.addEventListener('click', () => show('settings'));
menuUi.login.addEventListener('click', () => {
  if (currentSession()) {
    setSession(null);
    show('menu');
    return;
  }
  registering = false;
  renderAuthMode(authUi, registering);
  show('auth');
});
menuUi.sync.addEventListener('click', () => {
  show('sync');
  void runSync();
});
menuUi.ranking.addEventListener('click', () => {
  rankingPage = 0;
  show('ranking');
  void loadRanking();
});

// Ajustes
settingsUi.crt.addEventListener('change', () => {
  settings.crtEnabled = settingsUi.crt.checked;
  applySettings();
});
settingsUi.volume.addEventListener('input', () => {
  settings.volume = Number(settingsUi.volume.value) / 100;
  applySettings();
  renderSettings(settingsUi, settings, continueInfo(localStorage, saveKey) !== null);
});
settingsUi.deleteSave.addEventListener('click', () => {
  if (!confirm('¿Borrar la partida guardada? No se puede deshacer.')) return;
  clearSave(localStorage, saveKey);
  renderSettings(settingsUi, settings, false);
});
settingsUi.back.addEventListener('click', () => show('menu'));

// Juego
bindControls(
  gameUi,
  () => state!,
  defaultRng,
  () => state && render(gameUi, state, scene.revealedBets),
  () => {
    save();
    state = null;
    show('menu');
  },
  () => void reportDebtPaid(),
);

// ---------------------------------------------------------------------------
// En línea (opcional). Nada de esto bloquea el juego: si el servidor no responde, se avisa y ya.

/** La sesión, si no ha caducado. */
function currentSession(): Session | null {
  if (session && Date.parse(session.expiresAt) <= Date.now()) setSession(null);
  return session;
}

function setSession(next: Session | null): void {
  session = next;
  saveSession(localStorage, sessionKey, next);
}

let registering = false;
authUi.toggle.addEventListener('click', () => {
  registering = !registering;
  renderAuthMode(authUi, registering);
});
authUi.back.addEventListener('click', () => show('menu'));
authUi.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  authUi.submit.disabled = true;
  setText(authUi.message, 'Conectando…');
  const email = authUi.email.value.trim();
  const password = authUi.password.value;
  const res = registering
    ? await api.register(email, password, authUi.displayName.value.trim())
    : await api.login(email, password);
  authUi.submit.disabled = false;
  if (!res.ok) {
    setText(authUi.message, [res.message, ...(res.details ?? [])].join(' · '));
    return;
  }
  authUi.password.value = '';
  startSession(res.data);
  show('menu');
});

function startSession(token: TokenResponse): void {
  // Una cuenta nueva no sabe en qué revisión de la nube se basa la partida local.
  setSession({ token: token.token, displayName: token.displayName, expiresAt: token.expiresAt, cloudRevision: null });
}

let pendingConflict: { server: CloudSave; local: NonNullable<ReturnType<typeof loadGame>> } | null = null;

async function runSync(): Promise<void> {
  const s = currentSession();
  if (!s) return show('menu');
  pendingConflict = null;
  showSyncStatus(syncUi, 'Sincronizando…');
  handleSync(await syncGame(api, s.token, loadGame(localStorage, saveKey), s.cloudRevision));
}

function handleSync(outcome: SyncOutcome): void {
  const s = currentSession();
  switch (outcome.kind) {
    case 'uploaded': {
      if (s) setSession({ ...s, cloudRevision: outcome.save.revision });
      const verified = outcome.save.verified
        ? 'Verificada.'
        : `No verificada (no contará para el ranking): ${outcome.save.verificationNote ?? ''}`;
      return showSyncStatus(syncUi, `Partida subida a la nube (revisión ${outcome.save.revision}). ${verified}`);
    }
    case 'downloaded':
      return adoptCloud(outcome.save, 'No había partida en este navegador: se ha descargado la de la nube.');
    case 'conflict':
      pendingConflict = { server: outcome.server, local: outcome.local };
      return showSyncStatus(syncUi, 'Hay dos versiones de la partida.', pendingConflict);
    case 'nothing':
      return showSyncStatus(syncUi, 'No hay partida ni aquí ni en la nube. Empieza una y vuelve a sincronizar.');
    case 'rejected':
      return showSyncStatus(syncUi, `El servidor ha rechazado la partida: ${[outcome.message, ...outcome.details].join(' · ')}`);
    case 'expired':
      setSession(null);
      return showSyncStatus(syncUi, 'La sesión ha caducado. Vuelve a iniciar sesión.');
    case 'offline':
      return showSyncStatus(syncUi, `${outcome.message}. Tu partida sigue guardada en este navegador.`);
  }
}

function adoptCloud(cloud: CloudSave, message: string): void {
  const file = deserialize(JSON.stringify(cloud.data));
  if (!file) return showSyncStatus(syncUi, 'La partida de la nube no se puede cargar en esta versión del juego.');
  saveGame(localStorage, saveKey, file.state, Date.now());
  const s = currentSession();
  if (s) setSession({ ...s, cloudRevision: cloud.revision });
  showSyncStatus(syncUi, message);
}

syncUi.useCloud.addEventListener('click', () => {
  if (pendingConflict) adoptCloud(pendingConflict.server, 'Ahora juegas con la partida de la nube.');
  pendingConflict = null;
});
syncUi.keepLocal.addEventListener('click', async () => {
  const s = currentSession();
  if (!pendingConflict || !s) return;
  const { server, local } = pendingConflict;
  pendingConflict = null;
  showSyncStatus(syncUi, 'Subiendo tu partida…');
  handleSync(await keepLocal(api, s.token, server, local));
});
syncUi.retry.addEventListener('click', () => void runSync());
syncUi.back.addEventListener('click', () => show('menu'));

let rankingPage = 0;
const RANKING_SIZE = 10;

async function loadRanking(): Promise<void> {
  renderRanking(rankingUi, null, 'Cargando…');
  const res = await api.ranking(rankingPage, RANKING_SIZE);
  if (!res.ok) return renderRanking(rankingUi, null, `${res.message}.`);
  renderRanking(rankingUi, res.data, res.data.totalElements === 0 ? 'Todavía nadie ha saldado la deuda.' : '');
}

rankingUi.prev.addEventListener('click', () => {
  rankingPage = Math.max(0, rankingPage - 1);
  void loadRanking();
});
rankingUi.next.addEventListener('click', () => {
  rankingPage++;
  void loadRanking();
});
rankingUi.back.addEventListener('click', () => show('menu'));

/** Al saldar la deuda con sesión iniciada, se registra el tiempo. Si falla, el juego sigue. */
async function reportDebtPaid(): Promise<void> {
  const s = currentSession();
  if (!s || !state) {
    setText(gameUi.debtOnline, 'Inicia sesión desde el menú para aparecer en el ranking la próxima vez.');
    return;
  }
  setText(gameUi.debtOnline, 'Registrando tu tiempo en el ranking…');
  const file = JSON.parse(serialize(state, Date.now()));
  const res = await api.debtPaid(s.token, file);
  if (!res.ok) {
    setText(gameUi.debtOnline, `No se pudo registrar el tiempo: ${res.message}.`);
    return;
  }
  setText(
    gameUi.debtOnline,
    res.data.verified
      ? `Tiempo registrado. Puesto ${res.data.rank} del ranking${res.data.newBest ? '' : ' (tu mejor marca sigue siendo otra)'}.`
      : `Tiempo registrado, pero no verificado: no aparecerá en el ranking. ${res.data.verificationNote ?? ''}`,
  );
}

applySettings();
show('menu');
setInterval(save, autosaveInterval * 1000);
window.addEventListener('beforeunload', save);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save();
});

let lastDt = 0;
startLoop(
  {
    update: (dt) => {
      if (screen === 'game' && state) scene.cleanerCollected(update(state, dt, defaultRng));
      lastDt = dt;
    },
    render: () => {
      if (screen === 'game' && state) {
        render(gameUi, state, scene.revealedBets);
        scene.render(state, lastDt);
      }
    },
  },
  maxFrameDt,
);
