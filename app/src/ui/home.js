/* Home: the countdown, this pay, your stage and your balances. */
import { DPM, IMPACT_TYPES, clamp, today, addDays, parseISO, money, kmoney, fmtDate, monthYear, spanTxt,
  perPay, investedNow, savedNow, debtTotal, netWorth, impactOf, latestStack, stackItems } from '../core/index.js';
import { app, ui } from './store.js';
import { $, esc, CHEV, TY, impHTML, toneColor } from './dom.js';
import { sortMoves } from './lists.js';

function paceLine(P, PL) {
  const S = app.S, n = P.C.n, basis = n === 1 ? 'Based on the 1 pay you\'ve entered, as if every pay goes like it.' : `Based on your last ${n} pays, as if every pay goes like them.`;
  if (P.work < 0) return `<button class="pace warn" type="button" data-go="spent">${basis} You're <b>${money(-perPay(S, P.work))} short each pay</b>: ${money(perPay(S, P.incM))} in, against ${money(perPay(S, P.L.billsM))} bills, ${money(perPay(S, P.L.minsM))} minimums and ${money(perPay(S, P.spendM))} spending. ›</button>`;
  if (P.fi !== null && PL.fi !== null) {
    const dd = (P.fi - PL.fi) * DPM;
    if (Math.abs(dd) < 7) return `<p class="pace good">${basis} Right on plan.</p>`;
    return dd > 0 ? `<button class="pace warn" type="button" data-go="spent">${basis} ${spanTxt(dd)} behind your plan. Spending is ${money(perPay(S, P.spendM))} a pay against a ${money(perPay(S, PL.spendM))} card budget. ›</button>`
      : `<p class="pace good">${basis} ${spanTxt(-dd)} ahead of your plan.</p>`;
  }
  return `<p class="pace">${basis}</p>`;
}

export function renderHome(D) {
  const S = app.S, { P, PL, st, T } = D;
  $('#h-sample').hidden = !S.sample;
  let c;
  if (P.none) {
    c = `<p class="eyebrow">Financial independence</p><p class="count-empty">Stack your first pay to start the countdown.</p>
      <p class="muted small">It works from the pays you enter. One pay, then two, and it gets more accurate with every pay after that.</p>
      <button class="btn wide" type="button" data-go="stack">Stack a pay</button>`;
  } else if (!(P.fiT > 0)) {
    c = `<p class="eyebrow">Financial independence</p><p class="count-empty">Add your bills and a spending share to work out your FI number.</p>`;
  } else {
    const inv = investedNow(S);
    let big, sub;
    if (P.fi === null) { big = 'Never'; sub = P.work < 0 ? "More is going out than coming in." : 'Not within 50 years at this rate.'; }
    else if (P.fi === 0) { big = 'Done'; sub = 'Your investments cover your spending.'; }
    else {
      const days = Math.round(P.fi * DPM), mt = Math.round(P.fi);
      big = `${Math.floor(mt / 12)}<small>y</small> ${mt % 12}<small>m</small>`;
      sub = `<span id="h-days" data-to="${days}">${days.toLocaleString('en-AU')}</span> days · around ${monthYear(parseISO(addDays(today(), days)))}`;
    }
    const lm = sortMoves(S.moves.filter(m => IMPACT_TYPES.includes(m.type)))[0];
    const latest = lm ? `<div class="latest"><span>Latest: ${esc(lm.note || TY[lm.type].name)} ${money(lm.amount)}</span>${impHTML(impactOf(S, lm, P.fi))}</div>` : '';
    c = `<p class="eyebrow">Financially independent in</p><p class="count-big">${big}</p><p class="count-sub">${sub}</p>
      <div class="bar"><span style="width:${(clamp(inv / P.fiT) * 100).toFixed(1)}%;background:var(--c-invest)"></span></div>
      <div class="bar-l"><span>${money(inv)} invested</span><span>FI number ${kmoney(P.fiT)}</span></div>${paceLine(P, PL)}${latest}`;
  }
  $('#h-count').innerHTML = c;
  animateDays();
  $('#h-tips').innerHTML = T.length ? `<button class="tips-row" type="button" data-act="tips"><span class="dot"></span>${T.length} suggestion${T.length > 1 ? 's' : ''}${CHEV}</button>` : '';

  const stk = latestStack(S);
  if (!stk) $('#h-pay').innerHTML = `<p class="card-h">This pay</p><p class="muted small">Stack a pay to get a card budget and a to-do list for where the rest goes.</p>`;
  else {
    const I = stackItems(S, stk), plan = stk.plan.spend, left = plan - I.spent;
    $('#h-pay').innerHTML = `<div class="card-head"><p class="card-h">This pay</p><span class="muted small" style="margin:0">${fmtDate(stk.date)} · ${money(stk.amount)}</span></div>
      <div class="sr-top"><span><i class="chip" style="background:var(--c-spend)"></i>Card</span><span class="num ${left < -0.5 ? 'neg' : ''}">${left < -0.5 ? money(-left) + ' over' : money(left) + ' left'}</span></div>
      <div class="bar thin"><span style="width:${(plan > 0 ? clamp(I.spent / plan) : 1) * 100}%;background:${left < -0.5 ? 'var(--bad)' : 'var(--c-spend)'}"></span></div>
      <p class="muted small">${money(I.spent)} of ${money(plan)} topped up</p>
      ${I.todos.length ? `<button class="row-link" type="button" data-go="stack"><span>${I.complete ? 'Everything stacked' : `${I.doneN} of ${I.todos.length} transfers done`}</span>${CHEV}</button>` : ''}`;
  }
  const steps = [1, 2, 3, 4, 5].map(n => `<span class="${n < st.n ? 'done' : n === st.n ? 'now' : ''}"></span>`).join('');
  $('#h-stage').innerHTML = `<div class="steps">${steps}</div><p class="eyebrow">Stage ${st.n} of 5</p><p class="stage-name">${st.name}</p>
    <div class="bar thin"><span style="width:${(clamp(st.prog) * 100).toFixed(1)}%;background:${toneColor(st.tone)}"></span></div><p class="muted small">${st.detail}</p>
    <button class="row-link" type="button" data-act="stages"><span>What the stages mean</span>${CHEV}</button>`;
  const nw = netWorth(S);
  $('#h-bal').innerHTML = [
    { c: nw < 0 ? 'var(--bad)' : 'var(--c-invest)', n: 'Net worth', v: nw, go: 'saved', cls: nw < 0 ? 'neg' : '' },
    { c: 'var(--c-save)', n: 'Savings', v: savedNow(S), go: 'saved' },
    { c: 'var(--c-invest)', n: 'Invested', v: investedNow(S), go: 'saved' },
    { c: 'var(--c-debt)', n: 'Debt left', v: debtTotal(S), go: 'bills', seg: 'debts' },
  ].map(b => `<button class="row" type="button" data-go="${b.go}"${b.seg ? ` data-seg-go="${b.seg}"` : ''}><i class="chip" style="background:${b.c}"></i><span class="grow"><b>${b.n}</b></span><span class="num ${b.cls || ''}">${money(b.v)}</span>${CHEV}</button>`).join('');
}

/** Counts the days up the first time the countdown shows. */
function animateDays() {
  const el = $('#h-days');
  if (!el || ui.animated) return;
  ui.animated = true;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const to = +el.dataset.to, t0 = performance.now();
  const step = n => { const k = Math.min(1, (n - t0) / 1000), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(to * e).toLocaleString('en-AU'); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
