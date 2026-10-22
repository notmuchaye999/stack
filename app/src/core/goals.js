// @ts-check
/* ---------- goals ----------
   An amount on your cash (Buffer and Savings together) or what you've invested. The pace is what actually went
   in over your last 6 pays. With a "by" date: what it needs a pay. */
import { today, daysBetween } from './util.js';
import { kmoney } from './format.js';
import { investedNow, savedNow, poolBal, poolOut, potTotal, periodDays, ppy } from './balances.js';
import { latestStack, stackItems } from './stacks.js';
import { whenTxt } from './impact.js';

/** @import { State, Goal, Move } from './state.js' */

/** @param {State} S @param {Goal} g */
export const goalVal = (S, g) => g.kind === 'inv' ? investedNow(S) : savedNow(S) + poolBal(S);
/** '$10k in cash'. @param {Goal} g */
export const goalName = g => `${kmoney(g.amount)} ${g.kind === 'inv' ? 'invested' : 'in cash'}`;
/** What went in a pay, on average over your last 6 (the pay you're in only once something went in). @param {State} S @param {Goal} g */
export function goalRate(S, g) {
  const inv = g.kind === 'inv', lt = latestStack(S);
  const eff = (/** @type {Move} */ m) => inv ? (m.type === 'invested' ? m.amount : m.type === 'xout' && m.acct === 'inv' ? -m.amount : 0)
    : m.type === 'saved' || m.type === 'pot' ? m.amount : (m.type === 'spend' && (m.from === 'buffer' || poolOut(m))) || (m.type === 'xout' && m.acct !== 'inv') ? -m.amount : 0;
  const ss = [...S.stacks].sort((a, b) => a.date.localeCompare(b.date) || a.t - b.t).slice(-7)
    .map(k => { const I = stackItems(S, k); return { k, v: S.moves.reduce((a, m) => I.inP(m) ? a + eff(m) : a, 0) }; })
    .filter(o => o.k !== lt || o.v > 0.5).slice(-6);
  return ss.length ? ss.reduce((a, o) => a + o.v, 0) / ss.length : lt ? (inv ? lt.plan.invest : lt.plan.save + potTotal(lt)) : 0;
}
/** @param {State} S @param {Goal} g */
export function goalNow(S, g) {
  const v = goalVal(S, g), need = Math.max(0, g.amount - v), rate = goalRate(S, g), done = need < 0.5;
  const pays = done ? 0 : rate > 0.5 ? Math.ceil(need / rate) : null;
  /** @type {{ per: number, ok: boolean, short: number } | null} */
  let pace = null;
  if (g.by && !done) { const left = Math.max(1, Math.floor(daysBetween(today(), g.by) / periodDays(S))), per = need / left; pace = { per, ok: rate >= per - 0.5, short: per - rate }; }
  return { v, need, rate, done, pays, pace };
}
/** A number of pays, said the way "when" is said everywhere. @param {State} S @param {number | null} p */
export const whenPays = (S, p) => p === null ? 'Not at this pace' : p === 0 ? 'Done' : whenTxt(S, p * 12 / ppy(S));
