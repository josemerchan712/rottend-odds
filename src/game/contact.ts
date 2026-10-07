import { CONTACT_EMAIL } from './config';

/** Asunto del correo de «Reportar un problema». */
export const REPORT_SUBJECT = 'Rotten Odds · problema';

/**
 * Enlace mailto para reportar un problema: abre el programa de correo del jugador con el mensaje preparado.
 * Solo lleva la versión del juego y el navegador (nada de la partida ni datos personales), y no se envía nada
 * hasta que el jugador pulse Enviar en su correo.
 */
export function reportMailto(version: string, browser: string, email: string = CONTACT_EMAIL): string {
  const body = [
    'Cuéntanos qué ha pasado y cómo llegar a ello:',
    '',
    '',
    '---',
    `Versión del juego: ${version}`,
    `Navegador: ${browser}`,
  ].join('\n');
  return `mailto:${email}?subject=${encodeURIComponent(REPORT_SUBJECT)}&body=${encodeURIComponent(body)}`;
}
