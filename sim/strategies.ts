import { betAmount, currentMaxBet, isBetTypeUnlocked } from '../src/game/betting';
import { CONFIG, type BetType, type UpgradeId } from '../src/game/config';
import { helperLuckBonus } from '../src/game/helper';
import { betWinChance } from '../src/game/luck';
import type { BetChoice, GameState } from '../src/game/state';
import type { Strategy } from './engine';

const NEGRO: BetChoice = { type: 'color', color: 'negro' };
const BET_TYPES = Object.keys(CONFIG.betTypes) as BetType[];
const CHOICES: Record<BetType, BetChoice> = {
  color: NEGRO,
  dozen: { type: 'dozen', dozen: 2 },
  number: { type: 'number', number: 17 },
};
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
 * Crecimiento logarítmico esperado del saldo con una apuesta: p·ln(1 + k·b/B) + (1-p)·ln(1 - b/B).
 * Maximizarlo es la forma de llegar antes a una meta (criterio de Kelly): castiga la varianza
 * y nunca apuesta todo el saldo.
 */
function logGrowth(state: GameState, type: BetType, fraction: number): number {
  const ceiling = currentMaxBet(state);
  const bet = betAmount(state.balance, fraction, ceiling);
  if (bet <= 0 || bet >= state.balance) return -Infinity;
  const p = betWinChance(type, state.upgrades.luck, bet / ceiling);
  const x = bet / state.balance;
  return p * Math.log1p(CONFIG.betTypes[type].payout * x) + (1 - p) * Math.log1p(-x);
}

/** Botón de color con mayor crecimiento; null si ninguno hace crecer el saldo (entonces trabaja). */
function bestFraction(state: GameState): number | null {
  return bestButton(state, 'color')?.index ?? null;
}

function bestButton(state: GameState, type: BetType): { index: number; growth: number } | null {
  let best: { index: number; growth: number } | null = null;
  for (const i of ALL_FRACTIONS) {
    const growth = logGrowth(state, type, CONFIG.bet.quickFractions[i]);
    if (growth > (best?.growth ?? 0)) best = { index: i, growth };
  }
  return best;
}

/** Mejor combinación de tipo de apuesta y botón entre los desbloqueados. */
function bestBet(state: GameState): { choice: BetChoice; fractionIndex: number } | null {
  let best: { type: BetType; index: number; growth: number } | null = null;
  for (const type of BET_TYPES) {
    if (!isBetTypeUnlocked(state, type)) continue;
    const button = bestButton(state, type);
    if (button && button.growth > (best?.growth ?? 0)) best = { type, ...button };
  }
  if (!best) return null;
  return { choice: CHOICES[best.type], fractionIndex: best.index };
}

/** Perfil del ayudante con mayor crecimiento logarítmico (si ninguno es positivo, el más prudente). */
function bestHelperProfile(state: GameState): number {
  const bonus = helperLuckBonus(state.upgrades.helperLuck);
  const ceiling = currentMaxBet(state);
  let best = 0;
  let bestGrowth = 0;
  CONFIG.helper.profiles.forEach((profile, i) => {
    if (i > state.upgrades.helperProfile) return;
    const bet = Math.min(Math.floor(ceiling * profile.fraction), Math.floor(state.balance * profile.maxBalanceFraction));
    if (bet < CONFIG.bet.minBet) return;
    const p = betWinChance('color', state.upgrades.luck, bet / ceiling, bonus);
    const x = bet / state.balance;
    const growth = p * Math.log1p(x) + (1 - p) * Math.log1p(-x);
    if (growth > bestGrowth) {
      best = i;
      bestGrowth = growth;
    }
  });
  return best;
}

/** Guarda para una apuesta con el botón óptimo (nada si aún no compensa apostar). */
function smartReserve(state: GameState): number {
  const i = bestFraction(state);
  return i === null ? 0 : Math.floor(currentMaxBet(state) * CONFIG.bet.quickFractions[i]);
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
    label: '(d) Óptima con color, docena o número',
    chooseBet: bestBet,
    helperProfile: bestHelperProfile,
    buys: smartBuys(true),
    reserve: smartReserve,
  },
];

/**
 * Estudio del ayudante: el jugador juega como (c), pero compra el Crupier (y el perfil que haga
 * falta) en cuanto puede y deja al ayudante con un perfil fijo.
 */
export const HELPER_STUDY: Strategy[] = CONFIG.helper.profiles.map((profile, index) => ({
  id: `h${index}`,
  label: `Ayudante ${profile.name.toLowerCase()} (${Math.round(profile.fraction * 100)}% del techo)`,
  chooseBet: (s: GameState) => {
    const i = bestFraction(s);
    return i === null ? null : { choice: NEGRO, fractionIndex: i };
  },
  helperProfile: () => index,
  buys: (id: UpgradeId, s: GameState) =>
    id === 'helperProfile' ? s.upgrades.helperProfile < index : smartBuys(false)(id, s),
  reserve: smartReserve,
  priority: ['crupier', 'helperProfile'] as const,
}));
