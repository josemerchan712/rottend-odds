import { payDebt } from '../game/debt';
import { selectHelperProfile } from '../game/helper';
import type { GameState } from '../game/state';
import { buyUpgrade } from '../game/upgrades';
import { DRAWERS, isDrawerOpen, setDrawerOpen, type DrawerId, type Ui } from './render';

/**
 * Conecta los botones del HUD y de los cajones con las acciones del juego. `getState` porque
 * reiniciar cambia el objeto; `refresh` repinta en el acto, sin esperar al siguiente frame.
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
  for (const id of Object.keys(ui.shop) as (keyof typeof ui.shop)[]) on(ui.shop[id].buy, (s) => buyUpgrade(s, id));
  for (const id of Object.keys(DRAWERS) as DrawerId[]) {
    ui.drawers[id].tab.addEventListener('click', () => toggleDrawer(ui, id));
  }
  ui.statsToggle.addEventListener('click', () => {
    ui.statsBody.hidden = !ui.statsBody.hidden;
    ui.statsToggle.textContent = ui.statsBody.hidden ? 'Estadísticas ▸' : 'Estadísticas ▾';
  });
  ui.toMenu.addEventListener('click', onMenu);
}

export function toggleDrawer(ui: Ui, id: DrawerId): void {
  setDrawerOpen(ui, id, !isDrawerOpen(ui, id));
}

export function closeDrawers(ui: Ui): void {
  for (const id of Object.keys(DRAWERS) as DrawerId[]) setDrawerOpen(ui, id, false);
}
