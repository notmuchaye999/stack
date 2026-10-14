/* Bills & debts: what's due before your next pay, your debts in the order extra money goes, and planned buys. */
import { DPM, today, addDays, parseISO, money, fmtDate, monthYear, monthly, perPay, periodDays, debtTotal, debtNow, order, freeNow,
  openBuys, buyLeft, buyPerPay, billsFor, nextOn, everyPay, needsDate, saveUp, UNIT } from '../core/index.js';
import { app, ui } from './store.js';
import { $, esc, CHEV } from './dom.js';

export function renderBills(D) {
  const S = app.S, L = D.P.L;
  document.querySelectorAll('[data-seg]').forEach(b => b.setAttribute('aria-selected', b.dataset.seg === ui.seg));
  $('#bd-add').textContent = ui.seg === 'bills' ? 'Add a bill' : ui.seg === 'buys' ? 'Add a planned buy' : 'Add a debt';
  if (ui.seg === 'buys') {
    const open = openBuys(S), left = open.reduce((s, b) => s + buyLeft(S, b), 0), per = open.reduce((s, b) => s + Math.min(buyLeft(S, b), buyPerPay(S, b, today())), 0);
    $('#bd-sum').innerHTML = `<p class="eyebrow">Planned buys</p><p class="sum-big">${money(left)}<small> to go</small></p><p class="muted small">${open.length ? `${money(per)} put aside each pay, before your card budget.` : 'Car parts, tools, anything you know is coming. Stack puts a bit aside each pay so it doesn\'t blow your budget.'}</p>`;
    const list = [...(S.buys || [])].sort((a, b) => (a.bought ? 1 : 0) - (b.bought ? 1 : 0) || a.by.localeCompare(b.by));
    $('#bd-list').innerHTML = list.length ? list.map(b => {
      const done = b.bought || buyLeft(S, b) <= 0.5;
      return `<button class="row" type="button" data-act="buy" data-id="${b.id}"><span class="grow"><b>${esc(b.name)}</b><span class="muted small" style="margin:0">${done ? 'Bought' : `By ${fmtDate(b.by)} · ${money(Math.min(buyLeft(S, b), buyPerPay(S, b, today())))} a pay`}</span>${done ? '<span class="badge ok">Done</span>' : ''}</span><span class="num">${money(b.cost)}</span>${CHEV}</button>`;
    }).join('') : '<p class="empty">Nothing planned yet.</p>';
  } else if (ui.seg === 'bills') {
    const t = today(), soon = billsFor(S, t, addDays(t, periodDays(S))), soonT = soon.reduce((s, b) => s + b.v, 0), noDue = S.bills.filter(b => !b.due && needsDate(S, b.every) && !saveUp(b)).length;
    $('#bd-sum').innerHTML = `<p class="eyebrow">Due in the next ${S.freq === 'month' ? 'month' : S.freq}</p><p class="sum-big">${money(soonT)}</p>
      <p class="muted small">${noDue ? `${noDue} bill${noDue > 1 ? 's have' : ' has'} no due date yet, so ${noDue > 1 ? 'they\'re' : 'it\'s'} averaged per pay. ` : ''}Over a year your bills come to ${money(L.billsM * 12)}.</p>`;
    const key = b => everyPay(S, b.every) ? '0' : b.due ? nextOn(b.due, b.every, t) : '9';
    $('#bd-list').innerHTML = S.bills.length ? [...S.bills].sort((a, b) => key(a).localeCompare(key(b))).map(b => {
      const nx = b.due && needsDate(S, b.every) && nextOn(b.due, b.every, t);
      const sub = everyPay(S, b.every) ? `Comes out of every pay${b.every !== S.freq ? ` (${money(perPay(S, monthly(b.amount, b.every)))})` : ''}`
        : saveUp(b) ? `${b.due ? `Due ${fmtDate(nx)} · p` : 'P'}utting aside ${money(perPay(S, monthly(b.amount, b.every)))} a pay` : !b.due ? 'Add a due date so it comes out of the right pay' : `Next due ${fmtDate(nx)}`;
      return `<button class="row" type="button" data-act="bill" data-id="${b.id}"><span class="grow"><b>${esc(b.name)}</b><span class="muted small" style="margin:0">${sub}</span></span><span class="num">${money(b.amount)}<small>${UNIT[b.every]}</small></span>${CHEV}</button>`;
    }).join('')
      : '<p class="empty">No bills yet. Add rent or board, phone, insurance, rego and subscriptions.</p>';
  } else {
    const P = D.P, left = debtTotal(S);
    const when = !S.debts.length ? '' : P.debtFree === 0 ? ' · All paid off' : P.debtFree ? ` · Debt-free around ${monthYear(parseISO(addDays(today(), Math.round(P.debtFree * DPM))))}` : ' · Not cleared at this pace';
    $('#bd-sum').innerHTML = `<p class="eyebrow">Debt left</p><p class="sum-big">${money(left)}</p><p class="muted small">Minimums ${money(L.minsM)} a month${when}</p>`;
    const sorted = order(S.debts), first = sorted.find(d => debtNow(S, d) > 0.005);
    $('#bd-list').innerHTML = sorted.length ? sorted.map(d => {
      const nowB = debtNow(S, d);
      const badges = (d.od ? '<span class="badge od">Overdrawn</span> ' : '') + (d.focus && nowB > 0.005 ? '<span class="badge od">Focus</span> ' : '') + (nowB <= 0.005 ? '<span class="badge ok">Paid off</span>' : d === first && sorted.length > 1 ? '<span class="badge">Extra goes here first</span>' : '');
      const rate = freeNow(d) ? `Interest-free${d.until ? ' until ' + fmtDate(d.until) : ''} if paid on time` : `${d.rate}%`;
      const nx = d.due && needsDate(S, d.minEvery || 'month') && nowB > 0.005 ? ` · next ${fmtDate(nextOn(d.due, d.minEvery || 'month', today()))}` : '';
      return `<button class="row" type="button" data-act="debt" data-id="${d.id}"><span class="grow"><b>${esc(d.name)}</b><span class="muted small" style="margin:0">${rate} · ${money(d.minAmt ?? d.min)}${UNIT[d.minEvery || 'month']}${nx}</span>${badges ? `<span>${badges}</span>` : ''}</span><span class="num">${money(nowB)}</span>${CHEV}</button>`;
    }).join('') : '<p class="empty">No debts. If you owe anything, including an overdrawn bank account, add it so the plan can clear it.</p>';
  }
}
