/* Bottom sheets and the number pad. One sheet at a time. Opening one while another is up, or still sliding away, swaps
   it in place: the new one fades in and the sheet grows or shrinks to fit. Nothing stacks and nothing bounces. */
import { app, ui } from './store.js';
import { $ } from './dom.js';

const SH = { h: null, gen: 0, t: 0, ro: null, on: false };
const CALM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const fadeIn = el => { if (el && el.animate && !CALM()) el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.2,.8,.2,1)' }); };
export function openSheet(title, body) {
  const sh = $('#sheet'), sc = $('#scrim'), up = !sh.hidden;
  if (PADIN) padRestore();
  if (!sh.classList.contains('open')) app.SNAP = JSON.stringify(app.S);
  SH.gen++;
  sh.innerHTML = `<div class="sh-in"><div class="grab"></div><div class="sheet-head"><h2 id="sheet-title">${title}</h2><button class="link" type="button" data-act="close">Close</button></div><div id="sheet-body">${body}</div></div>`;
  SH.on = true; sh.scrollTop = 0; sc.hidden = false; document.body.classList.add('sheet-on'); sheetWatch();
  if (up) { sh.classList.add('open'); sc.classList.add('on'); fadeIn(sh.firstElementChild); return; }
  SH.h = null; sh.hidden = false; const g = SH.gen;
  requestAnimationFrame(() => requestAnimationFrame(() => { if (g !== SH.gen) return; sh.classList.add('open'); sc.classList.add('on'); }));
}
export function closeSheet() {
  const sh = $('#sheet'), sc = $('#scrim'), g = ++SH.gen;
  if (PADIN) padRestore();
  SH.on = false; sh.classList.remove('open'); sc.classList.remove('on'); ui.imp = null;
  if (!$('#pad').classList.contains('open')) document.body.classList.remove('sheet-on');
  setTimeout(() => { if (g === SH.gen && !sh.classList.contains('open')) { sh.hidden = true; sh.innerHTML = ''; sc.hidden = true; sh.style.height = ''; sh.classList.remove('fit'); SH.h = null; } }, 440);
}
/* The sheet follows its content's height smoothly, from wherever it is now, instead of jumping. */
function sheetWatch() {
  const inner = $('#sheet').firstElementChild; if (!window.ResizeObserver || !inner) return;
  if (!SH.ro) SH.ro = new ResizeObserver(() => sheetFit());
  SH.ro.disconnect(); SH.ro.observe(inner);
}
function sheetFit() {
  const sh = $('#sheet'), inner = sh.firstElementChild; if (sh.hidden || !inner) return;
  const cs = getComputedStyle(sh), h = Math.min(Math.ceil(inner.offsetHeight + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)), Math.floor(innerHeight * 0.9));
  const from = sh.style.height ? sh.getBoundingClientRect().height : SH.h; SH.h = h;
  if (from == null || !sh.classList.contains('open') || sh.classList.contains('drag') || CALM()) return;
  if (Math.abs(from - h) < 1) { if (sh.style.height) sh.style.height = h + 'px'; return; }
  sh.style.transition = 'none'; sh.style.height = from + 'px'; sh.classList.add('fit'); void sh.offsetHeight; sh.style.transition = '';
  sh.style.height = h + 'px';
  clearTimeout(SH.t); SH.t = setTimeout(() => { SH.t = 0; sh.style.height = ''; sh.classList.remove('fit'); }, 340);
}
/* The number pad inside an open sheet takes the sheet's place and hands it back after, so there's only ever one sheet on
   screen. Tap outside or swipe down to go back without changing anything. */
let PADIN = null;
export const padIn = () => !!PADIN;
function padIntoSheet() {
  const sh = $('#sheet'), inner = sh.firstElementChild;
  PADIN = { kept: [...inner.childNodes], top: sh.scrollTop };
  inner.replaceChildren(...$('#pad').childNodes);
  sh.scrollTop = 0; fadeIn(inner);
}
export function padRestore(fade) {
  if (!PADIN) return;
  const sh = $('#sheet'), inner = sh.firstElementChild, k = PADIN; PADIN = null;
  $('#pad').replaceChildren(...inner.childNodes); inner.replaceChildren(...k.kept); sh.scrollTop = k.top;
  if (fade) fadeIn(inner);
}
export const sheetBack = () => { if (PADIN) padRestore(true); else closeSheet(); };
/* Swipe a sheet down to close it: it follows your finger from the top of its scroll, and a long or quick pull closes it. */
export function swipeable(sh, sc, close) {
  let y0 = null, dy = 0, t0 = 0, on = false;
  sh.addEventListener('touchstart', e => { if (e.touches.length !== 1 || e.target.closest('.keys,.cf-strip,input,select,textarea')) { y0 = null; return; } y0 = e.touches[0].clientY; t0 = e.timeStamp; dy = 0; on = false; }, { passive: true });
  sh.addEventListener('touchmove', e => {
    if (y0 === null) return;
    const d = e.touches[0].clientY - y0;
    if (!on) { if (d > 8 && sh.scrollTop <= 0) { on = true; sh.classList.add('drag'); } else { if (Math.abs(d) > 8) y0 = null; return; } }
    e.preventDefault(); dy = Math.max(0, d);
    sh.style.transform = `translateY(${dy}px)`; sc.style.opacity = String(Math.max(0, 1 - dy / Math.max(1, sh.offsetHeight)));
  }, { passive: false });
  const end = e => {
    if (y0 === null) return; y0 = null; if (!on) return; on = false;
    const v = dy / Math.max(1, e.timeStamp - t0);
    sh.classList.remove('drag'); sh.style.transform = ''; sc.style.opacity = '';
    if (dy > Math.min(140, sh.offsetHeight * 0.3) || (v > 0.55 && dy > 30)) close();
  };
  sh.addEventListener('touchend', end); sh.addEventListener('touchcancel', end);
}

/* ---------- number entry ---------- */
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];
const DEL = '<svg width="26" height="20" viewBox="0 0 26 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M8 2h15a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H8l-6-8z"/><path d="m12 7 6 6m0-6-6 6"/></svg>';
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
/** Draws a keypad into el; st holds what's typed ({ str, dec, max, fresh, onChange }). */
export function keypad(el, st) {
  el.innerHTML = KEYS.map(k => `<button type="button" class="key" data-k="${k}"${k === '.' && !st.dec ? ' disabled' : ''} aria-label="${k === 'del' ? 'Delete' : k === '.' ? 'Decimal point' : k}">${k === 'del' ? DEL : k}</button>`).join('');
  el._st = st;
  el.onclick = e => { const b = e.target.closest('[data-k]'); if (!b || b.disabled) return; if (st.fresh) { st.fresh = false; if (b.dataset.k !== 'del') st.str = ''; } st.str = press(st.str, b.dataset.k, st.dec, st.max); st.onChange(st.str); };
}
let padCfg = null, PADGEN = 0;
export const padSt = { str: '', dec: 2, max: 1e7, onChange: s => { const ng = String(s).startsWith('-'); if (ng) s = String(s).slice(1); $('#pad-val').innerHTML = `${ng ? '−' : ''}${padCfg.prefix || ''}${showStr(s)}${padCfg.suffix ? `<small>${padCfg.suffix.trim()}</small>` : ''}`; } };
/** The number pad: cfg { label, prefix, suffix, dec, max, value, onDone }. Inside an open sheet it takes the sheet's place. */
export function numpad(cfg) {
  padCfg = cfg; padSt.dec = cfg.dec; padSt.max = cfg.max; padSt.str = toStr(cfg.value, cfg.dec); padSt.fresh = !!padSt.str;
  $('#pad-label').textContent = cfg.label;
  keypad($('#pad-keys'), padSt); padSt.onChange(padSt.str);
  if ($('#sheet').classList.contains('open') && $('#sheet').firstElementChild) { if (!PADIN) padIntoSheet(); return; }
  const p = $('#pad'), sc = $('#pad-scrim'), g = ++PADGEN; sc.hidden = false; p.hidden = false; document.body.classList.add('sheet-on');
  requestAnimationFrame(() => requestAnimationFrame(() => { if (g !== PADGEN) return; p.classList.add('open'); sc.classList.add('on'); }));
}
export function closePad() { const p = $('#pad'), sc = $('#pad-scrim'), g = ++PADGEN; p.classList.remove('open'); sc.classList.remove('on'); if (!SH.on || $('#sheet').hidden) document.body.classList.remove('sheet-on'); setTimeout(() => { if (g === PADGEN && !p.classList.contains('open')) { p.hidden = true; sc.hidden = true; } }, 340); }
export function padDone() { const c = padCfg, v = Math.min(parseFloat(padSt.str) || 0, c.max); if (PADIN) padRestore(true); else closePad(); c.onDone(v); }
/** A number field in a form: tap it for the pad, and it shows what you typed. */
export function bindField(sel, obj, key, cfg) {
  const el = $(sel), paint = () => { el.textContent = fmtN(obj[key], cfg); };
  paint();
  el.onclick = () => numpad(Object.assign({}, cfg, { value: obj[key], onDone: v => { obj[key] = v; paint(); if (cfg.after) cfg.after(); } }));
}
