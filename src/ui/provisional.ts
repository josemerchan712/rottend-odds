/**
 * Sprites provisionales dibujados con código mientras falta el arte (lista en PROGRESS.md y en
 * GAME_DESIGN 8.1): la basura de la trastienda de la mesa 3. 32x32 hechos con rectángulos.
 * Cuando exista assets/sprites/trash3/<id>.png, la escena usa ese y no este.
 */
type Painter = (px: (x: number, y: number, w: number, h: number, color: string) => void) => void;

const PAINTERS3: Record<string, Painter> = {
  // Servilleta arrugada con una mancha.
  servilleta: (px) => {
    px(10, 20, 12, 7, '#d8d0b8');
    px(12, 19, 7, 1, '#ece6d2');
    px(14, 22, 4, 3, '#8a3a2e');
    px(10, 26, 12, 1, '#9c947e');
  },
  // Vaso sucio con un culo de bebida.
  vaso: (px) => {
    px(12, 14, 8, 13, '#9fb0a8');
    px(13, 15, 6, 11, '#c9d6cf');
    px(13, 22, 6, 4, '#6b4a22');
    px(12, 27, 8, 1, '#5e6b65');
  },
  // Botella vacía tumbada.
  botella: (px) => {
    px(6, 22, 14, 5, '#2f4a2a');
    px(7, 23, 12, 2, '#466b3e');
    px(20, 23, 5, 3, '#2f4a2a');
    px(25, 23, 2, 3, '#8a6a2a');
  },
  // Copa rota: pie, tallo y cristales.
  copa: (px) => {
    px(12, 26, 8, 1, '#b8c8cf');
    px(15, 20, 2, 6, '#b8c8cf');
    px(11, 14, 10, 6, '#cfe0e6');
    px(13, 13, 3, 2, '#cfe0e6');
    px(22, 24, 3, 2, '#e6f2f5');
    px(7, 25, 2, 2, '#e6f2f5');
  },
  // Propina: dos billetes doblados.
  propina: (px) => {
    px(9, 21, 14, 6, '#4f6b3a');
    px(10, 22, 12, 4, '#6f8f52');
    px(13, 19, 12, 5, '#5e7a44');
    px(17, 20, 4, 3, '#a8c27a');
  },
  // Dentadura de oro (la recompensa alta).
  dentadura: (px) => {
    px(9, 18, 14, 9, '#8a2f2a');
    px(10, 19, 12, 3, '#f0cf55');
    px(10, 23, 12, 3, '#f0cf55');
    px(12, 19, 1, 3, '#a8841f');
    px(16, 19, 1, 3, '#a8841f');
    px(14, 23, 1, 3, '#a8841f');
    px(18, 23, 1, 3, '#a8841f');
  },
};

/** Mesa 4: barajar y repartir. */
const PAINTERS4: Record<string, Painter> = {
  // Cenizas de puro con la colilla.
  ceniza: (px) => {
    px(9, 24, 14, 3, '#5e5a55');
    px(11, 23, 9, 1, '#8a857d');
    px(18, 21, 7, 3, '#6b4a2a');
    px(24, 21, 2, 3, '#c0473d');
  },
  // Carta suelta boca abajo, doblada.
  carta: (px) => {
    px(10, 15, 12, 13, '#1d1b19');
    px(11, 16, 10, 11, '#3f5a2e');
    px(13, 19, 6, 5, '#cfc5a6');
    px(15, 21, 2, 1, '#8a2f2a');
  },
  // Ficha de otro jugador (negra con borde).
  ficha: (px) => {
    px(10, 20, 12, 7, '#141110');
    px(11, 21, 10, 5, '#2e2b28');
    px(13, 22, 6, 3, '#d4ad48');
    px(10, 26, 12, 1, '#000000');
  },
  // Mazo atascado: cartas apretadas con una goma.
  mazo: (px) => {
    px(10, 17, 13, 10, '#cfc5a6');
    px(10, 18, 13, 1, '#8f8670');
    px(10, 21, 13, 1, '#8f8670');
    px(10, 24, 13, 1, '#8f8670');
    px(15, 17, 2, 10, '#8a2f2a');
  },
  // Propina: fichas apiladas.
  propina: (px) => {
    px(11, 22, 10, 5, '#5e1f1b');
    px(11, 19, 10, 3, '#8a2f2a');
    px(11, 16, 10, 3, '#a8841f');
    px(13, 17, 6, 1, '#f0cf55');
  },
  // Anillo de sello (la recompensa alta).
  anillo: (px) => {
    px(11, 19, 10, 8, '#a8841f');
    px(13, 21, 6, 4, '#1d1b19');
    px(12, 17, 8, 3, '#f0cf55');
    px(14, 18, 4, 1, '#8a2f2a');
  },
};

export function provisionalTrash(table: 3 | 4 = 3): Map<string, HTMLCanvasElement> {
  const out = new Map<string, HTMLCanvasElement>();
  for (const [id, paint] of Object.entries(table === 3 ? PAINTERS3 : PAINTERS4)) {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(4, 28, 24, 3);
    ctx.translate(16, 28);
    ctx.scale(1.5, 1.5);
    ctx.translate(-16, -28);
    paint((x, y, w, h, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    });
    out.set(id, canvas);
  }
  return out;
}
