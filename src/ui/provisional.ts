/**
 * Sprites provisionales dibujados con código mientras falta el arte (lista en el README):
 * la basura de la trastienda de la mesa 2. Pixel art de 32x32 hecho con rectángulos.
 * Cuando exista assets/sprites/trash2/<id>.png, la escena usa ese y no este.
 */
type Painter = (px: (x: number, y: number, w: number, h: number, color: string) => void) => void;

const PAINTERS: Record<string, Painter> = {
  // Chicle rosa aplastado con hebras.
  chicle: (px) => {
    px(10, 22, 12, 5, '#c76b8e');
    px(12, 20, 8, 2, '#e08aa8');
    px(8, 24, 2, 2, '#a85676');
    px(22, 23, 3, 2, '#a85676');
    px(14, 21, 3, 1, '#f3b6c9');
  },
  // Moneda atascada, medio de canto.
  moneda: (px) => {
    px(11, 18, 10, 9, '#8a6a2a');
    px(12, 19, 8, 7, '#d4ad48');
    px(14, 21, 4, 3, '#f0d27a');
    px(12, 26, 8, 1, '#5a4418');
  },
  // Bombilla rota: casquillo y cristal partido.
  bombilla: (px) => {
    px(13, 23, 6, 4, '#7d7a70');
    px(13, 24, 6, 1, '#5d5a52');
    px(11, 14, 10, 9, '#d9d3a8');
    px(12, 15, 8, 7, '#f2edc8');
    px(16, 12, 4, 3, '#d9d3a8');
    px(15, 17, 1, 4, '#8f8a6a');
    px(18, 16, 1, 3, '#8f8a6a');
  },
  // Cable pelado: funda negra y cobre a la vista.
  cable: (px) => {
    px(5, 24, 9, 2, '#1d1b19');
    px(14, 22, 6, 2, '#1d1b19');
    px(20, 20, 3, 2, '#c4743a');
    px(23, 18, 3, 2, '#e3954f');
    px(26, 17, 2, 1, '#e3954f');
    px(13, 23, 1, 1, '#c4743a');
  },
  // Ficha oxidada: ficha de casino comida por el óxido.
  oxidada: (px) => {
    px(10, 20, 12, 7, '#4a2c1a');
    px(11, 21, 10, 5, '#8a4f2a');
    px(13, 22, 6, 3, '#b0703a');
    px(11, 21, 2, 2, '#5c7a3a');
    px(19, 24, 2, 1, '#5c7a3a');
  },
  // Diente de oro (la recompensa alta), con un poco de encía.
  diente: (px) => {
    px(12, 15, 8, 10, '#a8841f');
    px(13, 16, 6, 8, '#f0cf55');
    px(13, 25, 2, 3, '#a8841f');
    px(17, 25, 2, 3, '#a8841f');
    px(14, 17, 2, 4, '#fff0a8');
    px(11, 14, 10, 2, '#8a2f2a');
  },
};

export function provisionalTrash(): Map<string, HTMLCanvasElement> {
  const out = new Map<string, HTMLCanvasElement>();
  for (const [id, paint] of Object.entries(PAINTERS)) {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    // Sombra en el suelo.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(4, 28, 24, 3);
    // Un poco más grandes que su dibujo, para que destaquen sobre la basura pintada en el fondo.
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
