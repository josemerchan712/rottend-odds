/**
 * Menú principal (sesión 12): comprueba que nunca se corta y guarda capturas de los casos extremos.
 *
 *   npx tsx scripts/e2e/titleMenu.ts <carpeta-de-capturas>
 *
 * Arranca `vite` (desarrollo: lee VITE_API_URL de .env.development.local, así salen Ranking y Cuenta) y Chrome sin
 * interfaz (CHROME_PATH o la ruta de Windows por defecto). Para cada caso (con y sin guardado, sesión con un nombre de
 * 20 caracteres, final visto), con dpr 1, 1,5 y 2, en ventana (1280x720) y en pantalla completa (1920x1080):
 * - mide el menú en unidades del escenario y comprueba que su caja visible acaba dentro de los 360 de alto;
 * - comprueba con elementFromPoint que cada botón visible se puede pulsar (nada lo tapa) y que la línea de sesión no
 *   se solapa con la versión;
 * - guarda una captura PNG en la carpeta indicada.
 * Sale con código 1 si algo falla. No necesita el servidor: la sesión es de mentira (solo se pinta el menú).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serialize } from '../../src/game/save';
import { createInitialState } from '../../src/game/state';

const PORT = 4189;
const BASE = `http://localhost:${PORT}/`;
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = process.argv[2] ?? join(tmpdir(), 'menu-capturas');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function finishedSave(): string {
  const s = createInitialState();
  s.debtPaid = s.slots.debtPaid = s.dice.debtPaid = s.cards.debtPaid = s.coin.debtPaid = true;
  s.activeTable = 5;
  s.playTime = 3493;
  return serialize(s, Date.now());
}
const SESSION = JSON.stringify({ token: 'solo-para-pintar-el-menu', displayName: 'Abcdefghij_Klmnopqrs', expiresAt: new Date(Date.now() + 864e5).toISOString(), cloudRevision: null });

const CASES = [
  { id: 'peor-caso', save: finishedSave(), session: SESSION },
  { id: 'guardado-sin-sesion', save: finishedSave(), session: null },
  { id: 'sin-guardado-con-sesion', save: null, session: SESSION },
] as const;

if (!existsSync(CHROME)) {
  console.error(`No encuentro Chrome en ${CHROME} (define CHROME_PATH)`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });
const server = spawn(`npx vite --port ${PORT} --strictPort`, { shell: true, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9351', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'menu-chrome-'))}`, '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });

let ws: WebSocket | undefined;
let nextId = 0;
const pending = new Map<number, (msg: { result?: Record<string, unknown> }) => void>();
const failures: string[] = [];

function send(method: string, params: Record<string, unknown> = {}): Promise<{ result?: Record<string, unknown> }> {
  return new Promise((resolve) => {
    const id = ++nextId;
    pending.set(id, resolve);
    ws!.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate<T>(expression: string, userGesture = false): Promise<T> {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture });
  return (r.result?.result as { value: T } | undefined)?.value as T;
}
async function waitFor(expression: string, timeout = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate<boolean>(expression)) return true;
    await sleep(150);
  }
  return false;
}
async function key(k: string, code = k, vk = 0): Promise<void> {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, text: k.length === 1 ? k : undefined });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
}
async function connect(): Promise<void> {
  for (let i = 0; i < 150; i++) {
    try {
      const list = (await (await fetch('http://127.0.0.1:9351/json/list')).json()) as { type: string; webSocketDebuggerUrl: string }[];
      const page = list.find((t) => t.type === 'page');
      if (page) {
        const socket = new WebSocket(page.webSocketDebuggerUrl);
        ws = socket;
        await new Promise((r) => socket.addEventListener('open', r, { once: true }));
        socket.addEventListener('message', (e) => {
          const msg = JSON.parse(String(e.data));
          if (msg.id && pending.has(msg.id)) {
            pending.get(msg.id)!(msg);
            pending.delete(msg.id);
          }
        });
        return;
      }
    } catch {
      // Chrome aún arrancando.
    }
    await sleep(200);
  }
  throw new Error('No se pudo conectar con Chrome');
}

/** Medidas del menú en unidades del escenario y botones que no se pueden pulsar. */
const MENU_PROBE = `(() => {
  const stage = document.querySelector('.stage');
  const z = parseFloat(stage.style.zoom) || 1;
  const s = stage.getBoundingClientRect();
  const nav = document.querySelector('.title-menu');
  const n = nav.getBoundingClientRect();
  const unit = (v) => Math.round(v / z * 10) / 10;
  const blocked = [];
  for (const b of nav.querySelectorAll('.title-option')) {
    if (b.hidden) continue;
    b.scrollIntoView({ block: 'nearest' });
    const r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!hit || hit.closest('.title-option') !== b) blocked.push(b.dataset.item);
    if (r.bottom > s.bottom + 0.5 || r.top < s.top - 0.5) blocked.push(b.dataset.item + ' fuera del escenario');
  }
  nav.scrollTop = 0;
  const acc = document.querySelector('.title-account').getBoundingClientRect();
  const ver = document.querySelector('.title-version').getBoundingClientRect();
  const overlap = acc.width > 0 && acc.bottom > ver.top + 0.5 && acc.top < ver.bottom - 0.5 && acc.right > ver.left && acc.left < ver.right;
  const shown = [...nav.querySelectorAll('.title-option')].filter((b) => !b.hidden);
  const first = shown[0].getBoundingClientRect(), last = shown[shown.length - 1].getBoundingClientRect();
  return {
    u: z, top: unit(first.top - s.top), bottom: unit(last.bottom - s.top), height: unit(last.bottom - first.top),
    compact: nav.classList.contains('compact'),
    content: unit(nav.scrollHeight * z), scrolls: nav.scrollHeight > nav.clientHeight + 1,
    items: [...nav.querySelectorAll('.title-option')].filter((b) => !b.hidden).map((b) => b.dataset.item),
    blocked, overlap, account: document.querySelector('.title-account').textContent,
  };
})()`;

try {
  await connect();
  await send('Runtime.enable');
  await send('Page.enable');
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(BASE)).ok) break;
    } catch {
      // aún arrancando
    }
    await sleep(200);
  }
  for (const c of CASES) {
    for (const dpr of [1, 1.5, 2]) {
      for (const mode of [
        { id: 'ventana', width: 1280, height: 720, fullscreen: false },
        { id: 'completa', width: 1920, height: 1080, fullscreen: true },
      ]) {
        const tag = `${c.id}, dpr ${dpr}, ${mode.id}`;
        await send('Emulation.setDeviceMetricsOverride', { width: mode.width, height: mode.height, deviceScaleFactor: dpr, mobile: false });
        await send('Page.navigate', { url: BASE });
        await waitFor('document.readyState === "complete"');
        await evaluate(`localStorage.clear(); sessionStorage.setItem('casino-aviso-pantalla','1');
          ${c.save ? `localStorage.setItem('casino-incremental-save', ${JSON.stringify(c.save)});` : ''}
          ${c.session ? `localStorage.setItem('casino-incremental-session', ${JSON.stringify(c.session)});` : ''} true`);
        await send('Page.navigate', { url: BASE });
        await waitFor('document.readyState === "complete" && !document.getElementById("loading")');
        if (mode.fullscreen) {
          const win = await send('Browser.getWindowForTarget');
          const windowId = (win.result as { windowId?: number } | undefined)?.windowId;
          if (windowId !== undefined) await send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'fullscreen' } });
          await evaluate(`document.querySelector('.root').requestFullscreen().then(() => true, () => false)`, true);
        }
        await sleep(500);
        await key(' ', 'Space', 32);
        await waitFor(`!document.querySelector('.title-menu')?.closest('[hidden]')`);
        await sleep(1500); // fundido de entrada del menú
        const m = await evaluate<{ u: number; top: number; bottom: number; height: number; compact: boolean; content: number; scrolls: boolean; items: string[]; blocked: string[]; overlap: boolean; account: string }>(MENU_PROBE);
        console.log(`${tag}: --u=${m.u} botones ${m.top}→${m.bottom} (alto ${m.height}${m.compact ? ', compacto' : ''}${m.scrolls ? ', con scroll' : ''}) [${m.items.join(', ')}]`);
        if (m.bottom > 360.5) failures.push(`${tag}: el menú acaba en ${m.bottom} (> 360): se corta`);
        for (const b of m.blocked) failures.push(`${tag}: no se puede pulsar ${b}`);
        if (m.overlap) failures.push(`${tag}: la línea de sesión se solapa con la versión`);
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(join(OUT, `${c.id}-dpr${dpr}-${mode.id}.png`), Buffer.from(String(shot.result?.data), 'base64'));
        // Con sesión: el submenú de la cuenta (Enter sobre Cuenta), también dentro del escenario y pulsable.
        if (c.session && (await evaluate<boolean>(`!!document.querySelector('[data-item="account"]:not([hidden])')`))) {
          await evaluate(`document.querySelector('[data-item="account"]').click(); true`);
          await sleep(300);
          const sub = await evaluate<{ bottom: number; blocked: string[]; head: string }>(`(() => {
            const stage = document.querySelector('.stage'); const z = parseFloat(stage.style.zoom) || 1; const s = stage.getBoundingClientRect();
            const menu = document.querySelector('.account-menu'); const blocked = [];
            for (const b of menu.querySelectorAll('.title-option')) {
              const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
              if (!hit || hit.closest('.title-option') !== b) blocked.push(b.textContent.trim());
            }
            const last = [...menu.querySelectorAll('.title-option')].pop().getBoundingClientRect();
            return { bottom: Math.round((last.bottom - s.top) / z), blocked, head: menu.querySelector('.title-menu-head').textContent };
          })()`);
          if (sub.bottom > 360) failures.push(`${tag}: el submenú de la cuenta acaba en ${sub.bottom}`);
          for (const b of sub.blocked) failures.push(`${tag}: en el submenú no se puede pulsar ${b}`);
          if (!sub.head.includes('Abcdefghij_Klmnopqrs')) failures.push(`${tag}: el submenú no muestra el nombre completo`);
          const subShot = await send('Page.captureScreenshot', { format: 'png' });
          writeFileSync(join(OUT, `${c.id}-cuenta-dpr${dpr}-${mode.id}.png`), Buffer.from(String(subShot.result?.data), 'base64'));
          await key('Escape', 'Escape', 27);
          await sleep(200);
          if (!(await evaluate<boolean>(`document.querySelector('.account-menu').hidden && !document.querySelector('.title-menu[data-ref="list"]').hidden`)))
            failures.push(`${tag}: Esc no cierra el submenú de la cuenta`);
        }
        if (mode.fullscreen) await evaluate(`document.fullscreenElement ? document.exitFullscreen().then(() => true) : true`);
      }
    }
  }
  // Fase 2: el resto de pantallas con sesión y un nombre de 20 caracteres (Ajustes, Cuenta sin sesión → Iniciar
  // sesión, Ranking con nombres largos, Créditos, el final y Privacidad), en dpr 1 ventana y dpr 2 pantalla completa.
  const rows = Array.from({ length: 10 }, (_, i) => ({ rank: i + 1, playerName: i % 2 ? 'Abcdefghij_Klmnopqrs' : 'WWWWWWWWWWWWWWWWWWWW', playTimeSeconds: 400 + i * 37, achievedAt: '2026-10-07T10:00:00Z' }));
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const real = window.fetch;
    window.fetch = (url, init) => String(url).includes('/api/ranking')
      ? Promise.resolve(new Response(JSON.stringify({ content: ${JSON.stringify(rows)}, page: 0, size: 10, totalElements: 10, totalPages: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      : real(url, init);
  })()` });
  for (const mode of [
    { id: 'dpr1-ventana', width: 1280, height: 720, dpr: 1 },
    { id: 'dpr2-completa', width: 1920, height: 1080, dpr: 2 },
  ]) {
    await send('Emulation.setDeviceMetricsOverride', { width: mode.width, height: mode.height, deviceScaleFactor: mode.dpr, mobile: false });
    const shot = async (name: string) => {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT, `pantalla-${name}-${mode.id}.png`), Buffer.from(String(r.result?.data), 'base64'));
    };
    const open = async (session: boolean) => {
      await send('Page.navigate', { url: BASE });
      await waitFor('document.readyState === "complete"');
      await evaluate(`localStorage.clear(); sessionStorage.setItem('casino-aviso-pantalla','1');
        localStorage.setItem('casino-incremental-save', ${JSON.stringify(finishedSave())});
        ${session ? `localStorage.setItem('casino-incremental-session', ${JSON.stringify(SESSION)});` : ''} true`);
      await send('Page.navigate', { url: BASE });
      await waitFor('document.readyState === "complete" && !document.getElementById("loading")');
      await sleep(400);
      await key(' ', 'Space', 32);
      await sleep(1500);
    };
    /** Textos que se salen de su caja (cortados) dentro de la pantalla visible. */
    const clipped = () => evaluate<string[]>(`[...document.querySelectorAll('.screen:not([hidden]) *')].filter((el) => !el.children.length && el.offsetWidth && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow !== 'ellipsis').map((el) => el.textContent.trim().slice(0, 30))`);
    await open(true);
    for (const [item, name] of [['settings', 'ajustes'], ['ranking', 'ranking'], ['credits', 'creditos']] as const) {
      await evaluate(`document.querySelector('[data-item="${item}"]').click(); true`);
      await sleep(900);
      for (const t of await clipped()) failures.push(`${mode.id}, ${name}: texto cortado «${t}»`);
      await shot(name);
      await key('Escape', 'Escape', 27);
      await sleep(500);
    }
    await evaluate(`document.querySelector('[data-item="ending"]').click(); true`);
    await sleep(3500);
    await shot('final');
    await key('Escape', 'Escape', 27);
    await sleep(2500);
    await shot('final-saltado');
    await open(false);
    await evaluate(`document.querySelector('[data-item="account"]').click(); true`);
    await sleep(700);
    await shot('cuenta-sin-sesion');
    await send('Page.navigate', { url: BASE + 'privacidad.html' });
    await waitFor('document.readyState === "complete"');
    await sleep(300);
    await shot('privacidad');
    console.log(`pantallas, ${mode.id}: hecho`);
  }
} finally {
  ws?.close();
  chrome.kill();
  server.kill();
  if (process.platform === 'win32' && server.pid) spawn('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore' });
}
if (failures.length) {
  console.error(`\n${failures.length} fallo(s):\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('\nMenú principal: todo cabe y se puede pulsar.');
