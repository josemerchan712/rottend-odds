/**
 * Prueba de extremo a extremo de los cajones laterales (sesión 9), con clics de ratón reales:
 *
 *   npm run build && npm run test:e2e
 *
 * Arranca `vite preview` sobre dist/, abre Chrome sin interfaz (CHROME_PATH o la ruta de Windows por
 * defecto) y, en las cinco mesas, con dpr 1 y 1,5, en ventana y en pantalla completa, comprueba con el
 * protocolo de depuración (clics de verdad, no `element.click()`):
 * - que en el centro de cada pestaña está esa pestaña (nada la tapa) y que un clic la abre;
 * - que al abrir un cajón se cierra el otro del mismo lado y ninguna pestaña tapa el cuerpo abierto;
 * - que un clic fuera y Esc los cierran;
 * - que ningún texto del cajón abierto queda cortado.
 * Sale con código 1 si algo falla.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CARD_UPGRADE_IDS, CONFIG, DICE_UPGRADE_IDS, SLOT_UPGRADE_IDS, UPGRADE_IDS } from '../../src/game/config';
import { serialize } from '../../src/game/save';
import { createInitialState } from '../../src/game/state';

const PORT = 4188;
const BASE = `http://localhost:${PORT}/`;
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Partida con las cinco mesas abiertas (para poder visitar todas). */
function saveAllTables(): string {
  const s = createInitialState();
  for (const id of UPGRADE_IDS) s.upgrades[id] = CONFIG.upgrades[id].maxLevel;
  for (const id of SLOT_UPGRADE_IDS) s.slots.upgrades[id] = CONFIG.slots.upgrades[id].maxLevel;
  for (const id of DICE_UPGRADE_IDS) s.dice.upgrades[id] = CONFIG.dice.upgrades[id].maxLevel;
  for (const id of CARD_UPGRADE_IDS) s.cards.upgrades[id] = CONFIG.cards.upgrades[id].maxLevel;
  s.debtPaid = s.slots.debtPaid = s.dice.debtPaid = s.cards.debtPaid = true;
  s.slots.visited = s.dice.visited = s.cards.visited = s.coin.visited = true;
  s.playTime = 3000;
  s.coin.balance = 5000;
  s.activeTable = 1;
  return serialize(s, Date.now());
}

if (!existsSync('dist/index.html')) {
  console.error('Falta dist/: ejecuta antes npm run build');
  process.exit(1);
}
if (!existsSync(CHROME)) {
  console.error(`No encuentro Chrome en ${CHROME} (define CHROME_PATH)`);
  process.exit(1);
}

const preview = spawn(`npx vite preview --port ${PORT} --strictPort`, { shell: true, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9344', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'e2e-chrome-'))}`, '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });

let ws: WebSocket | undefined;
let nextId = 0;
const pending = new Map<number, (msg: { result?: Record<string, unknown> }) => void>();
const errors: string[] = [];
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
async function waitFor(expression: string, timeout = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate<boolean>(expression)) return true;
    await sleep(100);
  }
  return false;
}
async function click(x: number, y: number): Promise<void> {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}
async function key(k: string, code = k, vk = 0): Promise<void> {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, text: k.length === 1 ? k : undefined });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
}
function check(ok: boolean, message: string): void {
  if (!ok) failures.push(message);
}

async function connect(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      const list = (await (await fetch('http://127.0.0.1:9344/json/list')).json()) as { type: string; webSocketDebuggerUrl: string }[];
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
          } else if (msg.method === 'Runtime.exceptionThrown') errors.push(String(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text));
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

/** Centro de la pestaña de un cajón y qué hay en ese punto. */
const tabProbe = (layer: number, drawer: string) => `(() => {
  const t = document.querySelector('[data-layer="${layer}"] [data-drawer="${drawer}"] .drawer-tab');
  const r = t.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const hit = document.elementFromPoint(x, y);
  return { x, y, mine: !!hit && hit.closest('.drawer-tab') === t, what: hit ? (hit.className || hit.tagName) : 'nada' };
})()`;
const isOpen = (layer: number, drawer: string) => `document.querySelector('[data-layer="${layer}"] [data-drawer="${drawer}"]').dataset.open === 'true'`;
/** Pestañas que se solapan con el cuerpo de un cajón abierto, y textos cortados dentro de él. */
const layoutProbe = (layer: number) => `(() => {
  const out = [];
  const bodies = [...document.querySelectorAll('[data-layer="${layer}"] .drawer[data-open="true"] .drawer-body')];
  const tabs = [...document.querySelectorAll('[data-layer="${layer}"] .drawer-tab')];
  for (const body of bodies) {
    const b = body.getBoundingClientRect();
    for (const t of tabs) {
      const r = t.getBoundingClientRect();
      if (r.left < b.right - 1 && r.right > b.left + 1 && r.top < b.bottom - 1 && r.bottom > b.top + 1) out.push('pestaña ' + t.textContent.trim() + ' tapa el cajón');
    }
    for (const el of body.querySelectorAll('*')) {
      if (el.children.length || !el.offsetWidth) continue;
      if (el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > b.right + 1) out.push('texto cortado: ' + el.textContent.trim().slice(0, 30));
    }
  }
  return out;
})()`;

try {
  await connect();
  await send('Runtime.enable');
  await send('Page.enable');
  // Espera a que el servidor de vista previa responda.
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(BASE)).ok) break;
    } catch {
      // aún arrancando
    }
    await sleep(200);
  }
  const save = saveAllTables();
  for (const dpr of [1, 1.5]) {
    for (const mode of [
      { id: 'ventana', width: 1280, height: 720, fullscreen: false },
      { id: 'pantalla completa', width: 1920, height: 1080, fullscreen: true },
    ]) {
      const tag = `dpr ${dpr}, ${mode.id}`;
      await send('Emulation.setDeviceMetricsOverride', { width: mode.width, height: mode.height, deviceScaleFactor: dpr, mobile: false });
      await send('Page.navigate', { url: BASE });
      await waitFor('document.readyState === "complete"');
      await evaluate(`localStorage.clear(); sessionStorage.setItem('casino-aviso-pantalla','1'); localStorage.setItem('casino-incremental-save', ${JSON.stringify(save)}); true`);
      await send('Page.navigate', { url: BASE });
      await waitFor('document.readyState === "complete" && !document.getElementById("loading")');
      if (mode.fullscreen) {
        const win = await send('Browser.getWindowForTarget');
        const windowId = (win.result as { windowId?: number } | undefined)?.windowId;
        if (windowId !== undefined) await send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'fullscreen' } });
        await evaluate(`document.querySelector('.root').requestFullscreen().then(() => true, () => false)`, true);
      }
      await key(' ', 'Space', 32);
      await sleep(1200);
      await evaluate(`document.querySelector('[data-item="continue"]').click(); true`);
      await sleep(1200);
      for (const layer of [1, 2, 3, 4, 5]) {
        await evaluate(`document.querySelector('.table-layer:not([hidden]) .tab[data-table="${layer}"]').click(); true`);
        await sleep(1600);
        const drawers = await evaluate<string[]>(`[...document.querySelectorAll('[data-layer="${layer}"] .drawer')].map(d => d.dataset.drawer)`);
        for (const drawer of drawers) {
          const probe = await evaluate<{ x: number; y: number; mine: boolean; what: string }>(tabProbe(layer, drawer));
          check(probe.mine, `${tag}, mesa ${layer}: la pestaña ${drawer} está tapada por ${probe.what}`);
          await click(probe.x, probe.y);
          await sleep(120);
          check(await evaluate<boolean>(isOpen(layer, drawer)), `${tag}, mesa ${layer}: un clic en ${drawer} no lo abre`);
          for (const problem of await evaluate<string[]>(layoutProbe(layer))) failures.push(`${tag}, mesa ${layer}, ${drawer}: ${problem}`);
          // Un clic en la misma pestaña lo cierra.
          const again = await evaluate<{ x: number; y: number }>(tabProbe(layer, drawer));
          await click(again.x, again.y);
          await sleep(120);
          check(!(await evaluate<boolean>(isOpen(layer, drawer))), `${tag}, mesa ${layer}: un segundo clic en ${drawer} no lo cierra`);
        }
        if (layer === 5) {
          // Un solo cajón abierto por lado: abrir Herencias cierra Mesa (y al revés).
          for (const [first, second] of [['mesa', 'herencias'], ['herencias', 'mesa']]) {
            const a = await evaluate<{ x: number; y: number }>(tabProbe(5, first));
            await click(a.x, a.y);
            await sleep(120);
            const b = await evaluate<{ x: number; y: number; mine: boolean; what: string }>(tabProbe(5, second));
            check(b.mine, `${tag}, mesa 5: con ${first} abierto, la pestaña ${second} está tapada por ${b.what}`);
            await click(b.x, b.y);
            await sleep(120);
            check(await evaluate<boolean>(isOpen(5, second)) && !(await evaluate<boolean>(isOpen(5, first))), `${tag}, mesa 5: abrir ${second} no cierra ${first}`);
            for (const problem of await evaluate<string[]>(layoutProbe(5))) failures.push(`${tag}, mesa 5, ${second}: ${problem}`);
            await key('Escape', 'Escape', 27);
            await sleep(120);
            check(!(await evaluate<boolean>(`!!document.querySelector('[data-layer="5"] .drawer[data-open="true"]')`)), `${tag}, mesa 5: Esc no cierra los cajones`);
          }
        }
        // Un clic fuera (en la escena) cierra el cajón abierto.
        const t = await evaluate<{ x: number; y: number }>(tabProbe(layer, 'ayuda'));
        await click(t.x, t.y);
        await sleep(120);
        await click(mode.width / 2, mode.height / 2);
        await sleep(120);
        check(!(await evaluate<boolean>(isOpen(layer, 'ayuda'))), `${tag}, mesa ${layer}: un clic fuera no cierra el cajón`);
      }
      console.log(`${tag}: hecho`);
    }
  }
} finally {
  ws?.close();
  chrome.kill();
  preview.kill();
  // En Windows el servidor cuelga de un shell: hay que cerrar el árbol entero, y antes de salir (síncrono).
  if (process.platform === 'win32' && preview.pid) spawnSync('taskkill', ['/pid', String(preview.pid), '/T', '/F'], { stdio: 'ignore' });
}

for (const e of errors) failures.push(`error en consola: ${e}`);
if (failures.length) {
  console.error(`\n${failures.length} fallos:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log('\nCajones: todo bien (clics reales en las cinco mesas, dpr 1 y 1,5, ventana y pantalla completa).');
process.exit(0);
