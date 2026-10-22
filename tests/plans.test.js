import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { specOf, ruleOf, owes, payPlans, spendHist, PLANS } from '../app/src/core/plans.js';
import { fallbackPct, customPct, monthly } from '../app/src/core/balances.js';
import { stackPay } from '../app/src/core/stacks.js';
import { mk, debt, bill, spend } from './helpers/make.js';

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 14, 10)); });
afterEach(() => vi.useRealTimers());

const owing = () => mk({ bills: [bill('Rent', 400, 'fortnight')], debts: [debt({ id: 'card', balance: 2000, rate: 20, min: monthly(100, 'fortnight'), minAmt: 100, minEvery: 'fortnight' })] });
const clear = () => mk({ bills: [bill('Rent', 400, 'fortnight')] });

describe('the plans', () => {
  it('FI: nothing to spend, no Savings, no Buffer; the rest split between debt and investing for the fastest FI', () => {
    const p = specOf(owing(), 'fi').pay(1000, 500);
    expect(p).toMatchObject({ spend: 0, pot: 0, save: 0 });
    expect(p.debt + p.invest).toBe(100);
  });
  it('Debt-free: your usual spending, everything else on debt', () => {
    expect(specOf(owing(), 'debt').pay(1000, 500)).toEqual({ spend: 30, pot: 0, debt: 70, save: 0, invest: 0 });
  });
  it('with nothing left to put extra on, Debt-free is Balanced: the Buffer first, then ⅔ investing and ⅓ Savings', () => {
    const S = clear();
    expect(owes(S)).toBe(false);
    expect(ruleOf(S, 'debt')).toBe('bal');
    const p = specOf(S, 'debt').pay(1000, 300);
    expect(p).toMatchObject({ spend: 30, debt: 0, save: 30 });
    expect(p.pot).toBeCloseTo(40 / 3);
    expect(p.invest).toBeCloseTo(80 / 3);
  });
  it('a fixed repayment isn\'t something to put extra on', () => {
    const S = owing(); S.debts[0].set = true;
    expect(owes(S)).toBe(false);
  });
  it('Tight waits until a pay\'s spending is tracked, then spends like your 3 cheapest pays', () => {
    const S = owing();
    expect(specOf(S, 'tight')).toBe(null);
    ['2026-08-19', '2026-09-02', '2026-09-16', '2026-09-30', '2026-10-14'].forEach(d => stackPay(S, 2000, d));
    [['2026-08-20', 300], ['2026-09-03', 500], ['2026-09-17', 400], ['2026-10-01', 700]].forEach(([d, a]) => S.moves.push(spend(d, a)));
    expect(spendHist(S)).toEqual({ usual: 475, tight: 400 });
    expect(specOf(S, 'tight').pay(1000, 0).spend).toBe(40);
    expect(specOf(S, 'debt').pay(1000, 0).spend).toBe(47.5); // Debt-free uses your usual spending
  });
  it('Custom: your split, or a starting one until you set yours', () => {
    const S = owing();
    // A little extra on debt while there is any; the Buffer gets 5% for every 15% left while it fills; the rest invested.
    expect(fallbackPct(S)).toEqual({ spend: 30, pot: 0, debt: 10, save: 20, invest: 40 });
    expect(fallbackPct(clear())).toEqual({ spend: 30, pot: 0, debt: 0, save: 20, invest: 50 });
    S.pct = { spend: 25, pot: 10, debt: 25, save: 10, invest: 30 };
    expect(customPct(S)).toBe(S.pct);
  });
  it('the plans for a pay you haven\'t stacked are worked out without changing your data', () => {
    const S = owing(), before = JSON.stringify(S);
    const plans = payPlans(S, 2000, '2026-10-14');
    expect(plans.map(p => p.k)).toEqual(PLANS);
    expect(plans.find(p => p.k === 'tight').lock).toBe(true);
    expect(plans.find(p => p.k === 'fi').stk.plan.card).toBe(0);
    expect(JSON.stringify(S)).toBe(before);
  });
});
