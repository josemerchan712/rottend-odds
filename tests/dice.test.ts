import { describe, expect, it } from 'vitest';
import { CONFIG, DICE_TARGETS, type DiceTarget } from '../src/game/config';
import { seededRng } from '../src/game/rng';
import { deserialize, serialize } from '../src/game/save';
import {
  bestReroll,
  boxcarsChance,
  diceChips,
  diceFor,
  diceJackpotChance,
  diceJackpotPayout,
  diceLuckChance,
  hits,
  maxRerolls,
  openRoll,
  playerRoll,
  reroll,
  rerollChance,
  rerollInterval,
  rollDice,
  selectTarget,
  targetChance,
  targetExpectedValue,
  updateRerolls,
} from '../src/game/dice/game';
import { createDiceState, type DiceState } from '../src/game/dice/state';
import {
  buyDiceUpgrade,
  canPayDiceDebt,
  dicePassiveRate,
  isDiceUnlocked,
  payDiceDebt,
  table2IncomeRate,
  updateDice,
  updateGhost,
} from '../src/game/dice/table';
import { createInitialState } from '../src/game/state';
import { canSwitchTo } from '../src/game/tables';
import { sequenceRng } from './helpers';

const C = CONFIG.dice;
const MAX = C.upgrades.luck.maxLevel;
const fresh = (over: Partial<DiceState> = {}): DiceState => ({ ...createDiceState(), ...over });

describe('dados: objetivos', () => {
  it('cada objetivo acierta lo que dice', () => {
    expect(hits('par', [3, 5])).toBe(true);
    expect(hits('par', [3, 4])).toBe(false);
    expect(hits('over7', [4, 4])).toBe(true);
    expect(hits('over7', [3, 4])).toBe(false);
    expect(hits('over9', [4, 6])).toBe(true);
    expect(hits('over9', [4, 5])).toBe(false);
    expect(hits('double', [2, 2])).toBe(true);
    expect(hits('boxcars', [6, 6])).toBe(true);
    expect(hits('boxcars', [5, 5])).toBe(false);
  });

  it('los pagos dan el mismo valor esperado base (r · (1 + pago) = 2) y la casa gana', () => {
    for (const t of DICE_TARGETS) expect(C.targets[t].ratio * (1 + C.targets[t].payout)).toBeCloseTo(2, 9);
    // Sin suerte, el multiplicador de los arriesgados es < 1: el seguro tiene el mejor VE (negativo).
    const evs = DICE_TARGETS.map((t) => targetExpectedValue(t, 1, 1e9, 0));
    expect(evs[0]).toBeLessThan(0);
    for (const ev of evs.slice(1)) expect(ev).toBeLessThanOrEqual(evs[0] + 1e-9);
  });

  it('con poca suerte el objetivo seguro es el mejor; con mucha, los arriesgados', () => {
    const best = (luck: number) => DICE_TARGETS.reduce((a, b) => (targetExpectedValue(b, 1, 1e9, luck) > targetExpectedValue(a, 1, 1e9, luck) ? b : a));
    expect(best(3)).toBe('par');
    expect(best(MAX)).toBe('boxcars');
    expect(targetExpectedValue('over9', 1, 1e9, MAX)).toBeGreaterThan(targetExpectedValue('par', 1, 1e9, MAX));
  });

  it('el objetivo seguro llega al 97% con suerte máxima; la penalización baja con la suerte', () => {
    expect(diceLuckChance(MAX)).toBeCloseTo(0.97, 6);
    expect(targetChance('par', 0, 1)).toBeCloseTo(0.486 - 0.2, 6);
    expect(targetChance('par', MAX, 1)).toBeCloseTo(0.97 - 0.04, 6);
  });

  it('los objetivos difíciles se desbloquean con mejoras', () => {
    const d = fresh({ balance: 10_000 });
    expect(selectTarget(d, 'over9')).toBe(false);
    expect(buyDiceUpgrade(d, 'hardTargets')).toBe(true);
    expect(selectTarget(d, 'over9')).toBe(true);
    expect(selectTarget(d, 'boxcars')).toBe(false);
    buyDiceUpgrade(d, 'boxcars');
    expect(selectTarget(d, 'boxcars')).toBe(true);
  });

  it('los dados enseñan el resultado; fuera de un acierto no sale doble seis', () => {
    const rng = seededRng(2);
    for (let i = 0; i < 500; i++) {
      for (const t of DICE_TARGETS as DiceTarget[]) {
        expect(hits(t, diceFor(t, true, false, rng))).toBe(true);
        const lost = diceFor(t, false, false, rng);
        expect(hits(t, lost)).toBe(false);
        expect(lost).not.toEqual([6, 6]);
      }
    }
  });
});

describe('dados: tirada y relanzamiento', () => {
  it('paga el pago neto del objetivo y cobra si falla', () => {
    const d = fresh({ balance: 1000, rerolls: { charges: 0, timer: 0 } });
    const win = rollDice(d, { bettor: 'jugador', target: 'over7', bet: 10 }, sequenceRng(0, 0.99, 0.5))!;
    expect(win.won).toBe(true);
    expect(win.delta).toBe(14);
    const lose = rollDice(d, { bettor: 'jugador', target: 'par', bet: 10 }, sequenceRng(0.999, 0.5))!;
    expect(lose.won).toBe(false);
    expect(lose.delta).toBe(-10);
    expect(lose.final).toBe(true);
  });

  it('una tirada perdida con cargas queda abierta; relanzar gasta una carga y puede convertirla', () => {
    const d = fresh({ balance: 1000, rerolls: { charges: 1, timer: 0 } });
    const roll = rollDice(d, { bettor: 'jugador', target: 'par', bet: 10 }, sequenceRng(0.999, 0.5))!;
    expect(roll.final).toBe(false);
    expect(openRoll(d)).toBe(roll);
    // El dado nuevo se elige para acertar "par" (misma paridad que el otro).
    const kept = roll.dice[1];
    const value = kept % 2 === 0 ? 2 : 1;
    expect(reroll(d, roll, 0, () => (value - 1) / 6 + 0.01)).toBe(true);
    expect(roll.won).toBe(true);
    expect(roll.delta).toBe(10);
    expect(roll.final).toBe(true);
    expect(d.rerolls.charges).toBe(0);
    expect(reroll(d, roll, 0, seededRng(1))).toBe(false);
  });

  it('la probabilidad de convertir depende del dado que se queda (decisión real)', () => {
    expect(rerollChance('over9', [6, 2], 1)).toBeCloseTo(3 / 6, 6); // queda el 6: hace falta 4+
    expect(rerollChance('over9', [6, 2], 0)).toBe(0); // queda el 2: imposible
    expect(bestReroll('over9', [6, 2])).toEqual({ die: 1, chance: 0.5 });
    expect(bestReroll('double', [3, 5]).chance).toBeCloseTo(1 / 6, 6);
    expect(bestReroll('par', [3, 4]).chance).toBeCloseTo(0.5, 6);
  });

  it('las cargas dependen de la suerte y se recargan con el tiempo sin pasar del máximo', () => {
    expect(maxRerolls(0)).toBe(1);
    expect(maxRerolls(MAX)).toBe(6);
    expect(rerollInterval(MAX)).toBeLessThan(rerollInterval(0));
    const d = fresh({ rerolls: { charges: 0, timer: 0 } });
    d.upgrades.luck = 8; // máximo 3
    updateRerolls(d, 1000);
    expect(d.rerolls.charges).toBe(3);
  });
});

describe('dados: jackpot', () => {
  it('dados cargados: el doble seis sale con j^(1/3), así que tres seguidos ~j', () => {
    expect(boxcarsChance(0, 0) ** 3).toBeCloseTo(diceJackpotChance(0, 0), 9);
    expect(diceJackpotChance(MAX, C.upgrades.jackpot.maxLevel)).toBeCloseTo(0.015, 6);
  });

  it('tres dobles seises seguidos pagan el jackpot (como mucho el pozo) y la racha se ve', () => {
    const d = fresh({ balance: 10_000, rerolls: { charges: 0, timer: 0 } });
    // [acierta, doble seis]
    const box = () => rollDice(d, { bettor: 'jugador', target: 'par', bet: 100 }, sequenceRng(0, 0))!;
    box();
    expect(d.streak).toBe(1);
    box();
    expect(d.streak).toBe(2);
    const potBefore = d.pot + 100 * C.jackpot.potContribution;
    const third = box();
    expect(third.jackpot).toBe(Math.floor(potBefore));
    expect(d.streak).toBe(0);
    expect(d.pot).toBe(C.jackpot.potSeed);
  });

  it('la racha se rompe con una tirada sin doble seis', () => {
    const d = fresh({ balance: 10_000, rerolls: { charges: 0, timer: 0 } });
    rollDice(d, { bettor: 'jugador', target: 'par', bet: 10 }, sequenceRng(0, 0));
    rollDice(d, { bettor: 'jugador', target: 'par', bet: 10 }, sequenceRng(0.999, 0.5));
    expect(d.streak).toBe(0);
  });

  it('el pago tiene tope del 25% de la deuda', () => {
    expect(diceJackpotPayout(100, 1e9)).toEqual({ gain: 50_000, capped: false });
    expect(diceJackpotPayout(1e6, 1e9)).toEqual({ gain: C.debt.amount * 0.25, capped: true });
  });
});

describe('mesa 3: desbloqueo, ayudante, conversión y guardado', () => {
  it('se abre al saldar la mesa 2; las pestañas respetan el orden', () => {
    const state = createInitialState();
    state.debtPaid = true;
    expect(isDiceUnlocked(state)).toBe(false);
    expect(canSwitchTo(state, 3)).toBe(false);
    state.slots.debtPaid = true;
    expect(isDiceUnlocked(state)).toBe(true);
    expect(canSwitchTo(state, 3)).toBe(true);
  });

  it('pagar la deuda de la mesa 3', () => {
    const d = fresh({ balance: C.debt.amount + 7 });
    expect(canPayDiceDebt(d)).toBe(true);
    expect(payDiceDebt(d)).toBe(true);
    expect(d.balance).toBe(7);
  });

  it('el camarero tira, relanza con criterio y nunca deja el saldo a 0', () => {
    const d = fresh({ balance: 40 });
    d.upgrades.ghost = 1;
    for (let i = 0; i < 300; i++) updateGhost(d, 4, seededRng(i));
    expect(d.balance).toBeGreaterThan(0);
    expect(d.stats.rolls).toBeGreaterThan(0);
  });

  it('pasivo = k * (ingreso/s de la mesa 2)^0,5, solo con la mesa 3 abierta', () => {
    const state = createInitialState();
    state.debtPaid = true;
    state.slots.balance = 100_000;
    state.slots.upgrades.zombie = 1;
    state.slots.upgrades.luck = 20;
    state.slots.upgrades.maxBet = 6;
    const rate = table2IncomeRate(state);
    expect(rate).toBeGreaterThan(0);
    expect(dicePassiveRate(state)).toBeCloseTo(C.conversion.k * Math.sqrt(rate), 9);
    updateDice(state, 30, seededRng(1));
    expect(state.dice.balance).toBe(0);
    state.slots.debtPaid = true;
    updateDice(state, 30, seededRng(1));
    expect(state.dice.stats.passiveEarned).toBeGreaterThan(0);
  });

  it('el selector usa cantidades reales', () => {
    const d = fresh({ balance: 1000 });
    d.upgrades.maxBet = 2; // techo 20 * 2,5^2 = 125
    expect(diceChips(d).map((c) => c.amount)).toEqual([1, 10, 50, 125]);
    d.betFractionIndex = 2;
    expect(playerRoll(d, seededRng(3))?.bet).toBe(50);
  });

  it('guardado v6: migra desde v5 y sanea la mesa 3', () => {
    const v5 = { ...createInitialState() } as Record<string, unknown>;
    delete v5.dice;
    const file = deserialize(JSON.stringify({ version: 5, savedAt: 1, state: v5 }))!;
    expect(file.state.dice.balance).toBe(0);
    const state = createInitialState();
    state.dice.upgrades.luck = 99;
    state.dice.target = 'nada' as DiceTarget;
    state.activeTable = 3;
    const back = deserialize(serialize(state, 1))!.state;
    expect(back.dice.upgrades.luck).toBe(MAX);
    expect(back.dice.target).toBe('par');
    expect(back.activeTable).toBe(1); // la mesa 3 no puede estar activa sin saldar la 2
  });
});
