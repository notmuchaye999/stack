// @ts-check
/* Due dates. Bills and repayments are planned on actual due dates: each pay sets aside what falls due before the next pay.
   Quarterly and yearly bills are saved up a little each pay so they don't land on one pay. */
import { addDays, parseISO, iso } from './util.js';
import { periodDays, perPay, monthly } from './balances.js';

/** @import { State, Debt, Every } from './state.js' */
/** @typedef {{ name: string, v: number, due?: string | null, every?: boolean, saving?: boolean, avg?: boolean }} BillDue
 *  One bill in a pay. every: comes out of every pay. saving: being saved up (quarterly/yearly). avg: no due date, so averaged. */

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
/** A debt's repayments due in [start, end): actual instalments if it has a due date, otherwise its average per pay.
 *  @param {State} S @param {Debt} d @param {string} start @param {string} end */
export const repayIn = (S, d, start, end) => d.due && needsDate(S, d.minEvery || 'month') ? dueIn(d.due, d.minEvery || 'month', start, end).length * (d.minAmt ?? d.min) : perPay(S, d.min);
