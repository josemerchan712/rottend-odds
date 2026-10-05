import { selectorChips, type SelectorChip } from '../betting';
import { CONFIG, HEIRLOOM_IDS, type CoinKind, type HeirloomId } from '../config';
import type { Rng } from '../rng';
import type { Bettor } from '../state';
import { emptyHeirlooms, type CoinChain, type CoinFace, type CoinState } from './state';

/**
 * La mesa del Dueño (lógica pura). Se apuesta y se lanza una moneda: con CARA lo acumulado se
 * multiplica por el factor del paso y sigue en juego (retirarse o seguir), con CRUZ se pierde todo.
 *
 * Sesión 8, multiplicadores acumulativos: el paso i paga ×f_i con f_i = i + CHAIN_FACTOR_OFFSET (×3,
 * ×4, ×5...; la cargada, ×1,5 f_i). La probabilidad del paso cae en proporción a su factor: ventaja/f
 * (1/f sería justo), con la ventaja de la casa por debajo de 1 y la suerte subiéndola hasta un tope.
 * Así seguir no es siempre rentable: cada paso arriesga todo lo acumulado. Las herencias de las mesas
 * anteriores dan cargas por cadena: Cero dorado, Retener, Relanzar y Marcar.
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

/** Ventaja del jugador en cada paso (probabilidad × factor): por debajo de 1 gana la casa. */
export function coinEdge(level: number): number {
  return Math.min(C.luck.base + (C.luck.cap - C.luck.base) * coinLuckProgress(level), C.luck.cap);
}

/** Probabilidad de cara de la moneda justa en el primer paso (sin penalización). */
export function coinLuckChance(level: number): number {
  return Math.min(coinEdge(level) / chainFactor(1), C.luck.maxChance);
}

/** Factor del paso `step` (1 = el primer acierto): step + CHAIN_FACTOR_OFFSET. */
export function chainFactor(step: number): number {
  return Math.max(step, 1) + C.chain.factorOffset;
}

/** Lo que multiplica lo acumulado el acierto del paso `step` con esa moneda. */
export function stepMultiplier(step: number, kind: CoinKind = 'justa'): number {
  return chainFactor(step) * (kind === 'cargada' ? C.loaded.payoutBoost : 1);
}

export function coinPenalty(fraction: number, luckLevel: number): number {
  const L = coinLuckProgress(luckLevel);
  const factor = C.risk.penaltyFactorAtMinLuck + (C.risk.penaltyFactorAtMaxLuck - C.risk.penaltyFactorAtMinLuck) * L;
  return factor * Math.min(Math.max(fraction, 0), 1) ** C.risk.penaltyExponent;
}

/** Exponente de la caída: 1 sin temple; el temple la suaviza. */
export function decayExponent(templeLevel: number): number {
  const level = Math.min(Math.max(templeLevel, 0), C.upgrades.temple.maxLevel);
  return 1 - C.decay.templeSofteningPerLevel * level;
}

/**
 * Denominador de la probabilidad tras `decay` pasos de caída: f_1 × (f_{decay+1} / f_1)^γ. Sin temple
 * es justo el factor del paso (la probabilidad justa de un paso con factor f es 1/f).
 */
export function stepDenominator(decay: number, templeLevel: number): number {
  const f1 = chainFactor(1);
  return f1 * (chainFactor(decay + 1) / f1) ** decayExponent(templeLevel);
}

/**
 * Probabilidad de cara del siguiente lanzamiento: ventaja (suerte y bonus propio) menos la penalización
 * por la fracción del techo apostada, que además cae un `edgePerStep` por paso, entre el denominador del
 * paso (`decay` pasos de caída; normalmente las caras que lleva). La cargada es `ratio` de la justa,
 * mejorada por la suerte hasta `luckBonusMax`.
 */
export function flipChance(luckLevel: number, templeLevel: number, decay: number, fraction: number, bonus = 0, kind: CoinKind = 'justa'): number {
  const edge = Math.min(coinEdge(luckLevel) + bonus, C.luck.cap) - coinPenalty(fraction, luckLevel);
  const fair = (edge * C.decay.edgePerStep ** Math.max(decay, 0)) / stepDenominator(decay, templeLevel);
  const p = kind === 'cargada' ? fair * C.loaded.ratio * (1 + C.loaded.luckBonusMax * coinLuckProgress(luckLevel)) : fair;
  return Math.min(Math.max(p, C.luck.floor), C.luck.maxChance);
}

/** Producto de los factores de los `wins` primeros pasos (moneda justa). */
export function chainProduct(wins: number): number {
  let product = 1;
  for (let i = 1; i <= wins; i++) product *= chainFactor(i);
  return product;
}

/** Lo que vale una cadena de `wins` caras con la moneda justa (sin jackpot), con el tope de la casa. */
export function chainValue(stake: number, wins: number): number {
  return Math.min(stake * chainProduct(wins), CHAIN_CAP);
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
  // Con Retener armado, este lanzamiento cae un paso menos.
  const decay = Math.max(0, chain.decay - (chain.holdArmed ? 1 : 0));
  return flipChance(coin.upgrades.luck, coin.upgrades.temple, decay, chain.stake / coinCeiling(coin), bonus, kind);
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
  if (chain.delta > 0) coin.stats.won += chain.delta;
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
  chain.holdArmed = false;
  const face: CoinFace = u < p ? 'cara' : 'cruz';
  chain.faces.push(face);
  chain.coins.push(kind);
  coin.stats.flips++;
  if (kind === 'cargada') coin.stats.loadedFlips++;
  if (face === 'cara') {
    coin.stats.heads++;
    const raw = chain.value * stepMultiplier(chain.wins + 1, kind);
    chain.wins++;
    chain.decay++;
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
    decay: 0,
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
  // El lanzamiento repetido es más difícil: tiene la probabilidad de `extraSteps` pasos más adelante.
  chain.decay += C.heirlooms.reroll.extraSteps;
  const face = flipOnce(coin, chain, rng, bonus, kind);
  chain.decay -= C.heirlooms.reroll.extraSteps;
  return face;
}

/** CERO DORADO (ruleta): tras una cruz, salva la cadena devolviendo parte de lo acumulado. */
export function useGoldenZero(coin: CoinState, chain: CoinChain): boolean {
  if (chain.status !== 'fallo' || chain.charges.zero <= 0) return false;
  spend(coin, chain, 'zero');
  resolve(coin, chain, 'salvado');
  return true;
}

/**
 * RETENER (tragaperras): congela la caída del siguiente paso: ese lanzamiento tiene la probabilidad del
 * paso anterior, aunque paga el factor del suyo. Solo ese paso; una carga por paso.
 */
export function armHold(coin: CoinState, chain: CoinChain): boolean {
  if (chain.status !== 'decidir' || chain.charges.hold <= 0 || chain.holdArmed || chain.decay <= 0) return false;
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
