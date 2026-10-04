import { maxBet } from '../game/betting';
import { CONFIG, UPGRADE_IDS, type UpgradeId } from '../game/config';
import { canPayDebt, debtProgress } from '../game/debt';
import { hasHelper, helperBetAmount, helperInterval, helperLuckBonus, helperProfile } from '../game/helper';
import { betWinChance, effectiveWinChance, jackpotChance, luckChance } from '../game/luck';
import type { GameState } from '../game/state';
import { canBuy, isMaxed, isUnlocked, nextCost } from '../game/upgrades';
import { bagMultiplier, cleanerInterval } from '../game/work';
import { formatNumber, formatPercent, formatSeconds, formatTime } from '../util/format';


export interface ShopRow {
  row: HTMLElement;
  level: HTMLElement;
  effect: HTMLElement;
  buy: HTMLButtonElement;
}

export interface Ui {
  balance: HTMLElement;
  playTime: HTMLElement;
  stats: HTMLElement;
  debtText: HTMLElement;
  debtFill: HTMLElement;
  payDebt: HTMLButtonElement;
  debtNote: HTMLElement;
  /** Mensaje del servidor al registrar la deuda saldada (lo escribe main.ts). */
  debtOnline: HTMLElement;
  fullscreen: HTMLButtonElement;
  toast: HTMLElement;
  tooltip: HTMLElement;
  panelToggle: HTMLButtonElement;
  panel: HTMLElement;
  workInfo: HTMLElement;
  helperLocked: HTMLElement;
  helperPanel: HTMLElement;
  profileButtons: HTMLButtonElement[];
  helperInfo: HTMLElement;
  shop: Record<UpgradeId, ShopRow>;
  saveStatus: HTMLElement;
  toMenu: HTMLButtonElement;
}

/** Monta la interfaz provisional y devuelve las referencias que se repintan. */
export function mountUi(root: HTMLElement): Ui {
  root.innerHTML = `
    <div class="hud">
      <div class="hud-balance">FICHAS <strong data-ref="balance">0</strong></div>
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

    <div class="tooltip pixel-frame" data-ref="tooltip" hidden></div>
    <button class="temp-toggle small" data-ref="panelToggle">Controles</button>
    <div class="temp-panel pixel-frame" data-ref="panel" hidden>
        <section class="panel">
          <p class="muted">Tiempo <span data-ref="playTime">0:00</span> · <span data-ref="stats"></span></p>
          <p class="note" data-ref="debtNote"></p>
          <p class="muted" data-ref="debtOnline" role="status"></p>
        </section>

        <section class="panel">
          <h2>Trabajo: recoger basura</h2>
          <p>Haz clic en la basura del suelo, o pulsa <kbd>E</kbd> para recoger la más cercana.</p>
          <p class="muted" data-ref="workInfo"></p>
        </section>

        <section class="panel">
          <h2>Ayudante</h2>
          <p class="muted" data-ref="helperLocked">Compra el Crupier en la tienda para que apueste por ti.</p>
          <div data-ref="helperPanel">
            <div class="row">
              ${CONFIG.helper.profiles
                .map(
                  (p, i) =>
                    `<button class="chip" data-profile="${i}">${p.name}</button>`,
                )
                .join('')}
            </div>
            <p data-ref="helperInfo"></p>
          </div>
        </section>
        <section class="panel">
          <h2>Tienda</h2>
          <table class="shop">
            <tbody>
              ${UPGRADE_IDS.map(
                (id) => `
                <tr data-upgrade="${id}">
                  <td><div class="name">${CONFIG.upgrades[id].name}</div><div class="effect muted"></div></td>
                  <td class="level"></td>
                  <td><button class="buy"></button></td>
                </tr>`,
              ).join('')}
            </tbody>
          </table>
        </section>
        <p class="muted" data-ref="saveStatus"></p>
    </div>
  `;

  const ref = <T extends HTMLElement = HTMLElement>(name: string) => root.querySelector<T>(`[data-ref="${name}"]`)!;
  const shop = {} as Record<UpgradeId, ShopRow>;
  for (const id of UPGRADE_IDS) {
    const row = root.querySelector<HTMLElement>(`[data-upgrade="${id}"]`)!;
    shop[id] = {
      row,
      level: row.querySelector('.level')!,
      effect: row.querySelector('.effect')!,
      buy: row.querySelector('.buy')!,
    };
  }

  return {
    balance: ref('balance'),
    playTime: ref('playTime'),
    stats: ref('stats'),
    debtText: ref('debtText'),
    debtFill: ref('debtFill'),
    payDebt: ref('payDebt'),
    debtNote: ref('debtNote'),
    debtOnline: ref('debtOnline'),
    fullscreen: ref<HTMLButtonElement>('fullscreen'),
    toast: ref('toast'),
    tooltip: ref('tooltip'),
    panelToggle: ref<HTMLButtonElement>('panelToggle'),
    panel: ref('panel'),
    workInfo: ref('workInfo'),
    helperLocked: ref('helperLocked'),
    helperPanel: ref('helperPanel'),
    profileButtons: [...root.querySelectorAll<HTMLButtonElement>('[data-profile]')],
    helperInfo: ref('helperInfo'),
    shop,
    saveStatus: ref('saveStatus'),
    toMenu: ref('toMenu'),
  };
}

/** Pinta el HUD y los paneles con el estado actual. */
export function render(ui: Ui, state: GameState): void {
  const { upgrades } = state;

  setText(ui.balance, formatNumber(state.balance));
  setText(ui.playTime, formatTime(state.playTime));
  const winRate = state.stats.bets ? state.stats.wins / state.stats.bets : 0;
  setText(
    ui.stats,
    `${state.stats.bets} apuestas · ${formatPercent(winRate)} ganadas · ${state.stats.jackpots} Cero Dorado`,
  );

  // Deuda
  ui.debtFill.style.width = `${debtProgress(state) * 100}%`;
  setText(ui.debtText, state.debtPaid ? 'SALDADA' : `${formatPercent(debtProgress(state), 0)}`);
  ui.payDebt.disabled = !canPayDebt(state);
  ui.payDebt.hidden = state.debtPaid;
  setText(ui.debtNote, state.debtPaid ? 'Deuda saldada. La mesa 2 llegará en un hito posterior.' : '');

  // Trabajo
  const respawn = state.work.items.length < CONFIG.work.maxItems
    ? ` · otro en ${formatSeconds(CONFIG.work.respawnInterval - state.work.spawnTimer)}`
    : '';
  const extras = [
    upgrades.tweezers > 0 ? 'pinzas' : '',
    upgrades.bigBag > 0 ? `bolsa x${(bagMultiplier(state)).toFixed(1).replace('.', ',')}` : '',
    upgrades.cleaner > 0 ? `limpieza cada ${formatSeconds(cleanerInterval(upgrades.cleaner))}` : '',
  ].filter(Boolean);
  setText(
    ui.workInfo,
    `${state.work.items.length}/${CONFIG.work.maxItems} en el suelo${respawn}` +
      (state.work.lastItem ? ` · último: ${state.work.lastItem}` : '') +
      (extras.length ? ` · ${extras.join(', ')}` : ''),
  );

  // Ayudante
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
    const hFraction = hBet / maxBet(upgrades.maxBet);
    const hChance = effectiveWinChance(upgrades.luck, hFraction, helperLuckBonus(upgrades.helperLuck));
    const status =
      state.helper.lockout > 0
        ? `BLOQUEADO ${formatSeconds(state.helper.lockout)} (perdiste un TODO)`
        : hBet <= 0
          ? 'Esperando fichas'
          : `próxima en ${formatSeconds(Math.max(interval - state.helper.timer, 0))}`;
    setText(ui.helperInfo, `Apuesta cada ${formatSeconds(interval, 2)} · gana con un ${formatPercent(hChance)} · ${status}`);
  }

  // Tienda
  for (const id of UPGRADE_IDS) {
    const row = ui.shop[id];
    const def = CONFIG.upgrades[id];
    const unlocked = isUnlocked(state, id);
    row.row.classList.toggle('locked', !unlocked);
    setText(row.level, `${upgrades[id]}/${def.maxLevel}`);
    setText(row.effect, unlocked ? (describeUpgrade(state, id) ?? '') : 'Requiere el Crupier');
    const cost = nextCost(state, id);
    setText(row.buy, isMaxed(state, id) ? 'MÁX' : formatNumber(cost ?? 0));
    row.buy.disabled = !canBuy(state, id);
  }
}

function describeUpgrade(state: GameState, id: UpgradeId): string | undefined {
  const lvl = state.upgrades[id];
  const maxed = isMaxed(state, id);
  const arrow = (now: string, next: string) => (maxed ? now : `${now} → ${next}`);
  switch (id) {
    case 'luck':
      return arrow(`Prob. ${formatPercent(luckChance(lvl))}`, formatPercent(luckChance(lvl + 1)));
    case 'maxBet':
      return arrow(`Techo ${formatNumber(maxBet(lvl))}`, formatNumber(maxBet(lvl + 1)));
    case 'crupier':
      return maxed ? 'Ayudante contratado' : 'Desbloquea el ayudante';
    case 'helperSpeed':
      return arrow(`Cada ${formatSeconds(helperInterval(lvl), 2)}`, formatSeconds(helperInterval(lvl + 1), 2));
    case 'helperProfile': {
      const next = CONFIG.helper.profiles[lvl + 1];
      return maxed || !next ? 'Todos los perfiles' : `Desbloquea ${next.name} (${formatPercent(next.fraction, 0)})`;
    }
    case 'helperLuck':
      return arrow(`+${formatPercent(helperLuckBonus(lvl))}`, `+${formatPercent(helperLuckBonus(lvl + 1))}`);
    case 'jackpot':
      return arrow(
        `Cero Dorado ${formatPercent(jackpotChance(state.upgrades.luck, lvl), 2)}`,
        formatPercent(jackpotChance(state.upgrades.luck, lvl + 1), 2),
      );
    case 'dozenBet':
      return maxed ? 'Docena desbloqueada' : `Paga 2:1 · prob. ${formatPercent(betWinChance('dozen', state.upgrades.luck, 0))} sin riesgo`;
    case 'tweezers':
      return maxed ? 'Recoges 2 objetos por clic' : 'Recoge 2 objetos por clic';
    case 'bigBag':
      return arrow(`Valor x${bagFactor(lvl)}`, `x${bagFactor(lvl + 1)}`);
    case 'cleaner':
      return lvl === 0
        ? `Recoge solo cada ${formatSeconds(cleanerInterval(1))}`
        : arrow(`Cada ${formatSeconds(cleanerInterval(lvl))}`, formatSeconds(cleanerInterval(lvl + 1)));
    case 'numberBet':
      return maxed ? 'Número desbloqueado' : `Paga 35:1 · prob. ${formatPercent(betWinChance('number', state.upgrades.luck, 0))} sin riesgo`;
  }
}

function bagFactor(level: number): string {
  return (1 + CONFIG.work.bagValuePerLevel * level).toFixed(1).replace('.', ',');
}

/** Solo toca el DOM si el texto ha cambiado. */
export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}
