// @ts-check
/* Sample data, so you can see how Stack works before entering your own. */
import { uid, today, addDays } from './util.js';
import { blank } from './state.js';
import { readStatement } from './csv.js';
import { prepImport, signedAmt, tidy } from './categorize.js';
import { makeStack } from './stacks.js';

/** A made-up CommBank-style statement covering the last 6 weeks. */
export function sampleCSV() {
  const t = today(), rows = [
    [-40, 1385.20, 'Salary Acme Diesel Pty Ltd'], [-40, -300, 'Transfer To xx4821 Card top up'], [-40, -150, 'BNPL Repayment'],
    [-39, -60, 'Credit Card Payment'], [-38, -95, 'Direct Debit Car Insurance'], [-37, -100, 'Transfer to Savings xx9910'],
    [-35, -120, 'Transfer To xx4821 Card top up'], [-33, -45, 'Direct Debit Phone Co'], [-30, -80, 'Transfer To xx4821 Card top up'],
    [-26, 1385.20, 'Salary Acme Diesel Pty Ltd'], [-26, -300, 'Transfer To xx4821 Card top up'], [-26, -150, 'BNPL Repayment'],
    [-25, -260, 'Transfer To xx4821 Card top up'], [-24, -240, 'Transfer to Board xx1180'], [-21, -50, 'Transfer to Invest xx5531'],
    [-19, -18.99, 'Direct Debit Streaming'], [-16, -60, 'Transfer To xx4821 Card top up'], [-12, 1385.20, 'Salary Acme Diesel Pty Ltd'],
    [-12, -300, 'Transfer To xx4821 Card top up'], [-12, -150, 'BNPL Repayment'], [-11, -60, 'Credit Card Payment'],
    [-10, -240, 'Transfer to Board xx1180'], [-8, -60, 'Transfer To xx4821 Card top up'], [-5, 20, 'Fast Transfer From J Citizen'],
    [-3, -50, 'Transfer To xx4821 Card top up'],
  ];
  let bal = -212.4;
  return rows.map(([o, a, d]) => { bal += /** @type {number} */ (a); const [y, m, dd] = addDays(t, /** @type {number} */ (o)).split('-'); return `${dd}/${m}/${y},"${+a > 0 ? '+' : ''}${(+a).toFixed(2)}","${d}","${bal >= 0 ? '+' : ''}${bal.toFixed(2)}"`; }).reverse().join('\n');
}

/** A whole made-up person: bills, debts, planned buys, the sample statement imported, and the latest pay stacked. */
export function sampleState() {
  const S = blank();
  const t = today(), past = { date: addDays(t, -45), t: 0 };
  Object.assign(S, { pay: 1385.2, freq: 'fortnight', sample: true, pct: { spend: 25, debt: 70, save: 0, invest: 5 } });
  S.bills = [
    { id: uid(), name: 'Board', amount: 120, every: 'week' }, { id: uid(), name: 'Phone', amount: 45, every: 'month' },
    { id: uid(), name: 'Car insurance', amount: 95, every: 'month' }, { id: uid(), name: 'Car rego', amount: 850, every: 'year' },
    { id: uid(), name: 'Streaming', amount: 19, every: 'month' },
  ];
  S.debts = [
    { id: uid(), name: 'Everyday account', balance: 1240, rate: 0, min: 0, od: true, asOf: past },
    { id: uid(), name: 'Credit card', balance: 2400, rate: 19.99, min: 60, od: false, asOf: past },
    { id: uid(), name: 'BNPL', balance: 900, rate: 0, min: 300, od: false, asOf: past },
  ];
  S.debts[1].free = true; S.debts[1].until = addDays(t, 120);
  S.buys = [{ id: uid(), name: 'Tools', cost: 250, by: addDays(t, 60) }, { id: uid(), name: 'Car parts', cost: 180, by: addDays(t, 30) }];
  const { rows } = prepImport(S, readStatement(sampleCSV()));
  let tt = 1;
  rows.reverse().forEach(r => { if (r.type !== 'skip') S.moves.push({ id: uid(), t: tt++, date: r.date, amount: signedAmt(r.type, r.amount), bank: r.amount, key: r.key, type: r.type, ref: r.ref, note: tidy(r.desc), src: 'import' }); });
  const lp = S.moves.filter(m => m.type === 'pay').sort((a, b) => b.date.localeCompare(a.date))[0];
  if (lp) { const s = makeStack(S, lp.amount, lp.date); S.stacks.push(s); lp.stack = s.id; }
  return S;
}
