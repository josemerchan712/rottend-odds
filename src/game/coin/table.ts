import { CONFIG, type CoinUpgradeId } from '../config';
import { cardsCeiling, cardsExpectedValue } from '../cards/game';
import { hasSkeleton, isCardsUnlocked, skeletonBet, skeletonInterval, skeletonLuckBonus } from '../cards/table';
import { bucket, chooseHelperBet, HELPER_RETRY_SECONDS, memoRate, recommendedProfile, stateKey, type HelperChoice, type Outcome } from '../helperPolicy';
import type { LenderPhase } from '../lender';
import type { Rng } from '../rng';
import type { GameState } from '../state';
import { acceptLoss, cashOut, chainValue, coinCeiling, continueChain, flipChance, secondsInterval, startChain, updateSeconds, useSecondChance } from './game';
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
 * Resultados de una cadena que se retira en `stop` caras, para el criterio común: el diablillo usa
 * una segunda oportunidad tras una cruz si ya lleva alguna cara y le quedan cargas (las que se
 * recargan más las que hay, repartidas en la ventana de riesgo).
 */
function chainOutcomes(coin: CoinState, stop: number, stake: number, bonus: number, interval: number): Outcome[] {
  const fraction = stake / coinCeiling(coin);
  const perFlip = interval / secondsInterval(coin.upgrades.luck) + (coin.seconds.charges * interval) / 120;
  let reach = 1;
  for (let w = 0; w < stop; w++) {
    const p = flipChance(coin.upgrades.luck, coin.upgrades.temple, w, fraction, bonus);
    const covered = w > 0 ? Math.min(1, perFlip / Math.max(1 - p, 0.01)) : 0;
    reach *= p + (1 - p) * p * covered;
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
    (stop, bet) => chainOutcomes(coin, stop, bet, bonus, interval),
    profile,
    // Una cadena dura unos cuantos lanzamientos: la ventana de riesgo cuenta cadenas, no lanzamientos.
    { balance: coin.balance, ceiling: coinCeiling(coin), minBet: C.bet.minBet, interval: interval * (profile.stops[0] + 1) },
  );
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
 * con su apuesta, sigue hasta sus caras, se retira, y tras una cruz usa una segunda oportunidad si
 * ya llevaba alguna cara. Devuelve las cadenas que ha resuelto.
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
      const started = startChain(coin, { bettor: 'ayudante', stake: choice.bet, luckBonus: bonus }, rng);
      coin.helper.chain = started;
      if (started?.status === 'fin') done.push(started);
      continue;
    }
    coin.helper.timer -= interval;
    if (chain.status === 'decidir') {
      if (chain.wins >= coin.helper.stopAt) cashOut(coin, chain);
      else continueChain(coin, chain, rng, bonus);
    } else if (chain.status === 'fallo') {
      if (chain.wins > 0 && coin.seconds.charges > 0) useSecondChance(coin, chain, rng, bonus);
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
  updateSeconds(coin, dt);
  const imp = updateImp(coin, dt, rng);
  return { imp };
}
