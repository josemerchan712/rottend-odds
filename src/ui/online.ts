import type { CloudSave, RankingPage } from '../api/client';
import type { SaveFile } from '../game/save';
import { formatNumber, formatPercent, formatTime } from '../util/format';
import { CONFIG } from '../game/config';
import { setText } from './render';

const ref = <T extends HTMLElement>(root: HTMLElement, name: string) => root.querySelector<T>(`[data-ref="${name}"]`)!;

// ---------------------------------------------------------------------------
// Iniciar sesión / crear cuenta

export interface AuthUi {
  form: HTMLFormElement;
  title: HTMLElement;
  email: HTMLInputElement;
  password: HTMLInputElement;
  displayNameRow: HTMLElement;
  displayName: HTMLInputElement;
  submit: HTMLButtonElement;
  toggle: HTMLButtonElement;
  message: HTMLElement;
  back: HTMLButtonElement;
}

export function mountAuth(root: HTMLElement): AuthUi {
  root.innerHTML = `
    <section class="panel menu">
      <h1 data-ref="title">Iniciar sesión</h1>
      <p class="muted">Opcional: sirve para guardar en la nube y salir en el ranking. El juego funciona sin cuenta.</p>
      <form data-ref="form" class="form" novalidate>
        <label>Email <input type="email" autocomplete="email" required data-ref="email" /></label>
        <label>Contraseña <input type="password" autocomplete="current-password" minlength="10" required data-ref="password" /></label>
        <label data-ref="displayNameRow" hidden>Nombre en el ranking
          <input type="text" minlength="3" maxlength="20" autocomplete="nickname" data-ref="displayName" />
        </label>
        <button type="submit" data-ref="submit" class="gold">Entrar</button>
      </form>
      <p class="note" data-ref="message" role="status"></p>
      <div class="row spread">
        <button data-ref="toggle" class="small">¿No tienes cuenta? Crear una</button>
        <button data-ref="back" class="small">Volver</button>
      </div>
    </section>
  `;
  return {
    form: ref(root, 'form'),
    title: ref(root, 'title'),
    email: ref(root, 'email'),
    password: ref(root, 'password'),
    displayNameRow: ref(root, 'displayNameRow'),
    displayName: ref(root, 'displayName'),
    submit: ref(root, 'submit'),
    toggle: ref(root, 'toggle'),
    message: ref(root, 'message'),
    back: ref(root, 'back'),
  };
}

export function renderAuthMode(ui: AuthUi, registering: boolean): void {
  setText(ui.title, registering ? 'Crear cuenta' : 'Iniciar sesión');
  setText(ui.submit, registering ? 'Crear cuenta' : 'Entrar');
  setText(ui.toggle, registering ? '¿Ya tienes cuenta? Entrar' : '¿No tienes cuenta? Crear una');
  ui.displayNameRow.hidden = !registering;
  ui.password.autocomplete = registering ? 'new-password' : 'current-password';
  setText(ui.message, registering ? 'Contraseña de 10 caracteres o más. Nombre de 3 a 20 caracteres, sin formato de email.' : '');
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
      for (const text of [String(row.rank), row.displayName, formatTime(row.playTimeSeconds)]) {
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
