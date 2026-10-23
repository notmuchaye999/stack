/* Spent: what it was and where it came from. This pay's card money, the Buffer, a purchase from Savings, or on credit.
   On a pay-in-4 credit (Afterpay) the first payment comes out now and the other 3 go into your plan. */
import { uid, today, money, walletCard, cardAvail, payAcctBal, savedNow, poolBal, openBuys, unlocks, order, credits, cardLocked,
  lockOn, debtNow, debtName, nameOf, hypo, impShort, nwDelta, nwTxt, buySpend, in4Buy } from '../core/index.js';
import { app } from './store.js';
import { $, esc, LOCK, showErr, impCls } from './dom.js';
import { openSheet, keypad, numpad, toStr, showStr } from './sheet.js';
import { commit } from './render.js';

/* What a card spend does to this pay's spending money. On the everyday card: what it leaves available. Without one, it comes out of Pay. */
function cardPreview(a) {
  const S = app.S, w = walletCard(S), v = w ? cardAvail(S, w) : payAcctBal(S);
  return { html: `${esc(w ? w.name : nameOf(S, 'pay'))} ${money(v)} → ${money(v - a)}${w ? ' available' : ''}`, cls: v - a < -0.005 ? 'later' : '', d: null };
}
/* A purchase comes out of its savings first. Anything past that is this pay's spending money, so nothing goes missing. */
function buyPreview(b, a) {
  const bal = poolBal(app.S);
  if (a <= bal + 0.005) return { html: `From Savings · ${money(bal - a)} left in it`, cls: '', d: null };
  const r = cardPreview(a - bal);
  return { html: `${bal > 0.5 ? `${money(bal)} from Savings, ` : ''}${money(a - bal)} from spending · ${r.html}`, cls: r.cls, d: r.d };
}
export function spentSheet(o = {}) {
  const S = app.S, st = { from: o.from || 'pay', armed: false, fp: null, items: new Set(o.items || []), list: false };
  const pad = { str: toStr(o.amount || 0, 2), fresh: !!o.amount, dec: 2, max: 1e7, onChange: s => { $('#mv-val').textContent = '$' + showStr(s); st.armed = false; upd(); } };
  const dateV = () => ($('#f-date') && $('#f-date').value) || o.date || today();
  // Where it came from, one tile each: this pay's card money, the Buffer, Savings, and any credit.
  const srcs = () => {
    const wc = walletCard(S), pool = poolBal(S);
    return [{ k: 'pay', n: wc ? wc.name : nameOf(S, 'pay'), v: wc ? `${money(cardAvail(S, wc))} available` : money(payAcctBal(S)), c: 'var(--c-spend)' },
      { k: 'buffer', n: nameOf(S, 'buffer'), v: money(savedNow(S)), c: 'var(--c-save)' }]
      .concat(pool > 0.005 || openBuys(S).length ? [{ k: 'pool', n: nameOf(S, 'pool'), v: money(pool), c: 'var(--c-buy)' }] : [])
      .concat(order(credits(S).filter(d => !d.wallet)).map(d => ({ k: 'credit:' + d.id, n: d.name, v: cardLocked(S, d) ? 'Locked' : `${money(cardAvail(S, d))} available`, c: 'var(--c-debt)' })));
  };
  const savOn = () => st.from === 'pool' || st.from.startsWith('pot:');
  const odd = o.date && o.date !== today();
  openSheet(esc(o.title || 'Spent'), `<div class="form sp-form"><div><p class="pad-val" id="mv-val">$0</p><p class="mv-imp" id="mv-imp"></p></div>
    <div><p class="lbl">From</p><div class="acct-grid" id="sp-src"></div></div>
    <div id="sp-items" hidden></div>
    <div class="frow sp-in4" id="sp-in4" hidden><span>First payment now<small id="sp-fpw"></small></span><button class="nfield" type="button" id="sp-fp" aria-label="First payment now"></button></div>
    <div class="keys" id="mv-keys" style="margin-top:0"></div>
    <p class="err" id="f-err" hidden></p><button class="btn primary big" id="f-save" type="button">Record</button>
    <button class="link sm sp-more" type="button" id="sp-more"${odd ? ' hidden' : ''}>Add a note or change the date</button>
    <div class="two" id="sp-extra"${odd ? '' : ' hidden'}><div><label class="lbl" for="f-note">Note</label><div class="field"><input id="f-note" type="text" maxlength="40" placeholder="Optional"></div></div>
      <div><label class="lbl" for="f-date">Date</label><input id="f-date" class="date" type="date" value="${o.date || today()}" style="width:100%"></div></div></div>`);
  $('#sp-more').onclick = () => { $('#sp-more').hidden = true; $('#sp-extra').hidden = false; };
  const paintSrc = () => {
    $('#sp-src').innerHTML = srcs().map(x => `<button class="acct-t" type="button" data-src="${x.k}" aria-pressed="${x.k === 'pool' ? savOn() : st.from === x.k}" style="--c:${x.c}"><b>${esc(x.n)}</b>${x.v ? `<span>${x.v}</span>` : ''}</button>`).join('');
  };
  const shortImp = d => d === null || Math.abs(d) < 1 ? '' : impShort(S, d, app.metric);
  const in4Of = () => { const f = st.from; if (!f.startsWith('credit:')) return null; const d = S.debts.find(x => x.id === f.slice(7)); return d && d.in4 ? d : null; };
  const fpOf = a => Math.min(a, st.fp !== null ? st.fp : Math.round(a / 4 * 100) / 100);
  // The entries a spend makes, for working out what it does to your net worth before it's recorded.
  const recsOf = a => {
    const f = st.from, t = Date.now(), date = dateV(), base = { t, date, amount: a, type: 'spend', src: 'tmp' };
    if (f === 'pay') return [Object.assign({ id: '_s1' }, base)];
    if (f === 'buffer') return [Object.assign({ id: '_s1', from: 'buffer' }, base)];
    if (f === 'pool') return [Object.assign({ id: '_s1', from: 'pool' }, base)];
    if (f.startsWith('pot:')) { const fp = Math.min(a, Math.floor(poolBal(S) * 100) / 100), r = Math.round((a - fp) * 100) / 100; return [fp > 0.005 && Object.assign({}, base, { id: '_s1', amount: fp, buy: f.slice(4) }), r > 0.005 && Object.assign({}, base, { id: '_s2', amount: r, buyOf: f.slice(4) })].filter(Boolean); }
    const id = f.slice(7), i4 = in4Of(), out = [Object.assign({ id: '_s1', credit: id }, base)], fp = i4 ? fpOf(a) : 0, w = walletCard(S), via = !!(i4 && w && i4.viaWallet && i4 !== w);
    if (fp > 0.005) out.push(Object.assign({ id: '_s2', t: t + 1, date, amount: fp, type: 'debt', ref: id, src: 'tmp' }, via ? { from: 'card' } : {}));
    if (fp > 0.005 && via) out.push({ id: '_s3', t: t + 2, date, amount: fp, type: 'spend', credit: w.id, pair: '_s2', src: 'tmp' });
    return out;
  };
  function upd() {
    const a = parseFloat(pad.str) || 0, el = $('#mv-imp'), f = st.from, i4 = in4Of();
    let html = '', cls = '', lock = false, dd = null;
    if (a > 0 && f === 'pay') { const r = cardPreview(a); html = r.html; cls = r.cls; dd = r.d; }
    else if (a > 0 && f === 'buffer') {
      const sv = savedNow(S);
      html = `Emergency money. Buffer ${money(sv)} → ${money(sv - a)}`; cls = 'later'; lock = true;
    } else if (a > 0 && f === 'pool') {
      const pb = poolBal(S); html = a > pb + 0.005 ? `Savings only has ${money(pb)}` : `Savings ${money(pb)} → ${money(pb - a)}`; cls = a > pb + 0.005 ? 'later' : '';
    } else if (a > 0 && f.startsWith('pot:')) {
      const b = S.buys.find(x => x.id === f.slice(4)), r = buyPreview(b, a);
      html = r.html + (b ? ' · marks it bought' : ''); cls = r.cls; dd = r.d;
    } else if (a > 0 && f.startsWith('credit:')) {
      const d = S.debts.find(x => x.id === f.slice(7)), net = a - (i4 ? fpOf(a) : 0); dd = hypo(S, app.P, 'spend', a, null);
      if (d && d.card) { const av = cardAvail(S, d); lock = lockOn(d) && av >= d.limit - 0.005 && av - net < d.limit - 0.005; html = lock ? `Last resort. This puts ${esc(d.name)} below ${money(d.limit)}` : `${esc(d.name)} ${money(av)} → ${money(av - net)} available${i4 && net > 0.005 ? ` · then 3 × ${money(net / 3)} a fortnight` : ''}`; cls = lock ? 'later' : impCls(dd); }
      else if (d) { html = `${esc(d.name)} ${money(debtNow(S, d))} → ${money(debtNow(S, d) + a)} owing`; cls = impCls(dd); }
    }
    if (html) html = [html, nwTxt(nwDelta(S, recsOf(a))), shortImp(dd)].filter(Boolean).join(' · ');
    el.className = 'mv-imp ' + cls; el.innerHTML = html;
    const w4 = $('#sp-in4'); w4.hidden = !(i4 && a > 0);
    if (i4 && a > 0) { const wc = walletCard(S); $('#sp-fp').textContent = money(fpOf(a)); $('#sp-fpw').textContent = i4.viaWallet && wc ? `from ${wc.name}` : 'from Pay'; }
    $('#f-save').textContent = !(a > 0) ? 'Record' : lock ? (st.armed ? 'Tap again to use it' : f === 'buffer' ? 'Use Buffer' : 'Use last resort') : `Record ${money(a)}`;
    $('#f-save').classList.toggle('danger-fill', lock);
    return lock;
  }
  // What was it? Bought on your card or on credit, a purchase on your list comes off it. Savings stays as it is.
  const itemsOn = () => st.from === 'pay' || st.from.startsWith('credit:');
  // From Savings: which purchase it was (or none). On the card or credit: your list only when you ask for it.
  const paintItems = () => {
    const el = $('#sp-items'), bs = openBuys(S), U = unlocks(S), open = id => (U.items.find(x => x.b.id === id) || {}).open;
    el.hidden = !bs.length; // one row that keeps its place while you switch where it came from
    const chips = (lbl, attr, on, lock) => `<div class="sp-chips"><span class="lbl">${lbl}</span><div class="pick buy-pick">${bs.map(b => `<button type="button" ${attr}="${b.id}" aria-pressed="${on(b.id)}">${esc(b.name)}${lock && !open(b.id) ? LOCK : ''}</button>`).join('')}</div></div>`;
    el.innerHTML = savOn() ? chips('Which one?', 'data-pot', id => st.from === 'pot:' + id, true)
      : !itemsOn() ? '' : st.list || st.items.size ? chips('On your list?', 'data-item', id => st.items.has(id), false)
      : '<button class="link sm sp-list" type="button" data-list>Something on your list? ›</button>';
  };
  keypad($('#mv-keys'), pad); paintSrc(); paintItems(); pad.onChange(pad.str);
  $('#f-date').onchange = () => { paintSrc(); upd(); };
  $('#sp-src').onclick = e => { const b = e.target.closest('[data-src]'); if (!b) return; if (!(b.dataset.src === 'pool' && savOn())) st.from = b.dataset.src; st.armed = false; paintSrc(); paintItems(); upd(); };
  $('#sp-items').onclick = e => {
    const l = e.target.closest('[data-list]'); if (l) { st.list = true; paintItems(); return; }
    const p = e.target.closest('[data-pot]'); if (p) { st.from = st.from === 'pot:' + p.dataset.pot ? 'pool' : 'pot:' + p.dataset.pot; st.armed = false; paintSrc(); paintItems(); upd(); return; }
    const b = e.target.closest('[data-item]'); if (!b) return; const k = b.dataset.item; if (st.items.has(k)) st.items.delete(k); else st.items.add(k); paintItems();
  };
  $('#sp-fp').onclick = () => { const a = parseFloat(pad.str) || 0; numpad({ label: 'First payment now', prefix: '$', dec: 2, max: a, value: fpOf(a), onDone: v => { st.fp = v; upd(); } }); };
  $('#f-save').onclick = () => {
    const a = parseFloat(pad.str) || 0, f = st.from, i4 = in4Of();
    if (!(a > 0)) return showErr('Enter an amount above $0.');
    if (upd() && !st.armed) { st.armed = true; upd(); return; }
    const m = { id: uid(), t: Date.now(), date: dateV(), amount: a, type: 'spend', src: 'manual' };
    let note = 'Spend', bb = null;
    if (f === 'buffer') { m.from = 'buffer'; note = 'From Buffer'; }
    else if (f === 'pool') { if (a > poolBal(S) + 0.005) return showErr(`Savings only has ${money(poolBal(S))}.`); m.from = 'pool'; note = 'From Savings'; }
    else if (f.startsWith('pot:')) { bb = S.buys.find(x => x.id === f.slice(4)); note = bb ? bb.name : 'Purchase'; }
    else if (f.startsWith('credit:')) { m.credit = f.slice(7); note = 'On ' + debtName(S, m.credit); }
    const got = itemsOn() ? [...st.items].map(k => (S.buys || []).find(x => x.id === k)).filter(x => x && !x.bought) : [], names = got.map(x => x.name).join(' + ');
    m.note = $('#f-note').value.trim() || names || note;
    if (got.length) { m.items = got.map(x => x.id); got.forEach(x => { x.bought = true; }); }
    const fp = i4 ? fpOf(a) : 0;
    if (bb) buySpend(S, bb, a, m.date, m.note, true); else { S.moves.push(m); if (i4) in4Buy(S, i4, m, fp); }
    commit(bb && bb.bought ? `${bb.name} bought` : got.length ? `${names} bought` : i4 ? `${money(a)} on ${i4.name} · first payment ${money(fp)}` : `${money(a)} recorded`);
    if (o.after) o.after();
  };
}
