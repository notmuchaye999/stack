/* The Stack tab: this pay as it stands (what's free, what's still due, what your plan suggests, what's done), your
   spending habit, and past pays. A new pay is stacked on the pay screen (payview.js). */
import { today, fmtDate, money, money0, sortMoves, latestStack, stackItems, payNow, habit, budgetStreak, nameOf, walletCard,
  cardBudget, potTotal, debtName, heldSum, PLAN_N } from '../core/index.js';
import { app, ui } from './store.js';
import { $, esc, CHEV, TICK, BM, tone } from './dom.js';
import { openSheet } from './sheet.js';
import { rowsOf } from './lists.js';
import { renderPayView } from './payview.js';
import { spentSheet } from './spent.js';

/* A pay's layers for the bars, with every repayment as one red so the bar stays readable. */
function stackLayers(s) {
  const d = Object.values(s.plan.debts).reduce((a, v) => a + v, 0);
  return [[s.cover || 0, 'var(--bad)'], [s.plan.bills, 'var(--c-bills)'], [potTotal(s), 'var(--c-buy)'], [cardBudget(s), BM.spend.color], [d, 'var(--c-debt)'], [s.plan.save, BM.save.color], [s.plan.invest, BM.invest.color], [s.spare || 0, 'var(--line)']].filter(x => x[0] > 0.5);
}
function barHTML(s) {
  const ls = stackLayers(s), total = Math.max(s.amount + (s.carry || 0) + heldSum(s.held), ls.reduce((a, x) => a + x[0], 0)) || 1;
  return ls.map(([v, c]) => `<span style="width:${(v / total * 100).toFixed(2)}%;background:${c}"></span>`).join('');
}
/** Where a pay goes, as a receipt: what comes out first, then your split, then the total. */
export function receiptHTML(s) {
  const S = app.S, mb = s.plan.minsBy, row = (c, n, v, cls = '') => `<div class="rc-row${cls}"><i class="chip" style="background:${c}"></i><span>${n}</span><span class="num">${money(v)}</span></div>`;
  const hv = heldSum(s.held), hk = Object.keys(s.held || {}).filter(k => s.held[k] > 0.005);
  const inc = hv > 0.5 ? `<p class="rc-h">Coming in</p>${row('var(--c-pay)', 'This pay', s.amount + (s.carry || 0))}${row('var(--c-buy)', `Already in ${hk.map(k => esc(nameOf(S, k))).join(' and ')}`, hv)}` : '';
  let first = ((s.cover || 0) > 0.5 ? row('var(--bad)', 'Last pay, moved past its plan', s.cover) : '') + (s.plan.bills > 0.5 ? row('var(--c-bills)', `Bills${(s.late || []).length ? ` · ${s.late.length} overdue` : ''}`, s.plan.bills) : ''), extra = '';
  Object.entries(s.plan.debts).forEach(([id, v]) => {
    if ((S.debts.find(x => x.id === id) || {}).urgent) { if (v > 0.5) first += row('var(--c-debt)', `${esc(debtName(S, id))} · urgent`, v); return; }
    const mn = mb ? Math.min(v, mb[id] || 0) : v, ex = v - mn;
    if (mn > 0.5) first += row('var(--c-debt)', esc(debtName(S, id)), mn);
    if (ex > 0.5) extra += row('var(--c-debt)', `Extra on ${esc(debtName(S, id))}`, ex);
  });
  const rows = list => list.filter(x => x[2] > 0.5).map(x => row(...x)).join('');
  const split = rows([[BM.spend.color, 'Spending', cardBudget(s)], ['var(--c-buy)', 'Savings', potTotal(s)]]) + extra
    + rows([[BM.save.color, 'Buffer', s.plan.save], [BM.invest.color, 'Invest', s.plan.invest], ['var(--line)', 'Not split', s.spare || 0]]);
  return `<div class="paybar">${barHTML(s)}</div>${inc}${first ? `<p class="rc-h">Comes out first</p>${first}` : ''}${split ? `<p class="rc-h">Your split</p>${split}` : ''}${row('transparent', 'Total', s.amount + (s.carry || 0) + hv, ' rc-tot')}`;
}
/** A bill as a tile in the bills colour: tick it once it's paid, overdue in red. */
export function billTile(x) {
  const sub = x.every ? (x.auto ? 'Direct debit · every pay' : 'Every pay') : `${x.late && !x.paid ? 'Overdue · ' : x.paid ? 'Paid · ' : 'Due '}${fmtDate(x.date)}${x.auto ? ' · direct debit' : ''}`;
  return `<div class="stile${x.paid ? ' done' : x.late ? ' late' : ''}${x.auto ? ' auto' : ''}" style="--c:var(--c-bills)"><button class="stick" type="button" data-act="bill-tick" data-id="${x.b.id}" data-d="${x.date}" aria-label="${esc(x.b.name)}: ${x.paid ? 'paid' : 'mark paid'}"><i>${x.paid ? TICK : ''}</i></button>`
    + `<button class="stile-b" type="button" data-act="bill" data-id="${x.b.id}"><span class="g"><b>${esc(x.b.name)}</b><small>${sub}</small></span><span class="num">${money(x.amount)}</span></button></div>`;
}
/* This pay on Stack: what's free, what's still due, what your plan suggests for the free money, and what you've done. */
function payNowHTML(stk, own) {
  const S = app.S, N = payNow(S, stk), sh = N.short > 0.005, v = sh ? N.short : N.free, pay = esc(nameOf(S, 'pay')), w = walletCard(S);
  const tile = (x, c, amt, sub, tick) => `<div class="stile" style="--c:${c}">${tick ? `<button class="stick" type="button" data-act="pn-tick" data-key="${x.key}" aria-label="${esc(x.label)}: mark done"><i></i></button>` : '<span class="stick"><i></i></span>'}`
    + `<button class="stile-b" type="button" data-act="pn-open" data-key="${x.key}"><span class="g"><b>${esc(x.label)}</b>${sub ? `<small>${sub}</small>` : ''}</span><span class="num">${money(amt)}</span></button></div>`;
  const held = x => x.held.map(([k, a]) => `${money(a)} in ${esc(nameOf(S, k))}`).join(' + ');
  const dues = N.dues.map(x => x.kind === 'bill' ? billTile(x.x) : tile(x, 'var(--c-debt)', x.fromPay > 0.005 ? x.fromPay : x.amt,
    [x.late ? 'Overdue' : '', x.held.length ? (x.fromPay > 0.005 ? '+ ' + held(x) : 'In ' + x.held.map(([k]) => esc(nameOf(S, k))).join(' and ')) : '', x.onCard > 0.005 ? (x.amt - x.onCard > 0.005 ? `+ ${money(x.onCard)} on ${esc(w.name)}` : `Money's on ${esc(w.name)}`) : '', x.via ? `${esc(w.name)} pays it` : '', esc(x.sub || '')].filter(Boolean).join(' · '), true)).join('');
  const sugs = N.sugs.map(x => tile(x, tone(x.c), x.amt, esc(x.sub), !!x.to)).join('');
  const done = N.done.map((x, i) => {
    const inner = `<span class="grow"><b>${esc(x.name)}</b>${x.sub ? `<span class="muted small" style="margin:0">${esc(x.sub)}</span>` : ''}</span><span class="num">${money(x.amt)}</span>`;
    return x.bill ? `<div class="row pn-d"><button class="pn-tk" type="button" data-act="bill-tick" data-id="${x.bill.b.id}" data-d="${x.bill.date}" aria-label="${esc(x.name)}: untick" style="--c:${tone(x.c)}"><i>${TICK}</i></button>${inner}</div>`
      : `<button class="row pn-d" type="button" data-act="pn-done" data-i="${i}"><i style="--c:${tone(x.c)}"></i>${inner}${CHEV}</button>`;
  }).join('');
  return `<div class="card"><div class="card-head"><p class="card-h">Paid ${fmtDate(stk.date)}</p><span class="num">${money(stk.amount)}</span></div>
      <p class="left-big${sh ? ' neg' : ''}" style="margin:2px 0 0">${money(v)}<small>${sh ? 'short' : 'free'}</small></p>
      <p class="muted small" style="margin-bottom:0">${sh ? `${pay} can't cover what's still due` : 'after what\'s still due'} · ${pay} ${money(N.cash)}</p>
      ${own ? '' : `<p class="muted small" style="margin:6px 0 0">Just this pay. <button class="link sm mine-l" type="button" data-act="make-mine" data-stack="${stk.id}">Make it my plan</button></p>`}</div>
    ${dues ? `<div class="sec-h"><h3>Still due</h3><span>${money(N.due)} from ${pay}</span></div><div class="stack down">${dues}</div>` : ''}
    ${sugs ? `<div class="sec-h"><h3>Suggested</h3><span>${esc(PLAN_N[stk.pk] || 'Custom')}</span></div><div class="stack down">${sugs}</div>` : ''}
    ${done ? `<div class="sec-h"><h3>Done</h3></div><div class="grouped">${done}</div>` : ''}`;
}
export function renderStack() {
  const S = app.S, stk = latestStack(S), list = stk && !ui.stackNew;
  $('#stk-list').hidden = !list; $('#stk-new').hidden = list;
  if (list) {
    const past = S.moves.filter(m => m.type === 'pay' && m.stack !== stk.id).length, hb = habit(S), st = budgetStreak(S), own = !stk.one;
    // Each pay against a budget line, scaled so going over shows how far over.
    const rs = hb ? hb.ps.map(o => o.I.budget > 0 ? o.I.spent / o.I.budget : o.I.spent > 0 ? 1 : 0) : [], top = Math.max(1.25, ...rs);
    const hbars = hb ? hb.ps.map((o, k) => { const r = rs[k], ov = o.I.left < -0.5; return `<span class="hb${ov ? ' over' : ''}" title="${fmtDate(o.x.date)}: ${money(o.I.spent)} of ${money(o.I.budget)}"><i style="height:${(r / top * 100).toFixed(1)}%${ov ? `;--b:${(r > 1 ? 100 / r : 0).toFixed(1)}%` : ''}"></i></span>`; }).join('') + `<b class="hb-line" style="bottom:${(100 / top).toFixed(1)}%" aria-hidden="true"></b>` : '';
    $('#stk-list').innerHTML = `<header class="tab-h row-h"><div><h1 class="large">This pay</h1></div><button class="link new-pay" type="button" data-act="stack-new">New pay</button></header>
      ${payNowHTML(stk, own)}
      ${hb ? `<div class="sec-h"><h3>Spending habit</h3>${st ? `<span>${st} on budget in a row</span>` : ''}</div><div class="card">
        <p class="habit-l">Last ${hb.n === 1 ? 'pay' : hb.n + ' pays'}: ${hb.n > 1 ? 'average ' : ''}<b>${money0(hb.spent)}</b> spent · ${money0(hb.budget)} budget</p><div class="hbars">${hbars}</div></div>` : ''}
      ${past ? `<div class="grouped"><button class="row" type="button" data-act="past-pays"><span class="grow"><b>Past pays</b></span><span class="num">${past}</span>${CHEV}</button></div>` : ''}`;
  } else {
    $('#stk-cancel').hidden = !stk;
    renderPayView($('#pv-stack'));
  }
}
/* One pay's spends, where they belong: with the pay. */
export function paySpendsSheet(stkId) {
  const S = app.S, stk = S.stacks.find(s => s.id === stkId); if (!stk) return;
  const I = stackItems(S, stk), cur = stk === latestStack(S);
  const ms = sortMoves(S.moves.filter(m => m.type === 'spend' && !m.pair && I.inP(m)));
  openSheet(cur ? 'Spending this pay' : `Spending, pay on ${fmtDate(stk.date)}`, `<div class="form"><div><p class="sum-big" style="margin:0">${money(I.spent)}<small> spent</small></p></div>
    <button class="btn primary big" type="button" id="ps-add">Spent</button>
    <div class="grouped">${rowsOf(ms, 'Nothing spent yet.')}</div></div>`);
  $('#ps-add').onclick = () => spentSheet({ title: 'Spent', date: cur ? today() : stk.date, after: () => paySpendsSheet(stkId) });
}
export function pastPaysSheet() {
  const S = app.S, cur = latestStack(S), yr = today().slice(0, 4), ps = sortMoves(S.moves.filter(m => m.type === 'pay' && !(cur && m.stack === cur.id)));
  openSheet('Past pays', `<div class="grouped">${ps.length ? ps.slice(0, 60).map(p => `<button class="row" type="button" data-act="pay" data-id="${p.id}"><span class="grow"><b>${fmtDate(p.date)}${p.date.slice(0, 4) !== yr ? ' ' + p.date.slice(0, 4) : ''}</b>
      <span class="muted small" style="margin:0">${p.stack && S.stacks.some(s => s.id === p.stack) ? 'Stacked' : 'Not stacked'}</span></span><span class="num">${money(p.amount)}</span>${CHEV}</button>`).join('') : '<p class="empty">No past pays yet.</p>'}</div>`);
}
