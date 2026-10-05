import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import { lenderPhase } from '../src/game/lender';
import { seededRng } from '../src/game/rng';
import { slotColor, spin } from '../src/game/roulette';
import {
  landingSlot,
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
/** Resultados posibles: 0-36 y el jackpot (-1, sin casilla propia: cae en el cero). */
const NUMBERS = Array.from({ length: 37 }, (_, i) => i);
const ALL_SLOTS = [-1, ...NUMBERS];
const EUROPEAN = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

describe('anillo de la ruleta', () => {
  it('37 casillas en el orden de una ruleta europea, con un único cero', () => {
    expect([...POCKETS]).toEqual(EUROPEAN);
    expect([...POCKETS].sort((a, b) => a - b)).toEqual(NUMBERS);
    expect(POCKETS.filter((s) => s === 0)).toHaveLength(1);
    expect(POCKETS).not.toContain(-1);
  });

  it('18 negras y 18 blanco hueso, alternadas alrededor del anillo, y el cero verde', () => {
    const colors = POCKETS.map(pocketColor);
    expect(colors.filter((c) => c === 'negro')).toHaveLength(18);
    expect(colors.filter((c) => c === 'blanco')).toHaveLength(18);
    expect(colors.filter((c) => c === 'verde')).toHaveLength(1);
    for (let i = 2; i < POCKETS.length; i++) expect(colors[i]).not.toBe(colors[i - 1]);
    expect(colors[1]).not.toBe(colors[POCKETS.length - 1]);
  });

  it('el color de cada casilla dibujada es el del resultado lógico (el mismo que el tapete)', () => {
    for (const slot of ALL_SLOTS) expect(pocketColor(slot)).toBe(slotColor(slot));
    expect(slotColor(0)).toBe('verde');
    expect(slotColor(-1)).toBe('dorado');
  });

  it('slotAt es la inversa de pocketAngle, también con vueltas de más', () => {
    for (const slot of NUMBERS) {
      expect(slotAt(pocketAngle(slot))).toBe(slot);
      expect(slotAt(pocketAngle(slot) + 3 * TAU)).toBe(slot);
      expect(slotAt(pocketAngle(slot) - 5 * TAU + 0.01)).toBe(slot);
    }
    // El jackpot cae en el cero (con el destello dorado).
    expect(landingSlot(-1)).toBe(0);
    expect(pocketAngle(-1)).toBe(pocketAngle(0));
  });
});

describe('tirada animada', () => {
  it('para cada uno de los 37 números, la bola se para en su casilla', () => {
    for (const slot of NUMBERS) {
      const plan = planSpin(slot, 0.37 * slot, -1.3 * slot, 1.1);
      const end = spinPose(plan, plan.duration);
      expect(slotUnderBall(end)).toBe(slot);
    }
  });

  it('la bola acaba siempre en la casilla del resultado, desde cualquier posición', () => {
    const rng = seededRng(21);
    for (let n = 0; n < 500; n++) {
      const slot = ALL_SLOTS[Math.floor(rng() * ALL_SLOTS.length)];
      const plan = planSpin(slot, rng() * 40 - 20, rng() * 40 - 20, 1.1);
      const end = spinPose(plan, plan.duration);
      expect(slotUnderBall(end)).toBe(landingSlot(slot));
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
      expect(slotUnderBall(spinPose(plan, plan.duration))).toBe(landingSlot(result.slot));
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
