import { endingFade, endingLineComplete, endingText, type EndingState } from '../game/ending';
import { TABLE_CURRENCIES, type GameSummary } from '../game/summary';
import { GAME_TITLE } from '../game/config';
import { formatNumber, formatPercent, formatTime } from '../util/format';
import { creditsHtml } from './menu';
import { setText } from './render';
import { drawText, textWidth } from './sceneText';
import { ready, type Sprites } from './sprites';
import { prepareCanvas } from './stage';

/** Caja del epílogo: franja inferior, fondo oscuro semitransparente (la sombra se ve a través). */
const BOX = { x: 44, y: 304, width: 552, height: 48 };
const LINE_HEIGHT = 18;

/** Parte un texto en líneas que caben en `width` unidades con ese estilo. */
export function wrapText(text: string, width: number, measure: (s: string) => number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * La escena del final en el canvas: la imagen de la figura que sube hacia las puertas, el fundido y
 * el epílogo con máquina de escribir en una caja oscura en la franja inferior (capa de texto nítido).
 * Detrás del libro, los créditos y los botones, la imagen sigue, más oscura.
 */
export class EndingScene {
  private readonly ctx: CanvasRenderingContext2D;
  private t = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly sprites: Sprites,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  render(dt: number, s: EndingState, lines: readonly string[]): void {
    const ctx = this.ctx;
    prepareCanvas(this.canvas, ctx);
    this.t += dt;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 640, 360);
    const img = this.sprites.screens.get('final');
    if (ready(img)) ctx.drawImage(img, 0, 0, 640, 360);
    else this.drawProvisional();
    // La luz fría de las puertas respira muy despacio.
    const glow = ctx.createRadialGradient(320, 90, 4, 320, 110, 120);
    glow.addColorStop(0, `rgba(190, 225, 240, ${(0.05 + 0.03 * Math.sin(this.t * 0.9)).toFixed(3)})`);
    glow.addColorStop(1, 'rgba(190, 225, 240, 0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = glow;
    ctx.fillRect(180, 0, 280, 240);
    ctx.globalCompositeOperation = 'source-over';

    if (s.phase === 'epilogue') this.drawEpilogue(s, lines);
    else if (s.phase !== 'lastLine' && s.phase !== 'fadeOut') {
      // Libro, créditos y botones: la imagen detrás, apagada (los créditos más, para leerlos).
      ctx.fillStyle = s.phase === 'credits' ? 'rgba(0, 0, 0, 0.72)' : s.phase === 'buttons' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(0, 0, 640, 360);
    }
    const fade = endingFade(s);
    if (fade > 0) {
      ctx.globalAlpha = fade;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 640, 360);
      ctx.globalAlpha = 1;
    }
  }

  private drawProvisional(): void {
    // Provisional (falta la imagen): escalera hacia una puerta con luz fría.
    const ctx = this.ctx;
    ctx.fillStyle = '#101418';
    ctx.fillRect(0, 0, 640, 360);
    ctx.fillStyle = '#cfe4ee';
    ctx.fillRect(296, 70, 48, 80);
    ctx.fillStyle = '#1d232a';
    for (let i = 0; i < 9; i++) ctx.fillRect(240 - i * 8, 150 + i * 16, 160 + i * 16, 4);
  }

  private drawEpilogue(s: EndingState, lines: readonly string[]): void {
    const text = endingText(s, lines);
    const full = lines[s.line] ?? '';
    if (!text && !endingLineComplete(s, lines)) return;
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(4, 5, 8, 0.66)';
    ctx.fillRect(BOX.x, BOX.y, BOX.width, BOX.height);
    ctx.strokeStyle = '#3a4350';
    ctx.lineWidth = 1;
    ctx.strokeRect(BOX.x + 0.5, BOX.y + 0.5, BOX.width - 1, BOX.height - 1);
    // Se parte la línea completa (para que las palabras no salten de renglón mientras se escriben).
    const wrapped = wrapText(full, BOX.width - 28, (v) => textWidth('epilogue', v));
    const top = BOX.y + BOX.height / 2 - ((wrapped.length - 1) * LINE_HEIGHT) / 2;
    let left = text.length;
    wrapped.forEach((row, i) => {
      const shown = row.slice(0, Math.max(0, left));
      left -= row.length + 1;
      drawText(ctx, 'epilogue', shown, BOX.x + 14, top + i * LINE_HEIGHT, 'left');
    });
    if (endingLineComplete(s, lines) && Math.sin(this.t * 4) > -0.2) drawText(ctx, 'epilogue', '▸', BOX.x + BOX.width - 12, BOX.y + BOX.height - 11);
  }
}

// ---------------------------------------------------------------------------
// La parte HTML: el libro de cuentas, los créditos que suben, los botones y el aviso de saltar.

const TABLE_NAMES = ['La ruleta', 'Las tragaperras', 'Los dados', 'El blackjack', 'Doble o nada'];

export interface EndingUi {
  root: HTMLElement;
  ledger: HTMLElement;
  ledgerBody: HTMLElement;
  credits: HTMLElement;
  creditsInner: HTMLElement;
  buttons: HTMLElement;
  toMenu: HTMLButtonElement;
  keepPlaying: HTMLButtonElement;
  copy: HTMLButtonElement;
  copyNote: HTMLElement;
  skipHint: HTMLElement;
  clickHint: HTMLElement;
}

export function mountEnding(root: HTMLElement): EndingUi {
  root.innerHTML = `
    <div class="ending-screen">
      <section class="ledger" data-ref="ledger" hidden>
        <div class="ledger-body" data-ref="ledgerBody"></div>
        <p class="ledger-foot">Clic para seguir</p>
      </section>
      <div class="ending-credits" data-ref="credits" hidden>
        <div class="ending-credits-inner" data-ref="creditsInner">${creditsHtml()}<p class="credit-text ending-thanks">Gracias por jugar.</p></div>
      </div>
      <section class="panel pixel-panel ending-buttons" data-ref="buttons" hidden aria-label="${GAME_TITLE}">
        <div class="ending-button-row">
          <button class="nav-item pixel-button" data-ref="toMenu">Volver al menú</button>
          <button class="nav-item pixel-button" data-ref="keepPlaying">Seguir jugando</button>
          <button class="nav-item pixel-button" data-ref="copy">Copiar resumen</button>
        </div>
        <p class="ending-note" data-ref="copyNote"></p>
      </section>
      <p class="ending-hint skip" data-ref="skipHint">Esc o mantén una tecla para saltar</p>
      <p class="ending-hint click" data-ref="clickHint">Clic para saltar</p>
    </div>`;
  const ref = <T extends HTMLElement = HTMLElement>(name: string) => root.querySelector<T>(`[data-ref="${name}"]`)!;
  return {
    root,
    ledger: ref('ledger'),
    ledgerBody: ref('ledgerBody'),
    credits: ref('credits'),
    creditsInner: ref('creditsInner'),
    buttons: ref('buttons'),
    toMenu: ref<HTMLButtonElement>('toMenu'),
    keepPlaying: ref<HTMLButtonElement>('keepPlaying'),
    copy: ref<HTMLButtonElement>('copy'),
    copyNote: ref('copyNote'),
    skipHint: ref('skipHint'),
    clickHint: ref('clickHint'),
  };
}

/** Rellena el libro de cuentas: dos páginas (tiempos y apuestas; ganancias y la casa). */
export function renderLedger(ui: EndingUi, summary: GameSummary): void {
  const row = (label: string, value: string) => `<tr><td>${label}</td><td>${value}</td></tr>`;
  const time = (t: number | null) => (t === null ? '—' : formatTime(t));
  const left = [
    '<h2>Tiempo</h2><table>',
    row('Total', formatTime(summary.totalTime)),
    ...summary.tableTimes.map((t, i) => row(`Mesa ${i + 1} · ${TABLE_NAMES[i]}`, time(t))),
    '</table><h2>Apuestas</h2><table>',
    row('Apuestas', formatNumber(summary.bets)),
    row('Ganadas', formatPercent(summary.winRate)),
    row('Jackpots', formatNumber(summary.jackpots)),
    row('Veces a cero', formatNumber(summary.zeros)),
    '</table>',
  ].join('');
  const right = [
    '<h2>Ganado</h2><table>',
    ...summary.won.map((n, i) => row(`Mesa ${i + 1}`, `${formatNumber(n)} ${TABLE_CURRENCIES[i]}`)),
    row('Total', formatNumber(summary.totalWon)),
    '</table><h2>La casa</h2><table>',
    row('Ayudantes comprados', `${summary.helpers} de 5`),
    row('Mejor racha (mesa 5)', `${summary.bestChain} caras`),
    '</table>',
  ].join('');
  ui.ledgerBody.innerHTML = `<header class="ledger-head"><h1>Libro de cuentas</h1><span>Saldado</span></header><div class="ledger-pages"><div class="ledger-page">${left}</div><div class="ledger-page">${right}</div></div>`;
}

/** Enseña lo que toca de cada fase (y coloca los créditos según lo que han subido). */
export function renderEndingUi(ui: EndingUi, s: EndingState): void {
  const p = s.phase;
  ui.ledger.hidden = p !== 'ledger';
  ui.credits.hidden = p !== 'credits';
  ui.buttons.hidden = p !== 'buttons';
  ui.skipHint.hidden = p === 'buttons';
  ui.clickHint.hidden = p !== 'credits';
  if (p === 'credits') ui.creditsInner.style.transform = `translateY(${Math.round(360 - s.creditsOffset)}px)`;
  if (p !== 'buttons') setText(ui.copyNote, '');
}

/** Lo que tienen que subir los créditos para salir enteros por arriba (unidades). */
export function creditsHeight(ui: EndingUi): number {
  return 360 + ui.creditsInner.offsetHeight;
}
