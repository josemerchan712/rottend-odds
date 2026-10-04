import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import { seededRng } from '../src/game/rng';
import { deserialize, serialize } from '../src/game/save';
import {
  bestHold,
  heldWinChance,
  holdFee,
  MEAN_WIN_PAYOUT,
  outcomeOf,
  playerSpin,
  reelsFor,
  selectedSlotChip,
  slotChips,
  slotExpectedValue,
  slotJackpotChance,
  slotJackpotPayout,
  slotLuckChance,
  slotMaxBet,
  slotWinChance,
  spinSlots,
  toggleHold,
} from '../src/game/slots/machine';
import { createSlotsState } from '../src/game/slots/state';
import {
  buySlotUpgrade,
  canPaySlotsDebt,
  canSwitchTable,
  isSlotsUnlocked,
  passiveRate,
  paySlotsDebt,
  table1IncomeRate,
  updateSlots,
  updateZombie,
  zombieBet,
} from '../src/game/slots/table';
import { createInitialState } from '../src/game/state';
import { updateGame } from '../src/game/update';
import { sequenceRng, stateWith } from './helpers';

const S = CONFIG.slots;
const MAX = S.upgrades.luck.maxLevel;
const D = S.diamond;

describe('tragaperras: suerte y valor esperado', () => {
  it('con suerte 0 el valor esperado es negativo; sube con la suerte (convexa) hasta el 97%', () => {
    expect(slotLuckChance(0)).toBeCloseTo(96 / 216, 6);
    expect(slotExpectedValue(1, 1000, 0, 0, { pot: S.jackpot.potSeed })).toBeLessThan(0);
    expect(slotLuckChance(MAX)).toBeCloseTo(0.97, 6);
    const first = slotLuckChance(5) - slotLuckChance(0);
    const last = slotLuckChance(MAX) - slotLuckChance(MAX - 5);
    expect(last).toBeGreaterThan(first * 3);
    expect(slotExpectedValue(1, 1000, MAX, 0, { pot: 0 })).toBeGreaterThan(0.8);
  });

  it('apostar fuerte penaliza, menos con mucha suerte', () => {
    expect(slotWinChance(0, 1)).toBeCloseTo(96 / 216 - 0.2, 6);
    expect(slotWinChance(MAX, 1)).toBeCloseTo(0.97 - 0.04, 6);
    expect(slotExpectedValue(15, 15, 6, 0)).toBeLessThan(slotExpectedValue(1, 15, 6, 0) * 15);
  });

  it('premio medio de una tirada ganadora ≈ 2,03 veces la apuesta', () => {
    expect(MEAN_WIN_PAYOUT).toBeCloseTo(2.03125, 5);
  });
});

describe('tragaperras: carretes', () => {
  it('los carretes siempre enseñan el resultado; fuera del jackpot nunca hay tres diamantes', () => {
    const rng = seededRng(3);
    for (let i = 0; i < 2000; i++) {
      for (const outcome of ['nada', 'pareja', 'trio'] as const) {
        const reels = reelsFor(outcome, rng);
        expect(outcomeOf(reels)).toBe(outcome);
        const symbol = [0, 1, 3, 4, 5][i % 5]; // nunca el diamante
        const held = { reel: i % 3, symbol };
        const heldReels = reelsFor(outcome, rng, held);
        expect(heldReels[held.reel]).toBe(held.symbol);
        expect(outcomeOf(heldReels)).toBe(outcome);
      }
    }
    expect(outcomeOf(reelsFor('jackpot', rng))).toBe('jackpot');
  });

  it('dos iguales pagan x1,5 y tres iguales x10 (bruto); sin pareja se pierde', () => {
    const slots = { ...createSlotsState(), balance: 100 };
    // [jackpot?, premio?, trío?, ...carretes]
    const pair = spinSlots(slots, { bettor: 'jugador', bet: 10, hold: null, from: slots.reels }, sequenceRng(0.999, 0, 0.5, 0.3, 0.6, 0.1, 0.2, 0.3));
    expect(pair?.outcome).toBe('pareja');
    expect(pair?.delta).toBe(5);
    const trio = spinSlots(slots, { bettor: 'jugador', bet: 10, hold: null, from: slots.reels }, sequenceRng(0.999, 0, 0, 0.1, 0.5));
    expect(trio?.outcome).toBe('trio');
    expect(trio?.delta).toBe(90);
    const lose = spinSlots(slots, { bettor: 'jugador', bet: 10, hold: null, from: slots.reels }, sequenceRng(0.999, 0.999, 0.1, 0.5, 0.9));
    expect(lose?.outcome).toBe('nada');
    expect(lose?.delta).toBe(-10);
    expect(slots.balance).toBe(100 + 5 + 90 - 10);
  });
});

describe('tragaperras: retener carrete', () => {
  it('sube la probabilidad de premio y cuesta un extra', () => {
    expect(heldWinChance(0.5, 1)).toBeCloseTo(0.5 + 0.5 * S.hold.shareBase, 6);
    expect(holdFee(10)).toBe(Math.ceil(10 * S.hold.feeFraction));
  });

  it('compensa con poca suerte y no con mucha (decisión real)', () => {
    const reels: [number, number, number] = [0, 1, 3];
    const pot = S.jackpot.potSeed;
    expect(bestHold(reels, 10, 1000, 0, 0, 3, 0, pot)).toBe(0);
    expect(bestHold(reels, 10, 1000, MAX, 0, 3, 0, pot)).toBeNull();
    // El diamante no se deja retener: se retiene otro carrete.
    expect(bestHold([D, 1, 3], 10, 1000, 0, 0, 3, 0, pot)).toBe(1);
    expect(bestHold([D, D, D], 10, 1000, 0, 0, 3, 0, pot)).toBeNull();
  });

  it('el carrete retenido conserva su símbolo y se cobra el extra', () => {
    const slots = { ...createSlotsState(), balance: 1000 };
    slots.upgrades.hold = 1;
    slots.reels = [4, 1, 3];
    expect(toggleHold(slots, 0)).toBe(true);
    const result = playerSpin(slots, seededRng(9))!;
    expect(result.held).toBe(0);
    expect(result.reels[0]).toBe(4);
    expect(result.holdFee).toBeGreaterThan(0);
    expect(slots.hold).toBeNull();
  });

  it('sin la mejora no se puede retener, ni tampoco un diamante', () => {
    const slots = createSlotsState();
    expect(toggleHold(slots, 1)).toBe(false);
    slots.upgrades.hold = 1;
    slots.reels = [1, D, 3];
    expect(toggleHold(slots, 1)).toBe(false);
    expect(toggleHold(slots, 0)).toBe(true);
  });

  it('ventaja medible: con suerte baja, retener gana más a la larga', () => {
    const run = (hold: boolean) => {
      const slots = { ...createSlotsState(), balance: 1e9 };
      slots.upgrades.hold = 5;
      slots.upgrades.maxBet = 5;
      const rng = seededRng(42);
      for (let i = 0; i < 40000; i++) {
        spinSlots(slots, { bettor: 'jugador', bet: 10, hold: hold ? 0 : null, from: [0, 1, 3] }, rng);
      }
      return slots.balance;
    };
    expect(run(true)).toBeGreaterThan(run(false));
  });
});

describe('tragaperras: jackpot', () => {
  it('tres diamantes: ~0,1% sin nada, como mucho 1,5% con suerte y mejora', () => {
    expect(slotJackpotChance(0, 0)).toBeCloseTo(0.001, 6);
    expect(slotJackpotChance(MAX, S.upgrades.jackpot.maxLevel)).toBeCloseTo(0.015, 6);
  });

  it('paga x1000, como mucho el pozo y el 25% de la deuda', () => {
    expect(slotJackpotPayout(100)).toEqual({ gain: 100_000, capped: false });
    expect(slotJackpotPayout(10_000)).toEqual({ gain: S.debt.amount * 0.25, capped: true });
    expect(slotJackpotPayout(100, 40_000)).toEqual({ gain: 40_000, capped: true });
  });

  it('el pozo crece con cada apuesta y vuelve a la semilla con el jackpot', () => {
    const slots = { ...createSlotsState(), balance: 10_000 };
    spinSlots(slots, { bettor: 'jugador', bet: 100, hold: null, from: slots.reels }, sequenceRng(0.999, 0.999, 0.1, 0.5, 0.9));
    expect(slots.pot).toBe(S.jackpot.potSeed + 100 * S.jackpot.potContribution);
    const jackpot = spinSlots(slots, { bettor: 'jugador', bet: 100, hold: null, from: slots.reels }, sequenceRng(0));
    expect(jackpot?.delta).toBe(S.jackpot.potSeed + 100 * S.jackpot.potContribution);
    expect(slots.pot).toBe(S.jackpot.potSeed);
  });

  it('retener anula el jackpot de esa tirada', () => {
    const slots = { ...createSlotsState(), balance: 1000 };
    slots.upgrades.hold = 1;
    const noJackpot = spinSlots(slots, { bettor: 'jugador', bet: 10, hold: 0, from: [1, 2, 3] }, sequenceRng(0, 0.999, 0.5, 0.5));
    expect(noJackpot?.outcome).not.toBe('jackpot');
    expect(noJackpot?.held).toBe(0);
    const jackpot = spinSlots(slots, { bettor: 'jugador', bet: 10, hold: null, from: [1, D, 3] }, sequenceRng(0));
    expect(jackpot?.outcome).toBe('jackpot');
    expect(jackpot?.reels).toEqual([D, D, D]);
  });
});

describe('tragaperras: selector, mejoras y zombi', () => {
  it('las mismas fichas de cantidades reales que la ruleta', () => {
    const slots = { ...createSlotsState(), balance: 1000 };
    slots.upgrades.maxBet = 3; // techo 15 * 2,5^3 = 234
    expect(slotMaxBet(3)).toBe(234);
    expect(slotChips(slots).map((c) => c.amount)).toEqual([2, 20, 100, 234]);
    slots.betFractionIndex = 2;
    expect(selectedSlotChip(slots).amount).toBe(100);
  });

  it('comprar mejoras; las del zombi requieren al zombi', () => {
    const slots = { ...createSlotsState(), balance: 10_000 };
    expect(buySlotUpgrade(slots, 'helperSpeed')).toBe(false);
    expect(buySlotUpgrade(slots, 'zombie')).toBe(true);
    expect(buySlotUpgrade(slots, 'helperSpeed')).toBe(true);
    expect(slots.balance).toBe(10_000 - 800 - 500);
  });

  it('el zombi apuesta su fracción del techo, limitada por el saldo, y nunca deja el saldo a 0', () => {
    const slots = { ...createSlotsState(), balance: 100 };
    slots.upgrades.zombie = 1;
    expect(zombieBet(slots)).toBe(Math.min(Math.max(Math.floor(15 * 0.05), 1), 3));
    slots.balance = 20;
    for (let i = 0; i < 200; i++) updateZombie(slots, 4, seededRng(i));
    expect(slots.balance).toBeGreaterThan(0);
  });
});

describe('mesa 2: desbloqueo, deuda y conversión', () => {
  it('pestañas: a la mesa 2 solo con la 1 saldada; a la 1 siempre se puede volver', () => {
    const state = createInitialState();
    expect(canSwitchTable(state, 2)).toBe(false);
    state.debtPaid = true;
    expect(canSwitchTable(state, 2)).toBe(true);
    state.activeTable = 2;
    expect(canSwitchTable(state, 2)).toBe(false);
    expect(canSwitchTable(state, 1)).toBe(true);
  });

  it('la mesa 1 sigue jugando sola (su ayudante) mientras se está en la mesa 2', () => {
    const state = stateWith({ debtPaid: true, balance: 10_000, activeTable: 2 });
    state.upgrades.crupier = 1;
    state.upgrades.luck = 20;
    const before = state.stats.bets;
    updateGame(state, 30, seededRng(4));
    expect(state.stats.bets).toBeGreaterThan(before);
  });

  it('se abre al saldar la deuda de la mesa 1', () => {
    expect(isSlotsUnlocked(createInitialState())).toBe(false);
    expect(isSlotsUnlocked(stateWith({ debtPaid: true }))).toBe(true);
  });

  it('pagar la deuda de la mesa 2 descuenta 10M y conserva lo que sobra', () => {
    const slots = { ...createSlotsState(), balance: S.debt.amount + 5 };
    expect(canPaySlotsDebt(slots)).toBe(true);
    expect(paySlotsDebt(slots)).toBe(true);
    expect(slots.balance).toBe(5);
    expect(slots.debtPaid).toBe(true);
  });

  it('pasivo = k * (ingreso/s de la mesa 1)^0,5, y subir la mesa 1 lo sube', () => {
    const state = stateWith({ debtPaid: true, balance: 100_000 });
    expect(table1IncomeRate(state)).toBe(0);
    state.upgrades.crupier = 1;
    state.upgrades.luck = 20;
    state.upgrades.maxBet = 6;
    const rate = table1IncomeRate(state);
    expect(rate).toBeGreaterThan(0);
    expect(passiveRate(state)).toBeCloseTo(S.conversion.k * Math.sqrt(rate), 9);
    state.upgrades.helperSpeed = 5;
    expect(table1IncomeRate(state)).toBeGreaterThan(rate);
  });

  it('el pasivo llega a la mesa 2 solo con ella desbloqueada', () => {
    const state = stateWith({ balance: 100_000 });
    state.upgrades.cleaner = 3;
    updateSlots(state, 60, seededRng(1));
    expect(state.slots.balance).toBe(0);
    state.debtPaid = true;
    updateSlots(state, 60, seededRng(1));
    expect(state.slots.stats.passiveEarned).toBeGreaterThan(0);
  });
});

describe('guardado v5', () => {
  it('migra un guardado v4: mesa 2 desde cero, mesa activa la 1', () => {
    const v4state = { ...createInitialState(), debtPaid: true, balance: 77 } as Record<string, unknown>;
    delete v4state.slots;
    delete v4state.activeTable;
    const file = deserialize(JSON.stringify({ version: 4, savedAt: 1, state: v4state }))!;
    expect(file.state.balance).toBe(77);
    expect(file.state.activeTable).toBe(1);
    expect(file.state.slots.balance).toBe(0);
    expect(file.state.slots.upgrades.luck).toBe(0);
  });

  it('conserva la mesa 2 y sanea lo imposible', () => {
    const state = { ...createInitialState(), debtPaid: true, activeTable: 2 as const };
    state.slots.balance = 1234;
    state.slots.upgrades.hold = 99;
    state.slots.hold = 2;
    const back = deserialize(serialize(state, 5))!.state;
    expect(back.activeTable).toBe(2);
    expect(back.slots.balance).toBe(1234);
    expect(back.slots.upgrades.hold).toBe(S.upgrades.hold.maxLevel);
    expect(back.slots.hold).toBe(2);
    // La mesa 2 no puede estar activa sin la deuda de la 1 pagada.
    const cheat = deserialize(serialize({ ...state, debtPaid: false }, 5))!.state;
    expect(cheat.activeTable).toBe(1);
  });
});
