/**
 * Marcadores que no pueden llegar a la versión publicada: textos pendientes entre corchetes
 * («[PONER CONTACTO]», «[UBICACIÓN PENDIENTE: …]») y constantes %ASÍ% que el build no ha sustituido.
 * Lo usa vite.config.ts: si el build los encuentra en dist/, falla.
 */
const PATTERNS: readonly RegExp[] = [
  // Solo en mayúsculas justo tras el corchete, para no confundirlo con textos del juego («TODO · 5 fichas»).
  /\[(?:PONER\b|[A-ZÁÉÍÓÚÑ ]{0,40}\bPENDIENTE\b|POR DEFINIR\b)[^\]\n]{0,160}\]/g,
  /%(GAME_TITLE|GAME_TAGLINE|SITE_URL|CONTACT_EMAIL|[A-Z][A-Z0-9_]{3,})%/g,
];

/** Marcadores pendientes encontrados en un texto (vacío si no hay ninguno). */
export function findPendingMarkers(text: string): string[] {
  return PATTERNS.flatMap((re) => [...text.matchAll(re)].map((m) => m[0]));
}
