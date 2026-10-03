import type { ContinueInfo } from '../game/menu';
import type { Settings } from '../game/settings';
import { formatPercent, formatTime } from '../util/format';
import { setText } from './render';

export interface MenuUi {
  continueButton: HTMLButtonElement;
  continueInfo: HTMLElement;
  newGame: HTMLButtonElement;
  settings: HTMLButtonElement;
}

export interface SettingsUi {
  crt: HTMLInputElement;
  volume: HTMLInputElement;
  volumeValue: HTMLElement;
  deleteSave: HTMLButtonElement;
  deleteNote: HTMLElement;
  back: HTMLButtonElement;
}

export function mountMenu(root: HTMLElement): MenuUi {
  root.innerHTML = `
    <section class="panel menu">
      <h1>Casino</h1>
      <p class="muted">Debes 10.000.000 fichas.</p>
      <div class="menu-options">
        <button data-ref="continue">
          Continuar
          <span class="menu-sub" data-ref="continueInfo"></span>
        </button>
        <button data-ref="newGame">Nueva partida</button>
        <button data-ref="settings">Ajustes</button>
      </div>
    </section>
  `;
  const ref = <T extends HTMLElement>(name: string) => root.querySelector<T>(`[data-ref="${name}"]`)!;
  return {
    continueButton: ref('continue'),
    continueInfo: ref('continueInfo'),
    newGame: ref('newGame'),
    settings: ref('settings'),
  };
}

/** Continuar solo aparece si hay partida guardada. */
export function renderMenu(ui: MenuUi, info: ContinueInfo | null): void {
  ui.continueButton.hidden = info === null;
  if (!info) return;
  const table = info.debtPaid ? 'Mesa 1 saldada' : `Mesa 1 · deuda ${formatPercent(info.debtProgress)} reunida`;
  setText(ui.continueInfo, `${formatTime(info.playTime)} jugados · ${table}`);
}

export function mountSettings(root: HTMLElement): SettingsUi {
  root.innerHTML = `
    <section class="panel menu">
      <h1>Ajustes</h1>
      <label class="setting">
        <input type="checkbox" data-ref="crt" />
        Filtro CRT <span class="muted">(llegará con el arte)</span>
      </label>
      <label class="setting">
        Volumen
        <input type="range" min="0" max="100" step="1" data-ref="volume" />
        <span data-ref="volumeValue"></span>
      </label>
      <div class="setting">
        <button data-ref="deleteSave" class="danger">Borrar partida</button>
        <span class="muted" data-ref="deleteNote"></span>
      </div>
      <button data-ref="back">Volver</button>
    </section>
  `;
  const ref = <T extends HTMLElement>(name: string) => root.querySelector<T>(`[data-ref="${name}"]`)!;
  return {
    crt: ref('crt'),
    volume: ref('volume'),
    volumeValue: ref('volumeValue'),
    deleteSave: ref('deleteSave'),
    deleteNote: ref('deleteNote'),
    back: ref('back'),
  };
}

export function renderSettings(ui: SettingsUi, settings: Settings, hasSave: boolean): void {
  ui.crt.checked = settings.crtEnabled;
  ui.volume.value = String(Math.round(settings.volume * 100));
  setText(ui.volumeValue, `${Math.round(settings.volume * 100)}%`);
  ui.deleteSave.disabled = !hasSave;
  setText(ui.deleteNote, hasSave ? '' : 'No hay partida guardada.');
}
