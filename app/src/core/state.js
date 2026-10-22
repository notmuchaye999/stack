// @ts-check
/* What Stack saves, and reading a backup back in. The shape is the same JSON the prototype saves under 'stack-v4',
   so data moves between the prototype and the app with a backup file (or a copy and paste). */
import { today } from './util.js';

/**
 * @typedef {{ date: string, t: number }} AsOf  A balance was correct at this moment.
 * @typedef {'week' | 'fortnight' | 'month' | 'quarter' | 'year'} Every
 * @typedef {{ spend: number, pot: number, debt: number, save: number, invest: number }} Split  Percentages of what's left after bills and repayments.
 * @typedef {{ id: string, name: string, amount: number, every: Every, due?: string | null, auto?: boolean, paidTo?: string }} Bill
 *   due: a date it falls due (any one). auto: a direct debit, ticks itself off. paidTo: every due date up to it is paid.
 * @typedef {{ grp: string, amt: number, first: string, n: number }} Inst  A pay-in-4 purchase: n payments of amt, a fortnight apart from first.
 * @typedef {{ id: string, name: string, balance: number, rate: number, min: number, minAmt?: number, minEvery?: Every,
 *   due?: string | null, od?: boolean, free?: boolean, until?: string | null, focus?: boolean, urgent?: boolean, set?: boolean,
 *   card?: boolean, wallet?: boolean, limit?: number, lock?: boolean, in4?: boolean, viaWallet?: boolean, inst?: Inst[], asOf: AsOf | null }} Debt
 *   balance is what was owed at asOf (below 0 is in credit, for cards). min is the repayment as a monthly amount; minAmt/minEvery as entered.
 *   card: credit with a limit. wallet: the everyday card your spending money goes on. viaWallet: its repayments come off that card.
 *   Tags: urgent, focus, set (Fixed); none of them is Steady.
 * @typedef {{ id: string, name: string, cost: number, at?: number | null, bought?: boolean }} Buy  A purchase Savings unlocks. at: a rank it's the reward for.
 * @typedef {'pay' | 'spend' | 'debt' | 'saved' | 'invested' | 'pot' | 'mkt' | 'xout' | 'topay' | 'bill'} MoveType
 * @typedef {{ id: string, t: number, date: string, amount: number, type: MoveType, ref?: string | null, note?: string, src: string,
 *   from?: string, credit?: string, buy?: string, buyOf?: string, items?: string[], grp?: string, pair?: string, acct?: string,
 *   d?: string, stack?: string }} Move
 *   Money that actually moved. from: the account it came out of when that isn't Pay ('buffer', 'pool', 'inv', 'card', 'ext').
 *   credit: spent on that credit. buy: a purchase paid from Savings (buyOf: the part past Savings). pair: the card spend that
 *   paid for the entry with this id. grp: entries recorded together. acct: what an 'xout' took money out of. d: a ticked bill's due date.
 * @typedef {{ name: string, v: number, due?: string | null, every?: boolean, saving?: boolean, avg?: boolean, late?: boolean }} BillDue
 * @typedef {{ bills: number, billList: BillDue[], mins: number, minsBy: Record<string, number>, rem: number, spend: number, card: number,
 *   savings: number, debts: Record<string, number>, save: number, invest: number, pots?: Record<string, number> }} StackPlan
 * @typedef {{ id: string, name: string, d: string, v: number }} LateBill
 * @typedef {{ id: string, t: number, date: string, amount: number, carry: number, cover: number, missed: Record<string, number>,
 *   late: LateBill[], held: Record<string, number>, plan: StackPlan, short: number, spare: number, pk?: string, one?: boolean,
 *   pct?: Split }} PayStack
 *   One stacked pay. pk: the plan it's on. one: on that plan just for this pay (pct is the split it got).
 * @typedef {{ id: string, amount: number, kind: 'saved' | 'inv', by?: string | null, hit?: string | null }} Goal
 * @typedef {{ nw: number, t: number, date: string, stk: string, fresh?: number }} Rank
 * @typedef {{ v: 4, pay: number, freq: 'week' | 'fortnight' | 'month', pct: Split, bills: Bill[], debts: Debt[], buys: Buy[],
 *   moves: Move[], stacks: PayStack[], startSaved: number, startInvested: number, savedAsOf: AsOf | null, investedAsOf: AsOf | null,
 *   startPool: number, poolAsOf: AsOf | null, emMonths: number, ret: number, wr: number, sample: boolean, plan?: string,
 *   names?: Record<string, string>, payAcct?: { start: number, asOf: AsOf }, payIn?: string, estPay?: number, goals?: Goal[],
 *   rank?: Rank, best?: { nw: number, date: string }, settles?: any[], credOwed?: Record<string, number>, rkOwing?: boolean,
 *   lastBackup?: string, qs?: boolean, savedAt?: number, [k: string]: any }} State
 */

export const KEY = 'stack-v4';

/** @returns {State} */
export function blank() {
  return { v: 4, pay: 0, freq: 'fortnight', pct: { spend: 0, pot: 0, debt: 0, save: 0, invest: 0 },
    bills: [], debts: [], buys: [], moves: [], stacks: [],
    startSaved: 0, startInvested: 0, savedAsOf: null, investedAsOf: null, startPool: 0, poolAsOf: null,
    emMonths: 3, ret: 6, wr: 4, sample: false };
}

/** A saved copy, if it is one (normalize it after). @param {any} o @returns {State | null} */
export function fromSaved(o) {
  if (!o || typeof o !== 'object' || o.v !== 4) return null;
  o.buys = o.buys || [];
  return o;
}

/** Anything entered yet? @param {any} st */
export const hasData = st => !!st && ((st.moves || []).length + (st.bills || []).length + (st.debts || []).length + (st.buys || []).length > 0);

/** A backup file's text. @param {State} S @param {string} [at] */
export const makeBackup = (S, at = today()) => JSON.stringify({ app: 'stack', v: 4, at, data: Object.assign({}, S, { lastBackup: at }) });

/**
 * Reads a backup for Restore. Takes what Back up made, and also a plain copy of the data (what this app's
 * old Export copied), so nothing saved before is lost.
 * @param {string} text
 * @returns {{ ok: true, at: string, data: State, counts: { bills: number, debts: number, buys: number, pays: number } } | { ok: false }}
 */
export function readBackup(text) {
  /** @type {any} */
  let o = null; try { o = JSON.parse(String(text || '').trim()); } catch (e) {}
  const d = o && o.app === 'stack' ? o.data : o && o.v === 4 && !o.app ? o : null;
  if (!(d && d.v === 4 && ['bills', 'debts', 'moves', 'stacks'].every(k => Array.isArray(d[k])))) return { ok: false };
  return { ok: true, at: (o.app === 'stack' && o.at) || today(), data: d,
    counts: { bills: d.bills.length, debts: d.debts.length, buys: (d.buys || []).length, pays: d.moves.filter(/** @param {any} m */ m => m.type === 'pay').length } };
}
