/* The Plan tab: the four plans as cards, what yours does with this pay, where it gets you, the path to FI, and the
   assumptions. Before your first pay it works on a pretend pay you can set, so there's something to compare. */
import { BK, today, now, money, money0, kmoney, fmtDate, monthYear, sumPct, fallbackPct, bankOwed, bufferT, savedNow, investedNow,
  poolBal, PLANS, PLAN_N, PLAN_RULE, ruleOf, planName, specOf, withSpec, withRestacked, withTempPay, latestStack, project, cardBudget,
  potTotal, goalVal, goalName, dateIn, whenTxt, derive } from '../core/index.js';
import { app, save } from './store.js';
import { $, esc, BM, PLAN_C, toast } from './dom.js';
import { fmtN } from './sheet.js';
import { receiptHTML } from './stack.js';
import { renderAll, undoOf } from './render.js';

/** The number fields on Plan, Settings and the quick start. */
export const NF = {
  em:    { label: 'Buffer', suffix: ' months', dec: 0, max: 24, get: () => app.S.emMonths, set: v => { app.S.emMonths = v; } },
  est:   { label: 'Your usual pay', prefix: '$', dec: 0, max: 1e6, get: () => app.S.estPay || 1000, set: v => { app.S.estPay = v > 0 ? v : 1000; } },
  ret:   { label: 'Return after inflation', suffix: '%', dec: 1, max: 20, get: () => app.S.ret, set: v => { app.S.ret = v; } },
  pool:  { label: 'Savings balance now', prefix: '$', dec: 2, max: 1e9, get: () => poolBal(app.S), set: v => { app.S.startPool = v; app.S.poolAsOf = now(); } },
  saved: { label: 'Buffer balance now', prefix: '$', dec: 2, max: 1e9, get: () => savedNow(app.S), set: v => { app.S.startSaved = v; app.S.savedAsOf = now(); } },
  inv:   { label: 'Investments worth now', prefix: '$', dec: 2, max: 1e9, get: () => investedNow(app.S), set: v => { app.S.startInvested = v; app.S.investedAsOf = now(); } },
};
BK.forEach(k => { NF['pct-' + k] = { label: `${BM[k].name} share`, suffix: '%', dec: 0, max: 100, get: () => app.S.pct[k], set: v => { app.S.pct[k] = Math.round(v); } }; });

export function buildSplit() {
  $('#p-split').innerHTML = BK.map(k => `<div class="sp-row">
      <span class="sp-n"><b><i class="chip" style="background:${BM[k].color}"></i>${BM[k].name}</b><small class="num" id="pm-${k}"></small></span>
      <input type="range" id="rng-${k}" min="0" max="100" step="5" style="accent-color:${BM[k].color}" aria-label="${BM[k].name} share">
      <button class="nfield pct" type="button" data-n="pct-${k}" id="pct-${k}" aria-label="${BM[k].name} percent"></button></div>`).join('');
}
export function fillSplit() { const S = app.S; BK.forEach(k => { $('#rng-' + k).value = S.pct[k] || 0; $('#pct-' + k).textContent = (S.pct[k] || 0) + '%'; }); }
/** Puts your settings into every input on screen (Plan, and Settings when it's open). */
export function fillPlanInputs() {
  const S = app.S;
  fillSplit();
  const sf = $('#s-freq'); if (sf) sf.value = S.freq;
  ['em', 'ret'].forEach(k => { const el = $('#n-' + k); if (el) el.textContent = fmtN(NF[k].get(), NF[k]); });
  document.querySelectorAll('[data-wr]').forEach(b => b.setAttribute('aria-selected', +b.dataset.wr === S.wr));
  const ts = $('#test-sw'); if (ts) ts.checked = !!app.TEST;
  const bk = $('#bk-last'); if (bk) bk.textContent = S.lastBackup ? fmtDate(S.lastBackup) : 'Never';
  const cs = $('#cloud-st'); if (cs) cs.textContent = 'This phone only';
}
function renderFI(P, PLf, est, nm) {
  const S = app.S, wrap = $('#p-fi'), xl = $('#p-fi-x'), lg = $('#p-legend');
  $('#p-fi-note').textContent = `${S.ret}% return · ${S.wr}% withdrawal`;
  const empty = !(P.fiT > 0) || P.pts.length < 2;
  wrap.classList.toggle('empty', empty);
  if (empty) { wrap.innerHTML = `<p class="muted small">${P.none ? 'Stack your first pay to see the path.' : 'Add your bills to set your FI number.'}</p>`; xl.innerHTML = ''; lg.innerHTML = ''; return; }
  const ends = [P.fi, PLf && PLf.fi].filter(v => v !== null && v !== undefined);
  const hz = ends.length ? Math.min(600, Math.max(24, Math.ceil(Math.max(...ends) * 1.15 / 12) * 12)) : 480;
  const pts = P.pts.slice(0, hz + 1), ppts = PLf ? PLf.pts.slice(0, hz + 1) : [];
  const ymax = Math.max(P.fiT * 1.12, ...pts.map(p => p.inv), ...ppts.map(p => Math.min(p.inv, P.fiT * 1.5))) || 1;
  const X = m => m / hz * 1000, Y = v => 400 - Math.max(0, v) / ymax * 400;
  const path = ps => 'M' + ps.map(p => `${X(p.m).toFixed(1)} ${Y(p.inv).toFixed(1)}`).join(' L');
  const d = path(pts), fy = Y(P.fiT), gy = Y(P.fiT / 2), ns = 'vector-effect="non-scaling-stroke"';
  let h = `<svg viewBox="0 0 1000 400" preserveAspectRatio="none" aria-hidden="true">
    <line x1="0" x2="1000" y1="${gy.toFixed(1)}" y2="${gy.toFixed(1)}" style="stroke:var(--line);stroke-width:1" ${ns}/>
    <line x1="0" x2="1000" y1="400" y2="400" style="stroke:var(--line);stroke-width:1" ${ns}/>
    <path d="${d} L${X(pts.at(-1).m).toFixed(1)} 400 L0 400 Z" style="fill:var(--c-invest);opacity:.15"/>
    ${ppts.length > 1 ? `<path d="${path(ppts)}" style="fill:none;stroke:var(--muted);stroke-width:1.75;stroke-dasharray:5 5" ${ns}/>` : ''}
    <path d="${d}" style="fill:none;stroke:var(--c-invest);stroke-width:2.5;stroke-linejoin:round" ${ns}/>
    <line x1="0" x2="1000" y1="${fy.toFixed(1)}" y2="${fy.toFixed(1)}" style="stroke:var(--ink);stroke-width:1.5;stroke-dasharray:6 5;opacity:.75" ${ns}/></svg>`;
  h += `<span class="fi-grid" style="top:${(gy / 4).toFixed(2)}%">${kmoney(P.fiT / 2)}</span><span class="fi-label" style="top:${(fy / 4).toFixed(2)}%">FI number ${kmoney(P.fiT)}</span>`;
  if (P.fi && P.fi <= hz) {
    const x = X(P.fi) / 10, yp = (fy / 4).toFixed(2);
    h += `<span class="fi-dot" style="left:${x.toFixed(2)}%;top:${yp}%"></span><span class="fi-dl${x > 80 ? ' right' : ''}" style="left:${x.toFixed(2)}%;top:${yp}%">${monthYear(dateIn(P.fi))}</span>`;
  }
  // The milestones on the way, as dots on the line, coloured like the list below.
  const ms = [{ m: P.emFull, c: 'var(--c-save)' }, { m: P.debtFree, c: 'var(--c-debt)' }, { m: P.zero, c: 'var(--bad)' }].filter(x => x.m && x.m > 0 && x.m <= hz && Math.round(x.m) < pts.length);
  ms.forEach(x => { h += `<span class="fi-dot sm" style="left:${(X(x.m) / 10).toFixed(2)}%;top:${(Y(pts[Math.round(x.m)].inv) / 4).toFixed(2)}%;background:${x.c}"></span>`; });
  wrap.innerHTML = h;
  const yrs = hz / 12, step = yrs > 30 ? 10 : yrs > 12 ? 5 : yrs > 6 ? 2 : 1;
  let xs = '<span style="left:0">Now</span>';
  for (let y = step; y < yrs - step * 0.4; y += step) xs += `<span style="left:${(y / yrs * 100).toFixed(2)}%;transform:translateX(-50%)">${y}y</span>`;
  xl.innerHTML = xs;
  lg.innerHTML = `<span><i></i>On ${esc(nm)}</span>` + (PLf ? '<span><i class="plan"></i>At your pace</span>' : '');
}
/* Before your first pay, Plan works on a pretend pay you can set, so there's something to compare. Home stays real. */
const noPays = () => !app.S.moves.some(m => m.type === 'pay');
/** Run fn with a pretend pay in, when there are no pays yet. */
export const inEst = fn => noPays() ? withTempPay(app.S, app.S.estPay || 1000, today(), fn) : fn();
export function renderPlanTab(D) {
  if (!noPays()) return renderPlan(D);
  inEst(() => renderPlan(derive(app.S), true));
}
function renderPlan(D, est) {
  const S = app.S, { P } = D, my = S.plan || null, show = my || 'debt', owing = bankOwed(S), emT = bufferT(S), sv = savedNow(S), inv = investedNow(S);
  const pe = $('#p-est'); pe.hidden = !est; if (est) pe.innerHTML = `Estimate on a <b>${money(S.estPay || 1000)}</b> pay ›`;
  const mon = m => m === null ? 'Never' : m === 0 ? 'Now' : monthYear(dateIn(m));
  // The four plans, always in this order: each as if every pay went like it, and what it does with this pay.
  const all = PLANS.map(k => {
    const sp = specOf(S, k); if (!sp) return { k, lock: true };
    let a = null; const R = withSpec(sp, () => withRestacked(S, () => { const s = latestStack(S); a = s && Object.assign({}, s); return project(S, { split: true }); }));
    return { k, sp, R, a };
  });
  const cur = all.find(o => o.k === show && !o.lock) || all[3], kv = (n, v) => `<span>${n}<b>${v}</b></span>`;
  $('#p-cap').textContent = my ? 'If every pay goes like it' : 'Pick one. Your first pay uses it.';
  $('#p-cards').innerHTML = all.map(o => {
    const rk = ruleOf(S, o.k), on = o.k === my;
    if (o.lock) return `<div class="pl-card lock" style="--c:${PLAN_C[rk]}"><b>${PLAN_N[rk]}</b><p>${PLAN_RULE[rk]}</p><p class="pl-lock">Track a pay's spending to unlock.</p></div>`;
    const rows = [kv('Spending', o.a ? money0(cardBudget(o.a)) : '–')];
    if (owing > 0.005) rows.push(kv('Debt-free', mon(o.R.debtFree)));
    else if (emT > 0.5 && sv < emT - 0.5) rows.push(kv('Buffer full', mon(o.R.emFull)));
    rows.push(kv('FI', o.R.fiT > 0 ? mon(o.R.fi) : '–'));
    return `<button class="pl-card${on ? ' on' : ''}" type="button" style="--c:${PLAN_C[rk]}" aria-pressed="${on}"${on ? '' : ` data-act="use-plan" data-k="${o.k}"`}>${on ? '<span class="pl-tag">Yours</span>' : ''}<b>${PLAN_N[rk]}</b><p>${PLAN_RULE[rk]}</p><span class="pl-kv">${rows.join('')}</span></button>`;
  }).join('');
  // In dollars: the plan on this pay, as Stack would stack it. Custom is the one you set yourself, so it gets the sliders.
  const a = cur.a, isC = cur.k === 'custom', nm = PLAN_N[ruleOf(S, cur.k)];
  $('#p-rem').textContent = a ? money0(a.amount) : '';
  $('#p-rc').hidden = isC; $('#p-cs').hidden = !isC;
  if (!isC) $('#p-rc').innerHTML = a ? receiptHTML(a) : '<p class="muted small" style="margin:0">Stack your first pay to see it.</p>';
  else {
    if (a) {
      const d = Object.values(a.plan.debts).reduce((x, v) => x + v, 0), v = { spend: cardBudget(a), pot: potTotal(a), debt: Math.max(0, d - (a.plan.mins || 0)), save: a.plan.save, invest: a.plan.invest };
      BK.forEach(k => { $('#pm-' + k).textContent = money(v[k]); });
    } else BK.forEach(k => { $('#pm-' + k).textContent = ''; });
    $('#p-crem').textContent = a ? `${money(a.plan.rem)} after bills and repayments` : '';
    const tot = sumPct(S), diff = tot - 100, pill = $('#p-total'), btns = $('#p-btns');
    pill.hidden = diff === 0;
    pill.className = 'pill ' + (diff > 0 ? 'bad' : 'warn');
    pill.textContent = tot === 0 ? 'Not set yet.' : diff > 0 ? `Over by ${diff}%` : `${-diff}% unassigned`;
    btns.innerHTML = diff !== 0 && tot > 0 ? '<button class="btn" type="button" data-act="balance">Balance to 100%</button>' : '';
    btns.hidden = !btns.children.length;
    btns.style.gridTemplateColumns = '1fr';
  }
  // Where it gets you on this plan, next to your pace (what you're actually doing).
  const R = cur.R, pace = m => est || P.none || m === undefined ? '' : `At your pace ${mon(m)}`, pool = poolBal(S);
  const goalAt = (g, pts) => { const p = pts.find(x => (g.kind === 'inv' ? x.inv : (x.em || 0) + (x.pot ?? pool)) >= g.amount - 0.005); return p ? p.m : null; };
  const ms = [];
  if (owing > 0.005) ms.push(['Debt-free', 'var(--c-debt)', `${money0(owing)} to go`, R.debtFree, P.debtFree]);
  if (emT > 0.5 && sv < emT - 0.5) ms.push(['Buffer full', 'var(--c-save)', `${money0(sv)} of ${money0(emT)}`, R.emFull, P.emFull]);
  (S.goals || []).forEach(g => { const v = goalVal(S, g); if (v < g.amount - 0.5) ms.push([goalName(g), g.kind === 'inv' ? 'var(--c-invest)' : 'var(--c-save)', `${money0(v)} of ${money0(g.amount)}`, goalAt(g, R.pts), est || P.none ? undefined : goalAt(g, P.pts)]); });
  if (R.fiT > 0) ms.push(['FI', 'var(--c-invest)', `${money0(inv)} of ${kmoney(R.fiT)}`, R.fi, P.fi]);
  $('#p-on').textContent = `On ${nm}`;
  // Milestones as tiles, coloured like Home's: the date on this plan, how long, how far, and your pace.
  $('#p-ms').innerHTML = ms.length ? ms.map(([n, c, v, m, pm]) => `<div class="pl-mt" style="--c:${c}"><b>${n}</b><span class="d">${mon(m)}</span><span>${m ? whenTxt(S, m) : ''}</span><small>${v}</small>${pace(pm) ? `<small>${pace(pm)}</small>` : ''}</div>`).join('')
    : '<p class="muted small" style="margin:0">Add your bills and a pay to see it.</p>';
  renderFI(R, est || P.none ? null : P, est, nm);
}

/* ---------- actions on your plan ---------- */
/** Make the split add up to 100%: spare goes to investing; any excess comes off investing, then the Buffer, debt, Savings, spending. */
export function balance() {
  const S = app.S;
  let diff = 100 - sumPct(S);
  if (diff > 0) S.pct.invest += diff;
  else for (const k of ['invest', 'save', 'debt', 'pot', 'spend']) { const take = Math.min(S.pct[k], -diff); S.pct[k] -= take; diff += take; if (diff >= 0) break; }
  save(); fillSplit(); renderAll(); toast('Split balanced to 100%');
}
/** Pick your plan. Undo puts your old one back. */
export function usePlan(k) {
  const S = app.S;
  if (!PLANS.includes(k) || k === S.plan || (k === 'tight' && !inEst(() => specOf(S, 'tight')))) return;
  const s0 = JSON.stringify(S); S.plan = k; if (k === 'custom' && sumPct(S) === 0) S.pct = Object.assign({}, fallbackPct(S));
  save(); fillSplit(); renderAll(); toast(`${planName(S, k)} is your plan now`, undoOf(s0));
}
