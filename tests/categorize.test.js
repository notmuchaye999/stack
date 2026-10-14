import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { readStatement } from '../app/src/core/csv.js';
import { prepImport, importRows, pickRow, relabel, similarTo, dropImports, categorize } from '../app/src/core/categorize.js';
import { savedNow, investedNow } from '../app/src/core/balances.js';
import { mk, spend, debt, bill } from './helpers/make.js';

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 14, 10)); });
afterEach(() => vi.useRealTimers());

const commbank = () => readStatement(readFileSync(new URL('./fixtures/commbank.csv', import.meta.url), 'utf8'));
const label = rows => Object.fromEntries(rows.map(r => [r.desc.slice(0, 22), r.type]));

describe('labelling bank lines', () => {
  it('makes a sensible first guess', () => {
    expect(label(prepImport(mk(), commbank()).rows)).toEqual({
      'Salary Acme Diesel Pty': 'pay', 'WOOLWORTHS 1234 BRISBA': 'spend', 'Direct Debit 123456 NE': 'bill',
      'Transfer to xx9910 Com': 'saved', 'Transfer from xx9910 N': 'saved',
    });
  });
  it('matches your own debts and bills by name', () => {
    const S = mk({ debts: [debt({ id: 'zip', name: 'Zip Money' })], bills: [bill('Gym membership', 20, 'week')] });
    expect(categorize(S, { date: '2026-10-01', amount: -50, desc: 'ZIPMONEY REPAYMENT 1234' }, [])).toEqual({ type: 'debt', ref: 'zip' });
    expect(categorize(S, { date: '2026-10-01', amount: -20, desc: 'MEMBERSHIP FITNESS CO' }, [])).toEqual({ type: 'bill' });
  });
});

describe('money coming back from savings or investments', () => {
  it('counts as a withdrawal, not income', () => {
    const S = mk({ startSaved: 1000, savedAsOf: { date: '2026-10-01', t: 0 }, startInvested: 5000, investedAsOf: { date: '2026-10-01', t: 0 } });
    const { rows } = prepImport(S, [
      { date: '2026-10-10', amount: 50, desc: 'Transfer from xx9910 NetBank Savings' },
      { date: '2026-10-11', amount: 400, desc: 'VANGUARD PERSONAL INVESTOR WITHDRAWAL' },
    ]);
    expect(rows.map(r => r.type)).toEqual(['invested', 'saved']);
    importRows(S, rows);
    expect(savedNow(S)).toBe(950);
    expect(investedNow(S)).toBe(4600);
  });
});

describe('dedupe', () => {
  it('never imports the same line twice', () => {
    const S = mk();
    const first = prepImport(S, commbank());
    expect(importRows(S, first.rows)).toBe(5);
    const again = prepImport(S, commbank());
    expect(again.rows).toEqual([]);
    expect(again.already).toBe(5);
  });
  it('keeps two identical lines on the same day (both are real)', () => {
    const line = { date: '2026-10-10', amount: -5.5, desc: 'COFFEE CART' };
    const S = mk();
    importRows(S, prepImport(S, [{ ...line }, { ...line }]).rows);
    expect(S.moves.length).toBe(2);
  });
  it('skips a line you already recorded by hand (same amount within 3 days)', () => {
    const S = mk({ moves: [spend('2026-10-11', 64.2)] });
    const { rows } = prepImport(S, [
      { date: '2026-10-13', amount: -64.2, desc: 'WOOLWORTHS 1234' },
      { date: '2026-10-13', amount: -18.99, desc: 'NETFLIX' },
    ]);
    expect(rows.find(r => r.amount === -64.2)).toMatchObject({ dupe: true, type: 'skip' });
    expect(rows.find(r => r.amount === -18.99).dupe).toBeUndefined();
  });
  it('does not treat it as a duplicate 4 days apart', () => {
    const S = mk({ moves: [spend('2026-10-09', 64.2)] });
    expect(prepImport(S, [{ date: '2026-10-13', amount: -64.2, desc: 'WOOLWORTHS 1234' }]).rows[0].dupe).toBeUndefined();
  });
});

describe('labels you teach it', () => {
  it('relabelling one row on the review screen moves the similar ones, and is remembered next time', () => {
    const S = mk();
    const lines = [
      { date: '2026-10-01', amount: -240, desc: 'Transfer to Board xx1180' },
      { date: '2026-10-08', amount: -240, desc: 'Transfer to Board xx1180' },
    ];
    const { rows } = prepImport(S, lines);
    pickRow(rows, 0, 'bill');
    expect(rows.map(r => r.type)).toEqual(['bill', 'bill']);
    importRows(S, rows);
    expect(S.rules).toEqual([{ key: rows[0].key, pos: false, type: 'bill', ref: null }]);
    expect(prepImport(S, [{ date: '2026-10-15', amount: -240, desc: 'Transfer to Board xx1180' }]).rows[0].type).toBe('bill');
  });
  it('relabelling an imported entry relabels everything like it', () => {
    const S = mk();
    importRows(S, prepImport(S, [
      { date: '2026-10-01', amount: -60, desc: 'Credit Card Payment' }, { date: '2026-10-08', amount: -60, desc: 'Credit Card Payment' },
      { date: '2026-10-09', amount: -20, desc: 'Something else' },
    ]).rows);
    const m = S.moves.find(x => x.note === 'Credit Card Payment');
    expect(similarTo(S, m).length).toBe(1);
    expect(relabel(S, m, 'saved')).toBe(2);
    expect(S.moves.filter(x => x.type === 'saved').map(x => x.amount)).toEqual([60, 60]);
  });
});

describe('balances', () => {
  it('an import never sets your balances; you are asked for them afterwards', () => {
    const S = mk({ debts: [debt({ id: 'card', name: 'Credit card', balance: 2000 })] });
    importRows(S, prepImport(S, commbank()).rows);
    expect(S.startSaved).toBe(0);
    expect(S.savedAsOf).toBe(null);
    expect(S.investedAsOf).toBe(null);
    expect(S.debts[0].balance).toBe(2000);
  });
  it('imported pays set your usual pay and how often you are paid', () => {
    const S = mk({ pay: 0 });
    importRows(S, prepImport(S, [
      { date: '2026-09-16', amount: 2000, desc: 'SALARY ACME' }, { date: '2026-09-23', amount: 2100, desc: 'SALARY ACME' },
      { date: '2026-09-30', amount: 2050, desc: 'SALARY ACME' },
    ]).rows);
    expect(S.pay).toBe(2050);
    expect(S.freq).toBe('week');
  });
  it('removing imported transactions keeps what you entered by hand', () => {
    const S = mk({ moves: [spend('2026-10-01', 10)] });
    importRows(S, prepImport(S, commbank()).rows);
    expect(dropImports(S)).toBe(5);
    expect(S.moves.length).toBe(1);
    expect(S.seen).toEqual([]);
  });
});
