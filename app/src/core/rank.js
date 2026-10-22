// @ts-check
/* ---------- Rank ----------
   Your rank is your net worth: Buffer, Savings and investments, less what you owe. Below $0 it's DEBT 6 … 1, from $0 it's
   RANK 0, 1, 2 … every $1,000 to $10,000, then wider steps. Cards are read the way the plan reads them: this pay's card
   money counts as spent once it's loaded, so spending inside your budget doesn't move your rank. Saving, investing and
   paying off debt raise it. Going over budget, buying on credit, taking money out and market drops lower it. Moving
   money between your own accounts doesn't change it. High score: the most you've been worth since rank started.

   Pay day: your rank only moves when you stack a pay. Stacking settles the pay that just ended: what came in, what went
   out, and your rank lands where your net worth now is, through every rank in between. Until the next pay it stays
   locked. It was first decided once your accounts, debts and a pay were in. */
import { today, addDays, sortMoves, TYPE_NAMES } from './util.js';
import { money, money0, fmtDate } from './format.js';
import { netWorth, bankOwed, debtNow, lockOn, walletCard, cardBudget, ownMove, isCard, OTHER, poolOut, debtName, isWallet } from './balances.js';
import { latestStack, stackItems } from './stacks.js';
import { billsDueNow } from './due.js';
import { payNow } from './paynow.js';
import { goalVal, goalName } from './goals.js';

/** @import { State, Move } from './state.js' */

/** Where each rank starts. */
export const RANK_PTS = (() => { const a = []; for (let v = 0; v <= 10000; v += 1000) a.push(v); for (let v = 12500; v <= 25000; v += 2500) a.push(v); for (let v = 30000; v <= 50000; v += 5000) a.push(v); for (let v = 60000; v <= 1e7; v += 10000) a.push(v); return a; })();
/** @typedef {{ kind: 'debt' | 'rank', n: number, idx: number, lo: number, hi: number, name: string }} Tier */
/** @param {number} nw @returns {Tier} */
export function tierOf(nw) {
  nw = Math.round(nw * 100) / 100;
  if (nw < 0) { const n = Math.ceil(-nw / 1000); return { kind: 'debt', n, idx: -n, lo: -n * 1000, hi: -(n - 1) * 1000, name: `DEBT ${n}` }; }
  let i = 0; while (i + 1 < RANK_PTS.length && RANK_PTS[i + 1] <= nw) i++;
  return { kind: 'rank', n: i, idx: i, lo: RANK_PTS[i], hi: RANK_PTS[i + 1], name: `RANK ${i}` };
}
/** @param {number} v */
export const tierName = v => tierOf(v).name;
/** @param {number} i */
export const idxName = i => i < 0 ? `DEBT ${-i}` : `RANK ${i}`;
/** @param {number} i */
export const idxStart = i => i < 0 ? i * 1000 : RANK_PTS[i];
/** Your rank's net worth: locked at the last pay day, or what it is now before the first. @param {State} S */
export const rankNW = S => S.rank ? S.rank.nw : netWorth(S);
/** @param {State} S */
export const bestNW = S => S.best ? Math.max(S.best.nw, rankNW(S)) : rankNW(S);
/** Where each rank starts, above a net worth. @param {number} nw @param {number} n */
export function tierStarts(nw, n) {
  const out = [];
  if (nw < 0) for (let k = Math.ceil(-nw / 1000) - 1; k >= 1 && out.length < n; k--) out.push(-k * 1000);
  for (const v of RANK_PTS) { if (out.length >= n) break; if (v > nw) out.push(v); }
  return out;
}

/** Toasts: a debt cleared, debt-free, a goal reached (your rank moves on pay day, not here). Keeps what it needs to notice
 *  them next time. changed: that needs saving. @param {State} S */
export function checkRank(S) {
  ensureRank(S);
  /** @type {Record<string, number>} */
  const owed = {};
  /** @type {string[]} */
  const msg = [];
  const owing = bankOwed(S) > 0.005, prev = S.credOwed || null, was = JSON.stringify([S.credOwed, S.rkOwing, (S.goals || []).map(g => g.hit)]);
  S.debts.forEach(d => { owed[d.id] = Math.round(debtNow(S, d) * 100) / 100; });
  if (prev) {
    S.debts.forEach(d => { if (owed[d.id] <= 0.005 && (prev[d.id] || 0) > 0.005) msg.push(`${d.name} cleared${lockOn(d) ? ', locked' : ''}`); });
    if (S.rkOwing && !owing) msg.push('Debt-free');
  }
  (S.goals || []).forEach(g => { if (!g.hit && goalVal(S, g) >= g.amount - 0.005) { g.hit = today(); msg.push(`Goal reached · ${goalName(g)}`); } });
  S.credOwed = owed; S.rkOwing = owing;
  const changed = JSON.stringify([S.credOwed, S.rkOwing, (S.goals || []).map(g => g.hit)]) !== was;
  const fresh = !!(S.rank && S.rank.fresh); if (S.rank && fresh) delete S.rank.fresh;
  return { msg, changed: changed || fresh };
}
/** What came in and went out since a moment (by when it was recorded). Moving money between your own accounts and paying
 *  debts doesn't change net worth, so it isn't here. @param {State} S @param {number} t0 */
export function flowsSince(S, t0) {
  const ms = S.moves.filter(m => (m.t || 0) > t0), sum = (/** @type {(m: Move) => boolean} */ f) => ms.reduce((a, m) => f(m) ? a + m.amount : a, 0);
  const pay = sum(m => m.type === 'pay'), ext = sum(m => m.from === 'ext' && m.type !== 'xout'), spent = sum(m => m.type === 'spend' && !m.pair), bills = sum(m => m.type === 'bill'), market = sum(m => m.type === 'mkt');
  return { pay, ext, spent, bills, market, net: pay + ext - spent - bills + market };
}
/** Locked from right after your latest pay landed: everything since then belongs to the pay that's running. @param {State} S */
export function ensureRank(S) {
  if (S.rank || !S.stacks.length) return;
  const lt = /** @type {import('./state.js').PayStack} */ (latestStack(S)), pm = S.moves.find(m => m.type === 'pay' && m.stack === lt.id), t0 = pm && pm.t ? pm.t : Date.now();
  const nw = Math.round((netWorth(S) - flowsSince(S, t0).net) * 100) / 100;
  S.rank = { nw, t: t0, date: lt.date, stk: lt.id, fresh: 1 }; S.best = { nw, date: lt.date };
}
/**
 * @typedef {{ k: 'clear' | 'miss' | 'good', c?: string, b: string, s: string }} Medal
 *   c is a colour as the page names it (var(--c-debt)): medals are saved with your data, so they're kept the way the prototype keeps them.
 * @typedef {{ from: number, t0: number, start: string, medals: Medal[] }} PreSettle
 */
/** The medals for the pay that's ending, worked out before the new one lands. @param {State} S @returns {PreSettle | null} */
export function preSettle(S) {
  ensureRank(S); if (!S.rank) return null;
  const p = latestStack(S);
  /** @type {PreSettle} */
  const out = { from: S.rank.nw, t0: S.rank.t, start: S.rank.date, medals: [] };
  if (!p) return out;
  const N = payNow(S, p), inP = stackItems(S, p).inP, ms = S.moves.filter(inP), w = walletCard(S), mb = p.plan.minsBy || {};
  /** @type {Medal[]} */
  const M = [];
  const paid = (/** @type {string} */ id) => ms.reduce((a, m) => m.type === 'debt' && m.ref === id ? a + m.amount : a, 0);
  S.debts.forEach(d => { if (debtNow(S, d) <= 0.005 && paid(d.id) > 0.005) M.push({ k: 'clear', c: 'var(--c-debt)', b: 'Cleared', s: d.name }); });
  N.dues.filter(x => x.kind === 'bill' && x.late).forEach(x => M.push({ k: 'miss', b: 'Overdue', s: `${x.label} · ${money0(x.amt)}` }));
  N.dues.filter(x => x.kind === 'debt' && x.amt > 0.5).forEach(x => M.push({ k: 'miss', b: 'Missed', s: `${x.label} · ${money0(x.amt)}` }));
  const bud = cardBudget(p), sp = N.spent;
  if (bud > 0.5 && sp > bud + 0.5) M.push({ k: 'miss', b: `${money0(sp - bud)} over`, s: 'Spending money' });
  /** @type {[string, number][]} */
  const ex = []; S.debts.forEach(d => { if (d === w || !((mb[d.id] || 0) > 0.5)) return; const e = paid(d.id) - mb[d.id]; if (e > 0.5) ex.push([d.name, e]); });
  if (ex.length) M.push({ k: 'good', c: 'var(--c-debt)', b: `+${money0(ex.reduce((a, x) => a + x[1], 0))} extra`, s: ex.length === 1 ? `On ${ex[0][0]}` : `On ${ex.length} debts` });
  const inv = ms.reduce((a, m) => m.type === 'invested' && ownMove(m) ? a + m.amount : a, 0);
  if (inv > 0.5) M.push({ k: 'good', c: 'var(--c-invest)', b: `+${money0(inv)}`, s: 'Invested' });
  const hd = N.dues.filter(x => (x.held || []).length), hv = hd.reduce((a, x) => a + x.held.reduce((b, y) => b + y[1], 0), 0);
  if (hv > 0.5) M.push({ k: 'good', c: 'var(--c-buy)', b: `${money0(hv)} parked`, s: hd.length === 1 ? `For ${hd[0].label}` : "For what's still due" });
  if (bud > 0.5 && sp <= bud + 0.5) M.push({ k: 'good', c: 'var(--c-spend)', b: `${money0(sp)} of ${money0(bud)}`, s: 'Spending money' });
  const bl = billsDueNow(S).filter(x => !x.auto); if (bl.length && bl.every(x => x.paid)) M.push({ k: 'good', c: 'var(--c-bills)', b: 'All paid', s: `${bl.length} bill${bl.length === 1 ? '' : 's'}` });
  const cl = M.filter(m => m.k === 'clear'), mi = M.filter(m => m.k === 'miss'), gd = M.filter(m => m.k === 'good');
  out.medals = [...cl, ...mi.slice(0, 2), ...gd, ...mi.slice(2)].slice(0, 4);
  return out;
}
/**
 * @typedef {{ from: number, to: number, start: string, end: string, pay: number, ext: number, spent: number, bills: number,
 *   market: number, fixes: number, medals: Medal[], freq: string, date: string }} Settle
 */
/** After the new pay is in: settle. The first pay ever just places you (null). @param {State} S @param {PreSettle | null} pre @returns {Settle | null} */
export function settleRank(S, pre) {
  const lt = /** @type {import('./state.js').PayStack} */ (latestStack(S)), nw = Math.round(netWorth(S) * 100) / 100;
  if (!pre || !S.rank) { S.rank = { nw, t: Date.now(), date: lt.date, stk: lt.id }; S.best = { nw, date: lt.date }; return null; }
  const f = flowsSince(S, pre.t0);
  /** @type {Settle} */
  const R = { from: pre.from, to: nw, start: pre.start, end: addDays(lt.date, -1), pay: f.pay, ext: f.ext, spent: f.spent, bills: f.bills, market: f.market,
    fixes: Math.round((nw - pre.from - f.net) * 100) / 100, medals: pre.medals, freq: S.freq, date: today() };
  S.rank = { nw, t: Date.now(), date: lt.date, stk: lt.id };
  if (!S.best || nw > S.best.nw) S.best = { nw, date: lt.date };
  S.settles = (S.settles || []).concat([R]).slice(-12);
  return R;
}

/** When your net worth reaches v, at your pace (months). undefined when there's no path to read. @param {{ pts?: { m: number, nw?: number }[] } | null | undefined} P @param {number} v */
export function etaNW(P, v) {
  const p = P && P.pts; if (!p || p.length < 2 || p[0].nw === undefined) return undefined;
  if (p[0].nw >= v) return 0;
  for (let i = 1; i < p.length; i++) if (/** @type {number} */ (p[i].nw) >= v) { const a = p[i - 1], b = p[i]; return a.m + (v - /** @type {number} */ (a.nw)) / (/** @type {number} */ (b.nw) - /** @type {number} */ (a.nw)) * (b.m - a.m); }
  return null;
}

/** What moved your net worth this pay: each entry, with whatever belongs to it, and exactly how much it changed it.
 *  Everyday card spending is one line: inside your budget it doesn't move anything. @param {State} S @param {number} n */
export function movedIt(S, n) {
  const all = S.moves, base = netWorth(S), lt = latestStack(S), I = lt && stackItems(S, lt), seen = new Set();
  /** @type {{ title: string, sub: string, d: number }[]} */
  const out = [];
  if (!I) return out;
  const without = (/** @type {Set<string>} */ ids) => { let w; S.moves = all.filter(x => !ids.has(x.id)); try { w = netWorth(S); } finally { S.moves = all; } return Math.round((base - w) * 100) / 100; };
  for (const m of sortMoves(all)) {
    if (out.length >= n) break;
    if (seen.has(m.id) || !I.inP(m) || m.type === 'pay') continue;
    const grp = all.filter(x => x.id === m.id || (m.grp && x.grp === m.grp) || x.pair === m.id || (m.pair && (x.id === m.pair || x.pair === m.pair)));
    grp.forEach(x => seen.add(x.id));
    if (grp.every(isCard)) continue;
    const d = without(new Set(grp.map(x => x.id))), xfer = grp.some(x => x.type === 'xout' || OTHER.includes(x.from));
    if (Math.abs(d) < 0.5 && !xfer) continue;
    const main = grp.find(x => x.type === 'spend' && !x.pair) || grp.find(x => x.type !== 'xout' && !x.pair) || grp[0];
    const kind = xfer && Math.abs(d) < 0.5 ? 'between your accounts' : main.type === 'spend' ? (main.credit ? 'on ' + debtName(S, main.credit) : main.from === 'buffer' ? 'from Buffer' : poolOut(main) ? 'from Savings' : 'spent')
      : main.type === 'mkt' ? 'market' : main.type === 'debt' ? (isWallet(S.debts.find(x => x.id === main.ref)) ? 'topped up' : 'debt paid') : main.type === 'saved' ? 'into Buffer' : main.type === 'pot' ? 'into Savings' : main.type === 'invested' ? 'invested' : '';
    out.push({ title: main.note || TYPE_NAMES[main.type] || 'Entry', sub: `${fmtDate(main.date)}${kind ? ' · ' + kind : ''}`, d });
  }
  const ids = new Set(all.filter(m => isCard(m) && I.inP(m)).map(m => m.id));
  if (ids.size) { const d = without(ids); out.push({ title: 'Spending', sub: `${money(I.spent)} this pay`, d }); }
  return out;
}
