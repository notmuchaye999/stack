/* Spent: your card budget this pay, what you actually spend per pay, and your spending history. */
import { clamp, money, fmtDate, perPay, latestStack, stackItems } from '../core/index.js';
import { app } from './store.js';
import { $ } from './dom.js';
import { moveList } from './lists.js';

export function renderSpent(D) {
  const S = app.S, { P, PL } = D, stk = latestStack(S);
  let top;
  if (stk) {
    const I = stackItems(S, stk), plan = stk.plan.spend, left = plan - I.spent;
    top = `<p class="eyebrow">Since your pay on ${fmtDate(stk.date)}</p><p class="sum-big">${money(I.spent)}<small> of ${money(plan)}</small></p>
      <div class="bar"><span style="width:${(plan > 0 ? clamp(I.spent / plan) : 1) * 100}%;background:${left < -0.5 ? 'var(--bad)' : 'var(--c-spend)'}"></span></div>
      <p class="muted small">${left < -0.5 ? `<span class="neg">${money(-left)} over</span> your card budget` : `${money(left)} left on your card budget until next pay`}</p>`;
  } else top = `<p class="eyebrow">Card budget</p><p class="muted small">Stack a pay to set how much goes on your card.</p>`;
  const paceV = P.real ? `${money(perPay(S, P.spendM))}<small>/pay</small>` : '<span class="muted">No pays yet</span>';
  const note = !P.real ? 'Stack a pay and your countdown starts working from what you actually spend.'
    : `Average over the ${P.C.n === 1 ? 'pay' : P.C.n + ' pays'} you've entered, including planned buys. The pay you're in counts as your card budget until you spend more than it. This is what your countdown uses.`;
  $('#sp-sum').innerHTML = `${top}<div class="stats"><div class="stat"><span>You spend</span><b>${paceV}</b></div><div class="stat"><span>Card budget</span><b>${money(perPay(S, PL.spendM))}<small>/pay</small></b></div></div><p class="muted small">${note}</p>`;
  $('#sp-list').innerHTML = moveList(['spend'], 'Nothing yet. Add what you put on your card, or import a statement.', P.fi);
}
