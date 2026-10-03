/**
 * Todos los números del diseño en un solo sitio.
 * La lógica lee de aquí; para ajustar el equilibrio solo se toca este archivo.
 */
export const CONFIG = {
  tech: {
    /** Clave de localStorage. */
    saveKey: 'casino-incremental-save',
    /** Clave aparte para los ajustes, que sobreviven a borrar la partida. */
    settingsKey: 'casino-incremental-settings',
    /** Segundos entre autoguardados. */
    autosaveInterval: 5,
    /** Tope de tiempo delta por frame (s), para que una pestaña dormida no dé un salto enorme. */
    maxFrameDt: 0.25,
    /** Tiradas recientes que se guardan para mostrarlas. */
    recentSpins: 8,
  },

  roulette: {
    /** 18 negro, 18 blanco, 1 cero verde. Solo afecta a qué casilla se enseña. */
    slots: 37,
    /** Pago de una apuesta ganada a color (1:1). */
    payout: 1,
  },

  luck: {
    /** Probabilidad de ganar sin mejoras (18/37). */
    base: 0.486,
    /** Tope absoluto: nunca se gana siempre. */
    cap: 0.97,
    /**
     * Razón de la curva decreciente: cada nivel aporta `ratio` veces lo que aportó el anterior.
     * p(n) = base + (cap - base) * (1 - ratio^n) / (1 - ratio^maxLevel)
     */
    curveRatio: 0.8,
  },

  risk: {
    /** p_efectiva = p - factor * fraccion^exponente */
    penaltyFactor: 0.08,
    penaltyExponent: 1.5,
  },

  jackpot: {
    /** Probabilidad base del Cero Dorado. */
    baseChance: 0.001,
    /** Lo que aporta la suerte al máximo nivel (sigue la misma curva que la suerte). */
    luckBonusMax: 0.007,
    /** Lo que aporta cada nivel de la mejora Jackpot (20 niveles → +0,7%). */
    upgradeBonusPerLevel: 0.00035,
    /** Tope total de probabilidad. */
    maxChance: 0.015,
    /** Ganancia = apuesta × multiplicador... */
    payoutMultiplier: 500,
    /** ...pero nunca más de esta fracción de la deuda. */
    payoutCapDebtFraction: 0.25,
  },

  bet: {
    /** Botones rápidos del selector (fracción del saldo). 1 = TODO. */
    quickFractions: [0.01, 0.1, 0.5, 1] as readonly number[],
    /** Apuesta mínima: con menos de esto no se puede apostar. */
    minBet: 1,
    /** Techo de apuesta sin mejoras. */
    baseMaxBet: 10,
    /** Cada nivel de "Apuesta máxima" multiplica el techo por esto. */
    maxBetMultiplierPerLevel: 1.8,
  },

  helper: {
    /** Segundos entre apuestas sin mejoras de velocidad. */
    baseInterval: 4,
    /** Cada nivel de velocidad quita este porcentaje al intervalo. */
    speedReductionPerLevel: 0.12,
    /** Perfiles en orden de desbloqueo; el primero viene con el Crupier. */
    profiles: [
      { id: 'prudente', name: 'Prudente', fraction: 0.05 },
      { id: 'normal', name: 'Normal', fraction: 0.2 },
      { id: 'agresivo', name: 'Agresivo', fraction: 0.5 },
    ] as readonly { id: string; name: string; fraction: number }[],
    /** Probabilidad extra por nivel de "Suerte del ayudante" (respeta el tope). */
    luckPerLevel: 0.005,
    /** Segundos que se bloquea el ayudante cuando el jugador pierde un TODO. */
    allInLossLockout: 5,
  },

  work: {
    /** Objetos de basura en el suelo como máximo. */
    maxItems: 6,
    /** Segundos para que reaparezca uno si hay hueco. */
    respawnInterval: 2,
    /** Objetos con su valor y peso relativo de aparición. */
    items: [
      { id: 'colilla', name: 'Colilla', value: 1, weight: 45 },
      { id: 'vaso', name: 'Vaso', value: 3, weight: 30 },
      { id: 'botella', name: 'Botella rota', value: 5, weight: 12 },
      { id: 'billete', name: 'Billete arrugado', value: 15, weight: 7 },
      { id: 'ficha', name: 'Ficha olvidada', value: 40, weight: 4 },
      { id: 'cartera', name: 'Cartera', value: 120, weight: 1.5 },
      { id: 'dedo', name: 'Dedo con anillo', value: 500, weight: 0.5 },
    ] as readonly { id: string; name: string; value: number; weight: number }[],
  },

  debt: {
    amount: 10_000_000,
  },

  /** coste(n) = base * crecimiento^n, con n = nivel actual. */
  upgrades: {
    luck: { name: 'Suerte', baseCost: 50, growth: 2.1, maxLevel: 20 },
    maxBet: { name: 'Apuesta máxima', baseCost: 100, growth: 2.3, maxLevel: 12 },
    crupier: { name: 'Crupier (ayudante)', baseCost: 500, growth: 1, maxLevel: 1 },
    helperSpeed: { name: 'Velocidad del ayudante', baseCost: 300, growth: 2.0, maxLevel: 15 },
    helperProfile: { name: 'Perfil del ayudante', baseCost: 1000, growth: 4, maxLevel: 2 },
    helperLuck: { name: 'Suerte del ayudante', baseCost: 800, growth: 2.2, maxLevel: 10 },
    jackpot: { name: 'Jackpot', baseCost: 2000, growth: 2.5, maxLevel: 20 },
  },
} as const;

export type Config = typeof CONFIG;
export type UpgradeId = keyof typeof CONFIG.upgrades;
export const UPGRADE_IDS = Object.keys(CONFIG.upgrades) as UpgradeId[];
