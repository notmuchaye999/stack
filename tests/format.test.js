import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { money, money0, money2, signed, kmoney, fmtDate, monthYear } from '../app/src/core/format.js';
import { spanTxt, impTxt, impShort, whenTxt } from '../app/src/core/impact.js';
import { addDays, daysBetween } from '../app/src/core/util.js';
import { mk } from './helpers/make.js';

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 14, 10)); });
afterEach(() => vi.useRealTimers());

describe('format', () => {
  it('shows Australian dollars exactly as entered, with a real minus sign', () => {
    expect(money(1240)).toBe('$1,240');
    expect(money(1240.5)).toBe('$1,240.50');
    expect(money(-1240.6)).toBe('−$1,240.60');
    expect(money0(1240.6)).toBe('$1,241'); // estimates stay in whole dollars
    expect(money2(12)).toBe('$12.00');
    expect(signed(12)).toBe('+$12.00');
    expect(signed(-12)).toBe('−$12.00');
    expect(kmoney(45200)).toBe('$45k');
    expect(kmoney(1250000)).toBe('$1.25m');
  });
  it('dates: the day and month, with the year when it isn\'t this year', () => {
    expect(fmtDate('2026-10-14')).toBe('14 Oct');
    expect(fmtDate('2027-01-02')).toBe('2 Jan 2027');
    expect(monthYear(new Date(2028, 4, 1))).toBe('May 2028');
  });
  it('how long, the same way everywhere: days under a pay, then pays up to two years, then years and months', () => {
    const S = mk({ freq: 'fortnight' });
    expect(spanTxt(S, 3)).toBe('3 days');
    expect(spanTxt(S, 42)).toBe('3 pays');
    expect(spanTxt(S, 800)).toBe('2y 2m');
    expect(impTxt(S, -42)).toBe('−3 pays');
    expect(impTxt(S, Infinity)).toBe('Out of reach');
    expect(impShort(S, 10, 'FI date')).toBe('+10 days to FI');
    expect(impShort(S, -Infinity, 'debt-free date')).toBe('Debt-free back in reach');
    expect(whenTxt(S, 3)).toBe('7 pays');
    expect(whenTxt(S, null)).toBe('Not at this pace');
  });
  it('does date maths on plain YYYY-MM-DD strings', () => {
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02');
    expect(daysBetween('2026-10-01', '2026-10-15')).toBe(14);
  });
});
