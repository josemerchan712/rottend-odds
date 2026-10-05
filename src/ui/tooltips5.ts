import { riskLevel } from '../game/betting';
import { chainChance, chainValue, coinCeiling, flipChance, selectedCoinChip } from '../game/coin/game';
import type { GameState } from '../game/state';
import { formatNumber, formatPercent } from '../util/format';
import type { CoinTarget } from './coinScene';

/** Líneas del tooltip de la mesa 5 (la primera es el título). */
export function coinTooltip(state: GameState, hit: CoinTarget): string[] {
  const coin = state.coin;
  const ceiling = coinCeiling(coin);
  const chip = selectedCoinChip(coin);
  const chain = coin.chain;
  switch (hit.kind) {
    case 'chip': {
      const c = hit.chip;
      if (!c.affordable) return [`${formatNumber(c.amount)} de oro`, 'No te llega'];
      const p = flipChance(coin.upgrades.luck, coin.upgrades.temple, 0, c.amount / ceiling);
      return [`${c.all ? 'TODO · ' : ''}${formatNumber(c.amount)} de oro`, `Primera cara: ${formatPercent(p)}`, `Riesgo ${riskLevel(c.amount, ceiling)}`];
    }
    case 'bet': {
      if (!chip.affordable) return ['Apostar', 'No te llega para la ficha elegida'];
      const p = flipChance(coin.upgrades.luck, coin.upgrades.temple, 0, chip.amount / ceiling);
      return [`Apostar ${formatNumber(chip.amount)}`, `Cara: ${formatPercent(p)} · dobla`, 'Espacio'];
    }
    case 'more': {
      const now = chainValue(chain!.stake, chain!.wins);
      return [`Seguir: ${formatNumber(now)} → ${formatNumber(chainValue(chain!.stake, chain!.wins + 1))}`, `Cara: ${formatPercent(chainChance(coin, chain!))} · cada cara cansa la suerte`, 'Espacio'];
    }
    case 'stop':
      return [`Retirarse con ${formatNumber(chainValue(chain!.stake, chain!.wins))}`, `${chain!.wins} caras seguidas`, 'R'];
    case 'second':
      return ['Segunda oportunidad', `Repite el lanzamiento · quedan ${coin.seconds.charges}`, 'S'];
    case 'accept':
      return ['Aceptar la cruz', chain && chain.wins > 0 ? `Pierdes ${formatNumber(chainValue(chain.stake, chain.wins))}` : 'Pierdes la apuesta', 'Espacio'];
  }
}
