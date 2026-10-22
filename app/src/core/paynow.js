// @ts-check
/* ---------- this pay, as it stands ----------
   Your pay lands in Pay. Whatever you've done counts as done, from any account; only what's left gets split. What's still
   due (bills not ticked off, each debt's minimum less what's been paid on it) comes out first. Money you parked from this
   pay in the Buffer or Savings covers it before Pay has to. What's left in Pay is free, and your plan suggests where it
   goes. Short only when Pay can't cover what's still due.
   Colours are given as the kind of money (c: 'bills', 'debt', 'spend', 'buy', 'save', 'invest'); the screen picks the colour. */
import { money } from './format.js';
import { walletCard, payAcctBal, debtName, ownMove, potTotal, cardBudget, poolBal, savedNow, isCard, poolOut, cardAvail, debtNow } from './balances.js';
import { billsDueNow, overdue } from './due.js';
import { stackItems } from './stacks.js';
import { acctName, nameOf } from './accounts.js';

/** @import { State, Debt, Move, PayStack } from './state.js' */
/** @import { BillTick } from './due.js' */
/**
 * @typedef {{ key: string, kind: 'bill' | 'debt' | 'card', label: string, amt: number, late?: boolean, x?: BillTick, via?: boolean, to?: string,
 *   sub?: string, onCard?: number, held: [string, number][], fromPay: number }} Due
 *   held: money parked in the Buffer or Savings that covers it. fromPay: the rest, out of Pay.
 * @typedef {{ name: string, amt: number, sub: string, c: string, ids?: string[], k?: string, bill?: BillTick }} Done
 * @typedef {{ key: string, amt: number, to: string | null, label: string, sub: string, c: string }} Sug
 */

/** @param {State} S @param {PayStack} stk */
export function payNow(S, stk) {
  const inP = stackItems(S, stk).inP, w = walletCard(S), cash = payAcctBal(S), P = stk.plan, mb = P.minsBy || {}, r2 = (/** @type {number} */ v) => Math.round(v * 100) / 100;
  const ms = S.moves.filter(m => inP(m)), sum = (/** @type {(m: Move) => boolean} */ f) => ms.reduce((a, m) => f(m) ? a + m.amount : a, 0);
  const paidOn = (/** @type {string} */ id) => sum(m => m.type === 'debt' && m.ref === id), via = (/** @type {Debt} */ d) => !!w && d !== w && !!d.viaWallet;
  const srcTxt = (/** @type {(m: Move) => boolean} */ f) => { const k = [...new Set(ms.filter(f).map(m => m.from || 'pay'))]; return k.some(x => x !== 'pay') ? ' · from ' + k.map(x => acctName(S, x)).join(' and ') : ''; };
  /** @type {Due[]} */
  const dues = [];
  /** @type {Done[]} */
  const done = [];
  billsDueNow(S).forEach(x => {
    if (x.paid) done.push({ name: x.b.name, amt: x.amount, sub: 'Bill paid', c: 'bills', bill: x });
    else dues.push({ key: `bill:${x.b.id}:${x.date}`, kind: 'bill', label: x.b.name, amt: x.amount, late: x.late, x, held: [], fromPay: 0 });
  });
  // Debts: the minimum, less what's been paid. One the card pays is still yours to do: the card fronts it and Pay tops it back up.
  let front = 0;
  S.debts.forEach(d => {
    if (d === w) return;
    const v = mb[d.id] || 0, p = paidOn(d.id);
    if (v > 0.5 && p < v - 0.005) dues.push({ key: 'debt:' + d.id, kind: 'debt', label: d.name, amt: r2(v - p), via: via(d), to: 'd:' + d.id, late: overdue(S, d), held: [], fromPay: 0 });
    if (via(d)) front += Math.min(v, sum(m => m.type === 'debt' && m.ref === d.id && m.from === 'card'));
    if (p > 0.005) done.push({ ids: ms.filter(m => m.type === 'debt' && m.ref === d.id).map(m => m.id), name: d.name, amt: p, c: 'debt', sub: (v > 0.5 ? (p > v + 0.5 ? `${money(v)} due + ${money(p - v)} extra` : p < v - 0.5 ? `${money(p)} of ${money(v)} due` : 'Due this pay') : 'Extra')
      + srcTxt(m => m.type === 'debt' && m.ref === d.id) });
  });
  // The everyday card: what it fronted, and its own minimum, get topped back up first. Top-ups past that are free money used.
  const top = w ? sum(m => m.type === 'debt' && m.ref === w.id && m.from !== 'card' && m.from !== 'ext') : 0, need = w ? front + (mb[w.id] || 0) : 0;
  if (w && need - top > 0.005) dues.push({ key: 'card', kind: 'card', label: `Top up ${w.name}`, amt: r2(need - top), to: 'card', sub: front > 0.005 ? 'For what it paid' : 'Its minimum', held: [], fromPay: 0 });
  // Repayments the card makes: a top-up already past what the card needs back covers them, so Pay doesn't owe them twice.
  let spare = Math.max(0, top - need);
  dues.forEach(x => { if (x.via) { const c = Math.min(x.amt, spare); x.onCard = r2(c); spare -= c; } });
  if (w && top > 0.005) done.push({ ids: ms.filter(m => m.type === 'debt' && m.ref === w.id && m.from !== 'card' && m.from !== 'ext').map(m => m.id), name: w.name, amt: top, c: 'spend', sub: 'Topped up' + srcTxt(m => m.type === 'debt' && m.ref === w.id && m.from !== 'card') });
  // Parked: what this pay put in the Buffer or Savings past what the plan put there, less what's gone back out since.
  /** @type {Record<string, number>} */
  const park = {};
  /** @type {Record<string, number>} */
  const kept = {};
  /** @type {[string, string, number][]} */ ([['pool', 'pot', potTotal(stk)], ['buffer', 'saved', P.save || 0]]).forEach(([k, ty, T]) => {
    const i = sum(m => m.type === ty && ownMove(m) && m.from !== 'card'), o = sum(m => m.from === k && m.type !== 'xout' && m.type !== 'spend');
    kept[k] = Math.min(i, T); park[k] = Math.max(0, Math.min(((stk.held || {})[k] || 0) + Math.max(0, i - T) - o, k === 'pool' ? poolBal(S) : savedNow(S)));
    const on = [...new Set(ms.filter(m => m.from === k && m.type !== 'xout').map(m => m.type === 'debt' ? debtName(S, m.ref) : m.type === 'spend' ? 'spending' : acctName(S, m.type === 'saved' ? 'buffer' : m.type === 'pot' ? 'pool' : 'inv')))];
    if (i > 0.005) done.push({ ids: ms.filter(m => m.type === ty && ownMove(m) && m.from !== 'card').map(m => m.id), k, name: nameOf(S, k), amt: i, sub: on.length ? `Then to ${on.join(', ')}` : '', c: k === 'pool' ? 'buy' : 'save' });
  });
  /** @type {[string, number][]} */
  const pools = [['pool', park.pool], ['buffer', park.buffer]];
  [...dues].sort((a, b) => b.amt - a.amt).forEach(x => {
    let n = x.amt - (x.onCard || 0); x.held = [];
    pools.forEach(p => { const c = Math.min(n, p[1]); if (c > 0.005) { x.held.push([p[0], r2(c)]); p[1] -= c; n -= c; } });
    x.fromPay = r2(Math.max(0, n));
  });
  done.forEach(o => { if (!o.k) return; const f = dues.filter(x => x.held.some(h => h[0] === o.k)); if (f.length) o.sub = `Waiting for ${f.map(x => x.label).join(', ')}`; });
  const inv = sum(m => m.type === 'invested' && ownMove(m));
  if (inv > 0.005) done.push({ ids: ms.filter(m => m.type === 'invested' && ownMove(m)).map(m => m.id), name: 'Invested', amt: inv, sub: '', c: 'invest' });
  const spent = sum(isCard);
  if (spent > 0.005) done.push({ ids: ms.filter(isCard).map(m => m.id), name: 'Spent', amt: spent, sub: w ? `On ${w.name}` : `From ${nameOf(S, 'pay')}`, c: 'spend' });
  S.debts.filter(d => d.card && d !== w).forEach(d => { const v = sum(m => m.type === 'spend' && m.credit === d.id && !m.pair); if (v > 0.005) done.push({ ids: ms.filter(m => m.type === 'spend' && m.credit === d.id && !m.pair).map(m => m.id), name: 'Spent', amt: v, sub: `On ${d.name}`, c: 'debt' }); });
  /** @type {[string, (m: Move) => boolean][]} */ ([['buffer', m => m.type === 'spend' && m.from === 'buffer'], ['pool', m => m.type === 'spend' && poolOut(m)]]).forEach(([k, f]) => { const v = sum(f); if (v > 0.005) done.push({ ids: ms.filter(f).map(m => m.id), name: 'Spent', amt: v, sub: `From ${nameOf(S, k)}`, c: k === 'pool' ? 'buy' : 'save' }); });
  const due = r2(dues.reduce((a, x) => a + x.fromPay, 0)), free = r2(cash - due);
  // Free money: your plan's split of it, less what you've already put where. Do something different and the rest re-splits.
  /** @type {Record<string, number>} */
  const T = {};
  /** @type {Record<string, number>} */
  const D = {};
  if (w) { T.card = cardBudget(stk) + Math.max(0, (P.debts[w.id] || 0) - (mb[w.id] || 0)); D.card = spare; }
  else { T.spend = cardBudget(stk); D.spend = 0; }
  S.debts.forEach(d => { if (d === w) return; const x = Math.max(0, (P.debts[d.id] || 0) - (mb[d.id] || 0)), dn = Math.max(0, paidOn(d.id) - (mb[d.id] || 0)); if (x > 0.005 || dn > 0.005) { T['d:' + d.id] = x; D['d:' + d.id] = dn; } });
  T.pool = potTotal(stk); D.pool = kept.pool + pools[0][1];
  T.buffer = P.save || 0; D.buffer = kept.buffer + pools[1][1];
  T.inv = P.invest || 0; D.inv = inv;
  /** @type {Record<string, number>} */
  const R = {}; Object.keys(T).forEach(k => { R[k] = Math.max(0, T[k] - D[k]); });
  const tot = (/** @type {Record<string, number>} */ o) => Object.values(o).reduce((a, v) => a + v, 0);
  /** @type {Sug[]} */
  const sugs = [];
  if (free >= 0.5) {
    // What's left of each suggestion first; money past all of them is split the way your plan splits a pay.
    const sR = tot(R), sT = tot(T), def = w ? 'card' : 'spend';
    /** @type {Record<string, number>} */
    const A = {};
    Object.keys(T).forEach(k => { A[k] = sR >= free ? free * R[k] / sR : R[k] + (free - sR) * (sT > 0.005 ? T[k] / sT : 0); });
    if (sR < free && !(sT > 0.005)) A[def] = (A[def] || 0) + free - sR;
    const out = Object.entries(A).filter(([, v]) => v > 0.005).map(([k, v]) => ({ k, a: Math.floor(v * 100) / 100 }));
    const big = out.reduce((/** @type {{ k: string, a: number } | null} */ b, o) => !b || o.a > b.a ? o : b, null), keep = out.filter(o => o.a >= 0.5 || o === big);
    if (big) big.a = r2(big.a + free - keep.reduce((t, o) => t + o.a, 0));
    keep.forEach(({ k, a }) => {
      const d = k.startsWith('d:') ? S.debts.find(x => x.id === k.slice(2)) : null;
      sugs.push(Object.assign({ key: 'sug:' + k, amt: a, to: k === 'spend' ? null : k }, k === 'card' && w ? { label: `Top up ${w.name}`, sub: `${w.name} ${money(cardAvail(S, w))} available`, c: 'spend' }
        : k === 'spend' ? { label: 'Spending money', sub: `Stays in ${nameOf(S, 'pay')}`, c: 'spend' }
        : d ? { label: `Extra on ${d.name}`, sub: `${money(debtNow(S, d))} owing`, c: 'debt' }
        : k === 'pool' ? { label: nameOf(S, 'pool'), sub: 'For purchases', c: 'buy' }
        : k === 'buffer' ? { label: nameOf(S, 'buffer'), sub: 'Emergency money', c: 'save' } : { label: 'Invest', sub: nameOf(S, 'inv'), c: 'invest' }));
    });
  }
  return { cash, due, free: Math.max(0, free), short: free < -0.005 ? r2(-free) : 0, dues, sugs, done, spent };
}
