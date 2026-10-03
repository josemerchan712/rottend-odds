import './ui/style.css';
import { setVolume, unlockAudio } from './audio';
import { CONFIG } from './game/config';
import { continueGame, continueInfo, startNewGame } from './game/menu';
import { defaultRng } from './game/rng';
import { clearSave, saveGame } from './game/save';
import { loadSettings, saveSettings } from './game/settings';
import type { GameState } from './game/state';
import { update } from './game/update';
import { startLoop } from './loop';
import { bindControls } from './ui/controls';
import { mountMenu, mountSettings, renderMenu, renderSettings } from './ui/menu';
import { mountUi, render, setText } from './ui/render';

const { saveKey, settingsKey, autosaveInterval, maxFrameDt } = CONFIG.tech;

type Screen = 'menu' | 'settings' | 'game';

const app = document.querySelector<HTMLElement>('#app')!;
app.innerHTML = `
  <div data-screen="menu"></div>
  <div data-screen="settings" hidden></div>
  <div data-screen="game" hidden></div>
`;
const screens: Record<Screen, HTMLElement> = {
  menu: app.querySelector('[data-screen="menu"]')!,
  settings: app.querySelector('[data-screen="settings"]')!,
  game: app.querySelector('[data-screen="game"]')!,
};

const menuUi = mountMenu(screens.menu);
const settingsUi = mountSettings(screens.settings);
const gameUi = mountUi(screens.game);

let screen: Screen = 'menu';
/** Partida en curso; null fuera del juego. */
let state: GameState | null = null;
const settings = loadSettings(localStorage, settingsKey);

function show(next: Screen): void {
  screen = next;
  for (const [name, el] of Object.entries(screens)) el.hidden = name !== next;
  if (next === 'menu') renderMenu(menuUi, continueInfo(localStorage, saveKey));
  if (next === 'settings') renderSettings(settingsUi, settings, continueInfo(localStorage, saveKey) !== null);
  if (next === 'game' && state) render(gameUi, state);
}

function enterGame(loaded: GameState): void {
  unlockAudio();
  state = loaded;
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
bindControls(gameUi, () => state!, defaultRng, () => state && render(gameUi, state), () => {
  save();
  state = null;
  show('menu');
});

applySettings();
show('menu');
setInterval(save, autosaveInterval * 1000);
window.addEventListener('beforeunload', save);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save();
});

startLoop(
  {
    update: (dt) => {
      if (screen === 'game' && state) update(state, dt, defaultRng);
    },
    render: () => {
      if (screen === 'game' && state) render(gameUi, state);
    },
  },
  maxFrameDt,
);
