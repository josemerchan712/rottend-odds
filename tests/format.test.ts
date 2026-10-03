import { describe, expect, it } from 'vitest';
import { formatNumber, formatPercent, formatTime } from '../src/util/format';

describe('formatNumber', () => {
  it('muestra enteros por debajo de mil', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(7.9)).toBe('7');
    expect(formatNumber(999)).toBe('999');
  });

  it('usa K y M con tres cifras significativas', () => {
    expect(formatNumber(1000)).toBe('1,00K');
    expect(formatNumber(1234)).toBe('1,23K');
    expect(formatNumber(12_345)).toBe('12,3K');
    expect(formatNumber(123_456)).toBe('123K');
    expect(formatNumber(1_000_000)).toBe('1,00M');
    expect(formatNumber(10_000_000)).toBe('10,0M');
    expect(formatNumber(2_500_000_000)).toBe('2,50B');
  });

  it('trunca en vez de redondear', () => {
    expect(formatNumber(9_999_999)).toBe('9,99M');
    expect(formatNumber(999_999)).toBe('999K');
    expect(formatNumber(1999)).toBe('1,99K');
  });

  it('soporta negativos e infinito', () => {
    expect(formatNumber(-1500)).toBe('-1,50K');
    expect(formatNumber(Infinity)).toBe('∞');
  });
});

describe('formatPercent / formatTime', () => {
  it('formatea porcentajes con coma decimal', () => {
    expect(formatPercent(0.486)).toBe('48,6%');
    expect(formatPercent(0.97)).toBe('97,0%');
  });

  it('formatea tiempo como m:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.9)).toBe('1:05');
    expect(formatTime(480)).toBe('8:00');
  });
});
