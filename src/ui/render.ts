import { maxBet } from '../game/betting';
import { CONFIG, type UpgradeId } from '../game/config';
import { canPayDebt, debtProgress } from '../game/debt';
import { hasHelper, helperBetAmount, helperInterval, helperLuckBonus, helperProfile, recommendedHelperProfile } from '../game/helper';
import { markRecommended, renderHelperNet } from './helperMeter';
import { jackpotChance, luckChance } from '../game/luck';
import type { GameState } from '../game/state';
import { canBuy, isMaxed, isUnlocked, nextCost } from '../game/upgrades';
import { bagMultiplier, cleanerInterval } from '../game/work';
import { formatNumber, formatPercent, formatSeconds, formatTime } from '../util/format';

/** Mejoras de cada cajón lateral. */
export const DRAWERS = {
  mesa: { title: 'Mesa', upgrades: ['luck', 'maxBet', 'jackpot', 'dozenBet', 'numberBet'] as UpgradeId[] },
  ayuda: {
    title: 'Ayuda',
    upgrades: ['crupier', 'helperSpeed', 'helperProfile', 'helperLuck', 'tweezers', 'bigBag', 'cleaner'] as UpgradeId[],
  },
} as const;
export type DrawerId = keyof typeof DRAWERS;

export interface ShopRow {
  row: HTMLElement;
  level: HTMLElement;
  effect: HTMLElement;
  buy: HTMLButtonElement;
}

export interface Drawer {
  root: HTMLElement;
  tab: HTMLButtonElement;
  dot: HTMLElement;
}

/** Pestañas de mesa del HUD (aparecen al desbloquear la mesa 2). */
export const TABS_HTML = `
      <div class="table-tabs" data-ref="tabs" hidden>
        <button class="tab small" data-table="1" title="Mesa 1: la ruleta">MESA 1</button>
        <button class="tab small" data-table="2" title="Mesa 2: la tragaperras">MESA 2</button>
        <button class="tab small" data-table="3" title="Mesa 3: los dados">MESA 3</button>
        <button class="tab small" data-table="4" title="Mesa 4: el blackjack">MESA 4</button>
        <button class="tab small" data-table="5" title="Mesa 5: doble o nada">MESA 5</button>
      </div>`;

export interface Ui {
  balance: HTMLElement;
  tabs: HTMLElement;
  tabButtons: HTMLButtonElement[];
  debtText: HTMLElement;
  debtFill: HTMLElement;
  payDebt: HTMLButtonElement;
  fullscreen: HTMLButtonElement;
  toMenu: HTMLButtonElement;
  toast: HTMLElement;
  note: HTMLElement;
  tooltip: HTMLElement;
  drawers: Record<DrawerId, Drawer>;
  shop: Record<UpgradeId, ShopRow>;
  stats: HTMLElement;
  statsToggle: HTMLButtonElement;
  statsBody: HTMLElement;
  saveStatus: HTMLElement;
  helperLocked: HTMLElement;
  helperPanel: HTMLElement;
  profileButtons: HTMLButtonElement[];
  helperInfo: HTMLElement;
  helperNet: HTMLElement;
  workInfo: HTMLElement;
}

function shopRows(ids: readonly UpgradeId[]): string {
  return ids
    .map(
      (id) => `
      <div class="shop-row" data-upgrade="${id}">
        <div class="shop-line"><span class="name">${CONFIG.upgrades[id].name}</span><span class="level"></span></div>
        <div class="shop-line"><span class="effect"></span><button class="buy small"></button></div>
      </div>`,
    )
    .join('');
}

/** Monta el HUD, los cajones y el tooltip de la pantalla de juego. */
export function mountUi(root: HTMLElement): Ui {
  root.innerHTML = `
    <div class="hud">
      <div class="hud-balance">FICHAS <strong data-ref="balance">0</strong></div>${TABS_HTML}
      <div class="hud-debt" title="Deuda con el Encargado">
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
    <div class="hud-note" data-ref="note" role="status"></div>
    <div class="tooltip pixel-frame" data-ref="tooltip" hidden></div>

    <aside class="drawer left" data-drawer="mesa" data-open="false">
      <div class="drawer-body pixel-frame">
        <h2>Mesa <span class="muted">(M)</span></h2>
        ${shopRows(DRAWERS.mesa.upgrades)}
        <button class="stats-toggle small" data-ref="statsToggle">Estadísticas ▸</button>
        <div class="stats" data-ref="statsBody" hidden>
          <div data-ref="stats"></div>
          <div class="muted" data-ref="saveStatus"></div>
        </div>
      </div>
      <button class="drawer-tab" title="Mesa (M)"><span>MESA</span><i class="dot" hidden></i></button>
    </aside>

    <aside class="drawer right" data-drawer="ayuda" data-open="false">
      <button class="drawer-tab" title="Ayuda (A)"><span>AYUDA</span><i class="dot" hidden></i></button>
      <div class="drawer-body pixel-frame">
        <h2>Ayuda <span class="muted">(A)</span></h2>
        <p class="muted small-text" data-ref="helperLocked">Contrata al crupier para que apueste por ti.</p>
        <div data-ref="helperPanel">
          <div class="row profiles">
            ${CONFIG.helper.profiles.map((p, i) => `<button class="chip small" data-profile="${i}">${p.name}</button>`).join('')}
          </div>
          <p class="small-text" data-ref="helperInfo"></p>
          <p class="small-text helper-net" data-ref="helperNet"></p>
        </div>
        ${shopRows(DRAWERS.ayuda.upgrades.slice(0, 4))}
        <h2 class="drawer-sub">Trastienda</h2>
        <p class="small-text muted" data-ref="workInfo"></p>
        ${shopRows(DRAWERS.ayuda.upgrades.slice(4))}
      </div>
    </aside>
  `;

  const ref = <T extends HTMLElement = HTMLElement>(name: string) => root.querySelector<T>(`[data-ref="${name}"]`)!;
  const shop = {} as Record<UpgradeId, ShopRow>;
  for (const id of [...DRAWERS.mesa.upgrades, ...DRAWERS.ayuda.upgrades]) {
    const row = root.querySelector<HTMLElement>(`[data-upgrade="${id}"]`)!;
    shop[id] = { row, level: row.querySelector('.level')!, effect: row.querySelector('.effect')!, buy: row.querySelector('.buy')! };
  }
  const drawer = (id: DrawerId): Drawer => {
    const el = root.querySelector<HTMLElement>(`[data-drawer="${id}"]`)!;
    return { root: el, tab: el.querySelector('.drawer-tab')!, dot: el.querySelector('.dot')! };
  };

  return {
    balance: ref('balance'),
    tabs: ref('tabs'),
    tabButtons: [...root.querySelectorAll<HTMLButtonElement>('[data-table]')],
    debtText: ref('debtText'),
    debtFill: ref('debtFill'),
    payDebt: ref('payDebt'),
    fullscreen: ref('fullscreen'),
    toMenu: ref('toMenu'),
    toast: ref('toast'),
    note: ref('note'),
    tooltip: ref('tooltip'),
    drawers: { mesa: drawer('mesa'), ayuda: drawer('ayuda') },
    shop,
    stats: ref('stats'),
    statsToggle: ref('statsToggle'),
    statsBody: ref('statsBody'),
    saveStatus: ref('saveStatus'),
    helperLocked: ref('helperLocked'),
    helperPanel: ref('helperPanel'),
    profileButtons: [...root.querySelectorAll<HTMLButtonElement>('[data-profile]')],
    helperInfo: ref('helperInfo'),
    helperNet: ref('helperNet'),
    workInfo: ref('workInfo'),
  };
}

export function isDrawerOpen(ui: Ui, id: DrawerId): boolean {
  return ui.drawers[id].root.dataset.open === 'true';
}

export function setDrawerOpen(ui: Ui, id: DrawerId, open: boolean): void {
  ui.drawers[id].root.dataset.open = String(open);
}

/** Pinta el HUD y los cajones con el estado actual. */
export function render(ui: Ui, state: GameState): void {
  const { upgrades } = state;

  setText(ui.balance, formatNumber(state.balance));
  ui.debtFill.style.width = `${debtProgress(state) * 100}%`;
  setText(ui.debtText, state.debtPaid ? 'SALDADA' : formatPercent(debtProgress(state), 0));
  ui.payDebt.hidden = !canPayDebt(state);

  // Estadísticas (dentro del cajón Mesa).
  const winRate = state.stats.bets ? state.stats.wins / state.stats.bets : 0;
  setText(
    ui.stats,
    `Tiempo ${formatTime(state.playTime)} · ${state.stats.bets} apuestas · ${formatPercent(winRate)} ganadas · ${state.stats.jackpots} Cero Dorado`,
  );

  // Trastienda.
  const extras = [
    upgrades.tweezers > 0 ? 'pinzas' : '',
    upgrades.bigBag > 0 ? `bolsa x${bagMultiplier(state).toFixed(1).replace('.', ',')}` : '',
    upgrades.cleaner > 0 ? `limpieza cada ${formatSeconds(cleanerInterval(upgrades.cleaner))}` : '',
  ].filter(Boolean);
  setText(ui.workInfo, `${state.work.items.length}/${CONFIG.work.maxItems} en el suelo${extras.length ? ` · ${extras.join(', ')}` : ''}`);

  // Ayudante de apuestas: solo nombres de perfil, sin fracciones.
  const helperOn = hasHelper(state);
  ui.helperLocked.hidden = helperOn;
  ui.helperPanel.hidden = !helperOn;
  if (helperOn) {
    const profile = helperProfile(state);
    ui.profileButtons.forEach((b, i) => {
      b.disabled = i > upgrades.helperProfile;
      b.classList.toggle('active', CONFIG.helper.profiles[i] === profile);
    });
    const interval = helperInterval(upgrades.helperSpeed);
    const hBet = helperBetAmount(state);
    const status = state.helper.lockout > 0 ? ` · bloqueado ${formatSeconds(state.helper.lockout)}` : '';
    setText(ui.helperInfo, `Apuesta cada ${formatSeconds(interval, 2)}${status}`);
    renderHelperNet(ui.helperNet, 1, state.playTime, hBet <= 0);
    markRecommended(ui.profileButtons, recommendedHelperProfile(state));
  }

  // Mejoras y puntos de aviso de las pestañas.
  for (const id of Object.keys(DRAWERS) as DrawerId[]) {
    let anyBuyable = false;
    for (const upgrade of DRAWERS[id].upgrades) {
      const row = ui.shop[upgrade];
      const def = CONFIG.upgrades[upgrade];
      const unlocked = isUnlocked(state, upgrade);
      const buyable = canBuy(state, upgrade);
      anyBuyable ||= buyable;
      row.row.classList.toggle('locked', !unlocked);
      row.row.classList.toggle('unaffordable', !buyable && !isMaxed(state, upgrade));
      setText(row.level, `${upgrades[upgrade]}/${def.maxLevel}`);
      setText(row.effect, unlocked ? describeUpgrade(state, upgrade) : 'Requiere el crupier');
      setText(row.buy, isMaxed(state, upgrade) ? 'MÁX' : formatNumber(nextCost(state, upgrade) ?? 0));
      row.buy.disabled = !buyable;
    }
    ui.drawers[id].dot.hidden = !anyBuyable;
  }
}

/** Efecto actual → siguiente de una mejora. Sin porcentajes de saldo ni de techo. */
function describeUpgrade(state: GameState, id: UpgradeId): string {
  const lvl = state.upgrades[id];
  const maxed = isMaxed(state, id);
  const arrow = (now: string, next: string) => (maxed ? now : `${now} → ${next}`);
  switch (id) {
    case 'luck':
      return arrow(`Prob. ${formatPercent(luckChance(lvl))}`, formatPercent(luckChance(lvl + 1)));
    case 'maxBet':
      return arrow(`Techo ${formatNumber(maxBet(lvl))}`, formatNumber(maxBet(lvl + 1)));
    case 'crupier':
      return maxed ? 'Contratado' : 'Apuesta por ti';
    case 'helperSpeed':
      return arrow(`Cada ${formatSeconds(helperInterval(lvl), 2)}`, formatSeconds(helperInterval(lvl + 1), 2));
    case 'helperProfile': {
      const next = CONFIG.helper.profiles[lvl + 1];
      return maxed || !next ? 'Todos los perfiles' : `Desbloquea ${next.name.toLowerCase()}`;
    }
    case 'helperLuck':
      return arrow(`+${formatPercent(helperLuckBonus(lvl))}`, `+${formatPercent(helperLuckBonus(lvl + 1))}`);
    case 'jackpot':
      return arrow(`Cero Dorado ${formatPercent(jackpotChance(state.upgrades.luck, lvl), 2)}`, formatPercent(jackpotChance(state.upgrades.luck, lvl + 1), 2));
    case 'dozenBet':
      return maxed ? 'Docena desbloqueada' : 'Desbloquea la docena (2:1)';
    case 'numberBet':
      return maxed ? 'Número desbloqueado' : 'Desbloquea el número (35:1)';
    case 'tweezers':
      return maxed ? '2 objetos por clic' : 'Recoge 2 por clic';
    case 'bigBag':
      return arrow(`Valor x${bagFactor(lvl)}`, `x${bagFactor(lvl + 1)}`);
    case 'cleaner':
      return lvl === 0 ? `Recoge solo cada ${formatSeconds(cleanerInterval(1))}` : arrow(`Cada ${formatSeconds(cleanerInterval(lvl))}`, formatSeconds(cleanerInterval(lvl + 1)));
  }
}

function bagFactor(level: number): string {
  return (1 + CONFIG.work.bagValuePerLevel * level).toFixed(1).replace('.', ',');
}

/** Solo toca el DOM si el texto ha cambiado. */
export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}
