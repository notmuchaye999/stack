// A handful of realistic money situations, built from the prototype's own sample data so the
// parity tests compare old and new code on exactly the same numbers.
import { addDays, today } from '../../app/src/core/util.js';

const clone = o => JSON.parse(JSON.stringify(o));
let n = 0;
const id = () => 'x' + (++n);

export function buildStates(P) {
  P.run('loadSample()');
  const sample = P.getState();
  const t = today();
  const out = { sample };

  out.blank = P.run('blank()');

  // Bills, debts and a pay amount set, but no pays entered yet: no countdown.
  out.noPays = Object.assign(clone(sample), { moves: [], stacks: [] });

  // Spending way past the card budget in the pay you're in.
  out.overspend = clone(sample);
  out.overspend.moves.push({ id: id(), t: 99, date: addDays(t, -1), amount: 2500, type: 'spend', note: 'Big night', src: 'manual' });

  // You picked the BNPL as the debt to clear first.
  out.focus = clone(sample);
  out.focus.debts.find(d => d.name === 'BNPL').focus = true;

  // No debt, some savings and investments, steady pays: stages 4 and 5.
  const steady = Object.assign(clone(sample), {
    debts: [], buys: [], stacks: [], moves: [], pct: { spend: 30, debt: 0, save: 20, invest: 50 },
    startSaved: 4000, startInvested: 15000, savedAsOf: { date: addDays(t, -60), t: 0 }, investedAsOf: { date: addDays(t, -60), t: 0 },
  });
  for (let i = 4; i >= 0; i--) steady.moves.push({ id: id(), t: 10 + i, date: addDays(t, -14 * i - 2), amount: 2600, type: 'pay', note: 'Pay', src: 'manual' });
  steady.moves.push({ id: id(), t: 50, date: addDays(t, -20), amount: 300, type: 'spend', note: 'Groceries', src: 'manual' });
  steady.moves.push({ id: id(), t: 51, date: addDays(t, -10), amount: 500, type: 'invested', note: 'ETF', src: 'manual' });
  out.stage4 = steady;
  out.stage5 = Object.assign(clone(steady), { startSaved: 30000 });

  // Weekly pays and a monthly repayment, with an interest-free debt whose free period has ended.
  out.weekly = clone(sample);
  out.weekly.freq = 'week';
  out.weekly.debts.push({ id: id(), name: 'Old Afterpay', balance: 400, rate: 22, min: 40, minAmt: 40, minEvery: 'month', free: true, until: addDays(t, -5), asOf: { date: addDays(t, -30), t: 0 } });

  // Due dates: a monthly bill due in 5 days, one due after the next pay, a yearly bill being saved up,
  // a weekly bill, and repayments with due dates (monthly card, fortnightly BNPL).
  out.dueDates = clone(sample);
  const byName = n => out.dueDates.bills.find(b => b.name === n);
  byName('Phone').due = addDays(t, 5);
  byName('Car insurance').due = addDays(t, 20);
  byName('Car rego').due = addDays(t, 100);
  out.dueDates.debts.find(d => d.name === 'Credit card').due = addDays(t, 3);
  Object.assign(out.dueDates.debts.find(d => d.name === 'BNPL'), { minAmt: 150, minEvery: 'fortnight', due: addDays(t, -2) });
  out.dueDatesWeekly = Object.assign(clone(out.dueDates), { freq: 'week' });
  out.dueDatesWeekly.bills.push({ id: id(), name: 'Gym', amount: 30, every: 'fortnight', due: addDays(t, 4) });
  return out;
}
