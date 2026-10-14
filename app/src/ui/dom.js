/* Small page helpers shared by every screen: finding elements, escaping text, colours, sheets and toasts. */
import { ui } from './store.js';
import { impTxt, spanTxt } from '../core/index.js';

export const $ = s => document.querySelector(s);
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const CHEV = '<svg class="chev" width="8" height="13" viewBox="0 0 8 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m1.5 1.5 5 5-5 5"/></svg>';
export const TICK = '<svg width="12" height="10" viewBox="0 0 12 10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m1.5 5 3 3 6-6.5"/></svg>';

/* The four parts of the split, and every entry label, with their names and colours. */
export const BM = {
  spend:  { name: 'Spending', hint: 'Onto your card for food, fuel and fun', color: 'var(--c-spend)' },
  debt:   { name: 'Extra debt', hint: 'On top of minimums. Overdrawn accounts first, then highest interest', color: 'var(--c-debt)' },
  save:   { name: 'Savings', hint: 'Your emergency fund, until it hits your target', color: 'var(--c-save)' },
  invest: { name: 'Invest', hint: 'Catches everything that rolls over', color: 'var(--c-invest)' },
};
export const TY = {
  pay:      { name: 'Pay in', color: 'var(--c-pay)' },
  spend:    { name: 'Spent', color: 'var(--c-spend)' },
  bill:     { name: 'Bill', color: 'var(--c-bills)' },
  debt:     { name: 'Debt', color: 'var(--c-debt)' },
  saved:    { name: 'Saved', color: 'var(--c-save)' },
  invested: { name: 'Invested', color: 'var(--c-invest)' },
  skip:     { name: 'Skip', color: 'var(--line)' },
};
export const TYK = Object.keys(TY);
/** A stage's tone ('debt', 'save', 'invest') as its colour. */
export const toneColor = t => `var(--c-${t})`;

/* How an entry moved the FI date, as a coloured tag or a sentence. */
export const impCls = d => d === null || Math.abs(d) < 1 ? '' : d > 0 ? 'later' : 'sooner';
export const impHTML = d => d === null ? '' : `<span class="imp ${impCls(d)}">${impTxt(d)}</span>`;
export function impSentence(d, past) {
  if (d === null) return '';
  if (d === Infinity) return past ? 'This put FI out of reach at your current pace.' : 'Puts FI out of reach at your current pace.';
  if (d === -Infinity) return past ? 'This brought FI back within reach.' : 'Brings FI back within reach.';
  const a = Math.abs(d);
  if (a < 1) return past ? 'This barely moved your FI date.' : 'Barely moves your FI date.';
  const s = `<b>${spanTxt(a)}</b>`;
  if (d > 0) return past ? `This pushed your FI date back ${s}.` : `Pushes your FI date back ${s}.`;
  return past ? `This brought your FI date ${s} closer.` : `Brings your FI date ${s} closer.`;
}

/* ---------- bottom sheets ---------- */
export function openSheet(title, body) {
  const sh = $('#sheet');
  sh.innerHTML = `<div class="grab"></div><div class="sheet-head"><h2 id="sheet-title">${title}</h2><button class="link" type="button" data-act="close">Close</button></div><div id="sheet-body">${body}</div>`;
  $('#scrim').hidden = false; sh.hidden = false; sh.scrollTop = 0;
  requestAnimationFrame(() => requestAnimationFrame(() => sh.classList.add('open')));
}
export function closeSheet() {
  const sh = $('#sheet'); sh.classList.remove('open'); $('#scrim').hidden = true; ui.imp = null;
  setTimeout(() => { if (!sh.classList.contains('open')) { sh.hidden = true; sh.innerHTML = ''; } }, 230);
}
export function showErr(t) { const e = $('#f-err'); if (!e) return; e.textContent = t; e.hidden = false; }
/** A delete button that needs a second tap. */
export function twoTap(btn, label, fn) { btn.onclick = () => { if (btn.dataset.armed) fn(); else { btn.dataset.armed = '1'; btn.textContent = label; } }; }
/** Same, for buttons that reset after 4 seconds (Reset, Clear everything). */
export function arm(a, fn) {
  if (a.dataset.armed) { clearTimeout(a._t); delete a.dataset.armed; a.textContent = a.dataset.label; fn(); }
  else { a.dataset.armed = '1'; a.textContent = a.dataset.armedLabel; a._t = setTimeout(() => { delete a.dataset.armed; a.textContent = a.dataset.label; }, 4000); }
}

let toastT;
export function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
