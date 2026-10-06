/**
 * Formato del nombre de jugador, igual que en el servidor (PlayerNames.java), para avisar al momento mientras
 * se escribe. Lo demás (ocupado, reservado, ofensivo) lo dice el servidor con la consulta de disponibilidad.
 */
export const PLAYER_NAME_MIN = 3;
export const PLAYER_NAME_MAX = 20;
const FORMAT = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,18})[A-Za-z0-9]$/;

/** null si el formato es válido; si no, por qué. */
export function playerNameFormatError(name: string): string | null {
  const n = name.trim();
  if (n.length < PLAYER_NAME_MIN) return `Mínimo ${PLAYER_NAME_MIN} caracteres`;
  if (n.length > PLAYER_NAME_MAX) return `Máximo ${PLAYER_NAME_MAX} caracteres`;
  if (/[^A-Za-z0-9_-]/.test(n)) return 'Solo letras sin tilde, números, "-" y "_"';
  if (!FORMAT.test(n)) return 'No puede empezar ni acabar con "-" o "_"';
  return null;
}

/** Comprobaciones de la contraseña que se pueden hacer sin el servidor. */
export function passwordError(password: string, name: string): string | null {
  if (password.length < 10) return 'La contraseña necesita 10 caracteres o más';
  if (password.trim().toLowerCase() === name.trim().toLowerCase()) return 'La contraseña no puede ser igual que el nombre';
  return null;
}
