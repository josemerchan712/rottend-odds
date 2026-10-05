import shared from '../../shared/config.json';

/**
 * Todos los números del diseño en un solo sitio.
 * La lógica lee de aquí; para ajustar el equilibrio solo se toca este archivo...
 * salvo los números que también usa el servidor para validar (deuda, versión del guardado y
 * costes de las mejoras), que viven en shared/config.json y se leen desde allí.
 */
/**
 * Perfil de un ayudante (todas las mesas): como mucho `fraction` del techo y `maxBalanceFraction` del
 * saldo; `kelly` veces la fracción de Kelly; `maxLossWindow` = probabilidad máxima de acabar 2 minutos
 * en negativo (ver helperPolicy).
 */
export interface HelperProfileConfig {
  id: string;
  name: string;
  fraction: number;
  maxBalanceFraction: number;
  kelly: number;
  maxLossWindow: number;
}

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
      { id: 'prudente', name: 'Prudente', fraction: 0.05, maxBalanceFraction: 0.03, kelly: 0.5, maxLossWindow: 0.03 },
      { id: 'normal', name: 'Normal', fraction: 0.2, maxBalanceFraction: 0.1, kelly: 1, maxLossWindow: 0.15 },
      { id: 'agresivo', name: 'Agresivo', fraction: 0.5, maxBalanceFraction: 0.3, kelly: 2, maxLossWindow: 1 },
    ] as readonly HelperProfileConfig[],
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
    /** Segundos sin ninguna acción del jugador (clics, teclas) para el comentario de silencio largo. */
    silenceSeconds: 75,
    /** Líneas de silencio como mucho hasta la siguiente acción del jugador. */
    maxSilenceLines: 2,
    /** Apuesta grande (para perder/ganar grande): al menos esta fracción del techo... */
    bigBetCeilingFraction: 0.5,
    /** ...y al menos estas fichas. */
    bigBetMinChips: 20,
    /** "Volver a la partida" solo si han pasado al menos estos segundos reales desde el último guardado. */
    resumeMinAbsenceSeconds: 300,
    /** Ausencia larga (para las líneas con condición): una hora o más. */
    longAbsenceSeconds: 3600,
    /** Segundos que se ve cada línea antes de desvanecerse. */
    displaySeconds: 4,
  },

  lender: {
    /** Fracción de la deuda reunida a partir de la cual el prestamista pasa a inquieto y a deformado. */
    phaseThresholds: [1 / 3, 2 / 3] as readonly [number, number],
  },

  /**
   * Mesa 2: la tragaperras. Se desbloquea al saldar la deuda de la mesa 1. Tiene su moneda, su
   * suerte, sus mejoras, su ayudante (el empleado zombi), su trabajo y su prestamista.
   */
  slots: {
    /** Los 6 símbolos de cada carrete. El diamante solo sale tres veces en el jackpot. */
    symbols: [
      { id: 'cereza', name: 'Cereza' },
      { id: 'calavera', name: 'Calavera' },
      { id: 'diamante', name: 'Diamante' },
      { id: 'limon', name: 'Limón podrido' },
      { id: 'siete', name: 'Siete' },
      { id: 'ojo', name: 'Ojo' },
    ] as readonly { id: string; name: string }[],
    /** Índice del diamante en `symbols`. */
    diamond: 2,
    /** Pago bruto (lo que devuelve la máquina, apuesta incluida): dos iguales y tres iguales. */
    pairPayout: 1.5,
    triplePayout: 10,
    /**
     * De las tiradas con premio, la parte que son tres iguales (con carretes honrados es 6/96 = 1/16).
     * Premio bruto medio de una tirada ganadora: 15/16 * 1,5 + 1/16 * 10 ≈ 2,03 veces la apuesta.
     */
    tripleShare: 1 / 16,
    luck: {
      /** Probabilidad de premio sin mejoras: la de unos carretes honrados (96/216). VE ≈ -10%. */
      base: 96 / 216,
      /** Tope: el 97% de las tiradas con premio. */
      cap: 0.97,
      curveExponent: 1.6,
    },
    /** Penalización por apostar fuerte: igual que en la ruleta. */
    risk: { penaltyFactorAtMinLuck: 0.2, penaltyFactorAtMaxLuck: 0.04, penaltyExponent: 1.5 },
    jackpot: {
      /** Tres diamantes: probabilidad base, aporte de la suerte (curva L), por nivel de mejora y tope. */
      baseChance: 0.001,
      luckBonusMax: 0.007,
      upgradeBonusPerLevel: 0.0007,
      maxChance: 0.015,
      /**
       * Ganancia neta = apuesta × 1000, pero nunca más que el pozo ni que el 25% de la deuda.
       * El pozo (progresivo) empieza en `potSeed` y crece con una fracción de cada apuesta de la
       * mesa; al salir el jackpot vuelve a `potSeed`. Sin pozo, x1000 con un 0,1% ya daría +100% de
       * valor esperado por tirada y el jackpot sería casi todo el dinero de la mesa.
       */
      payoutMultiplier: 1000,
      payoutCapDebtFraction: 0.25,
      potSeed: 50,
      potContribution: 0.15,
    },
    /**
     * Retener carrete: el carrete elegido conserva su símbolo en la siguiente tirada. Cuesta un
     * extra (fracción de la apuesta) y convierte en premio una parte de las tiradas que perderían:
     *   p_retenida = p + (1 - p) * parte,   parte = base + porNivel * (nivel - 1)
     * Compensa con poca suerte o apostando fuerte; con mucha suerte, no. Una tirada con un
     * carrete retenido no puede dar el jackpot, y un diamante no se deja retener.
     */
    hold: { feeFraction: 0.25, shareBase: 0.35, sharePerLevel: 0.06 },
    bet: { minBet: 1, baseMaxBet: 15, maxBetMultiplierPerLevel: 2.5 },
    helper: {
      baseInterval: 4,
      speedReductionPerLevel: 0.12,
      /** Prudente: siempre seguro. Agresivo: solo compensa con suerte alta. */
      profiles: [
        { id: 'prudente', name: 'Prudente', fraction: 0.05, maxBalanceFraction: 0.03, kelly: 0.5, maxLossWindow: 0.03 },
        { id: 'normal', name: 'Normal', fraction: 0.2, maxBalanceFraction: 0.1, kelly: 1, maxLossWindow: 0.15 },
        { id: 'agresivo', name: 'Agresivo', fraction: 0.5, maxBalanceFraction: 0.3, kelly: 2, maxLossWindow: 1 },
      ] as readonly HelperProfileConfig[],
      luckPerLevel: 0.005,
    },
    /**
     * Conversión: la mesa 2 recibe monedas por segundo = max(suelo, k * (ingreso/s de la mesa 1)^0,5).
     * El ingreso de la mesa 1 es el esperado de su ayudante y su limpiador (lo que gana sola). El suelo
     * es la red de seguridad de las mesas sin trastienda: nunca hay bloqueo (1 moneda/s).
     */
    conversion: { k: 0.3, floor: 1 },
    debt: { amount: shared.slots.debt.amount },
    upgrades: {
      luck: { name: 'Suerte', ...shared.slots.upgrades.luck },
      maxBet: { name: 'Apuesta máxima', ...shared.slots.upgrades.maxBet },
      zombie: { name: 'Empleado zombi (ayudante)', ...shared.slots.upgrades.zombie },
      helperSpeed: { name: 'Velocidad del zombi', ...shared.slots.upgrades.helperSpeed },
      helperProfile: { name: 'Perfil del zombi', ...shared.slots.upgrades.helperProfile },
      helperLuck: { name: 'Suerte del zombi', ...shared.slots.upgrades.helperLuck },
      jackpot: { name: 'Jackpot', ...shared.slots.upgrades.jackpot },
      hold: { name: 'Retener carrete', ...shared.slots.upgrades.hold },
    },
  },

  /**
   * Mesa 3: los dados del Barman. Se desbloquea al saldar la deuda de la mesa 2. Moneda: chapas.
   * Dos dados y un objetivo elegido antes de tirar; los objetivos funcionan como los tipos de apuesta
   * de la ruleta: p = p_par · r · m(L) y pago neto 2/r − 1, así que el valor esperado base es el
   * mismo y cambia el riesgo. m sube con la suerte (más en los arriesgados).
   */
  dice: {
    targets: {
      par: { name: 'Par', short: 'PAR', ratio: 1, payout: 1, luckMin: 1, luckMax: 1, unlock: null },
      over7: { name: 'Más de 7', short: '>7', ratio: 15 / 18, payout: 1.4, luckMin: 0.97, luckMax: 1.15, unlock: null },
      over9: { name: 'Más de 9', short: '>9', ratio: 1 / 3, payout: 5, luckMin: 0.9, luckMax: 1.4, unlock: 'hardTargets' },
      double: { name: 'Doble', short: 'DOBLE', ratio: 1 / 3, payout: 5, luckMin: 0.85, luckMax: 1.5, unlock: 'hardTargets' },
      boxcars: { name: 'Doble seis', short: '6·6', ratio: 1 / 18, payout: 35, luckMin: 0.8, luckMax: 1.8, unlock: 'boxcars' },
    } as Record<string, { name: string; short: string; ratio: number; payout: number; luckMin: number; luckMax: number; unlock: string | null }>,
    /** Probabilidad de acertar "par" sin suerte (la casa gana algo) y tope. */
    luck: { base: 0.486, cap: 0.97, curveExponent: 1.6 },
    risk: { penaltyFactorAtMinLuck: 0.2, penaltyFactorAtMaxLuck: 0.04, penaltyExponent: 1.5 },
    /**
     * Relanzamientos: cargas que da la suerte. Máximo 1 + nivel / perLevels; se recarga una cada
     * rechargeSeconds × rechargeFactor^nivel (16 s → ~3,7 s). Tras una tirada perdida se puede gastar una para
     * volver a tirar un dado (honrado). La reserva es común con el ayudante.
     */
    rerolls: { base: 1, perLevels: 4, rechargeSeconds: 16, rechargeFactor: 0.93, helperThreshold: 1 / 3 },
    /**
     * Jackpot: tres dobles seises seguidos. Los dados están cargados: el doble seis sale con
     * probabilidad j^(1/3) (dentro de las tiradas ganadoras), con j de 0,1% a 1,5% como en las otras
     * mesas, así que tres seguidos salen con probabilidad ~j. Paga min(apuesta × 500, pozo, 25% deuda).
     */
    jackpot: {
      baseChance: 0.001,
      luckBonusMax: 0.007,
      upgradeBonusPerLevel: 0.0007,
      maxChance: 0.015,
      streak: 3,
      payoutMultiplier: 500,
      payoutCapDebtFraction: 0.25,
      potSeed: 50,
      potContribution: 0.15,
    },
    bet: { minBet: 1, baseMaxBet: 20, maxBetMultiplierPerLevel: 2.5 },
    helper: {
      baseInterval: 4,
      speedReductionPerLevel: 0.12,
      profiles: [
        { id: 'prudente', name: 'Prudente', fraction: 0.05, maxBalanceFraction: 0.03, kelly: 0.5, maxLossWindow: 0.03 },
        { id: 'normal', name: 'Normal', fraction: 0.2, maxBalanceFraction: 0.1, kelly: 1, maxLossWindow: 0.15 },
        // Agresivo: todo el techo y hasta el 60% del saldo, el doble de Kelly y sin umbral de riesgo.
        { id: 'agresivo', name: 'Agresivo', fraction: 1, maxBalanceFraction: 0.6, kelly: 2, maxLossWindow: 1 },
      ] as readonly HelperProfileConfig[],
      luckPerLevel: 0.005,
    },
    /** Conversión: chapas/s = max(suelo, k * (ingreso/s de la mesa 2)^0,5). k 0,3 → 0,38 en la sesión 5 (el zombi con criterio de Kelly rinde menos al empezar la mesa 3). */
    conversion: { k: 0.38, floor: 1 },
    debt: { amount: shared.dice.debt.amount },
    upgrades: {
      luck: { name: 'Suerte', ...shared.dice.upgrades.luck },
      maxBet: { name: 'Apuesta máxima', ...shared.dice.upgrades.maxBet },
      ghost: { name: 'Camarero fantasma (ayudante)', ...shared.dice.upgrades.ghost },
      helperSpeed: { name: 'Velocidad del camarero', ...shared.dice.upgrades.helperSpeed },
      helperProfile: { name: 'Perfil del camarero', ...shared.dice.upgrades.helperProfile },
      helperLuck: { name: 'Suerte del camarero', ...shared.dice.upgrades.helperLuck },
      jackpot: { name: 'Jackpot', ...shared.dice.upgrades.jackpot },
      hardTargets: { name: 'Más de 9 y doble', ...shared.dice.upgrades.hardTargets },
      boxcars: { name: 'Doble seis', ...shared.dice.upgrades.boxcars },
    },
  },

  /**
   * Mesa 4: blackjack simplificado de la Crupier. Se desbloquea al saldar la deuda de la mesa 3.
   * Moneda: fichas negras. Una baraja de 52 barajada en cada mano; la banca pide hasta 17; solo pedir
   * o plantarse; ganar paga 1:1 (también el blackjack natural); el empate devuelve la apuesta.
   */
  cards: {
    /** La banca se planta con esto o más (también con 17 blando). */
    dealerStands: 17,
    /**
     * Suerte: probabilidad de ganar una mano con estrategia básica, de la honrada (rigTable con
     * intensidad 0) a 97% con suerte máxima (curva 1,6), menos la penalización por apostar fuerte. La
     * intensidad de la baraja que da esa probabilidad sale de la tabla calibrada (src/game/cards/rigTable.ts).
     */
    luck: { cap: 0.97, curveExponent: 1.6 },
    risk: { penaltyFactorAtMinLuck: 0.2, penaltyFactorAtMaxLuck: 0.04, penaltyExponent: 1.5 },
    /** Descartes: como los relanzamientos de la mesa 3 (máximo 1 + nivel / perLevels). */
    /**
     * Descartes: como los relanzamientos de la mesa 3 pero más frecuentes (máximo 1 + nivel / 3, una
     * cada 6 s × 0,93^nivel): en el blackjack la baraja ya favorece y cada descarte vale menos. La carta que
     * sustituye a la descartada se elige con `extraCandidates` candidatas más (nunca contra el jugador).
     */
    discards: { base: 1, perLevels: 3, rechargeSeconds: 6, rechargeFactor: 0.93, extraCandidates: 2 },
    /**
     * Jackpot: 21 con tres sietes. Con probabilidad j por mano (0,1% → 1,5%) la baraja trae 7-7 al
     * jugador y otro 7 arriba: hay que pedir con 14. Paga min(apuesta × 500, pozo, 25% de la deuda).
     */
    jackpot: {
      baseChance: 0.001,
      luckBonusMax: 0.007,
      upgradeBonusPerLevel: 0.0007,
      maxChance: 0.015,
      payoutMultiplier: 500,
      payoutCapDebtFraction: 0.25,
      potSeed: 50,
      potContribution: 0.08,
    },
    bet: { minBet: 1, baseMaxBet: 15, maxBetMultiplierPerLevel: 2.5 },
    helper: {
      baseInterval: 4,
      speedReductionPerLevel: 0.12,
      /**
       * Además de su fracción del techo y su máximo del saldo, cada perfil apuesta como mucho
       * `kelly` veces la fracción de Kelly del saldo (criterio de crecimiento): con valor esperado
       * negativo espera. Agresivo (2× Kelly) solo compensa cuando lo limita el techo (suerte alta).
       */
      profiles: [
        { id: 'prudente', name: 'Prudente', fraction: 0.05, maxBalanceFraction: 0.03, kelly: 0.5, maxLossWindow: 0.03 },
        { id: 'normal', name: 'Normal', fraction: 0.2, maxBalanceFraction: 0.1, kelly: 1, maxLossWindow: 0.15 },
        { id: 'agresivo', name: 'Agresivo', fraction: 0.6, maxBalanceFraction: 0.4, kelly: 2, maxLossWindow: 1 },
      ] as readonly HelperProfileConfig[],
      luckPerLevel: 0.005,
    },
    /** Conversión: fichas negras/s = k * (ingreso/s de la mesa 3)^0,5. */
    conversion: { k: 0.3, floor: 1 },
    debt: { amount: shared.cards.debt.amount },
    upgrades: {
      luck: { name: 'Suerte', ...shared.cards.upgrades.luck },
      maxBet: { name: 'Apuesta máxima', ...shared.cards.upgrades.maxBet },
      skeleton: { name: 'Esqueleto barajador (ayudante)', ...shared.cards.upgrades.skeleton },
      helperSpeed: { name: 'Velocidad del esqueleto', ...shared.cards.upgrades.helperSpeed },
      helperProfile: { name: 'Perfil del esqueleto', ...shared.cards.upgrades.helperProfile },
      helperLuck: { name: 'Suerte del esqueleto', ...shared.cards.upgrades.helperLuck },
      jackpot: { name: 'Jackpot', ...shared.cards.upgrades.jackpot },
    },
  },

  /**
   * Mesa 5: Doble o nada (el Dueño). Se apuesta y se lanza una moneda: con cara se dobla y se decide
   * retirarse o seguir (hasta 10 caras), con cruz se pierde todo. Sin trastienda.
   */
  coin: {
    /**
     * Suerte: probabilidad de cara del primer lanzamiento, de `base` (por debajo del 50%: la casa) a
     * `cap` con suerte máxima (curva 1,6), menos la penalización por apostar fuerte y la fatiga.
     */
    luck: { base: 0.47, cap: 0.97, curveExponent: 1.6, floor: 0.05 },
    /** Cada cara seguida baja la probabilidad del siguiente lanzamiento; el temple lo reduce. */
    fatigue: { perWin: 0.05, templeReductionPerLevel: 0.006 },
    risk: { penaltyFactorAtMinLuck: 0.2, penaltyFactorAtMaxLuck: 0.04, penaltyExponent: 1.5 },
    /** Como mucho 10 caras por cadena; una cadena paga como mucho el 25% de la deuda. */
    chain: { maxWins: 10, payoutCapDebtFraction: 0.25 },
    /** Segundas oportunidades: como los relanzamientos (máximo 1 + nivel / 5, una cada 20 s × 0,93^nivel). */
    seconds: { base: 1, perLevels: 5, rechargeSeconds: 20, rechargeFactor: 0.93 },
    /** Jackpot: completar las 10 caras. Paga el pozo (semilla 50, +6% de cada apuesta), como mucho el 25% de la deuda. */
    jackpot: { potSeed: 50, potContribution: 0.06, payoutCapDebtFraction: 0.25 },
    /**
     * Techo: 3 × 2,5^nivel (máximo 28.610). Más bajo que en las otras mesas porque una cadena multiplica
     * la apuesta por 8-16: con techo 15 el final era una explosión de segundos (tramo final de 6 s).
     */
    bet: { minBet: 1, baseMaxBet: 3, maxBetMultiplierPerLevel: 2.5 },
    helper: {
      /** Segundos entre lanzamientos (o decisiones) del diablillo. */
      baseInterval: 2,
      speedReductionPerLevel: 0.12,
      /** `stops`: entre cuántas caras se retira cada perfil (elige dentro con el criterio común). */
      profiles: [
        { id: 'prudente', name: 'Prudente', fraction: 0.05, maxBalanceFraction: 0.03, kelly: 0.5, maxLossWindow: 0.03, stops: [1, 2] },
        { id: 'normal', name: 'Normal', fraction: 0.2, maxBalanceFraction: 0.1, kelly: 1, maxLossWindow: 0.15, stops: [3, 4] },
        { id: 'agresivo', name: 'Agresivo', fraction: 0.5, maxBalanceFraction: 0.3, kelly: 2, maxLossWindow: 1, stops: [5, 10] },
      ] as readonly (HelperProfileConfig & { stops: readonly [number, number] })[],
      luckPerLevel: 0.005,
    },
    /** Conversión: oro/s = max(suelo, k * (ingreso/s de la mesa 4)^0,5). */
    conversion: { k: 0.3, floor: 1 },
    debt: { amount: shared.coin.debt.amount },
    upgrades: {
      luck: { name: 'Suerte', ...shared.coin.upgrades.luck },
      maxBet: { name: 'Apuesta máxima', ...shared.coin.upgrades.maxBet },
      imp: { name: 'Diablillo coronado (ayudante)', ...shared.coin.upgrades.imp },
      helperSpeed: { name: 'Velocidad del diablillo', ...shared.coin.upgrades.helperSpeed },
      helperProfile: { name: 'Perfil del diablillo', ...shared.coin.upgrades.helperProfile },
      helperLuck: { name: 'Suerte del diablillo', ...shared.coin.upgrades.helperLuck },
      temple: { name: 'Temple', ...shared.coin.upgrades.temple },
    },
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
export type SlotUpgradeId = keyof typeof CONFIG.slots.upgrades;
export const SLOT_UPGRADE_IDS = Object.keys(CONFIG.slots.upgrades) as SlotUpgradeId[];
export type DiceUpgradeId = keyof typeof CONFIG.dice.upgrades;
export const DICE_UPGRADE_IDS = Object.keys(CONFIG.dice.upgrades) as DiceUpgradeId[];
export type DiceTarget = 'par' | 'over7' | 'over9' | 'double' | 'boxcars';
export const DICE_TARGETS: DiceTarget[] = ['par', 'over7', 'over9', 'double', 'boxcars'];
export type CardUpgradeId = keyof typeof CONFIG.cards.upgrades;
export const CARD_UPGRADE_IDS = Object.keys(CONFIG.cards.upgrades) as CardUpgradeId[];
export type CoinUpgradeId = keyof typeof CONFIG.coin.upgrades;
export const COIN_UPGRADE_IDS = Object.keys(CONFIG.coin.upgrades) as CoinUpgradeId[];
