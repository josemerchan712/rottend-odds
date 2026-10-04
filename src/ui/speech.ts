import { CONFIG } from '../game/config';

/** Letras por segundo del efecto de máquina de escribir. */
const TYPE_SPEED = 38;
const FADE_SECONDS = 0.4;

export interface SpeechPlacement {
  /** 'bubble': bocadillo sobre el prestamista; 'box': caja abajo con su nombre (fuera de su vista). */
  mode: 'bubble' | 'box';
  /** Punto (unidades de 640x360) al que apunta el bocadillo: encima de la cabeza. */
  anchor?: { x: number; y: number };
  /** Borde izquierdo mínimo del bocadillo (para no tapar la rueda). */
  minLeft?: number;
}

/**
 * Bocadillo del prestamista: una línea cada vez, se escribe letra a letra, se queda unos segundos
 * y se desvanece. Un clic completa el texto; otro lo cierra.
 */
export class Speech {
  private readonly el: HTMLElement;
  private readonly name: HTMLElement;
  private readonly text: HTMLElement;
  private full = '';
  private shown = 0;
  private hold = 0;
  private fade = 0;
  private active = false;

  constructor(parent: HTMLElement, private speaker: string) {
    this.el = document.createElement('div');
    this.el.className = 'speech pixel-frame';
    this.el.hidden = true;
    this.el.setAttribute('role', 'status');
    this.el.innerHTML = '<div class="speech-name"></div><div class="speech-text"></div>';
    this.name = this.el.querySelector('.speech-name')!;
    this.text = this.el.querySelector('.speech-text')!;
    parent.append(this.el);
    this.el.addEventListener('click', (event) => {
      event.stopPropagation();
      if (this.shown < this.full.length) this.shown = this.full.length;
      else this.close();
    });
  }

  setSpeaker(speaker: string): void {
    this.speaker = speaker;
  }

  get speaking(): boolean {
    return this.active;
  }

  say(line: string): void {
    this.full = line;
    this.shown = 0;
    this.hold = CONFIG.dialogue.displaySeconds;
    this.fade = 0;
    this.active = true;
    this.el.hidden = false;
    this.el.style.opacity = '1';
    this.name.textContent = this.speaker;
  }

  close(): void {
    this.active = false;
    this.el.hidden = true;
  }

  update(dt: number, placement: SpeechPlacement): void {
    if (!this.active) return;
    if (this.shown < this.full.length) this.shown = Math.min(this.full.length, this.shown + dt * TYPE_SPEED);
    else if (this.hold > 0) this.hold -= dt;
    else {
      this.fade += dt;
      this.el.style.opacity = String(Math.max(0, 1 - this.fade / FADE_SECONDS));
      if (this.fade >= FADE_SECONDS) this.close();
    }
    const visible = this.full.slice(0, Math.floor(this.shown));
    if (this.text.textContent !== visible) this.text.textContent = visible;
    this.el.dataset.mode = placement.mode;
    if (placement.mode === 'bubble' && placement.anchor) {
      const width = this.el.offsetWidth;
      const left = Math.min(Math.max(placement.anchor.x - width / 2, placement.minLeft ?? 4), 640 - width - 4);
      this.el.style.left = `${Math.round(left)}px`;
      this.el.style.top = `${Math.round(placement.anchor.y - this.el.offsetHeight - 6)}px`;
      this.el.style.setProperty('--tail-x', `${Math.round(placement.anchor.x - left)}px`);
    } else {
      this.el.style.left = '';
      this.el.style.top = '';
    }
  }
}
