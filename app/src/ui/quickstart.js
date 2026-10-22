/* ---------- quick start: Build your stack ----------
   How often you're paid, your bills, debts and credit, purchases, what you have now, then your first pay. */
import { FREQ, money, cardAvail, credits, debtNow, savedNow, poolBal, investedNow, UNIT } from '../core/index.js';
import { app, ui, save } from './store.js';
import { $, esc, CHEV } from './dom.js';
import { go, renderAll } from './render.js';
import { fillPlanInputs } from './plan.js';
import { pvReset, renderPayView } from './payview.js';
import { billSheet, debtSheet, buySheet, creditForm } from './forms.js';

const QS = ['How often are you paid?', 'Bills', 'Debts and credit', 'Purchases', 'What you have now', 'Your pay'];
export function openQS() { ui.qs = 0; pvReset(); const q = $('#qs'); q.hidden = false; document.body.classList.add('qs-on'); renderQS(); q.scrollTop = 0; }
export function closeQS() { app.S.qs = true; save(); $('#qs').hidden = true; document.body.classList.remove('qs-on'); go('home'); }
const qsList = (items, act, val) => items.length ? `<div class="grouped">${items.map(x => `<button class="row" type="button" data-act="${act}" data-id="${x.id}"><span class="grow"><b>${esc(x.name)}</b></span><span class="num">${val(x)}</span>${CHEV}</button>`).join('')}</div>` : '';
export function renderQS() {
  const S = app.S, i = ui.qs, last = i === QS.length - 1;
  let body;
  if (i === 0) body = `<div class="seg qs-freq" role="group" aria-label="Paid">${['week', 'fortnight', 'month'].map(k => `<button type="button" data-qsfreq="${k}" aria-selected="${S.freq === k}">${FREQ[k].label}</button>`).join('')}</div>`;
  else if (i === 1) body = qsList(S.bills, 'bill', b => `${money(b.amount)}<small>${UNIT[b.every]}</small>`) + '<button class="btn wide" type="button" data-qsadd="bill">Add a bill</button>';
  else if (i === 2) body = qsList(credits(S), 'credit', d => `${money(cardAvail(S, d))} / ${money(d.limit)}`) + qsList(S.debts.filter(d => !d.card), 'debt', d => money(debtNow(S, d))) + '<div class="duo"><button class="btn" type="button" data-qsadd="credit">Add a credit</button><button class="btn" type="button" data-qsadd="debt">Add a debt</button></div>';
  else if (i === 3) body = qsList(S.buys || [], 'buy', b => money(b.cost)) + '<button class="btn wide" type="button" data-qsadd="buy">Add a purchase</button>';
  else if (i === 4) body = `<div class="grouped"><div class="frow"><span>Buffer</span><button class="nfield" type="button" data-n="saved">${money(savedNow(S))}</button></div><div class="frow"><span>Savings</span><button class="nfield" type="button" data-n="pool">${money(poolBal(S))}</button></div><div class="frow"><span>Invested</span><button class="nfield" type="button" data-n="inv">${money(investedNow(S))}</button></div></div>`;
  else body = '<div class="pv" id="pv-qs"></div>';
  $('#qs').innerHTML = `<div class="qs-in">
    <div class="qs-top"><div class="qs-dots">${QS.map((_, k) => `<span class="${k < i ? 'done' : k === i ? 'now' : ''}"></span>`).join('')}</div><button class="link" type="button" data-qs="skip">${S.qs ? 'Close' : 'Skip'}</button></div>
    <h1 class="large">${last && !S.moves.some(m => m.type === 'pay') ? 'Your first pay' : QS[i]}</h1>
    ${body}
    <div class="qs-nav">${i ? '<button class="btn" type="button" data-qs="back">Back</button>' : '<span></span>'}${last ? '<span></span>' : '<button class="btn primary" type="button" data-qs="next">Next</button>'}</div>
  </div>`;
  if (last) renderPayView($('#pv-qs'));
}
/** Taps inside the quick start. */
export function qsClick(e) {
  const f = e.target.closest('[data-qsfreq]'); if (f) { app.S.freq = f.dataset.qsfreq; save(); fillPlanInputs(); renderAll(); return; }
  const ad = e.target.closest('[data-qsadd]'); if (ad) { ({ bill: () => billSheet(), debt: () => debtSheet(), buy: () => buySheet(), credit: () => creditForm() })[ad.dataset.qsadd](); return; }
  const q = e.target.closest('[data-qs]'); if (!q) return;
  const k = q.dataset.qs;
  if (k === 'next') { ui.qs++; renderQS(); $('#qs').scrollTop = 0; }
  else if (k === 'back') { ui.qs--; renderQS(); }
  else if (k === 'skip') closeQS();
}
