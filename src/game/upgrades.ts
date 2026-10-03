import { CONFIG, type UpgradeId } from './config';
import type { GameState } from './state';

/** Mejoras que solo tienen sentido con el Crupier comprado. */
const NEEDS_CRUPIER: readonly UpgradeId[] = ['helperSpeed', 'helperProfile', 'helperLuck'];

export function upgradeCost(id: UpgradeId, level: number): number {
  const def = CONFIG.upgrades[id];
  return Math.round(def.baseCost * def.growth ** level);
}

export function isMaxed(state: GameState, id: UpgradeId): boolean {
  return state.upgrades[id] >= CONFIG.upgrades[id].maxLevel;
}

export function isUnlocked(state: GameState, id: UpgradeId): boolean {
  return !NEEDS_CRUPIER.includes(id) || state.upgrades.crupier > 0;
}

/** Coste del siguiente nivel, o null si ya está al máximo. */
export function nextCost(state: GameState, id: UpgradeId): number | null {
  return isMaxed(state, id) ? null : upgradeCost(id, state.upgrades[id]);
}

export function canBuy(state: GameState, id: UpgradeId): boolean {
  const cost = nextCost(state, id);
  return cost !== null && isUnlocked(state, id) && state.balance >= cost;
}

/** Compra un nivel. Devuelve false si no se puede (sin fichas, al máximo o bloqueada). */
export function buyUpgrade(state: GameState, id: UpgradeId): boolean {
  if (!canBuy(state, id)) return false;
  state.balance -= upgradeCost(id, state.upgrades[id]);
  state.upgrades[id]++;
  // Desbloquear un perfil nuevo lo activa directamente.
  if (id === 'helperProfile') state.helper.profile = state.upgrades.helperProfile;
  return true;
}
