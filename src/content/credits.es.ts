import { GAME_AUTHOR, GAME_TAGLINE, GAME_TITLE, REPO_URL } from '../game/config';

/** Una línea de los créditos: el título, un encabezado, un texto o un enlace. */
export interface CreditLine {
  kind: 'title' | 'tagline' | 'heading' | 'text' | 'link';
  text: string;
  href?: string;
}

/** Créditos (pantalla de créditos del menú y desplazamiento del final). El repositorio, solo si está en config. */
export function creditsLines(): CreditLine[] {
  const lines: CreditLine[] = [
    { kind: 'title', text: GAME_TITLE },
    { kind: 'tagline', text: GAME_TAGLINE },
    { kind: 'heading', text: 'Diseño, programación y textos' },
    { kind: 'text', text: GAME_AUTHOR },
    { kind: 'heading', text: 'Arte' },
    { kind: 'text', text: 'Pixel art generado con IA, procesado y retocado para el juego' },
    { kind: 'heading', text: 'Sonido' },
    { kind: 'text', text: 'Sintetizado en el navegador (Web Audio)' },
    { kind: 'heading', text: 'Fuente' },
    { kind: 'text', text: 'VT323 © 2011 The VT323 Project Authors (Peter Hull)' },
    { kind: 'link', text: 'SIL Open Font License 1.1', href: 'licencias/VT323-OFL.txt' },
  ];
  if (REPO_URL) lines.push({ kind: 'heading', text: 'Código' }, { kind: 'link', text: REPO_URL, href: REPO_URL });
  return lines;
}
