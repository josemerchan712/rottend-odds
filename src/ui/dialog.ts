import { MenuNav } from './menuNav';

export interface ConfirmOptions {
  /** Texto del botón que acepta. */
  confirm: string;
  /** Texto del botón que cancela (por defecto "Cancelar"). */
  cancel?: string;
  /** Aceptar es destructivo (borrar, sobrescribir): el botón va en rojo. */
  danger?: boolean;
}

/**
 * Diálogos de confirmación propios con el marco pixel (sustituyen a confirm() del navegador). Se
 * responden con teclado (flechas, Intro, Esc cancela) o con el ratón. El foco empieza en Cancelar.
 */
export class Dialogs {
  private readonly layer: HTMLElement;
  private readonly text: HTMLElement;
  private readonly ok: HTMLButtonElement;
  private readonly no: HTMLButtonElement;
  private readonly nav: MenuNav;
  private resolve: ((value: boolean) => void) | null = null;

  constructor(stage: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.className = 'dialog-layer';
    this.layer.hidden = true;
    this.layer.innerHTML = `
      <section class="panel dialog" role="alertdialog" aria-modal="true">
        <p class="dialog-text"></p>
        <div class="dialog-buttons">
          <button class="nav-item pixel-button" data-ref="no"></button>
          <button class="nav-item pixel-button" data-ref="ok"></button>
        </div>
      </section>`;
    stage.append(this.layer);
    this.text = this.layer.querySelector('.dialog-text')!;
    this.ok = this.layer.querySelector('[data-ref="ok"]')!;
    this.no = this.layer.querySelector('[data-ref="no"]')!;
    this.nav = new MenuNav(this.layer, { horizontal: true, onBack: () => this.close(false) });
    this.ok.addEventListener('click', () => this.close(true));
    this.no.addEventListener('click', () => this.close(false));
  }

  get open(): boolean {
    return this.resolve !== null;
  }

  /** Pregunta y espera la respuesta (true = aceptar). Si ya había uno abierto, se cancela. */
  confirm(message: string, options: ConfirmOptions): Promise<boolean> {
    this.close(false);
    this.text.textContent = message;
    this.ok.textContent = options.confirm;
    this.no.textContent = options.cancel ?? 'Cancelar';
    this.ok.classList.toggle('danger', options.danger ?? false);
    this.layer.hidden = false;
    this.nav.reset(this.no);
    return new Promise((resolve) => (this.resolve = resolve));
  }

  /** Teclas mientras hay un diálogo abierto: todas son suyas (el juego y el menú de detrás no las ven). */
  handleKey(event: KeyboardEvent): boolean {
    if (!this.open) return false;
    this.nav.handleKey(event);
    return true;
  }

  private close(value: boolean): void {
    const resolve = this.resolve;
    if (!resolve) return;
    this.resolve = null;
    this.layer.hidden = true;
    resolve(value);
  }
}
