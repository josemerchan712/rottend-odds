import { CONFIG, type DiceUpgradeId } from '../game/config';
import { diceJackpotChance, diceLuckChance, diceMaxBet, maxRerolls, rerollInterval, targetChance } from '../game/dice/game';
import type { DiceState } from '../game/dice/state';
import {
  busboyInterval,
  canBuyDice,
  canPayDiceDebt,
  cartMultiplier,
  diceDebtProgress,
  diceNextCost,
  dicePassiveRate,
  ghostBet,
  ghostInterval,
  ghostLuckBonus,
  ghostProfile,
  hasGhost,
  isDiceMaxed,
  isDiceUpgradeUnlocked,
} from '../game/dice/table';
import type { GameState } from '../game/state';
import { formatNumber, formatPercent, formatSeconds, formatTime } from '../util/format';
import { setText, TABS_HTML, type Drawer } from './render';

/** HUD y cajones de la mesa 3, con la misma forma que los de las mesas 1 y 2. */
export const DRAWERS3 = {
  mesa: { upgrades: ['luck', 'maxBet', 'jackpot', 'hardTargets', 'boxcars'] as DiceUpgradeId[] },
  ayuda: { upgrades: ['ghost', 'helperSpeed', 'helperProfile', 'helperLuck', 'tray', 'cart', 'busboy'] as DiceUpgradeId[] },
} as const;
export type Drawer3Id = keyof typeof DRAWERS3;

interface ShopRow {
  row: HTMLElement;
  level: HTMLElement;
  effect: HTMLElement;
  buy: HTMLButtonElement;
}

export interface Ui3 {
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
  drawers: Record<Drawer3Id, Drawer>;
  shop: Record<DiceUpgradeId, ShopRow>;
  stats: HTMLElement;
  statsToggle: HTMLButtonElement;
  statsBody: HTMLElement;
  helperLocked: HTMLElement;
  helperPanel: HTMLElement;
  profileButtons: HTMLButtonElement[];
  helperInfo: HTMLElement;
  workInfo: HTMLElement;
}

function shopRows(ids: readonly DiceUpgradeId[]): string {
  return ids
    .map(
      (id) => `
      <div class="shop-row" data-upgrade3="${id}">
        <div class="shop-line"><span class="name">${CONFIG.dice.upgrades[id].name}</span><span class="level"></span></div>
        <div class="shop-line"><span class="effect"></span><button class="buy small"></button></div>
      </div>`,
    )
    .join('');
}

export function mountUi3(root: HTMLElement): Ui3 {
  root.innerHTML = `
    <div class="hud">
      <div class="hud-balance">CHAPAS <strong data-ref="balance">0</strong></div>${TABS_HTML}
      <div class="hud-passive" data-ref="passive" title="Chapas por segundo que llegan de la mesa 2"></div>
      <div class="hud-debt" title="Deuda con el Barman">
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
        ${shopRows(DRAWERS3.mesa.upgrades)}
        <button class="stats-toggle small" data-ref="statsToggle">Estadísticas ▸</button>
        <div class="stats" data-ref="statsBody" hidden><div data-ref="stats"></div></div>
      </div>
      <button class="drawer-tab" title="Mesa (M)"><span>MESA</span><i class="dot" hidden></i></button>
    </aside>

    <aside class="drawer right" data-drawer="ayuda" data-open="false">
      <button class="drawer-tab" title="Ayuda (A)"><span>AYUDA</span><i class="dot" hidden></i></button>
      <div class="drawer-body pixel-frame">
        <h2>Ayuda <span class="muted">(A)</span></h2>
        <p class="muted small-text" data-ref="helperLocked">Contrata al camarero fantasma para que tire por ti.</p>
        <div data-ref="helperPanel">
          <div class="row profiles">
            ${CONFIG.dice.helper.profiles.map((p, i) => `<button class="chip small" data-profile3="${i}">${p.name}</button>`).join('')}
          </div>
          <p class="small-text" data-ref="helperInfo"></p>
        </div>
        ${shopRows(DRAWERS3.ayuda.upgrades.slice(0, 4))}
        <h2 class="drawer-sub">Trastienda</h2>
        <p class="small-text muted" data-ref="workInfo"></p>
        ${shopRows(DRAWERS3.ayuda.upgrades.slice(4))}
      </div>
    </aside>
  `;
  const ref = <T extends HTMLElement = HTMLElement>(name: string) => root.querySelector<T>(`[data-ref="${name}"]`)!;
  const shop = {} as Record<DiceUpgradeId, ShopRow>;
  for (const id of [...DRAWERS3.mesa.upgrades, ...DRAWERS3.ayuda.upgrades]) {
    const row = root.querySelector<HTMLElement>(`[data-upgrade3="${id}"]`)!;
    shop[id] = { row, level: row.querySelector('.level')!, effect: row.querySelector('.effect')!, buy: row.querySelector('.buy')! };
  }
  const drawer = (id: Drawer3Id): Drawer => {
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
    profileButtons: [...root.querySelectorAll<HTMLButtonElement>('[data-profile3]')],
    helperInfo: ref('helperInfo'),
    workInfo: ref('workInfo'),
  };
}

export function render3(ui: Ui3, state: GameState): void {
  const dice = state.dice;
  const { upgrades } = dice;
  setText(ui.balance, formatNumber(dice.balance));
  setText(ui.passive, `+${formatNumber(dicePassiveRate(state))}/s de la mesa 2`);
  ui.debtFill.style.width = `${diceDebtProgress(dice) * 100}%`;
  setText(ui.debtText, dice.debtPaid ? 'SALDADA' : formatPercent(diceDebtProgress(dice), 0));
  ui.payDebt.hidden = !canPayDiceDebt(dice);

  const winRate = dice.stats.rolls ? dice.stats.wins / dice.stats.rolls : 0;
  setText(
    ui.stats,
    `Tiempo en la mesa ${formatTime(dice.playTime)} · ${dice.stats.rolls} tiradas · ${formatPercent(winRate)} aciertos · ${dice.stats.rerolls} relanzamientos (${dice.stats.rerollWins} salvados) · ${dice.stats.jackpots} jackpots · ${formatNumber(dice.stats.passiveEarned)} de la mesa 2`,
  );

  const extras = [
    upgrades.tray > 0 ? 'bandeja' : '',
    upgrades.cart > 0 ? `carrito x${cartMultiplier(dice).toFixed(1).replace('.', ',')}` : '',
    upgrades.busboy > 0 ? `friegaplatos cada ${formatSeconds(busboyInterval(upgrades.busboy))}` : '',
  ].filter(Boolean);
  setText(ui.workInfo, `${dice.work.items.length}/${CONFIG.dice.work.maxItems} en el suelo${extras.length ? ` · ${extras.join(', ')}` : ''}`);

  const on = hasGhost(dice);
  ui.helperLocked.hidden = on;
  ui.helperPanel.hidden = !on;
  if (on) {
    const profile = ghostProfile(dice);
    ui.profileButtons.forEach((b, i) => {
      b.disabled = i > upgrades.helperProfile;
      b.classList.toggle('active', CONFIG.dice.helper.profiles[i] === profile);
    });
    const bet = ghostBet(dice);
    const chance = targetChance('par', upgrades.luck, bet / diceMaxBet(upgrades.maxBet), ghostLuckBonus(upgrades.helperLuck));
    setText(ui.helperInfo, `Tira cada ${formatSeconds(ghostInterval(upgrades.helperSpeed), 2)} · ${bet <= 0 ? 'esperando chapas' : `acierta par el ${formatPercent(chance)}`}`);
  }

  for (const id of Object.keys(DRAWERS3) as Drawer3Id[]) {
    let anyBuyable = false;
    for (const upgrade of DRAWERS3[id].upgrades) {
      const row = ui.shop[upgrade];
      const def = CONFIG.dice.upgrades[upgrade];
      const unlocked = isDiceUpgradeUnlocked(dice, upgrade);
      const buyable = canBuyDice(dice, upgrade);
      anyBuyable ||= buyable;
      row.row.classList.toggle('locked', !unlocked);
      row.row.classList.toggle('unaffordable', !buyable && !isDiceMaxed(dice, upgrade));
      setText(row.level, `${upgrades[upgrade]}/${def.maxLevel}`);
      setText(row.effect, unlocked ? describe(dice, upgrade) : 'Requiere el camarero');
      setText(row.buy, isDiceMaxed(dice, upgrade) ? 'MÁX' : formatNumber(diceNextCost(dice, upgrade) ?? 0));
      row.buy.disabled = !buyable;
    }
    ui.drawers[id].dot.hidden = !anyBuyable;
  }
}

function describe(dice: DiceState, id: DiceUpgradeId): string {
  const lvl = dice.upgrades[id];
  const maxed = isDiceMaxed(dice, id);
  const arrow = (now: string, next: string) => (maxed ? now : `${now} → ${next}`);
  switch (id) {
    case 'luck':
      return maxed
        ? `Par ${formatPercent(diceLuckChance(lvl))} · ${maxRerolls(lvl)} relanz.`
        : `Par ${formatPercent(diceLuckChance(lvl))} → ${formatPercent(diceLuckChance(lvl + 1))} · relanz. ${maxRerolls(lvl)} cada ${formatSeconds(rerollInterval(lvl))}`;
    case 'maxBet':
      return arrow(`Techo ${formatNumber(diceMaxBet(lvl))}`, formatNumber(diceMaxBet(lvl + 1)));
    case 'jackpot':
      return arrow(`Jackpot ${formatPercent(diceJackpotChance(dice.upgrades.luck, lvl), 2)}`, formatPercent(diceJackpotChance(dice.upgrades.luck, lvl + 1), 2));
    case 'hardTargets':
      return maxed ? 'Más de 9 y doble (5:1)' : 'Desbloquea más de 9 y doble (5:1)';
    case 'boxcars':
      return maxed ? 'Doble seis (35:1)' : 'Desbloquea el doble seis (35:1)';
    case 'ghost':
      return maxed ? 'Contratado' : 'Tira por ti';
    case 'helperSpeed':
      return arrow(`Cada ${formatSeconds(ghostInterval(lvl), 2)}`, formatSeconds(ghostInterval(lvl + 1), 2));
    case 'helperProfile': {
      const next = CONFIG.dice.helper.profiles[lvl + 1];
      return maxed || !next ? 'Todos los perfiles' : `Desbloquea ${next.name.toLowerCase()}`;
    }
    case 'helperLuck':
      return arrow(`+${formatPercent(ghostLuckBonus(lvl))}`, `+${formatPercent(ghostLuckBonus(lvl + 1))}`);
    case 'tray':
      return maxed ? '2 objetos por clic' : 'Recoge 2 por clic';
    case 'cart':
      return arrow(`Valor x${factor(lvl)}`, `x${factor(lvl + 1)}`);
    case 'busboy':
      return lvl === 0 ? `Recoge solo cada ${formatSeconds(busboyInterval(1))}` : arrow(`Cada ${formatSeconds(busboyInterval(lvl))}`, formatSeconds(busboyInterval(lvl + 1)));
  }
}

function factor(level: number): string {
  return (1 + CONFIG.dice.work.valuePerLevel * level).toFixed(1).replace('.', ',');
}

export function toggleDrawer3(ui: Ui3, id: Drawer3Id): void {
  ui.drawers[id].root.dataset.open = String(ui.drawers[id].root.dataset.open !== 'true');
}

export function closeDrawers3(ui: Ui3): void {
  for (const id of Object.keys(DRAWERS3) as Drawer3Id[]) ui.drawers[id].root.dataset.open = 'false';
}
