import { riskLevel } from '../game/betting';
import { CONFIG, type CoinKind } from '../game/config';
import { CHAIN_CAP, chainChance, coinCeiling, flipChance, heirloomCharges, loadedUnlocked, selectedCoinChip, stepMultiplier } from '../game/coin/game';
import type { GameState } from '../game/state';
import { formatFactor, formatNumber, formatPercent } from '../util/format';
import type { CoinTarget } from './coinScene';

const TOOL_HELP = {
  zero: 'Tras una cruz, salva la cadena y te devuelve la cuarta parte de lo acumulado',
  hold: 'Congela la caída: el siguiente paso acierta como el anterior',
  reroll: 'Tras una cruz (con alguna cara), repite el lanzamiento, más difícil',
  mark: 'Enseña el resultado del próximo lanzamiento antes de seguir',
} as const;

const times = formatFactor;

/**
 * Líneas del tooltip de la mesa 5 (la primera es el título). Sesión 8: probabilidad real del siguiente
 * paso, su factor y lo acumulado que quedaría (sin porcentajes de saldo).
 */
export function coinTooltip(state: GameState, hit: CoinTarget): string[] {
  const coin = state.coin;
  const ceiling = coinCeiling(coin);
  const chip = selectedCoinChip(coin);
  const chain = coin.chain;
  const open = chain !== null && chain.status !== 'fin';
  /** El siguiente paso: el primero de una cadena nueva o el que toca en la abierta. */
  const step = open && chain ? chain.wins + 1 : 1;
  const base = open && chain ? chain.value : chip.amount;
  const chance = (kind: CoinKind) =>
    open && chain ? chainChance(coin, chain, 0, kind) : flipChance(coin.upgrades.luck, coin.upgrades.temple, 0, chip.amount / ceiling, 0, kind);
  const after = (kind: CoinKind) => Math.min(base * stepMultiplier(step, kind), CHAIN_CAP);
  switch (hit.kind) {
    case 'chip': {
      const c = hit.chip;
      if (!c.affordable) return [`${formatNumber(c.amount)} de oro`, 'No te llega'];
      const p = flipChance(coin.upgrades.luck, coin.upgrades.temple, 0, c.amount / ceiling);
      return [`${c.all ? 'TODO · ' : ''}${formatNumber(c.amount)} de oro`, `Primer paso: ${formatPercent(p)} · ${times(stepMultiplier(1))} → ${formatNumber(c.amount * stepMultiplier(1))}`, `Riesgo ${riskLevel(c.amount, ceiling)}`];
    }
    case 'coin': {
      if (hit.coin === 'cargada' && !loadedUnlocked(coin)) return ['Moneda cargada', 'Se desbloquea en el cajón Mesa', 'Paga ×1,5 el factor, acierta menos'];
      return [
        `Moneda ${hit.coin} · paso ${step}: ${times(stepMultiplier(step, hit.coin))}`,
        `Cara: ${formatPercent(chance(hit.coin))} · ${formatNumber(base)} → ${formatNumber(after(hit.coin))}`,
        hit.coin === 'cargada' ? 'Acierta 2/3; la suerte la mejora más · Q' : 'La de siempre · Q',
      ];
    }
    case 'tool': {
      const def = CONFIG.coin.heirlooms[hit.tool];
      const level = heirloomCharges(coin, hit.tool);
      if (level === 0) return [def.name, TOOL_HELP[hit.tool], 'Se compra en el cajón Herencias (E)'];
      return [`${def.name} [${def.key}]`, TOOL_HELP[hit.tool], `Cargas en esta cadena: ${open && chain ? chain.charges[hit.tool] : level} de ${level}`];
    }
    case 'bet': {
      if (!chip.affordable) return ['Apostar', 'No te llega para la ficha elegida'];
      return [
        `Apostar ${formatNumber(chip.amount)} (moneda ${coin.coinChoice})`,
        `Cara: ${formatPercent(chance(coin.coinChoice))} · ${times(stepMultiplier(1, coin.coinChoice))} → ${formatNumber(after(coin.coinChoice))}`,
        'Espacio',
      ];
    }
    case 'more': {
      const kind = coin.coinChoice;
      return [
        `Seguir: siguiente ${times(stepMultiplier(step, kind))} → ${formatNumber(after(kind))}`,
        `Cara: ${formatPercent(chance(kind))} (${kind}) · cada paso acierta menos`,
        'Espacio',
      ];
    }
    case 'stop':
      return [`Retirarse: cobras ${formatNumber(chain?.value ?? 0)}`, `${chain?.wins ?? 0} caras seguidas`, 'R'];
    case 'accept':
      return ['Aceptar la cruz', chain && chain.wins > 0 ? `Pierdes ${formatNumber(chain.value)}` : 'Pierdes la apuesta', 'Espacio'];
  }
}
