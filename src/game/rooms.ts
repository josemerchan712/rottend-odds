import { CONFIG } from './config';

/**
 * Las dos salas de la mesa 1: el casino (ruleta, tapete, Encargado, ayudante de apuestas) y la
 * trastienda (la basura). Estado de navegación puro, sin DOM: la escena lo dibuja con un fundido.
 * No se guarda en la partida: siempre se empieza en el casino.
 */
export type Room = 'casino' | 'trastienda';

export interface RoomState {
  current: Room;
  /** Cambio de sala en curso: fundido a negro, cambio a mitad, fundido desde negro. */
  transition: { to: Room; elapsed: number } | null;
}

export function createRoomState(): RoomState {
  return { current: 'casino', transition: null };
}

export function otherRoom(room: Room): Room {
  return room === 'casino' ? 'trastienda' : 'casino';
}

/** Duración total del cambio de sala (fundido de salida + de entrada). */
export function transitionSeconds(): number {
  return CONFIG.rooms.fadeSeconds * 2;
}

/** Empieza a ir a otra sala. No hace nada si ya está allí o si hay un cambio en curso. */
export function goTo(rooms: RoomState, to: Room): boolean {
  if (rooms.transition || rooms.current === to) return false;
  rooms.transition = { to, elapsed: 0 };
  return true;
}

export function toggleRoom(rooms: RoomState): boolean {
  return goTo(rooms, otherRoom(rooms.current));
}

/**
 * Avanza el fundido. La sala cambia justo a mitad (con la pantalla en negro). Devuelve la sala en
 * la que se acaba de entrar, o null.
 */
export function updateRooms(rooms: RoomState, dt: number): Room | null {
  const t = rooms.transition;
  if (!t) return null;
  const half = CONFIG.rooms.fadeSeconds;
  const before = t.elapsed;
  t.elapsed += dt;
  let entered: Room | null = null;
  if (before < half && t.elapsed >= half) {
    rooms.current = t.to;
    entered = t.to;
  }
  if (t.elapsed >= half * 2) {
    if (rooms.current !== t.to) {
      rooms.current = t.to;
      entered = t.to;
    }
    rooms.transition = null;
  }
  return entered;
}

/** Opacidad del negro del fundido (0 = nada, 1 = negro total a mitad del cambio). */
export function fadeAlpha(rooms: RoomState): number {
  const t = rooms.transition;
  if (!t) return 0;
  const half = CONFIG.rooms.fadeSeconds;
  return t.elapsed < half ? t.elapsed / half : Math.max(0, 2 - t.elapsed / half);
}

export function inTransition(rooms: RoomState): boolean {
  return rooms.transition !== null;
}

/** Apostar a mano solo se puede en el casino (el ayudante apuesta siempre). */
export function canBetManually(rooms: RoomState): boolean {
  return rooms.current === 'casino' && !rooms.transition;
}

/** Recoger basura solo se puede en la trastienda. */
export function canCollectTrash(rooms: RoomState): boolean {
  return rooms.current === 'trastienda' && !rooms.transition;
}
