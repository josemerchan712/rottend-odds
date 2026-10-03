import { describe, expect, it } from 'vitest';
import { CONFIG, UPGRADE_IDS } from '../src/game/config';
import { buyUpgrade, canBuy, nextCost, upgradeCost } from '../src/game/upgrades';
import { stateWith } from './helpers';

describe('tienda de mejoras', () => {
  it('coste(n) = base * crecimiento^n, redondeado', () => {
    for (const id of UPGRADE_IDS) {
      const { baseCost, growth } = CONFIG.upgrades[id];
      for (const n of [0, 1, 2, 5]) expect(upgradeCost(id, n)).toBe(Math.round(baseCost * growth ** n));
    }
    expect(upgradeCost('luck', 0)).toBe(3);
    expect(upgradeCost('luck', 10)).toBe(Math.round(3 * 1.55 ** 10));
  });

  it('comprar descuenta el coste correcto y sube el nivel', () => {
    const state = stateWith({ balance: 1000 });
    const first = upgradeCost('maxBet', 0);
    const second = upgradeCost('maxBet', 1);
    expect(buyUpgrade(state, 'maxBet')).toBe(true);
    expect(state.balance).toBe(1000 - first);
    expect(state.upgrades.maxBet).toBe(1);
    expect(buyUpgrade(state, 'maxBet')).toBe(true);
    expect(state.balance).toBe(1000 - first - second);
    expect(state.upgrades.maxBet).toBe(2);
  });

  it('no se puede comprar sin fichas suficientes', () => {
    const state = stateWith({ balance: upgradeCost('luck', 0) - 1 });
    expect(canBuy(state, 'luck')).toBe(false);
    expect(buyUpgrade(state, 'luck')).toBe(false);
    expect(state.balance).toBe(upgradeCost('luck', 0) - 1);
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
