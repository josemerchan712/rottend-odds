/**
 * Auditoría de los ayudantes de las mesas 1 a 4: cada ayudante juega SOLO (sin pasivo, sin el
 * jugador) con una suerte, unas mejoras y un perfil fijos, y se mide su resultado.
 *
 *   npm run audit:helpers [-- --runs 40 --minutes 10 --start 10]
 *
 * Por combinación: neto por minuto (media, p10, p90, en techos), % de ventanas de 2 min negativas,
 * caída máxima (en % del pico), veces que deja el saldo por debajo de la apuesta mínima y uso de
 * recursos (retenciones, relanzamientos o descartes por minuto). `--start` es el saldo inicial en
 * techos de apuesta (10 por defecto; 2 para probar saldos justos).
 */
import { currentMaxBet } from '../src/game/betting';
import { CONFIG } from '../src/game/config';
import { updateHelper } from '../src/game/helper';
import { seededRng, type Rng } from '../src/game/rng';
import { createInitialState, type GameState } from '../src/game/state';
import { slotCeiling } from '../src/game/slots/machine';
import { updateZombie } from '../src/game/slots/table';
import { diceCeiling, updateRerolls } from '../src/game/dice/game';
import { updateGhost } from '../src/game/dice/table';
import { cardsCeiling, updateDiscards } from '../src/game/cards/game';
import { updateSkeleton } from '../src/game/cards/table';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const RUNS = Number(arg('runs') ?? 40);
const MINUTES = Number(arg('minutes') ?? 10);
const START = Number(arg('start') ?? 10);
const DT = 0.1;

export interface Event {
  delta: number;
  resource: boolean;
}

export interface Adapter {
  table: number;
  name: string;
  profiles: number;
  minBet: number;
  setup(state: GameState, luck: number, upgraded: boolean, profile: number): void;
  balance(state: GameState): number;
  setBalance(state: GameState, value: number): void;
  ceiling(state: GameState): number;
  step(state: GameState, dt: number, rng: Rng): Event[];
}

const maxBetLevel = (luck: number, maxLevel: number) => Math.round((luck / 20) * maxLevel);

export const ADAPTERS: Adapter[] = [
  {
    table: 1,
    name: 'Crupier (mesa 1)',
    profiles: CONFIG.helper.profiles.length,
    minBet: CONFIG.bet.minBet,
    setup(s, luck, upgraded, profile) {
      s.upgrades.luck = luck;
      s.upgrades.maxBet = maxBetLevel(luck, CONFIG.upgrades.maxBet.maxLevel);
      s.upgrades.crupier = 1;
      s.upgrades.helperProfile = 2;
      s.upgrades.helperSpeed = upgraded ? 8 : 0;
      s.upgrades.helperLuck = upgraded ? 5 : 0;
      s.upgrades.jackpot = upgraded ? 3 : 0;
      s.helper.profile = profile;
    },
    balance: (s) => s.balance,
    setBalance: (s, v) => void (s.balance = v),
    ceiling: (s) => currentMaxBet(s),
    step: (s, dt, rng) => updateHelper(s, dt, rng).map((r) => ({ delta: r.delta, resource: false })),
  },
  {
    table: 2,
    name: 'Zombi (mesa 2)',
    profiles: CONFIG.slots.helper.profiles.length,
    minBet: CONFIG.slots.bet.minBet,
    setup(s, luck, upgraded, profile) {
      const u = s.slots.upgrades;
      u.luck = luck;
      u.maxBet = maxBetLevel(luck, CONFIG.slots.upgrades.maxBet.maxLevel);
      u.zombie = 1;
      u.helperProfile = 2;
      u.helperSpeed = upgraded ? 8 : 0;
      u.helperLuck = upgraded ? 5 : 0;
      u.jackpot = upgraded ? 3 : 0;
      u.hold = upgraded ? 3 : 0;
      s.slots.helper.profile = profile;
    },
    balance: (s) => s.slots.balance,
    setBalance: (s, v) => void (s.slots.balance = v),
    ceiling: (s) => slotCeiling(s.slots),
    step: (s, dt, rng) => updateZombie(s.slots, dt, rng).map((r) => ({ delta: r.delta, resource: r.held !== null })),
  },
  {
    table: 3,
    name: 'Camarero (mesa 3)',
    profiles: CONFIG.dice.helper.profiles.length,
    minBet: CONFIG.dice.bet.minBet,
    setup(s, luck, upgraded, profile) {
      const u = s.dice.upgrades;
      u.luck = luck;
      u.maxBet = maxBetLevel(luck, CONFIG.dice.upgrades.maxBet.maxLevel);
      u.ghost = 1;
      u.helperProfile = 2;
      u.helperSpeed = upgraded ? 8 : 0;
      u.helperLuck = upgraded ? 5 : 0;
      u.jackpot = upgraded ? 3 : 0;
      u.hardTargets = upgraded ? 1 : 0;
      u.boxcars = upgraded ? 1 : 0;
      s.dice.helper.profile = profile;
    },
    balance: (s) => s.dice.balance,
    setBalance: (s, v) => void (s.dice.balance = v),
    ceiling: (s) => diceCeiling(s.dice),
    step(s, dt, rng) {
      updateRerolls(s.dice, dt);
      return updateGhost(s.dice, dt, rng).map((r) => ({ delta: r.delta, resource: r.rerolled !== null }));
    },
  },
  {
    table: 4,
    name: 'Esqueleto (mesa 4)',
    profiles: CONFIG.cards.helper.profiles.length,
    minBet: CONFIG.cards.bet.minBet,
    setup(s, luck, upgraded, profile) {
      const u = s.cards.upgrades;
      u.luck = luck;
      u.maxBet = maxBetLevel(luck, CONFIG.cards.upgrades.maxBet.maxLevel);
      u.skeleton = 1;
      u.helperProfile = 2;
      u.helperSpeed = upgraded ? 8 : 0;
      u.helperLuck = upgraded ? 5 : 0;
      u.jackpot = upgraded ? 3 : 0;
      s.cards.helper.profile = profile;
      s.cards.discards.charges = 1 + Math.floor(luck / 3);
    },
    balance: (s) => s.cards.balance,
    setBalance: (s, v) => void (s.cards.balance = v),
    ceiling: (s) => cardsCeiling(s.cards),
    step(s, dt, rng) {
      updateDiscards(s.cards, dt);
      return updateSkeleton(s.cards, dt, rng).map((h) => ({ delta: h.delta, resource: h.discards > 0 }));
    },
  },
];

export interface AuditRow {
  /** Neto por minuto en techos de apuesta: media, p10, p90 (de todos los minutos). */
  mean: number;
  p10: number;
  p90: number;
  /** Fracción de ventanas de 2 minutos con resultado negativo. */
  negative2: number;
  /** Caída máxima media (en fracción del pico). */
  drawdown: number;
  /** Veces por partida que deja el saldo por debajo de la apuesta mínima. */
  zeros: number;
  /** Apuestas y usos de recursos por minuto. */
  betsPerMin: number;
  resourcePerMin: number;
}

const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))];
};

/** Juega `runs` partidas del ayudante solo y resume. */
export function audit(a: Adapter, luck: number, upgraded: boolean, profile: number, runs = RUNS, minutes = MINUTES, start = START): AuditRow {
  const perMinute: number[] = [];
  let negative = 0;
  let windows = 0;
  let drawdown = 0;
  let zeros = 0;
  let bets = 0;
  let resources = 0;
  for (let run = 0; run < runs; run++) {
    const state = createInitialState();
    state.debtPaid = true;
    state.slots.debtPaid = true;
    state.dice.debtPaid = true;
    a.setup(state, luck, upgraded, profile);
    const ceiling = a.ceiling(state);
    a.setBalance(state, Math.round(ceiling * start));
    const rng = seededRng(run * 7919 + luck * 31 + profile * 3 + (upgraded ? 1 : 0) + a.table * 100_003);
    let peak = a.balance(state);
    let worst = 0;
    let minuteStart = a.balance(state);
    const minutesNet: number[] = [];
    const steps = Math.round(60 / DT);
    for (let m = 0; m < minutes; m++) {
      for (let i = 0; i < steps; i++) {
        for (const e of a.step(state, DT, rng)) {
          bets++;
          if (e.resource) resources++;
          if (a.balance(state) < a.minBet && e.delta < 0) zeros++;
        }
        const b = a.balance(state);
        peak = Math.max(peak, b);
        worst = Math.max(worst, peak > 0 ? (peak - b) / peak : 0);
      }
      const b = a.balance(state);
      minutesNet.push((b - minuteStart) / ceiling);
      minuteStart = b;
    }
    perMinute.push(...minutesNet);
    for (let m = 0; m + 1 < minutes; m += 2) {
      windows++;
      if (minutesNet[m] + minutesNet[m + 1] < 0) negative++;
    }
    drawdown += worst;
  }
  const total = runs * minutes;
  return {
    mean: perMinute.reduce((x, y) => x + y, 0) / perMinute.length,
    p10: q(perMinute, 0.1),
    p90: q(perMinute, 0.9),
    negative2: windows ? negative / windows : 0,
    drawdown: drawdown / runs,
    zeros: zeros / runs,
    betsPerMin: bets / total,
    resourcePerMin: resources / total,
  };
}

export const LUCKS = [
  { label: 'baja', level: 3 },
  { label: 'media', level: 9 },
  { label: 'alta', level: 15 },
  { label: 'máx', level: 20 },
];

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('sim/helpersAudit.ts');
if (isMain) {
  const only = arg('table');
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  const f = (x: number) => (Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2));
  console.log(`Auditoría de ayudantes · ${RUNS} partidas × ${MINUTES} min · saldo inicial ${START} techos · sin pasivo ni jugador`);
  console.log('Neto/min en techos de apuesta. neg2 = % de ventanas de 2 min negativas. caída = caída máxima media desde el pico.');
  for (const a of ADAPTERS) {
    if (only && Number(only) !== a.table) continue;
    console.log(`\n== ${a.name}`);
    console.log('mejoras   suerte  perfil      media     p10     p90   neg2  caída  ceros/partida  apuestas/min  recursos/min');
    for (const upgraded of [false, true]) {
      for (const luck of LUCKS) {
        for (let p = 0; p < a.profiles; p++) {
          const r = audit(a, luck.level, upgraded, p);
          console.log(
            [
              (upgraded ? 'mejorado' : 'base').padEnd(8),
              luck.label.padEnd(6),
              String(p).padEnd(6),
              f(r.mean).padStart(9),
              f(r.p10).padStart(7),
              f(r.p90).padStart(7),
              pct(r.negative2).padStart(6),
              pct(r.drawdown).padStart(6),
              r.zeros.toFixed(1).padStart(14),
              r.betsPerMin.toFixed(0).padStart(13),
              r.resourcePerMin.toFixed(1).padStart(13),
            ].join(' '),
          );
        }
      }
    }
  }
}
