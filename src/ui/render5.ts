import { CONFIG, HEIRLOOM_IDS, type CoinUpgradeId, type HeirloomId } from '../game/config';
import { coinLuckChance, coinMaxBet, decayExponent, heirloomCharges } from '../game/coin/game';
import type { CoinState } from '../game/coin/state';
import {
  canBuyCoin,
  canBuyHeirloom,
  heirloomNextCost,
  heirloomWallet,
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
  mesa: { upgrades: ['luck', 'maxBet', 'temple', 'loaded'] as CoinUpgradeId[] },
  ayuda: { upgrades: ['imp', 'helperSpeed', 'helperProfile', 'helperLuck'] as CoinUpgradeId[] },
} as const;
/** Mesa, Ayuda y Herencias (las herramientas de las mesas anteriores, con su moneda). */
export type Drawer5Id = keyof typeof DRAWERS5 | 'herencias';

/** Moneda de cada mesa de origen de las herencias. */
export const HEIRLOOM_CURRENCY = { table1: 'fichas', slots: 'monedas', dice: 'chapas', cards: 'fichas negras' } as const;
const HEIRLOOM_EFFECT: Record<HeirloomId, string> = {
  zero: 'Tras una cruz, salva la cuarta parte de lo acumulado',
  hold: 'El siguiente acierto no cansa',
  reroll: 'Repite una cruz (con alguna cara), más difícil',
  mark: 'Enseña el próximo lanzamiento',
};

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
  heirlooms: Record<HeirloomId, ShopRow & { wallet: HTMLElement }>;
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
      <div class="hud-passive" title="Oro por segundo que llega de la mesa 4"><span data-ref="passive"></span><span class="long"> de la mesa 4</span></div>
      <div class="hud-debt" title="Deuda con el Dueño">
        <span class="muted">DEUDA</span>
        <div class="debt-bar"><div class="debt-fill" data-ref="debtFill"></div></div>
        <span data-ref="debtText"></span>
      </div>
      <div class="hud-toast" data-ref="toast" role="status"></div>
      <div class="hud-buttons">
        <button data-ref="payDebt" class="gold small">Pagar deuda</button>
        <button data-ref="fullscreen" class="small" title="Pantalla completa (F)"><span class="long">Pantalla completa</span><span class="short">Pantalla</span></button>
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

    <aside class="drawer left second" data-drawer="herencias" data-open="false">
      <div class="drawer-body pixel-frame">
        <h2>Herencias <span class="muted">(E)</span></h2>
        <p class="small-text muted">Cargas por cadena: se recargan al empezar cada cadena. Se pagan con la moneda de su mesa.</p>
        ${HEIRLOOM_IDS.map(
          (id) => `
          <div class="shop-row" data-heirloom="${id}">
            <div class="shop-line"><span class="name">${CONFIG.coin.heirlooms[id].name} [${CONFIG.coin.heirlooms[id].key}]</span><span class="level"></span></div>
            <div class="shop-line"><span class="effect"></span></div>
            <div class="shop-line"><span class="effect" data-wallet></span><button class="buy small"></button></div>
          </div>`,
        ).join('')}
      </div>
      <button class="drawer-tab" title="Herencias (E)"><span>HERENCIAS</span><i class="dot" hidden></i></button>
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
    drawers: { mesa: drawer('mesa'), ayuda: drawer('ayuda'), herencias: drawer('herencias') },
    heirlooms: Object.fromEntries(
      HEIRLOOM_IDS.map((id) => {
        const row = root.querySelector<HTMLElement>(`[data-heirloom="${id}"]`)!;
        const effects = row.querySelectorAll<HTMLElement>('.effect');
        return [id, { row, level: row.querySelector('.level')!, effect: effects[0], wallet: effects[1], buy: row.querySelector('.buy')! }];
      }),
    ) as Ui5['heirlooms'],
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
  setText(ui.passive, `+${formatNumber(coinPassiveRate(state))}/s`);
  ui.debtFill.style.width = `${coinDebtProgress(coin) * 100}%`;
  setText(ui.debtText, coin.debtPaid ? 'SALDADA' : formatPercent(coinDebtProgress(coin), 0));
  ui.payDebt.hidden = !canPayCoinDebt(coin);

  const st = coin.stats;
  const headRate = st.flips ? st.heads / st.flips : 0;
  setText(
    ui.stats,
    `Tiempo en la mesa ${formatTime(coin.playTime)} · ${st.chains} cadenas · ${st.flips} lanzamientos · ${formatPercent(headRate)} caras · mejor cadena ${st.bestChain} · ${st.heirloomsUsed} herencias usadas · ${st.loadedFlips} con la cargada · ${st.jackpots} jackpots · ${formatNumber(st.passiveEarned)} de la mesa 4`,
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

  for (const id of Object.keys(DRAWERS5) as (keyof typeof DRAWERS5)[]) {
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

  // Herencias: nivel, efecto, saldo de la mesa de origen y coste en su moneda.
  let anyHeirloom = false;
  for (const id of HEIRLOOM_IDS) {
    const row = ui.heirlooms[id];
    const def = CONFIG.coin.heirlooms[id];
    const level = heirloomCharges(coin, id);
    const cost = heirloomNextCost(coin, id);
    const buyable = canBuyHeirloom(state, id);
    anyHeirloom ||= buyable;
    const currency = HEIRLOOM_CURRENCY[def.from as keyof typeof HEIRLOOM_CURRENCY];
    row.row.classList.toggle('unaffordable', !buyable && cost !== null);
    setText(row.level, `${level}/${def.maxLevel}`);
    setText(row.effect, `${HEIRLOOM_EFFECT[id]} · ${level} por cadena`);
    setText(row.wallet, `Tienes ${formatNumber(heirloomWallet(state, id))} ${currency}`);
    setText(row.buy, cost === null ? 'MÁX' : `${formatNumber(cost)} ${currency}`);
    row.buy.disabled = !buyable;
  }
  ui.drawers.herencias.dot.hidden = !anyHeirloom;
}

function describe(coin: CoinState, id: CoinUpgradeId): string {
  const lvl = coin.upgrades[id];
  const maxed = isCoinMaxed(coin, id);
  const arrow = (now: string, next: string) => (maxed ? now : `${now} → ${next}`);
  switch (id) {
    case 'luck':
      return arrow(`Cara ${formatPercent(coinLuckChance(lvl))}`, formatPercent(coinLuckChance(lvl + 1)));
    case 'maxBet':
      return arrow(`Techo ${formatNumber(coinMaxBet(lvl))}`, formatNumber(coinMaxBet(lvl + 1)));
    case 'temple':
      return arrow(`Caída ^${decayExponent(lvl).toFixed(2)} por paso`, `^${decayExponent(lvl + 1).toFixed(2)}`);
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
    case 'loaded':
      return maxed ? 'Moneda cargada: ×1,5 el factor (Q para cambiar)' : 'Desbloquea la moneda cargada (×1,5 el factor)';
  }
}

export function toggleDrawer5(ui: Ui5, id: Drawer5Id): void {
  const open = ui.drawers[id].root.dataset.open !== 'true';
  // Mesa y Herencias comparten el lado izquierdo: abrir uno cierra el otro.
  if (open && id === 'mesa') ui.drawers.herencias.root.dataset.open = 'false';
  if (open && id === 'herencias') ui.drawers.mesa.root.dataset.open = 'false';
  ui.drawers[id].root.dataset.open = String(open);
}

export function closeDrawers5(ui: Ui5): void {
  for (const id of ['mesa', 'ayuda', 'herencias'] as Drawer5Id[]) ui.drawers[id].root.dataset.open = 'false';
}
