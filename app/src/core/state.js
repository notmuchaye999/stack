// @ts-check
/* What Stack saves, and how older or imported copies are brought up to date. The shape is the same JSON the
   prototype saved under 'stack-v4', so data moves between versions with a copy and paste. */
import { now, uid } from './util.js';

/**
 * @typedef {{ date: string, t: number }} AsOf  A balance was correct at this moment.
 * @typedef {'week' | 'fortnight' | 'month' | 'quarter' | 'year'} Every
 * @typedef {{ spend: number, debt: number, save: number, invest: number }} Split  Percentages.
 * @typedef {{ id: string, name: string, amount: number, every: Every }} Bill
 * @typedef {{ id: string, name: string, balance: number, rate: number, min: number, minAmt?: number, minEvery?: Every,
 *   od?: boolean, free?: boolean, until?: string | null, focus?: boolean, asOf: AsOf | null }} Debt
 *   balance is what was owed at asOf. min is the repayment converted to a monthly amount; minAmt/minEvery are as entered.
 * @typedef {{ id: string, name: string, cost: number, by: string, bought?: boolean }} Buy  A planned buy.
 * @typedef {'pay' | 'spend' | 'bill' | 'debt' | 'saved' | 'invested' | 'skip'} MoveType
 * @typedef {{ id: string, t: number, date: string, amount: number, type: MoveType, ref?: string | null, buy?: string,
 *   note?: string, src: 'manual' | 'import' | 'stack', stack?: string, bank?: number, key?: string | null }} Move
 *   Money that actually moved. For imports, bank is the signed bank amount and key groups similar lines.
 * @typedef {{ bills: number, buys: number, buyNames: string[], spend: number, debts: Record<string, number>, save: number, invest: number }} StackPlan
 * @typedef {{ id: string, t: number, date: string, amount: number, plan: StackPlan, short: number, spare: number }} PayStack
 * @typedef {{ key: string, pos: boolean, type: MoveType, ref: string | null }} Rule  A label you taught the importer.
 * @typedef {{ v: 4, pay: number, freq: 'week' | 'fortnight' | 'month', pct: Split, bills: Bill[], debts: Debt[], buys: Buy[],
 *   moves: Move[], stacks: PayStack[], rules: Rule[], seen: string[], startSaved: number, startInvested: number,
 *   savedAsOf: AsOf | null, investedAsOf: AsOf | null, emMonths: number, ret: number, wr: number, sample: boolean }} State
 */

export const KEY = 'stack-v4', OLD_KEY = 'stack-v3';

/** @returns {State} */
export function blank() {
  return { v: 4, pay: 0, freq: 'fortnight', pct: { spend: 0, debt: 0, save: 0, invest: 0 },
    bills: [], debts: [], buys: [], moves: [], stacks: [], rules: [], seen: [],
    startSaved: 0, startInvested: 0, savedAsOf: null, investedAsOf: null,
    emMonths: 3, ret: 6, wr: 4, sample: false };
}

/** Brings a version 3 save up to version 4. @param {any} o @returns {State} */
export function migrate(o) {
  const n = blank(), p = o.pct || {};
  Object.assign(n, { pay: o.pay || 0, freq: o.freq || 'fortnight', emMonths: o.emMonths ?? 3, ret: o.ret ?? 6, wr: o.wr || 4,
    startSaved: o.startSaved || 0, startInvested: o.startInvested || 0, bills: o.bills || [] });
  n.pct = { spend: (p.everyday || 0) + (p.fun || 0), debt: p.debt || 0, save: p.emerg || 0, invest: p.invest || 0 };
  n.debts = (o.debts || []).map(/** @param {any} d */ d => ({ id: d.id, name: d.name, balance: d.balance, rate: d.rate, min: d.min, od: false, asOf: now() }));
  (o.pays || []).forEach(/** @param {any} p */ p => n.moves.push({ id: uid(), t: Date.now(), date: p.date, amount: p.amount, type: 'pay', note: 'Pay', src: 'manual' }));
  (o.spends || []).forEach(/** @param {any} s */ s => n.moves.push({ id: uid(), t: Date.now(), date: s.date, amount: s.amount, type: 'spend', note: s.note || 'Spend', src: 'manual' }));
  return n;
}

/** A saved version 4 object, with lists added that older v4 saves didn't have yet. @param {any} o @returns {State | null} */
export function fromV4(o) {
  if (!o || typeof o !== 'object' || o.v !== 4) return null;
  o.buys = o.buys || [];
  return o;
}

/** A version 3 save, if it is one. Sample data isn't carried over. @param {any} o @returns {State | null} */
export function fromV3(o) {
  const looks = o && typeof o === 'object' && o.v !== 4 && ['pays', 'spends', 'debts', 'bills'].some(k => Array.isArray(o[k]));
  return looks && !o.sample ? migrate(o) : null;
}

/**
 * Reads pasted data for Plan → Data → Import. Accepts what Export (or the prototype's "Copy my data") produced.
 * @param {string} text
 * @returns {{ ok: true, state: State, summary: string } | { ok: false, error: string }}
 */
export function readImport(text) {
  let o;
  try { o = JSON.parse(String(text || '').trim()); } catch (e) { return { ok: false, error: "That isn't Stack data. Paste everything Export copied, from the first { to the last }." }; }
  const st = fromV4(o) || fromV3(o);
  if (!st || !Array.isArray(st.moves) || !Array.isArray(st.debts) || !Array.isArray(st.bills) || !st.pct) return { ok: false, error: "That doesn't look like Stack data." };
  for (const k of ['stacks', 'rules', 'seen', 'buys']) if (!Array.isArray(/** @type {any} */ (st)[k])) /** @type {any} */ (st)[k] = [];
  return { ok: true, state: st, summary: summarize(st) };
}

/** '12 pays, 40 other entries, 5 bills, 3 debts'. @param {State} S */
export function summarize(S) {
  const pays = S.moves.filter(m => m.type === 'pay').length, other = S.moves.length - pays;
  const n = (/** @type {number} */ k, /** @type {string} */ w) => `${k} ${w}${k === 1 ? '' : 's'}`;
  return [n(pays, 'pay'), `${other} other ${other === 1 ? 'entry' : 'entries'}`, n(S.bills.length, 'bill'), n(S.debts.length, 'debt'), n(S.buys.length, 'planned buy')].join(', ');
}
