/* Moved: one screen for every transfer between your own accounts, and payments onto cards and debts. From Pay or your card
   it's this pay's money: it ticks off the matching to-do, and anything past the plan comes off spending. From Savings, the
   Buffer or investments it's money you already had, so it doesn't touch this pay. */
import { today, money, walletCard, payAcctBal, poolBal, savedNow, investedNow, cardAvail, debtNow, order, isWallet, acctName,
  moveRecs, nwDelta, nwTxt, hypo, impShort, OTHER } from '../core/index.js';
import { app } from './store.js';
import { $, esc, showErr } from './dom.js';
import { openSheet, keypad, toStr, showStr } from './sheet.js';
import { commit } from './render.js';

export function movedSheet(o = {}) {
  const S = app.S, w = walletCard(S), st = { from: o.from || 'pay', to: o.to || null, open: o.to ? null : 'to' };
  const pad = { str: toStr(o.amount || 0, 2), fresh: !!o.amount, dec: 2, max: 1e7, onChange: s => { $('#mv-val').textContent = '$' + showStr(s); upd(); } };
  const dateV = () => ($('#f-date') && $('#f-date').value) || o.date || today();
  const bal = k => k === 'pool' ? poolBal(S) : k === 'buffer' ? savedNow(S) : investedNow(S);
  const owed = d => d.card ? `${money(cardAvail(S, d))} available` : `${money(debtNow(S, d))} owing`;
  const froms = () => [['pay', money(payAcctBal(S))], ['buffer', money(bal('buffer'))], ['pool', money(bal('pool'))]].concat(w ? [['card', owed(w)]] : [], [['inv', money(bal('inv'))], ['ext', '']]);
  const tos = () => (st.from !== 'pay' && st.from !== 'card' ? [['pay', money(payAcctBal(S))]] : []).concat([['buffer', money(bal('buffer'))], ['pool', money(bal('pool'))]]).concat(w ? [['card', owed(w)]] : [], [['inv', money(bal('inv'))]], order(S.debts).filter(d => !isWallet(d) && (d.card || debtNow(S, d) > 0.005)).map(d => ['d:' + d.id, owed(d)])).filter(([k]) => k !== st.from);
  const odd = o.date && o.date !== today();
  openSheet(esc(o.title || 'Moved'), `<div class="form sp-form"><div><p class="pad-val" id="mv-val">$0</p><p class="mv-imp" id="mv-imp"></p></div>
    <div class="mv-route" id="mv-route"></div><div class="mv-deck" id="mv-deck"><div class="keys" id="mv-keys" style="margin-top:0"></div><div class="acct-list" id="mv-list"></div></div>
    <p class="err" id="f-err" hidden></p><button class="btn primary big" id="f-save" type="button">Record</button>
    <button class="link sm sp-more" type="button" id="sp-more"${odd ? ' hidden' : ''}>Add a note or change the date</button>
    <div class="two" id="sp-extra"${odd ? '' : ' hidden'}><div><label class="lbl" for="f-note">Note</label><div class="field"><input id="f-note" type="text" maxlength="40" placeholder="Optional"></div></div>
      <div><label class="lbl" for="f-date">Date</label><input id="f-date" class="date" type="date" value="${o.date || today()}" style="width:100%"></div></div></div>`);
  $('#sp-more').onclick = () => { $('#sp-more').hidden = true; $('#sp-extra').hidden = false; };
  // From → To as two tiles in the colour of the money; tap one to pick from a short list under it.
  const colOf = k => k === 'pay' ? 'var(--c-pay)' : k === 'buffer' ? 'var(--c-save)' : k === 'pool' ? 'var(--c-buy)' : k === 'inv' ? 'var(--c-invest)' : k === 'ext' ? 'var(--muted)' : 'var(--c-debt)';
  const subOf = (list, k) => { const x = list.find(y => y[0] === k); return (x && x[1]) || (k === 'ext' ? 'Interest, a refund…' : ''); };
  const pill = (sd, k, list) => k ? `<button class="acct-t${st.open === sd ? ' open' : ''}" type="button" data-side="${sd}" style="--c:${colOf(k)}"><small>${sd === 'from' ? 'From' : 'To'}</small><b>${esc(acctName(S, k))}</b><span>${subOf(list, k)}</span></button>`
    : `<button class="acct-t empty${st.open === sd ? ' open' : ''}" type="button" data-side="${sd}"><small>To</small><b>Choose</b><span>Where it went</span></button>`;
  const paint = () => {
    if (st.to === st.from) st.to = null;
    $('#mv-route').innerHTML = pill('from', st.from, froms()) + '<span class="mv-arrow" aria-hidden="true">→</span>' + pill('to', st.to, tos());
    const list = st.open === 'from' ? froms() : st.open === 'to' ? tos() : null, cur = st.open === 'from' ? st.from : st.to, el = $('#mv-list');
    $('#mv-deck').classList.toggle('list', !!list);
    if (list) el.innerHTML = list.map(([k]) => `<button class="acct-r${cur === k ? ' on' : ''}" type="button" data-pick="${k}" style="--c:${colOf(k)}"><i></i><b>${esc(acctName(S, k))}</b><span>${subOf(list, k)}</span></button>`).join('');
  };
  // What each side looks like after: balances for your accounts, what's left or owing for cards and debts.
  const side = (k, a, sg) => {
    if (k === 'pay') { const v = payAcctBal(S); return sg > 0 ? `${esc(acctName(S, 'pay'))} ${money(v)} → ${money(v + a)}` : ''; }
    if (k === 'card' || k.startsWith('d:')) {
      const d = k === 'card' ? w : S.debts.find(x => x.id === k.slice(2)); if (!d) return '';
      if (d.card) { const av = cardAvail(S, d); return `${esc(d.name)} ${money(av)} → ${money(av + sg * a)}`; }
      const ow = debtNow(S, d); return `${esc(d.name)} ${money(ow)} → ${money(Math.max(0, ow - a))} owing`;
    }
    return `${esc(acctName(S, k))} ${money(bal(k))} → ${money(bal(k) + sg * a)}`;
  };
  const noteOf = () => $('#f-note').value.trim() || o.note || (st.from === 'pay' || (st.from === 'card' && st.to.startsWith('d:')) ? (st.to === 'inv' ? 'Investing' : acctName(S, st.to)) : `${acctName(S, st.from)} → ${acctName(S, st.to)}`);
  function upd() {
    const a = parseFloat(pad.str) || 0, el = $('#mv-imp');
    let html = '', cls = '';
    const short = OTHER.includes(st.from) ? bal(st.from) : st.from === 'card' && w ? cardAvail(S, w) : Infinity;
    if (a > short + 0.005) { html = `${esc(acctName(S, st.from))} only has ${money(short)}${st.from === 'card' ? ' available' : ''}.`; cls = 'later'; }
    else if (a > 0 && st.to) {
      const dn = nwDelta(S, moveRecs(S, st.from, st.to, a, dateV(), ''));
      // The date moves with what your net worth does: where the money went, or what it cost.
      const into = st.to === 'buffer' ? ['saved'] : st.to === 'inv' ? ['invested'] : st.to === 'card' ? ['debt', w && w.id] : st.to.startsWith('d:') ? ['debt', st.to.slice(2)] : null;
      const dd = dn > 0.5 && into ? hypo(S, app.P, into[0], dn, into[1] || null) : dn < -0.5 ? hypo(S, app.P, 'spend', -dn, null) : null, im = dd === null || Math.abs(dd) < 1 ? '' : impShort(S, dd, app.metric);
      html = [side(st.from, a, -1), side(st.to, a, 1), nwTxt(dn), im].filter(Boolean).join(' · ');
    }
    el.className = 'mv-imp ' + cls; el.innerHTML = html;
    $('#f-save').textContent = a > 0 && st.to && !cls ? `Record ${money(a)}` : 'Record';
  }
  keypad($('#mv-keys'), pad); paint(); pad.onChange(pad.str);
  $('#mv-route').onclick = e => { const b = e.target.closest('[data-side]'); if (!b) return; st.open = st.open === b.dataset.side ? null : b.dataset.side; paint(); };
  $('#mv-list').onclick = e => { const b = e.target.closest('[data-pick]'); if (!b) return; if (st.open === 'from') st.from = b.dataset.pick; else st.to = b.dataset.pick; st.open = st.open === 'from' && !st.to ? 'to' : null; paint(); upd(); };
  $('#f-save').onclick = () => {
    const a = parseFloat(pad.str) || 0;
    if (!(a > 0)) return showErr('Enter an amount above $0.');
    if (!st.to) return showErr('Pick where it went.');
    if (OTHER.includes(st.from) && a > bal(st.from) + 0.005) return showErr(`${acctName(S, st.from)} only has ${money(bal(st.from))}.`);
    if (st.from === 'card' && w && a > cardAvail(S, w) + 0.005) return showErr(`${w.name} only has ${money(cardAvail(S, w))} available.`);
    S.moves.push(...moveRecs(S, st.from, st.to, a, dateV(), noteOf()));
    commit(`${acctName(S, st.from)} → ${acctName(S, st.to)} · ${money(a)}`);
    if (o.after) o.after();
  };
}
