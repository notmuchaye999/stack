// @ts-check
/* Stacking a pay: give every dollar of one pay a job, then track what you actually did with it. */
import { BK, uid, today, addDays, r5 } from './util.js';
import { rawOwed, sumType, after, isWallet, isCard, savedNow, bufferT, periodDays, walletCard, debtName, cardBudget, potTotal,
  ownMove, trackSpend } from './balances.js';
import { allocate } from './projection.js';
import { billsFor, repayIn, lateBills, billsDueNow, tickBill } from './due.js';
import { effSpec, fixedSpec, ruleOf, myPlan } from './plans.js';
import { nameOf } from './accounts.js';
import { payNow } from './paynow.js';

/** @import { State, Debt, PayStack, Move, MoveType, Split } from './state.js' */
/** @import { Spec } from './plans.js' */
/** @typedef {{ cover?: number, missed?: Record<string, number>, late?: import('./state.js').LateBill[], held?: Record<string, number> }} StackMore */

/* Balances as they stood when the pay landed, so re-stacking the current pay doesn't count its own transfers. */
/** @param {State} S @param {Debt} d @param {string} date */
export const debtAt = (S, d, date) => Math.max(0, rawOwed(S, d) + sumType(S, 'debt', null, m => m.ref === d.id && m.date >= date && after(d.asOf, m)) - sumType(S, 'spend', null, m => (m.credit === d.id || (isWallet(d) && isCard(m))) && m.date >= date && after(d.asOf, m)));
/** @param {State} S @param {string} date */
export const savedAt = (S, date) => savedNow(S) - sumType(S, 'saved', null, m => m.date >= date && after(S.savedAsOf, m)) + sumType(S, 'spend', null, m => m.from === 'buffer' && m.date >= date && after(S.savedAsOf, m)) + sumType(S, 'xout', null, m => m.acct === 'buffer' && m.date >= date && after(S.savedAsOf, m));
/** Money held for this pay in other accounts, all together. @param {Record<string, number> | undefined} h */
export const heldSum = h => Object.values(h || {}).reduce((a, v) => a + (+v || 0), 0);
/** What a stacked pay carried in from the last one, to stack it again the same way. @param {PayStack} s @returns {StackMore} */
export const carriedOf = s => ({ cover: s.cover || 0, missed: s.missed || {}, late: s.late || [], held: s.held || {} });

/**
 * One pay's plan. Bills due before the next pay come out first, then repayments due before it, both exact. The rest is
 * split by the plan. Money you move (extra debt, Savings, the Buffer, investing) goes in $5 steps; card money takes the
 * loose change, so the parts always add up to the pay plus anything left over from the last one.
 * pct: a split or a plan to use instead of yours. more: what the last pay left for this one.
 * @param {State} S @param {number} amount @param {string} date @param {string} [selfId] @param {number} [carry] @param {Split | Spec} [pct] @param {StackMore} [more]
 * @returns {PayStack}
 */
export function makeStack(S, amount, date, selfId, carry = 0, pct, more = {}) {
  // Overdue bills are worked out when the pay is stacked and kept with it, so ticking one off later doesn't move the pay.
  /** @type {Record<string, number>} */
  const missed = more.missed || {};
  const cover = more.cover || 0, late = more.late || lateBills(S, date, selfId);
  const total = amount + carry - cover + heldSum(more.held), end = addDays(date, periodDays(S)), billList = billsFor(S, date, end).concat(late.map(x => ({ name: x.name, v: x.v, due: x.d, late: true })));
  /** @type {import('./projection.js').SimDebt[]} */
  const debts = S.debts.map(d => { const bal = debtAt(S, d, date) + (isWallet(d) ? carry : 0); return { id: d.id, bal, rate: d.rate, min: Math.min(bal, repayIn(S, d, date, end, bal) + (missed[d.id] || 0)), od: !!d.od, card: !!d.card, free: !!d.free, until: d.until, focus: !!d.focus, urgent: !!d.urgent, set: !!d.set }; });
  const bills = Math.ceil(billList.reduce((s, b) => s + b.v, 0) - 0.001), minsF = debts.reduce((s, d) => s + d.min, 0);
  // The plan works its split out from what's left and from what the Buffer still needs.
  const sv = savedAt(S, date), spec = !pct ? effSpec(S) : 'pay' in pct ? pct : fixedSpec(pct);
  const rem = total - bills - minsF, pc = spec.pay(rem, Math.max(0, bufferT(S) - sv)), tot = BK.reduce((s, k) => s + (pc[k] || 0), 0), sc = Math.max(100, tot);
  /** @type {Split} */
  const sh = { spend: 0, pot: 0, debt: 0, save: 0, invest: 0 };
  BK.forEach(k => { sh[k] = Math.max(0, rem) * (pc[k] || 0) / sc; });
  // Urgent debts are first in line: until they're paid they take your whole split except spending money.
  const urg = debts.reduce((s, d) => s + (d.urgent ? Math.max(0, d.bal - d.min) : 0), 0);
  if (urg > sh.debt + 0.005) { const rest = sh.pot + sh.save + sh.invest, x = Math.min(urg - sh.debt, rest), f = rest > 0 ? (rest - x) / rest : 0; sh.pot *= f; sh.save *= f; sh.invest *= f; sh.debt += x; }
  // Savings is a slice of the split like the rest. It all goes into one pool for purchases.
  let potT = rem > 0 ? r5(sh.pot || 0) : 0;
  const a = allocate(sh, debts, sv, bufferT(S));
  /** @type {Record<string, number>} */
  const dp = {};
  /** @type {Record<string, number>} */
  const mb = {};
  let mins = 0;
  debts.forEach(d => {
    const mn = Math.round(a.mins[d.id] || 0), x = a.extra[d.id] || 0, ex = x < 0.005 ? 0 : d.bal < 0.005 ? Math.ceil(x) : r5(x);
    mins += mn; if (mn > 0) mb[d.id] = mn; if (mn + ex > 0) dp[d.id] = mn + ex;
  });
  let save = r5(a.save), invest = rem <= 0 ? 0 : r5(a.invest);
  const dT = Object.values(dp).reduce((s, v) => s + v, 0);
  let card, spare = 0;
  if (rem <= 0) { card = 0; save = 0; }
  else if (tot >= 99.5) {
    card = total - bills - dT - potT - save - invest;
    while (card < 0 && invest >= 5) { invest -= 5; card += 5; }
    while (card < 0 && save >= 5) { save -= 5; card += 5; }
    while (card < 0 && potT >= 5) { potT -= 5; card += 5; }
    card = Math.max(0, Math.round(card * 100) / 100);
  } else {
    card = Math.max(0, Math.round(sh.spend));
    spare = Math.max(0, Math.round(total - bills - dT - potT - card - save - invest));
  }
  /** @type {PayStack} */
  const out = { id: selfId || uid(), t: Date.now(), date, amount, carry, cover, missed, late, held: more.held || {},
    plan: { bills, billList, mins, minsBy: mb, rem: Math.max(0, Math.round(rem)), spend: card + potT, card, savings: potT, debts: dp, save, invest },
    short: rem < 0 ? Math.round(-rem) : 0, spare };
  Object.defineProperty(out, 'pc', { value: pc }); // the split it got, not saved
  return out;
}

/** The most recently stacked pay. @param {State} S @returns {PayStack | undefined} */
export const latestStack = S => [...S.stacks].sort((a, b) => b.date.localeCompare(a.date) || b.t - a.t)[0];

/* Money still on the card from the last pay: its spending money less what it spent and what the card paid past the plan,
   plus any payment it was loaded for that wasn't made. It's already on the card, so it goes into this pay. Untracked pays
   count as spent, so nothing carries. */
/** @param {State} S @param {string} date */
export function leftover(S, date) {
  const p = latestStack(S); if (!p || p.date >= date) return 0;
  const inW = (/** @type {Move} */ m) => m.date >= p.date && m.date < date;
  if (!S.moves.some(m => trackSpend(m) && inW(m))) return 0;
  const I = stackItems(S, p);
  return Math.max(0, Math.round(cardBudget(p) - (I.over - I.overPay) + I.viaLeft - S.moves.reduce((a, m) => isCard(m) && inW(m) ? a + m.amount : a, 0)));
}
/** Payments last pay loaded the card for but didn't make. They're still due, so this pay puts that money on them first. @param {State} S @param {string} date */
export function missedOf(S, date) {
  const p = latestStack(S); if (!p || p.date >= date) return {};
  /** @type {Record<string, number>} */
  const out = {}; payNow(S, p).dues.forEach(x => { if (x.kind === 'debt' && x.amt > 0.005) out[x.key.slice(5)] = Math.round(x.amt * 100) / 100; });
  return out;
}
/** Money last pay parked for something it didn't get to pay yet. @param {State} S @param {string} date */
export function heldOf(S, date) {
  const p = latestStack(S); if (!p || p.date >= date) return {};
  /** @type {Record<string, number>} */
  const out = {}; payNow(S, p).dues.forEach(x => (x.held || []).forEach(([k, v]) => { out[k] = Math.round(((out[k] || 0) + v) * 100) / 100; }));
  return out;
}
/** What a new pay on this date carries in from the last one. Pay's balance carries itself, so nothing is added or taken off. @param {State} S @param {string} date */
export const pvMore = (S, date) => ({ cover: 0, missed: missedOf(S, date), held: heldOf(S, date) });

/**
 * @typedef {{ key: string, type: MoveType, ref?: string, label: string, note: string, plan: number, via?: boolean, load?: number,
 *   done: number, state: 'done' | 'part' | 'todo' }} Todo
 */
/**
 * Plan vs what you did, for one stacked pay (the current one or a past one). Entries dated inside that pay count towards it.
 * @param {State} S @param {PayStack} stk @param {string | null} [ex] leave this entry out
 */
export function stackItems(S, stk, ex) {
  const next = S.stacks.filter(s => s.id !== stk.id && (s.date > stk.date || (s.date === stk.date && s.t > stk.t)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.t - b.t)[0];
  const inP = (/** @type {Move} */ m) => m.id !== ex && m.date >= stk.date && (!next || m.date < next.date);
  const got = (/** @type {string} */ type, /** @type {string} [ref] */ ref) => S.moves.reduce((s, m) => m.type === type && (!ref || m.ref === ref) && inP(m) && ownMove(m) ? s + m.amount : s, 0);
  const w = walletCard(S), via = (/** @type {string} */ id) => !!w && id !== w.id && !!(S.debts.find(x => x.id === id) || /** @type {Partial<Debt>} */ ({})).viaWallet;
  /** @type {Todo[]} */
  const todos = [];
  let viaPlan = 0;
  for (const [id, v] of Object.entries(stk.plan.debts)) {
    if (w && id === w.id) continue;
    if (v > 0.5) { const vw = via(id); if (vw) viaPlan += v; todos.push({ key: 'debt:' + id, type: 'debt', ref: id, label: vw && w ? `Pay ${debtName(S, id)} from ${w.name}` : `Pay ${debtName(S, id)}`, note: debtName(S, id), plan: v, via: vw, done: 0, state: 'todo' }); }
  }
  // The everyday card: one top-up covers this pay's card money, repayments paid from the card and any extra on it,
  // less card money still sitting on it from the last pay.
  const carry = w ? stk.carry || 0 : 0;
  let load = 0;
  if (w) {
    load = cardBudget(stk) + viaPlan;
    const p = Math.max(0, Math.round((load + (stk.plan.debts[w.id] || 0) - carry) * 100) / 100);
    if (p > 0.5) todos.unshift({ key: 'debt:' + w.id, type: 'debt', ref: w.id, label: `Top up ${w.name}`, note: w.name, plan: p, load, done: 0, state: 'todo' });
  }
  const pt = potTotal(stk);
  if (pt > 0.5) todos.push({ key: 'pots', type: 'pot', label: `Move to ${nameOf(S, 'pool')}`, note: 'Savings', plan: pt, done: 0, state: 'todo' });
  if (stk.plan.save > 0.5) todos.push({ key: 'save', type: 'saved', label: S.payIn === 'buffer' ? `Keep in ${nameOf(S, 'buffer')}` : `Move to ${nameOf(S, 'buffer')}`, note: 'Buffer', plan: stk.plan.save, done: 0, state: 'todo' });
  if (stk.plan.invest > 0.5) todos.push({ key: 'invest', type: 'invested', label: 'Invest', note: 'Investing', plan: stk.plan.invest, done: 0, state: 'todo' });
  todos.forEach(i => { i.done = got(i.type, i.ref); i.state = i.done >= i.plan - 0.5 ? 'done' : i.done > 0.5 ? 'part' : 'todo'; });
  // Anything moved past the plan (extra on a debt, Savings, the buffer or investing) came out of this pay, so it comes off spending.
  // Where it came from: overPay straight from the pay, the rest off the card. cardPlan is what the card paid of a to-do's own
  // plan (Afterpay paid off the card, say): that was planned, so it's not extra.
  let over = 0, overPay = 0, cardPlan = 0, viaLeft = 0;
  /** @type {Record<string, number>} */
  const viaMiss = {};
  const fromPay = (/** @type {string} */ type, /** @type {string} [ref] */ ref) => S.moves.reduce((s, m) => m.type === type && (!ref || m.ref === ref) && inP(m) && ownMove(m) && m.from !== 'card' ? s + m.amount : s, 0);
  const moved = (/** @type {Move} */ m) => (m.type === 'debt' || m.type === 'saved' || m.type === 'invested' || m.type === 'pot') && !todos.some(i => i.type === m.type && (m.type !== 'debt' || i.ref === m.ref));
  // Money moved past the plan straight from the pay (into the Buffer, say) left the pay account, so it isn't there to go
  // onto the card: the top-up shrinks by it, as far as the spending money it took.
  const tu = w && todos.find(i => i.key === 'debt:' + w.id);
  if (tu) {
    let others = 0;
    todos.forEach(i => { if (i !== tu) others += Math.max(0, fromPay(i.type, i.ref) - i.plan); });
    S.moves.forEach(m => { if (inP(m) && ownMove(m) && m.from !== 'card' && moved(m)) others += Math.max(0, m.amount); });
    const cut = Math.min(others, cardBudget(stk));
    if (cut > 0.005) { tu.plan = Math.max(0, Math.round((tu.plan - cut) * 100) / 100); tu.state = tu.done >= tu.plan - 0.5 ? 'done' : tu.done > 0.5 ? 'part' : 'todo'; }
  }
  todos.forEach(i => { const p = fromPay(i.type, i.ref); over += Math.max(0, i.done - i.plan); overPay += Math.max(0, p - i.plan); cardPlan += Math.min(i.done - p, Math.max(0, i.plan - p)); if (i.via && i.ref && i.plan - i.done > 0.005) { viaLeft += i.plan - i.done; viaMiss[i.ref] = Math.round((i.plan - i.done) * 100) / 100; } });
  S.moves.forEach(m => { if (inP(m) && ownMove(m) && moved(m)) { over += Math.max(0, m.amount); if (m.from !== 'card') overPay += Math.max(0, m.amount); } });
  over = Math.round(over * 100) / 100; overPay = Math.round(overPay * 100) / 100; cardPlan = Math.round(cardPlan * 100) / 100;
  // Planned buys come out of what was set aside for them, not the card budget.
  const spent = S.moves.reduce((s, m) => isCard(m) && inP(m) ? s + m.amount : s, 0), tracked = S.moves.some(m => trackSpend(m) && inP(m));
  const budget = cardBudget(stk);
  return { todos, spent, tracked, inP, over, overPay, cardPlan, viaLeft, viaMiss, budget, load, carry, left: cardBudget(stk) - spent, doneN: todos.filter(i => i.state === 'done').length, complete: todos.every(i => i.state === 'done') };
}

/* The pay you're in stays live: change a bill, a debt or your plan and it re-stacks. Past pays stay as they were.
   A pay on your plan follows your plan; a pay stacked on another plan just for itself keeps the split it got. */
/** @param {PayStack} s */
export const stackPct = s => s.one && s.pct ? s.pct : undefined;
/** Re-stack the pay you're in. true when it changed (so it needs saving). @param {State} S */
export function restack(S) {
  const s = latestStack(S); if (!s) return false;
  if (!s.late) s.late = lateBills(S, s.date, s.id); // a pay stacked before overdue bills counted: once
  const n = makeStack(S, s.amount, s.date, s.id, s.carry || 0, stackPct(s), carriedOf(s)), pk = s.one ? s.pk : ruleOf(S, myPlan(S));
  if (JSON.stringify(n.plan) !== JSON.stringify(s.plan) || n.short !== s.short || n.spare !== s.spare || pk !== s.pk) { s.plan = n.plan; s.short = n.short; s.spare = n.spare; s.pk = pk; return true; }
  return false;
}
/** Stacking a pay, on your plan or on another just for this pay (plan). That one keeps the split it got.
 *  @param {State} S @param {number} amt @param {string} date @param {number} [carry] @param {{ k: string, spec?: Spec } | null} [plan] @param {StackMore} [more] */
export function stackPay(S, amt, date, carry = 0, plan, more = {}) {
  /** @type {Move} */
  const pm = { id: uid(), t: Date.now(), date, amount: amt, type: 'pay', note: 'Pay', src: 'stack' };
  S.moves.push(pm);
  const s = makeStack(S, amt, date, undefined, carry, plan ? plan.spec : undefined, more); S.stacks.push(s); pm.stack = s.id;
  if (plan) { s.pk = ruleOf(S, plan.k); s.one = true; s.pct = Object.assign({}, /** @type {any} */ (s).pc); } else s.pk = ruleOf(S, myPlan(S));
  return s;
}
/** "Mark all done": records whatever's left of each to-do (for a past pay, dated on that pay), and ticks off the bills of the
 *  pay you're in. Returns how many things it did. @param {State} S @param {string} stkId @param {boolean} past */
export function didAll(S, stkId, past) {
  const stk = S.stacks.find(s => s.id === stkId); if (!stk) return 0;
  const date = past ? stk.date : today();
  let n = 0;
  const w = walletCard(S);
  stackItems(S, stk).todos.forEach(i => {
    const left = Math.round((i.plan - i.done) * 100) / 100; if (left <= 0.5) return;
    const id = uid();
    S.moves.push({ id, t: Date.now() + n++, date, amount: left, type: i.type, ref: i.ref || null, note: i.note, src: 'manual' });
    if (i.via && w) S.moves.push({ id: uid(), t: Date.now() + n, date, amount: left, type: 'spend', credit: w.id, pair: id, note: `${i.note} payment`, src: 'manual' });
  });
  // The pay you're in: its bills get ticked off too.
  if (!past && stk === latestStack(S)) billsDueNow(S).forEach(x => { if (!x.paid && !x.auto && tickBill(S, x.b.id, x.date)) n++; });
  return n;
}

/* ---------- habits ---------- */
/** How many pays in a row went past their card budget (newest first). @param {State} S */
export function overStreak(S) {
  let n = 0;
  for (const s of [...S.stacks].sort((a, b) => b.date.localeCompare(a.date) || b.t - a.t)) { if (stackItems(S, s).left < -0.5) n++; else break; }
  return n;
}
/** Your finished pays where you logged spending, the last 6. @param {State} S */
export function habit(S) {
  const lt = latestStack(S);
  const ps = [...S.stacks].filter(x => x !== lt).sort((a, b) => a.date.localeCompare(b.date) || a.t - b.t).slice(-12).map(x => ({ x, I: stackItems(S, x) })).filter(o => o.I.tracked).slice(-6);
  if (!ps.length) return null;
  const avg = (/** @type {(o: typeof ps[number]) => number} */ f) => ps.reduce((a, o) => a + f(o), 0) / ps.length;
  return { ps, n: ps.length, spent: avg(o => o.I.spent), budget: avg(o => o.I.budget) };
}
/** Pays on budget in a row: tracked and not over. Going over in the pay you're in resets it. @param {State} S */
export function budgetStreak(S) {
  const lt = latestStack(S); if (!lt || stackItems(S, lt).left < -0.5) return 0;
  let n = 0;
  for (const s of [...S.stacks].filter(x => x !== lt).sort((a, b) => b.date.localeCompare(a.date) || b.t - a.t)) { const I = stackItems(S, s); if (I.tracked && I.left >= -0.5) n++; else break; }
  return n;
}
