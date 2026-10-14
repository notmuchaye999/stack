/* Stack starts here: load your data, draw the screens, and handle every tap. */
import { today, fmtDate, blank, sampleState, stackItems, didAll, stackPay, dropImports } from '../core/index.js';
import { loadState, onStorageProblem, askToKeep } from '../storage.js';
import { app, ui, save } from './store.js';
import { $, arm, closeSheet, toast } from './dom.js';
import { NF, keypad, press, toStr, numpad, closePad, padDone, padSt } from './numpad.js';
import { payPad, fillPay, renderPayPreview } from './stack.js';
import { buildSplit, fillPlanInputs } from './plan.js';
import { renderAll, go } from './render.js';
import { billSheet, debtSheet, buySheet, recSheet } from './forms.js';
import { moveDetail, payDetail, splitSheet, stagesSheet, tipsSheet } from './details.js';
import { importSheet, runSample, commitImport, toggleRow, relabelRow, readFile } from './importer.js';
import { balance, useSuggest } from './actions.js';
import { exportSheet, importDataSheet } from './data.js';

/* ---------- typing and keys ---------- */
document.addEventListener('input', e => {
  const t = e.target, id = t.id || '';
  if (id.startsWith('rng-')) { const k = id.slice(4), v = Math.round(+t.value || 0); app.S.pct[k] = v; $('#pct-' + k).textContent = v + '%'; save(); renderAll(); }
  else if (id === 'pay-date') renderPayPreview();
});
document.addEventListener('change', e => { if (e.target.id === 's-freq') { app.S.freq = e.target.value; save(); renderAll(); } });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!$('#pad').hidden) closePad(); else if (!$('#sheet').hidden) closeSheet(); return; }
  const t = e.target, tag = t.tagName;
  if ((tag === 'INPUT' && t.type !== 'range' && t.type !== 'radio' && t.type !== 'checkbox') || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.key === 'Enter') { if (!$('#pad').hidden) { e.preventDefault(); padDone(); } return; }
  const k = /^[0-9]$/.test(e.key) ? e.key : e.key === '.' ? '.' : e.key === 'Backspace' ? 'del' : null;
  if (!k) return;
  const el = !$('#pad').hidden ? $('#pad-keys') : !$('#sheet').hidden ? $('#sheet .keys') : (ui.tab === 'stack' && !$('#stk-new').hidden) ? $('#pay-keys') : null;
  if (!el || !el._st) return;
  e.preventDefault();
  const st = el._st; st.str = press(st.str, k, st.dec, st.max); st.onChange(st.str);
});
$('#scrim').addEventListener('click', closeSheet);
$('#pad-scrim').addEventListener('click', closePad);
$('#file').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0]; e.target.value = '';
  if (f) readFile(f);
});

/* ---------- taps ---------- */
document.addEventListener('click', e => {
  const S = app.S;
  const pd = e.target.closest('[data-pad]');
  if (pd) { if (pd.dataset.pad === 'done') padDone(); else { padSt.str = ''; padSt.onChange(''); } return; }
  const ir = e.target.closest('[data-irow]');
  if (ir) { toggleRow(+ir.dataset.irow); return; }
  const ip = e.target.closest('[data-ipick]');
  if (ip) { relabelRow(+ip.dataset.ipick, ip.dataset.t, ip.dataset.ref); return; }
  const nf = e.target.closest('[data-n]');
  if (nf) { const c = NF[nf.dataset.n]; numpad(Object.assign({}, c, { value: c.get(), onDone: v => { c.set(v); save(); fillPlanInputs(); renderAll(); } })); return; }
  const g = e.target.closest('[data-go]');
  if (g) { if (g.dataset.segGo) ui.seg = g.dataset.segGo; go(g.dataset.go); return; }
  const sg = e.target.closest('[data-seg]');
  if (sg) { ui.seg = sg.dataset.seg; renderAll(); return; }
  const w = e.target.closest('[data-wr]');
  if (w) { S.wr = +w.dataset.wr; save(); fillPlanInputs(); renderAll(); return; }
  const a = e.target.closest('[data-act]');
  if (!a) return;
  const id = a.dataset.id;
  switch (a.dataset.act) {
    case 'close': closeSheet(); break;
    case 'tips': tipsSheet(); break;
    case 'stages': stagesSheet(); break;
    case 'import': importSheet(); break;
    case 'pick-file': $('#file').click(); break;
    case 'sample-csv': runSample(); break;
    case 'commit-import': commitImport(); break;
    case 'add-spend': recSheet({ type: 'spend', lock: true, title: 'Add a spend', note: 'Card top-up' }); break;
    case 'rec': recSheet({ type: a.dataset.t, title: 'Record a transfer' }); break;
    case 'pva': {
      // A line in plan vs what you did: record what actually happened (dated inside that pay for past pays).
      const stk = S.stacks.find(s => s.id === a.dataset.stack); if (!stk) break;
      const past = !!a.dataset.past, inSheet = !!a.closest('#sheet'), date = past ? stk.date : today();
      const pm = S.moves.find(m => m.type === 'pay' && m.stack === stk.id);
      const after = inSheet && pm ? () => payDetail(pm.id) : null;
      if (a.dataset.key === 'card') { recSheet({ type: 'spend', lock: true, title: past ? `Card, pay on ${fmtDate(stk.date)}` : 'Add a spend', note: 'Card top-up', date, after }); break; }
      const it = stackItems(S, stk).todos.find(x => x.key === a.dataset.key);
      if (it) recSheet({ type: it.type, ref: it.ref, amount: Math.max(0, it.plan - it.done), note: it.note, title: it.label, lock: true, date, after });
      break;
    }
    case 'did-all': {
      const n = didAll(S, a.dataset.stack, !!a.dataset.past);
      save(); renderAll();
      const pm = a.closest('#sheet') && S.moves.find(m => m.type === 'pay' && m.stack === a.dataset.stack);
      if (pm) payDetail(pm.id);
      toast(n ? `Recorded ${n} transfer${n === 1 ? '' : 's'} as planned` : 'Nothing left to record');
      break;
    }
    case 'split': splitSheet(a.dataset.stack); break;
    case 'move': moveDetail(id); break;
    case 'pay': payDetail(id); break;
    case 'bill': billSheet(id); break;
    case 'debt': debtSheet(id); break;
    case 'add': ui.seg === 'bills' ? billSheet() : ui.seg === 'buys' ? buySheet() : debtSheet(); break;
    case 'buy': buySheet(id); break;
    case 'balance': balance(); break;
    case 'suggest': useSuggest(); break;
    case 'usual': payPad.str = toStr(S.pay, 2); payPad.onChange(payPad.str); break;
    case 'stack-new': ui.stackNew = true; fillPay(); renderAll(); window.scrollTo(0, 0); break;
    case 'export': exportSheet(); break;
    case 'import-data': importDataSheet(); break;
    case 'sample': app.S = sampleState(); ui.animated = false; save(); fillPlanInputs(); renderAll(); toast('Sample data loaded'); break;
    case 'clear': arm(a, () => { app.S = blank(); ui.stackNew = false; save(); fillPlanInputs(); fillPay(); renderAll(); toast('Everything cleared'); }); break;
    case 'drop-imports': arm(a, () => {
      const n = dropImports(S);
      save(); renderAll(); toast(`Removed ${n} imported transactions. Bills, debts and labels you taught it are kept.`);
    }); break;
  }
});

/* Stack it: record the pay, plan it, then show the split for this pay. */
$('#pay-save').addEventListener('click', () => {
  const amt = parseFloat(payPad.str) || 0;
  if (amt <= 0) return;
  const { stack, first } = stackPay(app.S, amt, $('#pay-date').value || today());
  ui.stackNew = false; save(); renderAll(); window.scrollTo(0, 0);
  splitSheet(stack.id);
  if (first) toast('Saved as your usual pay');
});

/* ---------- start ---------- */
let warned = false;
onStorageProblem(() => { if (!warned) { warned = true; toast("This browser won't let Stack use its storage. Export your data now and then."); } });
app.S = await loadState();
askToKeep();
buildSplit();
keypad($('#pay-keys'), payPad);
fillPlanInputs(); fillPay();
renderAll();
