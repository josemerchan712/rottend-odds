import { CONFIG, type SlotUpgradeId } from '../game/config';
import { holdShare, slotJackpotChance, slotLuckChance, slotMaxBet, slotWinChance } from '../game/slots/machine';
import type { SlotsState } from '../game/slots/state';
import {
  apprenticeInterval,
  canBuySlot,
  canPaySlotsDebt,
  hasZombie,
  isSlotMaxed,
  isSlotUnlocked,
  passiveRate,
  slotNextCost,
  slotsDebtProgress,
  toolboxMultiplier,
  zombieBet,
  zombieInterval,
  zombieLuckBonus,
  zombieProfile,
} from '../game/slots/table';
import type { GameState } from '../game/state';
import { formatNumber, formatPercent, formatSeconds, formatTime } from '../util/format';
import { setText, TABS_HTML, type Drawer } from './render';

/**
 * HUD y cajones de la mesa 2, con la misma forma que los de la mesa 1: monedas, pestañas, deuda
 * con la Tragaperras viviente, pasivo que llega de la mesa 1, y los cajones Mesa (M) y Ayuda (A).
 */
export const DRAWERS2 = {
  mesa: { upgrades: ['luck', 'maxBet', 'jackpot', 'hold'] as SlotUpgradeId[] },
  ayuda: { upgrades: ['zombie', 'helperSpeed', 'helperProfile', 'helperLuck', 'rag', 'toolbox', 'apprentice'] as SlotUpgradeId[] },
} as const;
export type Drawer2Id = keyof typeof DRAWERS2;

interface ShopRow {
  row: HTMLElement;
  level: HTMLElement;
  effect: HTMLElement;
  buy: HTMLButtonElement;
}

export interface Ui2 {
  root: HTMLElement;
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
  drawers: Record<Drawer2Id, Drawer>;
  shop: Record<SlotUpgradeId, ShopRow>;
  stats: HTMLElement;
  statsToggle: HTMLButtonElement;
  statsBody: HTMLElement;
  helperLocked: HTMLElement;
  helperPanel: HTMLElement;
  profileButtons: HTMLButtonElement[];
  helperInfo: HTMLElement;
  workInfo: HTMLElement;
}

function shopRows(ids: readonly SlotUpgradeId[]): string {
  return ids
    .map(
      (id) => `
      <div class="shop-row" data-upgrade2="${id}">
        <div class="shop-line"><span class="name">${CONFIG.slots.upgrades[id].name}</span><span class="level"></span></div>
        <div class="shop-line"><span class="effect"></span><button class="buy small"></button></div>
      </div>`,
    )
    .join('');
}

export function mountUi2(root: HTMLElement): Ui2 {
  root.innerHTML = `
    <div class="hud">
      <div class="hud-balance">MONEDAS <strong data-ref="balance">0</strong></div>${TABS_HTML}
      <div class="hud-passive" data-ref="passive" title="Monedas por segundo que llegan de la mesa 1"></div>
      <div class="hud-debt" title="Deuda con la Tragaperras viviente">
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
        ${shopRows(DRAWERS2.mesa.upgrades)}
        <button class="stats-toggle small" data-ref="statsToggle">Estadísticas ▸</button>
        <div class="stats" data-ref="statsBody" hidden><div data-ref="stats"></div></div>
      </div>
      <button class="drawer-tab" title="Mesa (M)"><span>MESA</span><i class="dot" hidden></i></button>
    </aside>

    <aside class="drawer right" data-drawer="ayuda" data-open="false">
      <button class="drawer-tab" title="Ayuda (A)"><span>AYUDA</span><i class="dot" hidden></i></button>
      <div class="drawer-body pixel-frame">
        <h2>Ayuda <span class="muted">(A)</span></h2>
        <p class="muted small-text" data-ref="helperLocked">Contrata al empleado zombi para que juegue por ti.</p>
        <div data-ref="helperPanel">
          <div class="row profiles">
            ${CONFIG.slots.helper.profiles.map((p, i) => `<button class="chip small" data-profile2="${i}">${p.name}</button>`).join('')}
          </div>
          <p class="small-text" data-ref="helperInfo"></p>
        </div>
        ${shopRows(DRAWERS2.ayuda.upgrades.slice(0, 4))}
        <h2 class="drawer-sub">Trastienda</h2>
        <p class="small-text muted" data-ref="workInfo"></p>
        ${shopRows(DRAWERS2.ayuda.upgrades.slice(4))}
      </div>
    </aside>
  `;
  const ref = <T extends HTMLElement = HTMLElement>(name: string) => root.querySelector<T>(`[data-ref="${name}"]`)!;
  const shop = {} as Record<SlotUpgradeId, ShopRow>;
  for (const id of [...DRAWERS2.mesa.upgrades, ...DRAWERS2.ayuda.upgrades]) {
    const row = root.querySelector<HTMLElement>(`[data-upgrade2="${id}"]`)!;
    shop[id] = { row, level: row.querySelector('.level')!, effect: row.querySelector('.effect')!, buy: row.querySelector('.buy')! };
  }
  const drawer = (id: Drawer2Id): Drawer => {
    const el = root.querySelector<HTMLElement>(`[data-drawer="${id}"]`)!;
    return { root: el, tab: el.querySelector('.drawer-tab')!, dot: el.querySelector('.dot')! };
  };
  return {
    root,
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
    profileButtons: [...root.querySelectorAll<HTMLButtonElement>('[data-profile2]')],
    helperInfo: ref('helperInfo'),
    workInfo: ref('workInfo'),
  };
}

export function render2(ui: Ui2, state: GameState): void {
  const slots = state.slots;
  const { upgrades } = slots;
  setText(ui.balance, formatNumber(slots.balance));
  setText(ui.passive, `+${formatNumber(passiveRate(state))}/s de la mesa 1`);
  ui.debtFill.style.width = `${slotsDebtProgress(slots) * 100}%`;
  setText(ui.debtText, slots.debtPaid ? 'SALDADA' : formatPercent(slotsDebtProgress(slots), 0));
  ui.payDebt.hidden = !canPaySlotsDebt(slots);

  const winRate = slots.stats.spins ? slots.stats.wins / slots.stats.spins : 0;
  setText(
    ui.stats,
    `Tiempo en la mesa ${formatTime(slots.playTime)} · ${slots.stats.spins} tiradas · ${formatPercent(winRate)} con premio · ${slots.stats.jackpots} jackpots · ${slots.stats.holds} retenidas · ${formatNumber(slots.stats.passiveEarned)} de la mesa 1`,
  );

  const extras = [
    upgrades.rag > 0 ? 'trapo' : '',
    upgrades.toolbox > 0 ? `caja x${toolboxMultiplier(slots).toFixed(1).replace('.', ',')}` : '',
    upgrades.apprentice > 0 ? `aprendiz cada ${formatSeconds(apprenticeInterval(upgrades.apprentice))}` : '',
  ].filter(Boolean);
  setText(ui.workInfo, `${slots.work.items.length}/${CONFIG.slots.work.maxItems} en el suelo${extras.length ? ` · ${extras.join(', ')}` : ''}`);

  const on = hasZombie(slots);
  ui.helperLocked.hidden = on;
  ui.helperPanel.hidden = !on;
  if (on) {
    const profile = zombieProfile(slots);
    ui.profileButtons.forEach((b, i) => {
      b.disabled = i > upgrades.helperProfile;
      b.classList.toggle('active', CONFIG.slots.helper.profiles[i] === profile);
    });
    const bet = zombieBet(slots);
    const chance = slotWinChance(upgrades.luck, bet / slotMaxBet(upgrades.maxBet), zombieLuckBonus(upgrades.helperLuck));
    setText(ui.helperInfo, `Tira cada ${formatSeconds(zombieInterval(upgrades.helperSpeed), 2)} · ${bet <= 0 ? 'esperando monedas' : `premio el ${formatPercent(chance)}`}`);
  }

  for (const id of Object.keys(DRAWERS2) as Drawer2Id[]) {
    let anyBuyable = false;
    for (const upgrade of DRAWERS2[id].upgrades) {
      const row = ui.shop[upgrade];
      const def = CONFIG.slots.upgrades[upgrade];
      const unlocked = isSlotUnlocked(slots, upgrade);
      const buyable = canBuySlot(slots, upgrade);
      anyBuyable ||= buyable;
      row.row.classList.toggle('locked', !unlocked);
      row.row.classList.toggle('unaffordable', !buyable && !isSlotMaxed(slots, upgrade));
      setText(row.level, `${upgrades[upgrade]}/${def.maxLevel}`);
      setText(row.effect, unlocked ? describe(slots, upgrade) : 'Requiere el zombi');
      setText(row.buy, isSlotMaxed(slots, upgrade) ? 'MÁX' : formatNumber(slotNextCost(slots, upgrade) ?? 0));
      row.buy.disabled = !buyable;
    }
    ui.drawers[id].dot.hidden = !anyBuyable;
  }
}

function describe(slots: SlotsState, id: SlotUpgradeId): string {
  const lvl = slots.upgrades[id];
  const maxed = isSlotMaxed(slots, id);
  const arrow = (now: string, next: string) => (maxed ? now : `${now} → ${next}`);
  switch (id) {
    case 'luck':
      return arrow(`Premio ${formatPercent(slotLuckChance(lvl))}`, formatPercent(slotLuckChance(lvl + 1)));
    case 'maxBet':
      return arrow(`Techo ${formatNumber(slotMaxBet(lvl))}`, formatNumber(slotMaxBet(lvl + 1)));
    case 'jackpot':
      return arrow(`Jackpot ${formatPercent(slotJackpotChance(slots.upgrades.luck, lvl), 2)}`, formatPercent(slotJackpotChance(slots.upgrades.luck, lvl + 1), 2));
    case 'hold':
      return lvl === 0
        ? `Retener carrete (extra ${formatPercent(CONFIG.slots.hold.feeFraction, 0)})`
        : arrow(`Salva ${formatPercent(holdShare(lvl), 0)} de las pérdidas`, formatPercent(holdShare(lvl + 1), 0));
    case 'zombie':
      return maxed ? 'Contratado' : 'Juega por ti';
    case 'helperSpeed':
      return arrow(`Cada ${formatSeconds(zombieInterval(lvl), 2)}`, formatSeconds(zombieInterval(lvl + 1), 2));
    case 'helperProfile': {
      const next = CONFIG.slots.helper.profiles[lvl + 1];
      return maxed || !next ? 'Todos los perfiles' : `Desbloquea ${next.name.toLowerCase()}`;
    }
    case 'helperLuck':
      return arrow(`+${formatPercent(zombieLuckBonus(lvl))}`, `+${formatPercent(zombieLuckBonus(lvl + 1))}`);
    case 'rag':
      return maxed ? '2 objetos por clic' : 'Limpia 2 por clic';
    case 'toolbox':
      return arrow(`Valor x${factor(lvl)}`, `x${factor(lvl + 1)}`);
    case 'apprentice':
      return lvl === 0 ? `Limpia solo cada ${formatSeconds(apprenticeInterval(1))}` : arrow(`Cada ${formatSeconds(apprenticeInterval(lvl))}`, formatSeconds(apprenticeInterval(lvl + 1)));
  }
}

function factor(level: number): string {
  return (1 + CONFIG.slots.work.valuePerLevel * level).toFixed(1).replace('.', ',');
}

export function isDrawer2Open(ui: Ui2, id: Drawer2Id): boolean {
  return ui.drawers[id].root.dataset.open === 'true';
}

export function toggleDrawer2(ui: Ui2, id: Drawer2Id): void {
  ui.drawers[id].root.dataset.open = String(!isDrawer2Open(ui, id));
}

export function closeDrawers2(ui: Ui2): void {
  for (const id of Object.keys(DRAWERS2) as Drawer2Id[]) ui.drawers[id].root.dataset.open = 'false';
}
