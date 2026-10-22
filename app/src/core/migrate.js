// @ts-check
/* Bringing saved data up to date. Runs on every load and restore, so data saved by an older version (of the prototype or
   of this app) works the same as new data. Each step runs once, and is marked done in the data. */
import { uid, today, addDays, r5 } from './util.js';
import { debtNow, potTotal, sumPct } from './balances.js';
import { everyPay, needsDate, lastOn, instDates } from './due.js';
import { latestStack } from './stacks.js';

/** @import { State, Move } from './state.js' */

/** @param {State} S */
export function normalize(S) {
  S.buys = S.buys || []; delete S.payIn;
  S.moves.forEach(m => { if (m.note === 'From buffer') m.note = 'From Buffer'; });
  // Rows from the old bank import that were never money (ignored lines, bill lines) go.
  const oldBill = (/** @type {Move} */ m) => m.type === 'bill' && !m.ref;
  if (S.moves.some(m => /** @type {string} */ (m.type) === 'skip' || oldBill(m))) S.moves = S.moves.filter(m => /** @type {string} */ (m.type) !== 'skip' && !oldBill(m));
  // Once: the credit called Card is the everyday card, and Afterpay gets paid from it.
  if (!S.walletV) {
    const c = S.debts.find(d => d.card && /card/i.test(d.name));
    if (c && !S.debts.some(d => d.wallet)) { c.wallet = true; S.debts.forEach(d => { if (d !== c && /afterpay/i.test(d.name)) d.viaWallet = true; }); }
    S.walletV = 1;
  }
  // XP and the debt level are gone: rank replaced them.
  ['lvlV', 'lvlSeen', 'lvlBest', 'dlSeen', 'xpStart'].forEach(k => { delete S[k]; });
  // Once: a one-off amount due by a date (like a fine) becomes Urgent; then the card takes Focus if nothing else has it.
  if (!S.tagsV) {
    S.debts.forEach(d => { if (d.due && (d.minAmt || 0) >= d.balance - 0.5 && d.balance > 0) { d.urgent = true; d.focus = false; d.set = false; } });
    if (!S.debts.some(d => d.focus)) { const c = S.debts.find(d => d.card && !d.set && debtNow(S, d) > 0.005); if (c) c.focus = true; }
    S.tagsV = 1;
  }
  // Once: Savings becomes its own slice of the split. What went into Savings last pay comes off spending, so nothing jumps.
  if (S.pct.pot === undefined) {
    S.pct.pot = 0;
    const lt = latestStack(S), rem = lt && lt.plan.rem, pt = lt ? potTotal(lt) : 0;
    if (rem && rem > 0 && pt > 0.5 && sumPct(S) > 0) { const v = Math.min(S.pct.spend, r5(pt / rem * 100)); S.pct.pot = v; S.pct.spend -= v; }
  }
  // Once: plans. Your split becomes the Custom plan, so nothing changes until you pick another. A pay stacked on another
  // plan just for itself keeps the split it got.
  if (!S.planV) {
    if (!S.plan && sumPct(S) > 0) S.plan = 'custom';
    S.stacks.forEach(k => { if (k.pk && k.pk !== 'yours' && k.pct) k.one = true; else k.pk = 'custom'; });
    S.planV = 1;
  }
  // Once: a ticked "Move to Savings" becomes a real entry. It keeps the pay's time, so balances don't change.
  if (!S.potV) {
    S.stacks.forEach(k => { const o = /** @type {any} */ (k); if (o.potsDone) { const v = Math.round(potTotal(k) * 100) / 100; if (v > 0.5) S.moves.push({ id: uid(), t: k.t, date: k.date, amount: v, type: 'pot', note: 'Savings', src: 'manual' }); } delete o.potsDone; });
    S.potV = 1;
  }
  // Once: bill ticks start today. Due dates before today count as paid; this pay's every-pay bills too if it landed before today.
  if (!S.billV) {
    const lt = latestStack(S), t = today();
    S.bills.forEach(b => {
      if (everyPay(S, b.every)) { if (lt && lt.date < t) b.paidTo = lt.date; }
      else if (b.due && needsDate(S, b.every)) { const l = lastOn(b.due, b.every, addDays(t, -1)); if (l) b.paidTo = l; }
    });
    S.billV = 1;
  }
  // Once: Afterpay is pay in 4.
  if (!S.in4V) { S.debts.forEach(d => { if (d.card && !d.wallet && /afterpay/i.test(d.name)) d.in4 = true; }); S.in4V = 1; }
  // Pay-in-4 schedules that have finished drop off.
  S.debts.forEach(d => { if (d.inst) d.inst = d.inst.filter(x => /** @type {string} */ (instDates(x).at(-1)) >= addDays(today(), -14)); });
  return S;
}
