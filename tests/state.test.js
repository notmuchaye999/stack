import { describe, it, expect } from 'vitest';
import { blank, readImport, summarize } from '../app/src/core/state.js';

describe('readImport (Plan → Data → Import)', () => {
  it('accepts what Export produced and summarises it', () => {
    const S = blank();
    S.moves.push({ id: 'a', t: 1, date: '2026-10-01', amount: 2000, type: 'pay', src: 'manual' });
    S.bills.push({ id: 'b', name: 'Phone', amount: 45, every: 'month' });
    const r = readImport('  ' + JSON.stringify(S) + '\n');
    expect(r.ok).toBe(true);
    expect(r.state).toEqual(S);
    expect(r.summary).toBe('1 pay, 0 other entries, 1 bill, 0 debts, 0 planned buys');
  });
  it('fills in lists older saves were missing', () => {
    const S = blank(); delete S.buys; delete S.rules;
    const r = readImport(JSON.stringify(S));
    expect(r.ok && r.state.buys).toEqual([]);
    expect(r.ok && r.state.rules).toEqual([]);
  });
  it('migrates a version 3 save', () => {
    const r = readImport(JSON.stringify({ pay: 1500, pct: { everyday: 20, fun: 10, debt: 40, emerg: 20, invest: 10 }, pays: [{ date: '2026-09-01', amount: 1500 }], spends: [], debts: [], bills: [] }));
    expect(r.ok).toBe(true);
    expect(r.state.pct).toEqual({ spend: 30, debt: 40, save: 20, invest: 10 });
    expect(r.state.moves[0]).toMatchObject({ type: 'pay', amount: 1500 });
  });
  it('rejects anything else with a plain message', () => {
    expect(readImport('hello').ok).toBe(false);
    expect(readImport('{"foo":1}').ok).toBe(false);
    expect(readImport('[]').ok).toBe(false);
  });
  it('summary counts are plural-aware', () => {
    expect(summarize(blank())).toBe('0 pays, 0 other entries, 0 bills, 0 debts, 0 planned buys');
  });
});
