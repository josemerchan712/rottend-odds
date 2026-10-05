import { selectorChips, type SelectorChip } from '../betting';
import { CONFIG, HEIRLOOM_IDS, type CoinKind, type HeirloomId } from '../config';
import type { Rng } from '../rng';
import type { Bettor } from '../state';
import { emptyHeirlooms, type CoinChain, type CoinFace, type CoinState } from './state';

/**
 * Doble o nada, la mesa del Dueño (lógica pura). Se apuesta y se lanza una moneda: con CARA lo
 * acumulado se multiplica (×2 la justa, ×3 la cargada) y sigue en juego (retirarse o seguir), con
 * CRUZ se pierde todo. La probabilidad base está por debajo del 50% (la casa), la suerte sube la del
 * primer lanzamiento hasta el 97% y cada cara seguida la baja un poco (la fatiga). Las herencias de
 * las mesas anteriores dan cargas por cadena: Cero dorado, Retener, Relanzar y Marcar.
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

/** Probabilidad de cara de la moneda justa en el primer lanzamiento (sin penalización ni fatiga). */
export function coinLuckChance(level: number): number {
  return Math.min(C.luck.base + (C.luck.cap - C.luck.base) * coinLuckProgress(level), C.luck.cap);
}

export function coinPenalty(fraction: number, luckLevel: number): number {
  const L = coinLuckProgress(luckLevel);
  const factor = C.risk.penaltyFactorAtMinLuck + (C.risk.penaltyFactorAtMaxLuck - C.risk.penaltyFactorAtMinLuck) * L;
  return factor * Math.min(Math.max(fraction, 0), 1) ** C.risk.penaltyExponent;
}

/** Lo que baja la probabilidad cada cara que cansa (el temple lo reduce). */
export function coinFatigue(templeLevel: number): number {
  const level = Math.min(Math.max(templeLevel, 0), C.upgrades.temple.maxLevel);
  return Math.max(C.fatigue.perWin - C.fatigue.templeReductionPerLevel * level, 0);
}

/** Multiplicador de una cara con esa moneda. */
export function coinMultiplier(kind: CoinKind): number {
  return kind === 'cargada' ? C.loaded.payout : 2;
}

/**
 * Probabilidad de cara del siguiente lanzamiento: suerte (y bonus propio), menos la penalización por
 * la fracción del techo apostada al empezar y la fatiga de las caras que cansaron. La cargada es
 * `ratio` de la justa (mismo valor esperado base), mejorada por la suerte hasta `luckBonusMax`; la
 * fatiga resta igual a las dos.
 */
export function flipChance(luckLevel: number, templeLevel: number, fatigue: number, fraction: number, bonus = 0, kind: CoinKind = 'justa'): number {
  const base = Math.min(coinLuckChance(luckLevel) + bonus, C.luck.cap) - coinPenalty(fraction, luckLevel);
  const scaled = kind === 'cargada' ? base * C.loaded.ratio * (1 + C.loaded.luckBonusMax * coinLuckProgress(luckLevel)) : base;
  // La fatiga resta lo mismo a las dos monedas (si escalara con la cargada, la cansaría menos).
  const p = scaled - coinFatigue(templeLevel) * fatigue;
  return Math.min(Math.max(p, C.luck.floor), C.luck.cap);
}

/** Lo que vale una cadena de `wins` caras con la moneda justa (sin jackpot), con el tope de la casa. */
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

/** ¿Se puede usar la moneda cargada? (mejora) */
export function loadedUnlocked(coin: CoinState): boolean {
  return coin.upgrades.loaded > 0;
}

/** Cambia la moneda del siguiente lanzamiento (la cargada solo con su mejora). */
export function selectCoinKind(coin: CoinState, kind: CoinKind): boolean {
  if (kind === 'cargada' && !loadedUnlocked(coin)) return false;
  coin.coinChoice = kind;
  return true;
}

/** Probabilidad de cara del siguiente lanzamiento de esa cadena, con esa moneda. */
export function chainChance(coin: CoinState, chain: CoinChain, bonus = 0, kind: CoinKind = coin.coinChoice): number {
  return flipChance(coin.upgrades.luck, coin.upgrades.temple, chain.fatigue, chain.stake / coinCeiling(coin), bonus, kind);
}

// ---------------------------------------------------------------------------
// Herencias

/** Cargas por cadena de una herencia (su nivel). */
export function heirloomCharges(coin: CoinState, id: HeirloomId): number {
  return Math.min(Math.max(Math.floor(coin.heirlooms[id] ?? 0), 0), C.heirlooms[id].maxLevel);
}

/** Lo que ve el jugador si ha marcado el siguiente lanzamiento (con la moneda elegida ahora). */
export function markedFace(coin: CoinState, chain: CoinChain, bonus = 0, kind: CoinKind = coin.coinChoice): CoinFace | null {
  if (chain.mark === null) return null;
  return chain.mark < chainChance(coin, chain, bonus, kind) ? 'cara' : 'cruz';
}

// ---------------------------------------------------------------------------
// La cadena

export interface ChainRequest {
  bettor: Bettor;
  stake: number;
  luckBonus?: number;
  kind?: CoinKind;
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
    gain = chain.value;
    if (result === 'cadena') {
      chain.jackpot = Math.floor(Math.min(coin.pot, COIN_JACKPOT_CAP));
      gain += chain.jackpot;
      coin.pot = C.jackpot.potSeed;
      coin.stats.jackpots++;
      coin.stats.fullChains++;
    }
    coin.stats.cashouts++;
  } else if (result === 'salvado') {
    gain = Math.floor(chain.value * C.heirlooms.zero.refund);
  }
  coin.balance += gain;
  chain.delta = gain - chain.stake;
  coin.stats.bestChain = Math.max(coin.stats.bestChain, chain.wins);
  coin.recentChains.unshift(chain);
  if (coin.recentChains.length > CONFIG.tech.recentSpins) coin.recentChains.length = CONFIG.tech.recentSpins;
}

/** Tras una cruz, ¿le queda algo a esa cadena para salvarse? */
function canRescue(chain: CoinChain): boolean {
  return chain.wins > 0 && (chain.charges.reroll > 0 || chain.charges.zero > 0);
}

/** Lanza la moneda para esa cadena (con su probabilidad de ahora, o el resultado marcado) y aplica el resultado. */
function flipOnce(coin: CoinState, chain: CoinChain, rng: Rng, bonus: number, kind: CoinKind): CoinFace {
  const p = chainChance(coin, chain, bonus, kind);
  chain.lastChance = p;
  const u = chain.mark ?? rng();
  chain.mark = null;
  const face: CoinFace = u < p ? 'cara' : 'cruz';
  chain.faces.push(face);
  chain.coins.push(kind);
  coin.stats.flips++;
  if (kind === 'cargada') coin.stats.loadedFlips++;
  if (face === 'cara') {
    coin.stats.heads++;
    chain.wins++;
    if (chain.holdArmed) chain.holdArmed = false;
    else chain.fatigue++;
    const raw = chain.value * coinMultiplier(kind);
    chain.value = Math.min(raw, CHAIN_CAP);
    if (raw > CHAIN_CAP) chain.capped = true;
    if (chain.wins >= C.chain.maxWins) resolve(coin, chain, 'cadena');
    else if (chain.value >= CHAIN_CAP) resolve(coin, chain, 'retirado'); // tope de la casa: se cobra solo
    else chain.status = 'decidir';
  } else {
    chain.status = 'fallo';
    if (!canRescue(chain)) resolve(coin, chain, 'perdido');
  }
  return face;
}

/**
 * Empieza una cadena: cobra la apuesta, llena las cargas de las herencias y lanza la primera vez.
 * Devuelve null si no se puede (sin saldo, fuera del techo o con una cadena del jugador sin resolver).
 */
export function startChain(coin: CoinState, req: ChainRequest, rng: Rng): CoinChain | null {
  const stake = Math.floor(req.stake);
  if (stake < C.bet.minBet || stake > coin.balance || stake > coinCeiling(coin)) return null;
  if (req.bettor === 'jugador' && chainInPlay(coin)) return null;
  const kind = req.kind ?? 'justa';
  if (kind === 'cargada' && !loadedUnlocked(coin)) return null;
  coin.balance -= stake;
  coin.pot = Math.min(coin.pot + stake * C.jackpot.potContribution, COIN_JACKPOT_CAP);
  coin.stats.chains++;
  const charges = emptyHeirlooms();
  for (const id of HEIRLOOM_IDS) charges[id] = heirloomCharges(coin, id);
  const chain: CoinChain = {
    bettor: req.bettor,
    stake,
    value: stake,
    wins: 0,
    fatigue: 0,
    status: 'decidir',
    faces: [],
    coins: [],
    lastChance: 0,
    charges,
    holdArmed: false,
    mark: null,
    used: emptyHeirlooms(),
    result: null,
    delta: 0,
    jackpot: 0,
    capped: false,
  };
  if (req.bettor === 'jugador') coin.chain = chain;
  flipOnce(coin, chain, rng, req.luckBonus ?? 0, kind);
  return chain;
}

/** SEGUIR: tras una cara, se juega lo acumulado a otro lanzamiento (con la moneda elegida). */
export function continueChain(coin: CoinState, chain: CoinChain, rng: Rng, bonus = 0, kind: CoinKind = coin.coinChoice): CoinFace | null {
  if (chain.status !== 'decidir' || chain.wins <= 0) return null;
  if (kind === 'cargada' && !loadedUnlocked(coin)) return null;
  return flipOnce(coin, chain, rng, bonus, kind);
}

/** RETIRARSE: se cobra lo acumulado. */
export function cashOut(coin: CoinState, chain: CoinChain): boolean {
  if (chain.status !== 'decidir' || chain.wins <= 0) return false;
  resolve(coin, chain, 'retirado');
  return true;
}

function spend(coin: CoinState, chain: CoinChain, id: HeirloomId): void {
  chain.charges[id]--;
  chain.used[id]++;
  coin.stats.heirloomsUsed++;
}

/** RELANZAR (dados): tras una cruz, gasta una carga y repite el lanzamiento con la misma moneda. */
export function useReroll(coin: CoinState, chain: CoinChain, rng: Rng, bonus = 0): CoinFace | null {
  // Solo con alguna cara: protege lo acumulado, no la apuesta inicial (como el Cero dorado).
  if (chain.status !== 'fallo' || chain.charges.reroll <= 0 || chain.wins <= 0) return null;
  spend(coin, chain, 'reroll');
  chain.faces.pop(); // la cruz no cuenta: se repite
  const kind = chain.coins.pop() ?? 'justa';
  // El lanzamiento repetido es más difícil: cuenta `rerollFatigue` caras más de fatiga (solo para él).
  chain.fatigue += C.heirlooms.reroll.extraFatigue;
  const face = flipOnce(coin, chain, rng, bonus, kind);
  chain.fatigue -= C.heirlooms.reroll.extraFatigue;
  return face;
}

/** CERO DORADO (ruleta): tras una cruz, salva la cadena devolviendo parte de lo acumulado. */
export function useGoldenZero(coin: CoinState, chain: CoinChain): boolean {
  if (chain.status !== 'fallo' || chain.charges.zero <= 0) return false;
  spend(coin, chain, 'zero');
  resolve(coin, chain, 'salvado');
  return true;
}

/** RETENER (tragaperras): el próximo acierto no suma fatiga. */
export function armHold(coin: CoinState, chain: CoinChain): boolean {
  if (chain.status !== 'decidir' || chain.charges.hold <= 0 || chain.holdArmed) return false;
  spend(coin, chain, 'hold');
  chain.holdArmed = true;
  return true;
}

/** MARCAR (cartas): decide ya el próximo lanzamiento y lo enseña antes de seguir o retirarse. */
export function useMark(coin: CoinState, chain: CoinChain, rng: Rng): boolean {
  if (chain.status !== 'decidir' || chain.charges.mark <= 0 || chain.mark !== null) return false;
  spend(coin, chain, 'mark');
  chain.mark = rng();
  return true;
}

/** Aceptar la cruz: se pierde lo acumulado. */
export function acceptLoss(coin: CoinState, chain: CoinChain): void {
  if (chain.status === 'fallo') resolve(coin, chain, 'perdido');
}

/** Probabilidad de completar `stop` caras seguidas desde 0 con la moneda justa (sin herencias). */
export function reachChance(luckLevel: number, templeLevel: number, stop: number, fraction: number, bonus = 0): number {
  let p = 1;
  for (let w = 0; w < stop; w++) p *= flipChance(luckLevel, templeLevel, w, fraction, bonus);
  return p;
}
