import { isBetTypeUnlocked, maxBet, playerBetAmount } from '../game/betting';
import { CONFIG, UPGRADE_IDS, type BetType, type UpgradeId } from '../game/config';
import { canPayDebt, debtProgress } from '../game/debt';
import { hasHelper, helperBetAmount, helperInterval, helperLuckBonus, helperProfile } from '../game/helper';
import { betWinChance, effectiveWinChance, expectedValue, jackpotChance, luckChance, riskPenalty } from '../game/luck';
import { slotColor } from '../game/roulette';
import type { BetChoice, GameState, SpinResult } from '../game/state';
import { canBuy, isMaxed, isUnlocked, nextCost } from '../game/upgrades';
import { bagMultiplier, cleanerInterval } from '../game/work';
import { formatNumber, formatPercent, formatSeconds, formatTime } from '../util/format';

const FRACTION_LABELS = ['1%', '10%', '50%', 'TODO'];

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
  fractionButtons: HTMLButtonElement[];
  betInfo: HTMLElement;
  chanceInfo: HTMLElement;
  jackpotInfo: HTMLElement;
  betBlack: HTMLButtonElement;
  betWhite: HTMLButtonElement;
  dozenRow: HTMLElement;
  dozenButtons: HTMLButtonElement[];
  numberRow: HTMLElement;
  numberInput: HTMLInputElement;
  betNumber: HTMLButtonElement;
  lastSpin: HTMLElement;
  spinLog: HTMLElement;
  fullscreen: HTMLButtonElement;
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
      <div class="hud-buttons">
        <button data-ref="payDebt" class="gold small">Pagar deuda</button>
        <button data-ref="fullscreen" class="small" title="Pantalla completa (F)">Pantalla completa</button>
        <button data-ref="toMenu" class="small">Menú</button>
      </div>
    </div>

    <button class="temp-toggle small" data-ref="panelToggle">Controles</button>
    <div class="temp-panel pixel-frame" data-ref="panel" hidden>
        <section class="panel">
          <p class="muted">Tiempo <span data-ref="playTime">0:00</span> · <span data-ref="stats"></span></p>
          <p class="note" data-ref="debtNote"></p>
          <p class="muted" data-ref="debtOnline" role="status"></p>
        </section>

        <section class="panel">
          <h2>Ruleta</h2>
          <div class="row" data-ref="fractions">
            ${FRACTION_LABELS.map((l, i) => `<button class="chip" data-fraction="${i}">${l}</button>`).join('')}
          </div>
          <p data-ref="betInfo"></p>
          <p data-ref="chanceInfo"></p>
          <p class="muted" data-ref="jackpotInfo"></p>
          <div class="row">
            <button data-ref="betBlack" class="bet black">Apostar a NEGRO</button>
            <button data-ref="betWhite" class="bet white">Apostar a BLANCO</button>
          </div>
          <div class="row" data-ref="dozenRow">
            ${[1, 2, 3].map((d) => `<button data-dozen="${d}">${d}ª docena (${d * 12 - 11}-${d * 12})</button>`).join('')}
          </div>
          <div class="row" data-ref="numberRow">
            <label>Número <input type="number" min="1" max="36" value="17" data-ref="numberInput" /></label>
            <button data-ref="betNumber">Apostar al número</button>
          </div>
          <div class="last-spin" data-ref="lastSpin">Aún no has apostado.</div>
          <ol class="spin-log" data-ref="spinLog"></ol>
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
                    `<button class="chip" data-profile="${i}" title="Apuesta el ${formatPercent(p.fraction, 0)} del techo, como mucho el ${formatPercent(p.maxBalanceFraction, 0)} de tu saldo">${p.name} ${formatPercent(p.fraction, 0)} · máx. ${formatPercent(p.maxBalanceFraction, 0)} saldo</button>`,
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
    fractionButtons: [...root.querySelectorAll<HTMLButtonElement>('[data-fraction]')],
    betInfo: ref('betInfo'),
    chanceInfo: ref('chanceInfo'),
    jackpotInfo: ref('jackpotInfo'),
    betBlack: ref('betBlack'),
    betWhite: ref('betWhite'),
    dozenRow: ref('dozenRow'),
    dozenButtons: [...root.querySelectorAll<HTMLButtonElement>('[data-dozen]')],
    numberRow: ref('numberRow'),
    numberInput: ref<HTMLInputElement>('numberInput'),
    betNumber: ref('betNumber'),
    lastSpin: ref('lastSpin'),
    spinLog: ref('spinLog'),
    fullscreen: ref<HTMLButtonElement>('fullscreen'),
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

/**
 * Pinta el estado. `revealedBets`: número de la última apuesta cuya bola ya ha caído en la escena;
 * las tiradas posteriores aún no se muestran para no adelantar el resultado.
 */
export function render(ui: Ui, state: GameState, revealedBets = Infinity): void {
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

  // Apuesta del jugador
  ui.fractionButtons.forEach((b, i) => b.classList.toggle('active', i === state.betFractionIndex));
  const bet = playerBetAmount(state);
  const ceiling = maxBet(upgrades.maxBet);
  const fraction = bet / ceiling;
  setText(
    ui.betInfo,
    bet > 0
      ? `Apuesta: ${formatNumber(bet)} ${bet === 1 ? 'ficha' : 'fichas'} (${formatPercent(fraction)} del techo de ${formatNumber(ceiling)})`
      : 'Sin fichas para apostar. Recoge basura.',
  );
  const base = luckChance(upgrades.luck);
  const penalty = riskPenalty(fraction, upgrades.luck);
  const chanceFor = (type: BetType) => {
    const p = formatPercent(betWinChance(type, upgrades.luck, fraction));
    const ev = expectedValue(type, bet, ceiling, upgrades.luck, upgrades.jackpot);
    const evText = ev >= 0 ? `+${formatNumber(ev)}` : `−${formatNumber(-ev)}`;
    return `${CONFIG.betTypes[type].name} ${p} (VE ${evText})`;
  };
  const types = (['color', 'dozen', 'number'] as const).filter((t) => isBetTypeUnlocked(state, t));
  setText(
    ui.chanceInfo,
    `Prob. de ganar: ${types.map(chanceFor).join(' · ')}  —  suerte ${formatPercent(base)} − riesgo ${formatPercent(penalty, 2)}`,
  );
  setText(
    ui.jackpotInfo,
    `Cero Dorado: ${formatPercent(jackpotChance(upgrades.luck, upgrades.jackpot), 2)} · paga x${CONFIG.jackpot.payoutMultiplier} (máx. ${formatNumber(CONFIG.debt.amount * CONFIG.jackpot.payoutCapDebtFraction)})`,
  );
  ui.betBlack.disabled = ui.betWhite.disabled = bet <= 0;
  ui.dozenRow.hidden = !isBetTypeUnlocked(state, 'dozen');
  ui.dozenButtons.forEach((b) => (b.disabled = bet <= 0));
  ui.numberRow.hidden = !isBetTypeUnlocked(state, 'number');
  ui.betNumber.disabled = bet <= 0;

  // Tiradas: solo las que ya han caído en la ruleta de la escena.
  const shownSpins = state.recentSpins.filter((_, i) => state.stats.bets - i <= revealedBets);
  const last = shownSpins[0];
  if (last) {
    setText(ui.lastSpin, describeSpin(last));
    ui.lastSpin.dataset.outcome = last.outcome;
  } else if (state.recentSpins.length) {
    setText(ui.lastSpin, 'La ruleta gira…');
    delete ui.lastSpin.dataset.outcome;
  }
  const log = shownSpins.slice(1).map(describeSpin).join('\n');
  if (ui.spinLog.dataset.log !== log) {
    ui.spinLog.dataset.log = log;
    ui.spinLog.innerHTML = shownSpins
      .slice(1)
      .map((s) => `<li class="${s.outcome}">${describeSpin(s)}</li>`)
      .join('');
  }

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
    const hFraction = hBet / ceiling;
    const hChance = effectiveWinChance(upgrades.luck, hFraction, helperLuckBonus(upgrades.helperLuck));
    const status =
      state.helper.lockout > 0
        ? `BLOQUEADO ${formatSeconds(state.helper.lockout)} (perdiste un TODO)`
        : hBet <= 0
          ? 'Esperando fichas'
          : `próxima en ${formatSeconds(Math.max(interval - state.helper.timer, 0))}`;
    setText(
      ui.helperInfo,
      `Apuesta ${formatNumber(hBet)} cada ${formatSeconds(interval, 2)} · prob. ${formatPercent(hChance)} · ${status}`,
    );
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

function describeSpin(s: SpinResult): string {
  const who = s.bettor === 'jugador' ? 'Tú' : 'Ayudante';
  const color = slotColor(s.slot);
  const slot = color === 'dorado' ? 'CERO DORADO' : color === 'verde' ? '0 verde' : `${color} ${s.slot}`;
  const delta = s.delta >= 0 ? `+${formatNumber(s.delta)}` : `−${formatNumber(-s.delta)}`;
  const capped = s.jackpotCapped ? ' (tope)' : '';
  return `${who}: ${formatNumber(s.bet)} a ${describeChoice(s.choice)} → sale ${slot} · ${delta}${capped} · (${formatPercent(s.winChance)})`;
}

function describeChoice(choice: BetChoice): string {
  switch (choice.type) {
    case 'color':
      return choice.color;
    case 'dozen':
      return `${choice.dozen}ª docena`;
    case 'number':
      return `número ${choice.number}`;
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
