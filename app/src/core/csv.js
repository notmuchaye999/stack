// @ts-check
/* Reading CSV bank statements. Works out which column is which, so most Australian bank exports just work. */
import { pad2 } from './util.js';

/** @typedef {{ date: string, amount: number, desc: string }} BankLine  amount is signed: + money in, − money out. */

/** Splits CSV text into rows of cells, handling quotes. @param {string} text @param {string} delim */
export function parseCSV(text, delim) {
  /** @type {string[][]} */
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(c => c.trim())).filter(r => r.some(c => c !== ''));
}

/** @type {Record<string, number>} */
export const MON = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

/** '14/10/2026', '14-Oct-26', '2026-10-14' → '2026-10-14'. Day first, Australian style. @param {unknown} s */
export function parseDate(s) {
  s = String(s || '').trim();
  let d, m, y, x;
  if ((x = /** @type {string} */ (s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) [y, m, d] = [+x[1], +x[2], +x[3]];
  else if ((x = /** @type {string} */ (s).match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:\s|$)/))) [d, m, y] = [+x[1], +x[2], +x[3]];
  else if ((x = /** @type {string} */ (s).match(/^(\d{1,2})[\s\-]([A-Za-z]{3})[A-Za-z]*[\s\-,]+(\d{2,4})/))) [d, m, y] = [+x[1], MON[x[2].toUpperCase()], +x[3]];
  else return null;
  if (y < 100) y += 2000;
  if (!m || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** '$1,234.50', '(45.00)', '45.00 DR', '-45' → a number, or null. @param {unknown} s */
export function parseAmount(s) {
  let t = String(s || '').replace(/[\s$,]/g, '');
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (/CR$/i.test(t)) t = t.slice(0, -2); else if (/DR$/i.test(t)) { neg = !neg; t = t.slice(0, -2); }
  if (!/^[+-]?\d*\.?\d+$/.test(t)) return null;
  const v = parseFloat(t);
  return neg ? -v : v;
}

/**
 * Reads a CSV statement into lines. Finds the header if there is one, otherwise guesses columns from the data.
 * Handles one signed Amount column or separate Debit/Credit columns (either sign convention).
 * @param {string} text @returns {BankLine[]}
 */
export function readStatement(text) {
  text = String(text).replace(/^﻿/, '');
  const first = text.split(/\r?\n/).find(l => l.trim()) || '';
  const delim = [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = parseCSV(text, delim);
  if (!rows.length) return [];
  const H = /date|amount|debit|credit|desc|narrative|details|particulars|payee|memo|balance/i;
  let hi = -1;
  for (let i = 0; i < Math.min(5, rows.length); i++) if (rows[i].some(c => H.test(c)) && !rows[i].some(c => parseDate(c))) { hi = i; break; }
  const data = rows.slice(hi + 1);
  if (!data.length) return [];
  const nc = Math.max(...data.map(r => r.length));
  const col = { date: -1, amount: -1, debit: -1, credit: -1, desc: -1 };
  if (hi >= 0) {
    const h = rows[hi].map(c => c.toLowerCase()), find = (/** @type {RegExp} */ re) => h.findIndex(x => re.test(x));
    col.date = find(/date/);
    col.debit = find(/debit|withdraw|money out|paid out/);
    col.credit = find(/credit|deposit|money in|paid in/);
    col.amount = h.findIndex(x => /amount|value/.test(x) && !/debit|credit|balance|date/.test(x));
    for (const re of [/desc/, /narrative/, /details/, /particulars/, /payee|merchant/, /memo|reference/]) { const i = find(re); if (i >= 0) { col.desc = i; break; } }
  }
  const smp = data.slice(0, 60);
  const score = (/** @type {number} */ c, /** @type {(v: string) => boolean} */ f) => { let n = 0, t = 0; smp.forEach(r => { const v = (r[c] || '').trim(); if (v) { t++; if (f(v)) n++; } }); return t ? n / t : 0; };
  if (col.date < 0) {
    let best = 0;
    for (let c = 0; c < nc; c++) { const s = score(c, v => !!parseDate(v)); if (s > best) { best = s; col.date = c; } }
    if (best < 0.6) return [];
  }
  if (col.amount < 0 && !(col.debit >= 0 && col.credit >= 0)) {
    for (let c = 0; c < nc; c++) if (c !== col.date && score(c, v => parseAmount(v) !== null) >= 0.8) { col.amount = c; break; }
    if (col.amount < 0) return [];
  }
  if (col.desc < 0) {
    let best = -1;
    for (let c = 0; c < nc; c++) {
      if ([col.date, col.amount, col.debit, col.credit].includes(c)) continue;
      let len = 0; smp.forEach(r => { const v = r[c] || ''; if (parseAmount(v) === null) len += v.length; });
      if (len > best) { best = len; col.desc = c; }
    }
  }
  /** @type {BankLine[]} */
  const out = [];
  data.forEach(r => {
    const date = parseDate(r[col.date]); if (!date) return;
    let amt;
    if (col.amount >= 0) amt = parseAmount(r[col.amount]);
    else { const cr = parseAmount(r[col.credit]), db = parseAmount(r[col.debit]); if (cr === null && db === null) return; amt = Math.abs(cr || 0) - Math.abs(db || 0); }
    if (amt === null || Math.abs(amt) < 0.005) return;
    out.push({ date, amount: Math.round(amt * 100) / 100, desc: String(r[col.desc] || '').replace(/\s+/g, ' ').trim() });
  });
  return out;
}
