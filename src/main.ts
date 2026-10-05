import '@fontsource/vt323';
import './ui/style.css';
import { createApi, ONLINE_ENABLED, type CloudSave, type TokenResponse } from './api/client';
import { mountEnding, renderEnding } from './ui/ending';
import { mountTextLayer } from './ui/sceneText';
import { gameSummary, isGameFinished } from './game/summary';
import { loadSession, saveSession, type Session } from './api/session';
import { keepLocal, syncGame, type SyncOutcome } from './api/sync';
import { isMuted, outcomeSound, setAmbient, setMuted, setVolume, sfx, unlockAudio } from './audio';
import { CONFIG } from './game/config';
import { continueGame, continueInfo, startNewGame } from './game/menu';
import { defaultRng } from './game/rng';
import { clearSave, deserialize, loadGame, saveGame, serialize } from './game/save';
import { CRT_LEVELS, loadSettings, saveSettings } from './game/settings';
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
import { enterFullscreen, fitHud, layoutStage, mountCrt, toggleFullscreen } from './ui/stage';
import { loadSprites, whenSpritesLoaded } from './ui/sprites';
import { collectItem, collectNearest, itemAt } from './game/work';
import { canBetManually, canCollectTrash, createRoomState, inTransition, toggleRoom, updateRooms } from './game/rooms';
import { playerBet, selectBetFraction } from './game/actions';
import { stateChips } from './game/betting';
import { tooltipLines } from './ui/tooltips';
import { slotsTooltip } from './ui/tooltips2';
import { DIALOGUE2_ES } from './content/dialogue2.es';
import { playerSpin, selectSlotChip, slotCeiling, slotChips, toggleHold } from './game/slots/machine';
import {
  buySlotUpgrade,
  paySlotsDebt,
  selectZombieProfile,
  slotsLenderPhase,
} from './game/slots/table';
import { updateGame } from './game/update';
import { HELPER_NET_SECONDS, helperMeters, netText } from './ui/helperMeter';
import { SLOT_UPGRADE_IDS, UPGRADE_IDS } from './game/config';
import { createInitialState, type TableId } from './game/state';
import { canSwitchTo } from './game/tables';
import { payDebt } from './game/debt';
import { closeDrawers2, mountUi2, render2, toggleDrawer2 } from './ui/render2';
import { SlotsScene } from './ui/slotsScene';
import { DiceScene } from './ui/diceScene';
import { CardsScene } from './ui/cardsScene';
import { closeDrawers4, mountUi4, render4, toggleDrawer4 } from './ui/render4';
import { cardsTooltip } from './ui/tooltips4';
import { DIALOGUE4_ES } from './content/dialogue4.es';
import { acceptBust, cardsCeiling, cardsChips, discard as discardCard, hit as hitCard, playerDeal, selectCardsChip, stand as standHand } from './game/cards/game';
import {
  buyCardsUpgrade,
  cardsLenderPhase,
  payCardsDebt,
  selectSkeletonProfile,
} from './game/cards/table';
import { isTableUnlocked } from './game/tables';
import { CoinScene } from './ui/coinScene';
import { closeDrawers5, mountUi5, render5, toggleDrawer5 } from './ui/render5';
import { coinTooltip } from './ui/tooltips5';
import { DIALOGUE5_ES } from './content/dialogue5.es';
import {
  acceptLoss,
  armHold,
  cashOut,
  chainInPlay,
  coinCeiling,
  coinChips,
  continueChain,
  selectCoinChip,
  selectCoinKind,
  selectedCoinChip,
  startChain,
  useGoldenZero,
  useMark,
  useReroll,
} from './game/coin/game';
import type { HeirloomId } from './game/config';
import { buyCoinUpgrade, buyHeirloom, coinLenderPhase, payCoinDebt, selectImpProfile } from './game/coin/table';
import { COIN_UPGRADE_IDS, HEIRLOOM_IDS } from './game/config';
import { CARD_UPGRADE_IDS } from './game/config';
import { closeDrawers3, mountUi3, render3, toggleDrawer3 } from './ui/render3';
import { diceTooltip } from './ui/tooltips3';
import { DIALOGUE3_ES } from './content/dialogue3.es';
import { closeOpenRoll, diceCeiling, diceChips, openRoll, playerRoll, reroll, selectDiceChip, selectTarget } from './game/dice/game';
import {
  buyDiceUpgrade,
  diceLenderPhase,
  payDiceDebt,
  selectGhostProfile,
} from './game/dice/table';
import { DICE_TARGETS, DICE_UPGRADE_IDS } from './game/config';
import { DIALOGUE_ES } from './content/dialogue.es';
import { currentMaxBet } from './game/betting';
import { lenderPhase } from './game/lender';
import {
  createWatch,
  noteRoomEntered,
  noteChainMilestone,
  noteSessionStart,
  noteSpinShown,
  notePlayerActivity,
  observe,
  rebaseWatch,
  tickWatch,
  type DialogueWatch,
  type WatchSnapshot,
} from './game/dialogueWatch';
import { Speech } from './ui/speech';
import { LENDER_SIZE, LENDER_SPOT } from './ui/casinoLayout';

const { settingsKey, sessionKey, autosaveInterval, maxFrameDt } = CONFIG.tech;

/**
 * Modo desarrollador (solo con `npm run dev`): ?dev=mesa2 … ?dev=mesa5 usan un hueco de guardado
 * aparte con las mesas anteriores saldadas y moneda de prueba, para llegar sin jugarlas.
 */
const DEV_MODE = import.meta.env.DEV ? new URLSearchParams(location.search).get('dev') : null;
const DEV_TABLE = DEV_MODE === 'mesa2' ? 2 : DEV_MODE === 'mesa3' ? 3 : DEV_MODE === 'mesa4' ? 4 : DEV_MODE === 'mesa5' ? 5 : null;
const saveKey = DEV_TABLE ? `${CONFIG.tech.saveKey}-dev${DEV_TABLE}` : CONFIG.tech.saveKey;
if (DEV_TABLE && !loadGame(localStorage, saveKey)) saveGame(localStorage, saveKey, devState(DEV_TABLE), Date.now());

type Screen = 'menu' | 'settings' | 'game' | 'auth' | 'sync' | 'ranking' | 'ending' | 'notice';

// Contenedor raíz (toda la ventana; es lo que va a pantalla completa) con el escenario de 640x360
// dentro: la escena de fondo, las pantallas HTML encima y el filtro CRT sobre todo.
const app = document.querySelector<HTMLElement>('#app')!;
app.innerHTML = `
  <div class="root" data-ref="root">
    <div class="stage" data-ref="stage">
      <canvas class="scene" data-ref="scene" aria-label="Mesa 1: el casino"></canvas>
      <canvas class="scene-text" data-ref="sceneText" aria-hidden="true"></canvas>
      <div class="screen game" data-screen="game" hidden></div>
      <div class="screen" data-screen="menu"></div>
      <div class="screen" data-screen="settings" hidden></div>
      <div class="screen" data-screen="auth" hidden></div>
      <div class="screen" data-screen="sync" hidden></div>
      <div class="screen" data-screen="ranking" hidden></div>
      <div class="screen" data-screen="ending" hidden></div>
      <div class="screen" data-screen="notice" hidden>
        <section class="panel menu small-screen">
          <h1>Casino</h1>
          <p>Este juego está pensado para ordenador, con ratón y teclado y una pantalla de al menos 900 px.</p>
          <div class="menu-options"><button data-ref="noticeContinue">Seguir de todos modos</button></div>
        </section>
      </div>
    </div>
  </div>
`;
const root = app.querySelector<HTMLElement>('[data-ref="root"]')!;
const stage = app.querySelector<HTMLElement>('[data-ref="stage"]')!;
const sceneCanvas = app.querySelector<HTMLCanvasElement>('[data-ref="scene"]')!;
const screens = Object.fromEntries(
  (['menu', 'settings', 'game', 'auth', 'sync', 'ranking', 'ending', 'notice'] as Screen[]).map((name) => [
    name,
    app.querySelector<HTMLElement>(`[data-screen="${name}"]`)!,
  ]),
) as Record<Screen, HTMLElement>;
const crt = mountCrt(stage);
mountTextLayer(app.querySelector<HTMLCanvasElement>('[data-ref="sceneText"]')!);
// Recolocar con debounce: al volver de otra pestaña o aplicación, o al minimizar, llegan eventos con
// tamaños o dpr transitorios; se espera a que se asienten y se ignoran los de la página oculta. Si no
// hay medidas válidas (página oculta o sin tamaño, también al cargar), se reintenta hasta que las haya.
let relayoutTimer = 0;
const scheduleRelayout = () => {
  window.clearTimeout(relayoutTimer);
  relayoutTimer = window.setTimeout(relayout, 120);
};
function relayout(): void {
  if (!layoutStage(root, stage)) scheduleRelayout();
}
window.addEventListener('resize', scheduleRelayout);
document.addEventListener('fullscreenchange', () => {
  relayout();
  scheduleRelayout();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) scheduleRelayout();
});
window.addEventListener('pageshow', scheduleRelayout);
// Si cambia el dpr (otro monitor, zoom del navegador) sin redimensionar, también hay que recolocar.
const watchDpr = () => {
  matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener(
    'change',
    () => {
      scheduleRelayout();
      watchDpr();
    },
    { once: true },
  );
};
watchDpr();
relayout();

const menuUi = mountMenu(screens.menu);
const settingsUi = mountSettings(screens.settings);
// La pantalla de juego: una capa de HUD y cajones por mesa, el fundido entre mesas y el cartel.
screens.game.innerHTML = `
  <div class="table-layer" data-layer="1"></div>
  <div class="table-layer" data-layer="2" hidden></div>
  <div class="table-layer" data-layer="3" hidden></div>
  <div class="table-layer" data-layer="4" hidden></div>
  <div class="table-layer" data-layer="5" hidden></div>
  <div class="table-fade" data-ref="tableFade"></div>
  <div class="banner pixel-frame" data-ref="banner" hidden>
    <h2 data-ref="bannerTitle"></h2>
    <p data-ref="bannerText"></p>
    <button class="gold small" data-ref="bannerButton"></button>
  </div>`;
const layers = [1, 2, 3, 4, 5].map((n) => screens.game.querySelector<HTMLElement>(`[data-layer="${n}"]`)!);
const gameRef = <T extends HTMLElement = HTMLElement>(name: string) => screens.game.querySelector<T>(`[data-ref="${name}"]`)!;
const tableFadeEl = gameRef('tableFade');
const banner = { root: gameRef('banner'), title: gameRef('bannerTitle'), text: gameRef('bannerText'), button: gameRef<HTMLButtonElement>('bannerButton') };
const gameUi = mountUi(layers[0]);
const slotsUi = mountUi2(layers[1]);
const diceUi = mountUi3(layers[2]);
const cardsUi = mountUi4(layers[3]);
const coinUi = mountUi5(layers[4]);
const authUi = mountAuth(screens.auth);
const syncUi = mountSync(screens.sync);
const rankingUi = mountRanking(screens.ranking);
const endingUi = mountEnding(screens.ending);
if (!ONLINE_ENABLED) menuUi.online.hidden = true;

const sprites = loadSprites();
const scene = new Scene(sceneCanvas, sprites);
const slotsScene = new SlotsScene(sceneCanvas, sprites);
const diceScene = new DiceScene(sceneCanvas, sprites);
const cardsScene = new CardsScene(sceneCanvas, sprites);
const coinScene = new CoinScene(sceneCanvas, sprites);
const SPEAKERS = { 1: 'EL ENCARGADO', 2: 'TRAGAPERRAS VIVIENTE', 3: 'EL BARMAN', 4: 'LA CRUPIER', 5: 'EL DUEÑO' } as const;
const speech = new Speech(screens.game, SPEAKERS[1]);
/** Cuándo habla el prestamista de cada mesa (se crean al entrar en la partida). */
const watches: Record<TableId, DialogueWatch | null> = { 1: null, 2: null, 3: null, 4: null, 5: null };

function snapshot(current: GameState): WatchSnapshot {
  return { balance: current.balance, phase: lenderPhase(current), helperBought: current.upgrades.crupier > 0, debtPaid: current.debtPaid };
}

function snapshot3(current: GameState): WatchSnapshot {
  const dice = current.dice;
  return { balance: dice.balance, phase: diceLenderPhase(dice), helperBought: dice.upgrades.ghost > 0, debtPaid: dice.debtPaid };
}

function snapshot4(current: GameState): WatchSnapshot {
  const cards = current.cards;
  return { balance: cards.balance, phase: cardsLenderPhase(cards), helperBought: cards.upgrades.skeleton > 0, debtPaid: cards.debtPaid };
}

function snapshot5(current: GameState): WatchSnapshot {
  const coin = current.coin;
  return { balance: coin.balance, phase: coinLenderPhase(coin), helperBought: coin.upgrades.imp > 0, debtPaid: coin.debtPaid };
}

function snapshotFor(current: GameState, table: TableId): WatchSnapshot {
  if (table === 5) return snapshot5(current);
  return table === 1 ? snapshot(current) : table === 2 ? snapshot2(current) : table === 3 ? snapshot3(current) : snapshot4(current);
}

function snapshot2(current: GameState): WatchSnapshot {
  const slots = current.slots;
  return { balance: slots.balance, phase: slotsLenderPhase(slots), helperBought: slots.upgrades.zombie > 0, debtPaid: slots.debtPaid };
}

/** Mesa que se ve ahora. */
function activeTable(): TableId {
  return state?.activeTable ?? 1;
}

scene.onSpinShown = (spin) => {
  if (state) outcomeSound(spin.bettor, spin.outcome === 'jackpot' ? 'jackpot' : spin.delta > 0 ? 'gana' : 'pierde', spin.bet, currentMaxBet(state));
  const w = watches[1];
  if (w && state) noteSpinShown(w, spin, currentMaxBet(state));
};
cardsScene.onHandShown = (hand) => {
  if (state) outcomeSound(hand.bettor, hand.jackpot > 0 ? 'jackpot' : hand.result === 'gana' ? 'gana' : 'pierde', hand.bet, cardsCeiling(state.cards));
  const w = watches[4];
  if (!w || !state) return;
  noteSpinShown(w, { bettor: hand.bettor, bet: hand.bet, outcome: hand.jackpot > 0 ? 'jackpot' : hand.result === 'gana' ? 'gana' : 'pierde' }, cardsCeiling(state.cards));
};
coinScene.onChainStep = (wins) => {
  const w = watches[5];
  if (w) noteChainMilestone(w, wins);
};
coinScene.onChainShown = (chain) => {
  const outcome = chain.jackpot > 0 ? 'jackpot' : chain.delta > 0 ? 'gana' : 'pierde';
  if (state) outcomeSound(chain.bettor, outcome, chain.stake * 2 ** chain.wins, coinCeiling(state.coin));
  const w = watches[5];
  if (!w || !state) return;
  // Lo que se arriesgaba al final: la apuesta doblada tantas veces como caras.
  const atRisk = chain.value;
  noteSpinShown(w, { bettor: chain.bettor, bet: chain.result === 'perdido' ? atRisk : chain.stake, outcome }, coinCeiling(state.coin));
};
diceScene.onRollShown = (roll) => {
  if (state) outcomeSound(roll.bettor, roll.jackpot > 0 ? 'jackpot' : roll.won ? 'gana' : 'pierde', roll.bet, diceCeiling(state.dice));
  const w = watches[3];
  if (!w || !state) return;
  noteSpinShown(w, { bettor: roll.bettor, bet: roll.bet, outcome: roll.jackpot > 0 ? 'jackpot' : roll.won ? 'gana' : 'pierde' }, diceCeiling(state.dice));
};
slotsScene.onSpinShown = (spin) => {
  const outcome = spin.outcome === 'nada' ? 'pierde' : spin.outcome === 'jackpot' ? 'jackpot' : 'gana';
  if (state) outcomeSound(spin.bettor, outcome, spin.bet, slotCeiling(state.slots));
  const w = watches[2];
  if (!w || !state) return;
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
// El audio solo arranca tras un gesto; cualquier clic o tecla vale (además de Continuar y Nueva partida).
window.addEventListener('pointerdown', () => state && unlockAudio());
window.addEventListener('keydown', () => state && unlockAudio());

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
  setAmbient(next === 'game' && state ? state.activeTable : null);
  for (const [name, el] of Object.entries(screens)) el.hidden = name !== next;
  if (next === 'menu') renderMenu(menuUi, continueInfo(localStorage, saveKey), currentSession()?.displayName ?? null);
  if (next === 'settings') renderSettings(settingsUi, settings, continueInfo(localStorage, saveKey) !== null);
  if (next === 'game' && state) renderHud(state);
}

/** Pinta la capa de la mesa activa y las pestañas. */
function renderHud(current: GameState): void {
  const table = current.activeTable;
  layers.forEach((layer, i) => (layer.hidden = table !== i + 1));
  for (const ui of [gameUi, slotsUi, diceUi, cardsUi, coinUi]) {
    ui.tabs.hidden = !current.debtPaid;
    ui.tabButtons.forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.table) === table);
      b.hidden = !isTableUnlocked(current, Number(b.dataset.table) as TableId);
    });
  }
  fitHud(layers[table - 1].querySelector<HTMLElement>('.hud'));
  if (table === 1) render(gameUi, current);
  else if (table === 2) render2(slotsUi, current);
  else if (table === 3) render3(diceUi, current);
  else if (table === 4) render4(cardsUi, current);
  else render5(coinUi, current);
}

// ---------------------------------------------------------------------------
// Cambio de mesa: fundido a negro con un rótulo; a mitad cambia la mesa y se vuelve al salón.

const TABLE_FADE_SECONDS = 0.55;
const TABLE_CAPTIONS = { 1: 'MESA 1 · LA RULETA', 2: 'MESA 2 · LAS TRAGAPERRAS', 3: 'MESA 3 · LOS DADOS', 4: 'MESA 4 · EL BLACKJACK', 5: 'MESA 5 · DOBLE O NADA' } as const;
let tableFade: { to: TableId; elapsed: number; switched: boolean } | null = null;

function switchTable(to: TableId): void {
  if (!state || tableFade || !canSwitchTo(state, to)) return;
  tableFade = { to, elapsed: 0, switched: false };
  tableFadeEl.textContent = TABLE_CAPTIONS[to];
  banner.root.hidden = true;
  closeDrawers(gameUi);
  closeDrawers2(slotsUi);
  closeDrawers3(diceUi);
  closeDrawers4(cardsUi);
  closeDrawers5(coinUi);
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
    const visited = { 2: current.slots, 3: current.dice, 4: current.cards, 5: current.coin } as const;
    const target = tableFade.to === 1 ? null : visited[tableFade.to];
    const firstVisit = target !== null && !target.visited;
    if (target) target.visited = true;
    current.activeTable = tableFade.to;
    setAmbient(tableFade.to);
    rooms = createRoomState();
    scene.reset(current);
    slotsScene.reset(current);
    diceScene.reset(current);
    cardsScene.reset(current);
    coinScene.reset(current);
    speech.close();
    speech.setSpeaker(SPEAKERS[tableFade.to]);
    // Cada prestamista solo habla en su mesa, y no comenta lo que pasó mientras no se le veía.
    rebaseWatch(watches[tableFade.to]!, snapshotFor(current, tableFade.to));
    if (firstVisit) noteSessionStart(watches[tableFade.to]!, 'new');
  }
  // Sube, se queda un instante con el rótulo y baja.
  const hold = 0.35;
  const total = TABLE_FADE_SECONDS * 2 + hold;
  const alpha = t < TABLE_FADE_SECONDS ? t / TABLE_FADE_SECONDS : t < TABLE_FADE_SECONDS + hold ? 1 : Math.max(0, (total - t) / TABLE_FADE_SECONDS);
  tableFadeEl.style.opacity = String(alpha);
  if (t >= total) tableFade = null;
}

for (const ui of [gameUi, slotsUi, diceUi, cardsUi, coinUi]) {
  ui.tabButtons.forEach((b) => b.addEventListener('click', () => switchTable(Number(b.dataset.table) as TableId)));
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
  if (activeTable() === 3) {
    clickDice(state, point);
    return;
  }
  if (activeTable() === 4) {
    clickCards(state, point);
    return;
  }
  if (activeTable() === 5) {
    clickCoin(state, point);
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
    if (!target.locked && canBetManually(rooms) && playerBet(state, target.zone.choice, defaultRng)) sfx('roulette');
    return;
  }
  if (!canCollectTrash(rooms)) return;
  const item = itemAt(state.work.items, point.x, point.y);
  if (!item) return;
  scene.playerCollected(collectItem(state, item.id));
  render(gameUi, state);
});
/** Clic en la escena de la mesa 2: ficha, carrete (retener) o tirar. Sin trastienda. */
function clickSlots(current: GameState, point: { x: number; y: number }): void {
  const slots = current.slots;
  const target = slotsScene.target(current, point);
  if (target?.kind === 'chip') selectSlotChip(slots, target.chip.index);
  else if (target?.kind === 'reel') toggleHold(slots, target.reel);
  else if (target?.kind === 'spin') spinSlots();
}

/** Clic en la escena de la mesa 3: ficha, objetivo, dado (relanzar), tirar o aceptar. Sin trastienda. */
function clickDice(current: GameState, point: { x: number; y: number }): void {
  const dice = current.dice;
  const hit = diceScene.target(current, point);
  if (hit?.kind === 'chip') selectDiceChip(dice, hit.chip.index);
  else if (hit?.kind === 'target' && !hit.locked) selectTarget(dice, hit.target);
  else if (hit?.kind === 'die') {
    const roll = openRoll(dice);
    if (roll && reroll(dice, roll, hit.die, defaultRng)) sfx('dice');
  } else if (hit?.kind === 'accept') closeOpenRoll(dice);
  else if (hit?.kind === 'roll') rollDiceNow();
}

/** Clic en la escena de la mesa 4: ficha, repartir, pedir, plantarse, aceptar o descartar. Sin trastienda. */
function clickCards(current: GameState, point: { x: number; y: number }): void {
  const cards = current.cards;
  const hit = cardsScene.target(current, point);
  if (hit?.kind === 'chip') selectCardsChip(cards, hit.chip.index);
  else if (hit) cardsAction(hit.kind);
}

/** Una decisión en la mesa 4 (solo en la sala y sin cartas moviéndose). */
function cardsAction(kind: 'deal' | 'hit' | 'stand' | 'accept' | 'discard'): void {
  if (!state || !canBetManually(rooms) || cardsScene.dealing()) return;
  const cards = state.cards;
  const hand = cards.hand;
  if (kind === 'deal') {
    if ((!hand || hand.status === 'fin') && playerDeal(cards, defaultRng)) sfx('card');
    return;
  }
  if (!hand || hand.status === 'fin') return;
  sfx('card');
  if (kind === 'hit') hitCard(cards, hand, defaultRng);
  else if (kind === 'stand') standHand(cards, hand, defaultRng);
  else if (kind === 'accept') acceptBust(cards, hand);
  else discardCard(cards, hand, defaultRng);
}

/** Clic en la escena de la mesa 5: ficha, moneda, herencias, apostar, seguir, retirarse o aceptar. */
function clickCoin(current: GameState, point: { x: number; y: number }): void {
  const hit = coinScene.target(current, point);
  if (hit?.kind === 'chip') selectCoinChip(current.coin, hit.chip.index);
  else if (hit?.kind === 'coin') selectCoinKind(current.coin, hit.coin);
  else if (hit?.kind === 'tool') coinTool(hit.tool);
  else if (hit) coinAction(hit.kind);
}

/** Usa una herencia en la cadena del jugador (Z cero dorado, H retener, S relanzar, C marcar). */
function coinTool(tool: HeirloomId): void {
  if (!state || !canBetManually(rooms) || coinScene.flipping()) return;
  const coin = state.coin;
  const chain = coin.chain;
  if (!chain || chain.status === 'fin') return;
  let used = false;
  if (tool === 'zero') used = useGoldenZero(coin, chain);
  else if (tool === 'hold') used = armHold(coin, chain);
  else if (tool === 'reroll') used = useReroll(coin, chain, defaultRng) !== null;
  else used = useMark(coin, chain, defaultRng);
  if (used) sfx(tool === 'reroll' ? 'coin' : 'chip');
}

/** Una decisión en la mesa 5 (sin la moneda en el aire). */
function coinAction(kind: 'bet' | 'more' | 'stop' | 'accept'): void {
  if (!state || !canBetManually(rooms) || coinScene.flipping()) return;
  const coin = state.coin;
  const chain = coin.chain;
  if (kind === 'bet') {
    if (chainInPlay(coin)) return;
    const chip = selectedCoinChip(coin);
    if (chip.affordable && startChain(coin, { bettor: 'jugador', stake: chip.amount, kind: coin.coinChoice }, defaultRng)) sfx('coin');
    return;
  }
  if (!chain || chain.status === 'fin') return;
  if (kind === 'more') {
    if (continueChain(coin, chain, defaultRng)) sfx('coin');
  }
  else if (kind === 'stop') {
    if (cashOut(coin, chain)) {
      sfx('chip');
      coinScene.notifyResolved();
    }
  } else {
    acceptLoss(coin, chain);
    coinScene.notifyResolved();
  }
}

/** El jugador tira los dados (solo en el bar). Una tirada perdida abierta se acepta al tirar otra. */
function rollDiceNow(): void {
  if (!state || !canBetManually(rooms) || diceScene.rollInFlight()) return;
  if (playerRoll(state.dice, defaultRng)) sfx('dice');
}

/** El jugador tira de la palanca (solo en la sala de las tragaperras). */
function spinSlots(): void {
  if (!state || !canBetManually(rooms)) return;
  if (playerSpin(state.slots, defaultRng)) sfx('reels');
}

sceneCanvas.addEventListener('mousemove', (event) => {
  const point = scene.toScene(event.clientX, event.clientY);
  scene.setHover(point);
  slotsScene.setHover(point);
  diceScene.setHover(point);
  cardsScene.setHover(point);
  coinScene.setHover(point);
});
sceneCanvas.addEventListener('mouseleave', () => {
  scene.setHover(null);
  slotsScene.setHover(null);
  diceScene.setHover(null);
  cardsScene.setHover(null);
  coinScene.setHover(null);
});
window.addEventListener('keydown', (event) => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.key === 'f' || event.key === 'F') {
    void toggleFullscreen(root);
    return;
  }
  // N: silencio (todo el sonido) / volver a oír.
  if (event.key === 'n' || event.key === 'N') {
    setMuted(!isMuted());
    if (screen === 'game' && state) showNote(isMuted() ? 'Sonido silenciado (N)' : 'Sonido activado (N)');
    return;
  }
  if (screen !== 'game' || !state) return;
  const table2 = activeTable() === 2;
  const table3 = activeTable() === 3;
  const table4 = activeTable() === 4;
  const table5 = activeTable() === 5;
  if (event.key === 'Escape') {
    closeDrawers(gameUi);
    closeDrawers2(slotsUi);
    closeDrawers3(diceUi);
    closeDrawers4(cardsUi);
    closeDrawers5(coinUi);
    return;
  }
  if (event.key === 'm' || event.key === 'M' || event.key === 'a' || event.key === 'A') {
    const drawer = event.key.toLowerCase() === 'm' ? 'mesa' : 'ayuda';
    if (table5) toggleDrawer5(coinUi, drawer);
    else if (table4) toggleDrawer4(cardsUi, drawer);
    else if (table3) toggleDrawer3(diceUi, drawer);
    else if (table2) toggleDrawer2(slotsUi, drawer);
    else toggleDrawer(gameUi, drawer);
    return;
  }
  if (event.key === 'Tab') {
    event.preventDefault();
    // La trastienda solo existe en la mesa 1.
    if (!tableFade && activeTable() === 1) toggleRoom(rooms);
    return;
  }
  if (table5) {
    const coin = state.coin;
    const key = event.key.toLowerCase();
    // Espacio: apostar, seguir o aceptar; R retirarse; Q moneda; Z/H/S/C herencias; E cajón Herencias.
    if (event.key === ' ') {
      event.preventDefault();
      const chain = coin.chain;
      coinAction(!chain || chain.status === 'fin' ? 'bet' : chain.status === 'decidir' ? 'more' : 'accept');
    } else if (/^[1-4]$/.test(event.key)) {
      const chip = coinChips(coin)[Number(event.key) - 1];
      if (chip) selectCoinChip(coin, chip.index);
    } else if (key === 'r') coinAction('stop');
    else if (key === 'q') selectCoinKind(coin, coin.coinChoice === 'justa' ? 'cargada' : 'justa');
    else if (key === 'e') toggleDrawer5(coinUi, 'herencias');
    else if (key === 'z') coinTool('zero');
    else if (key === 'h') coinTool('hold');
    else if (key === 's') coinTool('reroll');
    else if (key === 'c') coinTool('mark');
    return;
  }
  if (table4) {
    const cards = state.cards;
    const key = event.key.toLowerCase();
    if (rooms.current === 'casino') {
      // Espacio: repartir (o plantarse con una mano en juego); P pedir; S plantarse; D descartar.
      if (event.key === ' ') {
        event.preventDefault();
        cardsAction(cards.hand && cards.hand.status !== 'fin' ? (cards.hand.status === 'pasado' ? 'accept' : 'stand') : 'deal');
      } else if (/^[1-4]$/.test(event.key)) {
        const chip = cardsChips(cards)[Number(event.key) - 1];
        if (chip) selectCardsChip(cards, chip.index);
      } else if (key === 'p') cardsAction('hit');
      else if (key === 's') cardsAction('stand');
      else if (key === 'd') cardsAction('discard');
    }
    return;
  }
  if (table3) {
    const dice = state.dice;
    if (event.key === ' ' && rooms.current === 'casino') {
      event.preventDefault();
      rollDiceNow();
    } else if (/^[1-4]$/.test(event.key) && rooms.current === 'casino') {
      const chip = diceChips(dice)[Number(event.key) - 1];
      if (chip) selectDiceChip(dice, chip.index);
    } else if (/^[qwert]$/i.test(event.key) && rooms.current === 'casino') {
      // Q W E R T: los cinco objetivos, de izquierda a derecha.
      selectTarget(dice, DICE_TARGETS['qwert'.indexOf(event.key.toLowerCase())]);
    }
    return;
  }
  if (table2) {
    if (event.key === ' ' && rooms.current === 'casino') {
      event.preventDefault();
      spinSlots();
    } else if (/^[1-4]$/.test(event.key) && rooms.current === 'casino') {
      const chip = slotChips(state.slots)[Number(event.key) - 1];
      if (chip) selectSlotChip(state.slots, chip.index);
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
  diceScene.reset(loaded);
  cardsScene.reset(loaded);
  coinScene.reset(loaded);
  speech.close();
  speech.setSpeaker(SPEAKERS[loaded.activeTable]);
  watches[1] = createWatch(snapshot(loaded));
  watches[2] = createWatch(snapshot2(loaded));
  watches[3] = createWatch(snapshot3(loaded));
  watches[4] = createWatch(snapshot4(loaded));
  watches[5] = createWatch(snapshot5(loaded));
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
  document.documentElement.dataset.crt = settings.crt;
  crt.setLevel(settings.crt);
  setVolume(settings.volume);
  const effects = settings.crt !== 'apagado';
  for (const s of [scene, slotsScene, diceScene, cardsScene, coinScene]) s.setEffectsEnabled(effects);
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
  settings.crt = CRT_LEVELS.find((l) => l === settingsUi.crt.value) ?? 'suave';
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

/**
 * Aviso del ayudante en el HUD (cuando juega sin que se le vea): en vez de una línea por apuesta, el
 * neto de los últimos segundos, agregado.
 */
function aggregatedToast(toast: HTMLElement, who: string): (delta: number, jackpot?: boolean) => void {
  let sum = 0;
  let count = 0;
  let anyJackpot = false;
  let timer = 0;
  let hide = 0;
  return (delta, jackpot = false) => {
    sum += delta;
    count++;
    anyJackpot ||= jackpot;
    if (timer) return;
    timer = window.setTimeout(() => {
      toast.textContent = `${who} ${netText(sum, count)}`;
      toast.dataset.kind = anyJackpot ? 'jackpot' : sum >= 0 ? 'gana' : 'pierde';
      toast.classList.add('show');
      window.clearTimeout(hide);
      hide = window.setTimeout(() => toast.classList.remove('show'), 1800);
      sum = 0;
      count = 0;
      anyJackpot = false;
      timer = 0;
    }, HELPER_NET_SECONDS * 1000);
  };
}
const toast1 = aggregatedToast(gameUi.toast, 'Ayudante');
const toast2 = aggregatedToast(slotsUi.toast, 'Zombi');
const toast3 = aggregatedToast(diceUi.toast, 'Camarero');
const toast4 = aggregatedToast(cardsUi.toast, 'Esqueleto');
const toast5 = aggregatedToast(coinUi.toast, 'Diablillo');

// Juego
gameUi.fullscreen.addEventListener('click', () => void toggleFullscreen(root));
// Fuera del casino, las tiradas del ayudante se avisan en el HUD (agregadas).
scene.onAwayResult = (spin) => toast1(spin.delta, spin.outcome === 'jackpot');

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
    if (buySlotUpgrade(state.slots, id)) sfx('chip');
    renderHud(state);
  });
}
slotsUi.profileButtons.forEach((b, i) => b.addEventListener('click', () => state && selectZombieProfile(state.slots, i)));
slotsUi.payDebt.addEventListener('click', () => {
  if (!state || !paySlotsDebt(state.slots)) return;
  renderHud(state);
  showBanner('MESA 2 SALDADA', 'La Tragaperras viviente ha cobrado. Más abajo se abre el bar del Barman.', 'Bajar a la mesa 3', () => switchTable(3));
});
slotsUi.fullscreen.addEventListener('click', () => void toggleFullscreen(root));
slotsUi.toMenu.addEventListener('click', toMenu);
for (const id of ['mesa', 'ayuda'] as const) slotsUi.drawers[id].tab.addEventListener('click', () => toggleDrawer2(slotsUi, id));
slotsUi.statsToggle.addEventListener('click', () => {
  slotsUi.statsBody.hidden = !slotsUi.statsBody.hidden;
  slotsUi.statsToggle.textContent = slotsUi.statsBody.hidden ? 'Estadísticas ▸' : 'Estadísticas ▾';
});
// Mesa 3: tienda, perfiles del camarero, pago de la deuda, pantalla completa y menú.
for (const id of DICE_UPGRADE_IDS) {
  diceUi.shop[id].buy.addEventListener('click', () => {
    if (!state) return;
    if (buyDiceUpgrade(state.dice, id)) sfx('chip');
    renderHud(state);
  });
}
diceUi.profileButtons.forEach((b, i) => b.addEventListener('click', () => state && selectGhostProfile(state.dice, i)));
diceUi.payDebt.addEventListener('click', () => {
  if (!state || !payDiceDebt(state.dice)) return;
  renderHud(state);
  showBanner('MESA 3 SALDADA', 'El Barman ha cobrado. Tras las cortinas rojas se abre la mesa de la Crupier.', 'Bajar a la mesa 4', () => switchTable(4));
});
diceUi.fullscreen.addEventListener('click', () => void toggleFullscreen(root));
diceUi.toMenu.addEventListener('click', toMenu);
for (const id of ['mesa', 'ayuda'] as const) diceUi.drawers[id].tab.addEventListener('click', () => toggleDrawer3(diceUi, id));
diceUi.statsToggle.addEventListener('click', () => {
  diceUi.statsBody.hidden = !diceUi.statsBody.hidden;
  diceUi.statsToggle.textContent = diceUi.statsBody.hidden ? 'Estadísticas ▸' : 'Estadísticas ▾';
});
// Mesa 4: tienda, perfiles del esqueleto, pago de la deuda, pantalla completa y menú.
for (const id of CARD_UPGRADE_IDS) {
  cardsUi.shop[id].buy.addEventListener('click', () => {
    if (!state) return;
    if (buyCardsUpgrade(state.cards, id)) sfx('chip');
    renderHud(state);
  });
}
cardsUi.profileButtons.forEach((b, i) => b.addEventListener('click', () => state && selectSkeletonProfile(state.cards, i)));
cardsUi.payDebt.addEventListener('click', () => {
  if (!state || !payCardsDebt(state.cards)) return;
  renderHud(state);
  showBanner('MESA 4 SALDADA', 'La Crupier ha cobrado. Tras el último pasillo espera el Dueño de la casa.', 'Subir a la mesa 5', () => switchTable(5));
});
cardsUi.fullscreen.addEventListener('click', () => void toggleFullscreen(root));
cardsUi.toMenu.addEventListener('click', toMenu);
for (const id of ['mesa', 'ayuda'] as const) cardsUi.drawers[id].tab.addEventListener('click', () => toggleDrawer4(cardsUi, id));
cardsUi.statsToggle.addEventListener('click', () => {
  cardsUi.statsBody.hidden = !cardsUi.statsBody.hidden;
  cardsUi.statsToggle.textContent = cardsUi.statsBody.hidden ? 'Estadísticas ▸' : 'Estadísticas ▾';
});
// Mesa 5: tienda, perfiles del diablillo, pago de la deuda (el final), pantalla completa y menú.
for (const id of COIN_UPGRADE_IDS) {
  coinUi.shop[id].buy.addEventListener('click', () => {
    if (!state) return;
    if (buyCoinUpgrade(state.coin, id)) sfx('chip');
    renderHud(state);
  });
}
coinUi.profileButtons.forEach((b, i) => b.addEventListener('click', () => state && selectImpProfile(state.coin, i)));
coinUi.payDebt.addEventListener('click', () => {
  if (!state || !payCoinDebt(state.coin)) return;
  renderHud(state);
  save();
  onFinalDebtPaid();
});
coinUi.fullscreen.addEventListener('click', () => void toggleFullscreen(root));
coinUi.toMenu.addEventListener('click', toMenu);
for (const id of ['mesa', 'ayuda', 'herencias'] as const) coinUi.drawers[id].tab.addEventListener('click', () => toggleDrawer5(coinUi, id));
for (const id of HEIRLOOM_IDS) {
  coinUi.heirlooms[id].buy.addEventListener('click', () => {
    if (!state) return;
    if (buyHeirloom(state, id)) sfx('chip');
    renderHud(state);
  });
}
coinUi.statsToggle.addEventListener('click', () => {
  coinUi.statsBody.hidden = !coinUi.statsBody.hidden;
  coinUi.statsToggle.textContent = coinUi.statsBody.hidden ? 'Estadísticas ▸' : 'Estadísticas ▾';
});
coinScene.onAwayResult = (chain) => toast5(chain.delta, chain.jackpot > 0);

/** La última deuda: el Dueño dice su última línea y, al poco, sale la pantalla final. */
function onFinalDebtPaid(): void {
  // Primero la última línea del Dueño; al poco, la pantalla final.
  window.setTimeout(() => {
    if (!state || !isGameFinished(state)) return;
    save();
    renderEnding(endingUi, gameSummary(state));
    state = null;
    show('ending');
  }, 4500);
}
endingUi.toMenu.addEventListener('click', () => show('menu'));

cardsScene.onAwayResult = (hand) => toast4(hand.delta, hand.jackpot > 0);

diceScene.onAwayResult = (roll) => toast3(roll.delta, roll.jackpot > 0);

slotsScene.onAwayResult = (spin) => toast2(spin.delta, spin.outcome === 'jackpot');

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
  if (!ONLINE_ENABLED) {
    showNote('Deuda saldada.');
    return;
  }
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
// Pantalla pequeña o táctil: aviso (una vez por sesión del navegador) con la opción de seguir.
const smallScreen = matchMedia('(pointer: coarse)').matches || window.innerWidth < 900 || window.innerHeight < 480;
let noticeSeen = false;
try {
  noticeSeen = sessionStorage.getItem('casino-aviso-pantalla') === '1';
} catch {
  // Sin almacenamiento: se avisa igualmente.
}
show(smallScreen && !noticeSeen ? 'notice' : 'menu');
screens.notice.querySelector<HTMLButtonElement>('[data-ref="noticeContinue"]')!.addEventListener('click', () => {
  try {
    sessionStorage.setItem('casino-aviso-pantalla', '1');
  } catch {
    // Igual que arriba.
  }
  show('menu');
});

// Pantalla de carga: la barra sigue a los sprites (y a la fuente); al terminar, se quita.
const loadingEl = document.getElementById('loading');
const loadingBar = document.getElementById('loading-bar');
void Promise.all([
  whenSpritesLoaded(sprites, (f) => {
    if (loadingBar) loadingBar.style.width = `${Math.round(f * 100)}%`;
  }),
  document.fonts?.ready ?? Promise.resolve(),
]).then(() => loadingEl?.remove());

// Exportar e importar la partida (archivo JSON), desde Ajustes.
settingsUi.exportSave.addEventListener('click', () => {
  if (state) save();
  const file = loadGame(localStorage, saveKey);
  if (!file) return setText(settingsUi.saveNote, 'No hay partida que exportar.');
  const blob = new Blob([serialize(file.state, Date.now())], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `casino-partida-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  setText(settingsUi.saveNote, 'Partida exportada.');
});
settingsUi.importSave.addEventListener('click', () => settingsUi.importFile.click());
settingsUi.importFile.addEventListener('change', async () => {
  const picked = settingsUi.importFile.files?.[0];
  settingsUi.importFile.value = '';
  if (!picked) return;
  const file = deserialize(await picked.text());
  if (!file) return setText(settingsUi.saveNote, 'Ese archivo no es una partida válida.');
  if (continueInfo(localStorage, saveKey) && !confirm('¿Sustituir la partida guardada por la del archivo?')) return;
  saveGame(localStorage, saveKey, file.state, Date.now());
  setText(settingsUi.saveNote, 'Partida importada. Pulsa Continuar en el menú.');
  renderSettings(settingsUi, settings, true);
});
setInterval(save, autosaveInterval * 1000);
window.addEventListener('beforeunload', save);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save();
});

/** Tooltip pixelado junto al ratón para las zonas del tapete, las fichas, los carretes y la palanca. */
function updateTooltip(current: GameState): void {
  const table2 = current.activeTable === 2;
  const point = scene.hoverPoint;
  const tip = current.activeTable === 5 ? coinUi.tooltip : current.activeTable === 4 ? cardsUi.tooltip : current.activeTable === 3 ? diceUi.tooltip : table2 ? slotsUi.tooltip : gameUi.tooltip;
  let lines: string[] | null = null;
  if (point && !inTransition(rooms) && !tableFade) {
    if (current.activeTable === 5) {
      const hit = coinScene.target(current, point);
      if (hit) lines = coinTooltip(current, hit);
    } else if (current.activeTable === 4) {
      const hit = cardsScene.target(current, point);
      if (hit) lines = cardsTooltip(current, hit);
    } else if (current.activeTable === 3) {
      const hit = diceScene.target(current, point);
      if (hit) lines = diceTooltip(current, hit);
    } else if (table2) {
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
  observe(watch, snapshotFor(current, table));
  const inFlight =
    table === 1
      ? scene.spinInFlight(current)
      : table === 2
        ? slotsScene.spinInFlight()
        : table === 3
          ? diceScene.rollInFlight()
          : table === 4
            ? cardsScene.dealing()
            : coinScene.flipping();
  const blocked = inTransition(rooms) || tableFade !== null || inFlight || !settings.dialogues;
  const line =
    table === 1
      ? tickWatch(watch, dt, DIALOGUE_ES, lenderPhase(current), defaultRng, blocked)
      : table === 2
        ? tickWatch(watch, dt, DIALOGUE2_ES, slotsLenderPhase(current.slots), defaultRng, blocked)
        : table === 3
          ? tickWatch(watch, dt, DIALOGUE3_ES, diceLenderPhase(current.dice), defaultRng, blocked)
          : table === 4
            ? tickWatch(watch, dt, DIALOGUE4_ES, cardsLenderPhase(current.cards), defaultRng, blocked)
            : tickWatch(watch, dt, DIALOGUE5_ES, coinLenderPhase(current.coin), defaultRng, blocked);
  if (line) speech.say(line.text);
  if (!settings.dialogues && speech.speaking) speech.close();
  const inHall = rooms.current === 'casino' && !inTransition(rooms);
  // Mesa 2: el bocadillo sale a la derecha de la cabeza de la Tragaperras viviente.
  // Mesa 2 y 3: el bocadillo sale a la derecha de la cabeza del prestamista.
  const anchor =
    table === 1 ? { x: LENDER_SPOT.x, y: LENDER_SPOT.y - LENDER_SIZE + 4 } : table === 2 ? { x: 380, y: 44 } : table === 5 ? { x: 380, y: 150 } : { x: 380, y: 122 };
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
        const now = state.playTime;
        for (const r of tick.helper) helperMeters[1].add(now, r.delta);
        for (const r of tick.slots.zombie) helperMeters[2].add(now, r.delta);
        for (const r of tick.dice.ghost) helperMeters[3].add(now, r.delta);
        for (const r of tick.cards.skeleton) helperMeters[4].add(now, r.delta);
        for (const r of tick.coin.imp) helperMeters[5].add(now, r.delta);
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
        else if (state.activeTable === 2) slotsScene.render(state, lastDt, rooms);
        else if (state.activeTable === 3) diceScene.render(state, lastDt, rooms);
        else if (state.activeTable === 4) cardsScene.render(state, lastDt, rooms);
        else coinScene.render(state, lastDt, rooms);
        updateTooltip(state);
      }
    },
  },
  maxFrameDt,
);

/** Partida de prueba del modo desarrollador: las mesas anteriores con todo comprado y saldadas. */
function devState(table: 2 | 3 | 4 | 5): GameState {
  const dev = createInitialState();
  for (const id of UPGRADE_IDS) dev.upgrades[id] = CONFIG.upgrades[id].maxLevel;
  dev.helper.profile = 1;
  dev.balance = CONFIG.debt.amount + 50_000;
  payDebt(dev);
  dev.playTime = 8 * 60;
  dev.slots.balance = 2_000;
  if (table >= 3) {
    for (const id of SLOT_UPGRADE_IDS) dev.slots.upgrades[id] = CONFIG.slots.upgrades[id].maxLevel;
    dev.slots.helper.profile = 1;
    dev.slots.debtPaid = true;
    dev.slots.visited = true;
    dev.slots.playTime = 12 * 60;
    dev.slots.balance = 50_000;
    dev.playTime = 20 * 60;
    dev.dice.balance = 3_000;
  }
  if (table >= 4) {
    for (const id of DICE_UPGRADE_IDS) dev.dice.upgrades[id] = CONFIG.dice.upgrades[id].maxLevel;
    dev.dice.helper.profile = 1;
    dev.dice.debtPaid = true;
    dev.dice.visited = true;
    dev.dice.playTime = 14 * 60;
    dev.dice.balance = 60_000;
    dev.playTime = 34 * 60;
    dev.cards.balance = 4_000;
  }
  if (table === 5) {
    for (const id of CARD_UPGRADE_IDS) dev.cards.upgrades[id] = CONFIG.cards.upgrades[id].maxLevel;
    dev.cards.helper.profile = 1;
    dev.cards.debtPaid = true;
    dev.cards.visited = true;
    dev.cards.playTime = 12 * 60;
    dev.cards.balance = 80_000;
    dev.playTime = 46 * 60;
    dev.coin.balance = 8_000; // llega para desbloquear la moneda cargada
    // Moneda de las otras mesas para probar el cajón Herencias (cuestan cientos de millones).
    dev.balance = dev.slots.balance = dev.dice.balance = dev.cards.balance = 1e9;
  }
  return dev;
}
