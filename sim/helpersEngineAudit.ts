/**
 * Auditoría de los ayudantes con el MOTOR REAL del juego (updateGame, el mismo bucle que la partida):
 * para cada mesa, perfil y suerte, una partida con solo ese ayudante jugando 30 minutos de juego.
 * Mide el porcentaje de apuestas ganadas, el neto por minuto (media, p10, p90, en techos de apuesta),
 * la distribución de apuestas u objetivos elegidos y la caída máxima del saldo.
 *
 *   npm run audit:engine [-- --minutes 30 --table 3 --seeds 2]
 */
import { CONFIG } from '../src/game/config';
import { currentMaxBet } from '../src/game/betting';
import { slotCeiling } from '../src/game/slots/machine';
import { diceCeiling } from '../src/game/dice/game';
import { cardsCeiling } from '../src/game/cards/game';
import { coinCeiling } from '../src/game/coin/game';
import { seededRng } from '../src/game/rng';
import { createInitialState, type GameState } from '../src/game/state';
import { updateGame, type Tick } from '../src/game/update';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const MINUTES = Number(arg('minutes') ?? 30);
const SEEDS = Number(arg('seeds') ?? 1);
const ONLY = arg('table') ? Number(arg('table')) : null;
const DT = 0.1;
export const LUCKS = [
  { label: 'baja', level: 3 },
  { label: 'media', level: 9 },
  { label: 'alta', level: 15 },
  { label: 'máx', level: 20 },
];

interface Bet {
  won: boolean;
  delta: number;
  kind: string;
}

interface TableAudit {
  table: number;
  name: string;
  setup(state: GameState, luck: number, profile: number): void;
  balance(state: GameState): number;
  ceiling(state: GameState): number;
  bets(tick: Tick): Bet[];
}

const maxBetFor = (luck: number, maxLevel: number) => Math.round((luck / 20) * maxLevel);

export const TABLES: TableAudit[] = [
  {
    table: 1,
    name: 'Crupier (mesa 1)',
    setup(s, luck, profile) {
      Object.assign(s.upgrades, { luck, maxBet: maxBetFor(luck, CONFIG.upgrades.maxBet.maxLevel), crupier: 1, helperProfile: 2, helperSpeed: 8, helperLuck: 5 });
      s.helper.profile = profile;
      s.balance = currentMaxBet(s) * 20;
    },
    balance: (s) => s.balance,
    ceiling: (s) => currentMaxBet(s),
    bets: (t) => t.helper.map((r) => ({ won: r.delta > 0, delta: r.delta, kind: r.choice.type })),
  },
  {
    table: 2,
    name: 'Zombi (mesa 2)',
    setup(s, luck, profile) {
      s.debtPaid = true;
      Object.assign(s.slots.upgrades, { luck, maxBet: maxBetFor(luck, CONFIG.slots.upgrades.maxBet.maxLevel), zombie: 1, helperProfile: 2, helperSpeed: 8, helperLuck: 5, hold: 3, jackpot: 3 });
      s.slots.helper.profile = profile;
      s.slots.balance = slotCeiling(s.slots) * 20;
    },
    balance: (s) => s.slots.balance,
    ceiling: (s) => slotCeiling(s.slots),
    bets: (t) => t.slots.zombie.map((r) => ({ won: r.delta > 0, delta: r.delta, kind: r.held !== null ? 'retener' : 'tirar' })),
  },
  {
    table: 3,
    name: 'Camarero (mesa 3)',
    setup(s, luck, profile) {
      s.debtPaid = s.slots.debtPaid = true;
      Object.assign(s.dice.upgrades, { luck, maxBet: maxBetFor(luck, CONFIG.dice.upgrades.maxBet.maxLevel), ghost: 1, helperProfile: 2, helperSpeed: 8, helperLuck: 5, jackpot: 3, hardTargets: 1, boxcars: 1 });
      s.dice.helper.profile = profile;
      s.dice.balance = diceCeiling(s.dice) * 20;
    },
    balance: (s) => s.dice.balance,
    ceiling: (s) => diceCeiling(s.dice),
    bets: (t) => t.dice.ghost.map((r) => ({ won: r.won, delta: r.delta, kind: r.target })),
  },
  {
    table: 4,
    name: 'Esqueleto (mesa 4)',
    setup(s, luck, profile) {
      s.debtPaid = s.slots.debtPaid = s.dice.debtPaid = true;
      Object.assign(s.cards.upgrades, { luck, maxBet: maxBetFor(luck, CONFIG.cards.upgrades.maxBet.maxLevel), skeleton: 1, helperProfile: 2, helperSpeed: 8, helperLuck: 5, jackpot: 3 });
      s.cards.helper.profile = profile;
      s.cards.balance = cardsCeiling(s.cards) * 20;
    },
    balance: (s) => s.cards.balance,
    ceiling: (s) => cardsCeiling(s.cards),
    // Los empates no cuentan ni como ganadas ni como perdidas.
    bets: (t) => t.cards.skeleton.filter((h) => h.result !== 'empate').map((h) => ({ won: h.result === 'gana', delta: h.delta, kind: 'mano' })),
  },
  {
    table: 5,
    name: 'Diablillo (mesa 5)',
    setup(s, luck, profile) {
      s.debtPaid = s.slots.debtPaid = s.dice.debtPaid = s.cards.debtPaid = true;
      Object.assign(s.coin.upgrades, { luck, maxBet: maxBetFor(luck, CONFIG.coin.upgrades.maxBet.maxLevel), imp: 1, helperProfile: 2, helperSpeed: 8, helperLuck: 5, temple: 2 });
      s.coin.helper.profile = profile;
      s.coin.balance = coinCeiling(s.coin) * 20;
    },
    balance: (s) => s.coin.balance,
    ceiling: (s) => coinCeiling(s.coin),
    bets: (t) => t.coin.imp.map((c) => ({ won: c.delta > 0, delta: c.delta, kind: `${c.result === 'perdido' ? 'cadena' : c.wins} caras`.replace('cadena caras', 'perdida') })),
  },
];

export interface EngineAuditRow {
  bets: number;
  winRate: number;
  mean: number;
  p10: number;
  p90: number;
  /** Fracción de ventanas de 1 minuto con neto positivo. */
  positiveMinutes: number;
  drawdown: number;
  kinds: Record<string, number>;
}

const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0;
};

export function auditTable(t: TableAudit, luck: number, profile: number, minutes = MINUTES, seeds = SEEDS): EngineAuditRow {
  let bets = 0;
  let wins = 0;
  const perMinute: number[] = [];
  let drawdown = 0;
  const kinds: Record<string, number> = {};
  for (let seed = 1; seed <= seeds; seed++) {
    const state = createInitialState();
    t.setup(state, luck, profile);
    const ceiling = t.ceiling(state);
    const rng = seededRng(seed * 7919 + luck * 101 + profile * 13 + t.table);
    let peak = t.balance(state);
    let minuteNet = 0;
    const steps = Math.round(60 / DT);
    for (let m = 0; m < minutes; m++) {
      minuteNet = 0;
      for (let i = 0; i < steps; i++) {
        const tick = updateGame(state, DT, rng);
        for (const b of t.bets(tick)) {
          bets++;
          if (b.won) wins++;
          minuteNet += b.delta;
          kinds[b.kind] = (kinds[b.kind] ?? 0) + 1;
        }
        const bal = t.balance(state);
        peak = Math.max(peak, bal);
        drawdown = Math.max(drawdown, peak > 0 ? (peak - bal) / peak : 0);
      }
      perMinute.push(minuteNet / ceiling);
    }
  }
  const total = Object.values(kinds).reduce((a, b) => a + b, 0) || 1;
  for (const k of Object.keys(kinds)) kinds[k] /= total;
  return {
    bets,
    winRate: bets ? wins / bets : 0,
    mean: perMinute.reduce((a, b) => a + b, 0) / perMinute.length,
    p10: q(perMinute, 0.1),
    p90: q(perMinute, 0.9),
    positiveMinutes: perMinute.filter((x) => x > 0).length / perMinute.length,
    drawdown,
    kinds,
  };
}

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('sim/helpersEngineAudit.ts');
if (isMain) {
  const started = Date.now();
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const f = (x: number) => (Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2));
  console.log(`Auditoría con el motor real · ${MINUTES} min de juego × ${SEEDS} semilla(s) · saldo inicial 20 techos`);
  console.log('| Ayudante | Suerte | Perfil | Apuestas | Ganadas | Neto/min (techos) media · p10 · p90 | Minutos +| Caída máx. | Elige |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const t of TABLES) {
    if (ONLY !== null && t.table !== ONLY) continue;
    for (const luck of LUCKS) {
      for (let p = 0; p < 3; p++) {
        const r = auditTable(t, luck.level, p);
        const kinds = Object.entries(r.kinds)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${k} ${pct(v)}`)
          .join(', ');
        console.log(
          `| ${t.name} | ${luck.label} | ${['prudente', 'normal', 'agresivo'][p]} | ${r.bets} | ${pct(r.winRate)} | ${f(r.mean)} · ${f(r.p10)} · ${f(r.p90)} | ${pct(r.positiveMinutes)} | ${pct(r.drawdown)} | ${kinds || '-'} |`,
        );
      }
    }
    process.stderr.write(`  ${t.name} hecho (${((Date.now() - started) / 1000).toFixed(0)} s)\n`);
  }
}
