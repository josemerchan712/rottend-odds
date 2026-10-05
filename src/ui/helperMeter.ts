import type { TableId } from '../game/state';
import { formatNumber } from '../util/format';

/** Lo que ha ganado o perdido un ayudante en el último minuto de juego (para el "+N/min" del panel). */
export class HelperMeter {
  private events: { t: number; d: number }[] = [];

  add(time: number, delta: number): void {
    const last = this.events[this.events.length - 1];
    if (last && time < last.t) this.events = []; // partida nueva o cargada: el reloj ha vuelto atrás
    this.events.push({ t: time, d: delta });
  }

  /** Neto de los últimos 60 s, hasta `now`. */
  perMinute(now: number): number {
    while (this.events.length && this.events[0].t <= now - 60) this.events.shift();
    let sum = 0;
    for (const e of this.events) if (e.t <= now) sum += e.d;
    return sum;
  }

  /** Si ha apostado en el último minuto. */
  active(now: number): boolean {
    this.perMinute(now);
    return this.events.length > 0;
  }
}

export const helperMeters: Record<TableId, HelperMeter> = {
  1: new HelperMeter(),
  2: new HelperMeter(),
  3: new HelperMeter(),
  4: new HelperMeter(),
  5: new HelperMeter(),
};

/** Pinta el neto del último minuto en verde o rojo ("esperando" si no ha apostado). */
export function renderHelperNet(el: HTMLElement, table: TableId, now: number, waiting: boolean): void {
  const meter = helperMeters[table];
  const net = Math.round(meter.perMinute(now));
  let text: string;
  let tone: string;
  if (!meter.active(now)) {
    text = waiting ? 'Esperando: ahora no le compensa apostar' : 'Último minuto: sin apuestas';
    tone = '';
  } else {
    text = `Último minuto: ${net >= 0 ? '+' : '−'}${formatNumber(Math.abs(net))}/min`;
    tone = net > 0 ? 'pos' : net < 0 ? 'neg' : '';
  }
  if (el.textContent !== text) el.textContent = text;
  if (el.dataset.tone !== tone) el.dataset.tone = tone;
}

/** Marca discreta en el perfil recomendado para la suerte de ahora. */
export function markRecommended(buttons: HTMLElement[], recommended: number): void {
  buttons.forEach((b, i) => {
    const on = i === recommended;
    if (b.classList.contains('recommended') !== on) {
      b.classList.toggle('recommended', on);
      b.title = on ? 'Recomendado para tu suerte de ahora' : '';
    }
  });
}

/** Segundos que se agregan los resultados del ayudante antes de enseñar su neto. */
export const HELPER_NET_SECONDS = 2.5;

/**
 * Agrega los resultados del ayudante durante unos segundos y devuelve el neto al cerrar la ventana:
 * en vez de un aviso rojo por cada apuesta perdida, uno solo con lo ganado o perdido en ese rato.
 */
export class NetAggregator {
  private sum = 0;
  private count = 0;
  private age = -1;

  constructor(private readonly seconds = HELPER_NET_SECONDS) {}

  add(delta: number): void {
    if (this.age < 0) this.age = 0;
    this.sum += delta;
    this.count++;
  }

  /** Avanza dt; al cerrar la ventana devuelve el neto y cuántas apuestas suma (si no, null). */
  tick(dt: number): { net: number; count: number } | null {
    if (this.age < 0) return null;
    this.age += dt;
    if (this.age < this.seconds) return null;
    const out = { net: this.sum, count: this.count };
    this.sum = 0;
    this.count = 0;
    this.age = -1;
    return out;
  }
}

/** Texto del neto agregado: "+1,2K" / "−300" y, si son varias apuestas, cuántas. */
export function netText(net: number, count: number): string {
  const sign = net >= 0 ? '+' : '−';
  return `${sign}${formatNumber(Math.abs(Math.round(net)))}${count > 1 ? ` (${count})` : ''}`;
}
