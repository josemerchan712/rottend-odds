import '@fontsource/vt323';
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
import { startLoop } from './loop';
import { bindControls, closeDrawers, toggleDrawer } from './ui/controls';
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
import { enterFullscreen, layoutStage, mountCrt, toggleFullscreen } from './ui/stage';
import { loadSprites } from './ui/sprites';
import { collectItem, collectNearest, itemAt } from './game/work';
import { canBetManually, canCollectTrash, createRoomState, inTransition, toggleRoom, updateRooms } from './game/rooms';
import { formatNumber } from './util/format';
import { playerBet, selectBetFraction } from './game/actions';
import { stateChips } from './game/betting';
import { tooltipLines } from './ui/tooltips';
import { slotsTooltip } from './ui/tooltips2';
import { DIALOGUE2_ES } from './content/dialogue2.es';
import { playerSpin, selectSlotChip, slotCeiling, slotChips, toggleHold } from './game/slots/machine';
import {
  buySlotUpgrade,
  canSwitchTable,
  collectNearestSlotItem,
  collectSlotItem,
  paySlotsDebt,
  selectZombieProfile,
  slotsLenderPhase,
} from './game/slots/table';
import { updateGame } from './game/update';
import { SLOT_UPGRADE_IDS, UPGRADE_IDS } from './game/config';
import { createInitialState } from './game/state';
import { payDebt } from './game/debt';
import { closeDrawers2, mountUi2, render2, toggleDrawer2 } from './ui/render2';
import { SlotsScene } from './ui/slotsScene';
import { DIALOGUE_ES } from './content/dialogue.es';
import { currentMaxBet } from './game/betting';
import { lenderPhase } from './game/lender';
import {
  createWatch,
  noteRoomEntered,
  noteSessionStart,
  noteSpinShown,
  notePlayerActivity,
  observe,
  tickWatch,
  type DialogueWatch,
  type WatchSnapshot,
} from './game/dialogueWatch';
import { Speech } from './ui/speech';
import { LENDER_SIZE, LENDER_SPOT } from './ui/casinoLayout';

const { settingsKey, sessionKey, autosaveInterval, maxFrameDt } = CONFIG.tech;

/**
 * Modo desarrollador (solo con `npm run dev`): ?dev=mesa2 usa un hueco de guardado aparte con la
 * mesa 1 ya saldada y monedas de prueba, para llegar a la mesa 2 sin jugar la 1.
 */
const DEV_MESA2 = import.meta.env.DEV && new URLSearchParams(location.search).get('dev') === 'mesa2';
const saveKey = DEV_MESA2 ? `${CONFIG.tech.saveKey}-dev` : CONFIG.tech.saveKey;
if (DEV_MESA2 && !loadGame(localStorage, saveKey)) saveGame(localStorage, saveKey, devMesa2State(), Date.now());

type Screen = 'menu' | 'settings' | 'game' | 'auth' | 'sync' | 'ranking';

// Contenedor raíz (toda la ventana; es lo que va a pantalla completa) con el escenario de 640x360
// dentro: la escena de fondo, las pantallas HTML encima y el filtro CRT sobre todo.
const app = document.querySelector<HTMLElement>('#app')!;
app.innerHTML = `
  <div class="root" data-ref="root">
    <div class="stage" data-ref="stage">
      <canvas class="scene" data-ref="scene" aria-label="Mesa 1: el casino"></canvas>
      <div class="screen game" data-screen="game" hidden></div>
      <div class="screen" data-screen="menu"></div>
      <div class="screen" data-screen="settings" hidden></div>
      <div class="screen" data-screen="auth" hidden></div>
      <div class="screen" data-screen="sync" hidden></div>
      <div class="screen" data-screen="ranking" hidden></div>
    </div>
  </div>
`;
const root = app.querySelector<HTMLElement>('[data-ref="root"]')!;
const stage = app.querySelector<HTMLElement>('[data-ref="stage"]')!;
const sceneCanvas = app.querySelector<HTMLCanvasElement>('[data-ref="scene"]')!;
const screens = Object.fromEntries(
  (['menu', 'settings', 'game', 'auth', 'sync', 'ranking'] as Screen[]).map((name) => [
    name,
    app.querySelector<HTMLElement>(`[data-screen="${name}"]`)!,
  ]),
) as Record<Screen, HTMLElement>;
const crt = mountCrt(stage);
const relayout = () => layoutStage(root, stage);
window.addEventListener('resize', relayout);
document.addEventListener('fullscreenchange', relayout);
relayout();

const menuUi = mountMenu(screens.menu);
const settingsUi = mountSettings(screens.settings);
// La pantalla de juego: una capa de HUD y cajones por mesa, el fundido entre mesas y el cartel.
screens.game.innerHTML = `
  <div class="table-layer" data-layer="1"></div>
  <div class="table-layer" data-layer="2" hidden></div>
  <div class="table-fade" data-ref="tableFade"></div>
  <div class="banner pixel-frame" data-ref="banner" hidden>
    <h2 data-ref="bannerTitle"></h2>
    <p data-ref="bannerText"></p>
    <button class="gold small" data-ref="bannerButton"></button>
  </div>`;
const layers = [1, 2].map((n) => screens.game.querySelector<HTMLElement>(`[data-layer="${n}"]`)!);
const gameRef = <T extends HTMLElement = HTMLElement>(name: string) => screens.game.querySelector<T>(`[data-ref="${name}"]`)!;
const tableFadeEl = gameRef('tableFade');
const banner = { root: gameRef('banner'), title: gameRef('bannerTitle'), text: gameRef('bannerText'), button: gameRef<HTMLButtonElement>('bannerButton') };
const gameUi = mountUi(layers[0]);
const slotsUi = mountUi2(layers[1]);
const authUi = mountAuth(screens.auth);
const syncUi = mountSync(screens.sync);
const rankingUi = mountRanking(screens.ranking);

const sprites = loadSprites();
const scene = new Scene(sceneCanvas, sprites);
const slotsScene = new SlotsScene(sceneCanvas, sprites);
const SPEAKERS = { 1: 'EL ENCARGADO', 2: 'TRAGAPERRAS VIVIENTE' } as const;
const speech = new Speech(screens.game, SPEAKERS[1]);
/** Cuándo habla el prestamista de cada mesa (se crean al entrar en la partida). */
const watches: Record<1 | 2, DialogueWatch | null> = { 1: null, 2: null };

function snapshot(current: GameState): WatchSnapshot {
  return { balance: current.balance, phase: lenderPhase(current), helperBought: current.upgrades.crupier > 0, debtPaid: current.debtPaid };
}

function snapshot2(current: GameState): WatchSnapshot {
  const slots = current.slots;
  return { balance: slots.balance, phase: slotsLenderPhase(slots), helperBought: slots.upgrades.zombie > 0, debtPaid: slots.debtPaid };
}

/** Mesa que se ve ahora. */
function activeTable(): 1 | 2 {
  return state?.activeTable ?? 1;
}

scene.onSpinShown = (spin) => {
  const w = watches[1];
  if (w && state) noteSpinShown(w, spin, currentMaxBet(state));
};
slotsScene.onSpinShown = (spin) => {
  const w = watches[2];
  if (!w || !state) return;
  const outcome = spin.outcome === 'nada' ? 'pierde' : spin.outcome === 'jackpot' ? 'jackpot' : 'gana';
  noteSpinShown(w, { bettor: spin.bettor, bet: spin.bet, outcome }, slotCeiling(state.slots));
};
// Cualquier clic o tecla durante la partida cuenta como actividad (para el silencio largo).
const activity = () => {
  const w = watches[activeTable()];
  if (screen === 'game' && w) notePlayerActivity(w);
};
screens.game.addEventListener('pointerdown', activity, true);
sceneCanvas.addEventListener('pointerdown', activity);
window.addEventListener('keydown', activity);

const api = createApi();
let session: Session | null = loadSession(localStorage, sessionKey, Date.now());

let screen: Screen = 'menu';
/** Sala actual de la mesa 1 (no se guarda: siempre se empieza en el casino). */
let rooms = createRoomState();
/** Partida en curso; null fuera del juego. */
let state: GameState | null = null;
const settings = loadSettings(localStorage, settingsKey);

function show(next: Screen): void {
  screen = next;
  for (const [name, el] of Object.entries(screens)) el.hidden = name !== next;
  if (next === 'menu') renderMenu(menuUi, continueInfo(localStorage, saveKey), currentSession()?.displayName ?? null);
  if (next === 'settings') renderSettings(settingsUi, settings, continueInfo(localStorage, saveKey) !== null);
  if (next === 'game' && state) renderHud(state);
}

/** Pinta la capa de la mesa activa y las pestañas. */
function renderHud(current: GameState): void {
  const table = current.activeTable;
  layers[0].hidden = table !== 1;
  layers[1].hidden = table !== 2;
  for (const ui of [gameUi, slotsUi]) {
    ui.tabs.hidden = !current.debtPaid;
    ui.tabButtons.forEach((b) => b.classList.toggle('active', Number(b.dataset.table) === table));
  }
  if (table === 1) render(gameUi, current);
  else render2(slotsUi, current);
}

// ---------------------------------------------------------------------------
// Cambio de mesa: fundido a negro con un rótulo; a mitad cambia la mesa y se vuelve al salón.

const TABLE_FADE_SECONDS = 0.55;
const TABLE_CAPTIONS = { 1: 'MESA 1 · LA RULETA', 2: 'MESA 2 · LAS TRAGAPERRAS' } as const;
let tableFade: { to: 1 | 2; elapsed: number; switched: boolean } | null = null;

function switchTable(to: 1 | 2): void {
  if (!state || tableFade || !canSwitchTable(state, to)) return;
  tableFade = { to, elapsed: 0, switched: false };
  tableFadeEl.textContent = TABLE_CAPTIONS[to];
  banner.root.hidden = true;
  closeDrawers(gameUi);
  closeDrawers2(slotsUi);
}

function updateTableFade(current: GameState, dt: number): void {
  if (!tableFade) {
    tableFadeEl.style.opacity = '0';
    return;
  }
  tableFade.elapsed += dt;
  const t = tableFade.elapsed;
  if (!tableFade.switched && t >= TABLE_FADE_SECONDS) {
    tableFade.switched = true;
    const firstVisit = tableFade.to === 2 && current.slots.playTime === 0;
    current.activeTable = tableFade.to;
    rooms = createRoomState();
    scene.reset(current);
    slotsScene.reset(current);
    speech.close();
    speech.setSpeaker(SPEAKERS[tableFade.to]);
    if (firstVisit) noteSessionStart(watches[2]!, 'new');
  }
  // Sube, se queda un instante con el rótulo y baja.
  const hold = 0.35;
  const total = TABLE_FADE_SECONDS * 2 + hold;
  const alpha = t < TABLE_FADE_SECONDS ? t / TABLE_FADE_SECONDS : t < TABLE_FADE_SECONDS + hold ? 1 : Math.max(0, (total - t) / TABLE_FADE_SECONDS);
  tableFadeEl.style.opacity = String(alpha);
  if (t >= total) tableFade = null;
}

for (const ui of [gameUi, slotsUi]) {
  ui.tabButtons.forEach((b) => b.addEventListener('click', () => switchTable(Number(b.dataset.table) as 1 | 2)));
}

let bannerAction: (() => void) | null = null;
banner.button.addEventListener('click', () => {
  banner.root.hidden = true;
  bannerAction?.();
});

function showBanner(title: string, text: string, button: string, action: () => void): void {
  banner.title.textContent = title;
  banner.text.textContent = text;
  banner.button.textContent = button;
  bannerAction = action;
  banner.root.hidden = false;
}

// Escena: clic en la basura (zona generosa), resaltado al pasar por encima y tecla E.
sceneCanvas.addEventListener('click', (event) => {
  if (!state || screen !== 'game' || tableFade) return;
  const point = scene.toScene(event.clientX, event.clientY);
  if (activeTable() === 2) {
    clickSlots(state, point);
    return;
  }
  if (!inTransition(rooms) && scene.doorAt(point, rooms.current)) {
    toggleRoom(rooms);
    return;
  }
  // Casino: elegir ficha o apostar en una zona del tapete (gira en el acto).
  const target = scene.casinoTarget(state, point);
  if (target?.kind === 'chip') {
    selectBetFraction(state, target.chip.index);
    return;
  }
  if (target?.kind === 'zone') {
    if (!target.locked && canBetManually(rooms)) playerBet(state, target.zone.choice, defaultRng);
    return;
  }
  if (!canCollectTrash(rooms)) return;
  const item = itemAt(state.work.items, point.x, point.y);
  if (!item) return;
  scene.playerCollected(collectItem(state, item.id));
  render(gameUi, state);
});
/** Clic en la escena de la mesa 2: puerta, ficha, carrete (retener), tirar o basura. */
function clickSlots(current: GameState, point: { x: number; y: number }): void {
  const slots = current.slots;
  if (!inTransition(rooms) && slotsScene.doorAt(point, rooms.current)) {
    toggleRoom(rooms);
    return;
  }
  const target = slotsScene.target(current, point);
  if (target?.kind === 'chip') selectSlotChip(slots, target.chip.index);
  else if (target?.kind === 'reel') toggleHold(slots, target.reel);
  else if (target?.kind === 'spin') spinSlots();
  if (target || !canCollectTrash(rooms)) return;
  const item = slotsScene.trashAt(current, point);
  if (!item) return;
  slotsScene.playerCollected(collectSlotItem(slots, item.id));
}

/** El jugador tira de la palanca (solo en la sala de las tragaperras). */
function spinSlots(): void {
  if (!state || !canBetManually(rooms)) return;
  playerSpin(state.slots, defaultRng);
}

sceneCanvas.addEventListener('mousemove', (event) => {
  const point = scene.toScene(event.clientX, event.clientY);
  scene.setHover(point);
  slotsScene.setHover(point);
});
sceneCanvas.addEventListener('mouseleave', () => {
  scene.setHover(null);
  slotsScene.setHover(null);
});
window.addEventListener('keydown', (event) => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.key === 'f' || event.key === 'F') {
    void toggleFullscreen(root);
    return;
  }
  if (screen !== 'game' || !state) return;
  const table2 = activeTable() === 2;
  if (event.key === 'Escape') {
    closeDrawers(gameUi);
    closeDrawers2(slotsUi);
    return;
  }
  if (event.key === 'm' || event.key === 'M') {
    if (table2) toggleDrawer2(slotsUi, 'mesa');
    else toggleDrawer(gameUi, 'mesa');
    return;
  }
  if (event.key === 'a' || event.key === 'A') {
    if (table2) toggleDrawer2(slotsUi, 'ayuda');
    else toggleDrawer(gameUi, 'ayuda');
    return;
  }
  if (event.key === 'Tab') {
    event.preventDefault();
    if (!tableFade) toggleRoom(rooms);
    return;
  }
  if (table2) {
    if (event.key === ' ' && rooms.current === 'casino') {
      event.preventDefault();
      spinSlots();
    } else if (/^[1-4]$/.test(event.key) && rooms.current === 'casino') {
      const chip = slotChips(state.slots)[Number(event.key) - 1];
      if (chip) selectSlotChip(state.slots, chip.index);
    } else if ((event.key === 'e' || event.key === 'E') && canCollectTrash(rooms)) {
      slotsScene.playerCollected(collectNearestSlotItem(state.slots));
    }
    return;
  }
  // Teclas 1-4: las fichas visibles, de izquierda a derecha (de arriba abajo en la columna).
  if (/^[1-4]$/.test(event.key) && rooms.current === 'casino') {
    const chip = stateChips(state)[Number(event.key) - 1];
    if (chip) selectBetFraction(state, chip.index);
    return;
  }
  if (event.key !== 'e' && event.key !== 'E') return;
  if (!canCollectTrash(rooms)) return;
  scene.playerCollected(collectNearest(state));
  render(gameUi, state);
});

function enterGame(loaded: GameState, start: { kind: 'new' | 'resume'; absenceSeconds?: number }): void {
  // El clic de Continuar o Nueva partida es el gesto que permite el audio y la pantalla completa.
  unlockAudio();
  if (settings.startFullscreen) void enterFullscreen(root);
  state = loaded;
  rooms = createRoomState();
  scene.reset(loaded);
  slotsScene.reset(loaded);
  speech.close();
  speech.setSpeaker(SPEAKERS[loaded.activeTable]);
  watches[1] = createWatch(snapshot(loaded));
  watches[2] = createWatch(snapshot2(loaded));
  noteSessionStart(watches[loaded.activeTable]!, start.kind, start.absenceSeconds);
  tableFade = null;
  banner.root.hidden = true;
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
  crt.setEnabled(settings.crtEnabled);
  setVolume(settings.volume);
  scene.setEffectsEnabled(settings.crtEnabled);
  saveSettings(localStorage, settingsKey, settings);
}

// Pantalla de inicio
menuUi.continueButton.addEventListener('click', () => {
  const savedAt = loadGame(localStorage, saveKey)?.savedAt ?? Date.now();
  const loaded = continueGame(localStorage, saveKey);
  if (loaded) enterGame(loaded, { kind: 'resume', absenceSeconds: Math.max(0, (Date.now() - savedAt) / 1000) });
  else show('menu');
});
menuUi.newGame.addEventListener('click', () => {
  const fresh = startNewGame(
    localStorage,
    saveKey,
    () => confirm('Ya hay una partida guardada. ¿Empezar de cero y borrarla?'),
    Date.now(),
  );
  if (fresh) enterGame(fresh, { kind: 'new' });
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
settingsUi.dialogues.addEventListener('change', () => {
  settings.dialogues = settingsUi.dialogues.checked;
  applySettings();
});
settingsUi.fullscreen.addEventListener('change', () => {
  settings.startFullscreen = settingsUi.fullscreen.checked;
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
gameUi.fullscreen.addEventListener('click', () => void toggleFullscreen(root));
// Fuera del casino, las tiradas del ayudante se avisan en el HUD.
let toastTimer = 0;
scene.onAwayResult = (spin) => {
  const won = spin.delta >= 0;
  gameUi.toast.textContent = `Ayudante ${won ? '+' : '−'}${formatNumber(Math.abs(spin.delta))}`;
  gameUi.toast.dataset.kind = spin.outcome;
  gameUi.toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => gameUi.toast.classList.remove('show'), 1400);
};

const toMenu = () => {
  save();
  state = null;
  show('menu');
};
bindControls(
  gameUi,
  () => state!,
  () => state && renderHud(state),
  toMenu,
  () => {
    void reportDebtPaid();
    showBanner('MESA 1 SALDADA', 'El Encargado tiene su dinero. Abajo se abre la sala de las tragaperras.', 'Bajar a la mesa 2', () => switchTable(2));
  },
);

// Mesa 2: tienda, perfiles del zombi, pago de la deuda, pantalla completa y menú.
for (const id of SLOT_UPGRADE_IDS) {
  slotsUi.shop[id].buy.addEventListener('click', () => {
    if (!state) return;
    buySlotUpgrade(state.slots, id);
    renderHud(state);
  });
}
slotsUi.profileButtons.forEach((b, i) => b.addEventListener('click', () => state && selectZombieProfile(state.slots, i)));
slotsUi.payDebt.addEventListener('click', () => {
  if (!state || !paySlotsDebt(state.slots)) return;
  renderHud(state);
  showBanner('MESA 2 SALDADA', 'La Tragaperras viviente ha cobrado. La mesa 3 todavía no está abierta.', 'Seguir', () => {});
});
slotsUi.fullscreen.addEventListener('click', () => void toggleFullscreen(root));
slotsUi.toMenu.addEventListener('click', toMenu);
for (const id of ['mesa', 'ayuda'] as const) slotsUi.drawers[id].tab.addEventListener('click', () => toggleDrawer2(slotsUi, id));
slotsUi.statsToggle.addEventListener('click', () => {
  slotsUi.statsBody.hidden = !slotsUi.statsBody.hidden;
  slotsUi.statsToggle.textContent = slotsUi.statsBody.hidden ? 'Estadísticas ▸' : 'Estadísticas ▾';
});
let toast2Timer = 0;
slotsScene.onAwayResult = (spin) => {
  slotsUi.toast.textContent = `Zombi ${spin.delta >= 0 ? '+' : '−'}${formatNumber(Math.abs(spin.delta))}`;
  slotsUi.toast.dataset.kind = spin.outcome === 'nada' ? 'pierde' : spin.outcome === 'jackpot' ? 'jackpot' : 'gana';
  slotsUi.toast.classList.add('show');
  window.clearTimeout(toast2Timer);
  toast2Timer = window.setTimeout(() => slotsUi.toast.classList.remove('show'), 1400);
};

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

let noteTimer = 0;
/** Nota breve bajo el HUD (deuda saldada, ranking). */
function showNote(text: string): void {
  gameUi.note.textContent = text;
  gameUi.note.classList.add('show');
  window.clearTimeout(noteTimer);
  noteTimer = window.setTimeout(() => gameUi.note.classList.remove('show'), 5000);
}

/** Al saldar la deuda: aviso y, con sesión iniciada, registro del tiempo. Si falla, el juego sigue. */
async function reportDebtPaid(): Promise<void> {
  const s = currentSession();
  if (!s || !state) {
    showNote('Deuda saldada. Inicia sesión desde el menú para salir en el ranking la próxima vez.');
    return;
  }
  showNote('Deuda saldada. Registrando tu tiempo en el ranking…');
  const file = JSON.parse(serialize(state, Date.now()));
  const res = await api.debtPaid(s.token, file);
  if (!res.ok) {
    showNote(`Deuda saldada. No se pudo registrar el tiempo: ${res.message}.`);
    return;
  }
  showNote(
    res.data.verified
      ? `Tiempo registrado. Puesto ${res.data.rank} del ranking${res.data.newBest ? '' : ' (tu mejor marca sigue siendo otra)'}.`
      : 'Tiempo registrado, pero no verificado: no aparecerá en el ranking.',
  );
}

applySettings();
show('menu');
setInterval(save, autosaveInterval * 1000);
window.addEventListener('beforeunload', save);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save();
});

/** Tooltip pixelado junto al ratón para las zonas del tapete, las fichas, los carretes y la palanca. */
function updateTooltip(current: GameState): void {
  const table2 = current.activeTable === 2;
  const point = scene.hoverPoint;
  const tip = table2 ? slotsUi.tooltip : gameUi.tooltip;
  let lines: string[] | null = null;
  if (point && !inTransition(rooms) && !tableFade) {
    if (table2) {
      const target = slotsScene.target(current, point);
      if (target) lines = slotsTooltip(current, target);
    } else {
      const target = scene.casinoTarget(current, point);
      if (target) lines = tooltipLines(current, target);
    }
  }
  if (!lines || !point) {
    tip.hidden = true;
    return;
  }
  const html = lines
    .map((line, i) => `<div${i === 0 ? ' class="tip-title"' : ''}>${line.replace(/[<>&]/g, '')}</div>`)
    .join('');
  if (tip.dataset.html !== html) {
    tip.innerHTML = html;
    tip.dataset.html = html;
  }
  tip.hidden = false;
  // Junto al ratón, sin salirse del escenario (unidades de 640x360).
  const left = Math.min(point.x + 10, 640 - tip.offsetWidth - 4);
  const top = point.y - tip.offsetHeight - 8 < 22 ? point.y + 14 : point.y - tip.offsetHeight - 8;
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

/** El bocadillo empieza a la derecha de la rueda para no taparla. */
const SPEECH_MIN_LEFT = 344;

/** El prestamista de la mesa activa: motivos de lo que pasa, una línea cuando se puede y el bocadillo. */
function updateDialogue(current: GameState, dt: number, entered: ReturnType<typeof updateRooms>): void {
  const table = current.activeTable;
  const watch = watches[table];
  if (!watch) return;
  if (entered) noteRoomEntered(watch, entered);
  observe(watch, table === 1 ? snapshot(current) : snapshot2(current));
  const inFlight = table === 1 ? scene.spinInFlight(current) : slotsScene.spinInFlight();
  const blocked = inTransition(rooms) || tableFade !== null || inFlight || !settings.dialogues;
  const line =
    table === 1
      ? tickWatch(watch, dt, DIALOGUE_ES, lenderPhase(current), defaultRng, blocked)
      : tickWatch(watch, dt, DIALOGUE2_ES, slotsLenderPhase(current.slots), defaultRng, blocked);
  if (line) speech.say(line.text);
  if (!settings.dialogues && speech.speaking) speech.close();
  const inHall = rooms.current === 'casino' && !inTransition(rooms);
  // Mesa 2: el bocadillo sale a la derecha de la cabeza de la Tragaperras viviente.
  const anchor = table === 1 ? { x: LENDER_SPOT.x, y: LENDER_SPOT.y - LENDER_SIZE + 4 } : { x: 380, y: 44 };
  speech.update(dt, inHall ? { mode: 'bubble', anchor, minLeft: table === 1 ? SPEECH_MIN_LEFT : 372 } : { mode: 'box' });
}

let lastDt = 0;
startLoop(
  {
    update: (dt) => {
      if (screen === 'game' && state) {
        const entered = updateRooms(rooms, dt);
        const tick = updateGame(state, dt, defaultRng);
        if (state.activeTable === 1) scene.cleanerCollected(tick.cleaned);
        else slotsScene.cleanerCollected(tick.slots.cleaned);
        updateTableFade(state, dt);
        updateDialogue(state, dt, entered);
      }
      lastDt = dt;
    },
    render: () => {
      crt.tick();
      if (screen === 'game' && state) {
        renderHud(state);
        if (state.activeTable === 1) scene.render(state, lastDt, rooms);
        else slotsScene.render(state, lastDt, rooms);
        updateTooltip(state);
      }
    },
  },
  maxFrameDt,
);

/** Partida de prueba del modo desarrollador: mesa 1 con todo comprado y saldada, y monedas para la mesa 2. */
function devMesa2State(): GameState {
  const dev = createInitialState();
  for (const id of UPGRADE_IDS) dev.upgrades[id] = CONFIG.upgrades[id].maxLevel;
  dev.helper.profile = 1;
  dev.balance = CONFIG.debt.amount + 50_000;
  payDebt(dev);
  dev.playTime = 8 * 60;
  dev.slots.balance = 2_000;
  return dev;
}
