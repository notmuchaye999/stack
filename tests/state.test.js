import { describe, it, expect } from 'vitest';
import { blank, makeBackup, readBackup, hasData, fromSaved } from '../app/src/core/state.js';
import { normalize } from '../app/src/core/migrate.js';

const someData = () => {
  const S = blank();
  S.moves.push({ id: 'a', t: 1, date: '2026-10-01', amount: 2000, type: 'pay', src: 'manual' });
  S.bills.push({ id: 'b', name: 'Phone', amount: 45, every: 'month' });
  return S;
};

describe('backups', () => {
  it('a backup file reads back as the same data, with what\'s in it', () => {
    const S = someData(), r = readBackup(makeBackup(S, '2026-10-14'));
    expect(r.ok).toBe(true);
    expect(r.at).toBe('2026-10-14');
    expect(r.data).toEqual(Object.assign({}, S, { lastBackup: '2026-10-14' }));
    expect(r.counts).toEqual({ bills: 1, debts: 0, buys: 0, pays: 1 });
  });
  it('also takes a plain copy of the data, the way this app\'s old Export copied it', () => {
    const r = readBackup('  ' + JSON.stringify(someData()) + '\n');
    expect(r.ok).toBe(true);
    expect(r.counts.pays).toBe(1);
  });
  it('turns down anything else', () => {
    for (const t of ['hello', '{"foo":1}', '[]', '{"app":"stack","data":{"v":3}}', '']) expect(readBackup(t).ok, t).toBe(false);
  });
});

describe('saved data', () => {
  it('knows when anything has been entered', () => {
    expect(hasData(blank())).toBe(false);
    expect(hasData(someData())).toBe(true);
  });
  it('fills in lists older saves were missing, and brings them up to date', () => {
    const o = blank(); delete o.buys; delete o.pct.pot;
    const S = normalize(fromSaved(o));
    expect(S.buys).toEqual([]);
    expect(S.pct.pot).toBe(0);
    expect(S).toMatchObject({ walletV: 1, tagsV: 1, planV: 1, potV: 1, billV: 1, in4V: 1 });
    expect(fromSaved({ v: 3 })).toBe(null);
  });
  it('old bank-import lines that were never money are dropped; the credit called Card becomes the everyday card', () => {
    const S = Object.assign(blank(), {
      debts: [{ id: 'c', name: 'Card', card: true, limit: 1000, balance: 0, rate: 0, min: 0, asOf: null }, { id: 'a', name: 'Afterpay', card: true, limit: 800, balance: 0, rate: 0, min: 0, asOf: null }],
      moves: [{ id: 's', t: 1, date: '2026-10-01', amount: 5, type: 'skip', src: 'import' }, { id: 'b', t: 2, date: '2026-10-01', amount: 45, type: 'bill', src: 'import' }],
    });
    delete S.pct.pot;
    normalize(S);
    expect(S.moves).toEqual([]);
    expect(S.debts[0].wallet).toBe(true);
    expect(S.debts[1]).toMatchObject({ viaWallet: true, in4: true });
  });
});
