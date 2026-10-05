import { selectorChips, type SelectorChip } from '../betting';
import { CONFIG } from '../config';
import type { Rng } from '../rng';
import type { Bettor } from '../state';
import type { CoinChain, CoinFace, CoinState } from './state';

/**
 * Doble o nada, la mesa del Dueño (lógica pura). Se apuesta y se lanza una moneda: con CARA lo
 * apostado se dobla y sigue en juego (retirarse o seguir), con CRUZ se pierde todo. La probabilidad
 * base está por debajo del 50% (la casa), la suerte sube la del primer lanzamiento hasta el 97% y
 * cada cara seguida la baja un poco (la fatiga), así que dónde parar depende de la suerte.
 */
const C = CONFIG.coin;

/** Lo más que paga una cadena (sin el jackpot): el 25% de la deuda. */
export const CHAIN_CAP = C.debt.amount * C.chain.payoutCapDebtFraction;
export const COIN_JACKPOT_CAP = C.debt.amount * C.jackpot.payoutCapDebtFraction;

// ---------------------------------------------------------------------------
// Probabilidad

export function coinLuckProgress(level: number): number {
  const max = C.upgrades.luck.maxLevel;
  return (Math.min(Math.max(level, 0), max) / max) ** C.luck.curveExponent;
}

/** Probabilidad de cara en el primer lanzamiento con la suerte (sin penalización ni fatiga). */
export function coinLuckChance(level: number): number {
  return Math.min(C.luck.base + (C.luck.cap - C.luck.base) * coinLuckProgress(level), C.luck.cap);
}

export function coinPenalty(fraction: number, luckLevel: number): number {
  const L = coinLuckProgress(luckLevel);
  const factor = C.risk.penaltyFactorAtMinLuck + (C.risk.penaltyFactorAtMaxLuck - C.risk.penaltyFactorAtMinLuck) * L;
  return factor * Math.min(Math.max(fraction, 0), 1) ** C.risk.penaltyExponent;
}

/** Lo que baja la probabilidad cada cara seguida (el temple la reduce). */
export function coinFatigue(templeLevel: number): number {
  const level = Math.min(Math.max(templeLevel, 0), C.upgrades.temple.maxLevel);
  return Math.max(C.fatigue.perWin - C.fatigue.templeReductionPerLevel * level, 0);
}

/**
 * Probabilidad de cara del siguiente lanzamiento de una cadena con `wins` caras ya, una apuesta
 * inicial que es `fraction` del techo y un bonus propio (el del diablillo).
 */
export function flipChance(luckLevel: number, templeLevel: number, wins: number, fraction: number, bonus = 0): number {
  const p = Math.min(coinLuckChance(luckLevel) + bonus, C.luck.cap) - coinPenalty(fraction, luckLevel) - coinFatigue(templeLevel) * wins;
  return Math.min(Math.max(p, C.luck.floor), C.luck.cap);
}

/** Lo que vale una cadena de `wins` caras (sin jackpot), con el tope de la casa. */
export function chainValue(stake: number, wins: number): number {
  return Math.min(stake * 2 ** wins, CHAIN_CAP);
}

export function coinMaxBet(level: number): number {
  return Math.floor(C.bet.baseMaxBet * C.bet.maxBetMultiplierPerLevel ** level);
}

export function coinCeiling(coin: CoinState): number {
  return coinMaxBet(coin.upgrades.maxBet);
}

export function coinChips(coin: CoinState): SelectorChip[] {
  return selectorChips(coin.balance, coinCeiling(coin));
}

export function selectedCoinChip(coin: CoinState): SelectorChip {
  const chips = coinChips(coin);
  const below = chips.filter((c) => c.index <= coin.betFractionIndex);
  return below[below.length - 1] ?? chips[0];
}

export function selectCoinChip(coin: CoinState, index: number): boolean {
  if (index < 0 || index >= CONFIG.bet.quickFractions.length) return false;
  coin.betFractionIndex = index;
  return true;
}

/** Probabilidad de cara del siguiente lanzamiento de esa cadena. */
export function chainChance(coin: CoinState, chain: CoinChain, bonus = 0): number {
  return flipChance(coin.upgrades.luck, coin.upgrades.temple, chain.wins, chain.stake / coinCeiling(coin), bonus);
}

// ---------------------------------------------------------------------------
// Segundas oportunidades

export function maxSeconds(luckLevel: number): number {
  return C.seconds.base + Math.floor(Math.max(luckLevel, 0) / C.seconds.perLevels);
}

export function secondsInterval(luckLevel: number): number {
  return C.seconds.rechargeSeconds * C.seconds.rechargeFactor ** Math.max(luckLevel, 0);
}

export function updateSeconds(coin: CoinState, dt: number): void {
  const max = maxSeconds(coin.upgrades.luck);
  const s = coin.seconds;
  if (s.charges >= max) {
    s.charges = max;
    s.timer = 0;
    return;
  }
  s.timer += dt;
  const interval = secondsInterval(coin.upgrades.luck);
  while (s.timer >= interval && s.charges < max) {
    s.timer -= interval;
    s.charges++;
  }
  if (s.charges >= max) s.timer = 0;
}

// ---------------------------------------------------------------------------
// La cadena

export interface ChainRequest {
  bettor: Bettor;
  stake: number;
  luckBonus?: number;
}

/** ¿Hay una cadena del jugador sin resolver? */
export function chainInPlay(coin: CoinState): boolean {
  return coin.chain !== null && coin.chain.status !== 'fin';
}

function resolve(coin: CoinState, chain: CoinChain, result: CoinChain['result']): void {
  chain.status = 'fin';
  chain.result = result;
  let gain = 0;
  if (result === 'retirado' || result === 'cadena') {
    const raw = chain.stake * 2 ** chain.wins;
    gain = chainValue(chain.stake, chain.wins);
    chain.capped = raw > gain;
    if (result === 'cadena') {
      chain.jackpot = Math.floor(Math.min(coin.pot, COIN_JACKPOT_CAP));
      gain += chain.jackpot;
      coin.pot = C.jackpot.potSeed;
      coin.stats.jackpots++;
      coin.stats.fullChains++;
    }
    coin.balance += gain;
    coin.stats.cashouts++;
  }
  chain.delta = gain - chain.stake;
  coin.stats.bestChain = Math.max(coin.stats.bestChain, chain.wins);
  coin.recentChains.unshift(chain);
  if (coin.recentChains.length > CONFIG.tech.recentSpins) coin.recentChains.length = CONFIG.tech.recentSpins;
}

/** Lanza la moneda para esa cadena (con su probabilidad de ahora) y aplica el resultado. */
function flipOnce(coin: CoinState, chain: CoinChain, rng: Rng, bonus: number): CoinFace {
  const p = chainChance(coin, chain, bonus);
  chain.lastChance = p;
  const face: CoinFace = rng() < p ? 'cara' : 'cruz';
  chain.faces.push(face);
  coin.stats.flips++;
  if (face === 'cara') {
    coin.stats.heads++;
    chain.wins++;
    if (chain.wins >= C.chain.maxWins) resolve(coin, chain, 'cadena');
    else if (chain.stake * 2 ** chain.wins >= CHAIN_CAP) resolve(coin, chain, 'retirado'); // tope de la casa: se cobra solo
    else chain.status = 'decidir';
  } else {
    chain.status = 'fallo';
    if (coin.seconds.charges <= 0) resolve(coin, chain, 'perdido');
  }
  return face;
}

/**
 * Empieza una cadena: cobra la apuesta y lanza la primera vez. Devuelve null si no se puede (sin
 * saldo, fuera del techo o con una cadena del jugador sin resolver).
 */
export function startChain(coin: CoinState, req: ChainRequest, rng: Rng): CoinChain | null {
  const stake = Math.floor(req.stake);
  if (stake < C.bet.minBet || stake > coin.balance || stake > coinCeiling(coin)) return null;
  if (req.bettor === 'jugador' && chainInPlay(coin)) return null;
  coin.balance -= stake;
  coin.pot = Math.min(coin.pot + stake * C.jackpot.potContribution, COIN_JACKPOT_CAP);
  coin.stats.chains++;
  const chain: CoinChain = {
    bettor: req.bettor,
    stake,
    wins: 0,
    status: 'decidir',
    faces: [],
    lastChance: 0,
    seconds: 0,
    result: null,
    delta: 0,
    jackpot: 0,
    capped: false,
  };
  if (req.bettor === 'jugador') coin.chain = chain;
  flipOnce(coin, chain, rng, req.luckBonus ?? 0);
  return chain;
}

/** SEGUIR: tras una cara, se juega lo acumulado a otro lanzamiento. */
export function continueChain(coin: CoinState, chain: CoinChain, rng: Rng, bonus = 0): CoinFace | null {
  if (chain.status !== 'decidir' || chain.wins <= 0) return null;
  return flipOnce(coin, chain, rng, bonus);
}

/** RETIRARSE: se cobra lo acumulado. */
export function cashOut(coin: CoinState, chain: CoinChain): boolean {
  if (chain.status !== 'decidir' || chain.wins <= 0) return false;
  resolve(coin, chain, 'retirado');
  return true;
}

/** Segunda oportunidad: tras una cruz, gasta una carga y repite el lanzamiento. */
export function useSecondChance(coin: CoinState, chain: CoinChain, rng: Rng, bonus = 0): CoinFace | null {
  if (chain.status !== 'fallo' || coin.seconds.charges <= 0) return null;
  coin.seconds.charges--;
  chain.seconds++;
  coin.stats.seconds++;
  chain.faces.pop(); // la cruz no cuenta: se repite
  return flipOnce(coin, chain, rng, bonus);
}

/** Aceptar la cruz: se pierde lo acumulado. */
export function acceptLoss(coin: CoinState, chain: CoinChain): void {
  if (chain.status === 'fallo') resolve(coin, chain, 'perdido');
}

/** Probabilidad de completar `stop` caras seguidas desde 0 (sin segundas oportunidades). */
export function reachChance(luckLevel: number, templeLevel: number, stop: number, fraction: number, bonus = 0): number {
  let p = 1;
  for (let w = 0; w < stop; w++) p *= flipChance(luckLevel, templeLevel, w, fraction, bonus);
  return p;
}
