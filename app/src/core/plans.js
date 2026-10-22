// @ts-check
/* ---------- plans ----------
   A plan is a rule, worked out again on every pay from where you are.
   FI: nothing to spend, no Savings, no Buffer; debt and investing set for the fastest FI. The ceiling.
   Debt-free: your usual spending, everything else on debt. With nothing left to put extra on, it's Balanced.
   Balanced: your usual spending; the Buffer fills first, then ⅔ investing and ⅓ Savings.
   Tight: spending like your 3 cheapest pays; the Buffer fills first, the rest the fastest way to FI.
   Custom: your own split.
   Usual spending is the average Spending habit shows, in dollars, so a bigger pay goes further instead of being spent.
   Until you've tracked a pay, Debt-free and Balanced use Custom's spending and Tight waits.
   Each is judged as if every pay went like it, so its spending sets the FI number too. */
import { BK } from './util.js';
import { debtPlan, customPct } from './balances.js';
import { project } from './projection.js';
import { latestStack, makeStack, carriedOf, habit, pvMore } from './stacks.js';

/** @import { State, Split, PayStack } from './state.js' */
/**
 * @typedef {{ pct: Split, until?: 'debt' | 'buf' }} Phase  A phase lasts until its job is done (debt: nothing left to put extra on; buf: Buffer full).
 * @typedef {{ pay: (rem: number, need: number) => Split, phases: (rem: number) => Phase[] }} Spec
 *   What a plan does with one pay (rem: what's left after bills and repayments; need: what the Buffer still needs),
 *   and its phases for the dates. Shares are percent of what's left.
 */

export const PLANS = ['fi', 'debt', 'tight', 'custom'];
/** @type {Record<string, string>} */
export const PLAN_N = { fi: 'FI', debt: 'Debt-free', bal: 'Balanced', tight: 'Tight', custom: 'Custom', yours: 'Custom', lean: 'Lean' };
/** @type {Record<string, string>} */
export const PLAN_RULE = { fi: 'Nothing to spend. Every dollar to FI.', debt: 'Usual spending. The rest on debt, then Balanced.',
  bal: 'Usual spending. Buffer first, then ⅔ investing, ⅓ Savings.', tight: 'Spend like your 3 cheapest pays. Buffer first, then FI.', custom: 'Your own split.' };
/** Debt you can put extra on. Fixed repayments go at their own pace. @param {State} S */
export const owes = S => S.debts.some(d => debtPlan(S, d) > 0.005 && !d.set);
/** Debt-free with nothing left to put extra on is Balanced. @param {State} S @param {string | undefined} k */
export const ruleOf = (S, k) => k === 'yours' ? 'custom' : k === 'debt' && !owes(S) ? 'bal' : /** @type {string} */ (k);
/** @param {State} S @param {string} k */
export const planName = (S, k) => PLAN_N[ruleOf(S, k)] || 'Custom';
/** @param {State} S */
export const myPlan = S => S.plan || 'custom';

/* Worked-out plans are kept until something changes. touch() says something did (every save and redraw). */
let REV = 0;
export const touch = () => { REV++; };
/** @type {WeakMap<State, Map<string, { f: string, v: any }>>} */
const MEMO = new WeakMap();
/** @param {State} S */
const memoKey = S => `${REV}|${S.moves.length}|${S.stacks.length}|${S.debts.length}|${S.bills.length}`;
/** @template T @param {State} S @param {string} k @param {() => T} fn @returns {T} */
const memo = (S, k, fn) => {
  let m = MEMO.get(S); if (!m) MEMO.set(S, m = new Map());
  const f = memoKey(S), c = m.get(k); if (c && c.f === f) return c.v;
  const v = fn(); m.set(k, { f, v }); return v;
};

/** Spending a pay, in dollars: usual is the average Spending habit shows; tight is your 3 cheapest of those pays. @param {State} S */
export function spendHist(S) {
  const h = habit(S); if (!h) return null;
  const c = h.ps.map(o => o.I.spent).sort((a, b) => a - b).slice(0, 3);
  return { usual: h.spent, tight: c.reduce((a, x) => a + x, 0) / c.length };
}
/** Run fn with the pay you're in stacked again under the plan in force, then put it back. @template T @param {State} S @param {() => T} fn @returns {T} */
export function withRestacked(S, fn) {
  const s = latestStack(S); if (!s) return fn();
  const old = { plan: s.plan, short: s.short, spare: s.spare }, n = makeStack(S, s.amount, s.date, s.id, s.carry || 0, undefined, carriedOf(s));
  Object.assign(s, { plan: n.plan, short: n.short, spare: n.spare });
  try { return fn(); } finally { Object.assign(s, old); }
}
/** A plan that's always the same split. @param {Split} p @returns {Spec} */
export const fixedSpec = p => ({ pay: () => Object.assign({}, p), phases: () => [{ pct: p }] });
/** @type {Spec | null} */
let FORCE = null;
/** Work something out as if this plan were yours. @template T @param {Spec} sp @param {() => T} fn @returns {T} */
export const withSpec = (sp, fn) => { const o = FORCE; FORCE = sp; try { return fn(); } finally { FORCE = o; } };
/** @template T @param {Split} p @param {() => T} fn @returns {T} */
export const withPct = (p, fn) => withSpec(fixedSpec(p), fn);
/** The plan in force. @param {State} S @returns {Spec} */
export const effSpec = S => FORCE || specOf(S, myPlan(S)) || fixedSpec(customPct(S));
/** A plan's dates if every pay went like it, with the pay you're in stacked under it. @param {State} S @param {Spec} sp @param {boolean} [full] */
export const runPlan = (S, sp, full) => withSpec(sp, () => withRestacked(S, () => project(S, { fast: !full, split: true })));
/* The debt share that reaches FI soonest, the rest invested. mk(f) is the plan with share f on debt. Every
   interest-free debt has to be cleared before its free period ends. More on debt has to beat the best so far, so a
   tie keeps more invested. */
/** @param {State} S @param {(f: number) => Spec} mk @returns {Spec} */
function bestSpec(S, mk) {
  const can = owes(S);
  /** @type {{ score: number, sp: Spec } | null} */
  let best = null;
  for (let i = 0; i <= (can ? 20 : 0); i++) {
    const sp = mk(i / 20), r = runPlan(S, sp), score = (r.late ? 1e6 : 0) + (r.fi !== null ? r.fi : 1e4 + (r.debtFree !== null ? r.debtFree : 1e3));
    if (!best || score < best.score - 0.02) best = { score, sp };
  }
  return /** @type {{ score: number, sp: Spec }} */ (best).sp;
}
/** A plan by its key ('fi', 'debt', 'tight', 'custom'), or null while it's locked. @param {State} S @param {string} k @returns {Spec | null} */
export function specOf(S, k) {
  k = k === 'bal' ? 'debt' : k === 'yours' ? 'custom' : k;
  if (k === 'custom') return fixedSpec(customPct(S));
  if (k === 'fi') return memo(S, 'fi', () => bestSpec(S, f => fixedSpec({ spend: 0, pot: 0, save: 0, debt: 100 * f, invest: 100 - 100 * f })));
  if (k !== 'debt' && k !== 'tight') return null;
  const h = spendHist(S); if (k === 'tight' && !h) return null;
  const usual = h ? (k === 'tight' ? h.tight : h.usual) : null, cs = customPct(S).spend || 0;
  const spOf = (/** @type {number} */ rem) => usual === null ? cs : rem > 0.5 ? Math.min(100, usual / rem * 100) : 0;
  const bufOf = (/** @type {number} */ rem, /** @type {number} */ need, /** @type {number} */ r) => need > 0.5 && rem > 0.5 ? Math.min(r, need / rem * 100) : 0;
  if (k === 'debt') {
    const ow = owes(S), third = (/** @type {number} */ r) => ({ pot: r / 3, invest: r - r / 3 });
    return {
      pay: (rem, need) => { const s = spOf(rem), r = 100 - s; if (ow) return { spend: s, pot: 0, debt: r, save: 0, invest: 0 };
        const b = bufOf(rem, need, r); return Object.assign({ spend: s, debt: 0, save: b }, third(r - b)); },
      phases: rem => { const s = spOf(rem), r = 100 - s, B = [{ pct: { spend: s, pot: 0, debt: 0, save: r, invest: 0 }, until: /** @type {const} */ ('buf') }, { pct: Object.assign({ spend: s, debt: 0, save: 0 }, third(r)) }];
        return ow ? [{ pct: { spend: s, pot: 0, debt: r, save: 0, invest: 0 }, until: /** @type {const} */ ('debt') }, ...B] : B; },
    };
  }
  return memo(S, 'tight', () => bestSpec(S, f => ({
    pay: (rem, need) => { const s = spOf(rem), r = 100 - s, b = bufOf(rem, need, r), x = r - b; return { spend: s, pot: 0, debt: x * f, save: b, invest: x - x * f }; },
    phases: rem => { const s = spOf(rem), r = 100 - s; return [{ pct: { spend: s, pot: 0, debt: 0, save: r, invest: 0 }, until: /** @type {const} */ ('buf') }, { pct: { spend: s, pot: 0, debt: r * f, save: 0, invest: r - r * f } }]; },
  })));
}

/* ---------- a pay you haven't stacked yet ---------- */
/** Run fn as if this pay were already stacked, then put everything back. @template T @param {State} S @param {number} amount @param {string} date @param {(ts: PayStack) => T} fn @returns {T} */
export function withTempPay(S, amount, date, fn) {
  /** @type {import('./state.js').Move} */
  const pm = { id: '_tmp', t: Number.MAX_SAFE_INTEGER, date, amount, type: 'pay', note: 'Pay', src: 'tmp', stack: '_tmps' };
  S.moves.push(pm); touch();
  const ts = makeStack(S, amount, date, '_tmps', 0, undefined, pvMore(S, date)); ts.t = Number.MAX_SAFE_INTEGER; S.stacks.push(ts);
  try { return fn(ts); } finally { S.moves = S.moves.filter(m => m !== pm); S.stacks = S.stacks.filter(x => x !== ts); touch(); }
}
/** A split's pay and dates, for a pay not stacked yet. @param {State} S @param {Split} p @param {number} amount @param {string} date */
export const evalPlan = (S, p, amount, date) => withPct(p, () => withTempPay(S, amount, date, ts => { const R = project(S, { fast: true, split: true }); return { stk: ts, fi: R.fi, debtFree: R.debtFree, none: R.none }; }));
/** @param {Partial<Split>} a @param {Partial<Split>} b */
export const samePct = (a, b) => BK.every(k => (a[k] || 0) === (b[k] || 0));
/**
 * @typedef {{ k: string, rk: string, name: string, yours: boolean, lock?: boolean, sp?: Spec, stk?: PayStack, fi?: number | null,
 *   debtFree?: number | null, none?: boolean }} PayPlan
 */
/** The four plans for a pay, each worked out with this pay in, dated as if every pay went like it. Custom is yours, or
 *  custom: what you set for this pay. @param {State} S @param {number} amount @param {string} date @param {Split | null} [custom] @returns {PayPlan[]} */
export function payPlans(S, amount, date, custom) {
  return withTempPay(S, amount, date, () => PLANS.map(k => {
    const tw = k === 'custom' && custom, sp = tw ? fixedSpec(tw) : specOf(S, k), rk = ruleOf(S, k);
    /** @type {PayPlan} */
    const p = { k, rk, name: PLAN_N[rk], yours: k === S.plan && !(tw && !samePct(tw, customPct(S))) };
    if (!sp) return Object.assign(p, { lock: true });
    withSpec(sp, () => withRestacked(S, () => { const R = project(S, { fast: true, split: true }); Object.assign(p, { sp, stk: Object.assign({}, latestStack(S)), fi: R.fi, debtFree: R.debtFree, none: R.none }); }));
    return p;
  }));
}
/** The plan a pay goes on: the one you picked, else yours, else Debt-free. @param {State} S @param {PayPlan[]} plans @param {string | null} pick */
export const pvSel = (S, plans, pick) => /** @type {PayPlan} */ (plans.find(p => p.k === pick && !p.lock) || plans.find(p => p.k === (S.plan || 'debt') && !p.lock) || plans.find(p => !p.lock));
