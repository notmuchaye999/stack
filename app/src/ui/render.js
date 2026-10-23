/* Redrawing after anything changes, moving between tabs, and Undo. Only the screen you're on gets drawn. */
import { restack, derive, normalize, latestStack, daysBetween, today, periodDays, money, money0, touch } from '../core/index.js';
import { app, ui, save } from './store.js';
import { $, toast, toastQ, tg, page, toTop } from './dom.js';
import { closeSheet } from './sheet.js';
import { renderHome } from './home.js';
import { renderSaved } from './accounts.js';
import { renderStack } from './stack.js';
import { renderBills } from './bills.js';
import { renderPlanTab, fillPlanInputs } from './plan.js';
import { renderRank, checkRankUI } from './rank.js';
import { renderQS, openQS } from './quickstart.js';
import { pvReset } from './payview.js';

export function renderAll() {
  touch();
  // The pay you're in stays live: change a bill, a debt or your plan and it re-stacks.
  if (restack(app.S)) save();
  const D = derive(app.S);
  app.P = D.P; app.PL = D.PL; app.metric = D.metric;
  renderRank(); checkRankUI();
  const t = ui.tab;
  if (t === 'home') renderHome(D);
  else if (t === 'saved') renderSaved(D);
  else if (t === 'stack') renderStack();
  else if (t === 'bills') renderBills(D);
  else if (t === 'plan') renderPlanTab(D);
  if (!$('#qs').hidden) renderQS();
  tween();
}

/** Undo: put your data back the way it was. */
export const undoOf = s => () => { toastQ.length = 0; tg.gen++; app.S = normalize(JSON.parse(s)); save(); closeSheet(); fillPlanInputs(); renderAll(); toast('Undone'); };
/** Save, close the sheet, redraw and say what happened, with Undo. */
export function commit(msg) { const s = app.SNAP; save(); closeSheet(); fillPlanInputs(); renderAll(); toast(msg, s ? undoOf(s) : null); }

export function go(tab) {
  const S = app.S;
  if (tab === 'spent') tab = 'stack';
  if (tab === 'stack' && !S.bills.length && !S.debts.length && !S.moves.length) { openQS(); return; }
  if (tab === 'stack') { const s = latestStack(S); ui.stackNew = !s || daysBetween(s.date, today()) >= periodDays(S); }
  const prev = ui.tab; ui.sc[prev] = page().scrollTop;
  ui.tab = tab; document.body.dataset.tab = tab;
  ['home', 'saved', 'stack', 'bills', 'plan'].forEach(t => { $('#tab-' + t).hidden = t !== tab; });
  document.querySelectorAll('.tabbar [data-go]').forEach(b => b.setAttribute('aria-current', b.dataset.go === tab ? 'page' : 'false'));
  if (tab === 'stack' && ui.stackNew) pvReset();
  if (tab === 'plan') fillPlanInputs();
  renderAll(); toTop(tab === prev ? 0 : ui.sc[tab] || 0);
}

/* Motion: a number or bar that changed since it was last on screen counts or slides to its new value, then lands on
   the exact figure. A render mid-way carries the same move on. Reduced motion skips it. */
const TW = { v: {}, w: {}, a: {}, b: {} }, TWD = 650, ease = p => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);
function tween() {
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches, t = performance.now();
  document.querySelectorAll('[data-tw]').forEach(el => {
    const k = el.dataset.tw, v = +el.dataset.v, fin = el.textContent, run = TW.a[k];
    let from, t0;
    if (run && Math.abs(run.to - v) < 0.005 && t - run.t0 < TWD) ({ from, t0 } = run);
    else {
      const old = TW.v[k]; TW.v[k] = v;
      if (calm || old === undefined || Math.abs(old - v) < 0.5 || !el.offsetParent) return;
      from = old; t0 = t; TW.a[k] = { from, to: v, t0 };
    }
    const step = n => { if (!el.isConnected) return; const p = (n - t0) / TWD; el.textContent = p < 1 ? (fin.includes('.') ? money : money0)(from + (v - from) * ease(p)) : fin; if (p < 1) requestAnimationFrame(step); };
    step(t);
  });
  document.querySelectorAll('[data-bw]').forEach(el => {
    const k = el.dataset.bw, w = parseFloat(el.style.width) || 0, run = TW.b[k];
    let from, left = TWD;
    if (run && Math.abs(run.to - w) < 0.05 && t - run.t0 < TWD) { from = run.from + (w - run.from) * ease((t - run.t0) / TWD); left = TWD - (t - run.t0); }
    else {
      const old = TW.w[k]; TW.w[k] = w;
      if (calm || old === undefined || Math.abs(old - w) < 0.05 || !el.offsetParent) return;
      from = old; TW.b[k] = { from, to: w, t0: t };
    }
    el.style.transition = 'none'; el.style.width = from + '%'; void el.offsetWidth;
    el.style.transition = `width ${Math.round(left)}ms cubic-bezier(.2,.8,.2,1)`; el.style.width = w + '%';
  });
}
