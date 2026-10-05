import type { GameSummary } from '../game/summary';
import { formatNumber, formatPercent, formatTime } from '../util/format';
import { setText } from './render';

/** Pantalla final: epílogo, estadísticas de la partida y créditos. Sin prestigio ni partida nueva+. */
export interface EndingUi {
  time: HTMLElement;
  bets: HTMLElement;
  winRate: HTMLElement;
  jackpots: HTMLElement;
  zeros: HTMLElement;
  toMenu: HTMLButtonElement;
}

export function mountEnding(root: HTMLElement): EndingUi {
  root.innerHTML = `
    <section class="panel menu ending">
      <h1>La casa es tuya</h1>
      <p class="ending-text">Pagaste al Encargado, a la Tragaperras, al Barman, a la Crupier y, al final, al Dueño.
      Las luces del casino se apagan una a una. Nadie te detiene en la puerta.
      Fuera amanece. En el bolsillo te queda una moneda: una cara, una cruz.</p>
      <h2 class="menu-section">Tu partida</h2>
      <table class="ending-stats">
        <tr><td>Tiempo total</td><td data-ref="time"></td></tr>
        <tr><td>Apuestas</td><td data-ref="bets"></td></tr>
        <tr><td>Ganadas</td><td data-ref="winRate"></td></tr>
        <tr><td>Jackpots</td><td data-ref="jackpots"></td></tr>
        <tr><td>Veces sin fichas</td><td data-ref="zeros"></td></tr>
      </table>
      <h2 class="menu-section">Créditos</h2>
      <p class="small-text">Diseño, programación y textos: José María Merchán Martos.</p>
      <p class="small-text">Arte: pixel art generado con IA y procesado para el juego.</p>
      <p class="small-text">Fuente VT323 © 2011 The VT323 Project Authors (Peter Hull), con licencia
      <a href="licencias/VT323-OFL.txt" target="_blank" rel="noopener">SIL Open Font License 1.1</a>.</p>
      <div class="menu-options"><button data-ref="toMenu">Volver al menú</button></div>
    </section>`;
  const ref = <T extends HTMLElement = HTMLElement>(name: string) => root.querySelector<T>(`[data-ref="${name}"]`)!;
  return {
    time: ref('time'),
    bets: ref('bets'),
    winRate: ref('winRate'),
    jackpots: ref('jackpots'),
    zeros: ref('zeros'),
    toMenu: ref<HTMLButtonElement>('toMenu'),
  };
}

export function renderEnding(ui: EndingUi, summary: GameSummary): void {
  setText(ui.time, formatTime(summary.totalTime));
  setText(ui.bets, formatNumber(summary.bets));
  setText(ui.winRate, formatPercent(summary.winRate));
  setText(ui.jackpots, formatNumber(summary.jackpots));
  setText(ui.zeros, formatNumber(summary.zeros));
}
