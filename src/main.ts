import './ui/style.css';
import { CONFIG } from './game/config';
import { clearSave, loadGame, saveGame } from './game/save';
import { createInitialState, type GameState } from './game/state';
import { update } from './game/update';
import { startLoop } from './loop';
import { mountUi, render, setText } from './ui/render';

const { saveKey, autosaveInterval, maxFrameDt } = CONFIG.tech;

let state: GameState = loadGame(localStorage, saveKey)?.state ?? createInitialState();
const ui = mountUi(document.querySelector<HTMLElement>('#app')!);

function save(): void {
  const ok = saveGame(localStorage, saveKey, state, Date.now());
  setText(ui.saveStatus, ok ? `Guardado ${new Date().toLocaleTimeString()}` : 'No se pudo guardar');
}

ui.debugAdd.addEventListener('click', () => {
  state.balance += 1234;
});
ui.reset.addEventListener('click', () => {
  if (!confirm('¿Borrar la partida?')) return;
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
    update: (dt) => update(state, dt),
    render: () => render(ui, state),
  },
  maxFrameDt,
);
