/* Stack: stack a new pay, or see this pay's plan next to what you actually did. */
import { FREQ, clamp, today, money, fmtDate, sumPct, debtName, makeStack, latestStack, stackItems } from '../core/index.js';
import { app, ui } from './store.js';
import { $, esc, CHEV, TICK, BM } from './dom.js';
import { showStr } from './numpad.js';
import { sortMoves } from './lists.js';

/** The pay amount being typed on the Stack screen. */
export const payPad = { str: '', dec: 2, max: 1e7, onChange: s => { $('#pay-amt').textContent = showStr(s); renderPayPreview(); } };

/* "Optus 5 Nov, Board, rego (saving up)". Stacks made before due dates existed fall back to a plain line. */
function billNames(s) {
  const l = s.plan.billList;
  if (!l || !l.length) return 'Stays in the account for bills';
  return l.filter(b => b.v > 0.5).map(b => b.every ? b.name : b.saving ? `${b.name} (saving up)` : b.avg ? `${b.name} (no due date)` : `${b.name} ${fmtDate(b.due)}`).join(', ');
}
function stackParts(s) {
  const S = app.S;
  const parts = [{ n: 'Bills', v: s.plan.bills, c: 'var(--c-bills)', s: esc(billNames(s)) },
    { n: 'Planned buys', v: s.plan.buys || 0, c: 'var(--c-buy)', s: esc((s.plan.buyNames || []).join(', ')) || 'Put aside' },
    { n: 'Card', v: s.plan.spend, c: BM.spend.color, s: 'Top up your spending card' }];
  for (const [id, v] of Object.entries(s.plan.debts)) { const d = S.debts.find(x => x.id === id); parts.push({ n: `Pay ${esc(debtName(S, id))}`, v, c: BM.debt.color, s: d ? (d.od ? 'Overdrawn account' : `${d.rate}% interest`) : 'Debt' }); }
  parts.push({ n: 'Savings', v: s.plan.save, c: BM.save.color, s: 'Into your emergency fund' }, { n: 'Invest', v: s.plan.invest, c: BM.invest.color, s: 'Into investments' });
  if (s.spare > 0.5) parts.push({ n: 'Unassigned', v: s.spare, c: 'var(--line)', s: 'Your split is under 100%' });
  return parts.filter(p => p.v > 0.5);
}
export function barHTML(s) {
  const parts = stackParts(s), total = Math.max(s.amount, parts.reduce((a, x) => a + x.v, 0)) || 1;
  return parts.map(x => `<span style="width:${(x.v / total * 100).toFixed(2)}%;background:${x.c}"></span>`).join('');
}
function partsHTML(s) {
  const rows = stackParts(s).map(x => `<div class="prow"><i class="chip" style="background:${x.c}"></i><span><b>${x.n}</b><span class="muted">${x.s}</span></span><span class="num">${money(x.v)}</span></div>`).join('');
  return `<div class="paybar">${barHTML(s)}</div>${rows}${s.short > 0.5 ? `<p class="pill bad">Short by ${money(s.short)}. This pay doesn't cover bills and minimums.</p>` : ''}`;
}

/* One pay's plan next to what actually happened. Tap a line to record what you did. Used for the current pay and past pays. */
export function pvaHTML(stk, past) {
  const I = stackItems(app.S, stk), plan = stk.plan.spend, left = plan - I.spent, over = left < -0.5;
  const row = (key, cls, tick, name, sub, p, a, aCls = '') => `<button class="pva ${cls}" type="button" data-act="pva" data-stack="${stk.id}" data-key="${key}" data-past="${past ? 1 : ''}">
    ${tick}<span><b>${name}</b><span class="muted">${sub}</span></span><span class="num">${p}</span><span class="num act ${aCls}">${a}</span></button>`;
  const info = (color, name, sub, p, a) => `<div class="pva info"><span class="tick dot"><i class="chip" style="background:${color}"></i></span><span><b>${name}</b><span class="muted">${sub}</span></span><span class="num">${p}</span><span class="num act">${a}</span></div>`;
  let h = '<div class="pva head"><span></span><span></span><span>Plan</span><span>Did</span></div>';
  h += row('card', over ? 'over' : '', `<span class="tick dot"><i class="chip" style="background:var(--c-spend)"></i></span>`, 'Card',
    over ? `${money(-left)} over budget` : I.spent > 0.5 ? `${money(left)} left` : past ? 'Nothing recorded' : 'Tap to add a top-up', money(plan), money(I.spent), over ? 'neg' : '');
  I.todos.forEach(i => {
    const sub = i.state === 'done' ? (i.done > i.plan + 0.5 ? `${money(i.done - i.plan)} more than planned` : 'Done') : i.state === 'part' ? `${money(i.plan - i.done)} to go` : past ? 'Not recorded' : 'Tap once you\'ve moved it';
    h += row(i.key, i.state, `<span class="tick" style="--p:${Math.round(clamp(i.done / i.plan) * 100)}">${i.state === 'done' ? TICK : ''}</span>`, esc(i.label), sub, money(i.plan), i.done > 0.5 ? money(i.done) : '–');
  });
  if ((stk.plan.buys || 0) > 0.5) h += info('var(--c-buy)', 'Planned buys', esc((stk.plan.buyNames || []).join(', ')), money(stk.plan.buys), I.buysSpent > 0.5 ? money(I.buysSpent) : '–');
  if (stk.plan.bills > 0.5) h += info('var(--c-bills)', 'Bills', esc(billNames(stk)), money(stk.plan.bills), '');
  if (I.todos.some(i => i.state !== 'done')) h += `<button class="btn wide" type="button" data-act="did-all" data-stack="${stk.id}" data-past="${past ? 1 : ''}">Did all the transfers as planned</button>`;
  else if (I.todos.length) h += '<p class="pill good">All transfers done. Every dollar of this pay has a job.</p>';
  return h;
}

export function renderStack() {
  const S = app.S, stk = latestStack(S), list = stk && !ui.stackNew;
  $('#stk-list').hidden = !list; $('#stk-new').hidden = list;
  if (list) {
    const I = stackItems(S, stk);
    $('#stk-list').innerHTML = `<h1 class="large">This pay</h1>
      <div class="card"><div class="card-head"><p class="card-h">Paid ${fmtDate(stk.date)}</p><span class="num">${money(stk.amount)}</span></div><div class="paybar">${barHTML(stk)}</div>
        <p class="eyebrow" style="margin-top:14px">Plan vs what you did${I.todos.length ? ` · ${I.doneN} of ${I.todos.length} transfers done` : ''}</p>
        ${pvaHTML(stk, false)}
        <p class="muted small" style="margin-top:10px">Tap a line to enter what you actually did. Importing a statement fills these in too.</p></div>
      <div class="duo"><button class="btn" type="button" data-act="split" data-stack="${stk.id}">See the split</button><button class="btn primary" type="button" data-act="stack-new">Stack a new pay</button></div>`;
  }
  renderPayPreview(); renderPayHist();
}
export function renderPayPreview() {
  const amt = parseFloat(payPad.str) || 0, btn = $('#pay-save');
  btn.disabled = amt <= 0; btn.textContent = amt > 0 ? `Stack ${money(amt)}` : 'Stack it';
  if (amt <= 0) { $('#pay-preview').innerHTML = '<p class="muted" style="margin:0">Tap in an amount to see where every dollar goes.</p>'; $('#pay-bar').innerHTML = ''; return; }
  const s = makeStack(app.S, amt, $('#pay-date').value || today());
  $('#pay-preview').innerHTML = `<p class="card-h" style="margin-bottom:8px">Where it goes</p>${partsHTML(s)}${sumPct(app.S) === 0 ? '<p class="muted small">Using a starter split. Set your own in Plan.</p>' : ''}`;
  $('#pay-bar').innerHTML = barHTML(s);
}
function renderPayHist() {
  const S = app.S, ps = sortMoves(S.moves.filter(m => m.type === 'pay'));
  $('#pay-hist').innerHTML = ps.length ? ps.slice(0, 30).map(p => `<button class="row" type="button" data-act="pay" data-id="${p.id}"><span class="grow"><b>${fmtDate(p.date)}</b>
      <span class="muted small" style="margin:0">${p.stack && S.stacks.some(s => s.id === p.stack) ? 'Stacked' : 'Not stacked yet'}${p.src === 'import' ? ' · imported' : ''}</span></span><span class="num">${money(p.amount)}</span>${CHEV}</button>`).join('')
    : '<p class="empty">No pays yet.</p>';
}
/** Resets the "Stack your pay" screen. */
export function fillPay() {
  const S = app.S;
  $('#pay-date').value = today();
  payPad.str = ''; $('#pay-amt').textContent = '0';
  const u = $('#pay-usual'); u.hidden = !(S.pay > 0); u.textContent = `Usual pay ${money(S.pay)}`;
  $('#pay-note').textContent = S.pay > 0 ? `${FREQ[S.freq].label} pay. One ${S.freq === 'week' ? 'week' : S.freq}'s bills and minimum repayments come off the top first.`
    : 'Your first pay becomes your usual pay. Change it, or how often you get paid, in Plan.';
}
