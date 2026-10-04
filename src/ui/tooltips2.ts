import { CONFIG } from '../game/config';
import { riskLevel } from '../game/betting';
import { holdFee, selectedSlotChip, slotCeiling, slotExpectedValue, slotWinChance, heldWinChance } from '../game/slots/machine';
import type { GameState } from '../game/state';
import { formatNumber, formatPercent } from '../util/format';
import type { SlotsTarget } from './slotsScene';

/** Líneas del tooltip de la mesa 2 (la primera es el título). */
export function slotsTooltip(state: GameState, target: SlotsTarget): string[] {
  const slots = state.slots;
  const ceiling = slotCeiling(slots);
  if (target.kind === 'chip') {
    const { chip } = target;
    if (!chip.affordable) return [`${formatNumber(chip.amount)} monedas`, 'No te llega'];
    const p = slotWinChance(slots.upgrades.luck, chip.amount / ceiling);
    return [`${chip.all ? 'TODO · ' : ''}${formatNumber(chip.amount)} monedas`, `Premio: ${formatPercent(p)}`, `Riesgo ${riskLevel(chip.amount, ceiling)}`];
  }
  const chip = selectedSlotChip(slots);
  const bet = chip.affordable ? chip.amount : 0;
  if (target.kind === 'reel') {
    if (slots.upgrades.hold <= 0) return ['Carrete', 'Compra "Retener carrete" para fijarlo'];
    if (slots.reels[target.reel] === CONFIG.slots.diamond) return ['Diamante', 'No se deja retener'];
    const p = slotWinChance(slots.upgrades.luck, bet / ceiling);
    return [
      slots.hold === target.reel ? 'Retenido (clic: soltar)' : 'Clic: retener',
      `Premio: ${formatPercent(p)} → ${formatPercent(heldWinChance(p, slots.upgrades.hold))}`,
      `Extra: ${formatNumber(holdFee(bet))} · sin jackpot`,
    ];
  }
  if (bet <= 0) return ['Tirar', 'No te llega para la ficha elegida'];
  const holding = slots.hold !== null;
  const ev = slotExpectedValue(bet, ceiling, slots.upgrades.luck, slots.upgrades.jackpot, {
    holdLevel: slots.upgrades.hold,
    heldSymbol: holding ? slots.reels[slots.hold!] : null,
    pot: slots.pot,
  });
  return [`Tirar ${formatNumber(bet)}${holding ? ' (retenido)' : ''}`, `Valor esperado: ${ev >= 0 ? '+' : '−'}${formatNumber(Math.abs(ev))}`, 'Espacio'];
}
