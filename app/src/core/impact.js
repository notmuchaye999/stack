// @ts-check
/* How an entry moves the main number: the debt-free date while you owe money, the FI date after that. Plus saying
   "how long" and "when" the same way everywhere. */
import { DPM, IMPACT_TYPES, today, addDays, parseISO } from './util.js';
import { debtPlan, debtTotal, isCard, isWallet, periodDays, ppy } from './balances.js';
import { project } from './projection.js';
import { stackItems } from './stacks.js';

/** @import { State, Move } from './state.js' */
/** @typedef {ReturnType<typeof project>} Projection */

/** Months to FI, or null. @param {State} S @param {import('./projection.js').ProjectOpts} o */
export const fiOf = (S, o) => project(S, Object.assign({ fast: true }, o)).fi;
/** Days between two dates in months. ±Infinity when one of them is out of reach. @param {number | null} w @param {number | null} wo */
export const diffDays = (w, wo) => w === null && wo === null ? null : w === null ? Infinity : wo === null ? -Infinity : (w - wo) * DPM;

/** Still owing anything the plan can see? @param {State} S @param {Projection} P */
export const inDebtNow = (S, P) => P.debtFree !== 0 && S.debts.some(d => debtPlan(S, d) > 0.005);
/** What entries are measured against: 'debt-free date' or 'FI date'. @param {State} S @param {Projection} P */
export const metricOf = (S, P) => inDebtNow(S, P) ? 'debt-free date' : 'FI date';
/** The projection with everything in, and the one from your plan, for the rest of the screens to compare against. @param {State} S */
export function derive(S) {
  const P = project(S), PL = project(S, { plan: true, fast: true });
  return { P, PL, metric: metricOf(S, P) };
}

/**
 * Days an entry moves the main number. While you owe money it's measured on the debt-free date: what you owe, paid off at
 * the pace you're going. After that it's the FI date, with the entry and without it. P is derive(S).P.
 * @param {State} S @param {Projection | null} P @param {string} type @param {number} amount @param {string | null | undefined} ref @param {Move | null} m
 */
export function entryImpact(S, P, type, amount, ref, m) {
  if (!P || P.none || !(amount > 0.004) || type === 'pot') return null;
  if (P.debtFree !== 0 && S.debts.some(d => debtPlan(S, d) > 0.005)) {
    if (P.debtFree === null || type === 'saved' || type === 'invested') return null;
    const perMonth = debtTotal(S) / Math.max(P.debtFree, 0.5);
    return perMonth > 0 ? (type === 'spend' ? 1 : -1) * amount / perMonth * DPM : null;
  }
  if (P.fi === null) return null;
  if (type === 'spend') return diffDays(P.fi, fiOf(S, { lump: amount }));
  return m ? diffDays(P.fi, fiOf(S, { ex: m.id })) : diffDays(fiOf(S, { add: { type, amount, ref } }), P.fi);
}
/** The pay a date falls in. @param {State} S @param {string} date */
export const stackFor = (S, date) => [...S.stacks].filter(s => s.date <= date).sort((a, b) => b.date.localeCompare(a.date) || b.t - a.t)[0];
/** The part of a spend that went past its pay's card budget. Spending inside the budget is already in the plan. @param {State} S @param {Move} m */
export function overPart(S, m) {
  if (!isCard(m)) return 0;
  const stk = stackFor(S, m.date); if (!stk) return m.amount;
  const I = stackItems(S, stk), b = I.budget;
  const list = S.moves.filter(x => isCard(x) && I.inP(x)).sort((a, c) => a.date.localeCompare(c.date) || a.t - c.t);
  let before = 0; for (const x of list) { if (x.id === m.id) break; before += x.amount; }
  return Math.max(0, before + m.amount - b) - Math.max(0, before - b);
}
/** A debt payment counts for what it cuts off the debt. Card money topped up onto the everyday card cuts nothing. @param {State} S @param {Move} m */
export const planCut = (S, m) => { const d = S.debts.find(x => x.id === m.ref); return d && isWallet(d) ? Math.max(0, debtPlan(S, d, m.id) - debtPlan(S, d)) : Math.abs(m.amount); };
/** @param {State} S @param {Projection | null} P @param {Move} m */
export const impactOf = (S, P, m) => !IMPACT_TYPES.includes(m.type) || m.pair ? null : m.type === 'spend' ? entryImpact(S, P, 'spend', m.credit || m.from === 'buffer' ? m.amount : overPart(S, m), null, m) : entryImpact(S, P, m.type, m.type === 'debt' ? planCut(S, m) : Math.abs(m.amount), m.ref, m);
/** What an entry you're about to record would do. @param {State} S @param {Projection | null} P @param {string} type @param {number} amount @param {string | null} [ref] */
export const hypo = (S, P, type, amount, ref) => amount > 0 ? entryImpact(S, P, type, amount, ref, null) : null;

/** How long, the same way everywhere: days while it's under a pay, then pays up to two years, then years and months. @param {State} S @param {number} a days */
export function spanTxt(S, a) {
  if (a < 1) return 'under a day';
  if (a < periodDays(S) - 0.5) { const n = Math.round(a); return n + (n === 1 ? ' day' : ' days'); }
  const p = Math.max(1, Math.round(a / DPM * ppy(S) / 12));
  if (p <= 52) return `${p} ${p === 1 ? 'pay' : 'pays'}`;
  const mt = Math.round(a / DPM); return `${Math.floor(mt / 12)}y ${mt % 12}m`;
}
/** '+3 days', '−2 pays', 'Out of reach'. @param {State} S @param {number} d */
export function impTxt(S, d) {
  if (d === Infinity) return 'Out of reach';
  if (d === -Infinity) return 'Back in reach';
  const a = Math.abs(d);
  return a < 1 ? '<1 day' : (d > 0 ? '+' : '−') + spanTxt(S, a);
}
/** '+3 days to FI', 'No change'. @param {State} S @param {number | null} d @param {string} metric from metricOf */
export function impShort(S, d, metric) {
  if (d === null) return '';
  if (d === Infinity) return `${metric === 'FI date' ? 'FI' : 'Debt-free'} out of reach`;
  if (d === -Infinity) return `${metric === 'FI date' ? 'FI' : 'Debt-free'} back in reach`;
  if (Math.abs(d) < 1) return 'No change';
  return `${impTxt(S, d)} ${metric === 'FI date' ? 'to FI' : 'to debt-free'}`;
}
/** The date some months from now. @param {number} months */
export const dateIn = months => parseISO(addDays(today(), Math.round(months * DPM)));
/** One way of saying "when", used everywhere: pays while it's within two years, years and months after that. @param {State} S @param {number | null} m months */
export function whenTxt(S, m) {
  if (m === null) return 'Not at this pace';
  if (m === 0) return 'Done';
  const p = Math.max(1, Math.ceil(m * ppy(S) / 12 - 1e-6));
  if (p <= 52) return `${p} ${p === 1 ? 'pay' : 'pays'}`;
  const mt = Math.round(m); return `${Math.floor(mt / 12)}y ${mt % 12}m`;
}
