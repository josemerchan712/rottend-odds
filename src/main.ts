import './ui/style.css';
import { CONFIG } from './game/config';
import { defaultRng } from './game/rng';
import { clearSave, loadGame, saveGame } from './game/save';
import { createInitialState, type GameState } from './game/state';
import { update } from './game/update';
import { startLoop } from './loop';
import { bindControls } from './ui/controls';
import { mountUi, render, setText } from './ui/render';

const { saveKey, autosaveInterval, maxFrameDt } = CONFIG.tech;

let state: GameState = loadGame(localStorage, saveKey)?.state ?? createInitialState();
const ui = mountUi(document.querySelector<HTMLElement>('#app')!);

function save(): void {
  const ok = saveGame(localStorage, saveKey, state, Date.now());
  setText(ui.saveStatus, ok ? `Guardado ${new Date().toLocaleTimeString()}` : 'No se pudo guardar');
}

bindControls(ui, () => state, defaultRng, () => render(ui, state), () => {
  clearSave(localStorage, saveKey);
  state = createInitialState();
});

render(ui, state);
setInterval(save, autosaveInterval * 1000);
window.addEventListener('beforeunload', save);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save();
});

startLoop(
  {
    update: (dt) => update(state, dt, defaultRng),
    render: () => render(ui, state),
  },
  maxFrameDt,
);
