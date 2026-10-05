import { describe, expect, it } from 'vitest';
import { ONLINE_ENABLED } from '../src/api/client';
import { seededRng } from '../src/game/rng';
import { createInitialState } from '../src/game/state';
import { gameSummary, isGameFinished, trackZeros } from '../src/game/summary';
import { updateGame } from '../src/game/update';

describe('pantalla final: resumen de la partida', () => {
  it('suma apuestas, ganadas y jackpots de las cinco mesas', () => {
    const state = createInitialState();
    state.playTime = 3600;
    state.stats.bets = 10;
    state.stats.wins = 5;
    state.slots.stats.spins = 10;
    state.slots.stats.wins = 5;
    state.coin.stats.chains = 20;
    state.coin.stats.cashouts = 10;
    state.cards.stats.jackpots = 2;
    const s = gameSummary(state);
    expect(s).toMatchObject({ totalTime: 3600, bets: 40, winRate: 0.5, jackpots: 2 });
    expect(isGameFinished(state)).toBe(false);
    state.coin.debtPaid = true;
    expect(isGameFinished(state)).toBe(true);
  });

  it('cuenta las veces que una mesa se queda sin poder apostar', () => {
    const state = createInitialState();
    state.balance = 5;
    trackZeros(state);
    state.balance = 0;
    trackZeros(state);
    trackZeros(state); // sigue a cero: no vuelve a contar
    state.balance = 3;
    updateGame(state, 0.1, seededRng(1));
    state.balance = 0;
    updateGame(state, 0.1, seededRng(1));
    expect(state.stats.zeros).toBe(2);
  });

  it('sin VITE_API_URL el juego va sin servidor', () => {
    expect(ONLINE_ENABLED).toBe(Boolean(import.meta.env.VITE_API_URL));
  });
});
