import { describe, expect, it } from 'vitest';
import { CHAIN_FACTOR_OFFSET, CONFIG } from '../src/game/config';
import {
  acceptLoss,
  CHAIN_CAP,
  cashOut,
  chainFactor,
  chainProduct,
  chainValue,
  coinEdge,
  coinLuckChance,
  stepMultiplier,
  continueChain,
  flipChance,
  armHold,
  markedFace,
  selectCoinKind,
  startChain,
  chainChance,
  coinCeiling,
  useGoldenZero,
  useMark,
  useReroll,
} from '../src/game/coin/game';
import { createCoinState, type CoinState } from '../src/game/coin/state';
import {
  buyCoinUpgrade,
  buyHeirloom,
  heirloomNextCost,
  coinPassiveRate,
  impBet,
  isCoinUnlocked,
  payCoinDebt,
  recommendedImpProfile,
  updateCoin,
  updateImp,
} from '../src/game/coin/table';
import { seededRng } from '../src/game/rng';
import { deserialize, serialize } from '../src/game/save';
import { canSwitchTo } from '../src/game/tables';
import { createInitialState } from '../src/game/state';
import { sequenceRng } from './helpers';

const C = CONFIG.coin;
const HEADS = sequenceRng(0); // siempre cara (rng < p)
const TAILS = sequenceRng(0.999); // siempre cruz

/** Mesa 5 con el techo en el nivel 3: las apuestas de prueba de 10 caben. */
function fresh(over: Partial<CoinState> = {}): CoinState {
  const coin = { ...createCoinState(), ...over };
  coin.upgrades = { ...coin.upgrades, maxBet: 3 };
  return coin;
}

describe('mesa 5: la moneda', () => {
  it('factores crecientes: cada acierto multiplica por uno más (f_i = i + CHAIN_FACTOR_OFFSET)', () => {
    expect(CHAIN_FACTOR_OFFSET).toBe(2);
    const factors = [1, 2, 3, 4, 5].map(chainFactor);
    expect(factors).toEqual([1, 2, 3, 4, 5].map((i) => i + CHAIN_FACTOR_OFFSET));
    // Apostando 2: 6, 24, 120, 720 (con offset 2).
    const values = [1, 2, 3, 4].map((k) => 2 * chainProduct(k));
    let expected = 2;
    for (let k = 1; k <= 4; k++) {
      expected *= k + CHAIN_FACTOR_OFFSET;
      expect(values[k - 1]).toBe(expected);
    }
    expect(stepMultiplier(2, 'cargada')).toBe(chainFactor(2) * C.loaded.payoutBoost);
  });

  it('la probabilidad de un paso cae en proporción a su factor: ventaja / f (la casa gana sin suerte)', () => {
    expect(coinEdge(0)).toBeLessThan(1);
    expect(coinEdge(C.upgrades.luck.maxLevel)).toBeCloseTo(C.luck.cap, 10);
    for (let step = 1; step <= C.chain.maxWins; step++) {
      // Sin temple ni penalización: p = ventaja × caída^(paso-1) / f.
      const p = flipChance(10, 0, step - 1, 0);
      expect(p).toBeCloseTo(Math.min((coinEdge(10) * C.decay.edgePerStep ** (step - 1)) / chainFactor(step), C.luck.maxChance), 10);
    }
    // Sin suerte, ningún paso compensa (valor esperado < 1).
    for (let step = 1; step <= C.chain.maxWins; step++) expect(flipChance(0, 0, step - 1, 0) * chainFactor(step)).toBeLessThan(1);
    expect(coinLuckChance(0)).toBeLessThan(0.5);
  });

  it('con suerte los primeros pasos compensan y los últimos no: seguir siempre no es rentable', () => {
    const L = C.upgrades.luck.maxLevel;
    const ev = (step: number) => flipChance(L, 0, step - 1, 0) * chainFactor(step);
    expect(ev(1)).toBeGreaterThan(1);
    expect(ev(C.chain.maxWins)).toBeLessThan(1);
  });

  it('el temple suaviza la caída; apostar fuerte penaliza', () => {
    expect(flipChance(20, 5, 3, 0)).toBeGreaterThan(flipChance(20, 0, 3, 0));
    expect(flipChance(20, 5, 0, 0)).toBeCloseTo(flipChance(20, 0, 0, 0), 10); // el primer paso no cambia
    expect(flipChance(10, 0, 0, 1)).toBeLessThan(flipChance(10, 0, 0, 0.01));
  });

  it('cara multiplica por el factor del paso y deja decidir; retirarse cobra lo acumulado', () => {
    const coin = fresh({ balance: 100 });
    const chain = startChain(coin, { bettor: 'jugador', stake: 10 }, HEADS)!;
    expect(coin.balance).toBe(90);
    expect(chain.wins).toBe(1);
    expect(chain.value).toBe(10 * chainFactor(1));
    expect(chain.status).toBe('decidir');
    continueChain(coin, chain, HEADS);
    expect(chain.wins).toBe(2);
    expect(chain.value).toBe(10 * chainFactor(1) * chainFactor(2));
    expect(cashOut(coin, chain)).toBe(true);
    expect(coin.balance).toBe(90 + chainValue(10, 2));
    expect(chain.delta).toBe(chainValue(10, 2) - 10);
    expect(chain.result).toBe('retirado');
  });

  it('cruz sin herencias: se pierde todo; con alguna cara y cargas, relanzar, cero dorado o aceptar', () => {
    const coin = fresh({ balance: 100 });
    const lost = startChain(coin, { bettor: 'jugador', stake: 10 }, TAILS)!;
    expect(lost.result).toBe('perdido');
    expect(coin.balance).toBe(90);

    coin.heirlooms.reroll = 1;
    coin.heirlooms.zero = 1;
    // Sin ninguna cara no hay nada que proteger: la primera cruz se pierde aunque haya cargas.
    // (El relanzamiento tiene la probabilidad de extraSteps pasos más adelante: con HEADS acierta igual.)
    expect(startChain(coin, { bettor: 'jugador', stake: 10 }, TAILS)!.result).toBe('perdido');
    expect(coin.balance).toBe(80);

    const chain = startChain(coin, { bettor: 'jugador', stake: 10 }, HEADS)!;
    expect(chain.charges).toMatchObject({ reroll: 1, zero: 1 });
    continueChain(coin, chain, TAILS);
    expect(chain.status).toBe('fallo');
    expect(useReroll(coin, chain, HEADS)).toBe('cara');
    expect(chain.charges.reroll).toBe(0);
    expect(chain.wins).toBe(2);
    expect(chain.decay).toBe(2); // la caída extra del relanzamiento es solo para ese lanzamiento
    continueChain(coin, chain, TAILS);
    expect(chain.status).toBe('fallo'); // aún queda el cero dorado
    expect(useGoldenZero(coin, chain)).toBe(true);
    expect(chain.result).toBe('salvado');
    expect(coin.balance).toBe(70 + Math.floor(chainValue(10, 2) * C.heirlooms.zero.refund));

    const other = startChain(coin, { bettor: 'jugador', stake: 10 }, HEADS)!;
    continueChain(coin, other, TAILS);
    acceptLoss(coin, other);
    expect(other.result).toBe('perdido');
  });

  it('retener: congela la caída del siguiente paso (solo ese); marcar enseña el próximo lanzamiento', () => {
    const coin = fresh({ balance: 1000 });
    coin.heirlooms.hold = 1;
    coin.heirlooms.mark = 1;
    const chain = startChain(coin, { bettor: 'jugador', stake: 10 }, HEADS)!;
    expect(chain.decay).toBe(1);
    const before = chainChance(coin, chain);
    expect(armHold(coin, chain)).toBe(true);
    expect(armHold(coin, chain)).toBe(false); // una carga por cadena
    // Con Retener, este paso acierta como el anterior (aunque paga su factor).
    expect(chainChance(coin, chain)).toBeGreaterThan(before);
    expect(chainChance(coin, chain)).toBeCloseTo(flipChance(coin.upgrades.luck, coin.upgrades.temple, 0, 10 / coinCeiling(coin)), 10);
    continueChain(coin, chain, HEADS);
    expect(chain.value).toBe(chainValue(10, 2));
    expect(chain.decay).toBe(2); // el paso siguiente ya cae con normalidad
    expect(chain.holdArmed).toBe(false);
    expect(useMark(coin, chain, TAILS)).toBe(true);
    expect(markedFace(coin, chain)).toBe('cruz');
    expect(cashOut(coin, chain)).toBe(true); // visto venir: se retira a tiempo
    expect(coin.balance).toBe(990 + chainValue(10, 2));
    // Las cargas se rellenan en la siguiente cadena.
    expect(startChain(coin, { bettor: 'jugador', stake: 10 }, HEADS)!.charges).toMatchObject({ hold: 1, mark: 1 });
  });

  it('moneda cargada: acierta 2/3 y paga ×1,5 el factor; solo con su mejora; la suerte la mejora más', () => {
    const coin = fresh({ balance: 100 });
    expect(selectCoinKind(coin, 'cargada')).toBe(false);
    expect(startChain(coin, { bettor: 'jugador', stake: 10, kind: 'cargada' }, HEADS)).toBeNull();
    coin.upgrades.loaded = 1;
    expect(selectCoinKind(coin, 'cargada')).toBe(true);
    const chain = startChain(coin, { bettor: 'jugador', stake: 10, kind: 'cargada' }, HEADS)!;
    expect(chain.value).toBe(10 * chainFactor(1) * C.loaded.payoutBoost);
    continueChain(coin, chain, HEADS, 0, 'justa'); // cada lanzamiento elige moneda (y cuenta un paso)
    expect(chain.value).toBe(10 * chainFactor(1) * C.loaded.payoutBoost * chainFactor(2));
    expect(chain.wins).toBe(2);
    expect(coin.stats.loadedFlips).toBe(1);
    for (const luck of [0, 10, 20]) expect(flipChance(luck, 0, 0, 0, 0, 'cargada')).toBeLessThan(flipChance(luck, 0, 0, 0));
    // Mismo valor esperado de base (2/3 × 1,5 = 1); con suerte, la cargada sale ganando.
    const ev = (luck: number, kind: 'justa' | 'cargada') => flipChance(luck, 0, 1, 0, 0, kind) * stepMultiplier(2, kind);
    expect(ev(0, 'cargada')).toBeCloseTo(ev(0, 'justa'), 10);
    expect(ev(20, 'cargada') / ev(20, 'justa')).toBeGreaterThan(1);
  });

  it('herencias: se compran con la moneda de su mesa de origen, hasta su nivel máximo', () => {
    const state = createInitialState();
    const cost = heirloomNextCost(state.coin, 'mark')!;
    expect(buyHeirloom(state, 'mark')).toBe(false);
    state.cards.balance = cost;
    expect(buyHeirloom(state, 'mark')).toBe(true);
    expect(state.cards.balance).toBe(0);
    expect(state.coin.heirlooms.mark).toBe(1);
    state.dice.balance = 1e12;
    for (let i = 0; i < 10; i++) buyHeirloom(state, 'reroll');
    expect(state.coin.heirlooms.reroll).toBe(C.heirlooms.reroll.maxLevel);
    expect(heirloomNextCost(state.coin, 'reroll')).toBeNull();
  });

  it('la cadena completa (maxWins aciertos) paga y además se lleva el pozo', () => {
    const coin = fresh({ balance: 100 });
    coin.pot = 5000;
    const chain = startChain(coin, { bettor: 'jugador', stake: 1 }, HEADS)!;
    for (let i = 1; i < C.chain.maxWins; i++) continueChain(coin, chain, HEADS);
    expect(chain.result).toBe('cadena');
    expect(chain.jackpot).toBe(5000);
    expect(coin.balance).toBe(99 + chainValue(1, C.chain.maxWins) + 5000);
    expect(coin.pot).toBe(C.jackpot.potSeed);
    expect(coin.stats.jackpots).toBe(1);
  });

  it('el pago de una cadena tiene tope (25% de la deuda) y se cobra solo al llegar', () => {
    expect(chainValue(1e9, 1)).toBe(CHAIN_CAP);
    const coin = fresh({ balance: 2e6 });
    coin.upgrades.maxBet = 10;
    // Una apuesta del techo máximo llega al tope antes de completar la cadena: se cobra sola.
    const stake = coinCeiling(coin);
    const chain = startChain(coin, { bettor: 'jugador', stake }, HEADS)!;
    while (chain.status === 'decidir') continueChain(coin, chain, HEADS);
    expect(chain.status).toBe('fin');
    expect(chain.value).toBe(CHAIN_CAP);
    expect(chain.capped).toBe(true);
  });

  it('no se puede empezar otra cadena del jugador con una abierta, ni apostar más que el techo', () => {
    const coin = fresh({ balance: 1000 });
    startChain(coin, { bettor: 'jugador', stake: 5 }, HEADS);
    expect(startChain(coin, { bettor: 'jugador', stake: 5 }, HEADS)).toBeNull();
    expect(startChain(fresh({ balance: 1000 }), { bettor: 'jugador', stake: 999 }, HEADS)).toBeNull(); // más que el techo
  });
});

describe('mesa 5: diablillo, desbloqueo, conversión y guardado', () => {
  it('sin ventaja espera; con suerte juega y nunca deja el saldo a 0', () => {
    const coin = fresh({ balance: 1000 });
    coin.upgrades.imp = 1;
    expect(impBet(coin)).toBe(0);
    coin.upgrades.luck = 14;
    coin.upgrades.helperProfile = 2;
    for (const profile of [0, 1, 2]) {
      const c = structuredClone(coin);
      c.helper.profile = profile;
      for (let i = 0; i < 400; i++) updateImp(c, 2, seededRng(i * 7 + profile));
      expect(c.balance).toBeGreaterThan(0);
      expect(c.stats.chains).toBeGreaterThan(0);
    }
  });

  it('cada perfil se retira dentro de su rango (prudente 1-2, normal 3-4, agresivo 5+)', () => {
    const coin = fresh({ balance: 1e6 });
    coin.upgrades.imp = 1;
    coin.upgrades.luck = 20;
    coin.upgrades.temple = 5;
    coin.upgrades.maxBet = 6;
    coin.upgrades.helperProfile = 2;
    for (const [profile, [lo, hi]] of C.helper.profiles.map((p, i) => [i, p.stops] as const)) {
      const c = structuredClone(coin);
      c.helper.profile = profile;
      updateImp(c, 2, seededRng(1));
      expect(c.helper.stopAt).toBeGreaterThanOrEqual(lo);
      expect(c.helper.stopAt).toBeLessThanOrEqual(hi);
    }
    expect([0, 1, 2]).toContain(recommendedImpProfile(coin));
  });

  it('se abre al saldar la mesa 4; el pasivo nunca baja del suelo', () => {
    const state = createInitialState();
    expect(isCoinUnlocked(state)).toBe(false);
    state.debtPaid = state.slots.debtPaid = state.dice.debtPaid = true;
    expect(canSwitchTo(state, 5)).toBe(false);
    state.cards.debtPaid = true;
    expect(isCoinUnlocked(state)).toBe(true);
    expect(canSwitchTo(state, 5)).toBe(true);
    expect(coinPassiveRate(state)).toBeGreaterThanOrEqual(C.conversion.floor);
    updateCoin(state, 10, seededRng(1));
    expect(state.coin.balance).toBeGreaterThanOrEqual(C.bet.minBet);
  });

  it('mejoras: el diablillo hace falta para sus mejoras; pagar la deuda es el final', () => {
    const coin = fresh({ balance: 1e8 });
    expect(buyCoinUpgrade(coin, 'helperSpeed')).toBe(false);
    expect(buyCoinUpgrade(coin, 'imp')).toBe(true);
    expect(buyCoinUpgrade(coin, 'helperSpeed')).toBe(true);
    expect(payCoinDebt(coin)).toBe(true);
    expect(coin.debtPaid).toBe(true);
    expect(payCoinDebt(coin)).toBe(false);
  });

  it('guardado: una partida v8 gana la mesa 5 vacía; una cadena abierta se resuelve al cargar', () => {
    const v8 = { version: 8, savedAt: 1, state: { ...createInitialState(), coin: undefined } };
    const file = deserialize(JSON.stringify(v8))!;
    expect(file.state.coin.balance).toBe(0);

    const state = createInitialState();
    state.coin.balance = 100;
    state.coin.upgrades.maxBet = 3;
    const chain = startChain(state.coin, { bettor: 'jugador', stake: 10 }, HEADS)!;
    continueChain(state.coin, chain, HEADS);
    const loaded = deserialize(serialize(state, 1))!;
    expect(loaded.state.coin.chain).toBeNull();
    expect(loaded.state.coin.balance).toBe(90 + chainValue(10, 2)); // se cobra lo acumulado
  });

  it('guardado v11 con una cadena a medias: se cobra con la regla antigua (×2 por cara) y la fatiga pasa a caída', () => {
    const state = createInitialState();
    const raw = JSON.parse(serialize(state, 1));
    raw.version = 11;
    raw.state.coin.balance = 50;
    const oldChain = { ...raw.state.coin.recentChains[0], bettor: 'jugador', stake: 10, wins: 3, fatigue: 3, status: 'decidir', faces: [], coins: [], charges: { zero: 0, hold: 0, reroll: 0, mark: 0 }, used: { zero: 0, hold: 0, reroll: 0, mark: 0 } };
    // Sin valor guardado: la regla antigua es apuesta × 2^caras.
    raw.state.coin.chain = { ...oldChain };
    raw.state.coin.recentChains = [{ ...oldChain, status: 'fin', value: 80 }];
    const file = deserialize(JSON.stringify(raw))!;
    expect(file.state.coin.chain).toBeNull();
    expect(file.state.coin.balance).toBe(50 + 10 * 2 ** 3);
    const recent = file.state.coin.recentChains[0] as unknown as Record<string, unknown>;
    expect(recent.decay).toBe(3);
    expect('fatigue' in recent).toBe(false);
    // Con el valor guardado, se cobra ese valor (el de la regla antigua).
    raw.state.coin.chain = { ...oldChain, value: 80 };
    expect(deserialize(JSON.stringify(raw))!.state.coin.balance).toBe(50 + 80);
  });

  it('guardado: una partida v9 pierde las segundas oportunidades y gana herencias vacías; las herencias se acotan', () => {
    const state = createInitialState();
    const v9 = { version: 9, savedAt: 1, state: { ...state, coin: { ...state.coin, seconds: { charges: 2, timer: 3 }, heirlooms: undefined, coinChoice: undefined } } };
    const file = deserialize(JSON.stringify(v9))!;
    expect('seconds' in file.state.coin).toBe(false);
    expect(file.state.coin.heirlooms).toEqual({ zero: 0, hold: 0, reroll: 0, mark: 0 });
    expect(file.state.coin.coinChoice).toBe('justa');

    state.coin.heirlooms = { zero: 99, hold: -3, reroll: 2, mark: 1 };
    (state.coin as { coinChoice: string }).coinChoice = 'trucada';
    const back = deserialize(serialize(state, 1))!;
    expect(back.state.coin.heirlooms).toEqual({ zero: C.heirlooms.zero.maxLevel, hold: 0, reroll: 2, mark: 1 });
    expect(back.state.coin.coinChoice).toBe('justa');
  });
});
