/* Plan → Data: Export copies everything you've entered as one block of text (a backup, or to move to a new app).
   Import takes that text back, shows what's in it, and replaces what's on this device after a second tap. */
import { readImport } from '../core/index.js';
import { app, ui, save } from './store.js';
import { $, esc, openSheet, showErr, twoTap, toast } from './dom.js';
import { renderAll } from './render.js';
import { fillPlanInputs } from './plan.js';
import { fillPay } from './stack.js';

const BOX = 'width:100%;height:200px;border:0;border-radius:10px;padding:10px;background:var(--sunk);color:var(--ink);font:12px var(--f-num)';

export function exportSheet() {
  const txt = JSON.stringify(app.S);
  openSheet('Export my data', `<div class="form">
    <p style="margin:0">Everything you've entered, as one block of text. Keep it somewhere safe (a note is fine) as a backup, or paste it into Import on another device.</p>
    <textarea id="f-json" readonly style="${BOX}">${esc(txt)}</textarea>
    <button class="btn primary big" type="button" id="f-copy">Copy</button>
    ${navigator.share ? '<button class="btn wide" type="button" id="f-share" style="margin-top:0">Share or save…</button>' : ''}</div>`);
  const box = $('#f-json');
  $('#f-copy').onclick = async () => {
    try { await navigator.clipboard.writeText(txt); toast('Copied'); }
    catch (e) { box.focus(); box.select(); toast('Select all of it and copy'); }
  };
  if ($('#f-share')) $('#f-share').onclick = () => navigator.share({ title: 'Stack data', text: txt }).catch(() => {});
}

export function importDataSheet() {
  openSheet('Import data', `<div class="form">
    <p style="margin:0">Paste what Export copied. You'll see what's in it before anything changes.</p>
    <textarea id="f-json" style="${BOX}" placeholder='{"v":4, …}' autocapitalize="off" autocomplete="off" spellcheck="false"></textarea>
    <p class="err" id="f-err" hidden></p>
    <div id="f-check"><button class="btn primary big" type="button" id="f-read">Check it</button></div></div>`);
  $('#f-read').onclick = () => {
    const r = readImport($('#f-json').value);
    if (!r.ok) return showErr(r.error);
    $('#f-err').hidden = true;
    $('#f-check').innerHTML = `<p class="pill good" style="margin:0 0 12px">Found ${esc(r.summary)}.</p>
      <p class="muted small" style="margin:0 0 12px">Importing replaces everything on this device with this data.</p>
      <button class="btn primary big" type="button" id="f-replace">Replace my data</button>`;
    twoTap($('#f-replace'), 'Tap again to replace everything', () => {
      app.S = r.state; ui.stackNew = false; ui.animated = false;
      save(); fillPlanInputs(); fillPay(); renderAll();
      $('#sheet [data-act="close"]').click();
      toast('Data imported');
    });
  };
}
