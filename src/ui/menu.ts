import { creditsLines, type CreditLine } from '../content/credits.es';
import { GAME_VERSION } from '../game/config';
import { reportMailto } from '../game/contact';
import type { ContinueInfo, MenuItem } from '../game/menu';
import { menuDensity } from '../game/menuLayout';
import type { CrtSetting, Settings } from '../game/settings';
import { formatTime } from '../util/format';
import { setText } from './render';

const ref = <T extends HTMLElement = HTMLElement>(root: HTMLElement, name: string) => root.querySelector<T>(`[data-ref="${name}"]`)!;

// ---------------------------------------------------------------------------
// Menú principal (sobre la portada)

const ITEM_LABELS: Record<MenuItem, string> = {
  continue: 'Continuar',
  newGame: 'Nueva partida',
  settings: 'Ajustes',
  ranking: 'Ranking',
  account: 'Cuenta',
  ending: 'Ver final',
  demo: 'Modo demo',
  credits: 'Créditos',
};

export interface MenuUi {
  root: HTMLElement;
  list: HTMLElement;
  items: Record<MenuItem, HTMLButtonElement>;
  continueInfo: HTMLElement;
  account: HTMLElement;
  fullscreen: HTMLButtonElement;
  /** Indicador «más abajo» cuando el menú no cabe y tiene scroll. */
  more: HTMLElement;
  /** Submenú de la cuenta (con sesión): nombre, Sincronizar partida, Cerrar sesión y Volver. */
  accountMenu: HTMLElement;
  accountName: HTMLElement;
  sync: HTMLButtonElement;
  logout: HTMLButtonElement;
  accountBack: HTMLButtonElement;
}

export function mountMenu(root: HTMLElement): MenuUi {
  const sub = (id: MenuItem) =>
    id === 'continue'
      ? '<span class="menu-sub" data-ref="continueInfo"></span>'
      : id === 'demo'
        ? '<span class="menu-inline"> · sin jugar</span><span class="menu-sub">Ver todas las mesas sin jugar</span>'
        : '';
  const buttons = (Object.keys(ITEM_LABELS) as MenuItem[])
    .map((id) => `<button class="nav-item title-option" data-item="${id}">${ITEM_LABELS[id]}${sub(id)}</button>`)
    .join('');
  root.innerHTML = `
    <div class="title-screen">
      <nav class="title-menu" data-ref="list" aria-label="Menú principal">${buttons}</nav>
      <nav class="title-menu account-menu" data-ref="accountMenu" aria-label="Cuenta" hidden>
        <p class="title-menu-head">Cuenta<span class="title-menu-name" data-ref="accountName"></span></p>
        <button class="nav-item title-option" data-ref="sync">Sincronizar partida</button>
        <button class="nav-item title-option" data-ref="logout">Cerrar sesión</button>
        <button class="nav-item title-option" data-ref="accountBack">Volver (Esc)</button>
      </nav>
      <span class="title-more" data-ref="more" aria-hidden="true" hidden>▾ más</span>
      <p class="title-account" data-ref="account"></p>
      <span class="title-version">v${GAME_VERSION}</span>
      <button class="corner-button" data-ref="fullscreen" title="Pantalla completa (F)">Pantalla completa</button>
    </div>`;
  const items = Object.fromEntries(
    (Object.keys(ITEM_LABELS) as MenuItem[]).map((id) => [id, root.querySelector<HTMLButtonElement>(`[data-item="${id}"]`)!]),
  ) as Record<MenuItem, HTMLButtonElement>;
  const ui: MenuUi = {
    root,
    list: ref(root, 'list'),
    items,
    continueInfo: ref(root, 'continueInfo'),
    account: ref(root, 'account'),
    fullscreen: ref(root, 'fullscreen'),
    more: ref(root, 'more'),
    accountMenu: ref(root, 'accountMenu'),
    accountName: ref(root, 'accountName'),
    sync: ref(root, 'sync'),
    logout: ref(root, 'logout'),
    accountBack: ref(root, 'accountBack'),
  };
  ui.list.addEventListener('scroll', () => updateMoreHint(ui));
  return ui;
}

/** Línea pequeña bajo Continuar: mesa actual, tiempo jugado y estado de la deuda. */
export function continueLine(info: ContinueInfo): string {
  const debt = info.finished ? 'casa saldada' : info.debtPaid ? 'deuda saldada' : `deuda ${Math.floor(info.debtProgress * 100)}%`;
  return `Mesa ${info.activeTable} · ${formatTime(info.playTime)} · ${debt}`;
}

/** «▾ más» solo si el menú tiene scroll y queda algo por debajo. */
export function updateMoreHint(ui: MenuUi): void {
  const nav = ui.accountMenu.hidden ? ui.list : ui.accountMenu;
  ui.more.hidden = !(nav.scrollHeight > nav.clientHeight + 1 && nav.scrollTop + nav.clientHeight < nav.scrollHeight - 1);
}

/**
 * Enseña solo las opciones que tocan, en su orden, con la densidad que cabe (menuLayout.ts), la línea de Continuar
 * y la sesión abajo a la izquierda. Cierra el submenú de la cuenta.
 */
export function renderMenu(ui: MenuUi, items: MenuItem[], info: ContinueInfo | null, displayName: string | null): void {
  for (const [id, button] of Object.entries(ui.items) as [MenuItem, HTMLButtonElement][]) button.hidden = !items.includes(id);
  items.forEach((id) => ui.list.append(ui.items[id]));
  ui.list.classList.toggle('compact', menuDensity(items) === 'compact');
  setText(ui.account, displayName ? `Sesión: ${displayName}` : '');
  ui.account.hidden = !displayName;
  setText(ui.accountName, displayName ?? '');
  if (info) setText(ui.continueInfo, continueLine(info));
  showAccountMenu(ui, false);
}

/** Abre o cierra el submenú de la cuenta (ocupa el sitio del menú principal). */
export function showAccountMenu(ui: MenuUi, open: boolean): void {
  ui.accountMenu.hidden = !open;
  ui.list.hidden = open;
  ui.list.scrollTop = 0;
  updateMoreHint(ui);
}

// ---------------------------------------------------------------------------
// Ajustes

export type SettingRow = 'volume' | 'crt' | 'fullscreen' | 'dialogues' | 'muted';

export interface SettingsUi {
  root: HTMLElement;
  rows: Record<SettingRow, HTMLElement>;
  values: Record<SettingRow, HTMLElement>;
  volumeDown: HTMLButtonElement;
  volumeUp: HTMLButtonElement;
  exportSave: HTMLButtonElement;
  importSave: HTMLButtonElement;
  importFile: HTMLInputElement;
  deleteSave: HTMLButtonElement;
  saveNote: HTMLElement;
  account: HTMLElement;
  accountName: HTMLElement;
  exportData: HTMLButtonElement;
  deleteAccount: HTMLButtonElement;
  report: HTMLAnchorElement;
  back: HTMLButtonElement;
}

const CRT_LABELS: Record<CrtSetting, string> = { apagado: 'Apagado', suave: 'Suave', fuerte: 'Fuerte' };

export function mountSettings(root: HTMLElement): SettingsUi {
  const row = (id: SettingRow, label: string, extra = '') =>
    `<div class="nav-item setting-row" role="button" tabindex="-1" data-row="${id}"><span>${label}</span>${extra}<span class="setting-value" data-value="${id}"></span></div>`;
  root.innerHTML = `
    <section class="panel pixel-panel settings-panel">
      <h1>Ajustes</h1>
      <div class="settings-list">
        ${row('volume', 'Volumen', '<span class="steps"><button class="step" data-ref="volumeDown" tabindex="-1" aria-label="Bajar volumen">-</button><button class="step" data-ref="volumeUp" tabindex="-1" aria-label="Subir volumen">+</button></span>')}
        ${row('crt', 'Filtro CRT')}
        ${row('fullscreen', 'Iniciar en pantalla completa')}
        ${row('dialogues', 'Diálogos de los prestamistas')}
        ${row('muted', 'Silencio (N)')}
        <div class="settings-actions">
          <button class="nav-item pixel-button" data-ref="exportSave">Exportar partida</button>
          <button class="nav-item pixel-button" data-ref="importSave">Importar partida</button>
          <button class="nav-item pixel-button danger" data-ref="deleteSave">Borrar partida</button>
        </div>
        <input type="file" accept="application/json,.json" data-ref="importFile" hidden />
        <p class="settings-note" data-ref="saveNote"></p>
        <div class="settings-account" data-ref="account" hidden>
          <p class="settings-account-name" data-ref="accountName"></p>
          <div class="settings-actions">
            <button class="nav-item pixel-button" data-ref="exportData">Exportar mis datos</button>
            <button class="nav-item pixel-button danger" data-ref="deleteAccount">Borrar cuenta y datos</button>
          </div>
        </div>
        <div class="settings-footer">
          <button class="nav-item pixel-button back" data-ref="back">Volver (Esc)</button>
          <span class="settings-links">
            <a class="settings-link" data-ref="report" href="${reportMailto(GAME_VERSION, navigator.userAgent)}"
              title="Abre tu programa de correo con el mensaje preparado: no se envía nada automáticamente">Reportar un problema</a>
            <a class="settings-link" href="/privacidad.html" target="_blank" rel="noopener">Privacidad</a>
          </span>
        </div>
      </div>
    </section>`;
  const ids: SettingRow[] = ['volume', 'crt', 'fullscreen', 'dialogues', 'muted'];
  return {
    root,
    rows: Object.fromEntries(ids.map((id) => [id, root.querySelector(`[data-row="${id}"]`)!])) as Record<SettingRow, HTMLElement>,
    values: Object.fromEntries(ids.map((id) => [id, root.querySelector(`[data-value="${id}"]`)!])) as Record<SettingRow, HTMLElement>,
    volumeDown: ref(root, 'volumeDown'),
    volumeUp: ref(root, 'volumeUp'),
    exportSave: ref(root, 'exportSave'),
    importSave: ref(root, 'importSave'),
    importFile: ref(root, 'importFile'),
    deleteSave: ref(root, 'deleteSave'),
    saveNote: ref(root, 'saveNote'),
    account: ref(root, 'account'),
    accountName: ref(root, 'accountName'),
    exportData: ref(root, 'exportData'),
    deleteAccount: ref(root, 'deleteAccount'),
    report: ref(root, 'report'),
    back: ref(root, 'back'),
  };
}

/** Bloque de la cuenta en Ajustes: solo con la sesión iniciada. */
export function renderAccount(ui: SettingsUi, playerName: string | null): void {
  ui.account.hidden = playerName === null;
  setText(ui.accountName, playerName ? `Cuenta: ${playerName}` : '');
}

/** `demo`: la partida en curso es la del modo demo: exportar, importar y borrar quedan desactivados (actúan sobre la normal). */
export function renderSettings(ui: SettingsUi, settings: Settings, hasSave: boolean, demo = false): void {
  const yesNo = (v: boolean) => (v ? 'Sí' : 'No');
  setText(ui.values.volume, `${Math.round(settings.volume * 100)}%`);
  setText(ui.values.crt, CRT_LABELS[settings.crt]);
  setText(ui.values.fullscreen, yesNo(settings.startFullscreen));
  setText(ui.values.dialogues, yesNo(settings.dialogues));
  setText(ui.values.muted, yesNo(settings.muted));
  ui.deleteSave.disabled = !hasSave || demo;
  ui.exportSave.disabled = !hasSave || demo;
  ui.importSave.disabled = demo;
}

// ---------------------------------------------------------------------------
// Créditos

/** Las líneas de los créditos como HTML (las mismas en el menú y en el final). */
export function creditsHtml(lines: CreditLine[] = creditsLines()): string {
  const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
  return lines
    .map((line) => {
      if (line.kind === 'link') return `<p class="credit-link"><a href="${esc(line.href ?? '')}" target="_blank" rel="noopener">${esc(line.text)}</a></p>`;
      const tag = line.kind === 'title' ? 'h1' : line.kind === 'heading' ? 'h2' : 'p';
      return `<${tag} class="credit-${line.kind}">${esc(line.text)}</${tag}>`;
    })
    .join('');
}

export interface CreditsUi {
  root: HTMLElement;
  back: HTMLButtonElement;
}

export function mountCredits(root: HTMLElement): CreditsUi {
  root.innerHTML = `
    <section class="panel pixel-panel credits-panel">
      <div class="credits-body">${creditsHtml()}</div>
      <button class="nav-item pixel-button back" data-ref="back">Volver (Esc)</button>
    </section>`;
  return { root, back: ref(root, 'back') };
}

// ---------------------------------------------------------------------------
// Pausa (dentro de la partida)

export interface PauseUi {
  root: HTMLElement;
  resume: HTMLButtonElement;
  settings: HTMLButtonElement;
  toMenu: HTMLButtonElement;
}

export function mountPause(parent: HTMLElement): PauseUi {
  const root = document.createElement('div');
  root.className = 'pause-layer';
  root.hidden = true;
  root.innerHTML = `
    <section class="panel pixel-panel pause-panel" aria-label="Pausa">
      <h1>Pausa</h1>
      <button class="nav-item pixel-button" data-ref="resume">Reanudar</button>
      <button class="nav-item pixel-button" data-ref="settings">Ajustes</button>
      <button class="nav-item pixel-button" data-ref="toMenu">Menú principal</button>
      <p class="pause-note">Se guarda al salir al menú.</p>
    </section>`;
  parent.append(root);
  return { root, resume: ref(root, 'resume'), settings: ref(root, 'settings'), toMenu: ref(root, 'toMenu') };
}
