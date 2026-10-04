import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import {
  canBetManually,
  canCollectTrash,
  createRoomState,
  fadeAlpha,
  goTo,
  toggleRoom,
  transitionSeconds,
  updateRooms,
} from '../src/game/rooms';

const half = CONFIG.rooms.fadeSeconds;

describe('salas de la mesa 1', () => {
  it('se empieza en el casino: se apuesta a mano y no se recoge basura', () => {
    const rooms = createRoomState();
    expect(rooms.current).toBe('casino');
    expect(canBetManually(rooms)).toBe(true);
    expect(canCollectTrash(rooms)).toBe(false);
  });

  it('cambiar de sala es un fundido: a mitad cambia la sala, al final se puede actuar', () => {
    const rooms = createRoomState();
    expect(toggleRoom(rooms)).toBe(true);
    expect(canBetManually(rooms)).toBe(false); // nada durante la transición
    expect(updateRooms(rooms, half * 0.5)).toBeNull();
    expect(fadeAlpha(rooms)).toBeCloseTo(0.5, 5);
    expect(updateRooms(rooms, half * 0.6)).toBe('trastienda');
    expect(rooms.current).toBe('trastienda');
    expect(canCollectTrash(rooms)).toBe(false); // aún en el fundido de entrada
    updateRooms(rooms, half);
    expect(rooms.transition).toBeNull();
    expect(fadeAlpha(rooms)).toBe(0);
    expect(canCollectTrash(rooms)).toBe(true);
    expect(canBetManually(rooms)).toBe(false);
  });

  it('un salto de tiempo grande completa el cambio de una vez', () => {
    const rooms = createRoomState();
    goTo(rooms, 'trastienda');
    expect(updateRooms(rooms, 10)).toBe('trastienda');
    expect(rooms.transition).toBeNull();
  });

  it('no se puede encadenar otro cambio a mitad, ni ir a la sala en la que ya estás', () => {
    const rooms = createRoomState();
    expect(goTo(rooms, 'casino')).toBe(false);
    goTo(rooms, 'trastienda');
    expect(toggleRoom(rooms)).toBe(false);
    updateRooms(rooms, transitionSeconds());
    expect(toggleRoom(rooms)).toBe(true);
    updateRooms(rooms, transitionSeconds());
    expect(rooms.current).toBe('casino');
  });
});
