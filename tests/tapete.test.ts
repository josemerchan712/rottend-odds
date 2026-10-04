import { describe, expect, it } from 'vitest';
import { ZONES, TAPETE, chipAt, chipRect, inCenter, numberAt, zoneAt, WHEEL_CENTER } from '../src/ui/casinoLayout';
import { WHEEL_SIZE } from '../src/ui/rouletteView';

describe('tapete de apuestas', () => {
  it('tiene negro, blanco, tres docenas y los 36 números, sin solaparse', () => {
    expect(ZONES.filter((z) => z.type === 'color').map((z) => z.id)).toEqual(['negro', 'blanco']);
    expect(ZONES.filter((z) => z.type === 'dozen')).toHaveLength(3);
    const numbers = ZONES.filter((z) => z.type === 'number').map((z) => (z.choice.type === 'number' ? z.choice.number : 0));
    expect([...numbers].sort((a, b) => a - b)).toEqual(Array.from({ length: 36 }, (_, i) => i + 1));
    for (const a of ZONES) {
      for (const b of ZONES) {
        if (a === b) continue;
        const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlap, `${a.id} y ${b.id}`).toBe(false);
      }
    }
  });

  it('cada zona se detecta en su centro y fuera del tapete no hay ninguna', () => {
    for (const z of ZONES) expect(zoneAt(z.x + z.width / 2, z.y + z.height / 2)?.id).toBe(z.id);
    expect(zoneAt(10, 10)).toBeNull();
    expect(zoneAt(TAPETE.x + TAPETE.width + 5, TAPETE.y + 5)).toBeNull();
  });

  it('los números van en columnas de tres, como en un tapete real', () => {
    expect([numberAt(0, 0), numberAt(0, 1), numberAt(0, 2)]).toEqual([3, 2, 1]);
    expect(numberAt(11, 0)).toBe(36);
    const docena2 = ZONES.find((z) => z.id === 'dozen-2')!;
    expect(docena2.choice).toEqual({ type: 'dozen', dozen: 2 });
  });

  it('las fichas del selector se detectan por posición', () => {
    for (let i = 0; i < 4; i++) {
      const r = chipRect(i);
      expect(chipAt(r.x + r.width / 2, r.y + r.height / 2, 4)).toBe(i);
    }
    const last = chipRect(3);
    expect(chipAt(last.x + 5, last.y + 5, 3)).toBeNull(); // solo hay 3 visibles
  });

  it('la rueda y la mesa quedan en el 60% central de la escena', () => {
    expect(inCenter(TAPETE)).toBe(true);
    expect(inCenter({ x: WHEEL_CENTER.x - WHEEL_SIZE / 2, y: 0, width: WHEEL_SIZE, height: 1 })).toBe(true);
    for (const z of ZONES) expect(inCenter(z)).toBe(true);
  });
});
