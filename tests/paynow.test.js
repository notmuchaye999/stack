import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { payNow } from '../app/src/core/paynow.js';
import { stackPay } from '../app/src/core/stacks.js';
import { monthly, payAcctBal } from '../app/src/core/balances.js';
import { moveRecs } from '../app/src/core/accounts.js';
import { mk, debt, bill } from './helpers/make.js';

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 14, 10)); });
afterEach(() => vi.useRealTimers());

// A $2,000 pay: $400 rent and a $100 card repayment are due; the plan splits the $1,500 left
// into $750 spending, $300 extra on the card, $150 into the Buffer and $300 invested.
const thisPay = () => {
  const S = mk({ pct: { spend: 50, pot: 0, debt: 20, save: 10, invest: 20 }, bills: [bill('Rent', 400, 'fortnight')],
    debts: [debt({ id: 'card', name: 'Card', balance: 2000, rate: 20, min: monthly(100, 'fortnight'), minAmt: 100, minEvery: 'fortnight' })] });
  const s = stackPay(S, 2000, '2026-10-14');
  return { S, s };
};
const sugs = N => Object.fromEntries(N.sugs.map(x => [x.key, x.amt]));

describe('this pay, as it stands', () => {
  it('free is what\'s in Pay after what\'s still due; the plan suggests where it goes', () => {
    const { S, s } = thisPay(), N = payNow(S, s);
    expect(N.dues.map(x => [x.label, x.amt])).toEqual([['Rent', 400], ['Card', 100]]);
    expect(N).toMatchObject({ cash: 2000, due: 500, free: 1500, short: 0 });
    expect(sugs(N)).toEqual({ 'sug:spend': 750, 'sug:d:card': 300, 'sug:buffer': 150, 'sug:inv': 300 });
  });
  it('whatever you\'ve done counts as done; only what\'s left gets split', () => {
    const { S, s } = thisPay();
    S.moves.push(...moveRecs(S, 'pay', 'inv', 300, '2026-10-14', 'Investing'));
    const N = payNow(S, s);
    expect(N).toMatchObject({ cash: 1700, free: 1200 });
    expect(sugs(N)).toEqual({ 'sug:spend': 750, 'sug:d:card': 300, 'sug:buffer': 150 });
    expect(N.done).toMatchObject([{ name: 'Invested', amt: 300 }]);
  });
  it('money parked in the Buffer past the plan covers what\'s still due before Pay has to', () => {
    const { S, s } = thisPay();
    S.moves.push(...moveRecs(S, 'pay', 'buffer', 200, '2026-10-14', 'Buffer'));
    const N = payNow(S, s), rent = N.dues.find(x => x.label === 'Rent');
    expect(rent).toMatchObject({ held: [['buffer', 50]], fromPay: 350 });
    expect(N).toMatchObject({ cash: 1800, due: 450, free: 1350 });
  });
  it('short when Pay can\'t cover what\'s still due', () => {
    const { S, s } = thisPay();
    S.payAcct = { start: 100, asOf: { date: '2026-10-14', t: Date.now() + 1 } };
    expect(payAcctBal(S)).toBe(100);
    expect(payNow(S, s)).toMatchObject({ free: 0, short: 400 });
  });
});
