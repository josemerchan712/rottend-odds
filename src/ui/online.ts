import type { CloudSave, RankingPage } from '../api/client';
import type { SaveFile } from '../game/save';
import { formatNumber, formatPercent, formatTime } from '../util/format';
import { CONFIG } from '../game/config';
import { setText } from './render';

const ref = <T extends HTMLElement>(root: HTMLElement, name: string) => root.querySelector<T>(`[data-ref="${name}"]`)!;

// ---------------------------------------------------------------------------
// Cuenta sin email: entrar, crear cuenta, restablecer la contraseña y código de recuperación

export type AuthMode = 'login' | 'register' | 'reset' | 'code';

export const REAL_NAME_WARNING = 'No uses tu nombre real: este nombre sale en el ranking público.';
export const RECOVERY_WARNING = 'Sin email no podemos recuperar tu cuenta: guarda este código.';

export interface AuthUi {
  form: HTMLFormElement;
  title: HTMLElement;
  intro: HTMLElement;
  name: HTMLInputElement;
  nameHint: HTMLElement;
  suggestions: HTMLElement;
  codeRow: HTMLElement;
  code: HTMLInputElement;
  passwordLabel: HTMLElement;
  password: HTMLInputElement;
  realNameWarning: HTMLElement;
  submit: HTMLButtonElement;
  message: HTMLElement;
  links: HTMLElement;
  toggle: HTMLButtonElement;
  forgot: HTMLButtonElement;
  back: HTMLButtonElement;
  codeBox: HTMLElement;
  codeValue: HTMLElement;
  copyCode: HTMLButtonElement;
  downloadCode: HTMLButtonElement;
  codeMessage: HTMLElement;
  codeDone: HTMLButtonElement;
}

export function mountAuth(root: HTMLElement): AuthUi {
  root.innerHTML = `
    <section class="panel menu auth">
      <h1 data-ref="title">Iniciar sesión</h1>
      <p class="muted" data-ref="intro"></p>
      <form data-ref="form" class="form" novalidate>
        <label>Nombre de jugador
          <input type="text" maxlength="20" autocomplete="username" autocapitalize="off" spellcheck="false" required data-ref="name" />
        </label>
        <p class="auth-hint" data-ref="nameHint" role="status" aria-live="polite"></p>
        <div class="suggestions" data-ref="suggestions" hidden></div>
        <label data-ref="codeRow" hidden>Código de recuperación
          <input type="text" maxlength="24" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX" data-ref="code" />
        </label>
        <label><span data-ref="passwordLabel">Contraseña</span>
          <input type="password" autocomplete="current-password" minlength="10" maxlength="128" required data-ref="password" />
        </label>
        <p class="auth-warning" data-ref="realNameWarning" hidden>${REAL_NAME_WARNING}</p>
        <button type="submit" data-ref="submit" class="gold">Entrar</button>
      </form>
      <p class="note" data-ref="message" role="status"></p>
      <div class="row spread" data-ref="links">
        <button type="button" data-ref="toggle" class="small"></button>
        <button type="button" data-ref="forgot" class="small">¿Contraseña olvidada?</button>
        <button type="button" data-ref="back" class="small">Volver</button>
      </div>
      <div data-ref="codeBox" class="recovery" hidden>
        <p class="auth-warning">${RECOVERY_WARNING}</p>
        <p class="recovery-code" data-ref="codeValue"></p>
        <p class="muted">Solo se muestra ahora. Con él y tu nombre podrás poner una contraseña nueva; al usarlo te daremos otro.</p>
        <div class="row">
          <button type="button" data-ref="copyCode">Copiar</button>
          <button type="button" data-ref="downloadCode">Descargar .txt</button>
        </div>
        <p class="note" data-ref="codeMessage" role="status"></p>
        <button type="button" data-ref="codeDone" class="gold">Lo he guardado, continuar</button>
      </div>
    </section>
  `;
  return {
    form: ref(root, 'form'),
    title: ref(root, 'title'),
    intro: ref(root, 'intro'),
    name: ref(root, 'name'),
    nameHint: ref(root, 'nameHint'),
    suggestions: ref(root, 'suggestions'),
    codeRow: ref(root, 'codeRow'),
    code: ref(root, 'code'),
    passwordLabel: ref(root, 'passwordLabel'),
    password: ref(root, 'password'),
    realNameWarning: ref(root, 'realNameWarning'),
    submit: ref(root, 'submit'),
    message: ref(root, 'message'),
    links: ref(root, 'links'),
    toggle: ref(root, 'toggle'),
    forgot: ref(root, 'forgot'),
    back: ref(root, 'back'),
    codeBox: ref(root, 'codeBox'),
    codeValue: ref(root, 'codeValue'),
    copyCode: ref(root, 'copyCode'),
    downloadCode: ref(root, 'downloadCode'),
    codeMessage: ref(root, 'codeMessage'),
    codeDone: ref(root, 'codeDone'),
  };
}

export const AUTH_TEXT: Record<AuthMode, { title: string; intro: string; submit: string; toggle: string }> = {
  login: {
    title: 'Iniciar sesión',
    intro: 'Opcional: sirve para guardar en la nube y salir en el ranking. El juego funciona sin cuenta.',
    submit: 'Entrar',
    toggle: '¿No tienes cuenta? Crear una',
  },
  register: {
    title: 'Crear cuenta',
    intro: 'Sin email: solo un nombre de jugador y una contraseña. Nombre de 3 a 20 letras sin tilde, números, "-" o "_".',
    submit: 'Crear cuenta',
    toggle: '¿Ya tienes cuenta? Entrar',
  },
  reset: {
    title: 'Contraseña nueva',
    intro: 'Escribe tu nombre de jugador y el código de recuperación que guardaste al crear la cuenta.',
    submit: 'Cambiar contraseña',
    toggle: 'Volver a entrar',
  },
  code: { title: 'Código de recuperación', intro: '', submit: '', toggle: '' },
};

export function renderAuthMode(ui: AuthUi, mode: AuthMode): void {
  const text = AUTH_TEXT[mode];
  const codeScreen = mode === 'code';
  setText(ui.title, text.title);
  setText(ui.intro, text.intro);
  ui.intro.hidden = codeScreen;
  ui.form.hidden = codeScreen;
  ui.links.hidden = codeScreen;
  ui.codeBox.hidden = !codeScreen;
  setText(ui.submit, text.submit);
  setText(ui.toggle, text.toggle);
  ui.forgot.hidden = mode !== 'login';
  ui.codeRow.hidden = mode !== 'reset';
  ui.realNameWarning.hidden = mode !== 'register';
  setText(
    ui.passwordLabel,
    mode === 'reset' ? 'Contraseña nueva (10 caracteres o más)' : mode === 'register' ? 'Contraseña (10 caracteres o más)' : 'Contraseña',
  );
  ui.password.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  setText(ui.message, '');
  setText(ui.codeMessage, '');
  showNameHint(ui, '', 'info');
  renderSuggestions(ui, []);
}

/** Aviso bajo el nombre: disponible (ok), problema (bad) o neutro. */
export function showNameHint(ui: AuthUi, text: string, tone: 'ok' | 'bad' | 'info'): void {
  setText(ui.nameHint, text);
  ui.nameHint.dataset.tone = tone;
}

/** Sugerencias de nombre libres, como botones: al pulsar una se copia en el campo (lo gestiona main). */
export function renderSuggestions(ui: AuthUi, names: readonly string[]): void {
  ui.suggestions.replaceChildren(
    ...names.map((name) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'small chip';
      button.dataset.suggestion = name;
      button.textContent = name;
      return button;
    }),
  );
  ui.suggestions.hidden = names.length === 0;
}

export function showRecoveryCode(ui: AuthUi, code: string): void {
  renderAuthMode(ui, 'code');
  setText(ui.codeValue, code);
}

/** Texto del archivo que se descarga con el código. */
export function recoveryFileText(playerName: string, code: string): string {
  return [
    'Rotten Odds: código de recuperación',
    '',
    `Nombre de jugador: ${playerName}`,
    `Código: ${code}`,
    '',
    'Sin email no podemos recuperar tu cuenta: guarda este archivo en un sitio seguro.',
    'Sirve para poner una contraseña nueva. Al usarlo, el juego te dará otro código.',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Sincronizar partida

export interface SyncUi {
  status: HTMLElement;
  conflict: HTMLElement;
  localInfo: HTMLElement;
  cloudInfo: HTMLElement;
  useCloud: HTMLButtonElement;
  keepLocal: HTMLButtonElement;
  retry: HTMLButtonElement;
  back: HTMLButtonElement;
}

export function mountSync(root: HTMLElement): SyncUi {
  root.innerHTML = `
    <section class="panel menu">
      <h1>Sincronizar partida</h1>
      <p data-ref="status" role="status"></p>
      <div data-ref="conflict" hidden>
        <p>La partida de la nube ha cambiado desde la última vez. ¿Con cuál te quedas?</p>
        <div class="menu-options">
          <button data-ref="keepLocal">Mantener la de este dispositivo<span class="menu-sub" data-ref="localInfo"></span></button>
          <button data-ref="useCloud">Usar la de la nube<span class="menu-sub" data-ref="cloudInfo"></span></button>
        </div>
        <p class="muted">La que no elijas se pierde.</p>
      </div>
      <div class="row spread">
        <button data-ref="retry" class="small">Reintentar</button>
        <button data-ref="back" class="small">Volver</button>
      </div>
    </section>
  `;
  return {
    status: ref(root, 'status'),
    conflict: ref(root, 'conflict'),
    localInfo: ref(root, 'localInfo'),
    cloudInfo: ref(root, 'cloudInfo'),
    useCloud: ref(root, 'useCloud'),
    keepLocal: ref(root, 'keepLocal'),
    retry: ref(root, 'retry'),
    back: ref(root, 'back'),
  };
}

export function describeSave(file: SaveFile): string {
  const s = file.state;
  const debt = s.debtPaid ? 'deuda saldada' : `deuda ${formatPercent(Math.min(s.balance / CONFIG.debt.amount, 1))} reunida`;
  return `${formatTime(s.playTime)} jugados · ${formatNumber(s.balance)} fichas · ${debt}`;
}

export function showSyncStatus(ui: SyncUi, text: string, conflict?: { local: SaveFile; server: CloudSave }): void {
  setText(ui.status, text);
  ui.conflict.hidden = !conflict;
  if (conflict) {
    setText(ui.localInfo, describeSave(conflict.local));
    setText(ui.cloudInfo, `${describeSave(conflict.server.data)} · guardada ${new Date(conflict.server.updatedAt).toLocaleString()}`);
  }
}

// ---------------------------------------------------------------------------
// Ranking

export interface RankingUi {
  status: HTMLElement;
  body: HTMLElement;
  prev: HTMLButtonElement;
  next: HTMLButtonElement;
  pageInfo: HTMLElement;
  back: HTMLButtonElement;
}

export function mountRanking(root: HTMLElement): RankingUi {
  root.innerHTML = `
    <section class="panel menu wide">
      <h1>Ranking · Mesa 1</h1>
      <p class="muted">Quién saldó antes la deuda del Encargado (tiempo de juego). Solo resultados verificados.</p>
      <p data-ref="status" role="status"></p>
      <table class="ranking">
        <thead><tr><th>#</th><th>Jugador</th><th>Tiempo</th></tr></thead>
        <tbody data-ref="body"></tbody>
      </table>
      <div class="row spread">
        <div class="row">
          <button data-ref="prev" class="small">Anterior</button>
          <span class="muted" data-ref="pageInfo"></span>
          <button data-ref="next" class="small">Siguiente</button>
        </div>
        <button data-ref="back" class="small">Volver</button>
      </div>
    </section>
  `;
  return {
    status: ref(root, 'status'),
    body: ref(root, 'body'),
    prev: ref(root, 'prev'),
    next: ref(root, 'next'),
    pageInfo: ref(root, 'pageInfo'),
    back: ref(root, 'back'),
  };
}

export function renderRanking(ui: RankingUi, page: RankingPage | null, message: string): void {
  setText(ui.status, message);
  ui.body.replaceChildren(
    ...(page?.content ?? []).map((row) => {
      const tr = document.createElement('tr');
      for (const text of [String(row.rank), row.playerName, formatTime(row.playTimeSeconds)]) {
        const td = document.createElement('td');
        td.textContent = text; // textContent: los nombres los escriben los jugadores
        tr.append(td);
      }
      return tr;
    }),
  );
  ui.prev.disabled = !page || page.page <= 0;
  ui.next.disabled = !page || page.page + 1 >= page.totalPages;
  setText(ui.pageInfo, page && page.totalPages > 0 ? `Página ${page.page + 1} de ${page.totalPages}` : '');
}
