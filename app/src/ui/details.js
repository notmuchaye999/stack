/* One entry, or one pay: what it was, what it did, and Delete. */
import { addDays, fmtDate, money, sortMoves, debtName, impactOf, impShort, latestStack, stackItems, makeStack, ruleOf, myPlan,
  preSettle, settleRank, didAll, PLAN_N } from '../core/index.js';
import { app, ui, save } from './store.js';
import { $, esc, TY, impCls, toast, twoTap, toTop } from './dom.js';
import { openSheet, closeSheet } from './sheet.js';
import { rowsOf } from './lists.js';
import { renderAll, commit, go } from './render.js';
import { receiptHTML } from './stack.js';
import { showSettle } from './rank.js';

export function moveDetail(id) {
  const S = app.S, m = S.moves.find(x => x.id === id); if (!m) return;
  const d = impactOf(S, app.P, m), b = m.buy && (S.buys || []).find(x => x.id === m.buy);
  const where = (m.type === 'debt' && m.ref ? ' · ' + esc(debtName(S, m.ref)) : '') + (b ? ' · for ' + esc(b.name) : '') + (m.type === 'spend' && m.credit ? ' · on ' + esc(debtName(S, m.credit)) : '') + (m.type === 'spend' && m.from === 'buffer' ? ' · from Buffer' : '') + (m.type === 'spend' && m.from === 'pool' ? ' · from Savings' : '') + (m.from === 'ext' ? ' · from somewhere else' : '');
  const canSrc = (m.type === 'saved' || m.type === 'pot') && !m.grp && (!m.from || m.from === 'ext');
  openSheet(esc(m.note || TY[m.type].name), `<div class="form"><p class="sum-big" style="margin:0">${money(m.amount)}</p>
    <p class="muted" style="margin:0">${TY[m.type].name}${where} · ${fmtDate(m.date)}</p>
    ${d !== null ? `<p class="mv-imp ${impCls(d)}">${impShort(S, d, app.metric)}</p>` : ''}
    ${canSrc ? `<button class="btn wide" id="f-src" type="button">${m.from === 'ext' ? 'It was from my pay' : "It wasn't from my pay"}</button>` : ''}
    <button class="btn wide danger" id="f-del" type="button">Delete entry</button></div>`);
  if (canSrc) $('#f-src').onclick = () => { if (m.from === 'ext') delete m.from; else m.from = 'ext'; commit(m.from === 'ext' ? 'Marked as from somewhere else' : 'Marked as from your pay'); };
  // A purchase is one record, even when part of it went past Savings. Deleting it puts the purchase back on the list.
  twoTap($('#f-del'), 'Tap again to delete', () => {
    const S = app.S, gone = new Set(S.moves.filter(x => x.id === id || x.pair === id || x.id === m.pair || (m.grp && x.grp === m.grp)).map(x => x.id));
    const bs = new Set(S.moves.filter(x => gone.has(x.id)).flatMap(x => [x.buy, x.buyOf, ...(x.items || [])]).filter(Boolean));
    S.moves = S.moves.filter(x => !gone.has(x.id));
    if (m.type === 'bill') { const b = S.bills.find(x => x.id === m.ref); if (b && (b.paidTo || '') >= m.d) b.paidTo = addDays(m.d, -1); }
    if (m.grp) S.debts.forEach(d => { if (d.inst) d.inst = d.inst.filter(x => x.grp !== m.grp); });
    bs.forEach(bid => { const b = (S.buys || []).find(x => x.id === bid); if (b && !S.moves.some(x => x.buy === bid || x.buyOf === bid || (x.items || []).includes(bid))) b.bought = false; });
    commit('Entry deleted');
  });
}
export function payDetail(id) {
  const S = app.S, m = S.moves.find(x => x.id === id); if (!m) return;
  const stk = m.stack && S.stacks.find(s => s.id === m.stack);
  if (!stk) {
    openSheet(`Pay on ${fmtDate(m.date)}`, `<div class="form"><p class="sum-big" style="margin:0">${money(m.amount)}</p>
      <p class="muted" style="margin:0">Not stacked yet.</p>
      <button class="btn primary big" id="f-stack" type="button">Stack this pay</button><button class="btn wide danger" id="f-del" type="button" style="margin-top:0">Delete pay</button></div>`);
    $('#f-stack').onclick = () => {
      if (!S.plan) S.plan = 'debt';
      const pre = preSettle(S), s = makeStack(S, m.amount, m.date); s.pk = ruleOf(S, myPlan(S)); S.stacks.push(s); m.stack = s.id; ui.stackNew = false;
      const R = settleRank(S, pre); save(); closeSheet(); renderAll(); toTop();
      if (R) showSettle(R, () => toast('Stacked. Now make it real')); else toast('Stacked. Now make it real');
    };
  } else {
    const cur = stk === latestStack(S), inP = stackItems(S, stk).inP, ms = sortMoves(S.moves.filter(x => inP(x) && x.type !== 'pay' && x.type !== 'xout' && !x.pair));
    openSheet(`Pay on ${fmtDate(m.date)}`, `<div class="form"><div><p class="sum-big" style="margin:0">${money(m.amount)}</p><p class="muted small" style="margin:0">${cur ? 'This pay. Live on Stack.' : 'A past pay.'} Stacked on ${esc(PLAN_N[stk.pk] || 'Custom')}.</p></div>
      ${cur ? '<button class="btn primary big" type="button" id="f-open">Open on Stack</button>' : ''}
      <div><p class="lbl">What happened</p><div class="grouped">${rowsOf(ms, 'Nothing recorded in this pay.')}</div></div>
      <div><p class="lbl">The plan it was stacked on</p>${receiptHTML(stk)}</div>
      <button class="btn wide danger" id="f-del" type="button" style="margin-top:0">Delete pay</button></div>`);
    if (cur) $('#f-open').onclick = () => { closeSheet(); go('stack'); toTop(); };
  }
  twoTap($('#f-del'), 'Tap again to delete', () => { const S = app.S; S.moves = S.moves.filter(x => x.id !== id); if (stk) S.stacks = S.stacks.filter(s => s.id !== stk.id); commit('Pay deleted'); });
}
/** "Mark all done", then redraw. Returns how many things it did. */
export function didAllUI(stkId, past) {
  const n = didAll(app.S, stkId, past);
  save(); renderAll();
  return n;
}
