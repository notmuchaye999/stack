/* Lists of entries (Spent and Saved history), each showing how it moved your FI date. */
import { money, fmtDate, debtName, impactOf } from '../core/index.js';
import { app } from './store.js';
import { esc, TY, impHTML } from './dom.js';

export const sortMoves = ms => [...ms].sort((a, b) => b.date.localeCompare(a.date) || b.t - a.t);

export function moveRow(m, base) {
  const S = app.S, b = m.buy && (S.buys || []).find(x => x.id === m.buy);
  const ref = (m.type === 'debt' && m.ref ? ' · ' + esc(debtName(S, m.ref)) : '') + (b ? ' · for ' + esc(b.name) : '');
  return `<button class="row" type="button" data-act="move" data-id="${m.id}"><i class="chip" style="background:${TY[m.type].color}"></i>
    <span class="grow"><b>${esc(m.note || TY[m.type].name)}</b><span class="muted small" style="margin:0">${fmtDate(m.date)}${ref}${m.src === 'import' ? ' · imported' : ''}</span></span>
    <span class="rcol"><span class="num">${money(m.amount)}</span>${impHTML(impactOf(S, m, base))}</span></button>`;
}
export function moveList(types, empty, base) {
  const ms = sortMoves(app.S.moves.filter(m => types.includes(m.type)));
  if (!ms.length) return `<p class="empty">${empty}</p>`;
  const shown = ms.slice(0, 50).map(m => moveRow(m, base)).join('');
  return shown + (ms.length > 50 ? `<p class="empty">Showing the latest 50 of ${ms.length}.</p>` : '');
}
