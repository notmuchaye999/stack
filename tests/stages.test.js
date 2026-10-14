import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { stageInfo, suggest } from '../app/src/core/stages.js';
import { mk, debt, move } from './helpers/make.js';

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 14, 10)); });
afterEach(() => vi.useRealTimers());

const T = { emT: 6000, fiT: 300000 }; // emergency fund and FI targets from the projection

describe('stages', () => {
  it('1: an overdrawn account comes first', () => {
    const S = mk({ startSaved: 5000, debts: [debt({ od: true, balance: 300 }), debt({ rate: 20 })] });
    expect(stageInfo(S, T)).toMatchObject({ n: 1, tone: 'debt' });
  });
  it('2: then a $1,000 buffer', () => {
    expect(stageInfo(mk({ startSaved: 400, debts: [debt({ rate: 20 })] }), T)).toMatchObject({ n: 2, prog: 0.4 });
  });
  it('3: then debts at 7% or more (effective rate)', () => {
    expect(stageInfo(mk({ startSaved: 1500, debts: [debt({ rate: 7 })] }), T).n).toBe(3);
    // Interest-free right now, so its effective rate is 0%: not high-interest.
    expect(stageInfo(mk({ startSaved: 1500, debts: [debt({ rate: 25, free: true, until: '2027-03-01' })] }), T).n).toBe(4);
    expect(stageInfo(mk({ startSaved: 1500, debts: [debt({ rate: 6.99 })] }), T).n).toBe(4);
  });
  it('4: then a full emergency fund, 5: then investing', () => {
    expect(stageInfo(mk({ startSaved: 5999 }), T).n).toBe(4);
    expect(stageInfo(mk({ startSaved: 6000 }), T)).toMatchObject({ n: 5, tone: 'invest' });
  });
  it('a debt paid off by recorded payments no longer counts', () => {
    const d = debt({ od: true, balance: 300 });
    const S = mk({ startSaved: 5000, debts: [d], moves: [move('debt', '2026-10-01', 300, { ref: d.id })] });
    expect(stageInfo(S, T).n).toBe(4);
  });
});

describe('suggested split', () => {
  const withDebt = pct => mk({ pct, debts: [debt({ rate: 20 })] });
  const grid = [];
  for (const spend of [0, 10, 25, 30, 50, 70, 90]) for (const invest of [0, 3, 5, 20]) grid.push({ spend, debt: 0, save: 0, invest });

  it('always adds up to 100%', () => {
    for (const pct of grid) for (const n of [1, 2, 3, 4, 5]) {
      const p = suggest(withDebt(pct), { n });
      expect(p.spend + p.debt + p.save + p.invest, JSON.stringify({ pct, n })).toBe(100);
    }
  });
  it('keeps spending at your setting (30% if your split is blank)', () => {
    expect(suggest(withDebt({ spend: 40, debt: 40, save: 20, invest: 0 }), { n: 4 }).spend).toBe(40);
    expect(suggest(withDebt({ spend: 0, debt: 0, save: 0, invest: 0 }), { n: 4 }).spend).toBe(30);
  });
  it('stages 1–3: investing gets 5%, taken from spending, never from debt or savings', () => {
    const p = suggest(withDebt({ spend: 30, debt: 70, save: 0, invest: 0 }), { n: 1 });
    expect(p).toEqual({ spend: 25, debt: 70, save: 0, invest: 5 });
    const p3 = suggest(withDebt({ spend: 30, debt: 60, save: 10, invest: 0 }), { n: 3 });
    expect(p3.spend).toBe(25);
    expect(p3.debt).toBe(60);
  });
  it('investing beats savings whenever both are in the split', () => {
    for (const pct of grid) for (const n of [1, 2, 3, 4, 5]) {
      const p = suggest(withDebt(pct), { n });
      if (p.save > 0) expect(p.invest, JSON.stringify({ pct, n, p })).toBeGreaterThan(p.save);
    }
  });
  it('gives the same answer when applied twice', () => {
    for (const pct of grid) for (const n of [1, 2, 3, 4, 5]) {
      const S = withDebt(pct), once = suggest(S, { n });
      S.pct = once;
      expect(suggest(S, { n }), JSON.stringify({ pct, n })).toEqual(once);
    }
  });
});

describe('suggested split at the extremes (fixed bugs from the prototype)', () => {
  const edge = [];
  for (const spend of [1, 3, 5, 95, 96, 97, 98, 99, 100]) for (const invest of [0, 2, 5, 10]) edge.push({ spend, debt: 0, save: 0, invest });
  const withDebt = pct => mk({ pct, debts: [debt({ rate: 20 })] });

  it('investing beats savings even when there is only 2% to share (spending at 98%)', () => {
    const p = suggest(mk({ pct: { spend: 98, debt: 0, save: 0, invest: 2 } }), { n: 4 });
    expect(p.invest).toBeGreaterThan(p.save);
  });
  it('the same answer when applied twice, even with spending at 5% or less', () => {
    for (const pct of edge) for (const n of [1, 2, 3, 4, 5]) {
      const S = withDebt(pct), once = suggest(S, { n });
      S.pct = once;
      expect(suggest(S, { n }), JSON.stringify({ pct, n })).toEqual(once);
    }
  });
  it('never suggests a negative share', () => {
    for (const pct of edge) for (const n of [1, 2, 3, 4, 5]) {
      const p = suggest(withDebt(pct), { n });
      for (const v of Object.values(p)) expect(v, JSON.stringify({ pct, n, p })).toBeGreaterThanOrEqual(0);
      expect(p.spend + p.debt + p.save + p.invest).toBe(100);
    }
  });
});

describe('suggested split: every combination', () => {
  it('stays 100%, never negative, investing beats savings, keeps the 5% slice in stages 1–3, and is stable', () => {
    let checked = 0;
    for (const hasDebt of [true, false]) for (let spend = 0; spend <= 100; spend++) for (let invest = 0; invest <= 100; invest++) for (const debtP of [0, 40]) {
      const S = mk({ pct: { spend, debt: debtP, save: 0, invest }, debts: hasDebt ? [debt({ rate: 20 })] : [] });
      for (const n of [1, 2, 3, 4, 5]) {
        const a = suggest(S, { n }), b = suggest(Object.assign({}, S, { pct: a }), { n });
        const ok = a.spend + a.debt + a.save + a.invest === 100 && Object.values(a).every(v => v >= 0)
          && !(a.save > 0 && a.invest <= a.save) && !(n <= 3 && a.invest < Math.min(5, a.spend + a.invest))
          && JSON.stringify(a) === JSON.stringify(b);
        if (!ok) expect({ spend, invest, debtP, hasDebt, n, a, b }).toBe('a valid, stable split');
        checked++;
      }
    }
    expect(checked).toBe(204020);
  });
});
