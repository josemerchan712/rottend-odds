import { currentMaxBet, playerBetAmount, riskLevel, type SelectorChip } from '../game/betting';
import { CONFIG } from '../game/config';
import { betWinChance, expectedValue } from '../game/luck';
import type { GameState } from '../game/state';
import { formatNumber, formatPercent } from '../util/format';
import type { CasinoTarget } from './scene';

const UNLOCK_NAME = { dozen: CONFIG.upgrades.dozenBet.name, number: CONFIG.upgrades.numberBet.name } as const;

function signed(value: number): string {
  const abs = Math.abs(value);
  const text = abs < 10 ? abs.toFixed(1).replace('.', ',') : formatNumber(abs);
  return `${value >= 0 ? '+' : '−'}${text}`;
}

/**
 * Texto del tooltip de una zona del tapete o de una ficha. Solo probabilidades, pagos, valor
 * esperado y nivel de riesgo: nunca porcentajes de saldo ni de techo.
 */
export function tooltipLines(state: GameState, target: CasinoTarget): string[] {
  const ceiling = currentMaxBet(state);
  if (target.kind === 'chip') return chipLines(state, target.chip, ceiling);

  const { zone, locked } = target;
  const payout = CONFIG.betTypes[zone.type].payout;
  const title = zone.type === 'number' ? `NÚMERO ${zone.label}` : zone.type === 'dozen' ? zone.label : zone.label;
  const lines = [`${title} · paga ${payout}:1`];
  if (locked) {
    lines.push(`Bloqueada: compra «${UNLOCK_NAME[zone.type as 'dozen' | 'number']}»`);
    return lines;
  }
  const bet = playerBetAmount(state);
  if (bet <= 0) {
    lines.push('No te llegan las fichas para esa apuesta.');
    return lines;
  }
  const p = betWinChance(zone.type, state.upgrades.luck, bet / ceiling);
  const ev = expectedValue(zone.type, bet, ceiling, state.upgrades.luck, state.upgrades.jackpot);
  lines.push(`Ganas con un ${formatPercent(p)} apostando ${formatNumber(bet)}`);
  lines.push(`Valor esperado: ${signed(ev)} fichas`);
  return lines;
}

function chipLines(state: GameState, chip: SelectorChip, ceiling: number): string[] {
  const title = chip.all ? `TODO · ${formatNumber(chip.amount)} fichas` : `${formatNumber(chip.amount)} ${chip.amount === 1 ? 'ficha' : 'fichas'}`;
  if (!chip.affordable) return [title, 'No te llegan las fichas.'];
  const p = betWinChance('color', state.upgrades.luck, chip.amount / ceiling);
  return [title, `A color ganas con un ${formatPercent(p)}`, `Riesgo ${riskLevel(chip.amount, ceiling)}`];
}
