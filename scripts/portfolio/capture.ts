/**
 * Capturas para el portfolio (sesión 10), con Chrome sin interfaz sobre el build de producción:
 *
 *   npm run build && npm run capture:portfolio
 *
 * Usa el modo demo público (?demo=mesa1 … ?demo=final), así que no necesita el modo desarrollador ni toca
 * ninguna partida. Escribe en docs/portfolio/ cada captura en PNG y WebP, a 1920x1080 (el escenario de
 * 640x360 a escala entera ×3, sin suavizado). Graba además los fotogramas de un vídeo corto (ruleta girando,
 * cambio de mesa y final) en capture-frames/ con el comando de ffmpeg para montarlo (si ffmpeg está en el
 * PATH, lo monta él en WebM y MP4). Comprueba también que el build no contiene el modo desarrollador.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

const PORT = 4191;
const BASE = `http://localhost:${PORT}/`;
const OUT = 'docs/portfolio';
const FRAMES = 'capture-frames';
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const W = 1920;
const H = 1080;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

if (!existsSync('dist/index.html')) {
  console.error('Falta dist/: ejecuta antes npm run build');
  process.exit(1);
}
// El build de producción no debe llevar el modo desarrollador (?dev=, huecos "-dev").
const bundle = readdirSync('dist/assets').filter((f) => f.endsWith('.js')).map((f) => readFileSync(join('dist/assets', f), 'utf8')).join('\n');
if (/get\(.dev.\)|save-dev|-dev\$\{/.test(bundle)) {
  console.error('El build contiene el modo desarrollador: no se captura');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });
rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

const preview = spawn(`npx vite preview --port ${PORT} --strictPort`, { shell: true, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9347', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'portfolio-'))}`, '--no-first-run', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });

let ws: WebSocket | undefined;
let nextId = 0;
const pending = new Map<number, (msg: { result?: Record<string, unknown> }) => void>();
const errors: string[] = [];
let recording = false;
let frameIndex = 0;
const frameTimes: number[] = [];

function send(method: string, params: Record<string, unknown> = {}): Promise<{ result?: Record<string, unknown> }> {
  return new Promise((resolve) => {
    const id = ++nextId;
    pending.set(id, resolve);
    ws!.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate<T>(expression: string): Promise<T> {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  return (r.result?.result as { value: T } | undefined)?.value as T;
}
async function key(k: string, code = k, vk = 0): Promise<void> {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, text: k.length === 1 ? k : undefined });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
}
async function click(x: number, y: number): Promise<void> {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}
/** Un punto del escenario (unidades de 640x360) en píxeles de la ventana: a 1920x1080 es ×3. */
const at = (x: number, y: number) => click(x * 3, y * 3);
/** Clic real en el centro de un elemento (p. ej. una pestaña de mesa de la barra). */
async function clickOn(selector: string): Promise<void> {
  const c = await evaluate<[number, number] | null>(`(() => { const e = document.querySelector('${selector}'); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  if (c) await click(c[0], c[1]);
}
const tableTab = (n: number) => `.table-layer:not([hidden]) .tab[data-table="${n}"]`;

async function connect(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      const list = (await (await fetch('http://127.0.0.1:9347/json/list')).json()) as { type: string; webSocketDebuggerUrl: string }[];
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
          else if (msg.method === 'Page.screencastFrame') {
            void send('Page.screencastFrameAck', { sessionId: msg.params.sessionId });
            if (recording) {
              writeFileSync(join(FRAMES, `f${String(frameIndex++).padStart(5, '0')}.jpg`), Buffer.from(msg.params.data, 'base64'));
              frameTimes.push(msg.params.metadata.timestamp);
            }
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

/** Abre una dirección del juego y pasa "Pulsa para entrar" (con el modo demo, entra directo). */
async function open(path: string): Promise<void> {
  await send('Page.navigate', { url: BASE + path });
  for (let i = 0; i < 150; i++) {
    if (await evaluate<boolean>('document.readyState === "complete" && !document.getElementById("loading")')) break;
    await sleep(100);
  }
  await evaluate(`sessionStorage.setItem('casino-aviso-pantalla', '1'); true`);
  await sleep(300);
  await key(' ', 'Space', 32);
  await sleep(1700);
}

/** Captura en PNG (sin pérdida) y WebP optimizado. */
async function shot(name: string): Promise<void> {
  // El ratón, fuera de todo (si no, el tooltip de lo último que se pulsó tapa la escena).
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: W - 2, y: H - 2 });
  await sleep(150);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const png = Buffer.from(String(r.result?.data), 'base64');
  await sharp(png).png({ compressionLevel: 9 }).toFile(join(OUT, `${name}.png`));
  await sharp(png).webp({ quality: 88, effort: 6 }).toFile(join(OUT, `${name}.webp`));
  console.log(`${OUT}/${name}.png y .webp`);
}

/** Estado guardado del modo demo (se guarda cada 5 s): para saber si la cadena de la mesa 5 sigue en juego. */
const demoChainOpen = () => evaluate<boolean>(`(() => { const raw = localStorage.getItem('casino-incremental-save-demo'); if (!raw) return false; const c = JSON.parse(raw).state.coin.chain; return !!c && c.status === 'decidir'; })()`);

try {
  await connect();
  await send('Runtime.enable');
  await send('Page.enable');
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(BASE)).ok) break;
    } catch {
      // aún arrancando
    }
    await sleep(200);
  }
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE });
  await sleep(500);
  await evaluate('localStorage.clear(); true');

  // 1. Portada con el menú.
  await open('');
  await sleep(400);
  await shot('01-titulo-menu');

  // 2. Mesa 1: el casino (con una tirada) y la trastienda.
  await open('?demo=mesa1');
  await at(214, 220); // NEGRO en el tapete
  await sleep(2600);
  await shot('02-mesa1-casino');
  await key('Tab', 'Tab', 9);
  await sleep(1600);
  await shot('03-mesa1-trastienda');

  // 3. Mesas 2, 3 y 4, cada una con una jugada.
  for (const [n, name] of [
    [2, '04-mesa2-tragaperras'],
    [3, '05-mesa3-dados'],
    [4, '06-mesa4-blackjack'],
  ] as const) {
    await open(`?demo=mesa${n}`);
    await key(' ', 'Space', 32);
    await sleep(n === 2 ? 2400 : 1600);
    await shot(name);
  }
  // Cajón de mejoras abierto (mesa 4).
  await key('m', 'KeyM', 77);
  await sleep(500);
  await shot('07-mesa4-cajon-mejoras');

  // 4. Mesa 5 con una cadena en marcha (tras una cara): se reintenta hasta que la cadena siga abierta.
  await open('?demo=mesa5');
  for (let attempt = 0; attempt < 10; attempt++) {
    await key(' ', 'Space', 32);
    await sleep(5600); // la moneda y el autoguardado
    if (await demoChainOpen()) break;
  }
  await shot('08-mesa5-cadena');

  // 5. Pantalla final: epílogo y libro de cuentas.
  await open('?demo=final');
  await sleep(3800);
  await shot('09-final-epilogo');
  for (let i = 0; i < 12 && !(await evaluate<boolean>(`!document.querySelector('.ledger').hidden`)); i++) {
    await click(W / 2, H / 3);
    await sleep(300);
  }
  await sleep(400);
  await shot('10-final-libro-de-cuentas');

  // 6. Vídeo corto: ruleta girando, cambio de mesa y final (fotogramas del screencast de Chrome).
  await send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  await open('?demo=mesa1');
  recording = true;
  await at(214, 220);
  await sleep(3200);
  await clickOn(tableTab(2));
  await sleep(2800);
  await key(' ', 'Space', 32);
  await sleep(2600);
  await clickOn(tableTab(5));
  await sleep(2600);
  await key(' ', 'Space', 32);
  await sleep(2600);
  recording = false;
  await open('?demo=final');
  recording = true;
  await sleep(7000);
  for (let i = 0; i < 6; i++) {
    await click(W / 2, H / 3);
    await sleep(700);
  }
  await sleep(2500);
  recording = false;
  await send('Page.stopScreencast');
} finally {
  ws?.close();
  chrome.kill();
  if (process.platform === 'win32' && preview.pid) spawnSync('taskkill', ['/pid', String(preview.pid), '/T', '/F'], { stdio: 'ignore' });
  else preview.kill();
}

// Montaje del vídeo: lista de fotogramas con su duración real (el screencast solo envía cuando cambia algo).
const lines: string[] = [];
for (let i = 0; i < frameTimes.length; i++) {
  const dur = i + 1 < frameTimes.length ? Math.min(Math.max(frameTimes[i + 1] - frameTimes[i], 0.01), 0.5) : 0.5;
  lines.push(`file 'f${String(i).padStart(5, '0')}.jpg'`, `duration ${dur.toFixed(3)}`);
}
writeFileSync(join(FRAMES, 'frames.txt'), `${lines.join('\n')}\n`);
const webm = `ffmpeg -y -f concat -safe 0 -i ${FRAMES}/frames.txt -vf "fps=30,scale=1920:1080:flags=neighbor" -c:v libvpx-vp9 -b:v 0 -crf 32 ${OUT}/video-portfolio.webm`;
const mp4 = `ffmpeg -y -f concat -safe 0 -i ${FRAMES}/frames.txt -vf "fps=30,scale=1920:1080:flags=neighbor" -c:v libx264 -pix_fmt yuv420p -crf 20 ${OUT}/video-portfolio.mp4`;
const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore', shell: true }).status === 0;
if (hasFfmpeg) {
  spawnSync(webm, { shell: true, stdio: 'inherit' });
  spawnSync(mp4, { shell: true, stdio: 'inherit' });
} else {
  console.log(`\nVídeo: ${frameTimes.length} fotogramas en ${FRAMES}/ (no hay ffmpeg en el PATH). Para montarlo:\n  ${webm}\n  ${mp4}`);
}
if (errors.length) {
  console.error(`\nErrores en consola:\n${errors.join('\n')}`);
  process.exit(1);
}
process.exit(0);
