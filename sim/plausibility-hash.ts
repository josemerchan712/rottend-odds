import { createHash } from 'node:crypto';

/**
 * Hash de shared/config.json con los saltos de línea normalizados, para detectar una tabla de
 * plausibilidad desactualizada. El servidor (PlausibilityTable.java) calcula exactamente el mismo.
 */
export function configHash(text: string): string {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
}
