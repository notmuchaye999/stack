import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeStack, stackItems, didAll, stackPay, latestStack } from '../app/src/core/stacks.js';
import { monthly } from '../app/src/core/balances.js';
import { mk, debt, bill, move } from './helpers/make.js';

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 14, 10)); });
afterEach(() => vi.useRealTimers());

const setup = () => mk({
  pay: 2000, freq: 'fortnight', pct: { spend: 50, debt: 20, save: 10, invest: 20 },
  bills: [bill('Rent', 400, 'fortnight')],
  debts: [debt({ id: 'card', name: 'Credit card', balance: 2000, rate: 20, min: monthly(100, 'fortnight'), minAmt: 100, minEvery: 'fortnight' })],
  buys: [{ id: 'tools', name: 'Tools', cost: 260, by: '2026-11-11' }], // 2 pays away → $130 a pay
});

describe('stacking a pay', () => {
  it('goes bills → minimums → planned buys → the rest split by your %', () => {
    const s = makeStack(setup(), 2000, '2026-10-14');
    expect(s.plan.bills).toBeCloseTo(400);
    expect(s.plan.buys).toBeCloseTo(130);
    expect(s.plan.buyNames).toEqual(['Tools']);
    // $1,370 left: spending 50%, extra debt 20%, savings 10%, investing 20%
    expect(s.plan.spend).toBeCloseTo(685);
    expect(s.plan.debts.card).toBeCloseTo(100 + 274); // minimum + extra
    expect(s.plan.save).toBeCloseTo(137);
    expect(s.plan.invest).toBeCloseTo(274);
    expect(s.short).toBe(0);
    expect(s.spare).toBeCloseTo(0);
  });
  it('says how much short a pay is when it does not cover bills and minimums', () => {
    const s = makeStack(setup(), 450, '2026-10-14');
    expect(s.short).toBeCloseTo(50);
    expect(s.plan.buys).toBe(0);
    expect(s.plan.spend).toBe(0);
  });
  it('turns weekly, fortnightly and monthly repayments into the right amount per pay', () => {
    for (const [amt, every, perFortnight] of [[50, 'week', 100], [100, 'fortnight', 100], [300, 'month', 300 * 12 / 26]]) {
      const S = setup();
      S.pct = { spend: 100, debt: 0, save: 0, invest: 0 };
      Object.assign(S.debts[0], { min: monthly(amt, every), minAmt: amt, minEvery: every });
      expect(makeStack(S, 2000, '2026-10-14').plan.debts.card, every).toBeCloseTo(perFortnight);
    }
  });
  it('your first pay becomes your usual pay', () => {
    const S = mk();
    const { first, stack } = stackPay(S, 1500, '2026-10-14');
    expect(first).toBe(true);
    expect(S.pay).toBe(1500);
    expect(S.moves.find(m => m.type === 'pay')).toMatchObject({ amount: 1500, stack: stack.id, src: 'stack' });
    expect(stackPay(S, 1600, '2026-10-28').first).toBe(false);
    expect(S.pay).toBe(1500);
  });
});

describe('plan vs what you did', () => {
  const twoPays = () => {
    const S = setup();
    const a = stackPay(S, 2000, '2026-09-30').stack, b = stackPay(S, 2000, '2026-10-14').stack;
    return { S, a, b };
  };
  it('entries count towards the pay they are dated inside', () => {
    const { S, a, b } = twoPays();
    S.moves.push(move('saved', '2026-10-05', 50), move('spend', '2026-10-03', 120), move('spend', '2026-10-14', 40));
    const A = stackItems(S, a), B = stackItems(S, b);
    expect(A.todos.find(t => t.key === 'save')).toMatchObject({ done: 50, state: 'part' });
    expect(B.todos.find(t => t.key === 'save').done).toBe(0);
    expect(A.spent).toBe(120);
    expect(B.spent).toBe(40);
    expect(latestStack(S).id).toBe(b.id);
  });
  it('a past pay can be filled in later, dated on that pay', () => {
    const { S, a, b } = twoPays();
    const n = didAll(S, a.id, true);
    expect(n).toBe(3); // the card payment, savings and investing
    expect(S.moves.slice(-3).every(m => m.date === '2026-09-30')).toBe(true);
    expect(stackItems(S, a).complete).toBe(true);
    expect(stackItems(S, b).complete).toBe(false);
  });
  it('planned-buy spending comes out of what was put aside, not the card budget', () => {
    const { S, b } = twoPays();
    S.moves.push(move('spend', '2026-10-14', 130, { buy: 'tools' }));
    expect(stackItems(S, b)).toMatchObject({ spent: 0, buysSpent: 130 });
  });
});
