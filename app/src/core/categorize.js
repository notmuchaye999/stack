// @ts-check
/* Statement import: label each bank line, leave out what's already in, and remember the labels you teach it.
   Balances never come from adding up one account's transfers. After an import, you're asked for them. */
import { uid, daysBetween } from './util.js';
import { order, debtNow } from './balances.js';

/** @import { State, Move, MoveType } from './state.js' */
/** @import { BankLine } from './csv.js' */
/** @typedef {BankLine & { hash: string, key: string, type: MoveType, ref: string | null, dupe?: boolean, user?: boolean }} ImportRow */

const STOP = new Set(['CARD', 'BANK', 'ACCOUNT', 'ACCT', 'PAYMENT', 'TRANSFER', 'DIRECT', 'DEBIT', 'CREDIT', 'BILL', 'BILLS', 'MONTHLY', 'WEEKLY', 'OVERDRAWN', 'SAVINGS', 'FROM', 'WITH', 'LOAN']);
/** A description with dates, times and long reference numbers taken out, so the same payee matches each time. @param {string} s */
export const norm = s => String(s).toUpperCase().replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, ' ').replace(/\d{1,2}:\d{2}/g, ' ').replace(/\d{5,}/g, '#').replace(/\s+/g, ' ').trim();
/** What groups similar bank lines and labels you've taught. @param {string} s */
export const ruleKey = s => norm(s).slice(0, 24);
/** @param {string} s */
const words = s => String(s).toUpperCase().split(/[^A-Z0-9]+/).filter(w => w.length >= 4 && !STOP.has(w));
const INV_RE = /COMMSEC|PEARLER|\bSTAKE\b|VANGUARD|RAIZ|SPACESHIP|SUPERHERO|SELFWEALTH|BETASHARES|\bINVEST\b|INVESTING/;
const SAV_RE = /SAVER|SAVINGS|\bGOAL\b|HIGH INTEREST/;

/** Bank amounts are signed (+ in, − out). Savings and investing store money put away, so money coming back out is negative.
 *  @param {MoveType} type @param {number} bank */
export const signedAmt = (type, bank) => type === 'saved' || type === 'invested' ? -bank : Math.abs(bank);
/** The signed bank amount of an entry. @param {Move} m */
export const bankOf = m => m.bank ?? (m.type === 'pay' ? m.amount : -m.amount);
/** @param {Move} m */
export const keyOf = m => m.key ?? (m.src === 'import' ? ruleKey(m.note || '') : null);
/** @param {State} S */
const owingDebt = S => order(S.debts).find(d => !d.od && debtNow(S, d) > 0.005) || order(S.debts).find(d => debtNow(S, d) > 0.005);

/**
 * A first guess at what a bank line is. Your remembered labels win; then pay, savings, investments, your debts and bills by name.
 * @param {State} S @param {BankLine} tx @param {BankLine[]} all the other lines in this statement
 * @returns {{ type: MoveType, ref?: string | null }}
 */
export function categorize(S, tx, all) {
  const n = norm(tx.desc), k = ruleKey(tx.desc), pos = tx.amount > 0;
  const r = (S.rules || []).find(r => r.pos === pos && r.key === k);
  if (r) return { type: r.type, ref: r.ref && S.debts.some(d => d.id === r.ref) ? r.ref : null };
  const inv = INV_RE.test(n) && !/DIRECT INVESTMENT/.test(n), sav = SAV_RE.test(n);
  if (pos) {
    if (/SALARY|WAGES?|PAYROLL|\bPAY\b/.test(n) && !/PAYPAL|PAY ?ID|AFTERPAY|APPLE PAY|GOOGLE PAY/.test(n)) return { type: 'pay' };
    // Money coming back from savings or investments is a withdrawal, not income.
    if (inv) return { type: 'invested' };
    if (sav) return { type: 'saved' };
    if (S.pay > 0 && tx.amount >= S.pay * 0.6) return { type: 'pay' };
    if (tx.amount >= 300 && all.some(o => o !== tx && o.amount > 0 && Math.abs(o.amount - tx.amount) <= tx.amount * 0.15)) return { type: 'pay' };
    return { type: 'skip' };
  }
  for (const d of order(S.debts)) if (words(d.name).some(w => n.includes(w))) return { type: 'debt', ref: d.id };
  for (const b of S.bills) if (words(b.name).some(w => n.includes(w))) return { type: 'bill' };
  if (/AFTERPAY|ZIP ?PAY|ZIP ?MONEY|HUMM|LATITUDE|KLARNA|BNPL|REPAYMENT|CREDIT CARD|\bLOAN\b/.test(n)) { const d = owingDebt(S); return { type: 'debt', ref: d ? d.id : null }; }
  if (inv) return { type: 'invested' };
  if (sav) return { type: 'saved' };
  if (/DIRECT DEBIT|TELSTRA|OPTUS|VODAFONE|\bAGL\b|ORIGIN|ENERGY|INSURANCE|NETFLIX|SPOTIFY|\bSTAN\b|DISNEY|YOUTUBE|\bGYM\b|\bRENT\b|\bREGO\b|\bTMR\b|RACQ|NRMA|AAMI|YOUI|ALLIANZ|BUDGET DIRECT/.test(n)) return { type: 'bill' };
  return { type: 'spend' };
}

/**
 * Gets statement lines ready for the review screen: leaves out lines from earlier imports, labels the rest,
 * and marks lines matching something you recorded by hand (same amount within 3 days) as already recorded.
 * @param {State} S @param {BankLine[]} txs @returns {{ rows: ImportRow[], already: number }}
 */
export function prepImport(S, txs) {
  const seen = new Set(S.seen || []), /** @type {Record<string, number>} */ occ = {}, /** @type {ImportRow[]} */ fresh = [];
  let already = 0;
  txs.forEach(t => {
    const tx = /** @type {ImportRow} */ (t);
    const base = `${tx.date}|${tx.amount.toFixed(2)}|${norm(tx.desc)}`;
    occ[base] = (occ[base] || 0) + 1;
    tx.hash = base + '#' + occ[base];
    tx.key = ruleKey(tx.desc);
    if (seen.has(tx.hash)) already++; else fresh.push(tx);
  });
  const used = new Set();
  fresh.forEach(tx => {
    const c = categorize(S, tx, fresh); tx.type = c.type; tx.ref = c.ref || null;
    const abs = Math.abs(tx.amount);
    const twin = S.moves.find(m => m.src !== 'import' && !used.has(m.id) && Math.abs(m.amount - abs) < 0.01 && Math.abs(daysBetween(m.date, tx.date)) <= 3);
    if (twin) { used.add(twin.id); tx.dupe = true; tx.type = 'skip'; }
  });
  fresh.sort((a, b) => b.date.localeCompare(a.date));
  return { rows: fresh, already };
}

/** Relabel one row on the review screen. Lines that look the same (and that you haven't touched) follow it.
 *  @param {ImportRow[]} rows @param {number} i @param {MoveType} t @param {string | null} [ref] */
export function pickRow(rows, i, t, ref) {
  const r = rows[i];
  Object.assign(r, { type: t, ref: t === 'debt' ? (ref || null) : null, user: true, dupe: false });
  rows.forEach(o => { if (o !== r && !o.user && !o.dupe && o.key === r.key && (o.amount > 0) === (r.amount > 0)) Object.assign(o, { type: r.type, ref: r.ref }); });
}

/** @param {string} s */
export const tidy = s => (s || 'Bank entry').replace(/\s+/g, ' ').trim().slice(0, 40);

/**
 * Saves the reviewed rows: remembers every line so it's never imported twice, adds the ones not skipped,
 * and remembers the labels you changed. Returns how many entries were added.
 * @param {State} S @param {ImportRow[]} rows
 */
export function importRows(S, rows) {
  let n = 0;
  S.seen = S.seen || []; S.rules = S.rules || [];
  rows.forEach(r => {
    S.seen.push(r.hash);
    if (r.type !== 'skip') { S.moves.push({ id: uid(), t: Date.now() + n, date: r.date, amount: signedAmt(r.type, r.amount), bank: r.amount, key: r.key, type: r.type, ref: r.type === 'debt' ? r.ref : null, note: tidy(r.desc), src: 'import' }); n++; }
    if (r.user) { S.rules = S.rules.filter(x => !(x.key === r.key && x.pos === r.amount > 0)); S.rules.push({ key: r.key, pos: r.amount > 0, type: r.type, ref: r.ref }); }
  });
  if (S.rules.length > 300) S.rules = S.rules.slice(-300);
  if (S.seen.length > 5000) S.seen = S.seen.slice(-5000);
  autoPay(S); S.sample = false;
  return n;
}

/** If you haven't set a usual pay, take it (and how often) from the pays imported. @param {State} S */
export function autoPay(S) {
  const pays = S.moves.filter(m => m.type === 'pay').sort((a, b) => a.date.localeCompare(b.date));
  if (!pays.length || S.pay > 0) return;
  const amts = pays.map(p => p.amount).sort((a, b) => a - b);
  S.pay = Math.round(amts[Math.floor(amts.length / 2)] * 100) / 100;
  if (pays.length >= 2) {
    const gaps = pays.slice(1).map((p, i) => daysBetween(pays[i].date, p.date)).filter(g => g > 2).sort((a, b) => a - b);
    const g = gaps[Math.floor(gaps.length / 2)];
    if (g) S.freq = g <= 10 ? 'week' : g <= 20 ? 'fortnight' : 'month';
  }
}

/* Same-looking bank lines (same description start, same direction) move together and teach the importer. */
/** @param {State} S @param {Move} m */
export const similarTo = (S, m) => { const k = keyOf(m); return k ? S.moves.filter(x => x !== m && x.src === 'import' && keyOf(x) === k && (bankOf(x) > 0) === (bankOf(m) > 0)) : []; };
/** Relabel an entry, everything like it, and future imports. Returns how many entries changed.
 *  @param {State} S @param {Move} m @param {MoveType} t @param {string | null} [ref] */
export function relabel(S, m, t, ref) {
  const all = [m, ...similarTo(S, m)], k = keyOf(m), pos = bankOf(m) > 0;
  all.forEach(x => { const b = bankOf(x); Object.assign(x, { bank: b, key: keyOf(x), type: t, ref: t === 'debt' ? (ref || null) : null, amount: signedAmt(t, b) }); });
  if (k) { S.rules = (S.rules || []).filter(r => !(r.key === k && r.pos === pos)); S.rules.push({ key: k, pos, type: t, ref: t === 'debt' ? (ref || null) : null }); }
  return all.length;
}

/** Removes every imported entry (labels you taught are kept). Returns how many. @param {State} S */
export function dropImports(S) {
  const n = S.moves.filter(m => m.src === 'import').length;
  S.moves = S.moves.filter(m => m.src !== 'import'); S.seen = [];
  return n;
}
