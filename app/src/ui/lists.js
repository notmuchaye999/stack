/* Entries: each one lives with what it belongs to, as a row you can tap to see or delete it. */
import { fmtDate, money, debtName, nameOf, acctName, impactOf } from '../core/index.js';
import { app } from './store.js';
import { esc, TY, impHTML } from './dom.js';

export function moveRow(m) {
  const S = app.S, b = m.buy && (S.buys || []).find(x => x.id === m.buy);
  const ref = (m.type === 'debt' && m.ref ? ' · ' + esc(debtName(S, m.ref)) : '') + (b ? ' · for ' + esc(b.name) : '') + (m.type === 'spend' && m.credit ? ' · on ' + esc(debtName(S, m.credit)) : '') + (m.type === 'spend' && m.from === 'buffer' ? ' · from ' + esc(nameOf(S, 'buffer')) : '') + (m.type === 'spend' && m.from === 'pool' ? ' · from ' + esc(nameOf(S, 'pool')) : '') + (m.type === 'topay' && m.from ? ' · from ' + esc(acctName(S, m.from)) : '');
  return `<button class="row" type="button" data-act="move" data-id="${m.id}"><i class="chip" style="background:${TY[m.type].color}"></i>
    <span class="grow"><b>${esc(m.note || TY[m.type].name)}</b><span class="muted small" style="margin:0">${fmtDate(m.date)}${ref}</span></span>
    <span class="rcol"><span class="num">${money(m.amount)}</span>${impHTML(impactOf(S, app.P, m))}</span></button>`;
}
export const rowsOf = (ms, empty, n = 50) => ms.length ? ms.slice(0, n).map(moveRow).join('') + (ms.length > n ? `<p class="empty">Latest ${n} of ${ms.length}.</p>` : '') : `<p class="empty">${empty}</p>`;
