import { CONFIG } from './config';
import { debtProgress } from './debt';
import type { GameState } from './state';

export type LenderPhase = 'calm' | 'uneasy' | 'deformed';

/**
 * Fase del prestamista según el % de la deuda reunido (sección 7): 0-33% calmado, 33-66% inquieto,
 * 66-100% deformado. Con la deuda pagada vuelve a estar calmado: ya tiene su dinero.
 */
export function lenderPhase(state: GameState): LenderPhase {
  if (state.debtPaid) return 'calm';
  const progress = debtProgress(state);
  const [uneasyFrom, deformedFrom] = CONFIG.lender.phaseThresholds;
  if (progress >= deformedFrom) return 'deformed';
  if (progress >= uneasyFrom) return 'uneasy';
  return 'calm';
}
