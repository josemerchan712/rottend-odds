import { playerBet, selectBetFraction } from '../game/actions';
import { UPGRADE_IDS } from '../game/config';
import { payDebt } from '../game/debt';
import { selectHelperProfile } from '../game/helper';
import type { Rng } from '../game/rng';
import type { GameState } from '../game/state';
import { buyUpgrade } from '../game/upgrades';
import { collectTrash } from '../game/work';
import type { Ui } from './render';

/**
 * Conecta los botones con las acciones del juego. `getState` porque reiniciar cambia el objeto.
 * `refresh` repinta en el acto, sin esperar al siguiente frame.
 */
export function bindControls(
  ui: Ui,
  getState: () => GameState,
  rng: Rng,
  refresh: () => void,
  onMenu: () => void,
): void {
  const on = (el: HTMLElement, action: (state: GameState) => unknown) =>
    el.addEventListener('click', () => {
      action(getState());
      refresh();
    });

  ui.fractionButtons.forEach((b, i) => on(b, (s) => selectBetFraction(s, i)));
  on(ui.betBlack, (s) => playerBet(s, { type: 'color', color: 'negro' }, rng));
  on(ui.betWhite, (s) => playerBet(s, { type: 'color', color: 'blanco' }, rng));
  ui.dozenButtons.forEach((b, i) => on(b, (s) => playerBet(s, { type: 'dozen', dozen: (i + 1) as 1 | 2 | 3 }, rng)));
  on(ui.betNumber, (s) => {
    const n = Math.min(Math.max(Math.round(Number(ui.numberInput.value)) || 1, 1), 36);
    ui.numberInput.value = String(n);
    return playerBet(s, { type: 'number', number: n }, rng);
  });
  on(ui.work, (s) => collectTrash(s, rng));
  ui.profileButtons.forEach((b, i) => on(b, (s) => selectHelperProfile(s, i)));
  on(ui.payDebt, payDebt);
  for (const id of UPGRADE_IDS) on(ui.shop[id].buy, (s) => buyUpgrade(s, id));
  ui.toMenu.addEventListener('click', onMenu);
}
