import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import { seededRng } from '../src/game/rng';
import { deserialize, serialize } from '../src/game/save';
import {
  acceptBust,
  cardsChips,
  cardsJackpotPayout,
  cardsLuckChance,
  cardsWinChance,
  dealHand,
  discard,
  HONEST_WIN,
  hit,
  isTripleSeven,
  maxDiscards,
  playerDeal,
  rigForWinChance,
  simpleHit,
  stand,
  updateDiscards,
} from '../src/game/cards/game';
import { RIG_TABLE } from '../src/game/cards/rigTable';
import { basicHit, compareHands, drawCard, handTotal, playBasicHand, shuffledDeck } from '../src/game/cards/rules';
import { createCardsState, type Card, type CardHand, type CardsState } from '../src/game/cards/state';
import {
  cardsPassiveRate,
  canPayCardsDebt,
  isCardsUnlocked,
  kellyFraction,
  payCardsDebt,
  skeletonBet,
  table3IncomeRate,
  updateCards,
  updateSkeleton,
} from '../src/game/cards/table';
import { createInitialState } from '../src/game/state';
import { canSwitchTo } from '../src/game/tables';

const K = CONFIG.cards;
const MAX = K.upgrades.luck.maxLevel;
// Cartas por rango: as de picas = 0, 7 de picas = 6, 10 de picas = 9, K de picas = 12...
const A = 0;
const SEVEN = 6;
const TEN = 9;
const KING = 12;
const FIVE = 4;
const SIX = 5;
const fresh = (over: Partial<CardsState> = {}): CardsState => ({ ...createCardsState(), ...over });

describe('blackjack: reglas', () => {
  it('total de la mano con ases blandos y duros', () => {
    expect(handTotal([A, KING])).toEqual({ total: 21, soft: true });
    expect(handTotal([A, FIVE, KING])).toEqual({ total: 16, soft: false });
    expect(handTotal([A, A, 13 + A])).toEqual({ total: 13, soft: true });
    expect(handTotal([TEN, KING, SIX])).toEqual({ total: 26, soft: false });
  });

  it('gana quien se acerca más sin pasarse; empate devuelve', () => {
    expect(compareHands([TEN, KING], [TEN, SEVEN])).toBe('gana');
    expect(compareHands([TEN, SIX, SEVEN], [TEN, FIVE])).toBe('pierde');
    expect(compareHands([TEN, SEVEN], [TEN, SIX, SEVEN])).toBe('gana');
    expect(compareHands([TEN, SEVEN], [KING, SEVEN])).toBe('empate');
  });

  it('estrategia básica: pide con 11 o menos, se planta con 17 duro, 12-16 según la banca', () => {
    expect(basicHit([FIVE, SIX], 10)).toBe(true);
    expect(basicHit([TEN, SEVEN], 10)).toBe(false);
    expect(basicHit([TEN, SIX], 10)).toBe(true);
    expect(basicHit([TEN, SIX], 5)).toBe(false);
    expect(basicHit([A, SIX], 10)).toBe(true); // 17 blando
  });

  it('la baraja honrada da una pequeña ventaja a la casa; la tabla es creciente', () => {
    const rng = seededRng(1);
    let net = 0;
    const N = 40_000;
    for (let i = 0; i < N; i++) {
      const o = playBasicHand(0, K.dealerStands, rng);
      net += o === 'gana' ? 1 : o === 'pierde' ? -1 : 0;
    }
    expect(net / N).toBeLessThan(0);
    expect(net / N).toBeGreaterThan(-0.08);
    for (let i = 1; i < RIG_TABLE.length; i++) expect(RIG_TABLE[i].win).toBeGreaterThanOrEqual(RIG_TABLE[i - 1].win - 0.01);
  });

  it('la baraja que favorece elige la mejor carta para el jugador (o la peor si favorece a la banca)', () => {
    const rng = seededRng(5);
    let goodFor = 0;
    let goodAgainst = 0;
    for (let i = 0; i < 2000; i++) {
      const deckA = shuffledDeck(rng);
      const deckB = [...deckA];
      const hand: Card[] = [TEN, FIVE]; // 15: la mejor es un 6
      const favored = handTotal([...hand, drawCard(deckA, 'jugador', hand, [], 6, K.dealerStands, rng)]).total;
      const against = handTotal([...hand, drawCard(deckB, 'jugador', hand, [], -6, K.dealerStands, rng)]).total;
      if (favored <= 21) goodFor++;
      if (against <= 21) goodAgainst++;
    }
    expect(goodFor).toBeGreaterThan(1900);
    expect(goodAgainst).toBeLessThan(400);
  });
});

describe('blackjack: suerte y penalización', () => {
  it('la suerte va de la probabilidad honrada a 97% (curva convexa)', () => {
    expect(cardsLuckChance(0)).toBeCloseTo(HONEST_WIN, 6);
    expect(cardsLuckChance(MAX)).toBeCloseTo(0.97, 6);
    expect(cardsLuckChance(MAX) - cardsLuckChance(MAX - 5)).toBeGreaterThan((cardsLuckChance(5) - cardsLuckChance(0)) * 3);
  });

  it('apostar fuerte penaliza, menos con suerte alta; la intensidad sigue a la probabilidad', () => {
    expect(cardsWinChance(0, 1)).toBeLessThan(cardsWinChance(0, 0.01));
    expect(cardsWinChance(MAX, 0.01) - cardsWinChance(MAX, 1)).toBeCloseTo(0.04, 2);
    expect(rigForWinChance(HONEST_WIN)).toBeCloseTo(0, 1);
    expect(rigForWinChance(0.97)).toBeGreaterThan(rigForWinChance(0.6));
    expect(rigForWinChance(0.3)).toBeLessThan(0);
  });

  it('medido: con suerte máxima y apuesta pequeña se gana ~97% de las manos', () => {
    const rng = seededRng(7);
    const rig = rigForWinChance(0.97);
    let wins = 0;
    const N = 20_000;
    for (let i = 0; i < N; i++) if (playBasicHand(rig, K.dealerStands, rng) === 'gana') wins++;
    expect(wins / N).toBeGreaterThan(0.95);
    expect(wins / N).toBeLessThan(0.99);
  });
});

describe('blackjack: mano, descartes y jackpot', () => {
  const deal = (c: CardsState, seed = 3) => dealHand(c, { bettor: 'jugador', bet: 10 }, seededRng(seed))!;

  it('repartir cobra la apuesta y da dos cartas a cada uno; ganar paga 1:1, empatar devuelve', () => {
    for (let seed = 1; seed < 60; seed++) {
      const c = fresh({ balance: 100, discards: { charges: 0, timer: 0 } });
      const hand = deal(c, seed);
      expect(hand.player.length).toBeGreaterThanOrEqual(2);
      expect(hand.dealer.length).toBeGreaterThanOrEqual(2);
      if (hand.status !== 'fin') stand(c, hand, seededRng(seed));
      expect(hand.status).toBe('fin');
      const expected = hand.result === 'gana' ? 110 : hand.result === 'empate' ? 100 : 90;
      expect(c.balance).toBe(expected + hand.jackpot);
    }
  });

  it('no se puede repartir otra mano del jugador con una en juego', () => {
    const c = fresh({ balance: 100 });
    const hand = deal(c, 11);
    if (hand.status !== 'fin') expect(dealHand(c, { bettor: 'jugador', bet: 10 }, seededRng(1))).toBeNull();
  });

  it('si te pasas con descartes, la mano espera; descartar cambia la última carta y gasta una carga', () => {
    // Busca una mano en la que pedir pase de 21.
    for (let seed = 1; seed < 400; seed++) {
      const c = fresh({ balance: 1000, discards: { charges: 1, timer: 0 } });
      const hand = deal(c, seed);
      if (hand.status !== 'jugando') continue;
      const rng = seededRng(seed * 13);
      while (hand.status === 'jugando' && handTotal(hand.player).total < 21) hit(c, hand, rng);
      if ((hand.status as CardHand['status']) !== 'pasado') continue;
      const before = hand.player.length;
      expect(discard(c, hand, rng)).toBe(true);
      expect(hand.player.length).toBe(before);
      expect(c.discards.charges).toBe(0);
      if ((hand.status as CardHand['status']) === 'pasado') acceptBust(c, hand);
      if ((hand.status as CardHand['status']) === 'jugando') stand(c, hand, rng);
      expect(hand.status).toBe('fin');
      return;
    }
    throw new Error('no se encontró una mano pasada');
  });

  it('sin cargas no se descarta; las cargas se recargan con el tiempo sin pasar del máximo', () => {
    const c = fresh({ balance: 100, discards: { charges: 0, timer: 0 } });
    const hand = deal(c, 4);
    expect(discard(c, hand, seededRng(1))).toBe(false);
    c.upgrades.luck = 8;
    updateDiscards(c, 10_000);
    expect(c.discards.charges).toBe(maxDiscards(8));
    expect(maxDiscards(MAX)).toBe(1 + Math.floor(MAX / K.discards.perLevels));
  });

  it('jackpot: la baraja trae 7-7 y otro 7 arriba; pidiendo con 14 se cobra el pozo', () => {
    const c = fresh({ balance: 1000, discards: { charges: 0, timer: 0 } });
    // [baraja..., jackpot?] — el primer rng() tras barajar decide la mano del jackpot.
    let hand: CardHand | null = null;
    for (let seed = 1; seed < 20000 && !hand?.stackedSeven; seed++) {
      const cc = fresh({ balance: 1000, discards: { charges: 0, timer: 0 } });
      cc.upgrades.jackpot = 10;
      cc.upgrades.luck = 20;
      const h = dealHand(cc, { bettor: 'jugador', bet: 10 }, seededRng(seed))!;
      if (h.stackedSeven !== null) {
        hand = h;
        Object.assign(c, cc);
      }
    }
    expect(hand).not.toBeNull();
    expect(handTotal(hand!.player).total).toBe(14);
    expect(simpleHit(hand!)).toBe(true);
    const pot = c.pot;
    hit(c, hand!, seededRng(1));
    expect(isTripleSeven(hand!.player)).toBe(true);
    expect(hand!.status).toBe('fin');
    expect(hand!.jackpot).toBe(Math.floor(Math.min(pot, 10 * K.jackpot.payoutMultiplier)));
    expect(c.pot).toBe(K.jackpot.potSeed);
  });

  it('el jackpot paga como mucho el pozo y el 25% de la deuda', () => {
    expect(cardsJackpotPayout(10, 1e9)).toEqual({ gain: 5000, capped: false });
    expect(cardsJackpotPayout(1e6, 1e9)).toEqual({ gain: K.debt.amount * 0.25, capped: true });
    expect(cardsJackpotPayout(100, 1200)).toEqual({ gain: 1200, capped: true });
  });

  it('el selector usa cantidades reales', () => {
    const c = fresh({ balance: 1000 });
    c.upgrades.maxBet = 2; // techo 15 * 2,5^2 = 93
    expect(cardsChips(c).map((x) => x.amount)).toEqual([1, 5, 20, 93]);
    c.betFractionIndex = 2;
    expect(playerDeal(c, seededRng(3))?.bet).toBe(20);
  });
});

describe('mesa 4: esqueleto, desbloqueo, conversión y guardado', () => {
  it('Kelly: negativa con valor esperado negativo; el esqueleto espera hasta tener ventaja', () => {
    expect(kellyFraction(0.43, 0.09)).toBeLessThan(0);
    expect(kellyFraction(0.8, 0.05)).toBeGreaterThan(0.5);
    const c = fresh({ balance: 1000 });
    c.upgrades.skeleton = 1;
    expect(skeletonBet(c)).toBe(0); // sin suerte, valor esperado negativo
    c.upgrades.luck = 12;
    expect(skeletonBet(c)).toBeGreaterThan(0);
  });

  it('el esqueleto juega manos enteras y nunca deja el saldo a 0', () => {
    const c = fresh({ balance: 200 });
    c.upgrades.skeleton = 1;
    c.upgrades.luck = 10;
    for (let i = 0; i < 300; i++) updateSkeleton(c, 4, seededRng(i));
    expect(c.stats.hands).toBeGreaterThan(0);
    expect(c.balance).toBeGreaterThan(0);
    expect(c.recentHands.every((h) => h.status === 'fin')).toBe(true);
  });

  it('se abre al saldar la mesa 3; las pestañas respetan el orden', () => {
    const s = createInitialState();
    s.debtPaid = true;
    s.slots.debtPaid = true;
    expect(isCardsUnlocked(s)).toBe(false);
    expect(canSwitchTo(s, 4)).toBe(false);
    s.dice.debtPaid = true;
    expect(isCardsUnlocked(s)).toBe(true);
    expect(canSwitchTo(s, 4)).toBe(true);
  });

  it('pagar la deuda de la mesa 4', () => {
    const c = fresh({ balance: K.debt.amount + 3 });
    expect(canPayCardsDebt(c)).toBe(true);
    expect(payCardsDebt(c)).toBe(true);
    expect(c.balance).toBe(3);
  });

  it('pasivo = k * (ingreso/s de la mesa 3)^0,5, solo con la mesa 4 abierta', () => {
    const s = createInitialState();
    s.debtPaid = true;
    s.slots.debtPaid = true;
    s.dice.balance = 100_000;
    s.dice.upgrades.ghost = 1;
    s.dice.upgrades.luck = 20;
    s.dice.upgrades.maxBet = 6;
    const rate = table3IncomeRate(s);
    expect(rate).toBeGreaterThan(0);
    expect(cardsPassiveRate(s)).toBeCloseTo(K.conversion.k * Math.sqrt(rate), 9);
    updateCards(s, 30, seededRng(1));
    expect(s.cards.balance).toBe(0);
    s.dice.debtPaid = true;
    updateCards(s, 30, seededRng(1));
    expect(s.cards.stats.passiveEarned).toBeGreaterThan(0);
  });

  it('guardado v7: migra desde v6, sanea la mesa 4 y descarta una mano a medias', () => {
    const v6 = { ...createInitialState() } as Record<string, unknown>;
    delete v6.cards;
    const file = deserialize(JSON.stringify({ version: 6, savedAt: 1, state: v6 }))!;
    expect(file.state.cards.balance).toBe(0);
    const state = createInitialState();
    state.cards.upgrades.luck = 99;
    state.cards.balance = 500;
    dealHand(state.cards, { bettor: 'jugador', bet: 10 }, seededRng(2));
    state.activeTable = 4;
    const back = deserialize(serialize(state, 1))!.state;
    expect(back.cards.upgrades.luck).toBe(MAX);
    if (state.cards.hand?.status !== 'fin') expect(back.cards.hand).toBeNull();
    expect(back.activeTable).toBe(1);
  });
});
