// @ts-check
/* Reading PDF statements. pdf.js pulls out each piece of text with its position; readPdfStatement turns those
   positioned pieces into transactions. pdf.js itself is passed in, so this runs in the browser, in Node tests,
   and later inside a WebView in the phone app. */
import { pad2 } from './util.js';
import { MON, parseAmount } from './csv.js';

/** @typedef {{ s: string, x: number, y?: number, w: number }} Piece  A piece of text and where it sits.
 *  @typedef {{ y: number, page: number, items: Piece[] }} Line
 *  @typedef {import('./csv.js').BankLine} BankLine */

/**
 * The text of a PDF as lines of positioned pieces, top to bottom.
 * isEvalSupported: false matters: it stops a malicious PDF from running code (the fix for CVE-2024-4367 in pdf.js 3.x).
 * @param {any} lib pdf.js (window.pdfjsLib in the browser) @param {ArrayBuffer | Uint8Array} data
 * @returns {Promise<Line[]>}
 */
export async function pdfTextLines(lib, data) {
  const doc = await lib.getDocument({ data: new Uint8Array(data), isEvalSupported: false, disableFontFace: true }).promise;
  /** @type {Line[]} */
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    const items = tc.items.filter((/** @type {any} */ i) => i.str && i.str.trim()).map((/** @type {any} */ i) => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5], w: i.width || 0 }));
    items.sort((/** @type {any} */ a, /** @type {any} */ b) => b.y - a.y || a.x - b.x);
    /** @type {Line | null} */
    let cur = null;
    for (const it of items) {
      if (!cur || Math.abs(cur.y - it.y) > 3) { cur = { y: it.y, page: p, items: [] }; lines.push(cur); }
      cur.items.push(it);
    }
  }
  lines.forEach(l => l.items.sort((a, b) => a.x - b.x));
  return lines;
}

const AMT = /^\(?-?\$?(\d{1,3}(,\d{3})+|\d+)\.\d{2}\)?(\s?(CR|DR))?$/i;
/** @param {string} s */
const isAmt = s => AMT.test(s);

/**
 * A date at the start of a statement line. Dates without a year ('03 Sep') take it from the statement period.
 * @param {string} s @param {{ y: number, m: number }} [ctx]
 */
function dateTok(s, ctx) {
  let x, d, m, y = null;
  if ((x = s.match(/^(\d{1,2})[ \-\/]([A-Za-z]{3})[A-Za-z]*(?:[ \-\/,]+(\d{2,4}))?$/))) { d = +x[1]; m = MON[x[2].toUpperCase()]; if (x[3]) y = +x[3]; }
  else if ((x = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/))) { d = +x[1]; m = +x[2]; if (x[3]) y = +x[3]; }
  else return null;
  if (!m || m > 12 || d < 1 || d > 31) return null;
  if (y !== null && y < 100) y += 2000;
  if (y === null) { if (!ctx) return 'nodate-year'; y = m > ctx.m ? ctx.y - 1 : ctx.y; }
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/**
 * Positioned PDF text → transactions. Money in and out is told apart by the Debit and Credit columns,
 * and checked against the running balance. Changes `lines` while splitting joined-up pieces.
 * @param {Line[]} lines @returns {BankLine[]}
 */
export function readPdfStatement(lines) {
  // Split runs that hold a date plus text, or several amounts, into separate positioned pieces.
  lines.forEach(l => {
    /** @type {Piece[]} */
    const out = [];
    l.items.forEach(it => {
      const m = it.s.match(/^(\d{1,2}[ \-\/](?:[A-Za-z]{3,9}|\d{1,2})(?:[ \-\/]\d{2,4})?)\s+(.+)$/);
      if (m && dateTok(m[1])) { const k = m[1].length / it.s.length; out.push({ s: m[1], x: it.x, w: it.w * k }, { s: m[2], x: it.x + it.w * k, w: it.w * (1 - k) }); return; }
      const parts = it.s.split(/\s+/);
      if (parts.length > 1 && parts.every(p => isAmt(p) || /^(CR|DR|\$)$/i.test(p)) && parts.filter(isAmt).length > 1) {
        let off = 0;
        parts.forEach(p => { const i0 = it.s.indexOf(p, off); out.push({ s: p, x: it.x + it.w * i0 / it.s.length, w: it.w * p.length / it.s.length }); off = i0 + p.length; });
        return;
      }
      out.push(it);
    });
    l.items = out;
  });
  // Statement year: the latest full date printed anywhere (the period end).
  /** @type {{ y: number, m: number } | null} */
  let ctx = null;
  lines.forEach(l => {
    const t = l.items.map(i => i.s).join(' ');
    for (const x of t.matchAll(/\b(\d{1,2})[ \-\/]([A-Za-z]{3})[A-Za-z]*[ \-\/,]+(\d{4})\b|\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) {
      const m = x[2] ? MON[x[2].toUpperCase()] : +x[5], y = +(x[3] || x[6]);
      if (m && m <= 12 && y > 2000 && y < 2100 && (!ctx || y * 12 + m > ctx.y * 12 + ctx.m)) ctx = { y, m };
    }
  });
  if (!ctx) { const n = new Date(); ctx = { y: n.getFullYear(), m: n.getMonth() + 1 }; }
  const yr = ctx;
  // Column positions from the table header.
  /** @type {{ debit: { c: number, r: number }, credit: { c: number, r: number }, balance?: { c: number, r: number } } | null} */
  let cols = null;
  for (const l of lines) {
    const f = (/** @type {RegExp} */ re) => l.items.find(i => re.test(i.s));
    const d = f(/^(debits?|withdrawals?|money out|paid out)( \(?\$\)?)?$/i), c = f(/^(credits?|deposits?|money in|paid in)( \(?\$\)?)?$/i), b = f(/^balance( \(?\$\)?)?$/i);
    const at = (/** @type {Piece} */ i) => ({ c: i.x + i.w / 2, r: i.x + i.w });
    if (d && c) { cols = { debit: at(d), credit: at(c), balance: b && at(b) }; break; }
  }
  const colOf = (/** @type {Piece} */ a) => {
    let best = null, bd = 1e9;
    for (const k of /** @type {const} */ (['debit', 'credit', 'balance'])) {
      const c = cols && cols[k]; if (!c) continue;
      const dd = Math.min(Math.abs(a.x + a.w - c.r), Math.abs(a.x + a.w / 2 - c.c));
      if (dd < bd) { bd = dd; best = k; }
    }
    return best;
  };
  const SKIP = /opening balance|closing balance|brought forward|carried forward|^totals?\b|balance b\/f|balance c\/f/i;
  const NOISE = /page \d|continued|statement|account (number|name)|bsb|enquiries|transaction details/i;
  /** @type {{ date: string, desc: string, amts: Piece[], prevBal: number | null }[]} */
  const txs = [];
  /** @type {{ date: string, desc: string, amts: Piece[], prevBal: number | null } | null} */
  let last = null;
  /** @type {Line | null} */
  let lastLine = null;
  /** @type {number | null} */
  let prevBal = null;
  for (const l of lines) {
    const its = l.items;
    let date = null, start = 0;
    if (its[0]) { date = dateTok(its[0].s, yr); start = 1; if (!date && its[1]) { date = dateTok(its[0].s + ' ' + its[1].s, yr); start = 2; } }
    if (!date) start = 0;
    /** @type {Piece[]} */
    const amts = [], words = [];
    for (let i = start; i < its.length; i++) {
      const it = its[i];
      if (isAmt(it.s)) { const nx = its[i + 1]; if (nx && /^(CR|DR)$/i.test(nx.s)) { amts.push(Object.assign({}, it, { s: it.s + ' ' + nx.s })); i++; } else amts.push(it); }
      else if (!/^(CR|DR|\$)$/i.test(it.s)) words.push(it.s);
    }
    const desc = words.join(' ').replace(/\s+/g, ' ').trim();
    const near = lastLine && lastLine.page === l.page && lastLine.y - l.y < 22;
    if (date) {
      if (SKIP.test(desc)) { if (amts.length) prevBal = parseAmount(amts[amts.length - 1].s); last = null; lastLine = l; continue; }
      last = { date, desc, amts, prevBal }; txs.push(last); lastLine = l;
      if (amts.length) prevBal = cols ? (amts.filter(a => colOf(a) === 'balance').map(a => parseAmount(a.s))[0] ?? prevBal) : amts.length > 1 ? parseAmount(amts[amts.length - 1].s) : prevBal;
    } else if (last && near && !amts.length && desc && desc.length < 70 && !NOISE.test(desc)) { last.desc += ' ' + desc; lastLine = l; }
    else if (last && near && amts.length && !last.amts.length) { last.amts = amts; if (desc && !NOISE.test(desc)) last.desc += ' ' + desc; lastLine = l; }
    else if (SKIP.test(desc) && amts.length) { prevBal = parseAmount(amts[amts.length - 1].s); last = null; }
    else if (!near) last = null;
  }
  /** @type {BankLine[]} */
  const out = [];
  /** @type {number | null} */
  let bal = null;
  txs.forEach(tx => {
    /** @type {number | null} */
    let amount = null, b = null;
    if (cols) {
      tx.amts.forEach(a => { const v = parseAmount(a.s), k = colOf(a); if (v === null) return; if (k === 'debit') amount = -Math.abs(v); else if (k === 'credit') amount = Math.abs(v); else if (k === 'balance') b = v; });
    } else if (tx.amts.length) {
      amount = parseAmount(tx.amts[0].s);
      if (tx.amts.length > 1) b = parseAmount(tx.amts[tx.amts.length - 1].s);
      if (amount !== null && !/^-|^\(|DR$/i.test(tx.amts[0].s) && !/CR$/i.test(tx.amts[0].s))
        amount = /SALARY|WAGE|\bPAY\b|DEPOSIT|TRANSFER FROM|REFUND|INTEREST|CREDIT/i.test(tx.desc) && !/PAYMENT|CREDIT CARD/i.test(tx.desc) ? Math.abs(amount) : -Math.abs(amount);
    }
    const before = bal ?? tx.prevBal;
    if (b !== null && before !== null && amount !== null) {
      const delta = Math.round((b - before) * 100) / 100;
      if (Math.abs(Math.abs(delta) - Math.abs(amount)) < 0.01) amount = delta;
    }
    if (b !== null) bal = b;
    if (amount === null || Math.abs(amount) < 0.005) return;
    out.push({ date: tx.date, amount: Math.round(amount * 100) / 100, desc: tx.desc.slice(0, 80) });
  });
  return out;
}
