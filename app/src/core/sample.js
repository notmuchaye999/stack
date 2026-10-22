// @ts-check
/* Sample data: a filled-in Stack to try in Test mode. */
import { uid, today, addDays } from './util.js';
import { blank } from './state.js';
import { stackPay, leftover, didAll, stackItems, restack } from './stacks.js';
import { touch } from './plans.js';
import { ensureRank, checkRank } from './rank.js';

/** @import { State } from './state.js' */

/** Three fortnights of a made-up person: bills, an everyday card, Afterpay and a tool loan, purchases to save for,
 *  two finished pays and the one they're in. @returns {State} */
export function sampleState() {
  const t = today(), d = (/** @type {number} */ n) => addDays(t, n), past = { date: d(-31), t: 0 };
  const S = Object.assign(blank(), { qs: true, sample: true, freq: /** @type {const} */ ('fortnight'), plan: 'custom', planV: 1, pct: { spend: 25, pot: 10, debt: 10, save: 15, invest: 40 },
    startSaved: 400, savedAsOf: past, startInvested: 1500, investedAsOf: past, walletV: 1, tagsV: 1, potV: 1, billV: 1, in4V: 1 });
  S.bills = [
    { id: uid(), name: 'Board', amount: 120, every: 'week' }, { id: uid(), name: 'Phone', amount: 45, every: 'month', due: d(6) },
    { id: uid(), name: 'Car insurance', amount: 95, every: 'month', due: d(11) }, { id: uid(), name: 'Rego', amount: 850, every: 'year', due: d(140) },
    { id: uid(), name: 'Streaming', amount: 19, every: 'month', due: d(3) },
  ];
  S.debts = [
    { id: uid(), name: 'Card', card: true, wallet: true, limit: 1000, balance: 420, rate: 0, min: 0, minAmt: 0, minEvery: 'month', due: null, od: false, free: true, until: null, lock: true, focus: true, asOf: past },
    { id: uid(), name: 'Afterpay', card: true, limit: 800, balance: 450, rate: 0, min: 150 * 26 / 12, minAmt: 150, minEvery: 'fortnight', due: null, od: false, free: true, until: null, lock: true, viaWallet: true, in4: true, asOf: past },
    { id: uid(), name: 'Snap-On', balance: 600, rate: 0, min: 100 * 26 / 12, minAmt: 100, minEvery: 'fortnight', due: null, od: false, free: false, until: null, asOf: past },
  ];
  S.buys = [{ id: uid(), name: 'Car parts', cost: 180 }, { id: uid(), name: 'Tools', cost: 250 }, { id: uid(), name: 'Impact driver', cost: 420 }];
  const spend = (/** @type {string} */ date, /** @type {number} */ amount, /** @type {string} */ note) => S.moves.push({ id: uid(), t: Date.now() + S.moves.length, date, amount, type: 'spend', note, src: 'manual' });
  // What the app does after "Mark all done": re-stack the pay you're in and place your rank. Redrawing takes a moment, so
  // everything recorded after it comes after your rank was placed (the pay day tally counts it); here the clock is let tick.
  const redraw = () => { touch(); restack(S); ensureRank(S); checkRank(S); const t = Date.now(); while (Date.now() <= t); };
  [[-28, 1385], [-14, 1420]].forEach(([o, amt]) => {
    const s = stackPay(S, amt, d(o), leftover(S, d(o)));
    didAll(S, s.id, true); redraw();
    [[1, 64, 'Fuel'], [3, 38, 'Food'], [6, 22, 'Takeaway'], [9, 71, 'Fuel'], [12, 45, 'Food']].forEach(([k, a, n]) => spend(d(o + /** @type {number} */ (k)), /** @type {number} */ (a), /** @type {string} */ (n)));
  });
  const s = stackPay(S, 1360, t, leftover(S, t)), top = stackItems(S, s).todos.find(i => i.load !== undefined);
  if (top) S.moves.push({ id: uid(), t: Date.now() + S.moves.length, date: t, amount: top.plan, type: 'debt', ref: top.ref, note: top.note, src: 'manual' });
  spend(t, 54, 'Fuel');
  return S;
}
