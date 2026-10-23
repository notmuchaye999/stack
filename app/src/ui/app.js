/* Stack starts here: load your data, draw the screens, and handle every tap. */
import { today, normalize, hasData, latestStack, stackItems, payNow, walletCard, cardAvail, order, isWallet, debtNow, moveRecs,
  todoTo, tickBill, planName, PLANS, money, sortMoves } from '../core/index.js';
import { loadState, onStorageProblem, askToKeep } from '../storage.js';
import { app, ui, save } from './store.js';
import { $, esc, toast, runUndo, page, toTop } from './dom.js';
import { openSheet, closeSheet, sheetBack, swipeable, numpad, closePad, padDone, padIn, padRestore, padSt, press } from './sheet.js';
import { renderAll, go, undoOf } from './render.js';
import { NF, buildSplit, fillSplit, fillPlanInputs, balance, usePlan, setPct } from './plan.js';
import { PV, pvReset, payViewClick } from './payview.js';
import { openQS, qsClick } from './quickstart.js';
import { rowsOf } from './lists.js';
import { billSheet, debtSheet, buySheet, creditForm, creditSheet, debtDetail, goalSheet } from './forms.js';
import { spentSheet } from './spent.js';
import { movedSheet } from './moved.js';
import { moveDetail, payDetail, didAllUI } from './details.js';
import { paySpendsSheet, pastPaysSheet } from './stack.js';
import { entriesSheet, payAcctSheet, updateBal } from './accounts.js';
import { showSettle } from './rank.js';
import { watchViewport } from './viewport.js';
import { settingsSheet, testOn, testEnd, testEndSheet, trySample, clearAsk, clearAll, backup, restoreSheet, checkBackup } from './settings.js';

/* ---------- typing and keys ---------- */
let rngT = null;
document.addEventListener('input', e => {
  const t = e.target, id = t.id || '';
  if (id.startsWith('rng-')) { setPct(id.slice(4), +t.value || 0); fillSplit(); clearTimeout(rngT); rngT = setTimeout(() => { save(); renderAll(); }, 120); }
});
document.addEventListener('change', e => {
  if (e.target.matches('[data-pv-mine]')) { PV.mine = e.target.checked; return; }
  if (e.target.id === 's-freq') { app.S.freq = e.target.value; save(); renderAll(); }
  else if (e.target.id === 'test-sw') { if (e.target.checked) testOn(); else { e.target.checked = true; testEndSheet(); } }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (padIn()) padRestore(true); else if (!$('#pad').hidden) closePad(); else if (!$('#sheet').hidden) closeSheet(); return; }
  const t = e.target, tag = t.tagName;
  if ((tag === 'INPUT' && t.type !== 'range' && t.type !== 'radio' && t.type !== 'checkbox') || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.key === 'Enter') { if (!$('#pad').hidden || padIn()) { e.preventDefault(); padDone(); } return; }
  const k = /^[0-9]$/.test(e.key) ? e.key : e.key === '.' ? '.' : e.key === 'Backspace' ? 'del' : null;
  if (!k) return;
  const el = !$('#pad').hidden ? $('#pad-keys') : !$('#sheet').hidden ? $('#sheet .keys') : !$('#qs').hidden ? $('#qs .pv-keys') : (ui.tab === 'stack' && !$('#stk-new').hidden) ? $('#stk-new .pv-keys') : null;
  if (!el || !el._st) return;
  e.preventDefault();
  const st = el._st; if (st.fresh) { st.fresh = false; if (k !== 'del') st.str = ''; } st.str = press(st.str, k, st.dec, st.max); st.onChange(st.str);
});
$('#scrim').addEventListener('click', sheetBack);
$('#pad-scrim').addEventListener('click', closePad);
swipeable($('#sheet'), $('#scrim'), sheetBack); swipeable($('#pad'), $('#pad-scrim'), closePad);
document.addEventListener('touchstart', () => {}, { passive: true }); // lets :active press states show on iPhone
watchViewport(); // keeps the tab bar and sheets on screen if the iPhone shifts the page
page().addEventListener('scroll', () => document.body.classList.toggle('scrolled', page().scrollTop > 4), { passive: true });
$('#qs').addEventListener('click', qsClick);
$('#bk-file').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0]; e.target.value = '';
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => { const t = $('#bk-text'); if (t) t.value = String(rd.result || ''); checkBackup(String(rd.result || '')); };
  rd.readAsText(f);
});

/* ---------- taps ---------- */
document.addEventListener('click', e => { payViewClick(e); });
document.addEventListener('click', e => {
  const S = app.S;
  if (e.target.closest('[data-undo]')) { runUndo(); return; }
  const pd = e.target.closest('[data-pad]');
  if (pd) { if (pd.dataset.pad === 'done') padDone(); else { padSt.str = ''; padSt.onChange(''); } return; }
  const nf = e.target.closest('[data-n]');
  if (nf) { const c = NF[nf.dataset.n]; numpad(Object.assign({}, c, { value: c.get(), onDone: v => { c.set(v); save(); fillPlanInputs(); renderAll(); } })); return; }
  const g = e.target.closest('[data-go]');
  if (g) { go(g.dataset.go); return; }
  const w = e.target.closest('[data-wr]');
  if (w) { S.wr = +w.dataset.wr; save(); fillPlanInputs(); renderAll(); return; }
  const a = e.target.closest('[data-act]');
  if (!a) return;
  const id = a.dataset.id;
  switch (a.dataset.act) {
    case 'close': closeSheet(); break;
    case 'qs': closeSheet(); openQS(); break;
    case 'settings': settingsSheet(); break;
    case 'test-end': testEndSheet(); break;
    case 'test-discard': testEnd(false); break;
    case 'test-keep': testEnd(true); break;
    case 'backup': backup(); break;
    case 'restore': restoreSheet(); break;
    case 'restore-file': $('#bk-file').click(); break;
    case 'spent': spentSheet(); break;
    case 'credit': creditSheet(id); break;
    case 'credit-add': creditForm(); break;
    case 'pass': go('home'); toTop(); break;
    case 'settle-last': { const R = (S.settles || [])[(S.settles || []).length - 1]; if (R) showSettle(R); break; }
    case 'goal': goalSheet(id); break;
    case 'goal-add': goalSheet(); break;
    case 'buffer': entriesSheet('buffer'); break;
    case 'acct-pay': payAcctSheet(); break;
    case 'invested': entriesSheet('invested'); break;
    case 'pay-debt': { const d = order(S.debts).find(x => !isWallet(x) && debtNow(S, x) > 0.005); movedSheet({ to: d ? 'd:' + d.id : null, title: 'Record a payment' }); break; }
    case 'moved': movedSheet(); break;
    case 'past-pays': pastPaysSheet(); break;
    case 'pn-done': {
      const stk = latestStack(S), x = stk && payNow(S, stk).done[+a.dataset.i]; if (!x || !x.ids) break;
      openSheet(`${esc(x.name)} this pay`, `<div class="form"><p class="sum-big" style="margin:0">${money(x.amt)}</p><p class="muted small" style="margin:0">This pay. Tap one to change or delete it.</p><div class="grouped">${rowsOf(sortMoves(S.moves.filter(m => x.ids.includes(m.id))), 'Nothing.')}</div></div>`);
      break;
    }
    case 'pn-tick': case 'pn-open': {
      // Done the way it's shown: parked money first, from where it's parked, then the rest from Pay (or the card, for a payment it makes).
      const stk = latestStack(S); if (!stk) break;
      const N = payNow(S, stk), x = N.dues.concat(N.sugs).find(y => y.key === a.dataset.key); if (!x || !x.to) break;
      const wc = walletCard(S), held = x.held || [], src = x.via ? 'card' : 'pay', fp = x.via ? Math.round((x.amt - held.reduce((t, h) => t + h[1], 0)) * 100) / 100 : x.fromPay ?? x.amt;
      if (a.dataset.act === 'pn-open' || (src === 'card' && wc && fp > cardAvail(S, wc) + 0.005)) {
        const h = !(fp > 0.005) && held[0];
        movedSheet(h ? { from: h[0], to: x.to, amount: h[1], title: x.label } : { from: src, to: x.to, amount: fp, title: x.label });
        break;
      }
      const s0 = JSON.stringify(S);
      held.forEach(([k, v]) => S.moves.push(...moveRecs(S, k, x.to, v, today(), x.label)));
      if (fp > 0.005) S.moves.push(...moveRecs(S, src, x.to, fp, today(), x.label));
      save(); renderAll(); toast(`${x.label} · ${money(x.amt)}`, undoOf(s0));
      break;
    }
    case 'pva': {
      const stk = S.stacks.find(s => s.id === a.dataset.stack); if (!stk) break;
      if (a.dataset.key === 'card') { paySpendsSheet(stk.id); break; }
      const past = !!a.dataset.past, inSheet = !!a.closest('#sheet'), date = past ? stk.date : today();
      const pm = S.moves.find(m => m.type === 'pay' && m.stack === stk.id);
      const after = inSheet && pm ? () => payDetail(pm.id) : null;
      const it = stackItems(S, stk).todos.find(x => x.key === a.dataset.key);
      if (it) movedSheet({ from: it.via ? 'card' : 'pay', to: todoTo(S, it), amount: Math.max(0, Math.round((it.plan - it.done) * 100) / 100), note: it.note, title: it.label, date, after });
      break;
    }
    case 'pva-tick': {
      const stk = S.stacks.find(s => s.id === a.dataset.stack); if (!stk) break;
      const it = stackItems(S, stk).todos.find(x => x.key === a.dataset.key); if (!it) break;
      const amt = Math.max(0, Math.round((it.plan - it.done) * 100) / 100), from = it.via ? 'card' : 'pay', wc = walletCard(S);
      if (amt < 0.005) break;
      // Not enough on the card: open the sheet, which says so.
      if (from === 'card' && wc && amt > cardAvail(S, wc) + 0.005) { a.closest('.pva-r, .stile').querySelector('.pva, .stile-b').click(); break; }
      const s0 = JSON.stringify(S), date = a.dataset.past ? stk.date : today();
      S.moves.push(...moveRecs(S, from, todoTo(S, it), amt, date, it.note));
      save(); renderAll();
      const pm = a.closest('#sheet') && S.moves.find(m => m.type === 'pay' && m.stack === stk.id); if (pm) payDetail(pm.id);
      toast(`${it.label} · ${money(amt)}`, undoOf(s0));
      break;
    }
    case 'did-all': {
      const s0 = JSON.stringify(S), n = didAllUI(a.dataset.stack, !!a.dataset.past);
      const pm = a.closest('#sheet') && app.S.moves.find(m => m.type === 'pay' && m.stack === a.dataset.stack);
      if (pm) payDetail(pm.id);
      toast(n ? `${n} marked done` : 'Nothing left to do', n ? undoOf(s0) : null);
      break;
    }
    case 'move': moveDetail(id); break;
    case 'pay': payDetail(id); break;
    case 'bill': billSheet(id); break;
    case 'debt': debtSheet(id); break;
    case 'debt-view': debtDetail(id); break;
    case 'add-bill': billSheet(); break;
    case 'add-debt': debtSheet(); break;
    case 'add-buy': buySheet(); break;
    case 'buy': buySheet(id); break;
    case 'balance': balance(); break;
    case 'use-plan': usePlan(a.dataset.k); break;
    case 'upd-pool': updateBal('pool'); break;
    case 'pool-hist': entriesSheet('pool'); break;
    case 'make-mine': {
      const stk = S.stacks.find(s => s.id === a.dataset.stack);
      if (!stk || !stk.one) break;
      const k = stk.pk === 'bal' ? 'debt' : PLANS.includes(stk.pk) && stk.pk !== 'custom' ? stk.pk : 'custom', s0 = JSON.stringify(S);
      if (k === 'custom' && stk.pct) { S.pct = Object.assign({}, stk.pct); fillSplit(); }
      S.plan = k; stk.one = false; delete stk.pct; save(); renderAll(); toast(`${planName(S, k)} is your plan now`, undoOf(s0));
      break;
    }
    case 'bill-tick': {
      const b = S.bills.find(x => x.id === id); if (!b) break;
      if (b.auto) { toast('Direct debit. It ticks itself off on the due date.'); break; }
      const s0 = JSON.stringify(S), on = tickBill(S, id, a.dataset.d); save(); renderAll(); toast(on ? `${b.name} ticked off` : `${b.name} unticked`, undoOf(s0));
      break;
    }
    case 'stack-new': ui.stackNew = true; pvReset(); renderAll(); toTop(); break;
    case 'stack-cancel': ui.stackNew = false; pvReset(); renderAll(); toTop(); break;
    case 'sample': trySample(); break;
    case 'clear-ask': clearAsk(); break;
    case 'clear-yes': clearAll(); break;
  }
});

/* ---------- start ---------- */
let warned = false;
onStorageProblem(() => { if (!warned) { warned = true; toast("This browser won't let Stack use its storage. Back up now and then."); } });
app.S = normalize(await loadState());
askToKeep();
document.body.dataset.tab = ui.tab;
buildSplit();
fillPlanInputs(); pvReset();
renderAll();
// First open: walk through setting up.
if (!app.S.qs && !hasData(app.S) && $('#qs').hidden) openQS();

/* ---------- offline and updates ---------- */
/* The service worker keeps Stack working offline. It's skipped on localhost (so edits show straight away while
   developing) unless the address has ?sw in it. */
if ('serviceWorker' in navigator && (location.hostname !== 'localhost' || location.search.includes('sw'))) {
  const btn = $('#update');
  const offer = w => { btn.hidden = false; requestAnimationFrame(() => btn.classList.add('show')); btn.onclick = () => w.postMessage('update'); };
  navigator.serviceWorker.register('sw.js').then(reg => {
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
    });
    // Look for a new version whenever you come back to the app.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
}
