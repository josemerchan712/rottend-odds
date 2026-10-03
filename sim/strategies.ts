import { betAmount, currentMaxBet, isBetTypeUnlocked } from '../src/game/betting';
import { CONFIG, UPGRADE_IDS, type BetType, type UpgradeId } from '../src/game/config';
import { helperLuckBonus } from '../src/game/helper';
import { betWinChance } from '../src/game/luck';
import type { BetChoice, GameState } from '../src/game/state';
import { isUnlocked, nextCost } from '../src/game/upgrades';
import type { Strategy } from './engine';

const NEGRO: BetChoice = { type: 'color', color: 'negro' };
const ALL_FRACTIONS = CONFIG.bet.quickFractions.map((_, i) => i);
const TODO = CONFIG.bet.quickFractions.length - 1;

const noSpecialBets = (id: UpgradeId) => id !== 'dozenBet' && id !== 'numberBet';

/**
 * Jugador listo: el techo solo se sube cuando limita, es decir, cuando Kelly ya le dejaría
 * apostar al menos la mitad del techo. Antes, subirlo solo gasta saldo que hace falta para apostar.
 */
function ceilingIsBinding(state: GameState): boolean {
  const p = betWinChance('color', state.upgrades.luck, 0.5);
  return state.balance * Math.max(2 * p - 1, 0) >= currentMaxBet(state) * 0.5;
}

const smartBuys = (specialBets: boolean) => (id: UpgradeId, state: GameState) => {
  if (!specialBets && !noSpecialBets(id)) return false;
  return id !== 'maxBet' || ceilingIsBinding(state);
};

/**
 * Valor esperado de la parte de ruleta (sin contar el Cero Dorado) de apostar con un botón.
 * Las estrategias "listas" deciden con esto: el jackpot es demasiado raro para planificar con él.
 */
function rouletteEv(state: GameState, type: BetType, fraction: number, bonus = 0): number {
  const ceiling = currentMaxBet(state);
  const bet = betAmount(state.balance, fraction, ceiling);
  if (bet <= 0) return -Infinity;
  const p = betWinChance(type, state.upgrades.luck, bet / ceiling, bonus);
  return bet * (p * CONFIG.betTypes[type].payout - (1 - p));
}

/**
 * ¿Respeta la apuesta el criterio de Kelly? Con pago 1:1 la fracción del saldo que maximiza
 * el crecimiento es 2p - 1; apostar más lleva a la ruina aunque cada apuesta tenga valor positivo.
 */
function withinKelly(state: GameState, type: BetType, fraction: number, bonus = 0): boolean {
  const ceiling = currentMaxBet(state);
  const bet = betAmount(state.balance, fraction, ceiling);
  if (bet <= 0) return false;
  const p = betWinChance(type, state.upgrades.luck, bet / ceiling, bonus);
  const payout = CONFIG.betTypes[type].payout;
  const kelly = (p * (payout + 1) - 1) / payout;
  return bet <= state.balance * kelly;
}

/**
 * Botón con mayor valor esperado entre los que respetan Kelly; null si ninguno tiene valor
 * positivo (entonces el jugador trabaja en vez de apostar).
 */
function bestFraction(state: GameState, type: BetType = 'color'): number | null {
  let best: number | null = null;
  let bestEv = 0;
  for (const i of ALL_FRACTIONS) {
    const f = CONFIG.bet.quickFractions[i];
    if (!withinKelly(state, type, f)) continue;
    const ev = rouletteEv(state, type, f);
    if (ev > bestEv) {
      best = i;
      bestEv = ev;
    }
  }
  return best;
}

/** Perfil del ayudante con mayor valor esperado que respete Kelly (si ninguno, el más prudente). */
function bestHelperProfile(state: GameState): number {
  const bonus = helperLuckBonus(state.upgrades.helperLuck);
  let best = 0;
  let bestEv = -Infinity;
  CONFIG.helper.profiles.forEach((p, i) => {
    if (i > state.upgrades.helperProfile || !withinKelly(state, 'color', p.fraction, bonus)) return;
    const ev = rouletteEv(state, 'color', p.fraction, bonus);
    if (ev > bestEv) {
      best = i;
      bestEv = ev;
    }
  });
  return best;
}

/** Guarda para una apuesta con el botón óptimo (nada si aún no compensa apostar). */
function smartReserve(state: GameState): number {
  const i = bestFraction(state);
  return i === null ? 0 : Math.floor(currentMaxBet(state) * CONFIG.bet.quickFractions[i]);
}

/** Coste de la mejora más barata que aún le queda por comprar. */
function nextTarget(state: GameState, buys: (id: UpgradeId) => boolean): number | null {
  let min: number | null = null;
  for (const id of UPGRADE_IDS) {
    if (!buys(id) || !isUnlocked(state, id)) continue;
    const cost = nextCost(state, id);
    if (cost !== null && (min === null || cost < min)) min = cost;
  }
  return min;
}

export const STRATEGIES: Strategy[] = [
  {
    id: 'a',
    label: '(a) Un color, apuesta mínima (1%)',
    chooseBet: () => ({ choice: NEGRO, fractionIndex: 0 }),
    helperProfile: () => 0,
    buys: noSpecialBets,
    reserve: () => 0,
  },
  {
    id: 'b',
    label: '(b) Siempre el techo (TODO)',
    chooseBet: () => ({ choice: NEGRO, fractionIndex: TODO }),
    helperProfile: (s) => s.upgrades.helperProfile,
    buys: noSpecialBets,
    reserve: (s) => currentMaxBet(s),
  },
  {
    id: 'c',
    label: '(c) Fracción óptima según la suerte',
    chooseBet: (s) => {
      const i = bestFraction(s);
      return i === null ? null : { choice: NEGRO, fractionIndex: i };
    },
    helperProfile: bestHelperProfile,
    buys: smartBuys(false),
    reserve: smartReserve,
  },
  {
    id: 'd',
    label: '(d) Óptima + docena/número para alcanzar compras',
    chooseBet: (s) => {
      const i = bestFraction(s);
      if (i === null) return null;
      const target = nextTarget(s, () => true);
      // Lejos de la siguiente compra, busca el golpe con número; cerca, docena; con margen, color.
      if (target !== null && isBetTypeUnlocked(s, 'number') && s.balance < target * 0.3) {
        return { choice: { type: 'number', number: 17 }, fractionIndex: i };
      }
      if (target !== null && isBetTypeUnlocked(s, 'dozen') && s.balance < target) {
        return { choice: { type: 'dozen', dozen: 2 }, fractionIndex: i };
      }
      return { choice: NEGRO, fractionIndex: i };
    },
    helperProfile: bestHelperProfile,
    buys: smartBuys(true),
    reserve: smartReserve,
  },
];
