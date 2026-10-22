/* ---------- the pay screen: amount, its stack, plans to pick from ----------
   Used by the quick start and the Stack tab. Every plan is worked out with this pay included. */
import { BK, today, money, money0, monthYear, heldOf, heldSum, nameOf, payPlans, pvSel, owes, PLANS, planName, cardBudget, potTotal,
  customPct, evalPlan, dateIn, stackPay, pvMore, preSettle, settleRank, tierName } from '../core/index.js';
import { app, ui, save } from './store.js';
import { $, esc, BM, toast } from './dom.js';
import { openSheet, closeSheet, keypad, showStr } from './sheet.js';
import { receiptHTML } from './stack.js';
import { renderAll, undoOf } from './render.js';
import { fillSplit } from './plan.js';
import { showSettle } from './rank.js';
import { closeQS } from './quickstart.js';

export const PV = { date: null, pick: null, custom: null, padOpen: true, root: null, mine: false };
let pvT = null;
// Typing shows the amount straight away; the plans work themselves out a moment after you stop.
const PVpad = { str: '', dec: 2, max: 1e7, onChange: () => { pvQuick(PV.root); clearTimeout(pvT); pvT = setTimeout(() => updatePayView(PV.root), 150); } };
export function pvReset() { clearTimeout(pvT); PVpad.str = ''; Object.assign(PV, { date: today(), pick: null, custom: null, padOpen: true, mine: false }); }

export function renderPayView(root) {
  if (!root) return;
  PV.root = root;
  if (!PV.date) pvReset();
  root.innerHTML = `<div class="card">
      <div class="pv-top"><button class="pay-amt pv-amt" type="button" data-pv="amt" aria-label="Pay amount"><span>$</span><b class="pv-val">0</b></button><label class="vh" for="${root.id}-date">Paid on</label><input class="date pv-date" id="${root.id}-date" type="date"></div>
      <p class="pv-carry" hidden></p>
      <div class="pv-pad"><div class="keys pv-keys"></div><button class="btn wide pv-done" type="button" data-pv="done">Done</button></div>
    </div>
    <p class="pv-cap" hidden>If every pay went like this</p>
    <div class="pv-chips" aria-label="Plans"></div>
    <p class="pv-why" hidden></p>
    <div class="card pv-rc" hidden></div>
    <label class="switch-row pv-mine" hidden><span>Make this my plan</span><input type="checkbox" class="switch" data-pv-mine></label>
    <button class="btn primary big pv-go" type="button" data-pv="stack" disabled>Stack it</button>`;
  keypad(root.querySelector('.pv-keys'), PVpad);
  root.querySelector('.pv-date').oninput = e => { PV.date = e.target.value || today(); updatePayView(root); };
  updatePayView(root);
}
function pvQuick(root) {
  if (!root || !root.isConnected) return;
  const amt = parseFloat(PVpad.str) || 0, go = root.querySelector('.pv-go');
  root.querySelector('.pv-val').textContent = showStr(PVpad.str);
  go.disabled = amt <= 0; go.textContent = amt > 0 ? `Stack ${money(amt)}` : 'Stack it';
}
export function updatePayView(root) {
  if (!root || !root.isConnected) return;
  clearTimeout(pvT);
  const S = app.S, q = x => root.querySelector(x), amt = parseFloat(PVpad.str) || 0, date = PV.date || today();
  pvQuick(root);
  q('.pv-date').value = date;
  q('.pv-pad').hidden = !PV.padOpen && amt > 0;
  // Pay's balance carries itself. What last pay parked in the Buffer or Savings for something still due comes in with this one.
  const hd = heldOf(S, date), hv = heldSum(hd), ce = q('.pv-carry'); ce.hidden = !(hv > 0.5);
  ce.innerHTML = hv > 0.5 ? `+ ${money(hv)} already in ${Object.keys(hd).filter(k => hd[k] > 0.005).map(k => esc(nameOf(S, k))).join(' and ')}, set aside last pay` : '';
  const rc = q('.pv-rc'), why = q('.pv-why'), mr = q('.pv-mine'), cap = q('.pv-cap');
  if (amt <= 0) {
    rc.hidden = true; why.hidden = true; mr.hidden = true; cap.hidden = true;
    q('.pv-chips').innerHTML = PLANS.map(k => `<span class="pv-chip off"><b>${planName(S, k)}</b><small>Type your pay</small></span>`).join('');
    return;
  }
  const plans = payPlans(S, amt, date, PV.custom), sel = pvSel(S, plans, PV.pick), first = !S.plan, ow = owes(S);
  PV.pick = sel.k;
  cap.hidden = false;
  const lead = p => p.none ? '' : ow ? `Debt-free ${p.debtFree === null ? 'never' : monthYear(dateIn(p.debtFree))}` : `FI ${p.fi === null ? 'never' : p.fi === 0 ? 'now' : monthYear(dateIn(p.fi))}`;
  q('.pv-chips').innerHTML = plans.map(p => p.lock ? `<span class="pv-chip off"><b>${esc(p.name)}</b><small>Track a pay's spending to unlock</small></span>`
    : `<button class="pv-chip${p === sel ? ' on' : ''}" type="button" data-pv-pick="${p.k}" aria-pressed="${p === sel}"><b>${esc(p.name)}${p.yours ? '<em>Yours</em>' : ''}</b><small>${lead(p)}</small><small>Spending ${money0(cardBudget(p.stk))}</small></button>`).join('');
  why.hidden = !first; why.textContent = first ? 'Your first pay sets your plan.' : '';
  mr.hidden = sel.yours || first; mr.querySelector('input').checked = !!PV.mine;
  const st = sel.stk;
  rc.hidden = false;
  rc.innerHTML = (sel.k === 'custom' ? '<button class="link sm pv-change" type="button" data-pv="custom">Change the split for this pay ›</button>' : '') + receiptHTML(st) + `${(st.plan.card || 0) < 0.5 && (st.plan.rem || 0) > 0.5 ? '<p class="pill bad">No card money this pay.</p>' : ''}${st.short > 0.5 ? `<p class="pill bad">Short ${money(st.short)}. Doesn't cover bills and repayments.</p>` : ''}`;
}
/* Custom, for this pay: sliders, with what each share comes to in dollars. */
function adjustSheet() {
  const S = app.S, amt = parseFloat(PVpad.str) || 0, date = PV.date || today(), d = Object.assign({}, PV.custom || customPct(S));
  openSheet('Custom split', `<div class="form"><div class="split">${BK.map(k => `<div class="srow"><div class="srow-h"><i class="chip" style="background:${BM[k].color}"></i><span class="sname">${BM[k].name}</span><span class="num" id="adjv-${k}"></span></div>
      <div class="srow-c"><input type="range" id="adj-${k}" min="0" max="100" step="5" value="${d[k]}" style="accent-color:${BM[k].color}" aria-label="${BM[k].name} share"><span class="num pv-adjp" id="adjp-${k}"></span></div></div>`).join('')}</div>
    <p class="pill" id="adj-tot" style="margin:0"></p><button class="btn primary big" id="adj-use" type="button">Use this split</button></div>`);
  const paint = () => {
    const tot = BK.reduce((a, k) => a + d[k], 0), st = evalPlan(S, d, amt, date).stk, dT = Object.values(st.plan.debts).reduce((a, v) => a + v, 0);
    const v = { spend: cardBudget(st), pot: potTotal(st), debt: Math.max(0, dT - (st.plan.mins || 0)), save: st.plan.save, invest: st.plan.invest };
    BK.forEach(k => { $('#adjp-' + k).textContent = d[k] + '%'; $('#adjv-' + k).textContent = money(v[k]); });
    const t = $('#adj-tot'), diff = tot - 100;
    t.className = 'pill ' + (diff > 0 ? 'bad' : diff < 0 ? 'warn' : 'good'); t.textContent = diff > 0 ? `Over by ${diff}%` : diff < 0 ? `${-diff}% unassigned` : '100%';
  };
  BK.forEach(k => { $('#adj-' + k).oninput = e => { d[k] = Math.round(+e.target.value || 0); paint(); }; });
  $('#adj-use').onclick = () => { PV.custom = Object.assign({}, d); PV.pick = 'custom'; closeSheet(); updatePayView(PV.root); };
  paint();
}
/* Stack with the picked plan. It's for this pay only, unless you make it your plan. Your first pay always sets it. */
function pvStack() {
  const S = app.S, amt = parseFloat(PVpad.str) || 0; if (amt <= 0) return;
  const s0 = JSON.stringify(S);
  clearTimeout(pvT);
  const pre = preSettle(S);
  const date = PV.date || today(), plans = payPlans(S, amt, date, PV.custom), sel = pvSel(S, plans, PV.pick);
  const yours = sel.yours, mine = !yours && (PV.mine || !S.plan);
  if (mine) { S.plan = sel.k; if (sel.k === 'custom') { S.pct = Object.assign({}, PV.custom || customPct(S)); fillSplit(); } }
  stackPay(S, amt, date, 0, yours || mine ? null : { k: sel.k, spec: sel.sp }, pvMore(S, date));
  ui.stackNew = false; pvReset();
  const R = settleRank(S, pre); save();
  if (!$('#qs').hidden) closeQS(); else renderAll();
  window.scrollTo(0, 0);
  const msg = mine ? `Stacked. ${sel.name} is your plan now` : yours ? 'Stacked' : `Stacked on ${sel.name}, just this pay`;
  if (R) showSettle(R, () => toast(msg, undoOf(s0)));
  else toast(`${msg}. You're ${tierName(S.rank.nw)}: your rank settles each pay day`, undoOf(s0));
}
/** Taps on the pay screen. True when it was one. */
export function payViewClick(e) {
  const pk = e.target.closest('[data-pv-pick]');
  if (pk) { if (pk.dataset.pvPick === 'custom' && PV.pick === 'custom') adjustSheet(); else { PV.pick = pk.dataset.pvPick; updatePayView(PV.root); } return true; }
  const b = e.target.closest('[data-pv]'); if (!b) return false;
  const k = b.dataset.pv;
  if (k === 'amt') { PV.padOpen = true; updatePayView(PV.root); }
  else if (k === 'done') { PV.padOpen = false; updatePayView(PV.root); }
  else if (k === 'custom') adjustSheet();
  else if (k === 'stack') pvStack();
  return true;
}
