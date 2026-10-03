import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONFIG, UPGRADE_IDS } from '../src/game/config';
import { SAVE_VERSION } from '../src/game/save';

/** Leído del disco (no importado) para comparar con lo que de verdad usa el juego. */
const shared = JSON.parse(readFileSync(new URL('../shared/config.json', import.meta.url), 'utf-8'));

describe('shared/config.json y config.ts no se desincronizan', () => {
  it('la deuda y la versión del guardado coinciden', () => {
    expect(CONFIG.debt.amount).toBe(shared.debt.amount);
    expect(SAVE_VERSION).toBe(shared.saveVersion);
  });

  it('las mejoras son las mismas, con los mismos costes y niveles', () => {
    expect([...UPGRADE_IDS].sort()).toEqual(Object.keys(shared.upgrades).sort());
    for (const id of UPGRADE_IDS) {
      const { baseCost, growth, maxLevel } = CONFIG.upgrades[id];
      expect({ baseCost, growth, maxLevel }, id).toEqual(shared.upgrades[id]);
    }
  });

  it('el número de perfiles del ayudante coincide', () => {
    expect(CONFIG.helper.profiles.length).toBe(shared.helperProfiles);
    expect(CONFIG.upgrades.helperProfile.maxLevel).toBe(shared.helperProfiles - 1);
  });
});
