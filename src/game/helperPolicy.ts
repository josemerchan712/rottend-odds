/**
 * Criterio común de los ayudantes de todas las mesas (sesión 5, auditoría).
 *
 * Antes cada ayudante apostaba una fracción fija del techo (limitada por el saldo) aunque la apuesta
 * tuviera valor esperado negativo o un riesgo enorme para su ventaja: el camarero perseguía el doble
 * seis con suerte alta y el crupier prudente perdía un tercio de las ventanas de 2 minutos con poca
 * suerte. Ahora, para cada opción (tipo de apuesta, objetivo, retener o no):
 *
 * 1. Las probabilidades salen de la apuesta concreta: penalización por apostar fuerte, suerte propia
 *    del ayudante y lo que suman sus recursos (retener, relanzar).
 * 2. Se busca la fracción del saldo que maximiza el crecimiento (criterio de Kelly) y se apuesta
 *    `kelly` veces esa fracción, como mucho la del perfil (techo y saldo).
 * 3. Riesgo: con las apuestas que caben en 2 minutos, la probabilidad de acabar la ventana en
 *    negativo no puede pasar de `maxLossWindow` (prudente 3%, normal 15%, agresivo sin límite: le
 *    basta con valor esperado positivo). Si no llega, prueba con apuestas más pequeñas (menos
 *    penalización); si ninguna llega, espera.
 * 4. Entre opciones gana la de mayor crecimiento a su fracción de Kelly.
 */

/** Un resultado posible de una apuesta: probabilidad y cambio neto por ficha apostada. */
export interface Outcome {
  p: number;
  net: number;
}

export interface HelperProfileDef {
  fraction: number;
  maxBalanceFraction: number;
  kelly: number;
  maxLossWindow: number;
}

export interface HelperChoice<K> {
  key: K;
  bet: number;
  /** Valor esperado neto de la apuesta (sin jackpot). */
  ev: number;
  /** Crecimiento esperado del logaritmo del saldo por apuesta. */
  growth: number;
}

export interface HelperContext {
  balance: number;
  ceiling: number;
  minBet: number;
  /** Segundos entre apuestas del ayudante. */
  interval: number;
}

/** Segundos de la ventana con la que se mide el riesgo. */
export const RISK_WINDOW_SECONDS = 120;

/** Si un ayudante espera (sin ventaja suficiente o sin saldo), vuelve a mirar cada medio segundo. */
export const HELPER_RETRY_SECONDS = 0.5;

function growthOf(outcomes: readonly Outcome[], x: number): number {
  let g = 0;
  for (const o of outcomes) {
    if (o.p <= 0) continue;
    const v = 1 + o.net * x;
    if (v <= 0) return -Infinity;
    g += o.p * Math.log(v);
  }
  return g;
}

/**
 * Fracción del saldo que maximiza el crecimiento esperado (criterio de Kelly), por bisección sobre la
 * derivada del crecimiento: Σ p·g / (1 + g·x) = 0. 0 si el valor esperado no es positivo.
 */
export function kellyFraction(outcomes: readonly Outcome[]): number {
  if (meanOf(outcomes) <= 0) return 0;
  let hi = 1;
  for (const o of outcomes) if (o.p > 0 && o.net < 0) hi = Math.min(hi, 1 / -o.net);
  hi *= 0.999;
  let lo = 0;
  const slope = (x: number) => outcomes.reduce((t, o) => (o.p > 0 ? t + (o.p * o.net) / (1 + o.net * x) : t), 0);
  if (slope(hi) >= 0) return hi;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (slope(mid) > 0) lo = mid;
    else hi = mid;
  }
  return lo;
}

function meanOf(outcomes: readonly Outcome[]): number {
  return outcomes.reduce((m, o) => m + o.p * o.net, 0);
}

/** P(X ≤ k) con X ~ Binomial(m, p). */
function binomialCdf(k: number, m: number, p: number): number {
  if (k < 0) return 0;
  if (k >= m || p <= 0) return 1;
  if (p >= 1) return 0;
  let pmf = Math.pow(1 - p, m);
  let cdf = 0;
  const ratio = p / (1 - p);
  for (let w = 0; w <= k; w++) {
    cdf += pmf;
    pmf *= ((m - w) / (w + 1)) * ratio;
  }
  return Math.min(cdf, 1);
}

/**
 * Probabilidad de que `n` apuestas iguales acaben en negativo, exacta: un premio (binomial) o dos
 * premios, como la pareja y el trío de la tragaperras (se suma sobre el número de premios grandes).
 * Los empates no cuentan. Con más de dos premios, los pequeños cuentan como el menor (cota prudente).
 */
export function lossWindowChance(outcomes: readonly Outcome[], n: number): number {
  // Memoria: se pregunta a menudo por las mismas probabilidades (una por apuesta candidata).
  let key = String(n);
  for (const o of outcomes) key += `|${o.p.toFixed(5)}:${o.net}`;
  const hit = riskCache.get(key);
  if (hit !== undefined) return hit;
  const value = lossWindowChanceRaw(outcomes, n);
  if (riskCache.size >= 50_000) riskCache.clear();
  riskCache.set(key, value);
  return value;
}

const riskCache = new Map<string, number>();

function lossWindowChanceRaw(outcomes: readonly Outcome[], n: number): number {
  const live = outcomes.filter((o) => o.p > 0);
  const wins = live.filter((o) => o.net > 0).sort((x, y) => x.net - y.net);
  const push = live.filter((o) => o.net === 0).reduce((t, o) => t + o.p, 0);
  const losses = live.filter((o) => o.net < 0);
  const lose = losses.reduce((t, o) => t + o.p, 0);
  if (lose <= 0) return 0;
  if (wins.length === 0) return 1;
  const c = Math.max(...losses.map((o) => -o.net));
  const m = Math.max(Math.round(n * (1 - push)), 1);
  const big = wins.length >= 2 ? wins[wins.length - 1] : null;
  const small = big ? wins.slice(0, -1) : wins;
  const qs = small.reduce((t, o) => t + o.p, 0);
  const b = small[0].net;
  const total = qs + (big?.p ?? 0) + lose;
  const qBig = (big?.p ?? 0) / total;
  const qSmall = qs / total;
  let chance = 0;
  let pT = Math.pow(1 - qBig, m);
  for (let t = 0; t <= m; t++) {
    if (t > 0) pT *= ((m - t + 1) / t) * (qBig / (1 - qBig));
    if (!(pT > 1e-12) && t > m * qBig) break;
    const rest = m - t;
    // Con t premios grandes, en negativo si W·b + t·B < (rest − W)·c.
    const k = Math.ceil((rest * c - t * (big?.net ?? 0)) / (b + c)) - 1;
    if (k < 0) break;
    chance += pT * binomialCdf(k, rest, qSmall / Math.max(1 - qBig, 1e-12));
    if (!big) break;
  }
  return Math.min(chance, 1);
}

/** Apuestas candidatas de mayor a menor: el máximo del perfil y escalones del 80% hasta la mínima. */
function candidates(cap: number, minBet: number): number[] {
  const out: number[] = [];
  for (let b = cap; b >= minBet; b *= 0.8) {
    const v = Math.floor(b);
    if (v >= minBet && v !== out[out.length - 1]) out.push(v);
  }
  if (out[out.length - 1] !== minBet && cap >= minBet) out.push(minBet);
  return out;
}

/**
 * Elige la opción y la apuesta del ayudante, o null si ninguna cumple su perfil (espera).
 * `outcomes(key, bet)` da los resultados de esa apuesta (la probabilidad depende de su tamaño).
 */
export function chooseHelperBet<K>(
  keys: readonly K[],
  outcomes: (key: K, bet: number) => readonly Outcome[],
  profile: HelperProfileDef,
  ctx: HelperContext,
): HelperChoice<K> | null {
  const { balance, ceiling, minBet } = ctx;
  if (balance < minBet) return null;
  // Como antes: al menos la apuesta mínima del techo, pero nunca más de su parte del saldo.
  const cap = Math.min(Math.max(Math.floor(ceiling * profile.fraction), minBet), Math.floor(balance * profile.maxBalanceFraction));
  if (cap < minBet) return null;
  const bets = candidates(cap, minBet);
  const n = Math.max(Math.round(RISK_WINDOW_SECONDS / Math.max(ctx.interval, 0.05)), 1);
  let best: (HelperChoice<K> & { score: number }) | null = null;
  for (const key of keys) {
    // Fracción de Kelly exacta para las probabilidades de esa misma apuesta: se parte del máximo y
    // se baja hasta que se estabiliza (la penalización crece con la apuesta).
    let kellyBet = cap;
    for (let i = 0; i < 6; i++) {
      const out = outcomes(key, Math.max(kellyBet, minBet));
      const mean = meanOf(out);
      if (mean <= 0) {
        kellyBet = Math.floor(kellyBet / 2);
        if (kellyBet < minBet) break;
        continue;
      }
      const next = Math.min(cap, Math.floor(kellyFraction(out) * balance));
      if (next >= kellyBet) break;
      kellyBet = next;
    }
    if (kellyBet < minBet) {
      if (meanOf(outcomes(key, minBet)) <= 0) continue;
      kellyBet = minBet;
    }
    const kellyGrowth = growthOf(outcomes(key, kellyBet), kellyBet / balance);
    if (kellyGrowth <= 0 || (best !== null && kellyGrowth <= best.score)) continue;
    // Si el Kelly de verdad pasa del máximo del perfil, manda el perfil.
    const target = kellyBet >= cap ? cap : Math.min(cap, Math.floor(kellyBet * profile.kelly));
    // Riesgo: la mayor apuesta (hasta la objetivo) que lo cumple. Con apuestas más pequeñas la
    // penalización baja y la probabilidad sube, así que basta una búsqueda binaria.
    const ok = (b: number) => {
      const out = outcomes(key, b);
      return meanOf(out) > 0 && (profile.maxLossWindow >= 1 || lossWindowChance(out, n) <= profile.maxLossWindow);
    };
    let lo = bets.findIndex((b) => b <= target);
    let hi = bets.length - 1;
    if (lo < 0 || !ok(bets[hi])) continue;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ok(bets[mid])) hi = mid;
      else lo = mid + 1;
    }
    const b = bets[lo];
    const out = outcomes(key, b);
    best = {
      key,
      bet: b,
      ev: meanOf(out) * b,
      growth: growthOf(out, b / balance),
      score: kellyGrowth,
    };
  }
  return best && { key: best.key, bet: best.bet, ev: best.ev, growth: best.growth };
}

/** Resultados de una apuesta a ganar o perder (con empates opcionales que devuelven la apuesta). */
export function binaryOutcomes(p: number, net: number, push = 0): Outcome[] {
  return [
    { p, net },
    { p: push, net: 0 },
    { p: Math.max(1 - p - push, 0), net: -1 },
  ];
}

/** Ingreso esperado por segundo de un ayudante con su elección actual (0 si espera). */
export function helperIncomeRate(choice: HelperChoice<unknown> | null, interval: number): number {
  return choice ? Math.max(choice.ev, 0) / interval : 0;
}

/**
 * Perfil recomendado para la suerte y el saldo de ahora: el desbloqueado con más crecimiento
 * esperado del saldo por apuesta (criterio de Kelly); si empatan, el más prudente. Si ninguno
 * apuesta, el prudente.
 */
export function recommendedProfile(unlocked: number, choiceFor: (profile: number) => HelperChoice<unknown> | null): number {
  let best = 0;
  let bestGrowth = 0;
  for (let i = 0; i <= unlocked; i++) {
    const g = choiceFor(i)?.growth ?? 0;
    if (g > bestGrowth * (1 + 1e-9) + 1e-12) {
      best = i;
      bestGrowth = g;
    }
  }
  return best;
}

const rateCache = new WeakMap<object, Map<string, { sig: number; value: number }>>();

/** Cubo logarítmico (~9%) de una cantidad, para las firmas de la memoria. */
export function bucket(x: number): number {
  return Math.round(Math.log2(1 + Math.max(x, 0)) * 8);
}

/**
 * Memoria del ingreso esperado de un ayudante (el pasivo de la mesa siguiente lo pide en cada
 * paso): se recalcula solo si cambia la firma (mejoras, perfil, saldo en cubos del ~9%, cada
 * segundo de juego...).
 */
export function memoRate(owner: object, name: string, sig: number, compute: () => number): number {
  let byName = rateCache.get(owner);
  if (!byName) rateCache.set(owner, (byName = new Map()));
  const hit = byName.get(name);
  if (hit && hit.sig === sig) return hit.value;
  const value = compute();
  byName.set(name, { sig, value });
  return value;
}

/** Firma numérica barata de unas mejoras y unos números (para memoRate). */
export function stateKey(upgrades: Readonly<Record<string, number>>, ...extra: number[]): number {
  let h = 17;
  for (const k in upgrades) h = (h * 31 + upgrades[k]) | 0;
  for (const e of extra) h = (h * 1_000_003 + e) | 0;
  return h;
}
