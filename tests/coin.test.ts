import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import {
  acceptLoss,
  CHAIN_CAP,
  cashOut,
  chainValue,
  coinFatigue,
  coinLuckChance,
  continueChain,
  flipChance,
  armHold,
  markedFace,
  selectCoinKind,
  startChain,
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

/** Mesa 5 con el techo en el nivel 3 (46): las apuestas de prueba de 10 caben. */
function fresh(over: Partial<CoinState> = {}): CoinState {
  const coin = { ...createCoinState(), ...over };
  coin.upgrades = { ...coin.upgrades, maxBet: 3 };
  return coin;
}

describe('mesa 5: la moneda', () => {
  it('sin suerte la casa gana (< 50%); con suerte máxima el primer lanzamiento llega al tope', () => {
    expect(coinLuckChance(0)).toBeLessThan(0.5);
    expect(coinLuckChance(20)).toBeCloseTo(C.luck.cap, 10);
    expect(flipChance(20, 0, 0, 0)).toBeCloseTo(C.luck.cap, 10);
  });

  it('la fatiga baja cada cara seguida y el temple la reduce', () => {
    expect(flipChance(20, 0, 3, 0)).toBeCloseTo(C.luck.cap - 3 * C.fatigue.perWin, 10);
    expect(coinFatigue(5)).toBeLessThan(coinFatigue(0));
    expect(flipChance(20, 5, 3, 0)).toBeGreaterThan(flipChance(20, 0, 3, 0));
  });

  it('apostar fuerte penaliza (como en las otras mesas)', () => {
    expect(flipChance(10, 0, 0, 1)).toBeLessThan(flipChance(10, 0, 0, 0.01));
  });

  it('cara dobla y deja decidir; retirarse cobra lo acumulado', () => {
    const coin = fresh({ balance: 100 });
    const chain = startChain(coin, { bettor: 'jugador', stake: 10 }, HEADS)!;
    expect(coin.balance).toBe(90);
    expect(chain.wins).toBe(1);
    expect(chain.status).toBe('decidir');
    continueChain(coin, chain, HEADS);
    expect(chain.wins).toBe(2);
    expect(cashOut(coin, chain)).toBe(true);
    expect(coin.balance).toBe(90 + 40);
    expect(chain.delta).toBe(30);
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
    expect(startChain(coin, { bettor: 'jugador', stake: 10 }, TAILS)!.result).toBe('perdido');
    expect(coin.balance).toBe(80);

    const chain = startChain(coin, { bettor: 'jugador', stake: 10 }, HEADS)!;
    expect(chain.charges).toMatchObject({ reroll: 1, zero: 1 });
    continueChain(coin, chain, TAILS);
    expect(chain.status).toBe('fallo');
    expect(useReroll(coin, chain, HEADS)).toBe('cara');
    expect(chain.charges.reroll).toBe(0);
    expect(chain.wins).toBe(2);
    expect(chain.fatigue).toBe(2); // la fatiga extra del relanzamiento es solo para ese lanzamiento
    continueChain(coin, chain, TAILS);
    expect(chain.status).toBe('fallo'); // aún queda el cero dorado
    expect(useGoldenZero(coin, chain)).toBe(true);
    expect(chain.result).toBe('salvado');
    expect(coin.balance).toBe(70 + Math.floor(40 * C.heirlooms.zero.refund));

    const other = startChain(coin, { bettor: 'jugador', stake: 10 }, HEADS)!;
    continueChain(coin, other, TAILS);
    acceptLoss(coin, other);
    expect(other.result).toBe('perdido');
  });

  it('retener: el siguiente acierto no cansa; marcar enseña el próximo lanzamiento', () => {
    const coin = fresh({ balance: 100 });
    coin.heirlooms.hold = 1;
    coin.heirlooms.mark = 1;
    const chain = startChain(coin, { bettor: 'jugador', stake: 10 }, HEADS)!;
    expect(chain.fatigue).toBe(1);
    expect(armHold(coin, chain)).toBe(true);
    expect(armHold(coin, chain)).toBe(false); // una carga por cadena
    continueChain(coin, chain, HEADS);
    expect(chain.fatigue).toBe(1);
    expect(useMark(coin, chain, TAILS)).toBe(true);
    expect(markedFace(coin, chain)).toBe('cruz');
    expect(cashOut(coin, chain)).toBe(true); // visto venir: se retira a tiempo
    expect(coin.balance).toBe(90 + 40);
    // Las cargas se rellenan en la siguiente cadena.
    expect(startChain(coin, { bettor: 'jugador', stake: 10 }, HEADS)!.charges).toMatchObject({ hold: 1, mark: 1 });
  });

  it('moneda cargada: acierta menos y paga ×3; solo con su mejora; la suerte la mejora más', () => {
    const coin = fresh({ balance: 100 });
    expect(selectCoinKind(coin, 'cargada')).toBe(false);
    expect(startChain(coin, { bettor: 'jugador', stake: 10, kind: 'cargada' }, HEADS)).toBeNull();
    coin.upgrades.loaded = 1;
    expect(selectCoinKind(coin, 'cargada')).toBe(true);
    const chain = startChain(coin, { bettor: 'jugador', stake: 10, kind: 'cargada' }, HEADS)!;
    expect(chain.value).toBe(30);
    continueChain(coin, chain, HEADS, 0, 'justa'); // cada lanzamiento elige moneda
    expect(chain.value).toBe(60);
    expect(coin.stats.loadedFlips).toBe(1);
    for (const luck of [0, 10, 20]) expect(flipChance(luck, 0, 0, 0, 0, 'cargada')).toBeLessThan(flipChance(luck, 0, 0, 0));
    // Mismo valor esperado de base; con suerte, la cargada sale ganando.
    const ev = (luck: number, kind: 'justa' | 'cargada') => flipChance(luck, 0, 0, 0, 0, kind) * (kind === 'cargada' ? 3 : 2);
    expect(ev(20, 'cargada') / ev(20, 'justa')).toBeGreaterThan(ev(0, 'cargada') / ev(0, 'justa'));
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

  it('diez caras: la cadena completa paga y además se lleva el pozo', () => {
    const coin = fresh({ balance: 100 });
    coin.pot = 5000;
    const chain = startChain(coin, { bettor: 'jugador', stake: 1 }, HEADS)!;
    for (let i = 1; i < C.chain.maxWins; i++) continueChain(coin, chain, HEADS);
    expect(chain.result).toBe('cadena');
    expect(chain.jackpot).toBe(5000);
    expect(coin.balance).toBe(99 + 1024 + 5000);
    expect(coin.pot).toBe(C.jackpot.potSeed);
    expect(coin.stats.jackpots).toBe(1);
  });

  it('el pago de una cadena tiene tope (25% de la deuda) y se cobra solo al llegar', () => {
    expect(chainValue(1e9, 1)).toBe(CHAIN_CAP);
    const coin = fresh({ balance: 2e6 });
    coin.upgrades.maxBet = 10;
    const stake = Math.ceil(CHAIN_CAP / 4);
    if (stake <= 2e6 && stake <= 15 * 2.5 ** 10) {
      const chain = startChain(coin, { bettor: 'jugador', stake }, HEADS)!;
      continueChain(coin, chain, HEADS);
      expect(chain.status).toBe('fin');
      expect(chain.capped || chain.stake * 4 === CHAIN_CAP).toBe(true);
    }
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
    expect(loaded.state.coin.balance).toBe(90 + 40); // se cobra lo acumulado
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
