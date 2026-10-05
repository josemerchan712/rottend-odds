import { CONFIG, type CoinKind, type CoinUpgradeId, type HeirloomId } from '../config';
import { cardsCeiling, cardsExpectedValue } from '../cards/game';
import { hasSkeleton, isCardsUnlocked, skeletonBet, skeletonInterval, skeletonLuckBonus } from '../cards/table';
import { bucket, chooseHelperBet, HELPER_RETRY_SECONDS, memoRate, recommendedProfile, stateKey, type HelperChoice, type Outcome } from '../helperPolicy';
import type { LenderPhase } from '../lender';
import type { Rng } from '../rng';
import type { GameState } from '../state';
import {
  acceptLoss,
  armHold,
  cashOut,
  chainChance,
  chainValue,
  coinCeiling,
  continueChain,
  flipChance,
  heirloomCharges,
  loadedUnlocked,
  markedFace,
  startChain,
  useGoldenZero,
  useMark,
  useReroll,
} from './game';
import type { CoinChain, CoinState } from './state';

/**
 * El resto de la mesa 5 (lógica pura): desbloqueo y deuda (la última), mejoras, ayudante (el
 * diablillo coronado), conversión desde la mesa 4 y el paso del tiempo. Sin trastienda.
 */
const C = CONFIG.coin;

export function isCoinUnlocked(state: GameState): boolean {
  return isCardsUnlocked(state) && state.cards.debtPaid;
}

export function coinDebtProgress(coin: CoinState): number {
  return coin.debtPaid ? 1 : Math.min(coin.balance / C.debt.amount, 1);
}

export function canPayCoinDebt(coin: CoinState): boolean {
  return !coin.debtPaid && coin.balance >= C.debt.amount;
}

/** Paga la deuda del Dueño: el final del juego. */
export function payCoinDebt(coin: CoinState): boolean {
  if (!canPayCoinDebt(coin)) return false;
  coin.balance -= C.debt.amount;
  coin.debtPaid = true;
  return true;
}

export function coinLenderPhase(coin: CoinState): LenderPhase {
  if (coin.debtPaid) return 'calm';
  const progress = coinDebtProgress(coin);
  const [uneasyFrom, deformedFrom] = CONFIG.lender.phaseThresholds;
  if (progress >= deformedFrom) return 'deformed';
  if (progress >= uneasyFrom) return 'uneasy';
  return 'calm';
}

// ---------------------------------------------------------------------------
// Mejoras

const NEEDS_IMP: readonly CoinUpgradeId[] = ['helperSpeed', 'helperProfile', 'helperLuck'];

export function coinUpgradeCost(id: CoinUpgradeId, level: number): number {
  const def = C.upgrades[id];
  return Math.round(def.baseCost * def.growth ** level);
}

export function isCoinMaxed(coin: CoinState, id: CoinUpgradeId): boolean {
  return coin.upgrades[id] >= C.upgrades[id].maxLevel;
}

export function isCoinUpgradeUnlocked(coin: CoinState, id: CoinUpgradeId): boolean {
  return !NEEDS_IMP.includes(id) || coin.upgrades.imp > 0;
}

export function coinNextCost(coin: CoinState, id: CoinUpgradeId): number | null {
  return isCoinMaxed(coin, id) ? null : coinUpgradeCost(id, coin.upgrades[id]);
}

export function canBuyCoin(coin: CoinState, id: CoinUpgradeId): boolean {
  const cost = coinNextCost(coin, id);
  return cost !== null && isCoinUpgradeUnlocked(coin, id) && coin.balance >= cost;
}

export function buyCoinUpgrade(coin: CoinState, id: CoinUpgradeId): boolean {
  if (!canBuyCoin(coin, id)) return false;
  coin.balance -= coinNextCost(coin, id)!;
  coin.upgrades[id]++;
  if (id === 'helperProfile') coin.helper.profile = coin.upgrades.helperProfile;
  return true;
}

// ---------------------------------------------------------------------------
// Herencias: se compran con la moneda de su mesa de origen

/** Saldo de la mesa de origen de una herencia (fichas, monedas, chapas o fichas negras). */
export function heirloomWallet(state: GameState, id: HeirloomId): number {
  const from = C.heirlooms[id].from;
  return from === 'table1' ? state.balance : from === 'slots' ? state.slots.balance : from === 'dice' ? state.dice.balance : state.cards.balance;
}

function payFromWallet(state: GameState, id: HeirloomId, amount: number): void {
  const from = C.heirlooms[id].from;
  if (from === 'table1') state.balance -= amount;
  else if (from === 'slots') state.slots.balance -= amount;
  else if (from === 'dice') state.dice.balance -= amount;
  else state.cards.balance -= amount;
}

/** Coste del siguiente nivel de una herencia (en la moneda de su mesa), o null si está al máximo. */
export function heirloomNextCost(coin: CoinState, id: HeirloomId): number | null {
  const level = heirloomCharges(coin, id);
  return level >= C.heirlooms[id].maxLevel ? null : C.heirlooms[id].costs[level];
}

export function canBuyHeirloom(state: GameState, id: HeirloomId): boolean {
  const cost = heirloomNextCost(state.coin, id);
  return cost !== null && heirloomWallet(state, id) >= cost;
}

export function buyHeirloom(state: GameState, id: HeirloomId): boolean {
  if (!canBuyHeirloom(state, id)) return false;
  payFromWallet(state, id, heirloomNextCost(state.coin, id)!);
  state.coin.heirlooms[id]++;
  return true;
}

// ---------------------------------------------------------------------------
// Ayudante: el diablillo coronado

export function hasImp(coin: CoinState): boolean {
  return coin.upgrades.imp > 0;
}

/** Segundos entre lanzamientos del diablillo. */
export function impInterval(speedLevel: number): number {
  return C.helper.baseInterval * (1 - C.helper.speedReductionPerLevel) ** speedLevel;
}

export function impLuckBonus(level: number): number {
  return C.helper.luckPerLevel * level;
}

export function impProfile(coin: CoinState) {
  const unlocked = Math.min(coin.upgrades.helperProfile, C.helper.profiles.length - 1);
  return C.helper.profiles[Math.min(Math.max(coin.helper.profile, 0), unlocked)];
}

export function selectImpProfile(coin: CoinState, index: number): boolean {
  if (index < 0 || index > coin.upgrades.helperProfile || index >= C.helper.profiles.length) return false;
  coin.helper.profile = index;
  return true;
}

/**
 * Resultados de una cadena que se retira en `stop` caras con la moneda justa, para el criterio común.
 * Cuenta las herencias que usa el diablillo: Retener (las primeras caras no cansan) y Relanzar (tras
 * una cruz, si ya lleva alguna cara, mientras le queden cargas en la cadena). Cero dorado y Marcar no
 * se cuentan (decisión prudente).
 */
function chainOutcomes(coin: CoinState, stop: number, stake: number, bonus: number): Outcome[] {
  const fraction = stake / coinCeiling(coin);
  const holds = heirloomCharges(coin, 'hold');
  let rerolls = heirloomCharges(coin, 'reroll');
  let reach = 1;
  for (let w = 0; w < stop; w++) {
    // Retener se arma tras la primera cara: la primera cansa y las `holds` siguientes no.
    const fatigue = w === 0 ? 0 : 1 + Math.max(0, w - 1 - holds);
    const p = flipChance(coin.upgrades.luck, coin.upgrades.temple, fatigue, fraction, bonus);
    if (w > 0 && rerolls > 0) {
      const pRe = flipChance(coin.upgrades.luck, coin.upgrades.temple, fatigue + C.heirlooms.reroll.extraFatigue, fraction, bonus);
      reach *= p + (1 - p) * pRe;
      rerolls--;
    } else reach *= p;
  }
  const net = chainValue(stake, stop) / stake - 1;
  return [
    { p: reach, net },
    { p: 1 - reach, net: -1 },
  ];
}

/**
 * Decisión del diablillo con un perfil: cuánto apuesta y en cuántas caras se retira, dentro de las
 * de su perfil (prudente 1-2, normal 3-4, agresivo 5 o más), con el criterio común de los ayudantes.
 */
export function impChoiceFor(coin: CoinState, profileIndex = coin.helper.profile): HelperChoice<number> | null {
  const unlocked = Math.min(coin.upgrades.helperProfile, C.helper.profiles.length - 1);
  const profile = C.helper.profiles[Math.min(Math.max(profileIndex, 0), unlocked)];
  const bonus = impLuckBonus(coin.upgrades.helperLuck);
  const interval = impInterval(coin.upgrades.helperSpeed);
  const stops: number[] = [];
  for (let s = profile.stops[0]; s <= profile.stops[1]; s++) stops.push(s);
  return chooseHelperBet(
    stops,
    (stop, bet) => chainOutcomes(coin, stop, bet, bonus),
    profile,
    // Una cadena dura unos cuantos lanzamientos: la ventana de riesgo cuenta cadenas, no lanzamientos.
    { balance: coin.balance, ceiling: coinCeiling(coin), minBet: C.bet.minBet, interval: interval * (profile.stops[0] + 1) },
  );
}

/** Moneda del diablillo para su próximo lanzamiento: la cargada solo el agresivo y si acierta ≥ 55%. */
function impCoin(coin: CoinState, chain: CoinChain | null, bonus: number): CoinKind {
  if (!loadedUnlocked(coin) || coin.helper.profile < 2) return 'justa';
  const p = chain
    ? chainChance(coin, chain, bonus, 'cargada')
    : flipChance(coin.upgrades.luck, coin.upgrades.temple, 0, impBetFraction(coin), bonus, 'cargada');
  return p >= 0.55 ? 'cargada' : 'justa';
}

function impBetFraction(coin: CoinState): number {
  return Math.min(C.helper.profiles[Math.min(coin.helper.profile, C.helper.profiles.length - 1)].fraction, 1);
}

/** Perfil recomendado del diablillo para la suerte y el saldo de ahora. */
export function recommendedImpProfile(coin: CoinState): number {
  return memoRate(coin, 'recommendedImpProfile', stateKey(coin.upgrades, bucket(coin.balance), Math.floor(coin.playTime * 2)), () =>
    recommendedProfile(Math.min(coin.upgrades.helperProfile, C.helper.profiles.length - 1), (i) => impChoiceFor(coin, i)),
  );
}

/** Apuesta con la que empezaría el diablillo ahora. 0 = espera. */
export function impBet(coin: CoinState): number {
  return impChoiceFor(coin)?.bet ?? 0;
}

/**
 * El diablillo juega cuando le toca: un lanzamiento (o una decisión) por turno. Empieza una cadena
 * con su apuesta, sigue hasta sus caras y se retira. Herencias, con criterio sencillo: arma Retener en
 * cuanto puede; con alguna cara, Marca antes de seguir y se retira si ve cruz; tras una cruz, Relanza
 * y, si no puede, usa el Cero dorado (con alguna cara). Moneda: la justa, salvo el agresivo, que usa
 * la cargada cuando acierta al menos el 55%. Devuelve las cadenas que ha resuelto.
 */
export function updateImp(coin: CoinState, dt: number, rng: Rng): CoinChain[] {
  if (!hasImp(coin)) return [];
  const done: CoinChain[] = [];
  const interval = impInterval(coin.upgrades.helperSpeed);
  const bonus = impLuckBonus(coin.upgrades.helperLuck);
  coin.helper.timer += dt;
  while (coin.helper.timer >= interval) {
    const chain = coin.helper.chain;
    if (!chain || chain.status === 'fin') {
      const choice = impChoiceFor(coin);
      if (!choice) {
        coin.helper.chain = null;
        coin.helper.timer = Math.max(interval - HELPER_RETRY_SECONDS, 0);
        break;
      }
      coin.helper.timer -= interval;
      coin.helper.stopAt = choice.key;
      const started = startChain(coin, { bettor: 'ayudante', stake: choice.bet, luckBonus: bonus, kind: impCoin(coin, null, bonus) }, rng);
      coin.helper.chain = started;
      if (started?.status === 'fin') done.push(started);
      continue;
    }
    coin.helper.timer -= interval;
    if (chain.status === 'decidir') {
      if (chain.wins >= coin.helper.stopAt) cashOut(coin, chain);
      else {
        const kind = impCoin(coin, chain, bonus);
        armHold(coin, chain);
        if (chain.charges.mark > 0 && chain.mark === null) useMark(coin, chain, rng);
        if (markedFace(coin, chain, bonus, kind) === 'cruz') cashOut(coin, chain);
        else continueChain(coin, chain, rng, bonus, kind);
      }
    } else if (chain.status === 'fallo') {
      if (chain.wins > 0 && chain.charges.reroll > 0) useReroll(coin, chain, rng, bonus);
      else if (chain.wins > 0 && chain.charges.zero > 0) useGoldenZero(coin, chain);
      else acceptLoss(coin, chain);
    }
    if ((chain.status as CoinChain['status']) === 'fin') done.push(chain);
  }
  return done;
}

// ---------------------------------------------------------------------------
// Conversión desde la mesa 4

/** Ingreso esperado por segundo de la mesa 4 jugando sola: su esqueleto (sin descartes ni jackpot). */
export function table4IncomeRate(state: GameState): number {
  const cards = state.cards;
  return memoRate(
    cards,
    'table4IncomeRate',
    stateKey(cards.upgrades, cards.helper.profile, bucket(cards.balance), Math.floor(cards.playTime)),
    () => {
      if (!hasSkeleton(cards)) return 0;
      const bet = skeletonBet(cards);
      if (bet <= 0) return 0;
      const ev = cardsExpectedValue(bet, cardsCeiling(cards), cards.upgrades.luck, skeletonLuckBonus(cards.upgrades.helperLuck));
      return Math.max(ev, 0) / skeletonInterval(cards.upgrades.helperSpeed);
    },
  );
}

export function coinPassiveRate(state: GameState): number {
  return Math.max(C.conversion.floor, C.conversion.k * Math.sqrt(Math.max(table4IncomeRate(state), 0)));
}

// ---------------------------------------------------------------------------
// Paso del tiempo

export interface CoinTick {
  imp: CoinChain[];
}

export function updateCoin(state: GameState, dt: number, rng: Rng): CoinTick {
  if (!isCoinUnlocked(state) || dt <= 0) return { imp: [] };
  const coin = state.coin;
  coin.playTime += dt;
  coin.passiveCarry += coinPassiveRate(state) * dt;
  const whole = Math.floor(coin.passiveCarry);
  if (whole > 0) {
    coin.passiveCarry -= whole;
    coin.balance += whole;
    coin.stats.passiveEarned += whole;
  }
  const imp = updateImp(coin, dt, rng);
  return { imp };
}
