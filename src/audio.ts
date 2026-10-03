/**
 * Punto de enganche del audio. Los navegadores solo dejan arrancar el audio tras un gesto
 * del usuario: unlockAudio() se llama desde el clic de "Continuar" o "Nueva partida".
 * De momento no hay sonido; aquí se creará el AudioContext.
 */
let unlocked = false;
let volume = 1;

export function unlockAudio(): void {
  unlocked = true;
}

export function setVolume(value: number): void {
  volume = value;
}

export function audioState(): { unlocked: boolean; volume: number } {
  return { unlocked, volume };
}
