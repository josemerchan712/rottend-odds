import { describe, expect, it } from 'vitest';
import { CONFIG, UPGRADE_IDS } from '../src/game/config';
import { buyUpgrade, canBuy, nextCost, upgradeCost } from '../src/game/upgrades';
import { stateWith } from './helpers';

describe('tienda de mejoras', () => {
  it('coste(n) = base * crecimiento^n', () => {
    expect(upgradeCost('luck', 0)).toBe(50);
    expect(upgradeCost('luck', 1)).toBe(105);
    expect(upgradeCost('luck', 2)).toBe(Math.round(50 * 2.1 ** 2));
    expect(upgradeCost('maxBet', 3)).toBe(Math.round(100 * 2.3 ** 3));
  });

  it('comprar descuenta el coste correcto y sube el nivel', () => {
    const state = stateWith({ balance: 1000 });
    expect(buyUpgrade(state, 'luck')).toBe(true);
    expect(state.balance).toBe(950);
    expect(state.upgrades.luck).toBe(1);
    expect(buyUpgrade(state, 'luck')).toBe(true);
    expect(state.balance).toBe(950 - 105);
    expect(state.upgrades.luck).toBe(2);
  });

  it('no se puede comprar sin fichas suficientes', () => {
    const state = stateWith({ balance: 49 });
    expect(canBuy(state, 'luck')).toBe(false);
    expect(buyUpgrade(state, 'luck')).toBe(false);
    expect(state.balance).toBe(49);
    expect(state.upgrades.luck).toBe(0);
  });

  it('no se puede pasar del nivel máximo de ninguna mejora', () => {
    for (const id of UPGRADE_IDS) {
      const state = stateWith({ balance: 1e30 });
      state.upgrades.crupier = 1;
      const max = CONFIG.upgrades[id].maxLevel;
      while (buyUpgrade(state, id));
      expect(state.upgrades[id]).toBe(max);
      expect(nextCost(state, id)).toBeNull();
      const balance = state.balance;
      expect(buyUpgrade(state, id)).toBe(false);
      expect(state.balance).toBe(balance);
    }
  });

  it('las mejoras del ayudante exigen el Crupier', () => {
    const state = stateWith({ balance: 1e6 });
    expect(buyUpgrade(state, 'helperSpeed')).toBe(false);
    expect(buyUpgrade(state, 'crupier')).toBe(true);
    expect(state.balance).toBe(1e6 - 500);
    expect(buyUpgrade(state, 'helperSpeed')).toBe(true);
  });

  it('comprar un perfil lo activa', () => {
    const state = stateWith({ balance: 1e6 });
    buyUpgrade(state, 'crupier');
    buyUpgrade(state, 'helperProfile');
    expect(state.helper.profile).toBe(1);
  });
});
