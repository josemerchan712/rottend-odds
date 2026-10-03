import type { GameState } from '../game/state';
import { formatNumber, formatTime } from '../util/format';

export interface UiElements {
  balance: HTMLElement;
  playTime: HTMLElement;
  saveStatus: HTMLElement;
}

/** Monta la interfaz provisional y devuelve las referencias que se repintan. */
export function mountUi(root: HTMLElement): UiElements & { debugAdd: HTMLButtonElement; reset: HTMLButtonElement } {
  root.innerHTML = `
    <main class="panel">
      <h1>Mesa 1 · Ruleta</h1>
      <p class="stat">Fichas: <strong data-ref="balance">0</strong></p>
      <p class="stat">Tiempo de juego: <span data-ref="playTime">0:00</span></p>
      <div class="row">
        <button data-ref="debugAdd">+1.234 fichas (prueba)</button>
        <button data-ref="reset" class="danger">Borrar partida</button>
      </div>
      <p class="muted" data-ref="saveStatus"></p>
    </main>
  `;
  const ref = <T extends HTMLElement>(name: string) => root.querySelector<T>(`[data-ref="${name}"]`)!;
  return {
    balance: ref('balance'),
    playTime: ref('playTime'),
    saveStatus: ref('saveStatus'),
    debugAdd: ref<HTMLButtonElement>('debugAdd'),
    reset: ref<HTMLButtonElement>('reset'),
  };
}

export function render(ui: UiElements, state: GameState): void {
  setText(ui.balance, formatNumber(state.balance));
  setText(ui.playTime, formatTime(state.playTime));
}

/** Solo toca el DOM si el texto ha cambiado. */
export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}
