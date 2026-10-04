import { UPGRADE_IDS } from '../game/config';
import { payDebt } from '../game/debt';
import { selectHelperProfile } from '../game/helper';
import type { GameState } from '../game/state';
import { buyUpgrade } from '../game/upgrades';
import type { Ui } from './render';

/**
 * Conecta los botones con las acciones del juego. `getState` porque reiniciar cambia el objeto.
 * `refresh` repinta en el acto, sin esperar al siguiente frame.
 */
export function bindControls(
  ui: Ui,
  getState: () => GameState,
  refresh: () => void,
  onMenu: () => void,
  onDebtPaid: () => void = () => {},
): void {
  const on = (el: HTMLElement, action: (state: GameState) => unknown) =>
    el.addEventListener('click', () => {
      action(getState());
      refresh();
    });

  ui.profileButtons.forEach((b, i) => on(b, (s) => selectHelperProfile(s, i)));
  on(ui.payDebt, (s) => {
    if (payDebt(s)) onDebtPaid();
  });
  for (const id of UPGRADE_IDS) on(ui.shop[id].buy, (s) => buyUpgrade(s, id));
  ui.toMenu.addEventListener('click', onMenu);
}
