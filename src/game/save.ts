import shared from '../../shared/config.json';
import { CARD_UPGRADE_IDS, CONFIG, DICE_TARGETS, DICE_UPGRADE_IDS, SLOT_UPGRADE_IDS, UPGRADE_IDS, COIN_UPGRADE_IDS } from './config';
import { createCardsState } from './cards/state';
import { chainValue } from './coin/game';
import { createCoinState } from './coin/state';
import { createDiceState } from './dice/state';
import { createSlotsState } from './slots/state';
import { createInitialState, type GameState } from './state';

/**
 * Súbelo cada vez que cambie la forma de GameState y añade su migración.
 * Vive en shared/config.json porque el servidor también lo comprueba.
 */
export const SAVE_VERSION: number = shared.saveVersion;

/** Lo mínimo de localStorage que necesitamos; así los tests pasan un objeto falso. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SaveFile {
  version: number;
  /** Marca de tiempo (ms) del guardado; servirá para el progreso offline. */
  savedAt: number;
  state: GameState;
}

type Json = Record<string, unknown>;

/** migrations[v] convierte un guardado de la versión v en uno de la v+1. */
const migrations: Record<number, (state: Json) => Json> = {
  // v1 solo tenía saldo y tiempo; el resto lo rellenan los valores por defecto.
  1: (state) => ({ balance: state.balance, playTime: state.playTime }),
  // v3 cambia la forma de las tiradas (choice en vez de color) y añade mejoras nuevas.
  2: (state) => ({ ...state, recentSpins: [] }),
  // v4: la basura pasa de contador a objetos con posición; el suelo se vuelve a sembrar.
  3: (state) => ({ ...state, work: { lastItem: (state.work as Json | undefined)?.lastItem ?? null } }),
  // v5: mesa 2 (tragaperras) y mesa activa. La mesa 2 empieza de cero; se abre si la deuda ya estaba pagada.
  4: (state) => ({ ...state, activeTable: 1, slots: createSlotsState() }),
  // v6: mesa 3 (dados). Empieza de cero.
  5: (state) => ({ ...state, dice: createDiceState() }),
  // v7: mesa 4 (blackjack). Empieza de cero.
  6: (state) => ({ ...state, cards: createCardsState() }),
  // v8: sin trastienda en las mesas 2 a 4. Se quitan su suelo y sus mejoras de trabajo, y se devuelve
  // lo que costaron en la moneda de cada mesa.
  7: (state) => {
    const out: Json = { ...state };
    for (const [table, ids] of Object.entries(REMOVED_WORK_UPGRADES)) {
      const t = out[table];
      if (!isRecord(t)) continue;
      const copy: Json = { ...t };
      const ups = isRecord(copy.upgrades) ? { ...copy.upgrades } : {};
      let refund = 0;
      for (const [id, cost] of Object.entries(ids)) {
        const level = Math.max(0, Math.min(Math.floor(Number(ups[id]) || 0), cost.maxLevel));
        for (let n = 0; n < level; n++) refund += Math.round(cost.baseCost * cost.growth ** n);
        delete ups[id];
      }
      copy.upgrades = ups;
      delete copy.work;
      copy.balance = (Number(copy.balance) || 0) + refund;
      out[table] = copy;
    }
    return out;
  },
  // v9: mesa 5 (doble o nada). Empieza de cero.
  8: (state) => ({ ...state, coin: createCoinState() }),
};

/** Mejoras de trabajo que existían en las mesas 2 a 4 hasta el guardado v7, con sus costes de entonces. */
const REMOVED_WORK_UPGRADES: Record<string, Record<string, { baseCost: number; growth: number; maxLevel: number }>> = {
  slots: {
    rag: { baseCost: 80, growth: 1, maxLevel: 1 },
    toolbox: { baseCost: 60, growth: 2.25, maxLevel: 4 },
    apprentice: { baseCost: 300, growth: 2, maxLevel: 5 },
  },
  dice: {
    tray: { baseCost: 100, growth: 1, maxLevel: 1 },
    cart: { baseCost: 80, growth: 2.25, maxLevel: 4 },
    busboy: { baseCost: 400, growth: 2, maxLevel: 5 },
  },
  cards: {
    sleeve: { baseCost: 120, growth: 1, maxLevel: 1 },
    satchel: { baseCost: 90, growth: 2.25, maxLevel: 4 },
    dealer: { baseCost: 450, growth: 2, maxLevel: 5 },
  },
};

export function serialize(state: GameState, now: number): string {
  const file: SaveFile = { version: SAVE_VERSION, savedAt: now, state };
  return JSON.stringify(file);
}

export function deserialize(raw: string): SaveFile | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.version !== 'number' || !isRecord(parsed.state)) {
    return null;
  }
  let version = parsed.version;
  if (version > SAVE_VERSION || version < 1) return null;

  let state = parsed.state;
  while (version < SAVE_VERSION) {
    const migrate = migrations[version];
    if (!migrate) return null;
    state = migrate(state);
    version++;
  }

  state = settleCoinChains(state);
  const merged = mergeDefaults(createInitialState() as unknown as Json, state) as unknown as GameState;
  const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : 0;
  return { version: SAVE_VERSION, savedAt, state: sanitize(merged) };
}

export function saveGame(storage: KeyValueStorage, key: string, state: GameState, now: number): boolean {
  try {
    storage.setItem(key, serialize(state, now));
    return true;
  } catch {
    return false;
  }
}

/** Devuelve la partida guardada o null si no hay o está corrupta. */
export function loadGame(storage: KeyValueStorage, key: string): SaveFile | null {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  return raw === null ? null : deserialize(raw);
}

export function clearSave(storage: KeyValueStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Almacenamiento bloqueado: no hay nada que borrar.
  }
}

/**
 * Copia de `saved` lo que tenga el mismo tipo que en `defaults`, recursivamente.
 * Lo que falte o tenga un tipo incorrecto se queda con el valor por defecto.
 * Los campos que son null por defecto (lastItem, hold) aceptan string o número.
 */
function mergeDefaults(defaults: Json, saved: Json): Json {
  const out: Json = {};
  for (const [key, def] of Object.entries(defaults)) {
    const value = saved[key];
    if (isRecord(def)) out[key] = isRecord(value) ? mergeDefaults(def, value) : def;
    else if (Array.isArray(def)) out[key] = Array.isArray(value) ? value : def;
    else if (def === null) out[key] = typeof value === 'string' || typeof value === 'number' ? value : null;
    else out[key] = typeof value === typeof def ? value : def;
  }
  return out;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function sanitize(state: GameState): GameState {
  state.balance = nonNegative(state.balance);
  state.playTime = nonNegative(state.playTime);
  for (const id of UPGRADE_IDS) {
    state.upgrades[id] = Math.min(Math.floor(nonNegative(state.upgrades[id])), CONFIG.upgrades[id].maxLevel);
  }
  state.betFractionIndex = clampIndex(state.betFractionIndex, CONFIG.bet.quickFractions.length);
  state.helper.timer = nonNegative(state.helper.timer);
  state.helper.lockout = Math.min(nonNegative(state.helper.lockout), CONFIG.helper.allInLossLockout);
  state.helper.profile = Math.min(clampIndex(state.helper.profile, CONFIG.helper.profiles.length), state.upgrades.helperProfile);
  const kinds = new Set(CONFIG.work.items.map((i) => i.id));
  state.work.items = state.work.items
    .filter(
      (i) =>
        isRecord(i) &&
        Number.isInteger(i.id) &&
        kinds.has(i.kind as string) &&
        Number.isFinite(i.x) &&
        Number.isFinite(i.y),
    )
    .slice(0, CONFIG.work.maxItems);
  state.work.spawnTimer = nonNegative(state.work.spawnTimer);
  state.work.nextId = Math.max(Math.floor(nonNegative(state.work.nextId)), ...state.work.items.map((i) => i.id + 1));
  state.work.cleaner.timer = nonNegative(state.work.cleaner.timer);
  if (!Number.isFinite(state.work.cleaner.x) || !Number.isFinite(state.work.cleaner.y)) {
    state.work.cleaner.x = CONFIG.work.cleaner.start.x;
    state.work.cleaner.y = CONFIG.work.cleaner.start.y;
  }
  state.recentSpins = state.recentSpins.filter(isRecord).slice(0, CONFIG.tech.recentSpins) as GameState['recentSpins'];
  sanitizeSlots(state);
  return state;
}

function isReels(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((s) => Number.isInteger(s) && s >= 0 && s < CONFIG.slots.symbols.length)
  );
}

/** Mesa 2: lo mismo que la mesa 1, y la mesa activa solo puede ser la 2 si la deuda de la 1 está pagada. */
function sanitizeSlots(state: GameState): void {
  const slots = state.slots;
  const S = CONFIG.slots;
  slots.balance = nonNegative(slots.balance);
  slots.playTime = nonNegative(slots.playTime);
  for (const id of SLOT_UPGRADE_IDS) {
    slots.upgrades[id] = Math.min(Math.floor(nonNegative(slots.upgrades[id])), S.upgrades[id].maxLevel);
  }
  slots.betFractionIndex = clampIndex(slots.betFractionIndex, CONFIG.bet.quickFractions.length);
  if (!isReels(slots.reels)) slots.reels = [0, 1, 3];
  if (!isReels(slots.helper.reels)) slots.helper.reels = [4, 5, 0];
  slots.hold = Number.isInteger(slots.hold) && (slots.hold as number) >= 0 && (slots.hold as number) <= 2 ? slots.hold : null;
  slots.helper.timer = nonNegative(slots.helper.timer);
  slots.helper.profile = Math.min(clampIndex(slots.helper.profile, S.helper.profiles.length), slots.upgrades.helperProfile);
  slots.passiveCarry = Math.min(nonNegative(slots.passiveCarry), 1);
  slots.pot = Math.min(Math.max(nonNegative(slots.pot), S.jackpot.potSeed), S.debt.amount * S.jackpot.payoutCapDebtFraction);
  slots.recentSpins = slots.recentSpins.filter(isRecord).slice(0, CONFIG.tech.recentSpins) as typeof slots.recentSpins;
  sanitizeDice(state);
  sanitizeCards(state);
  sanitizeCoin(state);
  const paid3 = state.debtPaid && slots.debtPaid && state.dice.debtPaid;
  const paid = [true, state.debtPaid, state.debtPaid && slots.debtPaid, paid3, paid3 && state.cards.debtPaid];
  state.activeTable = [1, 2, 3, 4, 5].includes(state.activeTable) && paid[state.activeTable - 1] ? state.activeTable : 1;
}

function isCard(v: unknown): boolean {
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) < 52;
}

/** Mesa 4: lo mismo que las otras. Una mano a medias no sobrevive a cargar la partida (se descarta). */
function sanitizeCards(state: GameState): void {
  const cards = state.cards;
  const C = CONFIG.cards;
  cards.balance = nonNegative(cards.balance);
  cards.playTime = nonNegative(cards.playTime);
  for (const id of CARD_UPGRADE_IDS) {
    cards.upgrades[id] = Math.min(Math.floor(nonNegative(cards.upgrades[id])), C.upgrades[id].maxLevel);
  }
  cards.betFractionIndex = clampIndex(cards.betFractionIndex, CONFIG.bet.quickFractions.length);
  cards.helper.timer = nonNegative(cards.helper.timer);
  cards.helper.profile = Math.min(clampIndex(cards.helper.profile, C.helper.profiles.length), cards.upgrades.helperProfile);
  const maxCharges = C.discards.base + Math.floor(cards.upgrades.luck / C.discards.perLevels);
  cards.discards.charges = Math.min(Math.floor(nonNegative(cards.discards.charges)), maxCharges);
  cards.discards.timer = nonNegative(cards.discards.timer);
  cards.passiveCarry = Math.min(nonNegative(cards.passiveCarry), 1);
  cards.pot = Math.min(Math.max(nonNegative(cards.pot), C.jackpot.potSeed), C.debt.amount * C.jackpot.payoutCapDebtFraction);
  const hand = cards.hand as unknown;
  const validHand =
    isRecord(hand) &&
    Array.isArray(hand.player) &&
    Array.isArray(hand.dealer) &&
    (hand.player as unknown[]).every(isCard) &&
    (hand.dealer as unknown[]).every(isCard);
  // Una mano sin terminar se pierde al cargar (la apuesta ya estaba cobrada): se enseña como perdida.
  if (!validHand) cards.hand = null;
  else if (cards.hand!.status !== 'fin') cards.hand = null;
  cards.recentHands = cards.recentHands.filter(isRecord).slice(0, CONFIG.tech.recentSpins) as typeof cards.recentHands;
}

/**
 * Una cadena de la mesa 5 a medias no sobrevive a cargar: si estaba en una cara (decidir) se cobra lo
 * acumulado; si estaba en una cruz, se pierde. Se hace antes de fusionar con los valores por defecto
 * (que descartan los objetos donde el valor por defecto es null).
 */
function settleCoinChains(state: Json): Json {
  const coin = state.coin;
  if (!isRecord(coin)) return state;
  const copy: Json = { ...coin };
  let balance = Number(copy.balance) || 0;
  const helper = isRecord(copy.helper) ? { ...copy.helper } : null;
  for (const raw of [copy.chain, helper?.chain]) {
    if (!isRecord(raw) || raw.status !== 'decidir') continue;
    const stake = Math.min(Math.max(Number(raw.stake) || 0, 0), CONFIG.coin.debt.amount);
    const wins = Math.min(Math.max(Math.floor(Number(raw.wins) || 0), 0), CONFIG.coin.chain.maxWins);
    if (wins > 0) balance += chainValue(stake, wins);
  }
  copy.balance = balance;
  copy.chain = null;
  if (helper) {
    helper.chain = null;
    copy.helper = helper;
  }
  return { ...state, coin: copy };
}

/** Mesa 5: lo mismo que las otras. */
function sanitizeCoin(state: GameState): void {
  const coin = state.coin;
  const C = CONFIG.coin;
  coin.balance = nonNegative(coin.balance);
  coin.playTime = nonNegative(coin.playTime);
  for (const id of COIN_UPGRADE_IDS) {
    coin.upgrades[id] = Math.min(Math.floor(nonNegative(coin.upgrades[id])), C.upgrades[id].maxLevel);
  }
  coin.betFractionIndex = clampIndex(coin.betFractionIndex, CONFIG.bet.quickFractions.length);
  coin.helper.timer = nonNegative(coin.helper.timer);
  coin.helper.profile = Math.min(clampIndex(coin.helper.profile, C.helper.profiles.length), coin.upgrades.helperProfile);
  coin.helper.stopAt = Math.min(Math.max(Math.floor(Number(coin.helper.stopAt) || 1), 1), C.chain.maxWins);
  const maxCharges = C.seconds.base + Math.floor(coin.upgrades.luck / C.seconds.perLevels);
  coin.seconds.charges = Math.min(Math.floor(nonNegative(coin.seconds.charges)), maxCharges);
  coin.seconds.timer = nonNegative(coin.seconds.timer);
  coin.passiveCarry = Math.min(nonNegative(coin.passiveCarry), 1);
  coin.pot = Math.min(Math.max(nonNegative(coin.pot), C.jackpot.potSeed), C.debt.amount * C.jackpot.payoutCapDebtFraction);
  // Las cadenas a medias ya se liquidaron antes de fusionar (settleCoinChains); aquí ya no hay.
  coin.chain = null;
  coin.helper.chain = null;
  coin.recentChains = coin.recentChains.filter(isRecord).slice(0, CONFIG.tech.recentSpins) as typeof coin.recentChains;
}

function isDie(v: unknown): boolean {
  return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 6;
}

/** Mesa 3: lo mismo que las otras. */
function sanitizeDice(state: GameState): void {
  const dice = state.dice;
  const C = CONFIG.dice;
  dice.balance = nonNegative(dice.balance);
  dice.playTime = nonNegative(dice.playTime);
  for (const id of DICE_UPGRADE_IDS) {
    dice.upgrades[id] = Math.min(Math.floor(nonNegative(dice.upgrades[id])), C.upgrades[id].maxLevel);
  }
  dice.betFractionIndex = clampIndex(dice.betFractionIndex, CONFIG.bet.quickFractions.length);
  if (!DICE_TARGETS.includes(dice.target)) dice.target = 'par';
  if (!Array.isArray(dice.dice) || dice.dice.length !== 2 || !dice.dice.every(isDie)) dice.dice = [3, 4];
  dice.streak = Math.min(Math.floor(nonNegative(dice.streak)), C.jackpot.streak - 1);
  dice.helper.streak = Math.min(Math.floor(nonNegative(dice.helper.streak)), C.jackpot.streak - 1);
  dice.helper.timer = nonNegative(dice.helper.timer);
  dice.helper.profile = Math.min(clampIndex(dice.helper.profile, C.helper.profiles.length), dice.upgrades.helperProfile);
  const maxCharges = C.rerolls.base + Math.floor(dice.upgrades.luck / C.rerolls.perLevels);
  dice.rerolls.charges = Math.min(Math.floor(nonNegative(dice.rerolls.charges)), maxCharges);
  dice.rerolls.timer = nonNegative(dice.rerolls.timer);
  dice.passiveCarry = Math.min(nonNegative(dice.passiveCarry), 1);
  dice.pot = Math.min(Math.max(nonNegative(dice.pot), C.jackpot.potSeed), C.debt.amount * C.jackpot.payoutCapDebtFraction);
  // Las tiradas guardadas se dan por cerradas (no se puede relanzar tras cargar).
  dice.recentRolls = dice.recentRolls.filter(isRecord).slice(0, CONFIG.tech.recentSpins).map((r) => ({ ...r, final: true })) as typeof dice.recentRolls;
}

function clampIndex(value: number, length: number): number {
  return Math.min(Math.floor(nonNegative(value)), length - 1);
}

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
