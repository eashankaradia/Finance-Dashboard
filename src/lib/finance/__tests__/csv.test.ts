import { describe, expect, it } from 'vitest';
import { toCsv } from '../../csv';

describe('CSV export', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(toCsv(['a', 'b'], [['x,y', 'say "hi"'], ['line\nbreak', 3]])).toBe('a,b\r\n"x,y","say ""hi"""\r\n"line\nbreak",3\r\n');
  });
  it('neutralises spreadsheet formulas but keeps negative numbers', () => {
    expect(toCsv(['a'], [['=SUM(A1)'], ['-12.5'], [-3]])).toBe("a\r\n'=SUM(A1)\r\n-12.5\r\n-3\r\n");
  });
});
