/**
 * Sonido sintetizado con Web Audio (sin archivos): zumbido ambiente por sala, tic de la ruleta,
 * fichas, carretes, dados, cartas, moneda, acordes de ganar y perder y un susurro filtrado al
 * perder mucho. Respeta el volumen de Ajustes y se silencia con la tecla N.
 *
 * Los navegadores solo dejan arrancar el audio tras un gesto del usuario: unlockAudio() se llama
 * desde el clic de "Continuar" o "Nueva partida" (y desde cualquier tecla o clic posterior).
 */
export type Sfx = 'roulette' | 'chip' | 'reels' | 'dice' | 'card' | 'coin' | 'win' | 'lose' | 'jackpot' | 'whisper' | 'tick' | 'select';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let unlocked = false;
let volume = 1;
let muted = false;
let ambient: { table: AmbientId; nodes: AudioNode[]; gain: GainNode } | null = null;
/** Intensidad del zumbido ambiente (0-1): la pantalla final la baja durante el epílogo. */
let ambientLevel = 1;
/** Volumen del zumbido a intensidad 1. */
const AMBIENT_GAIN = 0.05;

/** Sala del zumbido: una mesa (1-5) o la portada. */
export type AmbientId = number | 'title';
let noiseBuffer: AudioBuffer | null = null;

/** Zumbido de cada sala: frecuencia base (Hz) y color del filtro. */
const ROOMS: Record<number, { freq: number; cutoff: number }> = {
  1: { freq: 55, cutoff: 320 },
  2: { freq: 62, cutoff: 420 },
  3: { freq: 49, cutoff: 260 },
  4: { freq: 58, cutoff: 300 },
  5: { freq: 41, cutoff: 220 },
};
/** Portada: más grave y más cerrado que cualquier mesa (el pasillo antes de entrar). */
const TITLE_ROOM = { freq: 36, cutoff: 170 };

function applyGain(): void {
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : volume * 0.6, ctx.currentTime, 0.05);
}

export function unlockAudio(): void {
  unlocked = true;
  if (typeof window === 'undefined' || !('AudioContext' in window)) return;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.connect(ctx.destination);
      applyGain();
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null; // sin audio: el juego sigue igual
  }
}

export function setVolume(value: number): void {
  volume = Math.min(Math.max(value, 0), 1);
  applyGain();
}

export function setMuted(value: boolean): void {
  muted = value;
  applyGain();
}

export function isMuted(): boolean {
  return muted;
}

export function audioState(): { unlocked: boolean; volume: number; muted: boolean } {
  return { unlocked, volume, muted };
}

function noise(): AudioBuffer | null {
  if (!ctx) return null;
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

/** Un tono con envolvente (ataque corto, caída exponencial). */
function tone(freq: number, at: number, length: number, peak: number, type: OscillatorType = 'sine', glideTo?: number): void {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, at + length);
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(peak, at + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(env).connect(master);
  osc.start(at);
  osc.stop(at + length + 0.05);
}

/** Un golpe de ruido filtrado. */
function burst(at: number, length: number, peak: number, filter: BiquadFilterType, freq: number, q = 1, sweepTo?: number): void {
  const buffer = noise();
  if (!ctx || !master || !buffer) return;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const bq = ctx.createBiquadFilter();
  bq.type = filter;
  bq.frequency.setValueAtTime(freq, at);
  if (sweepTo) bq.frequency.exponentialRampToValueAtTime(sweepTo, at + length);
  bq.Q.value = q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(peak, at + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, at + length);
  src.connect(bq).connect(env).connect(master);
  src.start(at, Math.random() * 0.5);
  src.stop(at + length + 0.05);
}

export function sfx(kind: Sfx): void {
  if (!ctx || !master || muted || volume <= 0) return;
  const t = ctx.currentTime + 0.01;
  switch (kind) {
    case 'roulette': {
      // La bola: tics cada vez más espaciados durante ~2,5 s.
      let at = t;
      let gap = 0.04;
      while (at < t + 2.6) {
        burst(at, 0.03, 0.25, 'bandpass', 3200, 6);
        at += gap;
        gap *= 1.09;
      }
      break;
    }
    case 'chip':
      tone(2400, t, 0.06, 0.12, 'triangle');
      tone(3100, t + 0.03, 0.05, 0.08, 'triangle');
      break;
    case 'reels':
      for (let r = 0; r < 3; r++) {
        for (let i = 0; i < 10 + r * 4; i++) burst(t + i * 0.05, 0.03, 0.12, 'bandpass', 1400 + r * 200, 4);
        tone(180 - r * 20, t + 0.7 + r * 0.25, 0.12, 0.25, 'square');
      }
      break;
    case 'dice':
      for (let i = 0; i < 5; i++) burst(t + i * 0.09 + Math.random() * 0.03, 0.06, 0.35 - i * 0.05, 'lowpass', 900, 1);
      break;
    case 'card':
      burst(t, 0.12, 0.2, 'highpass', 2500, 0.7, 6000);
      break;
    case 'coin':
      // Lanzar: un "ting" metálico y el zumbido de la moneda girando.
      tone(1760, t, 0.5, 0.18, 'sine');
      tone(2637, t, 0.35, 0.1, 'sine');
      for (let i = 0; i < 9; i++) burst(t + 0.05 + i * 0.07, 0.04, 0.06, 'bandpass', 5000, 8);
      tone(1320, t + 0.85, 0.4, 0.14, 'triangle');
      break;
    case 'win':
      [523.25, 659.25, 783.99].forEach((f, i) => tone(f, t + i * 0.06, 0.6, 0.14, 'triangle'));
      break;
    case 'lose':
      [196, 233.08, 277.18].forEach((f, i) => tone(f, t + i * 0.05, 0.9, 0.12, 'sawtooth', f * 0.94));
      break;
    case 'jackpot':
      [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) => tone(f, t + i * 0.08, 0.7, 0.13, 'triangle'));
      break;
    case 'tick':
      // Pasar por una opción del menú: un tic suave y corto.
      tone(1900, t, 0.035, 0.05, 'triangle');
      break;
    case 'select':
      // Elegir una opción: dos notas graves, secas.
      tone(330, t, 0.12, 0.09, 'triangle');
      tone(247, t + 0.06, 0.16, 0.08, 'triangle');
      break;
    case 'whisper':
      // Un susurro: ruido con formantes que se mueven, lejos y bajo.
      burst(t, 1.4, 0.12, 'bandpass', 700, 9, 1100);
      burst(t + 0.15, 1.2, 0.08, 'bandpass', 2400, 12, 1700);
      break;
  }
}

/** Intensidad del zumbido (0-1), con un fundido lento. */
export function setAmbientLevel(level: number): void {
  const next = Math.min(Math.max(level, 0), 1);
  if (Math.abs(next - ambientLevel) < 0.001) return;
  ambientLevel = next;
  if (ctx && ambient) ambient.gain.gain.setTargetAtTime(Math.max(0.0001, AMBIENT_GAIN * ambientLevel), ctx.currentTime, 0.8);
}

/** Zumbido ambiente de la sala o la portada (null = silencio). Cambia con un fundido. */
export function setAmbient(table: AmbientId | null): void {
  if (!ctx || !master) return;
  if (ambient?.table === table) return;
  const t = ctx.currentTime;
  if (ambient) {
    const old = ambient;
    old.gain.gain.setTargetAtTime(0.0001, t, 0.3);
    window.setTimeout(() => old.nodes.forEach((n) => (n as OscillatorNode).stop?.()), 1500);
    ambient = null;
  }
  if (table === null) return;
  const room = table === 'title' ? TITLE_ROOM : (ROOMS[table] ?? ROOMS[1]);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.setTargetAtTime(Math.max(0.0001, AMBIENT_GAIN * ambientLevel), t, 0.6);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = room.cutoff;
  const a = ctx.createOscillator();
  const b = ctx.createOscillator();
  a.type = 'sawtooth';
  b.type = 'sawtooth';
  a.frequency.value = room.freq;
  b.frequency.value = room.freq * 1.007;
  // Respira despacio: un LFO sobre el filtro.
  const lfo = ctx.createOscillator();
  const depth = ctx.createGain();
  lfo.frequency.value = 0.13;
  depth.gain.value = room.cutoff * 0.25;
  lfo.connect(depth).connect(lp.frequency);
  a.connect(lp);
  b.connect(lp);
  lp.connect(gain).connect(master);
  a.start();
  b.start();
  lfo.start();
  ambient = { table, nodes: [a, b, lfo], gain };
}

/** Sonido del resultado de una apuesta del jugador (y el susurro si la pérdida es grande). */
export function outcomeSound(bettor: string, outcome: 'gana' | 'pierde' | 'jackpot', bet: number, ceiling: number): void {
  if (bettor !== 'jugador') return;
  if (outcome === 'jackpot') sfx('jackpot');
  else if (outcome === 'gana') sfx('win');
  else {
    sfx('lose');
    if (bet >= ceiling * 0.5) sfx('whisper');
  }
}
