/* Forms in bottom sheets: bills, debts, planned buys, recording money that moved, and checking balances. */
import { FREQ, DPM, uid, today, addDays, now, money, dur, spanTxt, monthly, debtNow, debtName, order, buyLeft, openBuys,
  savedNow, investedNow, cycles, hypo, project, latestStack, stackItems, nextOn, needsDate, everyPay, saveUp } from '../core/index.js';
import { app, ui } from './store.js';
import { $, esc, openSheet, showErr, twoTap, impCls, impSentence } from './dom.js';
import { bindField, keypad, showStr, toStr } from './numpad.js';
import { commit } from './render.js';

export function billSheet(id) {
  const S = app.S, b = id ? S.bills.find(x => x.id === id) : { name: '', amount: 0, every: 'month' }, f = { amount: +b.amount || 0 };
  openSheet(id ? 'Edit bill' : 'Add a bill', `<div class="form">
    <div><label class="lbl" for="f-name">Name</label><div class="field"><input id="f-name" type="text" maxlength="40" placeholder="Phone, rego, streaming…" value="${esc(b.name)}"></div></div>
    <div class="two"><div><span class="lbl">Amount</span><button class="nfield left" type="button" id="f-amt" aria-label="Amount"></button></div>
      <div><label class="lbl" for="f-every">How often</label><select id="f-every">${Object.keys(FREQ).map(k => `<option value="${k}"${k === b.every ? ' selected' : ''}>${FREQ[k].label}</option>`).join('')}</select></div></div>
    <div id="f-due-w"><label class="lbl" for="f-due">Next due (optional)</label><input id="f-due" class="date" type="date" style="width:100%" value="${b.due ? nextOn(b.due, b.every, today()) : ''}"></div>
    <p class="muted small" id="f-due-note" style="margin:0"></p>
    <p class="err" id="f-err" hidden></p>
    <button class="btn primary big" id="f-save" type="button">${id ? 'Save changes' : 'Add bill'}</button>
    ${id ? '<button class="btn wide danger" id="f-del" type="button" style="margin-top:0">Delete bill</button>' : ''}</div>`);
  bindField('#f-amt', f, 'amount', { label: 'Bill amount', prefix: '$', dec: 2, max: 1e7 });
  const note = () => {
    const e = $('#f-every').value; $('#f-due-w').hidden = !needsDate(S, e);
    $('#f-due-note').textContent = everyPay(S, e) ? 'Comes out of every pay, no date needed.' : saveUp({ every: e }) ? 'Stack puts a little aside every pay so this is covered when it lands. The date just shows you when.'
      : 'Add the date and the whole bill comes out of the pay before it\'s due. Leave it blank and it\'s split across your pays.';
  };
  $('#f-every').onchange = note; note();
  $('#f-save').onclick = () => {
    const name = $('#f-name').value.trim(), every = $('#f-every').value, due = needsDate(S, every) ? ($('#f-due').value || null) : null;
    if (!name || !(f.amount > 0)) return showErr('Add a name and an amount above $0.');
    if (id) Object.assign(b, { name, amount: f.amount, every, due }); else S.bills.push({ id: uid(), name, amount: f.amount, every, due });
    commit(id ? 'Bill updated' : 'Bill added');
  };
  if (id) twoTap($('#f-del'), 'Tap again to delete', () => { S.bills = S.bills.filter(x => x.id !== id); commit('Bill deleted'); });
}

export function debtSheet(id) {
  const S = app.S, d = id ? S.debts.find(x => x.id === id) : null;
  const f = { bal: d ? Math.round(debtNow(S, d) * 100) / 100 : 0, rate: d ? d.rate : 0, min: d ? (d.minAmt ?? d.min) : 0 }, every = (d && d.minEvery) || 'month';
  openSheet(id ? 'Edit debt' : 'Add a debt', `<div class="form">
    <div><label class="lbl" for="f-name">Name</label><div class="field"><input id="f-name" type="text" maxlength="40" placeholder="Credit card, car loan, overdrawn account…" value="${d ? esc(d.name) : ''}"></div></div>
    <label class="switch-row"><span>Pay this off first<span class="muted">Every extra dollar goes here before any other debt.</span></span><input type="checkbox" class="switch" id="f-focus"${d && d.focus ? ' checked' : ''}></label>
    <label class="switch-row"><span>Overdrawn bank account<span class="muted">Cleared before other debts, unless you pick one above.</span></span><input type="checkbox" class="switch" id="f-od"${d && d.od ? ' checked' : ''}></label>
    <label class="switch-row"><span>Interest-free if paid on time<span class="muted">Like Afterpay. If a missed payment only costs a late fee, leave the late rate at 0%.</span></span><input type="checkbox" class="switch" id="f-free"${d && d.free ? ' checked' : ''}></label>
    <div id="f-until-w"><label class="lbl" for="f-until">Interest-free until (leave blank if it doesn't end)</label><input id="f-until" class="date" type="date" style="width:100%" value="${d && d.until ? d.until : ''}"></div>
    <div class="two"><div><span class="lbl">Owing now</span><button class="nfield left" type="button" id="f-bal" aria-label="Owing now"></button></div>
      <div><span class="lbl" id="f-rate-l">Interest rate</span><button class="nfield left" type="button" id="f-rate" aria-label="Interest rate"></button></div></div>
    <div class="two"><div><span class="lbl">Repayment</span><button class="nfield left" type="button" id="f-min" aria-label="Repayment"></button></div>
      <div><label class="lbl" for="f-every">How often</label><select id="f-every">${['week', 'fortnight', 'month'].map(k => `<option value="${k}"${k === every ? ' selected' : ''}>${FREQ[k].label}</option>`).join('')}</select></div></div>
    <div id="f-due-w"><label class="lbl" for="f-due">Next repayment due (optional)</label><input id="f-due" class="date" type="date" style="width:100%" value="${d && d.due ? nextOn(d.due, d.minEvery || 'month', today()) : ''}">
      <p class="muted small">Add it and the whole repayment comes out of the pay before it's due. Leave it blank and it's split across your pays.</p></div>
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
    const name = $('#f-name').value.trim(), od = $('#f-od').checked, free = $('#f-free').checked, focus = $('#f-focus').checked;
    const until = free ? ($('#f-until').value || null) : null, ev = $('#f-every').value, minM = monthly(f.min, ev), due = needsDate(S, ev) ? ($('#f-due').value || null) : null;
    if (!name) return showErr('Give the debt a name.');
    if (!od && !free && f.bal > 0 && f.rate > 0 && f.min <= 0) return showErr('Add the minimum repayment from your statement.');
    if (free && f.bal > 0 && f.min <= 0) return showErr("Add the repayment you need to make to keep it interest-free.");
    if (focus) S.debts.forEach(x => { x.focus = false; });
    if (d) {
      if (Math.abs(f.bal - debtNow(S, d)) > 0.004) { d.balance = f.bal; d.asOf = now(); }
      Object.assign(d, { name, rate: f.rate, min: minM, minAmt: f.min, minEvery: ev, due, od, free, until, focus });
    } else S.debts.push({ id: uid(), name, balance: f.bal, rate: f.rate, min: minM, minAmt: f.min, minEvery: ev, due, od, free, until, focus, asOf: now() });
    commit(id ? 'Debt updated' : 'Debt added');
  };
  if (id) twoTap($('#f-del'), 'Tap again to delete', () => { S.debts = S.debts.filter(x => x.id !== id); commit('Debt deleted'); });
}

export function buySheet(id) {
  const S = app.S, b = id ? S.buys.find(x => x.id === id) : { name: '', cost: 0, by: addDays(today(), 60) }, f = { cost: +b.cost || 0 };
  const done = id && (b.bought || buyLeft(S, b) <= 0.5);
  openSheet(id ? 'Planned buy' : 'Add a planned buy', `<div class="form">
    <div><label class="lbl" for="f-name">What is it</label><div class="field"><input id="f-name" type="text" maxlength="40" placeholder="Brake pads, impact driver…" value="${esc(b.name)}"></div></div>
    <div class="two"><div><span class="lbl">Cost</span><button class="nfield left" type="button" id="f-cost" aria-label="Cost"></button></div>
      <div><label class="lbl" for="f-by">Need it by</label><input id="f-by" class="date" type="date" style="width:100%" value="${b.by}"></div></div>
    ${id ? `<p class="muted small" style="margin:0">${done ? 'Bought.' : `${money(b.cost - buyLeft(S, b))} spent on it so far. When you buy it, add the spend and tag it to this.`}</p>` : '<p class="muted small" style="margin:0">Stack puts a bit aside each pay, before your card budget, so it\'s there when you need it.</p>'}
    <p class="err" id="f-err" hidden></p>
    <button class="btn primary big" id="f-save" type="button">${id ? 'Save changes' : 'Add planned buy'}</button>
    ${id && !done ? '<button class="btn wide" id="f-bought" type="button" style="margin-top:0">Mark as bought</button>' : ''}
    ${id ? '<button class="btn wide danger" id="f-del" type="button" style="margin-top:0">Delete</button>' : ''}</div>`);
  bindField('#f-cost', f, 'cost', { label: 'Cost', prefix: '$', dec: 2, max: 1e7 });
  $('#f-save').onclick = () => {
    const name = $('#f-name').value.trim(), by = $('#f-by').value || addDays(today(), 60);
    if (!name || !(f.cost > 0)) return showErr('Add what it is and what it costs.');
    if (id) Object.assign(b, { name, cost: f.cost, by }); else { S.buys = S.buys || []; S.buys.push({ id: uid(), name, cost: f.cost, by }); }
    commit(id ? 'Planned buy updated' : 'Planned buy added');
  };
  if (id && !done) $('#f-bought').onclick = () => { b.bought = true; commit(`${b.name} marked as bought`); };
  if (id) twoTap($('#f-del'), 'Tap again to delete', () => { S.buys = S.buys.filter(x => x.id !== id); commit('Deleted'); });
}

/* Record money that actually moved: a spend, savings, investing or a debt payment. Shows its effect on the FI date as you type. */
export function recSheet(o) {
  const S = app.S, owing = order(S.debts).find(x => debtNow(S, x) > 0.005) || S.debts[0];
  const st = { type: o.type, ref: o.ref || (owing ? owing.id : null), buy: null };
  const buys = o.type === 'spend' ? openBuys(S) : [];
  const pad = { str: toStr(o.amount || 0, 2), dec: 2, max: 1e7, onChange: s => { $('#mv-val').textContent = '$' + showStr(s); upd(); } };
  const seg = o.lock ? '' : `<div class="seg" role="radiogroup" aria-label="Where it went">${['saved', 'invested', 'debt'].map(k => `<label><input type="radio" name="f-t" value="${k}"${k === st.type ? ' checked' : ''}>${k === 'saved' ? 'Savings' : k === 'invested' ? 'Invested' : 'Debt'}</label>`).join('')}</div>`;
  const buyPick = buys.length ? `<div><p class="lbl">Is this a planned buy?</p><div class="pick" id="mv-buys" style="padding:0"></div></div>` : '';
  openSheet(esc(o.title), `<div class="form">${seg}<div class="pick" id="mv-debts" hidden></div>${buyPick}
    <p class="pad-val" id="mv-val">$0</p><p class="mv-imp" id="mv-imp"></p><div class="keys" id="mv-keys" style="margin-top:0"></div>
    <div class="two"><div><label class="lbl" for="f-note">Note</label><div class="field"><input id="f-note" type="text" maxlength="40" value="${esc(o.note || '')}" placeholder="Optional"></div></div>
      <div><label class="lbl" for="f-date">Date</label><input id="f-date" class="date" type="date" value="${o.date || today()}" style="width:100%"></div></div>
    <p class="err" id="f-err" hidden></p><button class="btn primary big" id="f-save" type="button">Record</button></div>`);
  const paintDebts = () => {
    const el = $('#mv-debts'); el.hidden = st.type !== 'debt' || !!o.lock;
    el.innerHTML = S.debts.length ? order(S.debts).map(d => `<button type="button" data-ref="${d.id}" aria-pressed="${d.id === st.ref}">${esc(d.name)}</button>`).join('')
      : '<span class="muted small">Add the debt under Bills first so payments come off its balance.</span>';
  };
  const paintBuys = () => { const el = $('#mv-buys'); if (el) el.innerHTML = `<button type="button" data-buy="" aria-pressed="${!st.buy}">No</button>` + buys.map(b => `<button type="button" data-buy="${b.id}" aria-pressed="${st.buy === b.id}">${esc(b.name)}</button>`).join(''); };
  function upd() {
    const a = parseFloat(pad.str) || 0, d = a > 0 ? hypo(S, st.type, a, st.ref, app.base) : null, el = $('#mv-imp');
    const stk = latestStack(S), I = stk && stackItems(S, stk), inBudget = st.type === 'spend' && I && I.spent + a <= stk.plan.spend + 0.5;
    const n = cycles(S) ? cycles(S).n : 0;
    el.className = 'mv-imp ' + (st.buy || inBudget ? '' : impCls(d));
    el.innerHTML = !(a > 0) ? '' : st.buy ? 'Comes out of what you put aside for it.' : inBudget ? `Inside this pay's card budget (${money(stk.plan.spend - I.spent)} left), so it's already counted.`
      : d === null ? 'Stack a pay to see how this moves your FI date.' : impSentence(d, false) + (st.type === 'spend' && Math.abs(d) >= 1 && n < 3 ? ` <span class="muted">With ${n === 1 ? '1 pay' : '2 pays'} entered, the countdown assumes every pay goes like ${n === 1 ? 'this one' : 'these'}.</span>` : '');
    $('#f-save').textContent = a > 0 ? `Record ${money(a)}` : 'Record';
  }
  keypad($('#mv-keys'), pad); paintDebts(); paintBuys(); pad.onChange(pad.str);
  if ($('#mv-buys')) $('#mv-buys').onclick = e => { const b = e.target.closest('[data-buy]'); if (!b) return; st.buy = b.dataset.buy || null; paintBuys(); upd(); };
  $('#sheet').querySelectorAll('input[name="f-t"]').forEach(r => { r.onchange = () => { st.type = r.value; paintDebts(); upd(); }; });
  $('#mv-debts').onclick = e => { const b = e.target.closest('[data-ref]'); if (!b) return; st.ref = b.dataset.ref; paintDebts(); upd(); };
  $('#f-save').onclick = () => {
    const a = parseFloat(pad.str) || 0;
    if (!(a > 0)) return showErr('Enter an amount above $0.');
    if (st.type === 'debt' && S.debts.length && !st.ref) return showErr('Pick which debt you paid.');
    const bb = st.buy && S.buys.find(x => x.id === st.buy);
    const def = bb ? bb.name : { spend: 'Card top-up', saved: 'Savings', invested: 'Investing', debt: st.ref ? debtName(S, st.ref) : 'Debt payment' }[st.type];
    S.moves.push({ id: uid(), t: Date.now(), date: $('#f-date').value || today(), amount: a, type: st.type, ref: st.type === 'debt' ? st.ref : null, buy: st.buy || undefined, note: $('#f-note').value.trim() || def, src: 'manual' });
    if (bb && buyLeft(S, bb) <= 0.5) bb.bought = true;
    commit(bb ? `${bb.name}: ${money(a)} recorded` : `${money(a)} recorded`);
    if (o.after) o.after();
  };
}

/* A statement only shows one account, so balances come from you, not from adding up transfers. Shown after every import. */
export function balanceSheet(before, n) {
  const S = app.S, f = { saved: Math.max(0, Math.round(savedNow(S) * 100) / 100), inv: Math.max(0, Math.round(investedNow(S) * 100) / 100) };
  S.debts.forEach(d => { f['d' + d.id] = Math.round(debtNow(S, d) * 100) / 100; });
  openSheet('Check your balances', '');
  $('#sheet-body').innerHTML = `<div class="form">
    <p style="margin:0">${n !== null ? `Imported ${n} transactions. ` : ''}A statement only shows one account, so Stack can't see what's really in your savings or investments, or what you owe. Set each one to what your bank shows today.</p>
    <div>
      <div class="frow" style="padding-inline:0;border-top:0"><span>Savings</span><button class="nfield" type="button" id="b-saved" aria-label="Savings"></button></div>
      <div class="frow" style="padding-inline:0"><span>Investments</span><button class="nfield" type="button" id="b-inv" aria-label="Investments"></button></div>
      ${S.debts.map(d => `<div class="frow" style="padding-inline:0"><span>${esc(d.name)}</span><button class="nfield" type="button" id="b-${d.id}" aria-label="${esc(d.name)} owing"></button></div>`).join('')}
    </div>
    <p class="muted small" style="margin:0">The numbers in there now are Stack's guess from the statement. Tap one to change it.</p>
    <button class="btn primary big" type="button" id="b-save">Save balances</button></div>`;
  bindField('#b-saved', f, 'saved', { label: 'Savings today', prefix: '$', dec: 2, max: 1e9 });
  bindField('#b-inv', f, 'inv', { label: 'Investments worth today', prefix: '$', dec: 2, max: 1e9 });
  S.debts.forEach(d => bindField('#b-' + d.id, f, 'd' + d.id, { label: `${d.name} owing today`, prefix: '$', dec: 2, max: 1e8 }));
  $('#b-save').onclick = () => {
    S.startSaved = f.saved; S.savedAsOf = now(); S.startInvested = f.inv; S.investedAsOf = now();
    S.debts.forEach(d => { d.balance = f['d' + d.id]; d.asOf = now(); });
    const afterFi = project(S, { fast: true }).fi;
    let msg = 'Balances saved.';
    if (before !== null && afterFi !== null) { const d = (afterFi - before) * DPM; if (Math.abs(d) >= 1) msg += ` FI date moved ${d > 0 ? 'back ' + spanTxt(d) : spanTxt(-d) + ' closer'}.`; }
    else if (afterFi !== null) msg += ` Countdown: ${dur(Math.round(afterFi))}.`;
    ui.animated = false; commit(msg);
  };
}
