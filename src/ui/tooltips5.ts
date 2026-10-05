import { riskLevel } from '../game/betting';
import { CONFIG, type CoinKind } from '../game/config';
import { chainChance, coinCeiling, coinMultiplier, flipChance, heirloomCharges, loadedUnlocked, selectedCoinChip } from '../game/coin/game';
import type { GameState } from '../game/state';
import { formatNumber, formatPercent } from '../util/format';
import type { CoinTarget } from './coinScene';

const TOOL_HELP = {
  zero: 'Tras una cruz, salva la cadena y te devuelve la cuarta parte de lo acumulado',
  hold: 'El siguiente acierto no cansa la suerte',
  reroll: 'Tras una cruz (con alguna cara), repite el lanzamiento, más difícil',
  mark: 'Enseña el resultado del próximo lanzamiento antes de seguir',
} as const;

/** Líneas del tooltip de la mesa 5 (la primera es el título). */
export function coinTooltip(state: GameState, hit: CoinTarget): string[] {
  const coin = state.coin;
  const ceiling = coinCeiling(coin);
  const chip = selectedCoinChip(coin);
  const chain = coin.chain;
  const open = chain !== null && chain.status !== 'fin';
  /** Probabilidad del próximo lanzamiento con esa moneda (en la cadena abierta, o el primero). */
  const chance = (kind: CoinKind) =>
    open && chain ? chainChance(coin, chain, 0, kind) : flipChance(coin.upgrades.luck, coin.upgrades.temple, 0, chip.amount / ceiling, 0, kind);
  switch (hit.kind) {
    case 'chip': {
      const c = hit.chip;
      if (!c.affordable) return [`${formatNumber(c.amount)} de oro`, 'No te llega'];
      return [`${c.all ? 'TODO · ' : ''}${formatNumber(c.amount)} de oro`, `Primera cara (justa): ${formatPercent(flipChance(coin.upgrades.luck, coin.upgrades.temple, 0, c.amount / ceiling))}`, `Riesgo ${riskLevel(c.amount, ceiling)}`];
    }
    case 'coin': {
      if (hit.coin === 'cargada' && !loadedUnlocked(coin)) return ['Moneda cargada', 'Se desbloquea en el cajón Mesa', 'Paga ×3, acierta menos'];
      return [`Moneda ${hit.coin} · paga ×${coinMultiplier(hit.coin)}`, `Cara: ${formatPercent(chance(hit.coin))}`, hit.coin === 'cargada' ? 'Más riesgo; la suerte la mejora más · Q' : 'La de siempre · Q'];
    }
    case 'tool': {
      const def = CONFIG.coin.heirlooms[hit.tool];
      const level = heirloomCharges(coin, hit.tool);
      if (level === 0) return [def.name, TOOL_HELP[hit.tool], 'Se compra en el cajón Herencias (E)'];
      return [`${def.name} [${def.key}]`, TOOL_HELP[hit.tool], `Cargas en esta cadena: ${open && chain ? chain.charges[hit.tool] : level} de ${level}`];
    }
    case 'bet': {
      if (!chip.affordable) return ['Apostar', 'No te llega para la ficha elegida'];
      return [`Apostar ${formatNumber(chip.amount)} (moneda ${coin.coinChoice})`, `Cara: ${formatPercent(chance(coin.coinChoice))} · ×${coinMultiplier(coin.coinChoice)}`, 'Espacio'];
    }
    case 'more': {
      const now = chain!.value;
      return [
        `Seguir: ${formatNumber(now)} → ${formatNumber(now * coinMultiplier(coin.coinChoice))}`,
        `Cara: ${formatPercent(chance(coin.coinChoice))} (${coin.coinChoice}) · cada cara cansa la suerte`,
        'Espacio',
      ];
    }
    case 'stop':
      return [`Retirarse con ${formatNumber(chain?.value ?? 0)}`, `${chain?.wins ?? 0} caras seguidas`, 'R'];
    case 'accept':
      return ['Aceptar la cruz', chain && chain.wins > 0 ? `Pierdes ${formatNumber(chain.value)}` : 'Pierdes la apuesta', 'Espacio'];
  }
}
