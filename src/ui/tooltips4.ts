import { riskLevel } from '../game/betting';
import { cardsCeiling, cardsExpectedValue, cardsWinChance, pushChanceFor, selectedCardsChip } from '../game/cards/game';
import { handTotal } from '../game/cards/rules';
import type { GameState } from '../game/state';
import { formatNumber, formatPercent } from '../util/format';
import type { CardsTarget } from './cardsScene';

/** Líneas del tooltip de la mesa 4 (la primera es el título). */
export function cardsTooltip(state: GameState, hit: CardsTarget): string[] {
  const cards = state.cards;
  const ceiling = cardsCeiling(cards);
  const chip = selectedCardsChip(cards);
  const bet = chip.affordable ? chip.amount : 0;
  switch (hit.kind) {
    case 'chip': {
      const c = hit.chip;
      if (!c.affordable) return [`${formatNumber(c.amount)} fichas`, 'No te llega'];
      const p = cardsWinChance(cards.upgrades.luck, c.amount / ceiling);
      return [`${c.all ? 'TODO · ' : ''}${formatNumber(c.amount)} fichas`, `Gana: ${formatPercent(p)} · empate ${formatPercent(pushChanceFor(p))}`, `Riesgo ${riskLevel(c.amount, ceiling)}`];
    }
    case 'deal': {
      if (bet <= 0) return ['Repartir', 'No te llega para la ficha elegida'];
      const ev = cardsExpectedValue(bet, ceiling, cards.upgrades.luck);
      return [`Repartir ${formatNumber(bet)}`, `Valor esperado: ${ev >= 0 ? '+' : '−'}${formatNumber(Math.abs(ev))}`, 'Espacio'];
    }
    case 'hit':
      return ['Pedir carta', `Tienes ${handTotal(cards.hand!.player).total}`, 'P'];
    case 'stand':
      return ['Plantarse', 'La banca pide hasta 17', 'S'];
    case 'accept':
      return ['Aceptar', 'Te has pasado: pierdes la mano'];
    case 'discard':
      return ['Descartar esta carta', `Recibes otra (mejor elegida) · cargas: ${cards.discards.charges}`, 'D'];
  }
}
