/* Number entry: the on-screen keypad used for pays, amounts and percentages (no phone keyboard popping up). */
import { BK, now, savedNow, investedNow } from '../core/index.js';
import { app } from './store.js';
import { $, BM } from './dom.js';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];
const DEL = '<svg width="26" height="20" viewBox="0 0 26 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M8 2h15a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H8l-6-8z"/><path d="m12 7 6 6m0-6-6 6"/></svg>';

/** What the typed string becomes after pressing a key. dec = decimal places allowed. */
export function press(s, k, dec, max) {
  if (k === 'del') return s.slice(0, -1);
  if (k === '.') return !dec || s.includes('.') ? s : (s || '0') + '.';
  if (s.includes('.') && s.split('.')[1].length >= dec) return s;
  if (s.replace('.', '').length >= 9) return s;
  const n = (s === '0' ? '' : s) + k;
  return max != null && parseFloat(n) > max ? s : n;
}
export function showStr(s) { if (!s) return '0'; const [i, d] = s.split('.'); return (i ? Number(i) : 0).toLocaleString('en-AU') + (d !== undefined ? '.' + d : ''); }
export const toStr = (v, dec) => { v = +v || 0; return v ? String(Math.round(v * 10 ** dec) / 10 ** dec) : ''; };
export const fmtN = (v, c) => (c.prefix || '') + Number(v || 0).toLocaleString('en-AU', { maximumFractionDigits: c.dec }) + (c.suffix || '');

/** Draws a keypad into el. st holds the typed string and what to do when it changes. */
export function keypad(el, st) {
  el.innerHTML = KEYS.map(k => `<button type="button" class="key" data-k="${k}"${k === '.' && !st.dec ? ' disabled' : ''} aria-label="${k === 'del' ? 'Delete' : k === '.' ? 'Decimal point' : k}">${k === 'del' ? DEL : k}</button>`).join('');
  el._st = st;
  el.onclick = e => { const b = e.target.closest('[data-k]'); if (!b || b.disabled) return; st.str = press(st.str, b.dataset.k, st.dec, st.max); st.onChange(st.str); };
}

/* The pop-up keypad sheet. */
let padCfg = null;
export const padSt = { str: '', dec: 2, max: 1e7, onChange: s => { $('#pad-val').innerHTML = `${padCfg.prefix || ''}${showStr(s)}${padCfg.suffix ? `<small>${padCfg.suffix.trim()}</small>` : ''}`; } };
export function numpad(cfg) {
  padCfg = cfg; padSt.dec = cfg.dec; padSt.max = cfg.max; padSt.str = toStr(cfg.value, cfg.dec);
  $('#pad-label').textContent = cfg.label;
  keypad($('#pad-keys'), padSt); padSt.onChange(padSt.str);
  const p = $('#pad'); $('#pad-scrim').hidden = false; p.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => p.classList.add('open')));
}
export function closePad() { const p = $('#pad'); p.classList.remove('open'); $('#pad-scrim').hidden = true; setTimeout(() => { if (!p.classList.contains('open')) p.hidden = true; }, 230); }
export function padDone() { const c = padCfg, v = Math.min(parseFloat(padSt.str) || 0, c.max); closePad(); c.onDone(v); }

/** A number field in a form that opens the keypad and writes back into obj[key]. */
export function bindField(sel, obj, key, cfg) {
  const el = $(sel), paint = () => { el.textContent = fmtN(obj[key], cfg); };
  paint();
  el.onclick = () => numpad(Object.assign({}, cfg, { value: obj[key], onDone: v => { obj[key] = v; paint(); } }));
}

/** Settings edited with the keypad (Plan → Assumptions, the split %, and correcting balances). */
export const NF = {
  pay:   { label: 'Usual pay (after tax)', prefix: '$', dec: 2, max: 1e7, get: () => app.S.pay, set: v => { app.S.pay = v; } },
  em:    { label: 'Emergency fund target', suffix: ' months', dec: 0, max: 24, get: () => app.S.emMonths, set: v => { app.S.emMonths = v; } },
  ret:   { label: 'Return after inflation', suffix: '%', dec: 1, max: 20, get: () => app.S.ret, set: v => { app.S.ret = v; } },
  saved: { label: 'Savings balance now', prefix: '$', dec: 2, max: 1e9, get: () => savedNow(app.S), set: v => { app.S.startSaved = v; app.S.savedAsOf = now(); } },
  inv:   { label: 'Investments worth now', prefix: '$', dec: 2, max: 1e9, get: () => investedNow(app.S), set: v => { app.S.startInvested = v; app.S.investedAsOf = now(); } },
};
BK.forEach(k => { NF['pct-' + k] = { label: `${BM[k].name} share`, suffix: '%', dec: 0, max: 100, get: () => app.S.pct[k], set: v => { app.S.pct[k] = Math.round(v); } }; });
