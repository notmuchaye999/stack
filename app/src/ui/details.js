/* Detail sheets: one entry (relabel or delete), one pay (plan vs actual, past pays too), the split after stacking,
   the 5 stages, and the suggestions list. */
import { BK, money, fmtDate, debtName, order, sumPct, effPct, impactOf, makeStack, latestStack, similarTo, relabel, project, stageInfo } from '../core/index.js';
import { app, ui, save } from './store.js';
import { $, esc, TY, TYK, BM, openSheet, closeSheet, twoTap, toast, impCls, impSentence } from './dom.js';
import { barHTML, pvaHTML } from './stack.js';
import { derive, reason } from './advice.js';
import { renderAll, commit } from './render.js';
import { fillSplit } from './plan.js';
import { balanceSheet } from './forms.js';
import { balance, useSuggest } from './actions.js';
import { DISCLAIMER } from '../core/index.js';

export function moveDetail(id) {
  const S = app.S, m = S.moves.find(x => x.id === id); if (!m) return;
  const d = impactOf(S, m, app.base), ref = m.type === 'debt' && m.ref ? ' · ' + esc(debtName(S, m.ref)) : '', sim = similarTo(S, m).length;
  const pick = TYK.filter(k => k !== 'debt').map(k => `<button type="button" data-t="${k}" aria-pressed="${m.type === k}">${TY[k].name}</button>`).join('')
    + (S.debts.length ? order(S.debts).map(x => `<button type="button" data-t="debt" data-ref="${x.id}" aria-pressed="${m.type === 'debt' && m.ref === x.id}">Debt: ${esc(x.name)}</button>`).join('')
      : `<button type="button" data-t="debt" aria-pressed="${m.type === 'debt'}">Debt</button>`);
  openSheet(esc(m.note || TY[m.type].name), `<div class="form"><p class="sum-big" style="margin:0">${money(m.amount)}</p>
    <p class="muted" style="margin:0">${TY[m.type].name}${ref} · ${fmtDate(m.date)}${m.src === 'import' ? ' · imported' : ''}</p>
    ${d !== null ? `<p class="mv-imp ${impCls(d)}">${impSentence(d, true)}</p>` : ''}
    <div><p class="eyebrow" style="margin-bottom:8px">Label</p><div class="pick" id="mv-pick" style="padding:0">${pick}</div>
      ${sim ? `<p class="muted small">Changing it also changes ${sim} similar ${sim === 1 ? 'entry' : 'entries'}, and future imports.</p>` : ''}</div>
    <button class="btn wide danger" id="f-del" type="button">Delete</button></div>`);
  $('#mv-pick').onclick = e => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    const n = relabel(S, m, b.dataset.t, b.dataset.ref);
    save(); renderAll(); moveDetail(id); toast(n > 1 ? `Relabelled ${n} entries` : 'Relabelled');
  };
  twoTap($('#f-del'), 'Tap again to delete', () => { S.moves = S.moves.filter(x => x.id !== id); commit('Deleted'); });
}

export function payDetail(id) {
  const S = app.S, m = S.moves.find(x => x.id === id); if (!m) return;
  const stk = m.stack && S.stacks.find(s => s.id === m.stack);
  if (!stk) {
    openSheet(`Pay on ${fmtDate(m.date)}`, `<div class="form"><p class="sum-big" style="margin:0">${money(m.amount)}</p>
      <p class="muted" style="margin:0">Not stacked yet. Stack it to get a card budget and a to-do list for this pay.</p>
      <button class="btn primary big" id="f-stack" type="button">Stack this pay</button><button class="btn wide danger" id="f-del" type="button" style="margin-top:0">Delete pay</button></div>`);
    $('#f-stack').onclick = () => { const s = makeStack(S, m.amount, m.date); S.stacks.push(s); m.stack = s.id; ui.stackNew = false; save(); closeSheet(); renderAll(); window.scrollTo(0, 0); toast('Stacked. Now make it real'); };
  } else {
    openSheet(`Pay on ${fmtDate(m.date)}`, `<div class="form"><div><p class="sum-big" style="margin:0 0 8px">${money(m.amount)}</p><div class="paybar">${barHTML(stk)}</div></div>
      <div>${pvaHTML(stk, stk !== latestStack(S))}</div>
      <p class="muted small" style="margin:0">Tap a line to enter what you actually did with this pay.</p>
      <button class="btn wide danger" id="f-del" type="button" style="margin-top:0">Delete pay</button></div>`);
  }
  twoTap($('#f-del'), 'Tap again to delete', () => { S.moves = S.moves.filter(x => x.id !== id); if (stk) S.stacks = S.stacks.filter(s => s.id !== stk.id); commit('Pay deleted'); });
}

/* Shown straight after you stack a pay: this pay's money under your split next to the recommended one. */
export function splitSheet(stkId) {
  const S = app.S, stk = S.stacks.find(s => s.id === stkId); if (!stk) return;
  const D = derive(), sg = D.sg, st = D.st, mineP = Object.assign({}, effPct(S)), starter = sumPct(S) === 0;
  const tot = s => ({ spend: s.plan.spend, debt: Object.values(s.plan.debts).reduce((a, b) => a + b, 0), save: s.plan.save, invest: s.plan.invest });
  const a = tot(makeStack(Object.assign({}, S, { pct: mineP }), stk.amount, stk.date)), b = tot(makeStack(Object.assign({}, S, { pct: sg }), stk.amount, stk.date));
  const same = BK.every(k => Math.abs(sg[k] - mineP[k]) < 1);
  const fixed = [stk.plan.bills > 0.5 && `${money(stk.plan.bills)} bills`, (stk.plan.buys || 0) > 0.5 && `${money(stk.plan.buys)} for planned buys`].filter(Boolean).join(' and ');
  const rows = BK.map(k => `<div class="pva info"><span class="tick dot"><i class="chip" style="background:${BM[k].color}"></i></span><span><b>${BM[k].name}</b><span class="muted">${same ? sg[k] + '%' : `${mineP[k]}% → ${sg[k]}%`}</span></span><span class="num">${money(a[k])}</span><span class="num act">${money(b[k])}</span></div>`).join('');
  openSheet('Split for this pay', `<div class="form">
    <p style="margin:0">Stage ${st.n}: ${st.name}. ${reason(st)}</p>
    <div><div class="pva head"><span></span><span></span><span>${starter ? 'Starter' : 'Yours'}</span><span>Suggested</span></div>${rows}</div>
    ${fixed ? `<p class="muted small" style="margin:0">Minimum repayments are included under Extra debt. ${fixed} come off first.</p>` : ''}
    ${same ? '<p class="pill good" style="margin:0">Your split already matches the recommendation.</p><button class="btn primary big" type="button" data-act="close">Looks good</button>'
      : `<button class="btn primary big" type="button" id="sp-use">Use the recommended split</button><button class="btn wide" type="button" data-act="close" style="margin-top:0">Keep ${starter ? 'the starter split' : 'my split'}</button>`}</div>`);
  const use = $('#sp-use');
  if (use) use.onclick = () => {
    S.pct = Object.assign({}, sg);
    const ns = makeStack(S, stk.amount, stk.date); Object.assign(stk, { plan: ns.plan, short: ns.short, spare: ns.spare });
    fillSplit(); commit('Recommended split saved and applied to this pay');
  };
}

export function stagesSheet() {
  const S = app.S, P = project(S, { fast: true }), st = stageInfo(S, P);
  const list = [
    ['Get back to $0', 'Clear any overdrawn bank account first. Overdrawn accounts charge fees and leave you starting behind zero.'],
    ['Starter buffer', "Save $1,000 so a surprise bill doesn't turn into new debt."],
    ['Clear high-interest debt', "Pay off anything charging 7% or more, highest rate first. That's a guaranteed return no investment can promise."],
    ['Full emergency fund', `Build savings up to ${S.emMonths} months of bills and spending (${money(P.emT)}).`],
    ['Stack investments', 'Everything spare goes to investing until you hit your FI number.'],
  ];
  const rows = list.map(([t, b], i) => {
    const n = i + 1, none = n === 1 && !S.debts.some(d => d.od);
    const tag = none && st.n > 1 ? '<span class="badge">None added</span>' : n < st.n ? '<span class="badge ok">Done</span>' : n === st.n ? '<span class="badge">You are here</span>' : '';
    return `<div class="tip"><p class="tip-t">${n}. ${t} ${tag}</p><p class="muted">${b}${n === st.n ? ` <b style="color:var(--ink)">${st.detail}.</b>` : ''}</p></div>`;
  }).join('');
  const odNote = st.n === 1 ? '' : '<p class="pill warn">Bank account in the negative? Add it under Bills, Debts and switch on Overdrawn bank account. It becomes stage 1.</p>';
  openSheet('The 5 stages', `<p class="muted" style="margin:0 0 12px">The order Stack works through to get you from where you are to financially independent. The suggested split changes with each stage, and stages already sorted count as done.</p>${rows}${odNote}`);
}

export function tipsSheet() {
  const D = derive();
  openSheet('Suggestions', `${D.T.map((t, i) => `<div class="tip"><p class="tip-t">${t.title}</p><p class="muted">${t.body}</p>${t.act ? `<button class="btn wide" type="button" data-tip="${i}">${t.label}</button>` : ''}</div>`).join('')}
    <p class="foot" style="margin-top:14px">${DISCLAIMER}</p>`);
  $('#sheet').querySelectorAll('[data-tip]').forEach(b => { b.onclick = () => { const t = D.T[+b.dataset.tip]; if (t.act === 'balances') return balanceSheet(null, null); closeSheet(); if (t.act === 'balance') balance(); else useSuggest(); }; });
}
