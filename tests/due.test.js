import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { billsFor, repayIn, nextOn, dueIn, everyPay, lateBills, tickBill, billNow, billsDueNow, billPaidTo, instDates, overdue } from '../app/src/core/due.js';
import { makeStack, stackPay } from '../app/src/core/stacks.js';
import { monthly } from '../app/src/core/balances.js';
import { mk, bill, debt } from './helpers/make.js';

// Every test runs on Wednesday 14 Oct 2026.
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
  it('a stacked pay lists each bill, and holds back the total rounded up to the dollar', () => {
    const S = mk({ pct: { spend: 100, pot: 0, debt: 0, save: 0, invest: 0 },
      bills: [withDue(bill('Optus', 65, 'month'), '2026-10-20'), bill('Board', 120, 'week'), withDue(bill('Rego', 850, 'year'), '2027-02-01')] });
    const s = makeStack(S, 2000, '2026-10-16');
    expect(s.plan.billList.map(b => b.name)).toEqual(['Optus', 'Board', 'Rego']);
    expect(s.plan.bills).toBe(Math.ceil(65 + 240 + 850 / 26));
  });
});

describe('overdue bills', () => {
  it('a bill that fell due before a pay, not paid and not held by an earlier pay, comes out of this one', () => {
    const S = mk({ bills: [withDue(bill('Phone', 45, 'month'), '2026-10-01')] });
    expect(lateBills(S, '2026-10-14')).toEqual([{ id: S.bills[0].id, name: 'Phone', d: '2026-10-01', v: 45 }]);
    const s = makeStack(S, 1000, '2026-10-14');
    expect(s.plan.billList.find(b => b.late)).toMatchObject({ name: 'Phone', v: 45, due: '2026-10-01' });
    expect(s.late).toHaveLength(1); // kept with the pay, so ticking it off later doesn't move the pay
  });
  it('a pay that covered the due date already held the money for it', () => {
    const S = mk({ bills: [withDue(bill('Phone', 45, 'month'), '2026-10-01')] });
    stackPay(S, 1000, '2026-09-28');
    expect(lateBills(S, '2026-10-14')).toEqual([]);
  });
  it('an urgent one-off past its date is overdue', () => {
    const S = mk();
    const fine = debt({ balance: 300, min: 300, minAmt: 300, due: '2026-10-10', urgent: true });
    expect(overdue(S, fine)).toBe(true);
    expect(overdue(S, Object.assign({}, fine, { due: '2026-10-20' }))).toBe(false);
    expect(overdue(S, Object.assign({}, fine, { urgent: false }))).toBe(false);
  });
});

describe('ticking bills off', () => {
  it('ticking records the payment out of Pay, and unticking takes it back off', () => {
    const S = mk({ bills: [withDue(bill('Phone', 45, 'month'), '2026-10-20')] });
    stackPay(S, 1000, '2026-10-14');
    const id = S.bills[0].id;
    expect(billNow(S, S.bills[0])).toMatchObject({ date: '2026-10-20', paid: false, late: false });
    expect(tickBill(S, id, '2026-10-20')).toBe(true);
    expect(S.moves.filter(m => m.type === 'bill')).toMatchObject([{ amount: 45, ref: id, d: '2026-10-20' }]);
    expect(billNow(S, S.bills[0])).toMatchObject({ date: '2026-10-20', paid: true, next: '2026-11-20' });
    expect(tickBill(S, id, '2026-10-20')).toBe(false);
    expect(S.moves.filter(m => m.type === 'bill')).toEqual([]);
  });
  it('a direct debit ticks itself off on the due date, and can\'t be ticked by hand', () => {
    const S = mk({ bills: [Object.assign(withDue(bill('Internet', 75, 'month'), '2026-09-10'), { auto: true })] });
    expect(billPaidTo(S, S.bills[0])).toBe('2026-10-10');
    expect(tickBill(S, S.bills[0].id, '2026-11-10')).toBe(null);
  });
  it('the pay you are in lists each due date before the next pay, and any earlier one not ticked', () => {
    const S = mk({ bills: [withDue(bill('Phone', 45, 'month'), '2026-09-20'), bill('Board', 120, 'week')] });
    S.bills[0].paidTo = '2026-09-20';
    stackPay(S, 1000, '2026-10-14');
    expect(billsDueNow(S).map(x => [x.b.name, x.date, x.paid, x.late])).toEqual([['Board', '2026-10-14', false, false], ['Phone', '2026-10-20', false, false]]);
    S.bills[0].paidTo = '2026-08-20';
    expect(billsDueNow(S).map(x => [x.b.name, x.date, x.late])).toEqual([['Phone', '2026-09-20', true], ['Board', '2026-10-14', false], ['Phone', '2026-10-20', false]]);
  });
});

describe('pay in 4', () => {
  it('the other 3 payments land a fortnight apart, and each pay sets aside the ones due before the next', () => {
    const x = { grp: 'g', amt: 50, first: '2026-10-20', n: 3 };
    expect(instDates(x)).toEqual(['2026-10-20', '2026-11-03', '2026-11-17']);
    const S = mk(), d = debt({ balance: 150, min: 0, card: true, in4: true, inst: [x] });
    expect(repayIn(S, d, '2026-10-16', '2026-10-30')).toBe(50);
    expect(repayIn(S, d, '2026-10-30', '2026-11-27')).toBe(100);
  });
});
