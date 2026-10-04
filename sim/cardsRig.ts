/**
 * Calibra la baraja de la mesa 4: para cada intensidad (rig) juega muchas manos con estrategia básica
 * y sin descartes, y apunta la probabilidad de ganar, empatar y perder. Escribe
 * src/game/cards/rigTable.ts, que usa la lógica para convertir la suerte en intensidad.
 *
 *   npx tsx sim/cardsRig.ts            (200.000 manos por punto)
 */
import { writeFileSync } from 'node:fs';
import { CONFIG } from '../src/game/config';
import { playBasicHand } from '../src/game/cards/rules';
import { seededRng } from '../src/game/rng';

const HANDS = Number(process.argv[process.argv.indexOf('--hands') + 1] || 200_000);
const grid: number[] = [];
for (let r = -2; r <= 3.0001; r += 0.05) grid.push(Math.round(r * 100) / 100);
const rows = grid.map((rig, i) => {
  const rng = seededRng(9000 + i);
  let win = 0;
  let push = 0;
  for (let n = 0; n < HANDS; n++) {
    const o = playBasicHand(rig, CONFIG.cards.dealerStands, rng);
    if (o === 'gana') win++;
    else if (o === 'empate') push++;
  }
  return { rig, win: +(win / HANDS).toFixed(4), push: +(push / HANDS).toFixed(4) };
});
const body = rows.map((r) => `  { rig: ${r.rig}, win: ${r.win}, push: ${r.push} },`).join('\n');
writeFileSync(
  new URL('../src/game/cards/rigTable.ts', import.meta.url),
  `/**
 * Generado por sim/cardsRig.ts (${HANDS.toLocaleString('es-ES')} manos por punto, estrategia básica, sin descartes).
 * Para cada intensidad de la baraja: probabilidad de ganar y de empatar. No editar a mano.
 */
export const RIG_TABLE: readonly { rig: number; win: number; push: number }[] = [
${body}
];
`,
);
for (const r of rows.filter((_, i) => i % 4 === 0)) console.log(r.rig, r.win, r.push, 'VE', (r.win - (1 - r.win - r.push)).toFixed(3));
