import { describe, expect, it } from 'vitest';
import { loadSettings } from '../src/game/settings';
import { STAGE_HEIGHT, STAGE_WIDTH, stageLayout, stageScale } from '../src/ui/stage';
import { memoryStorage } from './helpers';

const SIZES = [
  [1280, 720],
  [1366, 768],
  [1536, 864],
  [1920, 1080],
  [1600, 900],
  [2560, 1440],
  [1024, 640],
  [800, 600],
  [3440, 1440],
  [640, 360],
  [500, 300],
];
const DPRS = [1, 1.25, 1.5, 1.75, 2, 2.25, 3];

describe('escenario: escala entera en píxeles físicos', () => {
  it('k entero, cabe en la ventana y la esquina cae en un píxel físico exacto', () => {
    for (const [w, h] of SIZES) {
      for (const dpr of DPRS) {
        const l = stageLayout(w, h, dpr)!;
        expect(Number.isInteger(l.k)).toBe(true);
        expect(l.k).toBeGreaterThanOrEqual(1);
        // Cada unidad del escenario son k píxeles físicos exactos.
        expect(l.u * dpr).toBeCloseTo(l.k, 10);
        expect(stageScale(w, h, dpr)).toBe(l.u);
        // Cabe (salvo ventanas más pequeñas que 640x360 físicos, que usan k = 1).
        if (w * dpr >= STAGE_WIDTH && h * dpr >= STAGE_HEIGHT) {
          expect(STAGE_WIDTH * l.k).toBeLessThanOrEqual(w * dpr + 1e-9);
          expect(STAGE_HEIGHT * l.k).toBeLessThanOrEqual(h * dpr + 1e-9);
          // Es el mayor entero que cabe.
          expect(STAGE_WIDTH * (l.k + 1) > w * dpr || STAGE_HEIGHT * (l.k + 1) > h * dpr).toBe(true);
        }
        expect(Math.abs(l.left * dpr - Math.round(l.left * dpr))).toBeLessThan(1e-9);
        expect(Math.abs(l.top * dpr - Math.round(l.top * dpr))).toBeLessThan(1e-9);
      }
    }
  });

  it('pantalla completa 1920x1080: k = 3 con dpr 1 (a 1920x1080 físicos) y k = 3 con dpr 1,5', () => {
    expect(stageLayout(1920, 1080, 1)!.k).toBe(3);
    expect(stageLayout(1280, 720, 1.5)!.k).toBe(3);
    expect(stageLayout(1536, 864, 1.25)!.k).toBe(3);
  });

  it('con la página oculta o minimizada (tamaño 0, dpr 0 o NaN) no hay composición nueva: se conserva la anterior', () => {
    expect(stageLayout(0, 0, 1)).toBeNull();
    expect(stageLayout(1280, 0, 1.5)).toBeNull();
    expect(stageLayout(1280, 720, 0)).toBeNull();
    expect(stageLayout(Number.NaN, 720, 1)).toBeNull();
    // Ventanas diminutas pero válidas: nunca menos de 1 píxel físico por unidad.
    expect(stageLayout(100, 60, 1)!.k).toBe(1);
    // Misma ventana, mismo resultado (sin estado oculto).
    expect(stageLayout(1366, 768, 1.25)).toEqual(stageLayout(1366, 768, 1.25));
  });
});

describe('ajustes: filtro CRT de tres niveles', () => {
  it('por defecto suave; los ajustes viejos (sí/no) pasan a suave/apagado', () => {
    const storage = memoryStorage();
    expect(loadSettings(storage, 'k').crt).toBe('suave');
    storage.setItem('k', JSON.stringify({ version: 1, settings: { crtEnabled: false } }));
    expect(loadSettings(storage, 'k').crt).toBe('apagado');
    storage.setItem('k', JSON.stringify({ version: 1, settings: { crtEnabled: true } }));
    expect(loadSettings(storage, 'k').crt).toBe('suave');
    storage.setItem('k', JSON.stringify({ version: 2, settings: { crt: 'fuerte' } }));
    expect(loadSettings(storage, 'k').crt).toBe('fuerte');
    storage.setItem('k', JSON.stringify({ version: 2, settings: { crt: 'rosa' } }));
    expect(loadSettings(storage, 'k').crt).toBe('suave');
  });
});
