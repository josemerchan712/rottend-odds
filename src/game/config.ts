import shared from '../../shared/config.json';

/**
 * Todos los números del diseño en un solo sitio.
 * La lógica lee de aquí; para ajustar el equilibrio solo se toca este archivo...
 * salvo los números que también usa el servidor para validar (deuda, versión del guardado y
 * costes de las mejoras), que viven en shared/config.json y se leen desde allí.
 */
export const CONFIG = {
  tech: {
    /** Clave de localStorage. */
    saveKey: 'casino-incremental-save',
    /** Clave aparte para los ajustes, que sobreviven a borrar la partida. */
    settingsKey: 'casino-incremental-settings',
    /** Clave aparte para la sesión con el servidor (opcional). */
    sessionKey: 'casino-incremental-session',
    /** Segundos entre autoguardados. */
    autosaveInterval: 5,
    /** Tope de tiempo delta por frame (s), para que una pestaña dormida no dé un salto enorme. */
    maxFrameDt: 0.25,
    /** Tiradas recientes que se guardan para mostrarlas. */
    recentSpins: 8,
  },

  roulette: {
    /** 0 verde y 1-36 (impares negro, pares blanco). */
    slots: 37,
  },

  /**
   * Tipos de apuesta. La probabilidad se calcula sobre el color (suerte y penalización) y se
   * escala por `chanceRatio` (casillas respecto al color) y por un multiplicador de suerte:
   *   p_tipo = p_color_efectiva * chanceRatio * m,   m = luckMin + (luckMax - luckMin) * L
   * con L el progreso de la curva de suerte (0-1). Con pagos de ruleta real el valor esperado
   * por ficha queda 2 * p_color * m - 1 en los tres tipos: con m < 1 (poca suerte) el color es
   * la mejor apuesta; con m > 1 (mucha suerte) docena y número rinden más, con más varianza.
   */
  betTypes: {
    color: { name: 'Color', payout: 1, chanceRatio: 1, luckMin: 1, luckMax: 1 },
    /** Supera al color desde suerte 8; con suerte máxima, +83% de valor esperado. */
    dozen: { name: 'Docena', payout: 2, chanceRatio: 12 / 18, luckMin: 0.9, luckMax: 1.4 },
    /** Supera al color desde suerte 8; con suerte máxima, +165% de valor esperado. */
    number: { name: 'Número', payout: 35, chanceRatio: 1 / 18, luckMin: 0.8, luckMax: 1.8 },
  },

  luck: {
    /** Probabilidad de ganar sin mejoras (18/37). */
    base: 0.486,
    /** Tope absoluto: nunca se gana siempre. */
    cap: 0.97,
    /**
     * Curva convexa: los primeros niveles apenas suben, los últimos mucho.
     * p(n) = base + (cap - base) * (n / maxLevel)^exponente
     */
    curveExponent: 1.6,
  },

  risk: {
    /**
     * p_efectiva = p - factor * fraccion^exponente, y el factor baja con la suerte siguiendo
     * su misma curva: factor = alMinimo + (alMaximo - alMinimo) * L. Con suerte máxima,
     * apostar el techo deja 97% - 4% = 93%.
     */
    penaltyFactorAtMinLuck: 0.2,
    penaltyFactorAtMaxLuck: 0.04,
    penaltyExponent: 1.5,
  },

  jackpot: {
    /** Probabilidad base del Cero Dorado. */
    baseChance: 0.001,
    /** Lo que aporta la suerte al máximo nivel (sigue la misma curva que la suerte). */
    luckBonusMax: 0.007,
    /** Lo que aporta cada nivel de la mejora Jackpot (10 niveles → +0,7%). */
    upgradeBonusPerLevel: 0.0007,
    /** Tope total de probabilidad. */
    maxChance: 0.015,
    /** Ganancia = apuesta × multiplicador... */
    payoutMultiplier: 50,
    /** ...pero nunca más de esta fracción de la deuda (500K). */
    payoutCapDebtFraction: 0.05,
  },

  bet: {
    /** Botones rápidos del selector (fracción del techo de apuesta). 1 = TODO. */
    quickFractions: [0.01, 0.1, 0.5, 1] as readonly number[],
    /** Apuesta mínima: con menos de esto no se puede apostar. */
    minBet: 1,
    /** Techo de apuesta sin mejoras. */
    baseMaxBet: 10,
    /** Cada nivel de "Apuesta máxima" multiplica el techo por esto. */
    maxBetMultiplierPerLevel: 2.5,
  },

  helper: {
    /** Segundos entre apuestas sin mejoras de velocidad. */
    baseInterval: 4,
    /** Cada nivel de velocidad quita este porcentaje al intervalo. */
    speedReductionPerLevel: 0.12,
    /**
     * Perfiles en orden de desbloqueo; el primero viene con el Crupier.
     * Apuesta `fraction` del techo, pero nunca más de `maxBalanceFraction` del saldo; si eso no
     * llega a la apuesta mínima, espera. Así el ayudante nunca deja el saldo a 0.
     */
    profiles: [
      { id: 'prudente', name: 'Prudente', fraction: 0.05, maxBalanceFraction: 0.03 },
      { id: 'normal', name: 'Normal', fraction: 0.2, maxBalanceFraction: 0.1 },
      { id: 'agresivo', name: 'Agresivo', fraction: 0.5, maxBalanceFraction: 0.3 },
    ] as readonly { id: string; name: string; fraction: number; maxBalanceFraction: number }[],
    /** Probabilidad extra por nivel de "Suerte del ayudante" (respeta el tope). */
    luckPerLevel: 0.005,
    /** Segundos que se bloquea el ayudante cuando el jugador pierde un TODO. */
    allInLossLockout: 5,
  },

  work: {
    /** Objetos de basura en el suelo como máximo. */
    maxItems: shared.work.maxItems,
    /** Segundos para que reaparezca uno si hay hueco. */
    respawnInterval: shared.work.respawnSeconds,
    /** Cada nivel de "Bolsa grande" suma esta fracción al valor de cada objeto. */
    bagValuePerLevel: shared.work.bagValuePerLevel,
    /** Zona del suelo de la trastienda (640x360) donde aparece la basura (posición de la base del objeto). */
    floor: { x: 150, y: 255, width: 280, height: 82 },
    /** Pies del jugador en la escena: desde aquí se busca "la basura más cercana". */
    player: { x: 64, y: 344 },
    /** Radio de la zona de clic alrededor de cada objeto: generoso a propósito. */
    clickRadius: 26,
    /** Distancia mínima entre objetos al aparecer (para que no se tapen). */
    minItemDistance: 34,
    /** Objetos extra que recogen las pinzas en cada clic, por nivel. */
    tweezersExtraPerLevel: 1,
    cleaner: {
      /** Segundos entre recogidas con el nivel 1. */
      baseInterval: 4,
      /** Cada nivel extra quita esta fracción al intervalo. */
      reductionPerLevel: 0.2,
      /** Dónde aparece el ayudante de limpieza. */
      start: { x: 520, y: 340 },
    },
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
    amount: shared.debt.amount,
  },

  rooms: {
    /** Segundos de cada mitad del fundido a negro al cambiar de sala. */
    fadeSeconds: 0.3,
  },

  dialogue: {
    /** Segundos mínimos entre dos líneas del Encargado (salvo el pago de la deuda). */
    cooldownSeconds: 25,
    /** Apuestas mínimas entre líneas que disparan las apuestas (perder, ganar, quedarse sin fichas). */
    minBetsBetweenLines: 3,
    /** Líneas recientes que no se repiten. */
    recentMemory: 8,
    /** Segundos sin hacer nada para el comentario de silencio largo. */
    silenceSeconds: 75,
    /** Segundos que se ve cada línea antes de desvanecerse. */
    displaySeconds: 4,
  },

  lender: {
    /** Fracción de la deuda reunida a partir de la cual el prestamista pasa a inquieto y a deformado. */
    phaseThresholds: [1 / 3, 2 / 3] as readonly [number, number],
  },

  /** coste(n) = base * crecimiento^n, con n = nivel actual. */
  upgrades: {
    luck: { name: 'Suerte', ...shared.upgrades.luck },
    maxBet: { name: 'Apuesta máxima', ...shared.upgrades.maxBet },
    crupier: { name: 'Crupier (ayudante)', ...shared.upgrades.crupier },
    helperSpeed: { name: 'Velocidad del ayudante', ...shared.upgrades.helperSpeed },
    helperProfile: { name: 'Perfil del ayudante', ...shared.upgrades.helperProfile },
    helperLuck: { name: 'Suerte del ayudante', ...shared.upgrades.helperLuck },
    jackpot: { name: 'Jackpot', ...shared.upgrades.jackpot },
    dozenBet: { name: 'Apuesta a docena', ...shared.upgrades.dozenBet },
    numberBet: { name: 'Apuesta a número', ...shared.upgrades.numberBet },
    tweezers: { name: 'Pinzas', ...shared.upgrades.tweezers },
    bigBag: { name: 'Bolsa grande', ...shared.upgrades.bigBag },
    cleaner: { name: 'Ayudante de limpieza', ...shared.upgrades.cleaner },
  },
} as const;

export type Config = typeof CONFIG;
export type UpgradeId = keyof typeof CONFIG.upgrades;
export type BetType = keyof typeof CONFIG.betTypes;
export const UPGRADE_IDS = Object.keys(CONFIG.upgrades) as UpgradeId[];
