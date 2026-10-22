/* Small page helpers shared by every screen: finding elements, escaping text, icons, colours, toasts. */
import { impTxt, TYPE_NAMES } from '../core/index.js';
import { app } from './store.js';

export const $ = s => document.querySelector(s);
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- icons ---------- */
export const CHEV = '<svg class="chev" width="8" height="13" viewBox="0 0 8 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m1.5 1.5 5 5-5 5"/></svg>';
export const TICK = '<svg width="12" height="10" viewBox="0 0 12 10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m1.5 5 3 3 6-6.5"/></svg>';
export const MOVED_IC = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h15l-4-4M20 16H5l4 4"/></svg>';
export const SPENT_IC = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></svg>';
export const TROPHY = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>';
export const LOCK = '<svg class="cf-lock" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
export const LOCKI = '<svg class="lk-i" width="10" height="12" viewBox="0 0 11 13" aria-hidden="true"><rect x="1" y="5.5" width="9" height="6.5" rx="1.5" fill="currentColor"/><path d="M3 5.5V4a2.5 2.5 0 0 1 5 0v1.5" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
export const XI = '<svg width="13" height="13" viewBox="0 0 14 14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8"/></svg>';

/* ---------- colour only means money ---------- */
/** The five parts of a pay's split. */
export const BM = {
  spend:  { name: 'Spending', hint: 'Food, fuel and fun', color: 'var(--c-spend)' },
  pot:    { name: 'Savings', hint: 'For purchases. They unlock as it grows', color: 'var(--c-buy)' },
  debt:   { name: 'Debt', hint: 'On top of minimums, which come out first', color: 'var(--c-debt)' },
  save:   { name: 'Buffer', hint: 'Until your emergency fund is full', color: 'var(--c-save)' },
  invest: { name: 'Invest', hint: 'Plus anything left over', color: 'var(--c-invest)' },
};
const TYC = { pay: 'var(--c-pay)', spend: 'var(--c-spend)', debt: 'var(--c-debt)', saved: 'var(--c-save)', invested: 'var(--c-invest)', pot: 'var(--c-buy)', mkt: 'var(--c-invest)', xout: 'var(--muted)', topay: 'var(--c-pay)', bill: 'var(--c-bills)' };
/** Every kind of entry, with its name and colour. */
export const TY = Object.fromEntries(Object.keys(TYC).map(k => [k, { name: TYPE_NAMES[k], color: TYC[k] }]));
/** Each plan in the colour of the money it puts first. Custom has no one thing, so it stays ink. */
export const PLAN_C = { fi: 'var(--c-invest)', debt: 'var(--c-debt)', bal: 'var(--c-save)', tight: 'var(--c-spend)', custom: 'var(--ink)' };
/** A kind of money from core ('debt', 'buy' …) as its colour. */
export const tone = c => `var(--c-${c})`;

/* How an entry moved the main date, as a coloured tag. */
export const impCls = d => d === null || Math.abs(d) < 1 ? '' : d > 0 ? 'later' : 'sooner';
export const impHTML = d => d === null ? '' : `<span class="imp ${impCls(d)}">${impTxt(app.S, d)}</span>`;

export function showErr(t) { const e = $('#f-err'); if (!e) return; e.textContent = t; e.hidden = false; }
/** A delete button that needs a second tap. */
export function twoTap(btn, label, fn) { btn.onclick = () => { if (btn.dataset.armed) fn(); else { btn.dataset.armed = '1'; btn.textContent = label; } }; }

/* ---------- toasts ----------
   Toasts sit just above the tab bar. One with Undo stays 5 seconds, and anything else waits for it instead of bumping it. */
let toastT, UNDO = null;
export const toastQ = [];
export const tg = { gen: 0 };
export function toast(msg, undo) {
  const t = $('#toast');
  if (UNDO && !undo && t.classList.contains('show')) { toastQ.push(msg); return; }
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button" data-undo>Undo</button>' : ''}`;
  UNDO = undo || null; t.classList.toggle('has-undo', !!undo); t.classList.add('show'); clearTimeout(toastT);
  toastT = setTimeout(() => { t.classList.remove('show'); UNDO = null; const n = toastQ.shift(); if (n) setTimeout(() => toast(n), 240); }, undo ? 5000 : 2600);
}
/** The Undo button was tapped. */
export function runUndo() { const f = UNDO; UNDO = null; clearTimeout(toastT); $('#toast').classList.remove('show'); if (f) f(); }
