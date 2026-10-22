/* Settings: your pay and your data. Back up and restore, Test mode (nothing saves until you end it), sample data and
   Clear everything. The assumptions live on Plan. */
import { today, fmtDate, blank, normalize, makeBackup, readBackup, sampleState } from '../core/index.js';
import { app, ui, save } from './store.js';
import { $, esc, toast, twoTap } from './dom.js';
import { openSheet, closeSheet } from './sheet.js';
import { renderAll, go } from './render.js';
import { fillPlanInputs } from './plan.js';
import { pvReset } from './payview.js';
import { openQS } from './quickstart.js';

export function settingsSheet() {
  openSheet('Settings', `<div class="form">
    <div><p class="lbl">Pay</p><div class="grouped">
      <div class="frow"><label for="s-freq">You get paid</label><select id="s-freq"><option value="week">Weekly</option><option value="fortnight">Fortnightly</option><option value="month">Monthly</option></select></div>
    </div></div>
    <div><p class="lbl">Data</p><div class="grouped">
      <button class="row btn-row" type="button" data-act="qs">Build your stack</button>
      <div class="frow"><span>Saved to</span><span class="muted small" id="cloud-st" style="margin:0"></span></div>
      <button class="row btn-row" type="button" data-act="backup"><span class="grow">Back up</span><span class="muted small" id="bk-last" style="margin:0"></span></button>
      <button class="row btn-row" type="button" data-act="restore">Restore from backup</button>
      <label class="frow"><span>Test mode</span><input type="checkbox" class="switch" id="test-sw"></label>
      <button class="row btn-row" type="button" data-act="sample">Try sample data</button>
      <button class="row btn-row danger" type="button" data-act="clear-ask">Clear everything</button>
    </div></div>
    <p class="foot">Not financial advice. Image: NASA, ESA, Hubble.</p></div>`);
  fillPlanInputs();
}

/* ---------- Test mode: nothing saves until you end it ---------- */
export function testOn() { if (app.TEST) return; app.TEST = JSON.stringify(app.S); document.body.classList.add('test-on'); $('#test-bar').hidden = false; fillPlanInputs(); toast('Test mode on. Nothing saves.'); }
export function testEnd(keep) {
  if (!app.TEST) return;
  if (!keep) app.S = JSON.parse(app.TEST);
  app.TEST = null; document.body.classList.remove('test-on'); $('#test-bar').hidden = true;
  if (keep) save();
  pvReset(); ui.stackNew = false; closeSheet(); fillPlanInputs(); renderAll(); toast(keep ? 'Kept. Test mode off.' : 'Thrown away. Back to your real data.');
}
export function testEndSheet() { openSheet('End test', '<div class="form"><button class="btn big danger-fill" type="button" data-act="test-discard">Throw it away</button><button class="btn wide" type="button" data-act="test-keep" style="margin-top:0">Keep it</button></div>'); }
export function trySample() { closeSheet(); if (!app.TEST) testOn(); app.S = sampleState(); pvReset(); ui.stackNew = false; fillPlanInputs(); go('home'); toast('Sample data. Test mode, nothing saves.'); }
export function clearAsk() { openSheet('Clear everything?', `<div class="form"><p style="margin:0">Deletes every pay, bill, debt and entry on this phone. This can't be undone.</p><button class="btn big danger-fill" type="button" data-act="clear-yes">Delete everything</button><button class="btn wide" type="button" data-act="close" style="margin-top:0">Cancel</button></div>`); }
export function clearAll() { app.S = blank(); ui.stackNew = false; save(); closeSheet(); fillPlanInputs(); pvReset(); go('home'); toast('Everything cleared'); openQS(); }

/* ---------- backup ----------
   A file with all your data. The phone's share sheet saves it (Files, Notes, AirDrop…). Where a browser can't share files,
   it's shown as text to copy into Notes, with a download as well. */
function markBackup() { if (app.TEST) return; app.S.lastBackup = today(); save(); renderAll(); }
export async function backup() {
  const real = app.TEST ? JSON.parse(app.TEST) : app.S, at = today(), data = makeBackup(real, at), name = `stack-backup-${at}.json`;
  try {
    const file = new File([data], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Stack backup' }); markBackup(); toast('Backup saved'); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  openSheet('Back up', `<div class="form"><p class="muted small" style="margin:0">Copy this and keep it in Notes.</p><textarea class="bk-text" id="bk-copy" rows="6" readonly>${esc(data)}</textarea><button class="btn primary big" type="button" id="bk-copy-btn">Copy</button><a class="btn wide" id="bk-dl" href="${url}" download="${name}" style="margin-top:0;text-align:center;text-decoration:none">Save as a file</a></div>`);
  $('#bk-dl').onclick = () => { markBackup(); };
  $('#bk-copy-btn').onclick = async () => {
    const t = $('#bk-copy'); t.select(); let ok = false;
    try { await navigator.clipboard.writeText(data); ok = true; } catch (e) { try { ok = document.execCommand('copy'); } catch (e2) {} }
    if (ok) { markBackup(); closeSheet(); toast('Copied'); } else toast('Select the text and copy it');
  };
}
export function restoreSheet() {
  openSheet('Restore from backup', `<div class="form"><button class="btn wide" type="button" data-act="restore-file">Choose backup file</button>
    <div><label class="lbl" for="bk-text">Or paste a backup</label><textarea class="bk-text" id="bk-text" rows="4"></textarea></div>
    <button class="btn wide" type="button" id="bk-read" style="margin-top:0">Check it</button><div id="bk-out"></div></div>`);
  $('#bk-read').onclick = () => checkBackup($('#bk-text').value);
}
export function checkBackup(text) {
  const r = readBackup(text), out = $('#bk-out'); if (!out) return;
  if (!r.ok) { out.innerHTML = '<p class="err" style="margin:0">That isn\'t a Stack backup.</p>'; return; }
  const n = (k, w) => `${k} ${w}${k === 1 ? '' : 's'}`, c = r.counts;
  out.innerHTML = `<p style="margin:0 0 10px">${fmtDate(r.at)}: ${n(c.bills, 'bill')}, ${n(c.debts, 'debt')}, ${n(c.buys, 'purchase')}, ${n(c.pays, 'pay')}.</p><button class="btn big danger-fill" type="button" id="bk-go">Replace my data</button>`;
  twoTap($('#bk-go'), 'Tap again to replace', () => { app.S = normalize(Object.assign(blank(), r.data, { qs: true })); save(); pvReset(); ui.stackNew = false; closeSheet(); fillPlanInputs(); renderAll(); toast('Restored'); });
}
