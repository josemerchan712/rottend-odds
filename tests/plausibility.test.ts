import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { configHash } from '../sim/plausibility-hash';

const read = (file: string) => readFileSync(new URL(`../shared/${file}`, import.meta.url), 'utf-8');
const table = JSON.parse(read('plausibility.json'));

describe('shared/plausibility.json', () => {
  it('se generó con la shared/config.json actual (si falla: npm run plausibility)', () => {
    expect(table.configHash).toBe(configHash(read('config.json')));
    // La que se sube tiene que ser la completa (npm run plausibility, que es --full).
    expect(table.mode, 'generada con --quick: regenera con npm run plausibility').toBe('full');
  });

  it('la tabla nunca baja y cubre todo el horizonte', () => {
    expect(table.maxEarned).toHaveLength(table.horizonSeconds / table.sampleEverySeconds + 1);
    for (let k = 1; k < table.maxEarned.length; k++) {
      expect(table.maxEarned[k]).toBeGreaterThanOrEqual(table.maxEarned[k - 1]);
    }
    expect(table.maxEarnedPerSecondAfterHorizon).toBeGreaterThan(0);
  });

  it('usa los márgenes acordados (x2 en fichas, x0,5 en tiempo)', () => {
    expect(table.earnedMargin).toBe(2);
    expect(table.timeMargin).toBe(0.5);
    expect(table.minDebtSeconds).toBeGreaterThan(0);
  });
});
