const SUFFIXES = ['', 'K', 'M', 'B', 'T'];

/**
 * Formatea un número de fichas con sufijo y 3 cifras significativas.
 * Trunca en lugar de redondear: 9.999.999 se muestra 9,99M, nunca 10,0M,
 * para que la barra de deuda no prometa algo que aún no tienes.
 */
/** Un factor de la mesa 5: ×4 o ×4,5 (la cargada). */
export function formatFactor(factor: number): string {
  return `×${Number.isInteger(factor) ? factor : factor.toFixed(1).replace('.', ',')}`;
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '∞';
  if (value < 0) return '-' + formatNumber(-value);
  if (value < 1000) return String(Math.floor(value));

  let tier = Math.min(Math.floor(Math.log10(value) / 3), SUFFIXES.length - 1);
  // log10 puede quedarse corto por coma flotante (p. ej. 1e6 → 5.999...)
  if (tier + 1 < SUFFIXES.length && value >= 1000 ** (tier + 1)) tier++;
  const scaled = value / 1000 ** tier;
  const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  const factor = 10 ** decimals;
  const truncated = Math.floor(scaled * factor + 1e-9) / factor;
  return truncated.toFixed(decimals).replace('.', ',') + SUFFIXES[tier];
}

/** 0.486 → "48,6%" */
export function formatPercent(fraction: number, decimals = 1): string {
  return (fraction * 100).toFixed(decimals).replace('.', ',') + '%';
}

/** Segundos → "m:ss" */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** 3.456 → "3,46 s" */
export function formatSeconds(seconds: number, decimals = 1): string {
  return seconds.toFixed(decimals).replace('.', ',') + ' s';
}
