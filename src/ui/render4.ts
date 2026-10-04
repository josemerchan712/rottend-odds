import { CONFIG, type CardUpgradeId } from '../game/config';
import { cardsJackpotChance, cardsLuckChance, cardsMaxBet, discardInterval, maxDiscards } from '../game/cards/game';
import type { CardsState } from '../game/cards/state';
import {
  recommendedSkeletonProfile,
  canBuyCards,
  canPayCardsDebt,
  cardsDebtProgress,
  cardsNextCost,
  cardsPassiveRate,
  hasSkeleton,
  isCardsMaxed,
  isCardsUpgradeUnlocked,
  skeletonBet,
  skeletonInterval,
  skeletonLuckBonus,
  skeletonProfile,
} from '../game/cards/table';
import type { GameState } from '../game/state';
import { formatNumber, formatPercent, formatSeconds, formatTime } from '../util/format';
import { setText, TABS_HTML, type Drawer } from './render';
import { markRecommended, renderHelperNet } from './helperMeter';

/** HUD y cajones de la mesa 4, con la misma forma que los de las otras mesas. */
export const DRAWERS4 = {
  mesa: { upgrades: ['luck', 'maxBet', 'jackpot'] as CardUpgradeId[] },
  ayuda: { upgrades: ['skeleton', 'helperSpeed', 'helperProfile', 'helperLuck'] as CardUpgradeId[] },
} as const;
export type Drawer4Id = keyof typeof DRAWERS4;

interface ShopRow {
  row: HTMLElement;
  level: HTMLElement;
  effect: HTMLElement;
  buy: HTMLButtonElement;
}

export interface Ui4 {
  balance: HTMLElement;
  tabs: HTMLElement;
  tabButtons: HTMLButtonElement[];
  passive: HTMLElement;
  debtText: HTMLElement;
  debtFill: HTMLElement;
  payDebt: HTMLButtonElement;
  fullscreen: HTMLButtonElement;
  toMenu: HTMLButtonElement;
  toast: HTMLElement;
  tooltip: HTMLElement;
  drawers: Record<Drawer4Id, Drawer>;
  shop: Record<CardUpgradeId, ShopRow>;
  stats: HTMLElement;
  statsToggle: HTMLButtonElement;
  statsBody: HTMLElement;
  helperLocked: HTMLElement;
  helperPanel: HTMLElement;
  profileButtons: HTMLButtonElement[];
  helperInfo: HTMLElement;
  helperNet: HTMLElement;
}

function shopRows(ids: readonly CardUpgradeId[]): string {
  return ids
    .map(
      (id) => `
      <div class="shop-row" data-upgrade4="${id}">
        <div class="shop-line"><span class="name">${CONFIG.cards.upgrades[id].name}</span><span class="level"></span></div>
        <div class="shop-line"><span class="effect"></span><button class="buy small"></button></div>
      </div>`,
    )
    .join('');
}

export function mountUi4(root: HTMLElement): Ui4 {
  root.innerHTML = `
    <div class="hud">
      <div class="hud-balance">FICHAS NEGRAS <strong data-ref="balance">0</strong></div>${TABS_HTML}
      <div class="hud-passive" data-ref="passive" title="Fichas por segundo que llegan de la mesa 3"></div>
      <div class="hud-debt" title="Deuda con la Crupier">
        <span class="muted">DEUDA</span>
        <div class="debt-bar"><div class="debt-fill" data-ref="debtFill"></div></div>
        <span data-ref="debtText"></span>
      </div>
      <div class="hud-toast" data-ref="toast" role="status"></div>
      <div class="hud-buttons">
        <button data-ref="payDebt" class="gold small">Pagar deuda</button>
        <button data-ref="fullscreen" class="small" title="Pantalla completa (F)">Pantalla completa</button>
        <button data-ref="toMenu" class="small">Menú</button>
      </div>
    </div>
    <div class="tooltip pixel-frame" data-ref="tooltip" hidden></div>

    <aside class="drawer left" data-drawer="mesa" data-open="false">
      <div class="drawer-body pixel-frame">
        <h2>Mesa <span class="muted">(M)</span></h2>
        ${shopRows(DRAWERS4.mesa.upgrades)}
        <button class="stats-toggle small" data-ref="statsToggle">Estadísticas ▸</button>
        <div class="stats" data-ref="statsBody" hidden><div data-ref="stats"></div></div>
      </div>
      <button class="drawer-tab" title="Mesa (M)"><span>MESA</span><i class="dot" hidden></i></button>
    </aside>

    <aside class="drawer right" data-drawer="ayuda" data-open="false">
      <button class="drawer-tab" title="Ayuda (A)"><span>AYUDA</span><i class="dot" hidden></i></button>
      <div class="drawer-body pixel-frame">
        <h2>Ayuda <span class="muted">(A)</span></h2>
        <p class="muted small-text" data-ref="helperLocked">Contrata al esqueleto barajador para que juegue por ti.</p>
        <div data-ref="helperPanel">
          <div class="row profiles">
            ${CONFIG.cards.helper.profiles.map((p, i) => `<button class="chip small" data-profile4="${i}">${p.name}</button>`).join('')}
          </div>
          <p class="small-text" data-ref="helperInfo"></p>
          <p class="small-text helper-net" data-ref="helperNet"></p>
        </div>
        ${shopRows(DRAWERS4.ayuda.upgrades)}
      </div>
    </aside>
  `;
  const ref = <T extends HTMLElement = HTMLElement>(name: string) => root.querySelector<T>(`[data-ref="${name}"]`)!;
  const shop = {} as Record<CardUpgradeId, ShopRow>;
  for (const id of [...DRAWERS4.mesa.upgrades, ...DRAWERS4.ayuda.upgrades]) {
    const row = root.querySelector<HTMLElement>(`[data-upgrade4="${id}"]`)!;
    shop[id] = { row, level: row.querySelector('.level')!, effect: row.querySelector('.effect')!, buy: row.querySelector('.buy')! };
  }
  const drawer = (id: Drawer4Id): Drawer => {
    const el = root.querySelector<HTMLElement>(`[data-drawer="${id}"]`)!;
    return { root: el, tab: el.querySelector('.drawer-tab')!, dot: el.querySelector('.dot')! };
  };
  return {
    balance: ref('balance'),
    tabs: ref('tabs'),
    tabButtons: [...root.querySelectorAll<HTMLButtonElement>('[data-table]')],
    passive: ref('passive'),
    debtText: ref('debtText'),
    debtFill: ref('debtFill'),
    payDebt: ref('payDebt'),
    fullscreen: ref('fullscreen'),
    toMenu: ref('toMenu'),
    toast: ref('toast'),
    tooltip: ref('tooltip'),
    drawers: { mesa: drawer('mesa'), ayuda: drawer('ayuda') },
    shop,
    stats: ref('stats'),
    statsToggle: ref('statsToggle'),
    statsBody: ref('statsBody'),
    helperLocked: ref('helperLocked'),
    helperPanel: ref('helperPanel'),
    profileButtons: [...root.querySelectorAll<HTMLButtonElement>('[data-profile4]')],
    helperInfo: ref('helperInfo'),
    helperNet: ref('helperNet'),
  };
}

export function render4(ui: Ui4, state: GameState): void {
  const cards = state.cards;
  const { upgrades } = cards;
  setText(ui.balance, formatNumber(cards.balance));
  setText(ui.passive, `+${formatNumber(cardsPassiveRate(state))}/s de la mesa 3`);
  ui.debtFill.style.width = `${cardsDebtProgress(cards) * 100}%`;
  setText(ui.debtText, cards.debtPaid ? 'SALDADA' : formatPercent(cardsDebtProgress(cards), 0));
  ui.payDebt.hidden = !canPayCardsDebt(cards);

  const st = cards.stats;
  const winRate = st.hands ? st.wins / st.hands : 0;
  setText(
    ui.stats,
    `Tiempo en la mesa ${formatTime(cards.playTime)} · ${st.hands} manos · ${formatPercent(winRate)} ganadas · ${st.pushes} empates · ${st.discards} descartes · ${st.jackpots} jackpots · ${formatNumber(st.passiveEarned)} de la mesa 3`,
  );


  const on = hasSkeleton(cards);
  ui.helperLocked.hidden = on;
  ui.helperPanel.hidden = !on;
  if (on) {
    const profile = skeletonProfile(cards);
    ui.profileButtons.forEach((b, i) => {
      b.disabled = i > upgrades.helperProfile;
      b.classList.toggle('active', CONFIG.cards.helper.profiles[i] === profile);
    });
    setText(ui.helperInfo, `Juega cada ${formatSeconds(skeletonInterval(upgrades.helperSpeed), 2)}`);
    renderHelperNet(ui.helperNet, 4, state.playTime, skeletonBet(cards) <= 0);
    markRecommended(ui.profileButtons, recommendedSkeletonProfile(cards));
  }

  for (const id of Object.keys(DRAWERS4) as Drawer4Id[]) {
    let anyBuyable = false;
    for (const upgrade of DRAWERS4[id].upgrades) {
      const row = ui.shop[upgrade];
      const def = CONFIG.cards.upgrades[upgrade];
      const unlocked = isCardsUpgradeUnlocked(cards, upgrade);
      const buyable = canBuyCards(cards, upgrade);
      anyBuyable ||= buyable;
      row.row.classList.toggle('locked', !unlocked);
      row.row.classList.toggle('unaffordable', !buyable && !isCardsMaxed(cards, upgrade));
      setText(row.level, `${upgrades[upgrade]}/${def.maxLevel}`);
      setText(row.effect, unlocked ? describe(cards, upgrade) : 'Requiere el esqueleto');
      setText(row.buy, isCardsMaxed(cards, upgrade) ? 'MÁX' : formatNumber(cardsNextCost(cards, upgrade) ?? 0));
      row.buy.disabled = !buyable;
    }
    ui.drawers[id].dot.hidden = !anyBuyable;
  }
}

function describe(cards: CardsState, id: CardUpgradeId): string {
  const lvl = cards.upgrades[id];
  const maxed = isCardsMaxed(cards, id);
  const arrow = (now: string, next: string) => (maxed ? now : `${now} → ${next}`);
  switch (id) {
    case 'luck':
      return maxed
        ? `Gana ${formatPercent(cardsLuckChance(lvl))} · ${maxDiscards(lvl)} descartes`
        : `Gana ${formatPercent(cardsLuckChance(lvl))} → ${formatPercent(cardsLuckChance(lvl + 1))} · descartes ${maxDiscards(lvl)} cada ${formatSeconds(discardInterval(lvl))}`;
    case 'maxBet':
      return arrow(`Techo ${formatNumber(cardsMaxBet(lvl))}`, formatNumber(cardsMaxBet(lvl + 1)));
    case 'jackpot':
      return arrow(`7·7·7 ${formatPercent(cardsJackpotChance(cards.upgrades.luck, lvl), 2)}`, formatPercent(cardsJackpotChance(cards.upgrades.luck, lvl + 1), 2));
    case 'skeleton':
      return maxed ? 'Contratado' : 'Juega por ti';
    case 'helperSpeed':
      return arrow(`Cada ${formatSeconds(skeletonInterval(lvl), 2)}`, formatSeconds(skeletonInterval(lvl + 1), 2));
    case 'helperProfile': {
      const next = CONFIG.cards.helper.profiles[lvl + 1];
      return maxed || !next ? 'Todos los perfiles' : `Desbloquea ${next.name.toLowerCase()}`;
    }
    case 'helperLuck':
      return arrow(`+${formatPercent(skeletonLuckBonus(lvl))}`, `+${formatPercent(skeletonLuckBonus(lvl + 1))}`);
  }
}


export function toggleDrawer4(ui: Ui4, id: Drawer4Id): void {
  ui.drawers[id].root.dataset.open = String(ui.drawers[id].root.dataset.open !== 'true');
}

export function closeDrawers4(ui: Ui4): void {
  for (const id of Object.keys(DRAWERS4) as Drawer4Id[]) ui.drawers[id].root.dataset.open = 'false';
}
