import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeStack, stackItems, stackedBy, didAll, stackPay, latestStack, restack, leftover, habit } from '../app/src/core/stacks.js';
import { monthly } from '../app/src/core/balances.js';
import { specOf } from '../app/src/core/plans.js';
import { moveRecs } from '../app/src/core/accounts.js';
import { mk, debt, bill, move, spend } from './helpers/make.js';

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 14, 10)); });
afterEach(() => vi.useRealTimers());

const setup = (x = {}) => mk({
  freq: 'fortnight', pct: { spend: 50, pot: 0, debt: 20, save: 10, invest: 20 },
  bills: [bill('Rent', 400, 'fortnight')],
  debts: [debt({ id: 'card', name: 'Credit card', balance: 2000, rate: 20, min: monthly(100, 'fortnight'), minAmt: 100, minEvery: 'fortnight' })], ...x,
});
const sum = p => p.bills + Object.values(p.debts).reduce((a, v) => a + v, 0) + p.card + p.savings + p.save + p.invest;

describe('stacking a pay', () => {
  it('goes bills due before the next pay → repayments due before it → the rest split by your plan', () => {
    const s = makeStack(setup(), 2000, '2026-10-14');
    expect(s.plan).toMatchObject({ bills: 400, mins: 100, minsBy: { card: 100 }, rem: 1500 });
    // $1,500 left: spending 50%, extra debt 20%, Buffer 10%, investing 20%.
    expect(s.plan).toMatchObject({ card: 750, savings: 0, debts: { card: 100 + 300 }, save: 150, invest: 300 });
    expect(s.short).toBe(0);
    expect(s.spare).toBe(0);
  });
  it('moves money in $5 steps; spending takes the loose change, so the parts add up to the pay', () => {
    const s = makeStack(setup(), 2003.47, '2026-10-14');
    expect(s.plan).toMatchObject({ debts: { card: 400 }, save: 150, invest: 300 });
    expect(s.plan.card).toBeCloseTo(753.47);
    expect(sum(s.plan)).toBeCloseTo(2003.47);
  });
  it('says how much short a pay is when it doesn\'t cover bills and repayments', () => {
    const s = makeStack(setup(), 450, '2026-10-14');
    expect(s.short).toBe(50);
    expect(s.plan).toMatchObject({ card: 0, save: 0, invest: 0 });
  });
  it('turns weekly, fortnightly and monthly repayments into the right amount per pay', () => {
    for (const [amt, every, perFortnight] of [[50, 'week', 100], [100, 'fortnight', 100], [300, 'month', Math.round(300 * 12 / 26)]]) {
      const S = setup({ pct: { spend: 100, pot: 0, debt: 0, save: 0, invest: 0 } });
      Object.assign(S.debts[0], { min: monthly(amt, every), minAmt: amt, minEvery: every });
      expect(makeStack(S, 2000, '2026-10-14').plan.debts.card, every).toBe(perFortnight);
    }
  });
  it('Savings is its own slice, for purchases', () => {
    const s = makeStack(setup({ pct: { spend: 40, pot: 10, debt: 20, save: 10, invest: 20 } }), 2000, '2026-10-14');
    expect(s.plan.savings).toBe(150);
    expect(s.plan.spend).toBe(s.plan.card + 150);
  });
  it('an urgent debt takes the whole split except spending money until it\'s paid', () => {
    const S = setup();
    S.debts.push(debt({ id: 'fine', name: 'Fine', balance: 500, min: 0, urgent: true }));
    const s = makeStack(S, 2000, '2026-10-14');
    expect(s.plan.debts.fine).toBe(500);
    expect(s.plan.card).toBe(750);
    expect(s.plan.save + s.plan.invest + s.plan.debts.card - 100).toBe(250); // what's left of the $750 after the fine
  });
  it('records the pay with its plan, on your plan or on another just for this pay', () => {
    const S = setup();
    const s = stackPay(S, 2000, '2026-10-14');
    expect(S.moves.find(m => m.type === 'pay')).toMatchObject({ amount: 2000, stack: s.id, src: 'stack' });
    expect(s).toMatchObject({ pk: 'custom' });
    expect(s.one).toBeUndefined();
    const t = stackPay(S, 1500, '2026-10-15', 0, { k: 'fi', spec: specOf(S, 'fi') });
    expect(t).toMatchObject({ pk: 'fi', one: true });
    expect(t.pct.spend).toBe(0); // FI: nothing to spend
  });
  it('the pay you\'re in re-stacks when your plan changes; a pay on another plan keeps the split it got', () => {
    const S = setup();
    stackPay(S, 2000, '2026-10-14');
    S.pct = { spend: 30, pot: 0, debt: 40, save: 10, invest: 20 };
    expect(restack(S)).toBe(true);
    expect(latestStack(S).plan.card).toBe(450);
    expect(restack(S)).toBe(false);
  });
});

describe('plan vs what you did', () => {
  const twoPays = () => {
    const S = setup();
    const a = stackPay(S, 2000, '2026-09-30'), b = stackPay(S, 2000, '2026-10-14');
    return { S, a, b };
  };
  it('entries count towards the pay they are dated inside', () => {
    const { S, a, b } = twoPays();
    S.moves.push(move('saved', '2026-10-05', 50), spend('2026-10-03', 120), spend('2026-10-14', 40));
    const A = stackItems(S, a), B = stackItems(S, b);
    expect(A.todos.find(t => t.key === 'save')).toMatchObject({ done: 50, state: 'part' });
    expect(B.todos.find(t => t.key === 'save').done).toBe(0);
    expect(A.spent).toBe(120);
    expect(B.spent).toBe(40);
    expect(latestStack(S).id).toBe(b.id);
  });
  it('Mark all done: a past pay is filled in later, dated on that pay', () => {
    const { S, a, b } = twoPays();
    const n = didAll(S, a.id, true);
    expect(n).toBe(3); // the card payment, the Buffer and investing
    expect(S.moves.slice(-3).every(m => m.date === '2026-09-30')).toBe(true);
    expect(stackItems(S, a).complete).toBe(true);
    expect(stackItems(S, b).complete).toBe(false);
  });
  it('money moved past the plan came out of this pay, so it comes off spending', () => {
    const { S, b } = twoPays();
    S.moves.push(...moveRecs(S, 'pay', 'buffer', 250, '2026-10-14', 'Buffer'));
    const I = stackItems(S, b);
    expect(I.over).toBe(100);    // the plan put $150 in the Buffer
    expect(I.overPay).toBe(100); // straight from Pay
  });
  it('purchases from Savings don\'t come out of the card budget', () => {
    const { S, b } = twoPays();
    S.moves.push(spend('2026-10-14', 130, { buy: 'tools' }));
    expect(stackItems(S, b)).toMatchObject({ spent: 0, tracked: false });
  });
  it('your spending habit: the finished pays where you logged spending', () => {
    const { S } = twoPays();
    expect(habit(S)).toBe(null);
    S.moves.push(spend('2026-10-03', 500));
    expect(habit(S)).toMatchObject({ n: 1, spent: 500, budget: 750 });
  });
});

describe('the everyday card', () => {
  const withCard = () => setup({ debts: [
    debt({ id: 'w', name: 'Card', card: true, wallet: true, limit: 1000, balance: 0, focus: true }),
    debt({ id: 'ap', name: 'Afterpay', card: true, limit: 800, balance: 300, min: monthly(50, 'fortnight'), minAmt: 50, minEvery: 'fortnight', viaWallet: true }),
  ] });
  it('one top-up covers spending money and the repayments the card makes', () => {
    const S = withCard(), s = stackPay(S, 2000, '2026-10-14'), I = stackItems(S, s);
    const top = I.todos.find(i => i.key === 'debt:w'), ap = I.todos.find(i => i.key === 'debt:ap');
    expect(ap).toMatchObject({ via: true, label: 'Pay Afterpay from Card' });
    expect(top.label).toBe('Top up Card');
    expect(top.plan).toBe(s.plan.card + ap.plan + (s.plan.debts.w || 0));
  });
  it('card money left from a tracked pay carries into the next one', () => {
    const S = withCard(), s = stackPay(S, 2000, '2026-09-30');
    S.moves.push(spend('2026-10-01', 100));
    expect(leftover(S, '2026-10-14')).toBe(Math.round(s.plan.card + stackItems(S, s).viaLeft - 100));
    expect(leftover(mk(), '2026-10-14')).toBe(0);
  });
});

describe('your stack: what each pay put towards progress', () => {
  it('counts repayments, Buffer, Savings and investing from the pay, against what its plan puts there', () => {
    const S = setup(); stackPay(S, 2000, '2026-10-14');
    const stk = latestStack(S);
    expect(stackedBy(S, stk)).toMatchObject({ total: 0, planned: 400 + 150 + 300 });
    S.moves.push(move('debt', '2026-10-14', 400, { ref: 'card' }), move('saved', '2026-10-15', 150), move('invested', '2026-10-15', 100));
    expect(stackedBy(S, stk)).toMatchObject({ debt: 400, saved: 150, invested: 100, pot: 0, total: 650 });
  });
  it("leaves out moves between your own accounts, money from elsewhere, and other pays' entries", () => {
    const S = setup(); stackPay(S, 2000, '2026-10-01'); stackPay(S, 2000, '2026-10-14');
    S.moves.push(move('debt', '2026-10-14', 200, { ref: 'card', from: 'buffer' }), move('saved', '2026-10-14', 50, { from: 'ext' }), move('invested', '2026-10-05', 80));
    expect(stackedBy(S, latestStack(S)).total).toBe(0);
    expect(stackedBy(S, S.stacks.find(s => s.date === '2026-10-01')).invested).toBe(80);
  });
  it("doesn't count the everyday card's spending money, only what goes past it", () => {
    const S = setup({ debts: [debt({ id: 'w', name: 'Card', card: true, wallet: true, limit: 1000, balance: 0 })] }); stackPay(S, 2000, '2026-10-14');
    const stk = latestStack(S), tu = stackItems(S, stk).todos.find(i => i.key === 'debt:w');
    S.moves.push(move('debt', '2026-10-14', tu.plan, { ref: 'w' }));
    expect(stackedBy(S, stk).debt).toBe(0);
    S.moves.push(move('debt', '2026-10-15', 60, { ref: 'w' }));
    expect(stackedBy(S, stk).debt).toBe(60);
  });
});
