// @ts-check
/* Due dates. Bills and repayments are planned on actual due dates: each pay sets aside what falls due before the next pay.
   Quarterly and yearly bills are saved up a little each pay so they don't land on one pay. Then bill ticks: a record that
   you paid each one. */
import { addDays, parseISO, iso, today, uid } from './util.js';
import { periodDays, perPay, monthly, debtNow } from './balances.js';
import { latestStack } from './stacks.js';

/** @import { State, Debt, Bill, Every, Inst, BillDue, LateBill } from './state.js' */

/** Short labels for how often: '/wk', '/fn', '/mo' … */
export const UNIT = { week: '/wk', fortnight: '/fn', month: '/mo', quarter: '/qtr', year: '/yr' };
/** @type {Record<Every, { d?: number, m?: number }>} */
const STEP = { week: { d: 7 }, fortnight: { d: 14 }, month: { m: 1 }, quarter: { m: 3 }, year: { m: 12 } };

/** The next due date after d. Monthly dates keep the original day where the month has it (31 Jan → 28 Feb → 31 Mar).
 *  @param {string} d @param {Every} every @param {string} anchor the first due date */
export function stepDate(d, every, anchor) {
  const st = STEP[every]; if (st.d) return addDays(d, st.d);
  const x = parseISO(d), day = parseISO(anchor).getDate(), y = x.getFullYear(), m = x.getMonth() + /** @type {number} */ (st.m);
  return iso(new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate())));
}
/** The first due date on or after from. @param {string} due @param {Every} every @param {string} from */
export function nextOn(due, every, from) { let d = due, g = 0; while (d < from && g++ < 2000) d = stepDate(d, every, due); return d; }
/** Every due date in [start, end). @param {string} due @param {Every} every @param {string} start @param {string} end */
export function dueIn(due, every, start, end) { const out = []; let d = nextOn(due, every, start), g = 0; while (d < end && g++ < 60) { out.push(d); d = stepDate(d, every, due); } return out; }
/** @param {{ every: Every }} b */
export const saveUp = b => b.every === 'quarter' || b.every === 'year';
/* Weekly/fortnightly amounts land the same way every pay, so no date is needed. Only monthly and longer ones need a due date. */
/** @param {State} S @param {Every} e */
export const everyPay = (S, e) => !!STEP[e].d && periodDays(S) % /** @type {number} */ (STEP[e].d) === 0;
/** @param {State} S @param {Every} e */
export const needsDate = (S, e) => !everyPay(S, e);

/** Bills that fell due before a pay, aren't ticked as paid, and no earlier pay held money for: that pay pays them.
 *  @param {State} S @param {string} date @param {string} [selfId] @returns {LateBill[]} */
export function lateBills(S, date, selfId) {
  /** @type {LateBill[]} */
  const out = [];
  const held = (/** @type {string} */ d, /** @type {string} */ id) => S.stacks.some(s => s.id !== selfId && ((s.date <= d && d < addDays(s.date, periodDays(S))) || (s.late || []).some(x => x.id === id && x.d === d)));
  S.bills.forEach(b => {
    if (!b.due || !needsDate(S, b.every) || saveUp(b)) return;
    const pt = billPaidTo(S, b);
    for (let d = nextOn(b.due, b.every, pt ? addDays(pt, 1) : b.due), g = 0; d < date && g++ < 24; d = stepDate(d, b.every, b.due))
      if (!held(d, b.id)) out.push({ id: b.id, name: b.name, d, v: b.amount });
  });
  return out;
}
/** Bills to set aside from a pay covering [start, end). @param {State} S @param {string} start @param {string} end @returns {BillDue[]} */
export function billsFor(S, start, end) {
  /** @type {BillDue[]} */
  const out = [];
  S.bills.forEach(b => {
    if (everyPay(S, b.every)) { out.push({ name: b.name, v: perPay(S, monthly(b.amount, b.every)), every: true }); return; }
    if (!b.due || saveUp(b)) { out.push({ name: b.name, v: perPay(S, monthly(b.amount, b.every)), due: b.due ? nextOn(b.due, b.every, start) : null, saving: !!b.due && saveUp(b), avg: !b.due }); return; }
    dueIn(b.due, b.every, start, end).forEach(d => out.push({ name: b.name, v: b.amount, due: d }));
  });
  return out;
}

/* A debt whose repayment is its whole balance is a one-off, like a fine. An urgent one-off past its date is overdue: it
   stops being a fixed repayment and takes everything but your spending money until it's paid, the rest carrying over. */
/** @param {State} S @param {Debt} d */
export const oneOff = (S, d) => (d.minAmt ?? d.min ?? 0) >= debtNow(S, d) - 0.5;
/** @param {State} S @param {Debt} d @param {string} [on] */
export const overdue = (S, d, on = today()) => !!d.urgent && !!d.due && d.due < on && oneOff(S, d) && debtNow(S, d) > 0.5;
/** A debt's repayments due in [start, end): actual instalments if it has a due date, otherwise its average per pay.
 *  @param {State} S @param {Debt} d @param {string} start @param {string} end */
export const repayBase = (S, d, start, end) => overdue(S, d, start) ? 0 : d.due && needsDate(S, d.minEvery || 'month') ? dueIn(d.due, d.minEvery || 'month', start, end).length * /** @type {number} */ (d.minAmt ?? d.min) : perPay(S, d.min);
/* Pay in 4 (Afterpay): each purchase's other 3 payments land a fortnight apart. The repayment you entered covers
   anything owing beyond them. */
/** @param {Inst} x */
export const instDates = x => Array.from({ length: x.n }, (_, k) => addDays(x.first, 14 * k));
/** @param {{ inst?: Inst[] }} d @param {string} start @param {string} end */
export const instIn = (d, start, end) => (d.inst || []).reduce((s, x) => s + instDates(x).filter(t => t >= start && t < end).length * x.amt, 0);
/** @param {{ inst?: Inst[] }} d @param {string} from */
export const instLeft = (d, from) => (d.inst || []).filter(x => addDays(x.first, -14) < from).reduce((s, x) => s + instDates(x).filter(t => t >= from).length * x.amt, 0);
/** @param {State} S @param {Debt} d @param {string} start @param {string} end @param {number} [bal] */
export const repayIn = (S, d, start, end, bal) => { const b = repayBase(S, d, start, end); return d.inst && d.inst.length ? instIn(d, start, end) + Math.min(b, Math.max(0, (bal ?? debtNow(S, d)) - instLeft(d, start))) : b; };

/* ---------- bill ticks ----------
   Ticking a bill is a record that you paid it. Nothing moves: its money was set aside when the pay was stacked.
   A dated bill ticks off each due date, an every-pay bill each pay. Direct debits tick themselves on the day.
   paidTo: every due date up to it is paid. */
/** The last due date on or before t. @param {string | null | undefined} due @param {Every} every @param {string} t */
export function lastOn(due, every, t) { if (!due || due > t) return null; let d = due, p = due, g = 0; while (d <= t && g++ < 2000) { p = d; d = stepDate(d, every, due); } return p; }
/** @param {State} S @param {Bill} b */
export const billPaidTo = (S, b) => { let p = b.paidTo || null; if (b.auto && b.due && needsDate(S, b.every)) { const l = lastOn(b.due, b.every, today()); if (l && (!p || l > p)) p = l; } return p; };
/** @param {State} S @param {Bill} b */
export const billAmt = (S, b) => everyPay(S, b.every) ? perPay(S, monthly(b.amount, b.every)) : b.amount;
/**
 * @typedef {{ b: Bill, date: string, every?: boolean, paid: boolean, late: boolean, auto: boolean, next?: string, amount: number }} BillTick
 */
/** A bill's tick on the Bills screen: paid if this pay covered it, otherwise the first due date not ticked.
 *  @param {State} S @param {Bill} b @returns {BillTick | null} */
export function billNow(S, b) {
  const lt = latestStack(S), t = today();
  if (everyPay(S, b.every)) { if (!lt) return null; return { b, date: lt.date, every: true, paid: !!b.auto || (b.paidTo || '') >= lt.date, late: false, auto: !!b.auto, amount: billAmt(S, b) }; }
  if (!b.due || !needsDate(S, b.every)) return null;
  const pt = billPaidTo(S, b), cur = nextOn(b.due, b.every, pt ? addDays(pt, 1) : b.due), lp = pt ? lastOn(b.due, b.every, pt) : null;
  if (cur >= t && lp && lp >= (lt ? lt.date : t)) return { b, date: lp, paid: true, late: false, auto: !!b.auto, next: cur, amount: b.amount };
  return { b, date: cur, paid: false, late: cur < t, auto: !!b.auto, amount: b.amount };
}
/** Bills for the pay you're in: every due date before the next pay, and any earlier one not ticked yet. @param {State} S @returns {BillTick[]} */
export function billsDueNow(S) {
  const lt = latestStack(S); if (!lt) return [];
  const start = lt.date, end = addDays(start, periodDays(S)), t = today();
  /** @type {BillTick[]} */
  const out = [];
  S.bills.forEach(b => {
    if (everyPay(S, b.every)) { out.push(/** @type {BillTick} */ (billNow(S, b))); return; }
    if (!b.due || !needsDate(S, b.every)) return;
    const pt = billPaidTo(S, b), first = nextOn(b.due, b.every, pt ? addDays(pt, 1) : b.due), ds = dueIn(b.due, b.every, start, end);
    if (first < start) ds.unshift(first);
    (lt.late || []).forEach(l => { if (l.id === b.id && !ds.includes(l.d)) ds.unshift(l.d); });
    ds.forEach(d => { const paid = !!pt && d <= pt; out.push({ b, date: d, paid, late: !paid && d < t, auto: !!b.auto, amount: b.amount }); });
  });
  return out.sort((x, y) => x.date.localeCompare(y.date));
}
/** Tick or untick one due date. Direct debits tick themselves. The payment is recorded too, so the pay account it came out
 *  of goes down; unticking takes it back off. true = ticked, false = unticked, null = not tickable.
 *  @param {State} S @param {string} id @param {string} d */
export function tickBill(S, id, d) {
  const b = S.bills.find(x => x.id === id); if (!b || b.auto) return null;
  if ((b.paidTo || '') >= d) { b.paidTo = addDays(d, -1); S.moves = S.moves.filter(m => !(m.type === 'bill' && m.ref === id && /** @type {string} */ (m.d) >= d)); return false; }
  b.paidTo = d; S.moves.push({ id: uid(), t: Date.now(), date: today(), amount: b.amount, type: 'bill', ref: id, d, note: b.name, src: 'manual' }); return true;
}
