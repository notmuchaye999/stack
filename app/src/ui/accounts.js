/* Accounts: laid out like your bank, each account with Available and Balance, in the same order. Under it, what Stack adds.
   Then each account's sheet: its balance, Update, and every entry. */
import { today, uid, now, clamp, money, money0, money2, kmoney, sortMoves, after, payAcctBal, payAnchor, outOfPay, latestStack,
  stackItems, payNow, savedNow, investedNow, poolBal, poolOut, bufferT, unlocks, etaTxt, credits, cardAvail,
  rawOwed, openBuys, payStillIn, nameOf, roleOf } from '../core/index.js';
import { app, save } from './store.js';
import { $, esc, CHEV, toast } from './dom.js';
import { openSheet, closeSheet, numpad, bindField } from './sheet.js';
import { rowsOf } from './lists.js';
import { renderAll } from './render.js';
import { movedSheet } from './moved.js';

/* Credit shows what's available and what's owed, like the bank. Everything else is just its balance: Stack can't see
   pending payments, so it doesn't pretend to know what's available. */
function acctCard(c, act, id, name, role, avail, bal, extra) {
  const v = avail === null ? `<span>Balance</span><b class="num">${money2(bal)}</b>` : `<span>Available</span><b class="num">${money2(avail)}</b><span>Balance</span><span class="num">${money2(bal)}</span>`;
  return `<div class="acct-c" style="--c:${c}"><button class="acct-h" type="button" data-act="${act}"${id ? ` data-id="${id}"` : ''}><span class="acct-n"><b>${esc(name)}</b>${role ? `<small>${role}</small>` : ''}</span>${CHEV}</button>
    <div class="acct-v">${v}</div>${extra ? `<div class="acct-x">${extra}</div>` : ''}</div>`;
}
export function renderSaved(D) {
  const S = app.S, { P } = D, sv = savedNow(S), inv = investedNow(S), emT = bufferT(S), fiT = P.none ? 0 : P.fiT, pool = poolBal(S), lt = latestStack(S);
  const per = emT > 0 ? emT / S.emMonths : 0, full = emT > 0 && sv >= emT - 0.5, out = [];
  // Pay account: whether this pay is in yet, and what of it is still to move.
  const pa = payAcctBal(S), N = lt ? payNow(S, lt) : null, jobs = N ? N.dues.length : 0;
  out.push(acctCard('var(--c-pay)', 'acct-pay', '', nameOf(S, 'pay'), roleOf(S, 'pay'), null, pa,
    N ? `<button class="link sm acct-go" type="button" data-go="stack">${N.short > 0.005 ? `${money(N.short)} short` : `${money(N.free)} free`}${jobs ? ` · ${jobs} still due` : ''} ›</button>` : ''));
  // Buffer: one cell per month it covers.
  const cells = Array.from({ length: Math.max(1, S.emMonths) }, (_, i) => `<i style="--f:${per > 0 ? (clamp(sv / per - i) * 100).toFixed(1) : 0}%"></i>`).join('');
  out.push(acctCard('var(--c-save)', 'buffer', '', nameOf(S, 'buffer'), roleOf(S, 'buffer'), null, sv,
    `<span class="shield${full ? ' full' : ''}">${cells}</span><span>${emT > 0 ? (full ? `Full · ${S.emMonths} months of bills and repayments` : `${(sv / per).toFixed(1)} of ${S.emMonths} months · ${money0(emT - sv)} to full`) : 'Add bills to set it'}</span>`));
  // Savings: what it's for, each purchase with its bar.
  const U = unlocks(S), pin = N && N.done.find(o => o.k === 'pool'), psug = N && N.sugs.find(o => o.to === 'pool');
  const rows = U.items.map(x => `<button class="row" type="button" data-act="buy" data-id="${x.b.id}"><span class="grow"><b>${esc(x.b.name)}</b><span class="muted small" style="margin:0">${x.open ? '<span class="badge ok">Unlocked</span>' : esc(etaTxt(x))}</span><span class="ubar1"><i style="width:${(clamp(U.pool / x.b.cost) * 100).toFixed(1)}%"></i></span></span><span class="num">${money(x.b.cost)}</span>${CHEV}</button>`).join('');
  out.push(acctCard('var(--c-buy)', 'pool-hist', '', nameOf(S, 'pool'), roleOf(S, 'pool'), null, pool,
    `<span>${!lt ? 'For purchases' : pin ? `${money(pin.amt)} in this pay${pin.sub ? ' · ' + esc(pin.sub) : ''}` : psug ? `${money(psug.amt)} suggested this pay` : 'Nothing in this pay'}</span>${rows ? `<div class="grouped flat">${rows}</div>` : ''}<button class="link sm acct-go" type="button" data-act="add-buy">Add a purchase ›</button>`));
  // Credit: the card you spend on first, with this pay's spending money; then the rest.
  [...credits(S)].sort((a, b) => (b.wallet ? 1 : 0) - (a.wallet ? 1 : 0)).forEach(d => {
    const tu = d.wallet && N ? N.sugs.find(x => x.to === 'card') : null, ex = d.wallet && N ? `<span>${money(N.spent)} spent this pay${tu ? ` · top up ${money(tu.amt)} suggested` : ''}</span>` : '';
    out.push(acctCard('var(--c-debt)', 'credit', d.id, d.name, d.wallet ? 'Credit card' : 'Credit', cardAvail(S, d), -rawOwed(S, d), ex));
  });
  out.push(acctCard('var(--c-invest)', 'invested', '', nameOf(S, 'inv'), roleOf(S, 'inv'), null, inv,
    `<span class="climb"><i style="width:${(fiT > 0 ? clamp(inv / fiT) * 100 : 0).toFixed(2)}%"></i></span><span>${fiT > 0 ? `${(inv / fiT * 100).toFixed(1)}% of your FI number, ${kmoney(fiT)}` : 'FI after your first pay'}</span>`));
  $('#sv-accts').innerHTML = out.join('');
}

/* ---------- account names ---------- */
export function nameField(k) { const f = $('#f-aname'); if (f) f.onchange = () => { const S = app.S; S.names = Object.assign({}, S.names); const v = f.value.trim(); if (v) S.names[k] = v; else delete S.names[k]; save(); renderAll(); }; }
export const nameRow = k => `<div><label class="lbl" for="f-aname">${k === 'inv' ? 'Name, like your broker or wallet' : 'Name in your bank'}</label><div class="field"><input id="f-aname" type="text" maxlength="24" value="${esc(nameOf(app.S, k))}"></div></div>`;

/* ---------- the pay account ---------- */
export function payAcctSheet() {
  const S = app.S, v = payAcctBal(S), a = payAnchor(S);
  const ms = sortMoves(S.moves.filter(m => after(a.asOf, m) && (m.type === 'pay' || m.type === 'topay' || m.type === 'bill' || outOfPay(m))));
  openSheet(esc(nameOf(S, 'pay')), `<div class="form"><div><p class="sum-big" style="margin:0">${money(v)}</p><p class="muted small">Your pay lands here and goes out from here.</p></div>
    <button class="btn wide" type="button" id="pa-upd" style="margin-top:0">Update</button>
    ${nameRow('pay')}
    <div><p class="lbl">Entries</p><div class="grouped">${rowsOf(ms, 'Nothing yet.')}</div></div></div>`);
  $('#pa-upd').onclick = () => numpad({ label: `${nameOf(S, 'pay')} balance now`, prefix: '$', dec: 2, max: 1e9, value: v, onDone: x => { app.S.payAcct = { start: x, asOf: now() }; save(); renderAll(); payAcctSheet(); toast(`${nameOf(app.S, 'pay')} ${money(x)}`); } });
  nameField('pay');
}

/* Buffer, Savings or investments: the balance, Update, and every entry. */
export function entriesSheet(k) {
  const S = app.S, buf = k === 'buffer', pool = k === 'pool', P = app.P, U = pool ? unlocks(S) : null;
  const v = buf ? savedNow(S) : pool ? poolBal(S) : investedNow(S), target = buf ? bufferT(S) : pool ? U.total : P && !P.none ? P.fiT : 0;
  const xo = a => m => m.type === 'xout' && m.acct === a;
  const ms = sortMoves(S.moves.filter(m => buf ? m.type === 'saved' || (m.type === 'spend' && m.from === 'buffer') || xo('buffer')(m) : pool ? m.type === 'pot' || poolOut(m) || xo('pool')(m) : m.type === 'invested' || m.type === 'mkt' || xo('inv')(m)));
  const sub = buf ? `Emergency money. ${S.emMonths} months of bills and repayments.` : pool ? (target > 0 ? 'For purchases. The target covers your whole list.' : 'For purchases. They unlock as it grows.')
    : target > 0 ? `FI number ${kmoney(target)}. At ${S.wr}% a year it covers your bills and spending.` : 'Your FI number shows after your first pay.';
  const how = buf || pool ? 'Type what your bank shows. The change is recorded: money in raises your rank, money out lowers it.' : 'Shares, ETFs or crypto: type what it\'s all worth in dollars, the total your app or wallet shows. What you put in and what the market does both move your rank.';
  openSheet(esc(nameOf(S, buf ? 'buffer' : pool ? 'pool' : 'inv')), `<div class="form"><div><p class="sum-big" style="margin:0">${money(v)}${target > 0 ? `<small> of ${buf ? money0(target) : pool ? money(target) : kmoney(target)}</small>` : ''}</p>
      <div class="bar thin"><span style="width:${(target > 0 ? clamp(v / target) : 0) * 100}%;background:var(${buf ? '--c-save' : pool ? '--c-buy' : '--c-invest'})"></span></div>
      <p class="muted small">${sub}</p></div>
    <button class="btn primary big" type="button" id="en-upd">Update</button>
    <p class="muted small" style="margin:-4px 0 0">${how}</p>
    ${nameRow(buf ? 'buffer' : pool ? 'pool' : 'inv')}
    <div><p class="lbl">Entries</p><div class="grouped">${rowsOf(ms, 'Nothing recorded yet.')}</div></div></div>`);
  $('#en-upd').onclick = () => updateBal(k, () => entriesSheet(k));
  nameField(buf ? 'buffer' : pool ? 'pool' : 'inv');
}
/* Update: type what your bank says. The first one is where you start. After that the difference is recorded as money
   that moved: in raises your rank and ticks off this pay's transfer, out lowers it. Investments split it into what you put in
   and what the market did. */
const BAL = {
  buffer:   { label: 'Buffer in your bank now', get: S => savedNow(S), any: m => m.type === 'saved' || (m.type === 'spend' && m.from === 'buffer') || (m.type === 'xout' && m.acct === 'buffer'), asOf: S => S.savedAsOf, start: (S, v) => { S.startSaved = v; S.savedAsOf = now(); } },
  pool:     { label: 'Savings in your bank now', get: S => poolBal(S), any: m => m.type === 'pot' || poolOut(m) || (m.type === 'xout' && m.acct === 'pool'), asOf: S => S.poolAsOf, start: (S, v) => { S.startPool = v; S.poolAsOf = now(); } },
  invested: { label: 'Investments worth now', get: S => investedNow(S), any: m => m.type === 'invested' || m.type === 'mkt' || (m.type === 'xout' && m.acct === 'inv'), asOf: S => S.investedAsOf, start: (S, v) => { S.startInvested = v; S.investedAsOf = now(); } },
};
/* Money that showed up in Buffer or Savings while a pay is running: from this pay, or from somewhere else. */
function fromSheet(k, amt, done) {
  const name = k === 'buffer' ? 'Buffer' : 'Savings';
  openSheet(`${name} +${money(amt)}`, `<div class="form"><p class="muted" style="margin:0">Where did it come from?</p><div class="grouped">
    <button class="row" type="button" data-from="pay"><span class="grow"><b>This pay</b><span class="muted small" style="margin:0">Counts as moved from this pay</span></span></button>
    <button class="row" type="button" data-from="ext"><span class="grow"><b>Somewhere else</b><span class="muted small" style="margin:0">Interest, a refund, money sent to you. Your pay isn't touched</span></span></button></div></div>`);
  $('#sheet').querySelectorAll('[data-from]').forEach(el => { el.onclick = () => {
    app.S.moves.push(Object.assign({ id: uid(), t: Date.now(), date: today(), src: 'manual', amount: amt, note: name, type: k === 'buffer' ? 'saved' : 'pot' }, el.dataset.from === 'ext' ? { from: 'ext' } : {}));
    closeSheet(); done(`${name} +${money(amt)}${el.dataset.from === 'ext' ? ' from somewhere else' : ''}`);
  }; });
}
export function updateBal(k, back) {
  const S = app.S, c = BAL[k], cur = Math.round(c.get(S) * 100) / 100, first = !c.asOf(S) && !S.moves.some(c.any);
  const still = k === 'buffer' ? payStillIn(S) : 0, lt = latestStack(S), running = !!lt && lt.date <= today();
  numpad({ label: still > 0.5 ? 'Buffer account balance now' : c.label, prefix: '$', dec: 2, max: 1e9, value: cur + still, onDone: typed => {
    // Pay goes into the Buffer account: ask whether it's in yet, then take off what of it is still there.
    if (still > 0.5 && !first) {
      openSheet(`Buffer account ${money(typed)}`, `<div class="form"><p class="muted" style="margin:0">This pay still has ${money(still)} in that account to move. Is it paid in yet?</p><div class="grouped">
        <button class="row" type="button" data-in="1"><span class="grow"><b>Yes</b><span class="muted small" style="margin:0">Buffer is ${money(typed - still)}</span></span></button>
        <button class="row" type="button" data-in="0"><span class="grow"><b>Not yet</b><span class="muted small" style="margin:0">Buffer is ${money(typed)}</span></span></button></div></div>`);
      $('#sheet').querySelectorAll('[data-in]').forEach(el => { el.onclick = () => { closeSheet(); apply(el.dataset.in === '1' ? Math.max(0, typed - still) : typed); }; });
      return;
    }
    apply(typed);
  } });
  function apply(v) {
    const diff = Math.round((v - cur) * 100) / 100, done = msg => { save(); renderAll(); if (back) back(); toast(msg); };
    const mv = o => app.S.moves.push(Object.assign({ id: uid(), t: Date.now(), date: today(), src: 'manual' }, o));
    if (first) { c.start(app.S, v); return done(`Starting at ${money(v)}`); }
    if (Math.abs(diff) < 0.005) return toast('No change');
    if (k === 'invested') return investSheet(cur, v, back);
    const name = k === 'buffer' ? 'Buffer' : 'Savings';
    if (diff > 0) { if (running) return fromSheet(k, diff, done); mv(k === 'buffer' ? { type: 'saved', amount: diff, note: 'Buffer' } : { type: 'pot', amount: diff, note: 'Savings' }); return done(`${name} +${money(diff)}`); }
    if (k === 'buffer') { mv({ type: 'spend', from: 'buffer', amount: -diff, note: 'From Buffer' }); return done(`Buffer −${money(-diff)}`); }
    poolOutSheet(-diff, back);
  }
}
/* Savings went down: what was it for? A purchase gets marked bought. */
function poolOutSheet(x, back) {
  const bs = openBuys(app.S);
  openSheet(`Savings −${money(x)}`, `<div class="form"><p class="muted" style="margin:0">What was it for?</p>
    <div class="grouped">${bs.map(b => `<button class="row" type="button" data-pout="${b.id}"><span class="grow"><b>${esc(b.name)}</b><span class="muted small" style="margin:0">Marks it bought</span></span><span class="num">${money(b.cost)}</span></button>`).join('')}<button class="row" type="button" data-pmove><span class="grow"><b>Moved to another account</b></span></button><button class="row" type="button" data-pout=""><span class="grow"><b>Something else</b></span></button></div></div>`);
  $('#sheet').querySelector('[data-pmove]').onclick = () => movedSheet({ from: 'pool', amount: x, after: back });
  $('#sheet').querySelectorAll('[data-pout]').forEach(el => { el.onclick = () => {
    const S = app.S, b = el.dataset.pout ? S.buys.find(y => y.id === el.dataset.pout) : null;
    S.moves.push(Object.assign({ id: uid(), t: Date.now(), date: today(), amount: x, type: 'spend', src: 'manual' }, b ? { buy: b.id, grp: uid(), note: b.name } : { from: 'pool', note: 'From Savings' }));
    if (b) b.bought = true;
    save(); closeSheet(); renderAll(); if (back) back(); toast(b ? `${b.name} bought` : `Savings −${money(x)}`);
  }; });
}
/* Investments changed: what you put in (this pay's investing to start with) and what the market did. */
function investSheet(cur, v, back) {
  const S = app.S, lt = latestStack(S), it = lt && stackItems(S, lt).todos.find(i => i.type === 'invested'), diff = Math.round((v - cur) * 100) / 100;
  const f = { put: it ? Math.max(0, Math.round((it.plan - it.done) * 100) / 100) : 0 };
  openSheet('Investments', `<div class="form"><p class="sum-big" style="margin:0">${money(cur)}<small> → </small>${money(v)}</p>
    <div class="two"><div><span class="lbl">You put in</span><button class="nfield left" type="button" id="iv-put" aria-label="You put in"></button></div>
      <div><span class="lbl">Market</span><div class="nfield left static" id="iv-mkt"></div></div></div>
    <p class="muted small" style="margin:0">What you put in ticks off this pay's investing. Both parts move your rank.</p>
    <button class="btn primary big" id="iv-go" type="button">Record</button></div>`);
  const mk = () => Math.round((diff - f.put) * 100) / 100, paint = () => { const m = mk(); $('#iv-mkt').textContent = (m > 0.005 ? '+' : '') + money(m); };
  bindField('#iv-put', f, 'put', { label: 'You put in', prefix: '$', dec: 2, max: 1e9, after: paint }); paint();
  $('#iv-go').onclick = () => {
    const m = mk(), t = Date.now();
    if (f.put > 0.005) app.S.moves.push({ id: uid(), t, date: today(), amount: f.put, type: 'invested', note: 'Investing', src: 'manual' });
    if (Math.abs(m) > 0.005) app.S.moves.push({ id: uid(), t: t + 1, date: today(), amount: m, type: 'mkt', note: m > 0 ? 'Market up' : 'Market down', src: 'manual' });
    save(); closeSheet(); renderAll(); if (back) back(); toast(f.put > 0.005 ? `Invested +${money(f.put)}` : 'Investments updated');
  };
}
