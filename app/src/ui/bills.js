/* The Bills tab: what this pay holds back for bills, what's due before the next pay as tiles to tick off, then the rest. */
import { today, addDays, daysBetween, money, money0, fmtDate, periodDays, perPay, monthly, billsMonthly, latestStack, billsFor,
  lateBills, needsDate, saveUp, billsDueNow, billNow, UNIT } from '../core/index.js';
import { app } from './store.js';
import { $, esc, CHEV, TICK } from './dom.js';
import { billTile } from './stack.js';

export function renderBills() {
  const S = app.S, t = today(), lt = latestStack(S), sum = $('#bd-sum'), lst = $('#bd-list'), add = $('#bd-add');
  add.innerHTML = '<button class="btn wide" type="button" data-act="add-bill" style="margin-top:0">Add a bill</button>';
  lst.hidden = !S.bills.length;
  if (!S.bills.length) { $('#bd-due').innerHTML = ''; sum.innerHTML = '<p class="card-h">Bills</p><p class="hint">Anything that comes out on a schedule: rent, phone, insurance, rego. Each pay holds back what falls due before the next one, and you tick each one off once it\'s paid.</p>'; return; }
  // The pay you're in shows what it actually held for bills, so it matches the Stack screen.
  const cur = lt && daysBetween(lt.date, t) < periodDays(S);
  const v = cur ? lt.plan.bills : Math.ceil(billsFor(S, t, addDays(t, periodDays(S))).concat(lateBills(S, t)).reduce((s, b) => s + b.v, 0) - 0.001);
  const noDue = S.bills.filter(b => !b.due && needsDate(S, b.every) && !saveUp(b)).length;
  const due = billsDueNow(S).filter(x => !x.auto && !x.paid), lateN = due.filter(x => x.late).length;
  sum.innerHTML = `<p class="eyebrow">${cur ? 'Bills this pay' : 'Bills next pay'}</p><p class="sum-big">${money(v)}</p><p class="muted small">${money0(billsMonthly(S))} a month${noDue ? ` · ${noDue} without a due date` : ''}</p>${due.length ? `<p class="small${lateN ? ' neg' : ''}" style="margin-top:6px">${due.length} to pay before ${fmtDate(addDays(lt.date, periodDays(S)))}${lateN ? ` · ${lateN} overdue` : ''}</p>` : ''}`;
  // Due this pay, as tiles in the bills colour: tick it once it's paid, overdue in red.
  // The list below is only what's not due this pay, so nothing shows twice.
  const dueT = billsDueNow(S).filter(x => !x.auto || x.paid), dueIds = new Set(dueT.map(x => x.b.id)), later = S.bills.filter(b => !dueIds.has(b.id));
  $('#bd-due').innerHTML = dueT.length ? `<div class="sec-h"><h3>Due this pay</h3><span>${dueT.filter(x => x.paid).length} of ${dueT.length} paid</span></div><div class="bd-due">${dueT.map(billTile).join('')}</div>${later.length ? '<div class="sec-h"><h3>Later</h3></div>' : ''}` : '';
  lst.hidden = !later.length;
  const os = new Map(S.bills.map(b => [b.id, billNow(S, b)]));
  const key = b => { const o = os.get(b.id); return o && o.every ? '0' : o ? (o.paid ? o.next : o.date) : '9'; };
  lst.innerHTML = later.sort((a, b) => key(a).localeCompare(key(b))).map(b => {
    const o = os.get(b.id), pp = saveUp(b) ? ` · ${money0(perPay(S, monthly(b.amount, b.every)))} a pay` : '', dd = b.auto ? ' · direct debit' : '';
    const sub = !o ? (saveUp(b) ? `${money0(perPay(S, monthly(b.amount, b.every)))} a pay` : 'No due date')
      : o.every ? `${o.paid && !o.auto ? 'Paid this pay' : 'Every pay'}${dd}`
      : o.late ? `<span class="neg">Overdue · ${fmtDate(o.date)}</span>${dd}`
      : o.paid ? `Paid · next ${fmtDate(o.next)}${pp}${dd}` : `Due ${fmtDate(o.date)}${pp}${dd}`;
    const tick = o ? `<button class="btick${o.paid ? ' on' : ''}${o.late ? ' late' : ''}${o.auto ? ' auto' : ''}" type="button" data-act="bill-tick" data-id="${b.id}" data-d="${o.date}" aria-label="${esc(b.name)}: ${o.paid ? 'paid' : 'not paid'}"><i>${o.paid ? TICK : ''}</i></button>` : '<span class="btick none" aria-hidden="true"><i></i></span>';
    return `<div class="brow">${tick}<button class="row" type="button" data-act="bill" data-id="${b.id}"><span class="grow"><b>${esc(b.name)}</b><span class="muted small" style="margin:0">${sub}</span></span><span class="num">${money(b.amount)}<small>${UNIT[b.every]}</small></span>${CHEV}</button></div>`;
  }).join('');
}
