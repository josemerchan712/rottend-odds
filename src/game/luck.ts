import { CONFIG, type BetType } from './config';

const { luck, risk, jackpot, upgrades } = CONFIG;

/** Progreso de la curva de suerte entre 0 (nivel 0) y 1 (nivel máximo). Convexa. */
export function luckProgress(level: number): number {
  const max = upgrades.luck.maxLevel;
  const n = Math.min(Math.max(level, 0), max);
  return (n / max) ** luck.curveExponent;
}

/** Probabilidad de ganar a color que da el nivel de suerte, sin penalización. Nunca pasa del tope. */
export function luckChance(level: number): number {
  return Math.min(luck.base + (luck.cap - luck.base) * luckProgress(level), luck.cap);
}

/** Cuánto resta apostar `fraction` (0-1) del techo de apuesta. */
export function riskPenalty(fraction: number): number {
  const f = Math.min(Math.max(fraction, 0), 1);
  return risk.penaltyFactor * f ** risk.penaltyExponent;
}

/**
 * Probabilidad efectiva de ganar a color: suerte (+ bonus propio, p. ej. del ayudante) con tope,
 * menos la penalización por la fracción del techo apostada. Siempre en [0, tope].
 */
export function effectiveWinChance(luckLevel: number, fraction: number, bonus = 0): number {
  const p = Math.min(luckChance(luckLevel) + bonus, luck.cap);
  return Math.max(p - riskPenalty(fraction), 0);
}

/** Probabilidad efectiva para cualquier tipo de apuesta: la del color escalada por sus casillas. */
export function betWinChance(type: BetType, luckLevel: number, fraction: number, bonus = 0): number {
  return effectiveWinChance(luckLevel, fraction, bonus) * CONFIG.betTypes[type].chanceRatio;
}

/** Probabilidad del Cero Dorado: base + suerte (misma curva) + mejora, con tope. */
export function jackpotChance(luckLevel: number, jackpotLevel: number): number {
  const level = Math.min(Math.max(jackpotLevel, 0), upgrades.jackpot.maxLevel);
  const chance =
    jackpot.baseChance + jackpot.luckBonusMax * luckProgress(luckLevel) + jackpot.upgradeBonusPerLevel * level;
  return Math.min(chance, jackpot.maxChance);
}

/** Ganancia de un Cero Dorado y si se ha recortado por el tope. */
export function jackpotPayout(bet: number): { gain: number; capped: boolean } {
  const raw = bet * jackpot.payoutMultiplier;
  const cap = CONFIG.debt.amount * jackpot.payoutCapDebtFraction;
  return raw > cap ? { gain: cap, capped: true } : { gain: raw, capped: false };
}

/**
 * Valor esperado neto de una apuesta, incluido el Cero Dorado (que sale antes del sorteo normal).
 * Lo usan la interfaz y la simulación.
 */
export function expectedValue(
  type: BetType,
  bet: number,
  ceiling: number,
  luckLevel: number,
  jackpotLevel: number,
  bonus = 0,
): number {
  if (bet <= 0) return 0;
  const p = betWinChance(type, luckLevel, bet / ceiling, bonus);
  const pj = jackpotChance(luckLevel, jackpotLevel);
  const payout = CONFIG.betTypes[type].payout;
  return pj * jackpotPayout(bet).gain + (1 - pj) * (p * payout * bet - (1 - p) * bet);
}
