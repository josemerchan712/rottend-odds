import { CONFIG } from '../game/config';
import { riskLevel } from '../game/betting';
import { diceCeiling, rerollChance, selectedDiceChip, targetChance, targetExpectedValue, openRoll } from '../game/dice/game';
import type { GameState } from '../game/state';
import { formatNumber, formatPercent } from '../util/format';
import type { DiceTargetHit } from './diceScene';

/** Líneas del tooltip de la mesa 3 (la primera es el título). */
export function diceTooltip(state: GameState, hit: DiceTargetHit): string[] {
  const dice = state.dice;
  const ceiling = diceCeiling(dice);
  const chip = selectedDiceChip(dice);
  const bet = chip.affordable ? chip.amount : 0;
  switch (hit.kind) {
    case 'chip': {
      const c = hit.chip;
      if (!c.affordable) return [`${formatNumber(c.amount)} chapas`, 'No te llega'];
      return [`${c.all ? 'TODO · ' : ''}${formatNumber(c.amount)} chapas`, `Acierto (${CONFIG.dice.targets[dice.target].name.toLowerCase()}): ${formatPercent(targetChance(dice.target, dice.upgrades.luck, c.amount / ceiling))}`, `Riesgo ${riskLevel(c.amount, ceiling)}`];
    }
    case 'target': {
      const def = CONFIG.dice.targets[hit.target];
      if (hit.locked) return [def.name, 'Se desbloquea en el cajón Mesa'];
      const p = targetChance(hit.target, dice.upgrades.luck, bet / ceiling);
      const ev = targetExpectedValue(hit.target, Math.max(bet, 1), ceiling, dice.upgrades.luck);
      return [`${def.name} · paga ${String(def.payout).replace('.', ',')}:1`, `Acierto: ${formatPercent(p)}`, `Valor esperado: ${ev >= 0 ? '+' : '−'}${formatNumber(Math.abs(ev))}`];
    }
    case 'die': {
      const roll = openRoll(dice);
      if (!roll) return ['Dado'];
      return [`Relanzar este dado`, `Convierte: ${formatPercent(rerollChance(roll.target, roll.dice, hit.die))}`, `Cargas: ${dice.rerolls.charges}`];
    }
    case 'accept':
      return ['Aceptar la tirada', 'No gasta carga'];
    case 'roll':
      return [`Tirar ${formatNumber(bet)} a ${CONFIG.dice.targets[dice.target].name.toLowerCase()}`, 'Espacio'];
  }
}
