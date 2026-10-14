/* Saved: savings and investments against their targets, and the history of money put away or paid off. */
import { clamp, money, kmoney, savedNow, investedNow } from '../core/index.js';
import { app } from './store.js';
import { $ } from './dom.js';
import { moveList } from './lists.js';

export function renderSaved(D) {
  const S = app.S, { P } = D, sv = savedNow(S), inv = investedNow(S);
  $('#sv-save').innerHTML = `<div class="card-head" style="margin:0"><p class="eyebrow">Savings</p><button class="link sm" type="button" data-n="saved">Correct balance</button></div>
    <p class="sum-big">${money(sv)}</p><div class="bar thin"><span style="width:${(P.emT > 0 ? clamp(sv / P.emT) : 0) * 100}%;background:var(--c-save)"></span></div>
    <p class="muted small">Emergency fund target ${money(P.emT)}, ${S.emMonths} months of costs</p>`;
  $('#sv-inv').innerHTML = `<div class="card-head" style="margin:0"><p class="eyebrow">Invested</p><button class="link sm" type="button" data-n="inv">Correct balance</button></div>
    <p class="sum-big">${money(inv)}</p><div class="bar thin"><span style="width:${(P.fiT > 0 ? clamp(inv / P.fiT) : 0) * 100}%;background:var(--c-invest)"></span></div>
    <p class="muted small">FI number ${kmoney(P.fiT)}</p>`;
  $('#sv-list').innerHTML = moveList(['saved', 'invested', 'debt'], 'Nothing yet. Record money you move to savings, investments or debts.', P.fi);
}
