import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readStatement, parseDate, parseAmount } from '../app/src/core/csv.js';

const fx = name => readFileSync(new URL(`./fixtures/${name}.csv`, import.meta.url), 'utf8');
const brief = rows => rows.map(r => [r.date, r.amount]);

describe('CSV statements from Australian banks', () => {
  it('CommBank: no header, one signed amount, running balance last', () => {
    const rows = readStatement(fx('commbank'));
    expect(brief(rows)).toEqual([['2026-10-14', 2150], ['2026-10-13', -64.2], ['2026-10-12', -18.99], ['2026-10-11', -300], ['2026-10-10', 50]]);
    expect(rows[1].desc).toBe('WOOLWORTHS 1234 BRISBANE QL AUS Card xx4821 Value Date: 11/10/2026');
  });
  it('Westpac: separate Debit Amount / Credit Amount columns and a Narrative', () => {
    const rows = readStatement(fx('westpac'));
    expect(brief(rows)).toEqual([['2026-10-14', 2150], ['2026-10-13', -64.2], ['2026-10-12', -240], ['2026-10-10', 50]]);
    expect(rows[0].desc).toBe('DEPOSIT ACME DIESEL PTY SALARY');
  });
  it('NAB: "14 Oct 26" dates, signed Amount and Transaction Details', () => {
    const rows = readStatement(fx('nab'));
    expect(brief(rows)).toEqual([['2026-10-14', 2150], ['2026-10-13', -64.2], ['2026-10-12', -1240], ['2026-10-10', 50]]);
    expect(rows[2].desc).toBe('ONLINE J6 TRANSFER TO SAVINGS, NAB');
  });
  it('ING: Credit and Debit columns, with debits already negative', () => {
    const rows = readStatement(fx('ing'));
    expect(brief(rows)).toEqual([['2026-10-14', 2150], ['2026-10-13', -64.2], ['2026-10-12', -18.99], ['2026-10-10', 50]]);
    expect(rows[3].desc).toBe('Internal Transfer - Receipt 222222 From Savings Maximiser');
  });
  it('gives up cleanly on something that is not a statement', () => {
    expect(readStatement('hello world\nnothing here')).toEqual([]);
    expect(readStatement('')).toEqual([]);
  });
});

describe('dates and amounts', () => {
  it('reads Australian day-first dates', () => {
    expect(parseDate('03/02/2026')).toBe('2026-02-03');
    expect(parseDate('3-Feb-26')).toBe('2026-02-03');
    expect(parseDate('2026-02-03')).toBe('2026-02-03');
    expect(parseDate('31/13/2026')).toBe(null);
  });
  it('reads bank amount styles', () => {
    expect(parseAmount('$1,234.50')).toBe(1234.5);
    expect(parseAmount('(45.00)')).toBe(-45);
    expect(parseAmount('45.00 DR')).toBe(-45);
    expect(parseAmount('45.00 CR')).toBe(45);
    expect(parseAmount('n/a')).toBe(null);
  });
});
