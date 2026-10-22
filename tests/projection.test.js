import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { allocate, cycles, project } from '../app/src/core/projection.js';
import { order, perPay } from '../app/src/core/balances.js';
import { mk, pay, spend, debt, bill } from './helpers/make.js';

// Every test runs on Wednesday 14 Oct 2026.
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 14, 10)); });
afterEach(() => vi.useRealTimers());

const PER_MONTH = 26 / 12; // one fortnightly pay, as a monthly amount

describe('allocate: one period of money, with rollover', () => {
  it('savings fills the emergency fund first, then the rest flows to debt', () => {
    const debts = [{ id: 'a', bal: 1000, rate: 20, min: 50 }];
    const out = allocate({ debt: 100, save: 300, invest: 50 }, debts, 900, 1000);
    expect(out.mins.a).toBe(50);
    expect(out.save).toBe(100);         // only $100 was needed to fill the fund
    expect(out.extra.a).toBe(300);      // $100 debt share + the $200 savings couldn't use
    expect(out.em).toBe(1000);
    expect(out.invest).toBe(50);
    expect(debts[0].bal).toBe(650);
  });
  it('debt money with no debt left goes where the rest of the split goes: the buffer in its share while it fills, the rest invested', () => {
    const out = allocate({ debt: 200, save: 50, invest: 100 }, [], 900, 1000);
    expect(out.save).toBe(100);   // the $50 buffer share, then $50 of the debt money (its share, up to full)
    expect(out.em).toBe(1000);
    expect(out.invest).toBe(250);
    expect(allocate({ debt: 200, save: 0, invest: 100 }, [], 900, 1000)).toMatchObject({ save: 0, invest: 300 });
  });
  it('a fixed debt gets its repayments, never extra', () => {
    const debts = [{ id: 'loan', bal: 1000, rate: 30, min: 50, set: true }, { id: 'card', bal: 100, rate: 0, min: 0 }];
    const out = allocate({ debt: 500, save: 0, invest: 0 }, debts, 0, 0);
    expect(out.mins.loan).toBe(50);
    expect(out.extra.loan).toBeUndefined();
    expect(out.extra.card).toBe(100);
    expect(out.invest).toBe(400);
  });
  it('a minimum bigger than what is left frees the rest, split the way the split goes', () => {
    const debts = [{ id: 'a', bal: 40, rate: 0, min: 100 }];
    const out = allocate({ debt: 0, save: 50, invest: 50 }, debts, 0, 1000);
    expect(out.mins.a).toBe(40);
    expect(out.save).toBe(80);   // its $50, plus half the $60 freed
    expect(out.invest).toBe(80);
  });
  it('a debt cleared part-way lets the rest roll on', () => {
    const debts = [{ id: 'a', bal: 200, rate: 10, min: 0 }];
    const out = allocate({ debt: 500, save: 0, invest: 0 }, debts, 1000, 1000);
    expect(out.extra.a).toBe(200);
    expect(out.invest).toBe(300);
  });
  it('a minimum bigger than what is owed only pays what is owed', () => {
    const debts = [{ id: 'a', bal: 30, rate: 0, min: 50 }, { id: 'b', bal: 500, rate: 5, min: 0 }];
    const out = allocate({ debt: 0, save: 0, invest: 0 }, debts, 0, 0);
    expect(out.mins.a).toBe(30);
    expect(out.extra.b).toBe(20);
  });
});

describe('the countdown only uses pays you have entered', () => {
  const base = () => mk({ bills: [bill('Rent', 400, 'fortnight')], pct: { spend: 30, pot: 0, debt: 0, save: 20, invest: 50 } });

  it('no countdown before the first pay', () => {
    const P = project(base());
    expect(P.none).toBe(true);
    expect(P.fi).toBe(null);
  });
  it('1 pay: works from that pay alone', () => {
    const S = base();
    S.moves.push(pay('2026-10-10', 2000), spend('2026-10-11', 300));
    const C = cycles(S);
    expect(C.n).toBe(1);
    expect(C.incM).toBeCloseTo(2000 * PER_MONTH);
    expect(C.spendM).toBeCloseTo(300 * PER_MONTH);
    expect(project(S).fi).toBeGreaterThan(0);
  });
  it('2 pays: the average of both', () => {
    const S = base();
    S.moves.push(pay('2026-09-26', 2000), spend('2026-09-30', 400), pay('2026-10-10', 2200), spend('2026-10-11', 300));
    const C = cycles(S);
    expect(C.n).toBe(2);
    expect(C.incM).toBeCloseTo(2100 * PER_MONTH);
    expect(C.spendM).toBeCloseTo(350 * PER_MONTH);
  });
  it('3 pays: the average of all three', () => {
    const S = base();
    S.moves.push(pay('2026-09-12', 1800), spend('2026-09-20', 500), pay('2026-09-26', 2000), spend('2026-09-30', 400),
      pay('2026-10-10', 2200), spend('2026-10-11', 300));
    const C = cycles(S);
    expect(C.n).toBe(3);
    expect(C.incM).toBeCloseTo(2000 * PER_MONTH);
    expect(C.spendM).toBeCloseTo(400 * PER_MONTH);
  });
  it('only the last 26 pays count', () => {
    const S = base();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(2026, 9, 10 - 14 * i), iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      S.moves.push(pay(iso, i >= 26 ? 99999 : 2000));
    }
    const C = cycles(S);
    expect(C.n).toBe(26);
    expect(C.incM).toBeCloseTo(2000 * PER_MONTH);
  });
  it('the pay you are in counts as the bigger of card spend and its card budget', () => {
    const S = base();
    S.stacks.push({ id: 'k', t: 1, date: '2026-10-10', amount: 2000, plan: { bills: 400, spend: 500, card: 500, savings: 0, debts: {}, save: 0, invest: 0 }, short: 0, spare: 0 });
    S.moves.push(pay('2026-10-10', 2000, { stack: 'k' }), spend('2026-10-11', 300));
    expect(cycles(S).spendM).toBeCloseTo(500 * PER_MONTH); // budget is bigger
    S.moves.push(spend('2026-10-12', 400));
    expect(cycles(S).spendM).toBeCloseTo(700 * PER_MONTH); // now actual spend is bigger
  });
  it('Never, and how much you are short each pay, when more goes out than comes in', () => {
    const S = mk({ bills: [bill('Rent', 800, 'fortnight')], pct: { spend: 30, pot: 0, debt: 0, save: 0, invest: 70 } });
    S.moves.push(pay('2026-10-10', 1000), spend('2026-10-11', 400));
    const P = project(S);
    expect(P.fi).toBe(null);
    expect(P.work).toBeLessThan(0);
    expect(perPay(S, -P.work)).toBeCloseTo(200);
  });
});

describe('debts in the projection', () => {
  // All extra money goes to investing, so the debt only shrinks by its $100/month minimum.
  const withDebt = d => {
    const S = mk({ pct: { spend: 20, pot: 0, debt: 0, save: 0, invest: 80 }, debts: [debt({ balance: 1000, rate: 20, min: 100, ...d })] });
    S.moves.push(pay('2026-10-10', 3000));
    return S;
  };
  it('interest-free if paid on time: no interest, so $1,000 at $100 a month clears in exactly 10 months', () => {
    expect(project(withDebt({ free: true })).debtFree).toBe(10);
  });
  it('a normal 20% debt takes longer (11.03 months, so it clears in month 12)', () => {
    expect(project(withDebt({})).debtFree).toBe(12);
  });
  it('interest starts once the interest-free end date passes (3 free months, then 20%)', () => {
    expect(project(withDebt({ free: true, until: '2027-01-14' })).debtFree).toBe(11);
  });
  it('extra goes: urgent → focus → overdrawn and credit → highest effective rate → interest-free ending soonest', () => {
    const ds = [
      debt({ id: 'tenPct', rate: 10 }), debt({ id: 'twentyPct', rate: 20 }), debt({ id: 'overdrawn', od: true }), debt({ id: 'afterpay', card: true }),
      debt({ id: 'freeLate', rate: 25, free: true, until: '2027-01-14' }), debt({ id: 'freeSoon', rate: 25, free: true, until: '2026-11-14' }),
      debt({ id: 'freeForever', rate: 5, free: true }), debt({ id: 'focus', rate: 3, focus: true }), debt({ id: 'fine', urgent: true }),
    ];
    expect(order(ds).map(d => d.id)).toEqual(['fine', 'focus', 'overdrawn', 'afterpay', 'twentyPct', 'tenPct', 'freeSoon', 'freeLate', 'freeForever']);
  });
});

describe('what the countdown counts as spent', () => {
  const plan = (budget, savings = 0) => ({ bills: 0, spend: budget + savings, card: budget, savings, debts: {}, save: 0, invest: 0 });
  const twoPays = () => {
    const S = mk({ pct: { spend: 30, pot: 0, debt: 0, save: 0, invest: 70 } });
    S.stacks.push({ id: 'a', t: 1, date: '2026-09-30', amount: 2000, plan: plan(600, 100), short: 0, spare: 0 }, { id: 'b', t: 2, date: '2026-10-14', amount: 2000, plan: plan(600), short: 0, spare: 0 });
    S.moves.push(pay('2026-09-30', 2000, { stack: 'a' }), pay('2026-10-14', 2000, { stack: 'b' }));
    return S;
  };
  it('a finished pay with nothing recorded counts as its full card budget, so a forgotten pay can\'t make FI look closer', () => {
    const S = twoPays();
    // 14 days at $600 + $100 into Savings, then the pay you're in at its $600 budget: 28 days, $1,300.
    expect(cycles(S).spendM).toBeCloseTo(1300 / 28 * 14 * PER_MONTH);
    S.moves.push(spend('2026-10-02', 200));
    expect(cycles(S).spendM).toBeCloseTo(900 / 28 * 14 * PER_MONTH);
  });
  it('Savings counts when it goes into Savings, not when the thing is bought', () => {
    const S = twoPays();
    S.moves.push(spend('2026-10-02', 200), spend('2026-10-03', 450, { buy: 'tools' }));
    expect(cycles(S).spendM).toBeCloseTo(900 / 28 * 14 * PER_MONTH);
  });
});
