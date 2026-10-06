import { CARD_UPGRADE_IDS, CONFIG, DICE_UPGRADE_IDS, HEIRLOOM_IDS, SLOT_UPGRADE_IDS, UPGRADE_IDS } from './config';
import { payDebt } from './debt';
import { createInitialState, type GameState, type TableId } from './state';

/**
 * Partidas sembradas (sesión 10).
 *
 * - `seedState(table)`: las mesas anteriores a `table` saldadas y con todo comprado, y moneda de prueba.
 *   La usan el modo desarrollador (?dev=mesaN, solo en `npm run dev`) y, como base, el modo demo.
 * - Modo demo público (también en producción): un hueco de guardado propio con las cinco mesas abiertas y
 *   saldos y mejoras para ver cada mecánica. Nunca toca la partida normal, no se sincroniza ni entra en el
 *   ranking, y su "final visto" es solo suyo.
 */

/** Clave del hueco de guardado del modo demo (aparte de la partida normal y de los del desarrollador). */
export const DEMO_SAVE_KEY = `${CONFIG.tech.saveKey}-demo`;

export function seedState(table: 2 | 3 | 4 | 5): GameState {
  const dev = createInitialState();
  for (const id of UPGRADE_IDS) dev.upgrades[id] = CONFIG.upgrades[id].maxLevel;
  dev.helper.profile = 1;
  dev.balance = CONFIG.debt.amount + 50_000;
  payDebt(dev);
  dev.playTime = 8 * 60;
  dev.slots.balance = 2_000;
  if (table >= 3) {
    for (const id of SLOT_UPGRADE_IDS) dev.slots.upgrades[id] = CONFIG.slots.upgrades[id].maxLevel;
    dev.slots.helper.profile = 1;
    dev.slots.debtPaid = true;
    dev.slots.visited = true;
    dev.slots.playTime = 12 * 60;
    dev.slots.balance = 50_000;
    dev.playTime = 20 * 60;
    dev.dice.balance = 3_000;
  }
  if (table >= 4) {
    for (const id of DICE_UPGRADE_IDS) dev.dice.upgrades[id] = CONFIG.dice.upgrades[id].maxLevel;
    dev.dice.helper.profile = 1;
    dev.dice.debtPaid = true;
    dev.dice.visited = true;
    dev.dice.playTime = 14 * 60;
    dev.dice.balance = 60_000;
    dev.playTime = 34 * 60;
    dev.cards.balance = 4_000;
  }
  if (table === 5) {
    for (const id of CARD_UPGRADE_IDS) dev.cards.upgrades[id] = CONFIG.cards.upgrades[id].maxLevel;
    dev.cards.helper.profile = 1;
    dev.cards.debtPaid = true;
    dev.cards.visited = true;
    dev.cards.playTime = 12 * 60;
    dev.cards.balance = 80_000;
    dev.playTime = 46 * 60;
    dev.coin.balance = 8_000; // llega para desbloquear la moneda cargada
    // Moneda de las otras mesas para probar el cajón Herencias (cuestan cientos de millones).
    dev.balance = dev.slots.balance = dev.dice.balance = dev.cards.balance = 1e9;
  }
  return dev;
}

/** Mesa de destino de un enlace del modo demo: ?demo=mesa1 … ?demo=mesa5, o ?demo=final. */
export type DemoTarget = { kind: 'table'; table: TableId } | { kind: 'final' };

/** Lee el parámetro ?demo= de la dirección; null si no hay o no es válido (y entonces no hace nada). */
export function parseDemoParam(search: string): DemoTarget | null {
  const value = new URLSearchParams(search).get('demo');
  if (!value) return null;
  if (value === 'final') return { kind: 'final' };
  const match = /^mesa([1-5])$/.exec(value);
  return match ? { kind: 'table', table: Number(match[1]) as TableId } : null;
}

/**
 * La partida del modo demo: las cinco mesas abiertas (de la 1 a la 4 saldadas, con todo comprado y sus
 * ayudantes) y la 5 a medias con lo necesario para ver cada mecánica: suerte, techo, temple, moneda cargada,
 * diablillo y las cuatro herencias a nivel 2. Saldos en todas las mesas para apostar enseguida.
 */
export function demoState(table: TableId = 1): GameState {
  const demo = seedState(5);
  demo.balance = 2_000_000;
  demo.slots.balance = 1_500_000;
  demo.dice.balance = 1_500_000;
  demo.cards.balance = 1_500_000;
  const coin = demo.coin;
  coin.visited = true;
  coin.balance = 250_000;
  coin.upgrades.luck = 12;
  coin.upgrades.maxBet = 6;
  coin.upgrades.temple = 2;
  coin.upgrades.loaded = CONFIG.coin.upgrades.loaded.maxLevel;
  coin.upgrades.imp = 1;
  coin.upgrades.helperSpeed = 4;
  coin.upgrades.helperProfile = 1;
  coin.helper.profile = 1;
  for (const id of HEIRLOOM_IDS) coin.heirlooms[id] = 2;
  demo.activeTable = table;
  return demo;
}

/**
 * Partida con la que se entra en el modo demo: la guardada en su hueco (si la hay) o una nueva de
 * demostración; un enlace ?demo=mesaN la abre en esa mesa.
 */
export function demoStartState(saved: GameState | null, target: DemoTarget | null): GameState {
  const state = saved ?? demoState(target?.kind === 'table' ? target.table : 1);
  if (target?.kind === 'table') state.activeTable = target.table;
  return state;
}

/** La partida del final de demostración (?demo=final): la del demo con la deuda del Dueño ya pagada. */
export function demoFinalState(): GameState {
  const demo = demoState(5);
  demo.coin.debtPaid = true;
  demo.playTime = 58 * 60 + 40;
  demo.stats.paidAt = [8 * 60 + 40, 20 * 60 + 5, 33 * 60 + 50, 46 * 60 + 2, 58 * 60 + 40];
  demo.stats.bets = 4200;
  demo.stats.wins = 2100;
  demo.stats.jackpots = 3;
  demo.stats.zeros = 4;
  demo.stats.won = 24_500_000;
  demo.slots.stats.spins = 3100;
  demo.slots.stats.wins = 1500;
  demo.slots.stats.won = 18_200_000;
  demo.dice.stats.rolls = 2600;
  demo.dice.stats.wins = 1200;
  demo.dice.stats.won = 21_000_000;
  demo.cards.stats.hands = 2300;
  demo.cards.stats.wins = 1150;
  demo.cards.stats.won = 19_800_000;
  demo.coin.stats.chains = 640;
  demo.coin.stats.cashouts = 330;
  demo.coin.stats.bestChain = 4;
  demo.coin.stats.won = 14_300_000;
  return demo;
}
