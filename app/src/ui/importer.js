/* Statement import: pick a PDF or CSV, review and relabel each line, import, then always check balances.
   Everything is read on this device. Nothing is uploaded. */
import { money, fmtDate, debtName, order, project, readStatement, pdfTextLines, readPdfStatement, prepImport, pickRow, importRows, sampleCSV } from '../core/index.js';
import { app, ui, save } from './store.js';
import { $, esc, TY, TYK, openSheet, showErr } from './dom.js';
import { balanceSheet } from './forms.js';

export function importSheet() {
  openSheet('Import a statement', `<div class="form">
    <p style="margin:0">Use the statement for the account your pay lands in. PDF or CSV both work. Stack reads it on this device. Nothing gets uploaded.</p>
    <button class="btn primary big" type="button" data-act="pick-file">Choose statement</button>
    <button class="btn wide" type="button" data-act="sample-csv" style="margin-top:0">Try a sample statement</button>
    <p class="muted small">Use the PDF straight from your bank app or internet banking. Scans and photos of statements won't read.</p>
    <p class="err" id="f-err" hidden></p></div>`);
}
export function runImport(text, sample) {
  let txs = [];
  try { txs = readStatement(text); } catch (e) { txs = []; }
  showImport(txs, sample, "Couldn't find dates and amounts in that file. Try the PDF statement or a CSV export from internet banking.");
}
export const runSample = () => runImport(sampleCSV(), true);

function showImport(txs, sample, errMsg) {
  if (!txs.length) { importSheet(); return showErr(errMsg); }
  const r = prepImport(app.S, txs);
  if (!r.rows.length) { importSheet(); return showErr(`Everything in that statement is already imported (${r.already} transactions).`); }
  ui.imp = Object.assign(r, { sample }); ui.open = null;
  $('#sheet-title').textContent = sample ? 'Sample statement' : 'Check and import';
  renderImport();
}

/** The review screen: every line with its label. Tap a row to change it. */
export function renderImport() {
  const S = app.S, I = ui.imp; if (!I) return;
  const rows = I.rows, counts = {}, dates = rows.map(r => r.date).sort();
  rows.forEach(r => { counts[r.type] = (counts[r.type] || 0) + 1; });
  const n = rows.filter(r => r.type !== 'skip').length;
  const chip = r => `<span class="tchip"><i style="background:${TY[r.type].color}"></i>${r.type === 'debt' && r.ref ? esc(debtName(S, r.ref)) : r.amount > 0 && r.type === 'saved' ? 'From savings' : r.amount > 0 && r.type === 'invested' ? 'From investments' : TY[r.type].name}</span>`;
  const pick = (r, i) => `<div class="pick">${TYK.filter(k => k !== 'debt').map(k => `<button type="button" data-ipick="${i}" data-t="${k}" aria-pressed="${r.type === k}">${TY[k].name}</button>`).join('')}
    ${S.debts.length ? order(S.debts).map(d => `<button type="button" data-ipick="${i}" data-t="debt" data-ref="${d.id}" aria-pressed="${r.type === 'debt' && r.ref === d.id}">Debt: ${esc(d.name)}</button>`).join('') : `<button type="button" data-ipick="${i}" data-t="debt" aria-pressed="${r.type === 'debt'}">Debt</button>`}</div>`;
  const list = rows.map((r, i) => `<div class="irow"><button class="irow-main" type="button" data-irow="${i}" aria-expanded="${ui.open === i}">
      <span class="ic"><b>${esc(r.desc || 'No description')}</b><span class="muted">${fmtDate(r.date)}${r.dupe ? ' · already recorded' : ''}</span></span>
      <span class="ir"><span class="num ${r.amount > 0 ? 'pos' : ''}">${r.amount > 0 ? '+' : '−'}${money(Math.abs(r.amount))}</span>${chip(r)}</span></button>${ui.open === i ? pick(r, i) : ''}</div>`).join('');
  $('#sheet-body').innerHTML = `${I.sample ? '<p class="pill warn" style="margin:0 0 10px">This is a sample. Yours will look like this.</p>' : ''}
    <p style="margin:0">${rows.length} transactions, ${fmtDate(dates[0])} to ${fmtDate(dates.at(-1))}.${I.already ? ` ${I.already} already imported and left out.` : ''}</p>
    <div class="tally">${TYK.filter(k => counts[k]).map(k => `<span><i class="chip" style="background:${TY[k].color}"></i>${TY[k].name} ${counts[k]}</span>`).join('')}</div>
    <p class="muted small" style="margin:0 0 10px">Check the labels. Tap a row to change it. Stack remembers your changes for next time.</p>
    <div class="ilist">${list}</div>
    ${I.sample ? '<button class="btn primary big" type="button" data-act="pick-file">Choose your own statement</button>'
      : `<button class="btn primary big" type="button" data-act="commit-import"${n ? '' : ' disabled'}>Import ${n} transaction${n === 1 ? '' : 's'}</button>`}`;
}
export function toggleRow(i) { ui.open = ui.open === i ? null : i; renderImport(); }
export function relabelRow(i, t, ref) { pickRow(ui.imp.rows, i, t, ref); ui.open = null; renderImport(); }

/** Import the reviewed lines, then ask for your real balances. */
export function commitImport() {
  const I = ui.imp; if (!I || I.sample) return;
  const before = project(app.S, { fast: true }).fi;
  const n = importRows(app.S, I.rows);
  ui.imp = null; save();
  balanceSheet(before, n);
}

/* ---------- reading the file ---------- */
/* pdf.js 3.11.174 is bundled in vendor/pdfjs and only loaded when you pick a PDF. The worker script is loaded as a
   plain script, which sets window.pdfjsWorker, so pdf.js runs without a separate Worker (same as the prototype). */
let pdfjsP = null;
const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load')); document.head.appendChild(s); });
function loadPdfJs() {
  if (!pdfjsP) pdfjsP = (async () => {
    await loadScript('vendor/pdfjs/pdf.worker.min.js');
    if (!window.pdfjsWorker) window.pdfjsWorker = window['pdfjs-dist/build/pdf.worker'];
    await loadScript('vendor/pdfjs/pdf.min.js');
    return window.pdfjsLib || window['pdfjs-dist/build/pdf'];
  })().catch(e => { pdfjsP = null; throw e; });
  return pdfjsP;
}

/** A file was picked: read a PDF with pdf.js, or a CSV as text. */
export function readFile(f) {
  importSheet();
  const rd = new FileReader();
  rd.onerror = () => showErr("Couldn't read that file.");
  if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) {
    $('#sheet-body').innerHTML = '<p class="muted" style="margin:6px 0 18px">Reading your statement…</p>';
    rd.onload = async () => {
      try { showImport(readPdfStatement(await pdfTextLines(await loadPdfJs(), rd.result)), false, "Couldn't find transactions in that PDF. If it's a scan or a photo it won't read. Try a CSV export instead."); }
      catch (err) { importSheet(); showErr(err && err.message === 'load' ? "Couldn't load the PDF reader. Try closing and reopening Stack." : "Couldn't open that PDF. It might be password-protected."); }
    };
    rd.readAsArrayBuffer(f);
  } else {
    rd.onload = () => runImport(String(rd.result || ''), false);
    rd.readAsText(f);
  }
}
