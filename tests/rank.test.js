import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tierOf, ensureRank, preSettle, settleRank, checkRank, rankNW } from '../app/src/core/rank.js';
import { goalNow, goalName } from '../app/src/core/goals.js';
import { stackPay } from '../app/src/core/stacks.js';
import { netWorth } from '../app/src/core/balances.js';
import { mk, debt, move, spend } from './helpers/make.js';

let clock;
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); clock = new Date(2026, 9, 14, 10).getTime(); vi.setSystemTime(clock); });
afterEach(() => vi.useRealTimers());
const later = () => { clock += 1000; vi.setSystemTime(clock); };

describe('rank', () => {
  it('is your net worth in steps: DEBT below $0, then a rank every $1,000 to $10,000, then wider', () => {
    const at = v => tierOf(v).name;
    expect([-2500, -1000, -0.01, 0, 999, 1000, 9999, 10000, 12500, 25000, 30000, 50000, 60000].map(at))
      .toEqual(['DEBT 3', 'DEBT 1', 'DEBT 1', 'RANK 0', 'RANK 0', 'RANK 1', 'RANK 9', 'RANK 10', 'RANK 11', 'RANK 16', 'RANK 17', 'RANK 21', 'RANK 22']);
    expect(tierOf(-2500)).toMatchObject({ lo: -3000, hi: -2000 });
    expect(tierOf(12600)).toMatchObject({ lo: 12500, hi: 15000 });
  });
  it('only moves on pay day: stacking a pay settles the one that ended', () => {
    const S = mk({ pct: { spend: 50, pot: 0, debt: 0, save: 20, invest: 30 }, startSaved: 500, savedAsOf: { date: '2026-09-01', t: 0 } });
    stackPay(S, 2000, '2026-09-30');
    ensureRank(S);
    expect(rankNW(S)).toBe(2500); // placed right after the pay landed: $500 Buffer + $2,000 in Pay
    later(); S.moves.push(spend('2026-10-02', 300, { t: Date.now() }), move('saved', '2026-10-03', 400, { t: Date.now() + 1 }));
    expect(netWorth(S)).toBe(2200); // spending lowers it; moving money into the Buffer doesn't change it
    expect(rankNW(S)).toBe(2500); // but your rank stays locked until pay day
    later(); const pre = preSettle(S); stackPay(S, 2000, '2026-10-14'); const R = settleRank(S, pre);
    expect(R).toMatchObject({ from: 2500, to: 4200, pay: 2000, spent: 300, bills: 0, market: 0, fixes: 0 });
    expect(rankNW(S)).toBe(4200);
    expect(S.best.nw).toBe(4200);
  });
  it('says when a debt clears, when you\'re debt-free and when a goal is reached', () => {
    const S = mk({ debts: [debt({ name: 'Afterpay', card: true, limit: 800, balance: 200 })], goals: [{ id: 'g', amount: 100, kind: 'saved', by: null }] });
    expect(checkRank(S).msg).toEqual([]); // first look: nothing cleared, goal not there yet
    S.startSaved = 150; S.moves.push(move('debt', '2026-10-14', 200, { ref: S.debts[0].id }));
    expect(checkRank(S).msg).toEqual(['Afterpay cleared, locked', 'Debt-free', `Goal reached · ${goalName(S.goals[0])}`]);
    expect(checkRank(S).msg).toEqual([]);
  });
});

describe('goals', () => {
  it('pace is what actually went in over your last pays; a date says what it needs a pay', () => {
    const S = mk({ startSaved: 1000 }), g = { id: 'g', amount: 3000, kind: 'saved', by: '2027-01-06' };
    stackPay(S, 2000, '2026-09-30'); S.moves.push(move('saved', '2026-10-01', 250));
    stackPay(S, 2000, '2026-10-14'); S.moves.push(move('saved', '2026-10-15', 250));
    const G = goalNow(S, g);
    expect(G).toMatchObject({ v: 1500, need: 1500, rate: 250, pays: 6, done: false });
    expect(G.pace.per).toBeCloseTo(1500 / 6);
    expect(G.pace.ok).toBe(true);
  });
});
