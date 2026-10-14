import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { billsFor, repayIn, nextOn, dueIn, everyPay } from '../app/src/core/due.js';
import { makeStack } from '../app/src/core/stacks.js';
import { monthly } from '../app/src/core/balances.js';
import { mk, bill, debt } from './helpers/make.js';

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 14, 10)); });
afterEach(() => vi.useRealTimers());

const withDue = (b, due) => Object.assign(b, { due });

describe('due dates', () => {
  it('a monthly bill comes out of the pay before it is due, in full', () => {
    const S = mk({ bills: [withDue(bill('Optus', 65, 'month'), '2026-11-05')] });
    expect(billsFor(S, '2026-10-30', '2026-11-13')).toEqual([{ name: 'Optus', v: 65, due: '2026-11-05' }]);
    expect(billsFor(S, '2026-10-16', '2026-10-30')).toEqual([]); // not due during this pay
  });
  it('a bill with no due date is averaged across pays', () => {
    const S = mk({ bills: [bill('Optus', 65, 'month')] });
    expect(billsFor(S, '2026-10-16', '2026-10-30')).toEqual([{ name: 'Optus', v: 30, due: null, saving: false, avg: true }]);
  });
  it('quarterly and yearly bills are saved up a little every pay', () => {
    const S = mk({ bills: [withDue(bill('Rego', 850, 'year'), '2027-02-01')] });
    const [b] = billsFor(S, '2026-10-16', '2026-10-30');
    expect(b).toMatchObject({ name: 'Rego', due: '2027-02-01', saving: true });
    expect(b.v).toBeCloseTo(850 / 26);
  });
  it('weekly bills come out of every fortnightly pay; a fortnightly bill needs a date when paid weekly', () => {
    const S = mk({ bills: [bill('Board', 120, 'week')] });
    expect(billsFor(S, '2026-10-16', '2026-10-30')).toEqual([{ name: 'Board', v: 240, every: true }]);
    expect(everyPay(mk({ freq: 'week' }), 'fortnight')).toBe(false);
    const W = mk({ freq: 'week', bills: [withDue(bill('Gym', 30, 'fortnight'), '2026-10-20')] });
    expect(billsFor(W, '2026-10-16', '2026-10-23').map(b => b.v)).toEqual([30]);
    expect(billsFor(W, '2026-10-23', '2026-10-30')).toEqual([]);
  });
  it('monthly due dates keep their day where the month has it (31 Jan → 28 Feb → 31 Mar)', () => {
    expect(nextOn('2026-01-31', 'month', '2026-02-15')).toBe('2026-02-28');
    expect(dueIn('2026-01-31', 'month', '2026-02-15', '2026-04-15')).toEqual(['2026-02-28', '2026-03-31']);
  });
  it('repayments with a due date count the instalments due before the next pay', () => {
    const S = mk({ debts: [] });
    const card = debt({ min: 300, minAmt: 300, minEvery: 'month', due: '2026-10-20' });
    expect(repayIn(S, card, '2026-10-16', '2026-10-30')).toBe(300);
    expect(repayIn(S, card, '2026-10-30', '2026-11-13')).toBe(0);
    expect(repayIn(S, debt({ min: monthly(300, 'month'), minAmt: 300, minEvery: 'month' }), '2026-10-16', '2026-10-30')).toBeCloseTo(300 * 12 / 26);
  });
  it('a stacked pay lists each bill and what it is for', () => {
    const S = mk({ pay: 2000, pct: { spend: 100, debt: 0, save: 0, invest: 0 },
      bills: [withDue(bill('Optus', 65, 'month'), '2026-10-20'), bill('Board', 120, 'week'), withDue(bill('Rego', 850, 'year'), '2027-02-01')] });
    const s = makeStack(S, 2000, '2026-10-16');
    expect(s.plan.billList.map(b => b.name)).toEqual(['Optus', 'Board', 'Rego']);
    expect(s.plan.bills).toBeCloseTo(65 + 240 + 850 / 26);
  });
});
