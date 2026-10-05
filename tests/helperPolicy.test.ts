import { describe, expect, it } from 'vitest';
import { binaryOutcomes, chooseHelperBet, lossWindowChance, recommendedProfile } from '../src/game/helperPolicy';
import { ADAPTERS, audit } from '../sim/helpersAudit';

describe('criterio común de los ayudantes', () => {
  it('probabilidad de ventana negativa: binomial exacta', () => {
    // 2 apuestas a la par con p = 0,5: negativa solo si pierde las dos (0,25).
    expect(lossWindowChance(binaryOutcomes(0.5, 1), 2)).toBeCloseTo(0.25, 10);
    // 3 apuestas que pagan 5:1 con p = 0,1: negativa si no gana ninguna (0,9^3).
    expect(lossWindowChance(binaryOutcomes(0.1, 5), 3)).toBeCloseTo(0.729, 10);
    // Dos premios (pareja y trío): un trío compensa todas las pérdidas de 5 tiradas.
    const slot = [
      { p: 0.4, net: 0.5 },
      { p: 0.1, net: 9 },
      { p: 0.5, net: -1 },
    ];
    const exact = (() => {
      // Enumeración de las 3^5 combinaciones.
      let neg = 0;
      const rec = (k: number, sum: number, prob: number) => {
        if (k === 5) {
          if (sum < 0) neg += prob;
          return;
        }
        for (const o of slot) rec(k + 1, sum + o.net, prob * o.p);
      };
      rec(0, 0, 1);
      return neg;
    })();
    expect(lossWindowChance(slot, 5)).toBeCloseTo(exact, 10);
  });

  it('sin valor esperado positivo espera; con ventaja apuesta como mucho su parte del techo y del saldo', () => {
    const profile = { fraction: 0.2, maxBalanceFraction: 0.1, kelly: 1, maxLossWindow: 1 };
    const ctx = { balance: 1000, ceiling: 100, minBet: 1, interval: 1 };
    expect(chooseHelperBet(['x'], () => binaryOutcomes(0.49, 1), profile, ctx)).toBeNull();
    const choice = chooseHelperBet(['x'], () => binaryOutcomes(0.9, 1), profile, ctx)!;
    expect(choice.bet).toBeLessThanOrEqual(20);
    expect(choice.ev).toBeGreaterThan(0);
  });

  it('el umbral de riesgo baja la apuesta o hace esperar', () => {
    const ctx = { balance: 1e6, ceiling: 1000, minBet: 1, interval: 4 };
    const safe = { fraction: 0.2, maxBalanceFraction: 0.1, kelly: 1, maxLossWindow: 0.03 };
    const bold = { ...safe, maxLossWindow: 1 };
    const thin = () => binaryOutcomes(0.53, 1);
    expect(chooseHelperBet(['x'], thin, safe, ctx)).toBeNull();
    expect(chooseHelperBet(['x'], thin, bold, ctx)).not.toBeNull();
  });

  it('recomendado: el de más crecimiento; si ninguno apuesta, el prudente', () => {
    const g = [0.001, 0.003, 0.002];
    expect(recommendedProfile(2, (i) => ({ key: 0, bet: 1, ev: 1, growth: g[i] }))).toBe(1);
    expect(recommendedProfile(2, () => null)).toBe(0);
    expect(recommendedProfile(0, (i) => ({ key: 0, bet: 1, ev: 1, growth: g[i] }))).toBe(0);
  });
});

describe('auditoría: objetivos de los perfiles (ayudante solo, 10 techos de saldo)', () => {
  for (const a of ADAPTERS) {
    it(`${a.name}: prudente casi nunca pierde en 2 min y nadie llega a 0`, () => {
      for (const luck of [3, 9, 15, 20]) {
        const prudent = audit(a, luck, true, 0, 6, 6, 2);
        expect(prudent.negative2).toBeLessThanOrEqual(0.1);
        for (const p of [0, 1, 2]) expect(audit(a, luck, true, p, 4, 6, 2).zeros).toBe(0);
      }
    }, 30_000);

    it(`${a.name}: con suerte alta, agresivo es el más rápido`, () => {
      const rows = [0, 1, 2].map((p) => audit(a, 20, true, p, 6, 4, 10).mean);
      expect(rows[2]).toBeGreaterThan(rows[1]);
      expect(rows[1]).toBeGreaterThan(rows[0]);
    }, 30_000);
  }
});

describe('medidor del ayudante (+N/min)', () => {
  it('suma solo el último minuto y se reinicia si el reloj vuelve atrás', async () => {
    const { HelperMeter } = await import('../src/ui/helperMeter');
    const m = new HelperMeter();
    m.add(1, 10);
    m.add(30, -4);
    m.add(65, 7);
    expect(m.perMinute(65)).toBe(3); // el de t=1 ya salió
    expect(m.active(200)).toBe(false);
    m.add(70, 5);
    m.add(2, 1); // partida cargada: reloj atrás
    expect(m.perMinute(2)).toBe(1);
  });
});
