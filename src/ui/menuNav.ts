import { sfx } from '../audio';
import { nextIndex } from '../game/menu';

export interface MenuNavOptions {
  /** Esc: volver (o cancelar). */
  onBack?: () => void;
  /** Izquierda y derecha también mueven (diálogos con los botones en fila). */
  horizontal?: boolean;
  /** Izquierda y derecha sobre una opción ajustable (volumen, filtro CRT): true si la ha ajustado. */
  onAdjust?: (item: HTMLElement, delta: number) => boolean;
}

/**
 * Navegación de una lista de opciones (`.nav-item`) con teclado y ratón: flechas para moverse (dando
 * la vuelta), Intro o Espacio para elegir, Esc para volver; al pasar el ratón la opción se resalta.
 * Cada cambio de opción suena con un tic suave. La opción resaltada lleva la clase `focused`.
 */
export class MenuNav {
  private current: HTMLElement | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly options: MenuNavOptions = {},
  ) {
    root.addEventListener('mouseover', (event) => {
      const item = (event.target as HTMLElement).closest<HTMLElement>('.nav-item');
      if (item && root.contains(item) && this.items().includes(item)) this.highlight(item, true);
    });
    root.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('.nav-item')) sfx('select');
    });
  }

  /** Opciones visibles y activas, en orden. */
  items(): HTMLElement[] {
    return [...this.root.querySelectorAll<HTMLElement>('.nav-item')].filter(
      (el) => !el.closest('[hidden]') && !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true',
    );
  }

  /** Resalta la primera opción (o la indicada), sin sonido: al abrir la pantalla. */
  reset(first?: HTMLElement | null): void {
    const items = this.items();
    this.highlight(first && items.includes(first) ? first : (items[0] ?? null), false);
  }

  private highlight(item: HTMLElement | null, sound: boolean): void {
    if (item === this.current) return;
    this.current?.classList.remove('focused');
    this.current = item;
    item?.classList.add('focused');
    if (item) revealInScroller(item);
    if (item && sound) sfx('tick');
  }

  /** Atiende una tecla; devuelve true si era suya. */
  handleKey(event: KeyboardEvent): boolean {
    const items = this.items();
    if (this.current && !items.includes(this.current)) this.highlight(null, false);
    const index = this.current ? items.indexOf(this.current) : -1;
    const move = (delta: number) => {
      const next = nextIndex(index, delta, items.length);
      if (next >= 0) this.highlight(items[next], true);
    };
    switch (event.key) {
      case 'ArrowDown':
        move(1);
        return true;
      case 'ArrowUp':
        move(-1);
        return true;
      case 'ArrowLeft':
      case 'ArrowRight': {
        const delta = event.key === 'ArrowLeft' ? -1 : 1;
        if (this.current && this.options.onAdjust?.(this.current, delta)) return true;
        if (this.options.horizontal) move(delta);
        return true;
      }
      case 'Enter':
      case ' ': {
        if (!this.current) return false;
        // Un botón con el foco del navegador ya se pulsa solo con Intro o Espacio: no pulsarlo dos veces.
        const native = document.activeElement === this.current && this.current instanceof HTMLButtonElement;
        if (!native) {
          event.preventDefault();
          this.current.click();
        }
        return true;
      }
      case 'Escape':
        if (!this.options.onBack) return false;
        this.options.onBack();
        return true;
      default:
        return false;
    }
  }
}

/**
 * Si la opción está dentro de una lista con scroll (el menú principal cuando no cabe), desplaza solo esa lista
 * para que se vea entera. No usa scrollIntoView: movería también el escenario, que tiene overflow: hidden.
 */
function revealInScroller(item: HTMLElement): void {
  const list = item.parentElement;
  if (!list || list.scrollHeight <= list.clientHeight + 1) return;
  const top = item.offsetTop - (item.offsetParent === list ? 0 : list.offsetTop) - 4;
  const bottom = top + item.offsetHeight + 8;
  if (top < list.scrollTop) list.scrollTop = top;
  else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
}
