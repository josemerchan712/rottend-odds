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
  startChain,
  useSecondChance,
} from '../src/game/coin/game';
import { createCoinState, type CoinState } from '../src/game/coin/state';
import {
  buyCoinUpgrade,
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

  it('cruz sin cargas: se pierde todo; con cargas, segunda oportunidad o aceptar', () => {
    const coin = fresh({ balance: 100 });
    coin.seconds.charges = 0;
    const lost = startChain(coin, { bettor: 'jugador', stake: 10 }, TAILS)!;
    expect(lost.result).toBe('perdido');
    expect(coin.balance).toBe(90);

    coin.seconds.charges = 1;
    const chain = startChain(coin, { bettor: 'jugador', stake: 10 }, HEADS)!;
    continueChain(coin, chain, TAILS);
    expect(chain.status).toBe('fallo');
    expect(useSecondChance(coin, chain, HEADS)).toBe('cara');
    expect(coin.seconds.charges).toBe(0);
    expect(chain.wins).toBe(2);
    continueChain(coin, chain, TAILS);
    expect(chain.result).toBe('perdido'); // sin cargas ya no hay segunda oportunidad
    expect(coin.balance).toBe(80);

    coin.seconds.charges = 1;
    const other = startChain(coin, { bettor: 'jugador', stake: 10 }, TAILS)!;
    expect(other.status).toBe('fallo');
    acceptLoss(coin, other);
    expect(other.result).toBe('perdido');
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
});
