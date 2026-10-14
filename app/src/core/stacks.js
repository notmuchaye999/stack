// @ts-check
/* Stacking a pay: give every dollar of one pay a job, then track what you actually did with it. */
import { BK, uid, today } from './util.js';
import { ppy, debtNow, openBuys, buyLeft, buyPerPay, savedNow, debtName } from './balances.js';
import { costs, allocate } from './projection.js';

/** @import { State, PayStack, Move, MoveType } from './state.js' */

/**
 * One pay's plan, in this order: one period's bills → minimum repayments → planned buys → the rest split by your %,
 * with rollover (see allocate). short = how much the pay doesn't cover bills and minimums. spare = left without a job.
 * @param {State} S @param {number} amount @param {string} date @returns {PayStack}
 */
export function makeStack(S, amount, date) {
  const C = costs(S), L = C.L, f = 12 / ppy(S), pc = L.pct;
  const debts = S.debts.map(d => { const bal = debtNow(S, d); return { id: d.id, bal, rate: d.rate, min: Math.min(bal, d.min * f), od: !!d.od, free: !!d.free, until: d.until, focus: !!d.focus }; });
  const bills = L.billsM * f, mins = debts.reduce((s, d) => s + d.min, 0);
  const bl = openBuys(S).map(b => ({ id: b.id, name: b.name, v: Math.min(buyLeft(S, b), buyPerPay(S, b, date)) })).filter(b => b.v > 0.5);
  const buys = Math.min(Math.max(0, amount - bills - mins), bl.reduce((s, b) => s + b.v, 0));
  const rem = amount - bills - mins - buys;
  const sc = Math.max(100, BK.reduce((s, k) => s + pc[k], 0));
  /** @type {Record<'spend' | 'debt' | 'save' | 'invest', number>} */
  const sh = { spend: 0, debt: 0, save: 0, invest: 0 };
  BK.forEach(k => { sh[k] = Math.max(0, rem) * pc[k] / sc; });
  const a = allocate(sh, debts, savedNow(S), C.emT);
  /** @type {Record<string, number>} */
  const dp = {};
  debts.forEach(d => { const v = (a.mins[d.id] || 0) + (a.extra[d.id] || 0); if (v > 0.005) dp[d.id] = v; });
  const used = bills + buys + Object.values(dp).reduce((s, v) => s + v, 0) + sh.spend + a.save + a.invest;
  return { id: uid(), t: Date.now(), date, amount, plan: { bills, buys, buyNames: bl.map(b => b.name), spend: sh.spend, debts: dp, save: a.save, invest: a.invest },
    short: rem < 0 ? -rem : 0, spare: Math.max(0, amount - used) };
}

/** The most recently stacked pay. @param {State} S @returns {PayStack | undefined} */
export const latestStack = S => [...S.stacks].sort((a, b) => b.date.localeCompare(a.date) || b.t - a.t)[0];

/**
 * @typedef {{ key: string, type: MoveType, ref?: string, label: string, note: string, plan: number, done: number, state: 'done' | 'part' | 'todo' }} Todo
 */

/**
 * Plan vs what you did, for one stacked pay (the current one or a past one). Entries dated inside that pay count towards it.
 * @param {State} S @param {PayStack} stk
 */
export function stackItems(S, stk) {
  const next = S.stacks.filter(s => s.id !== stk.id && (s.date > stk.date || (s.date === stk.date && s.t > stk.t)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.t - b.t)[0];
  const inP = (/** @type {Move} */ m) => m.date >= stk.date && (!next || m.date < next.date);
  const got = (/** @type {string} */ type, /** @type {string} [ref] */ ref) => S.moves.reduce((s, m) => m.type === type && (!ref || m.ref === ref) && inP(m) ? s + m.amount : s, 0);
  /** @type {Todo[]} */
  const todos = [];
  for (const [id, v] of Object.entries(stk.plan.debts)) if (v > 0.5) todos.push({ key: 'debt:' + id, type: 'debt', ref: id, label: `Pay ${debtName(S, id)}`, note: debtName(S, id), plan: v, done: 0, state: 'todo' });
  if (stk.plan.save > 0.5) todos.push({ key: 'save', type: 'saved', label: 'Move to savings', note: 'Savings', plan: stk.plan.save, done: 0, state: 'todo' });
  if (stk.plan.invest > 0.5) todos.push({ key: 'invest', type: 'invested', label: 'Invest', note: 'Investing', plan: stk.plan.invest, done: 0, state: 'todo' });
  todos.forEach(i => { i.done = got(i.type, i.ref); i.state = i.done >= i.plan - 0.5 ? 'done' : i.done > 0.5 ? 'part' : 'todo'; });
  // Planned buys come out of what was set aside for them, not the card budget.
  const spent = S.moves.reduce((s, m) => m.type === 'spend' && !m.buy && inP(m) ? s + m.amount : s, 0);
  const buysSpent = S.moves.reduce((s, m) => m.type === 'spend' && m.buy && inP(m) ? s + m.amount : s, 0);
  return { todos, spent, buysSpent, inP, doneN: todos.filter(i => i.state === 'done').length, complete: todos.every(i => i.state === 'done') };
}

/**
 * "Did all the transfers as planned": records whatever's left of each transfer. For a past pay, dated on that pay.
 * Returns how many entries were added.
 * @param {State} S @param {string} stkId @param {boolean} past
 */
export function didAll(S, stkId, past) {
  const stk = S.stacks.find(s => s.id === stkId); if (!stk) return 0;
  const date = past ? stk.date : today();
  let n = 0;
  stackItems(S, stk).todos.forEach(i => { const left = i.plan - i.done; if (left > 0.5) S.moves.push({ id: uid(), t: Date.now() + n++, date, amount: Math.round(left * 100) / 100, type: i.type, ref: i.ref || null, note: i.note, src: 'manual' }); });
  return n;
}

/**
 * Stack a new pay: records the pay and its plan. Your first pay becomes your usual pay.
 * @param {State} S @param {number} amount @param {string} date @returns {{ stack: PayStack, first: boolean }}
 */
export function stackPay(S, amount, date) {
  const first = !(S.pay > 0);
  if (first) S.pay = amount;
  const s = makeStack(S, amount, date);
  S.stacks.push(s);
  S.moves.push({ id: uid(), t: Date.now(), date, amount, type: 'pay', note: 'Pay', src: 'stack', stack: s.id });
  return { stack: s, first };
}
