import { currentMaxBet, isBetTypeUnlocked, stateChips } from '../src/game/betting';
import { recommendedHelperProfile } from '../src/game/helper';
import { CONFIG, type BetType, type UpgradeId } from '../src/game/config';
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
function logGrowth(state: GameState, type: BetType, bet: number): number {
  const ceiling = currentMaxBet(state);
  if (bet <= 0 || bet >= state.balance) return -Infinity;
  const p = betWinChance(type, state.upgrades.luck, bet / ceiling);
  const x = bet / state.balance;
  return p * Math.log1p(CONFIG.betTypes[type].payout * x) + (1 - p) * Math.log1p(-x);
}

/** Botón de color con mayor crecimiento; null si ninguno hace crecer el saldo (entonces trabaja). */
function bestFraction(state: GameState): number | null {
  return bestButton(state, 'color')?.index ?? null;
}

/** Ficha del selector (con su cantidad redondeada real) de mayor crecimiento. */
function bestButton(state: GameState, type: BetType): { index: number; amount: number; growth: number } | null {
  let best: { index: number; amount: number; growth: number } | null = null;
  for (const chip of stateChips(state)) {
    if (!chip.affordable) continue;
    const growth = logGrowth(state, type, chip.amount);
    if (growth > (best?.growth ?? 0)) best = { index: chip.index, amount: chip.amount, growth };
  }
  return best;
}

/** Mejor combinación de tipo de apuesta y botón entre los desbloqueados. */
function bestBet(state: GameState): { choice: BetChoice; fractionIndex: number } | null {
  let best: { type: BetType; index: number; amount: number; growth: number } | null = null;
  for (const type of BET_TYPES) {
    if (!isBetTypeUnlocked(state, type)) continue;
    const button = bestButton(state, type);
    if (button && button.growth > (best?.growth ?? 0)) best = { type, ...button };
  }
  if (!best) return null;
  return { choice: CHOICES[best.type], fractionIndex: best.index };
}

/** El perfil que recomienda el juego (más crecimiento esperado del saldo; ver helperPolicy). */
function bestHelperProfile(state: GameState): number {
  return recommendedHelperProfile(state);
}

/** Guarda para una apuesta con el botón óptimo (nada si aún no compensa apostar). */
function smartReserve(state: GameState): number {
  return bestButton(state, 'color')?.amount ?? 0;
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

/** Solo con ayudante: juega como (c) hasta comprar el Crupier y desde entonces solo compra mejoras. */
export const HELPER_ONLY: Strategy = {
  ...STRATEGIES[2],
  id: 'h',
  label: '(h) Solo ayudante tras comprarlo (como c)',
  priority: ['crupier'],
  idleAfterHelper: true,
};

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
