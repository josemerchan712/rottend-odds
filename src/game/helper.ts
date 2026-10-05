import { currentMaxBet } from './betting';
import { CONFIG } from './config';
import {
  binaryOutcomes,
  bucket,
  chooseHelperBet,
  memoRate,
  stateKey,
  HELPER_RETRY_SECONDS,
  recommendedProfile,
  type HelperChoice,
} from './helperPolicy';
import { betWinChance } from './luck';
import type { Rng } from './rng';
import { spin } from './roulette';
import type { GameState, SpinResult } from './state';

export function hasHelper(state: GameState): boolean {
  return state.upgrades.crupier > 0;
}

/** Segundos entre apuestas del ayudante. */
export function helperInterval(speedLevel: number): number {
  return CONFIG.helper.baseInterval * (1 - CONFIG.helper.speedReductionPerLevel) ** speedLevel;
}

export function helperLuckBonus(level: number): number {
  return CONFIG.helper.luckPerLevel * level;
}

/** Perfil activo, limitado a los desbloqueados. */
export function helperProfile(state: GameState) {
  const unlocked = Math.min(state.upgrades.helperProfile, CONFIG.helper.profiles.length - 1);
  return CONFIG.helper.profiles[Math.min(Math.max(state.helper.profile, 0), unlocked)];
}

/** Decisión del ayudante con un perfil (criterio común de helperPolicy), o null si espera. */
export function helperChoiceFor(state: GameState, profileIndex = state.helper.profile): HelperChoice<'color'> | null {
  const ceiling = currentMaxBet(state);
  const bonus = helperLuckBonus(state.upgrades.helperLuck);
  const unlocked = Math.min(state.upgrades.helperProfile, CONFIG.helper.profiles.length - 1);
  const profile = CONFIG.helper.profiles[Math.min(Math.max(profileIndex, 0), unlocked)];
  return chooseHelperBet(
    ['color'] as const,
    (_, bet) => binaryOutcomes(betWinChance('color', state.upgrades.luck, bet / ceiling, bonus), CONFIG.betTypes.color.payout),
    profile,
    {
      balance: state.balance,
      ceiling,
      minBet: CONFIG.bet.minBet,
      interval: helperInterval(state.upgrades.helperSpeed),
    },
  );
}

/** Perfil recomendado del ayudante para la suerte y el saldo de ahora. */
export function recommendedHelperProfile(state: GameState): number {
  return memoRate(state, 'recommendedHelperProfile', stateKey(state.upgrades, bucket(state.balance), Math.floor(state.playTime * 2)), () =>
    recommendedProfile(Math.min(state.upgrades.helperProfile, CONFIG.helper.profiles.length - 1), (i) => helperChoiceFor(state, i)),
  );
}

/** Apuesta del ayudante (0 = espera: sin ventaja suficiente para su perfil o sin saldo). */
export function helperBetAmount(state: GameState): number {
  return helperChoiceFor(state)?.bet ?? 0;
}

export function selectHelperProfile(state: GameState, index: number): boolean {
  if (index < 0 || index > state.upgrades.helperProfile || index >= CONFIG.helper.profiles.length) return false;
  state.helper.profile = index;
  return true;
}

/** Bloquea al ayudante (castigo por perder un TODO). */
export function lockHelper(state: GameState): void {
  state.helper.lockout = CONFIG.helper.allInLossLockout;
}

/**
 * Avanza el temporizador del ayudante y apuesta cuantas veces toque.
 * Si está bloqueado o sin fichas, el temporizador espera lleno para apostar en cuanto pueda.
 */
export function updateHelper(state: GameState, dt: number, rng: Rng): SpinResult[] {
  if (!hasHelper(state)) return [];
  const results: SpinResult[] = [];

  let time = dt;
  if (state.helper.lockout > 0) {
    const used = Math.min(state.helper.lockout, time);
    state.helper.lockout -= used;
    time -= used;
  }

  const interval = helperInterval(state.upgrades.helperSpeed);
  state.helper.timer += time;
  while (state.helper.timer >= interval) {
    const bet = helperBetAmount(state);
    if (bet <= 0) {
      state.helper.timer = Math.max(interval - HELPER_RETRY_SECONDS, 0);
      break;
    }
    state.helper.timer -= interval;
    const color = rng() < 0.5 ? ('negro' as const) : ('blanco' as const);
    const luckBonus = helperLuckBonus(state.upgrades.helperLuck);
    const result = spin(state, { bettor: 'ayudante', choice: { type: 'color', color }, bet, luckBonus }, rng);
    if (result) results.push(result);
  }
  return results;
}
