// @ts-check
/* Your accounts, named the way your bank names them, and money moving between them. From Pay or your card it's this
   pay's money: it ticks off the matching to-do, and anything past the plan comes off spending. From Savings, the Buffer
   or investments it's money you already had, so it doesn't touch this pay, and moving money between your own accounts
   doesn't change your rank. */
import { uid, addDays } from './util.js';
import { money } from './format.js';
import { walletCard, debtName, isWallet, OTHER, poolBal, potTotal, openBuys, netWorth } from './balances.js';
import { latestStack, stackItems } from './stacks.js';
import { billsDueNow } from './due.js';
import { bestNW, tierName } from './rank.js';

/** @import { State, Move, Debt, Buy } from './state.js' */
/** @import { Todo } from './stacks.js' */

/** What each one is for doesn't change, only its name. @type {Record<string, string>} */
export const NAME_DEF = { pay: 'Pay', buffer: 'Buffer', pool: 'Savings', inv: 'Invested' };
/** @type {Record<string, string>} */
const ROLE = { pay: 'Pay account', buffer: 'Buffer', pool: 'Savings', inv: 'Investments' };
/** @param {State} S @param {string} k */
export const nameOf = (S, k) => (S.names && S.names[k]) || NAME_DEF[k];
/** What it's for, when you've named it something else. @param {State} S @param {string} k */
export const roleOf = (S, k) => nameOf(S, k) !== NAME_DEF[k] ? ROLE[k] : '';
/** Any account key: 'pay', 'buffer', 'pool', 'inv', 'card', 'ext' or 'd:<debt id>'. @param {State} S @param {string} k */
export function acctName(S, k) { const w = walletCard(S); return k === 'pay' ? nameOf(S, 'pay') : k === 'ext' ? 'Somewhere else' : k === 'card' ? (w ? w.name : 'Card') : k === 'pool' ? nameOf(S, 'pool') : k === 'buffer' ? nameOf(S, 'buffer') : k === 'inv' ? nameOf(S, 'inv') : debtName(S, k.slice(2)); }
/** Where a to-do's money goes. @param {State} S @param {Todo} it */
export const todoTo = (S, it) => it.type === 'debt' ? (isWallet(S.debts.find(x => x.id === it.ref)) ? 'card' : 'd:' + it.ref) : it.type === 'saved' ? 'buffer' : it.type === 'pot' ? 'pool' : 'inv';
/** The entries one transfer makes. From the card, the card pays it (a spend on the card); from Savings, the Buffer or
 *  investments, the money comes out of that account. @param {State} S @param {string} from @param {string} to @param {number} a @param {string} date @param {string} note @returns {Move[]} */
export function moveRecs(S, from, to, a, date, note) {
  const w = walletCard(S), t = Date.now(), grp = uid(), id = uid(), toDebt = to.startsWith('d:') ? to.slice(2) : null;
  /** @type {{ type: import('./state.js').MoveType, ref?: string | null }} */
  const into = to === 'pay' ? { type: 'topay' } : to === 'card' ? { type: 'debt', ref: w ? w.id : null } : to === 'pool' ? { type: 'pot' } : to === 'buffer' ? { type: 'saved' } : to === 'inv' ? { type: 'invested' } : { type: 'debt', ref: toDebt };
  /** @type {Move[]} */
  const recs = [Object.assign({ id, t, date, amount: a, grp, note, src: 'manual' }, into, from === 'pay' ? {} : { from })];
  if (from === 'card' && w) recs.push({ id: uid(), t: t + 1, date, amount: a, type: 'spend', credit: w.id, pair: id, grp, note: toDebt ? `${debtName(S, toDebt)} payment` : note, src: 'manual' });
  else if (OTHER.includes(from)) recs.push({ id: uid(), t: t + 1, date, amount: a, type: 'xout', acct: from, grp, note, src: 'manual' });
  return recs;
}
/** What entries would do to your net worth (your rank): add them for a moment and look. @param {State} S @param {Move[]} recs */
export function nwDelta(S, recs) { const n0 = netWorth(S); S.moves.push(...recs); try { return Math.round((netWorth(S) - n0) * 100) / 100; } finally { S.moves = S.moves.filter(m => !recs.includes(m)); } }
/** 'net worth +$40', or nothing when it barely moves. @param {number} dn */
export const nwTxt = dn => Math.abs(dn) >= 0.5 ? `net worth ${dn > 0 ? '+' : '−'}${money(Math.abs(dn))}` : '';

/* ---------- Savings: purchases ---------- */
/** Purchases are unlocks, cheapest first. Each one unlocks once Savings covers it (and its rank, if it's a reward); "fit" is how
 *  many you could buy together. How long: at what this pay's split puts into Savings, the same figure the Savings card shows.
 *  @param {State} S */
export function unlocks(S) {
  const pool = poolBal(S), lt = latestStack(S), rate = lt ? potTotal(lt) : 0;
  let cum = 0, fit = 0;
  const best = bestNW(S);
  const items = openBuys(S).map(b => { cum += b.cost; const tl = b.at != null && best < b.at - 0.005; if (cum <= pool + 0.5 && !tl) fit++; const need = Math.max(0, b.cost - pool); return { b, cum, open: need < 0.5 && !tl, tier: tl ? /** @type {number} */ (b.at) : null, need, eta: need < 0.5 ? 0 : rate > 0.5 ? Math.ceil(need / rate) : null }; });
  return { pool, rate, items, fit, total: cum };
}
/** @param {ReturnType<typeof unlocks>['items'][number]} x */
export const etaTxt = x => x.open ? 'Unlocked' : x.tier !== null && x.need < 0.5 ? `Reach ${tierName(x.tier)} to unlock`
  : (x.eta === null ? `${money(x.need)} to go · not at this pace` : `${money(x.need)} to go · about ${x.eta} pay${x.eta === 1 ? '' : 's'}`) + (x.tier !== null ? ` · and ${tierName(x.tier)}` : '');
/** A purchase comes out of Savings first. Anything past that is this pay's spending money, so nothing goes missing.
 *  @param {State} S @param {Buy} b @param {number} a @param {string} date @param {string} note @param {boolean} bought */
export function buySpend(S, b, a, date, note, bought) {
  const fromPot = Math.min(a, Math.floor(poolBal(S) * 100) / 100), rest = Math.round((a - fromPot) * 100) / 100, t = Date.now(), grp = uid();
  if (fromPot > 0.005) S.moves.push({ id: uid(), t, date, amount: fromPot, type: 'spend', buy: b.id, grp, note, src: 'manual' });
  if (rest > 0.005) S.moves.push({ id: uid(), t: t + 1, date, amount: rest, type: 'spend', buyOf: b.id, grp, note: `${note} (over savings)`, src: 'manual' });
  if (bought) b.bought = true;
}
/** A pay-in-4 purchase: the first payment now (from your card if its repayments come off it), the other 3 a fortnight
 *  apart in your plan. One record: deleting any part deletes all of it. @param {State} S @param {Debt} d @param {Move} m the spend @param {number} fp first payment */
export function in4Buy(S, d, m, fp) {
  const w = walletCard(S), via = !!(w && d.viaWallet && d !== w), grp = m.grp = m.grp || uid();
  if (fp > 0.005) {
    const pid = uid();
    S.moves.push(Object.assign({ id: pid, t: m.t + 1, date: m.date, amount: fp, type: /** @type {const} */ ('debt'), ref: d.id, grp, note: `${d.name} first payment`, src: 'manual' }, via ? { from: 'card' } : {}));
    if (via && w) S.moves.push({ id: uid(), t: m.t + 2, date: m.date, amount: fp, type: 'spend', credit: w.id, pair: pid, grp, note: `${d.name} payment`, src: 'manual' });
  }
  const rest = Math.round((m.amount - fp) * 100) / 100;
  if (rest > 0.005) (d.inst = d.inst || []).push({ grp, amt: Math.round(rest / 3 * 100) / 100, first: addDays(m.date, 14), n: 3 });
}
/** With your pay going into the Buffer account, what of this pay is still sitting in it: jobs not done (a payment made
 *  from the card is already in the card's top-up), bills not paid, and spending money if there's no card it goes onto. @param {State} S */
export function payStillIn(S) {
  const lt = latestStack(S); if (!lt || S.payIn !== 'buffer') return 0;
  const I = stackItems(S, lt);
  return Math.round((I.todos.reduce((a, i) => a + (i.via ? 0 : Math.max(0, i.plan - i.done)), 0) + billsDueNow(S).reduce((a, x) => a + (x.paid ? 0 : x.amount), 0) + (walletCard(S) ? 0 : Math.max(0, I.left))) * 100) / 100;
}
