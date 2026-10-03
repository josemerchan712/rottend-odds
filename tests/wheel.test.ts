import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import { lenderPhase } from '../src/game/lender';
import { seededRng } from '../src/game/rng';
import { slotColor, spin } from '../src/game/roulette';
import {
  POCKETS,
  planSpin,
  pocketAngle,
  pocketColor,
  slotAt,
  slotUnderBall,
  spinPose,
} from '../src/ui/wheelMath';
import { stateWith } from './helpers';

const TAU = Math.PI * 2;
const ALL_SLOTS = [-1, ...Array.from({ length: 37 }, (_, i) => i)];

describe('anillo de la ruleta', () => {
  it('tiene una casilla por resultado posible: 0, Cero Dorado y 1-36', () => {
    expect([...POCKETS].sort((a, b) => a - b)).toEqual(ALL_SLOTS);
  });

  it('el color de cada casilla dibujada es el del resultado lógico', () => {
    for (const slot of ALL_SLOTS) expect(pocketColor(slot)).toBe(slotColor(slot));
    expect(pocketColor(0)).toBe('verde');
    expect(pocketColor(-1)).toBe('dorado');
    expect(pocketColor(17)).toBe('negro');
    expect(pocketColor(18)).toBe('blanco');
  });

  it('negro y blanco se alternan alrededor del anillo', () => {
    for (let i = 3; i < POCKETS.length; i++) expect(pocketColor(POCKETS[i])).not.toBe(pocketColor(POCKETS[i - 1]));
  });

  it('slotAt es la inversa de pocketAngle, también con vueltas de más', () => {
    for (const slot of ALL_SLOTS) {
      expect(slotAt(pocketAngle(slot))).toBe(slot);
      expect(slotAt(pocketAngle(slot) + 3 * TAU)).toBe(slot);
      expect(slotAt(pocketAngle(slot) - 5 * TAU + 0.01)).toBe(slot);
    }
  });
});

describe('tirada animada', () => {
  it('la bola acaba siempre en la casilla del resultado, desde cualquier posición', () => {
    const rng = seededRng(21);
    for (let n = 0; n < 500; n++) {
      const slot = ALL_SLOTS[Math.floor(rng() * ALL_SLOTS.length)];
      const plan = planSpin(slot, rng() * 40 - 20, rng() * 40 - 20, 1.1);
      const end = spinPose(plan, plan.duration);
      expect(slotUnderBall(end)).toBe(slot);
      expect(end.drop).toBe(1);
      // La rueda se para recta (sin rotar el pixel art).
      expect(Math.abs(Math.sin(end.wheel / 2))).toBeLessThan(1e-9);
    }
  });

  it('la rueda gira hacia un lado y la bola hacia el otro, varias vueltas', () => {
    const plan = planSpin(5, 1, 2, 1);
    expect(plan.wheelTo - plan.wheelFrom).toBeGreaterThan(TAU * 1.5);
    expect(plan.ballFrom - plan.ballTo).toBeGreaterThan(TAU * 2.5);
  });

  it('coincide con el resultado que decide la lógica del juego (RNG con semilla)', () => {
    const rng = seededRng(8);
    const state = stateWith({ balance: 1e9 });
    state.upgrades.maxBet = 11;
    state.upgrades.dozenBet = 1;
    state.upgrades.numberBet = 1;
    let wheel = 0;
    let ball = 0;
    for (let n = 0; n < 300; n++) {
      const choice = n % 3 === 0 ? { type: 'number', number: 7 } as const : n % 3 === 1 ? { type: 'dozen', dozen: 2 } as const : { type: 'color', color: 'negro' } as const;
      const result = spin(state, { bettor: 'jugador', choice, bet: 100 }, rng)!;
      // Una tirada nueva puede interrumpir la anterior a medias.
      const plan = planSpin(result.slot, wheel, ball, 1.1);
      const mid = spinPose(plan, rng() * plan.duration);
      wheel = mid.wheel;
      ball = mid.ball;
      expect(slotUnderBall(spinPose(plan, plan.duration))).toBe(result.slot);
    }
  });
});

describe('fases del Encargado', () => {
  it('calmado, inquieto y deformado según el % de deuda reunido', () => {
    const debt = CONFIG.debt.amount;
    expect(lenderPhase(stateWith({ balance: 0 }))).toBe('calm');
    expect(lenderPhase(stateWith({ balance: debt * 0.32 }))).toBe('calm');
    expect(lenderPhase(stateWith({ balance: debt * 0.34 }))).toBe('uneasy');
    expect(lenderPhase(stateWith({ balance: debt * 0.65 }))).toBe('uneasy');
    expect(lenderPhase(stateWith({ balance: debt * 0.67 }))).toBe('deformed');
    expect(lenderPhase(stateWith({ balance: debt * 2 }))).toBe('deformed');
    expect(lenderPhase(stateWith({ balance: 5, debtPaid: true }))).toBe('calm');
  });
});
