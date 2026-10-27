import { describe, expect, it } from 'vitest';
import { money, parseAmount, sum } from '../../money';

describe('money helpers', () => {
  it('avoids binary floating point error', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(money(sum([0.1, 0.2]))).toBe(0.3);
    expect(money(sum(Array(10).fill(0.1)))).toBe(1);
  });

  it('rounds half to even at 2dp', () => {
    expect(money('2.345')).toBe(2.34);
    expect(money('2.355')).toBe(2.36);
  });

  it('parses user input', () => {
    expect(parseAmount('£1,234.56')).toBe('1234.56');
    expect(parseAmount('  10 ')).toBe('10');
    expect(parseAmount('-5.5')).toBe('-5.5');
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('1.2.3')).toBeNull();
  });
});
