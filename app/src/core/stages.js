// @ts-check
/* The 5 stages, and the split Stack suggests for each one. */
import { BK } from './util.js';
import { money, kmoney } from './format.js';
import { debtNow, savedNow, investedNow, effRate, order, sumPct } from './balances.js';

/** @import { State, Debt, Split } from './state.js' */

/**
 * @typedef {{ n: 1 | 2 | 3 | 4 | 5, name: string, tone: 'debt' | 'save' | 'invest', prog: number, detail: string, top?: Debt }} Stage
 *   tone picks the colour (the UI shows it as --c-debt, --c-save or --c-invest). top is the debt being worked on.
 */

/**
 * 1 overdrawn back to $0 · 2 $1,000 buffer · 3 debts at 7% or more (effective) cleared · 4 emergency fund full · 5 investing.
 * P needs the targets from the projection: { emT, fiT }.
 * @param {State} S @param {{ emT: number, fiT: number }} P @returns {Stage}
 */
export function stageInfo(S, P) {
  const od = S.debts.filter(d => d.od && debtNow(S, d) > 0.005);
  if (od.length) {
    const left = od.reduce((s, d) => s + debtNow(S, d), 0), orig = od.reduce((s, d) => s + d.balance, 0);
    return { n: 1, name: 'Get back to $0', tone: 'debt', prog: orig ? 1 - left / orig : 0, detail: `${money(left)} overdrawn`, top: order(od)[0] };
  }
  const em = savedNow(S), starter = Math.min(1000, P.emT || 1000);
  if (em < starter) return { n: 2, name: 'Starter buffer', tone: 'save', prog: em / starter, detail: `${money(em)} of ${money(starter)} saved` };
  const hi = S.debts.filter(d => !d.od && effRate(d) >= 7 && debtNow(S, d) > 0.005);
  if (hi.length) {
    const left = hi.reduce((s, d) => s + debtNow(S, d), 0), orig = hi.reduce((s, d) => s + d.balance, 0);
    return { n: 3, name: 'Clear high-interest debt', tone: 'debt', prog: orig ? 1 - left / orig : 1, detail: `${money(left)} of high-interest debt left`, top: order(hi)[0] };
  }
  if (em < P.emT) return { n: 4, name: 'Full emergency fund', tone: 'save', prog: em / P.emT, detail: `${money(em)} of ${money(P.emT)} saved` };
  return { n: 5, name: 'Stack investments', tone: 'invest', prog: P.fiT ? investedNow(S) / P.fiT : 0, detail: `${money(investedNow(S))} of ${kmoney(P.fiT)} invested` };
}

/**
 * The suggested split for a stage. Spending stays at your setting. Investing always keeps a slice: through stages 1–3
 * it gets 5%, taken from Spending, never from debt or savings. Investing always beats savings (two-thirds of their share).
 * @param {State} S @param {{ n: number }} st @returns {Split}
 */
export function suggest(S, st) {
  // With spending under 5% in stages 2–3, one pass can't be told apart from its own result, so settle on the
  // answer that stays the same when the rules run again (one extra pass at most). Normal splits are stable first time.
  let p = suggestOnce(S, st);
  for (let i = 0; i < 4; i++) {
    const q = suggestOnce(Object.assign({}, S, { pct: p }), st);
    if (BK.every(k => q[k] === p[k])) break;
    p = q;
  }
  return p;
}

/** @param {State} S @param {{ n: number }} st @returns {Split} */
function suggestOnce(S, st) {
  // Spending plus that slice is treated as one pool, so applying the suggestion twice gives the same answer.
  // 30% is only used when your whole split is blank; a deliberate 0% spending stays 0%. Capped at 100% so no share goes negative.
  const early = st.n <= 3;
  const sp = Math.min(100, sumPct(S) > 0 ? S.pct.spend + (early ? Math.min(S.pct.invest, 5) : 0) : 30), R = 100 - sp;
  const hasDebt = S.debts.some(d => debtNow(S, d) > 0.005);
  const inv = early ? Math.min(5, sp) : 0;
  const p = { spend: sp - inv, debt: 0, save: 0, invest: inv };
  if (st.n === 1) p.debt = R;
  else if (st.n === 2) { p.save = hasDebt ? Math.round(R * 0.7) : R; p.debt = R - p.save; }
  else if (st.n === 3) { p.save = Math.min(10, R); p.debt = R - p.save; }
  else if (st.n === 4) { p.save = Math.round(R / 2); p.invest = R - p.save; }
  else p.invest = R;
  // Investing always beats savings: whenever both are in play, investing takes two-thirds of their combined share.
  // Rounding can't make it a tie, and in stages 1–3 it never drops below the 5% slice.
  if (p.save > 0) {
    const pool = p.save + p.invest;
    p.invest = Math.max(inv, Math.round(pool * 2 / 3));
    if (p.invest * 2 <= pool) p.invest = Math.floor(pool / 2) + 1;
    p.save = pool - p.invest;
  }
  return p;
}
