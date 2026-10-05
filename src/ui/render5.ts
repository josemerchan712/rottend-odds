import { CONFIG, type CoinUpgradeId } from '../game/config';
import { coinFatigue, coinLuckChance, coinMaxBet, maxSeconds, secondsInterval } from '../game/coin/game';
import type { CoinState } from '../game/coin/state';
import {
  canBuyCoin,
  canPayCoinDebt,
  coinDebtProgress,
  coinNextCost,
  coinPassiveRate,
  hasImp,
  impBet,
  impInterval,
  impLuckBonus,
  impProfile,
  isCoinMaxed,
  isCoinUpgradeUnlocked,
  recommendedImpProfile,
} from '../game/coin/table';
import type { GameState } from '../game/state';
import { formatNumber, formatPercent, formatSeconds, formatTime } from '../util/format';
import { setText, TABS_HTML, type Drawer } from './render';
import { markRecommended, renderHelperNet } from './helperMeter';

/** HUD y cajones de la mesa 5, con la misma forma que los de las otras mesas. */
export const DRAWERS5 = {
  mesa: { upgrades: ['luck', 'maxBet', 'temple'] as CoinUpgradeId[] },
  ayuda: { upgrades: ['imp', 'helperSpeed', 'helperProfile', 'helperLuck'] as CoinUpgradeId[] },
} as const;
export type Drawer5Id = keyof typeof DRAWERS5;

interface ShopRow {
  row: HTMLElement;
  level: HTMLElement;
  effect: HTMLElement;
  buy: HTMLButtonElement;
}

export interface Ui5 {
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
  drawers: Record<Drawer5Id, Drawer>;
  shop: Record<CoinUpgradeId, ShopRow>;
  stats: HTMLElement;
  statsToggle: HTMLButtonElement;
  statsBody: HTMLElement;
  helperLocked: HTMLElement;
  helperPanel: HTMLElement;
  profileButtons: HTMLButtonElement[];
  helperInfo: HTMLElement;
  helperNet: HTMLElement;
}

function shopRows(ids: readonly CoinUpgradeId[]): string {
  return ids
    .map(
      (id) => `
      <div class="shop-row" data-upgrade5="${id}">
        <div class="shop-line"><span class="name">${CONFIG.coin.upgrades[id].name}</span><span class="level"></span></div>
        <div class="shop-line"><span class="effect"></span><button class="buy small"></button></div>
      </div>`,
    )
    .join('');
}

export function mountUi5(root: HTMLElement): Ui5 {
  root.innerHTML = `
    <div class="hud">
      <div class="hud-balance">ORO <strong data-ref="balance">0</strong></div>${TABS_HTML}
      <div class="hud-passive" data-ref="passive" title="Oro por segundo que llega de la mesa 4"></div>
      <div class="hud-debt" title="Deuda con el Dueño">
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
        ${shopRows(DRAWERS5.mesa.upgrades)}
        <button class="stats-toggle small" data-ref="statsToggle">Estadísticas ▸</button>
        <div class="stats" data-ref="statsBody" hidden><div data-ref="stats"></div></div>
      </div>
      <button class="drawer-tab" title="Mesa (M)"><span>MESA</span><i class="dot" hidden></i></button>
    </aside>

    <aside class="drawer right" data-drawer="ayuda" data-open="false">
      <button class="drawer-tab" title="Ayuda (A)"><span>AYUDA</span><i class="dot" hidden></i></button>
      <div class="drawer-body pixel-frame">
        <h2>Ayuda <span class="muted">(A)</span></h2>
        <p class="muted small-text" data-ref="helperLocked">Contrata al diablillo coronado para que lance por ti.</p>
        <div data-ref="helperPanel">
          <div class="row profiles">
            ${CONFIG.coin.helper.profiles.map((p, i) => `<button class="chip small" data-profile5="${i}">${p.name}</button>`).join('')}
          </div>
          <p class="small-text" data-ref="helperInfo"></p>
          <p class="small-text helper-net" data-ref="helperNet"></p>
        </div>
        ${shopRows(DRAWERS5.ayuda.upgrades)}
      </div>
    </aside>
  `;
  const ref = <T extends HTMLElement = HTMLElement>(name: string) => root.querySelector<T>(`[data-ref="${name}"]`)!;
  const shop = {} as Record<CoinUpgradeId, ShopRow>;
  for (const id of [...DRAWERS5.mesa.upgrades, ...DRAWERS5.ayuda.upgrades]) {
    const row = root.querySelector<HTMLElement>(`[data-upgrade5="${id}"]`)!;
    shop[id] = { row, level: row.querySelector('.level')!, effect: row.querySelector('.effect')!, buy: row.querySelector('.buy')! };
  }
  const drawer = (id: Drawer5Id): Drawer => {
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
    profileButtons: [...root.querySelectorAll<HTMLButtonElement>('[data-profile5]')],
    helperInfo: ref('helperInfo'),
    helperNet: ref('helperNet'),
  };
}

export function render5(ui: Ui5, state: GameState): void {
  const coin = state.coin;
  const { upgrades } = coin;
  setText(ui.balance, formatNumber(coin.balance));
  setText(ui.passive, `+${formatNumber(coinPassiveRate(state))}/s de la mesa 4`);
  ui.debtFill.style.width = `${coinDebtProgress(coin) * 100}%`;
  setText(ui.debtText, coin.debtPaid ? 'SALDADA' : formatPercent(coinDebtProgress(coin), 0));
  ui.payDebt.hidden = !canPayCoinDebt(coin);

  const st = coin.stats;
  const headRate = st.flips ? st.heads / st.flips : 0;
  setText(
    ui.stats,
    `Tiempo en la mesa ${formatTime(coin.playTime)} · ${st.chains} cadenas · ${st.flips} lanzamientos · ${formatPercent(headRate)} caras · mejor cadena ${st.bestChain} · ${st.seconds} segundas oportunidades · ${st.jackpots} jackpots · ${formatNumber(st.passiveEarned)} de la mesa 4`,
  );

  const on = hasImp(coin);
  ui.helperLocked.hidden = on;
  ui.helperPanel.hidden = !on;
  if (on) {
    const profile = impProfile(coin);
    ui.profileButtons.forEach((b, i) => {
      b.disabled = i > upgrades.helperProfile;
      b.classList.toggle('active', CONFIG.coin.helper.profiles[i] === profile);
    });
    const [lo, hi] = profile.stops;
    setText(ui.helperInfo, `Lanza cada ${formatSeconds(impInterval(upgrades.helperSpeed), 2)} · se retira con ${lo === hi ? lo : `${lo}-${hi === 10 ? '10' : hi}`} caras`);
    renderHelperNet(ui.helperNet, 5, state.playTime, impBet(coin) <= 0);
    markRecommended(ui.profileButtons, recommendedImpProfile(coin));
  }

  for (const id of Object.keys(DRAWERS5) as Drawer5Id[]) {
    let anyBuyable = false;
    for (const upgrade of DRAWERS5[id].upgrades) {
      const row = ui.shop[upgrade];
      const def = CONFIG.coin.upgrades[upgrade];
      const unlocked = isCoinUpgradeUnlocked(coin, upgrade);
      const buyable = canBuyCoin(coin, upgrade);
      anyBuyable ||= buyable;
      row.row.classList.toggle('locked', !unlocked);
      row.row.classList.toggle('unaffordable', !buyable && !isCoinMaxed(coin, upgrade));
      setText(row.level, `${upgrades[upgrade]}/${def.maxLevel}`);
      setText(row.effect, unlocked ? describe(coin, upgrade) : 'Requiere el diablillo');
      setText(row.buy, isCoinMaxed(coin, upgrade) ? 'MÁX' : formatNumber(coinNextCost(coin, upgrade) ?? 0));
      row.buy.disabled = !buyable;
    }
    ui.drawers[id].dot.hidden = !anyBuyable;
  }
}

function describe(coin: CoinState, id: CoinUpgradeId): string {
  const lvl = coin.upgrades[id];
  const maxed = isCoinMaxed(coin, id);
  const arrow = (now: string, next: string) => (maxed ? now : `${now} → ${next}`);
  switch (id) {
    case 'luck':
      return maxed
        ? `Cara ${formatPercent(coinLuckChance(lvl))} · ${maxSeconds(lvl)} segundas`
        : `Cara ${formatPercent(coinLuckChance(lvl))} → ${formatPercent(coinLuckChance(lvl + 1))} · segundas ${maxSeconds(lvl)} cada ${formatSeconds(secondsInterval(lvl))}`;
    case 'maxBet':
      return arrow(`Techo ${formatNumber(coinMaxBet(lvl))}`, formatNumber(coinMaxBet(lvl + 1)));
    case 'temple':
      return arrow(`Fatiga −${formatPercent(coinFatigue(lvl), 1)} por cara`, `−${formatPercent(coinFatigue(lvl + 1), 1)}`);
    case 'imp':
      return maxed ? 'Contratado' : 'Lanza por ti';
    case 'helperSpeed':
      return arrow(`Cada ${formatSeconds(impInterval(lvl), 2)}`, formatSeconds(impInterval(lvl + 1), 2));
    case 'helperProfile': {
      const next = CONFIG.coin.helper.profiles[lvl + 1];
      return maxed || !next ? 'Todos los perfiles' : `Desbloquea ${next.name.toLowerCase()}`;
    }
    case 'helperLuck':
      return arrow(`+${formatPercent(impLuckBonus(lvl))}`, `+${formatPercent(impLuckBonus(lvl + 1))}`);
  }
}

export function toggleDrawer5(ui: Ui5, id: Drawer5Id): void {
  ui.drawers[id].root.dataset.open = String(ui.drawers[id].root.dataset.open !== 'true');
}

export function closeDrawers5(ui: Ui5): void {
  for (const id of Object.keys(DRAWERS5) as Drawer5Id[]) ui.drawers[id].root.dataset.open = 'false';
}
