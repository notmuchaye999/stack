/* The forms: bills, debts, credit (cards and Afterpay), purchases and goals, plus each debt's and credit's own sheet. */
import { FREQ, uid, today, addDays, now, clamp, money, money0, fmtDate, monthly, perPay, nextOn, needsDate, everyPay, saveUp,
  debtNow, rawOwed, debtPlan, holdAmt, cardAvail, cardLocked, freeNow, overdue, walletCard, isWallet, isCard, sortMoves, TAGS,
  TAGN, tagOf, setTag, unlocks, etaTxt, goalNow, goalName, goalVal, whenPays } from '../core/index.js';
import { app, save } from './store.js';
import { $, esc, showErr, twoTap } from './dom.js';
import { openSheet, numpad, bindField } from './sheet.js';
import { rowsOf } from './lists.js';
import { renderAll, commit } from './render.js';
import { rewardOpts } from './rank.js';
import { spentSheet } from './spent.js';
import { movedSheet } from './moved.js';

/* One keyword per debt: Urgent, Focus, Fixed or Steady. */
const tagPick = cur => `<div><p class="lbl">Priority</p><div class="seg tag-seg" role="radiogroup" aria-label="Priority">${TAGS.map(t => `<label><input type="radio" name="f-tag" value="${t}"${t === cur ? ' checked' : ''}>${TAGN[t]}</label>`).join('')}</div><p class="muted small">Urgent: paid first, before your split. Focus: gets your debt money first. Fixed: repayments only. Steady: waits its turn.</p></div>`;
const pickedTag = () => { const r = document.querySelector('input[name="f-tag"]:checked'); return r ? r.value : 'steady'; };
export const tagBadge = d => `<span class="badge tag-${tagOf(d)}">${TAGN[tagOf(d)]}</span>`;
/* A debt or credit whose repayments come off your everyday card. */
const viaRow = d => { const w = walletCard(app.S); return w && !(d && d.wallet) ? `<label class="switch-row"><span>Paid from ${esc(w.name)}<span class="muted">Its repayments come off your card.</span></span><input type="checkbox" class="switch" id="f-via"${d && d.viaWallet ? ' checked' : ''}></label>` : ''; };
const viaOn = () => !!($('#f-via') && $('#f-via').checked);
/** What the card's own balance and the debt it counts as differ by, in words. */
const holdTxt = d => { const h = holdAmt(app.S, d); return h > 0.5 ? `${money(h)} of it is for this pay` : h < -0.5 ? `${money(-h)} spent before topping up` : ''; };

export function billSheet(id) {
  const S = app.S, b = id ? S.bills.find(x => x.id === id) : { name: '', amount: 0, every: 'month' }, f = { amount: +b.amount || 0 };
  openSheet(id ? 'Edit bill' : 'Add a bill', `<div class="form">
    <div><label class="lbl" for="f-name">Name</label><div class="field"><input id="f-name" type="text" maxlength="40" placeholder="Phone, rego, streaming…" value="${esc(b.name)}"></div></div>
    <div class="two"><div><span class="lbl">Amount</span><button class="nfield left" type="button" id="f-amt" aria-label="Amount"></button></div>
      <div><label class="lbl" for="f-every">How often</label><select id="f-every">${Object.keys(FREQ).map(k => `<option value="${k}"${k === b.every ? ' selected' : ''}>${FREQ[k].label}</option>`).join('')}</select></div></div>
    <div id="f-due-w"><label class="lbl" for="f-due">Next due (optional)</label><input id="f-due" class="date" type="date" style="width:100%" value="${b.due ? nextOn(b.due, b.every, today()) : ''}"></div>
    <p class="muted small" id="f-due-note" style="margin:0"></p>
    <label class="switch-row"><span>Direct debit<span class="muted">Ticks itself off on the due date.</span></span><input type="checkbox" class="switch" id="f-auto"${b.auto ? ' checked' : ''}></label>
    <p class="err" id="f-err" hidden></p>
    <button class="btn primary big" id="f-save" type="button">${id ? 'Save changes' : 'Add bill'}</button>
    ${id ? '<button class="btn wide danger" id="f-del" type="button" style="margin-top:0">Delete bill</button>' : ''}</div>`);
  bindField('#f-amt', f, 'amount', { label: 'Bill amount', prefix: '$', dec: 2, max: 1e7 });
  const note = () => {
    const e = $('#f-every').value; $('#f-due-w').hidden = !needsDate(S, e);
    $('#f-due-note').textContent = everyPay(S, e) ? 'Every pay.' : saveUp({ every: e }) ? 'Saved up a bit each pay.'
      : 'With a date it comes out of the pay before it\'s due.';
  };
  $('#f-every').onchange = note; note();
  $('#f-save').onclick = () => {
    const name = $('#f-name').value.trim(), every = $('#f-every').value, typed = $('#f-due').value || null;
    const same = id && b.due && every === b.every && typed === nextOn(b.due, b.every, today()), due = !needsDate(S, every) ? null : same ? b.due : typed;
    if (!name || !(f.amount > 0)) return showErr('Add a name and an amount above $0.');
    // A new next-due date is the next one to pay, so anything before it counts as paid.
    if (id && (needsDate(S, every) ? !same : every !== b.every)) b.paidTo = needsDate(S, every) && due ? addDays(due, -1) : undefined;
    const auto = $('#f-auto').checked;
    if (id) Object.assign(b, { name, amount: f.amount, every, due, auto }); else S.bills.push({ id: uid(), name, amount: f.amount, every, due, auto });
    commit(id ? 'Bill updated' : 'Bill added');
  };
  if (id) twoTap($('#f-del'), 'Tap again to delete', () => { app.S.bills = app.S.bills.filter(x => x.id !== id); commit('Bill deleted'); });
}

export function debtSheet(id) {
  const S = app.S, d = id ? S.debts.find(x => x.id === id) : null;
  const f = { bal: d ? Math.round(debtNow(S, d) * 100) / 100 : 0, rate: d ? d.rate : 0, min: d ? (d.minAmt ?? d.min) : 0 }, every = (d && d.minEvery) || 'month';
  openSheet(id ? 'Edit debt' : 'Add a debt', `<div class="form">
    <div><label class="lbl" for="f-name">Name</label><div class="field"><input id="f-name" type="text" maxlength="40" placeholder="Credit card, car loan, overdrawn account…" value="${d ? esc(d.name) : ''}"></div></div>
    ${tagPick(d ? tagOf(d) : 'steady')}
    <label class="switch-row"><span>Overdrawn bank account</span><input type="checkbox" class="switch" id="f-od"${d && d.od ? ' checked' : ''}></label>
    <label class="switch-row"><span>Interest-free if paid on time</span><input type="checkbox" class="switch" id="f-free"${d && d.free ? ' checked' : ''}></label>
    ${viaRow(d)}
    <div id="f-until-w"><label class="lbl" for="f-until">Interest-free until (leave blank if it doesn't end)</label><input id="f-until" class="date" type="date" style="width:100%" value="${d && d.until ? d.until : ''}"></div>
    <div class="two"><div><span class="lbl">Owing now</span><button class="nfield left" type="button" id="f-bal" aria-label="Owing now"></button></div>
      <div><span class="lbl" id="f-rate-l">Interest rate</span><button class="nfield left" type="button" id="f-rate" aria-label="Interest rate"></button></div></div>
    <div class="two"><div><span class="lbl">Repayment</span><button class="nfield left" type="button" id="f-min" aria-label="Repayment"></button></div>
      <div><label class="lbl" for="f-every">How often</label><select id="f-every">${['week', 'fortnight', 'month'].map(k => `<option value="${k}"${k === every ? ' selected' : ''}>${FREQ[k].label}</option>`).join('')}</select></div></div>
    <div id="f-due-w"><label class="lbl" for="f-due">Next repayment due (optional)</label><input id="f-due" class="date" type="date" style="width:100%" value="${d && d.due ? nextOn(d.due, d.minEvery || 'month', today()) : ''}"></div>
    <p class="err" id="f-err" hidden></p>
    <button class="btn primary big" id="f-save" type="button">${id ? 'Save changes' : 'Add debt'}</button>
    ${id ? '<button class="btn wide danger" id="f-del" type="button" style="margin-top:0">Delete debt</button>' : ''}</div>`);
  bindField('#f-bal', f, 'bal', { label: 'Owing now', prefix: '$', dec: 2, max: 1e8 });
  bindField('#f-rate', f, 'rate', { label: 'Interest rate', suffix: '%', dec: 2, max: 100 });
  bindField('#f-min', f, 'min', { label: 'Repayment (the minimum, or the instalment)', prefix: '$', dec: 2, max: 1e7 });
  const paintFree = () => { const on = $('#f-free').checked; $('#f-until-w').hidden = !on; $('#f-rate-l').textContent = on ? 'Late interest' : 'Interest rate'; };
  $('#f-free').onchange = paintFree; paintFree();
  const paintDue = () => { $('#f-due-w').hidden = !needsDate(S, $('#f-every').value); };
  $('#f-every').onchange = paintDue; paintDue();
  $('#f-save').onclick = () => {
    const name = $('#f-name').value.trim(), od = $('#f-od').checked, free = $('#f-free').checked, tag = pickedTag();
    const until = free ? ($('#f-until').value || null) : null, ev = $('#f-every').value, minM = monthly(f.min, ev), due = needsDate(S, ev) ? ($('#f-due').value || null) : null;
    if (!name) return showErr('Give the debt a name.');
    if (!od && !free && f.bal > 0 && f.rate > 0 && f.min <= 0) return showErr('Add the minimum repayment from your statement.');
    if (free && f.bal > 0 && f.min <= 0) return showErr("Add the repayment you need to make to keep it interest-free.");
    let x = d;
    if (d) {
      if (Math.abs(f.bal - debtNow(S, d)) > 0.004) { d.balance = f.bal; d.asOf = now(); }
      Object.assign(d, { name, rate: f.rate, min: minM, minAmt: f.min, minEvery: ev, due, od, free, until, viaWallet: viaOn() });
    } else { x = { id: uid(), name, balance: f.bal, rate: f.rate, min: minM, minAmt: f.min, minEvery: ev, due, od, free, until, viaWallet: viaOn(), asOf: now() }; S.debts.push(x); }
    setTag(S, x, tag);
    commit(id ? 'Debt updated' : 'Debt added');
  };
  if (id) twoTap($('#f-del'), 'Tap again to delete', () => { app.S.debts = app.S.debts.filter(x => x.id !== id); commit('Debt deleted'); });
}

export function buySheet(id) {
  const S = app.S, b = id ? S.buys.find(x => x.id === id) : { name: '', cost: 0 }, f = { cost: +b.cost || 0 }, it = id && unlocks(S).items.find(x => x.b.id === id);
  openSheet(id ? esc(b.name) : 'Add a purchase', `<div class="form">
    <div><label class="lbl" for="f-name">What is it</label><div class="field"><input id="f-name" type="text" maxlength="40" placeholder="Brake pads, impact driver…" value="${esc(b.name)}"></div></div>
    <div><span class="lbl">Cost</span><button class="nfield left" type="button" id="f-cost" aria-label="Cost"></button></div>
    ${b.bought ? '' : `<div><label class="lbl" for="f-at">Reward for reaching</label><select id="f-at"><option value="">No rank, just Savings</option>${rewardOpts(b.at)}</select></div>`}
    <p class="muted small" style="margin:0">${!id ? 'It unlocks once Savings covers it.' : b.bought ? 'Bought.' : it ? (it.open ? 'Unlocked. Savings covers it.' : esc(etaTxt(it)) + '.') : ''}</p>
    <p class="err" id="f-err" hidden></p>
    <button class="btn primary big" id="f-save" type="button">${id ? 'Save changes' : 'Add purchase'}</button>
    ${id && !b.bought ? '<button class="btn wide" id="f-bought" type="button" style="margin-top:0">Bought it</button><button class="link sm" id="f-mark" type="button" style="justify-self:center">Already recorded? Mark it bought</button>' : ''}
    ${id ? '<button class="btn wide danger" id="f-del" type="button" style="margin-top:0">Delete purchase</button>' : ''}</div>`);
  bindField('#f-cost', f, 'cost', { label: 'Cost', prefix: '$', dec: 2, max: 1e7 });
  $('#f-save').onclick = () => {
    const name = $('#f-name').value.trim();
    if (!name || !(f.cost > 0)) return showErr('Add what it is and what it costs.');
    const at = !$('#f-at') || $('#f-at').value === '' ? (b.bought ? b.at ?? null : null) : +$('#f-at').value;
    if (id) Object.assign(b, { name, cost: f.cost, at }); else { S.buys = S.buys || []; S.buys.push({ id: uid(), name, cost: f.cost, at }); }
    commit(id ? 'Purchase updated' : 'Purchase added');
  };
  // Buying it comes out of Savings first; anything past that is spending money.
  if (id && !b.bought) {
    $('#f-bought').onclick = () => spentSheet({ from: 'pot:' + b.id, amount: b.cost, title: `Bought ${esc(b.name)}` });
    // Paid for it and already recorded the spend (on Afterpay, say): it just comes off the list.
    twoTap($('#f-mark'), 'Tap again to mark it bought', () => { b.bought = true; commit(`${b.name} marked bought`); });
  }
  if (id) twoTap($('#f-del'), 'Tap again to delete', () => { app.S.buys = app.S.buys.filter(x => x.id !== id); commit('Purchase deleted'); });
}

/* ---------- credit ---------- */
export function creditForm(id) {
  const S = app.S, d = id ? S.debts.find(x => x.id === id) : null;
  const f = { limit: d ? d.limit : 1000, avail: d ? Math.round(cardAvail(S, d) * 100) / 100 : 0, min: d ? (d.minAmt ?? 0) : 0 }, every = (d && d.minEvery) || 'month';
  openSheet(d ? 'Edit credit' : 'Add a credit', `<div class="form">
    <div><label class="lbl" for="f-name">Name</label><div class="field"><input id="f-name" type="text" maxlength="40" placeholder="Card, Afterpay…" value="${d ? esc(d.name) : 'Card'}"></div></div>
    <div class="two"><div><span class="lbl">Limit</span><button class="nfield left" type="button" id="n-lim" aria-label="Limit"></button></div>
      <div><span class="lbl">Available now</span><button class="nfield left" type="button" id="n-av" aria-label="Available now"></button></div></div>
    <p class="muted small" id="n-own" style="margin:0"></p>
    <div class="two"><div><span class="lbl">Repayment</span><button class="nfield left" type="button" id="n-min" aria-label="Repayment"></button></div>
      <div><label class="lbl" for="f-every">How often</label><select id="f-every">${['week', 'fortnight', 'month'].map(k => `<option value="${k}"${k === every ? ' selected' : ''}>${FREQ[k].label}</option>`).join('')}</select></div></div>
    <div id="f-due-w"><label class="lbl" for="f-due">Next repayment due (optional)</label><input id="f-due" class="date" type="date" style="width:100%" value="${d && d.due ? nextOn(d.due, d.minEvery || 'month', today()) : ''}"></div>
    <label class="switch-row"><span>Lock when paid off<span class="muted">Last resort once it's back to the limit.</span></span><input type="checkbox" class="switch" id="f-lock"${!d || d.lock !== false ? ' checked' : ''}></label>
    <label class="switch-row"><span>Everyday card<span class="muted">Your spending money goes on it.</span></span><input type="checkbox" class="switch" id="f-wallet"${d && d.wallet ? ' checked' : ''}></label>
    <div id="f-nw"><label class="switch-row"><span>Pay in 4<span class="muted">First payment when you buy, then 3 more a fortnight apart.</span></span><input type="checkbox" class="switch" id="f-in4"${d && d.in4 ? ' checked' : ''}></label>
    ${viaRow(d)}</div>
    ${tagPick(d ? tagOf(d) : 'focus')}
    <p class="err" id="f-err" hidden></p>
    <button class="btn primary big" id="f-save" type="button">${d ? 'Save changes' : 'Add credit'}</button>
    ${d ? '<button class="btn wide danger" id="f-del" type="button" style="margin-top:0">Delete credit</button>' : ''}</div>`);
  const own = () => { $('#n-own').textContent = f.avail > f.limit + 0.005 ? `${money(f.avail - f.limit)} in credit` : `Owing ${money(f.limit - f.avail)}`; };
  bindField('#n-lim', f, 'limit', { label: 'Limit', prefix: '$', dec: 2, max: 1e7, after: own });
  bindField('#n-av', f, 'avail', { label: 'Available now', prefix: '$', dec: 2, max: 1e7, after: own });
  bindField('#n-min', f, 'min', { label: 'Repayment (optional)', prefix: '$', dec: 2, max: 1e7 });
  const paintDue = () => { $('#f-due-w').hidden = !needsDate(S, $('#f-every').value); };
  $('#f-every').onchange = paintDue; paintDue(); own();
  const paintW = () => { $('#f-nw').hidden = $('#f-wallet').checked; };
  $('#f-wallet').onchange = paintW; paintW();
  $('#f-save').onclick = () => {
    const name = $('#f-name').value.trim(), ev = $('#f-every').value, due = needsDate(S, ev) ? ($('#f-due').value || null) : null;
    if (!name) return showErr('Give it a name.');
    if (!(f.limit > 0)) return showErr('Add the limit.');
    const bal = Math.round((f.limit - f.avail) * 100) / 100;
    const fields = { name, limit: f.limit, rate: 0, min: monthly(f.min, ev), minAmt: f.min, minEvery: ev, due, od: false, free: true, until: null, lock: $('#f-lock').checked, wallet: $('#f-wallet').checked, card: true, in4: !$('#f-wallet').checked && $('#f-in4').checked, viaWallet: !$('#f-wallet').checked && viaOn() }, tag = pickedTag();
    let x = d;
    if (d) { if (Math.abs(bal - rawOwed(S, d)) > 0.004) { d.balance = bal; d.asOf = now(); } Object.assign(d, fields); }
    else { x = Object.assign({ id: uid(), balance: bal, asOf: now() }, fields); S.debts.push(x); }
    setTag(S, x, tag);
    if (x.wallet) S.debts.forEach(o => { if (o !== x) o.wallet = false; });
    commit(d ? 'Credit updated' : `${name} added`);
  };
  if (d) twoTap($('#f-del'), 'Tap again to delete', () => { app.S.debts = app.S.debts.filter(x => x.id !== d.id); commit('Credit deleted'); });
}
export function creditSheet(id) {
  const S = app.S, d = S.debts.find(x => x.id === id); if (!d) return creditForm();
  const av = cardAvail(S, d), lk = cardLocked(S, d), raw = rawOwed(S, d), w = isWallet(d);
  const note = raw < -0.005 ? `${money(-raw)} in credit` : lk ? 'Locked. Last resort only.' : raw <= 0.005 ? 'Paid off.' : `${money(raw)} to get back to ${money(d.limit)}`;
  openSheet(esc(d.name), `<div class="form"><div><p class="sum-big" style="margin:0">${money(av)}<small> of ${money(d.limit)}</small></p>
      <div class="bar"><span style="width:${(clamp(av / d.limit) * 100).toFixed(1)}%;background:var(--c-spend)"></span></div>
      <p class="muted small">${note}${w ? ' · Everyday card' : ''}</p>${holdTxt(d) ? `<p class="muted small" style="margin:0">Counts as owing ${money(debtPlan(S, d))}: ${holdTxt(d)}.</p>` : ''}</div>
    ${w || raw > 0.005 ? `<button class="btn primary big" type="button" id="n-pay">${w ? 'Top up' : 'Paid'}</button>` : ''}
    <button class="btn wide" type="button" id="n-spend" style="margin-top:0">Spent on it</button>
    <div class="duo"><button class="btn" type="button" id="n-fix">Set balance</button><button class="btn" type="button" id="n-edit">Edit</button></div>
    <div><p class="lbl">Recent</p><div class="grouped">${rowsOf(sortMoves(S.moves.filter(m => (m.type === 'debt' && m.ref === d.id) || (m.type === 'spend' && (m.credit === d.id || (w && isCard(m)))))), 'Nothing yet.', 12)}</div></div></div>`);
  if ($('#n-pay')) $('#n-pay').onclick = () => movedSheet({ from: !w && d.viaWallet && walletCard(S) ? 'card' : 'pay', to: w ? 'card' : 'd:' + d.id, title: w ? `Top up ${esc(d.name)}` : `Paid ${esc(d.name)}`, note: d.name, after: () => creditSheet(d.id) });
  $('#n-spend').onclick = () => spentSheet(w ? { title: `Spent on ${esc(d.name)}` } : { from: 'credit:' + d.id, title: `Spent on ${esc(d.name)}` });
  $('#n-edit').onclick = () => creditForm(d.id);
  $('#n-fix').onclick = () => numpad({ label: 'Available now', prefix: '$', dec: 2, max: 1e7, value: av, onDone: v => { d.balance = Math.round((d.limit - v) * 100) / 100; d.asOf = now(); commit('Balance set'); } });
}

/* The next payment on a debt, in words: "By 31 Oct", "$150 every pay", "$175 · 31 Oct", "Overdue · 31 Oct". */
function nextPay(d) {
  const S = app.S, owed = debtNow(S, d), amt = Math.min(owed, d.minAmt ?? d.min ?? 0), ev = d.minEvery || 'month';
  if (overdue(S, d)) return `<span class="neg">Overdue · ${fmtDate(d.due)}</span>`;
  if (!(amt > 0.5)) return '';
  if (everyPay(S, ev)) return `${money0(perPay(S, monthly(amt, ev)))} every pay`;
  if (!d.due) return `${money(amt)} ${FREQ[ev].per}`;
  const dt = nextOn(d.due, ev, today());
  return amt >= owed - 0.5 ? `By ${fmtDate(dt)}` : `${money(amt)} · ${fmtDate(dt)}`;
}
/* A debt that isn't a card: what's owing, the next payment, and every payment made. */
export function debtDetail(id) {
  const S = app.S, d = S.debts.find(x => x.id === id); if (!d) return;
  if (d.card) return creditSheet(id);
  const owed = debtNow(S, d), nx = nextPay(d), rate = freeNow(d) ? `0%${d.until ? ' until ' + fmtDate(d.until) : ''}` : `${d.rate}% interest`;
  openSheet(esc(d.name), `<div class="form"><div><p class="sum-big" style="margin:0">${money(owed)}<small> owing</small></p>
      <p class="muted small">${rate}${nx ? ' · ' + nx : ''}${owed > 0.005 ? ' · ' + tagBadge(d) : ''}</p></div>
    ${owed > 0.005 ? '<button class="btn primary big" type="button" id="dd-pay">Record a payment</button>' : ''}
    <div class="duo"><button class="btn" type="button" id="dd-fix">Set balance</button><button class="btn" type="button" id="dd-edit">Edit</button></div>
    <div><p class="lbl">Payments</p><div class="grouped">${rowsOf(sortMoves(S.moves.filter(m => m.type === 'debt' && m.ref === id)), 'No payments yet.', 30)}</div></div></div>`);
  if ($('#dd-pay')) $('#dd-pay').onclick = () => movedSheet({ from: d.viaWallet && walletCard(S) ? 'card' : 'pay', to: 'd:' + id, title: `Pay ${esc(d.name)}`, note: d.name, after: () => debtDetail(id) });
  $('#dd-edit').onclick = () => debtSheet(id);
  $('#dd-fix').onclick = () => numpad({ label: 'Owing now', prefix: '$', dec: 2, max: 1e8, value: owed, onDone: v => { d.balance = v; d.asOf = now(); save(); renderAll(); debtDetail(id); } });
}

/* ---------- goals ---------- */
export function goalSheet(id) {
  const S = app.S, g = id ? (S.goals || []).find(x => x.id === id) : { amount: 10000, kind: 'saved', by: null }; if (!g) return;
  const f = { amount: g.amount }, G = id ? goalNow(S, g) : null;
  openSheet(id ? goalName(g) : 'Add a goal', `<div class="form">
    ${G ? `<p class="muted" style="margin:0">${money(G.v)} of ${money(g.amount)} · ${G.done ? 'Done' : G.pays === null ? 'not at this pace' : `about ${whenPays(S, G.pays)} at ${money0(G.rate)} a pay`}</p>` : ''}
    <div><span class="lbl">Goal</span><button class="nfield left" type="button" id="g-amt" aria-label="Goal amount"></button></div>
    <div class="seg" role="radiogroup" aria-label="What it counts"><label><input type="radio" name="g-k" value="saved"${g.kind !== 'inv' ? ' checked' : ''}>Cash</label><label><input type="radio" name="g-k" value="inv"${g.kind === 'inv' ? ' checked' : ''}>Invested</label></div>
    <p class="muted small" style="margin:0">Cash counts your Buffer and Savings together.</p>
    <div><label class="lbl" for="g-by">By (optional)</label><input id="g-by" class="date" type="date" style="width:100%" value="${g.by || ''}"></div>
    <p class="err" id="f-err" hidden></p>
    <button class="btn primary big" id="g-save" type="button">${id ? 'Save changes' : 'Add goal'}</button>
    ${id ? '<button class="btn wide danger" id="g-del" type="button" style="margin-top:0">Delete goal</button>' : ''}</div>`);
  bindField('#g-amt', f, 'amount', { label: 'Goal', prefix: '$', dec: 0, max: 1e8 });
  $('#g-save').onclick = () => {
    if (!(f.amount > 0)) return showErr('Set an amount above $0.');
    const kind = document.querySelector('input[name="g-k"]:checked').value, by = $('#g-by').value || null;
    if (by && by <= today()) return showErr('Pick a date after today, or leave it empty.');
    const x = id ? g : { id: uid() };
    Object.assign(x, { amount: f.amount, kind, by });
    // Already there when you set it: no "goal reached" for it.
    x.hit = goalVal(S, x) >= x.amount - 0.005 ? x.hit || today() : null;
    if (!id) (S.goals = S.goals || []).push(x);
    commit(id ? 'Goal updated' : 'Goal added');
  };
  if (id) twoTap($('#g-del'), 'Tap again to delete', () => { app.S.goals = app.S.goals.filter(x => x.id !== id); commit('Goal deleted'); });
}
