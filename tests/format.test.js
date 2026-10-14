import { describe, it, expect } from 'vitest';
import { money, kmoney, dur, spanTxt, impTxt } from '../app/src/core/format.js';
import { addDays, daysBetween } from '../app/src/core/util.js';

describe('format', () => {
  it('shows Australian dollars with a real minus sign', () => {
    expect(money(1240.4)).toBe('$1,240');
    expect(money(-1240.6)).toBe('−$1,241');
    expect(kmoney(45200)).toBe('$45k');
    expect(kmoney(1250000)).toBe('$1.25m');
  });
  it('turns months and days into words', () => {
    expect(dur(14)).toBe('1 year 2 months');
    expect(dur(0)).toBe('under a month');
    expect(spanTxt(3)).toBe('3 days');
    expect(spanTxt(35)).toBe('5 weeks');
    expect(impTxt(-35)).toBe('−5 wks');
    expect(impTxt(Infinity)).toBe('Out of reach');
  });
  it('does date maths on plain YYYY-MM-DD strings', () => {
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02');
    expect(daysBetween('2026-10-01', '2026-10-15')).toBe(14);
  });
});
