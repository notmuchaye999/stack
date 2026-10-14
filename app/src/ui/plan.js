/* Plan: your split (with the stacked-layers picture), milestones, the FI chart and your assumptions. */
import { BK, DPM, today, addDays, parseISO, money, kmoney, monthYear, dur, sumPct, netWorth, debtTotal, project } from '../core/index.js';
import { app } from './store.js';
import { $, BM } from './dom.js';
import { NF, fmtN } from './numpad.js';
import { reason } from './advice.js';

export function buildSplit() {
  $('#p-split').innerHTML = BK.map(k => `
    <div class="srow">
      <div class="srow-h"><i class="chip" style="background:${BM[k].color}"></i><span class="sname">${BM[k].name}</span><span class="num" id="pm-${k}"></span></div>
      <div class="srow-c"><input type="range" id="rng-${k}" min="0" max="100" step="1" style="accent-color:${BM[k].color}" aria-label="${BM[k].name} share">
        <button class="nfield pct" type="button" data-n="pct-${k}" id="pct-${k}" aria-label="${BM[k].name} percent"></button></div>
      <p class="muted small" style="margin:0">${BM[k].hint}</p>
    </div>`).join('');
}
export function fillSplit() { BK.forEach(k => { $('#rng-' + k).value = app.S.pct[k]; $('#pct-' + k).textContent = app.S.pct[k] + '%'; }); }
export function fillPlanInputs() {
  fillSplit();
  $('#s-freq').value = app.S.freq;
  ['pay', 'em', 'ret'].forEach(k => { $('#n-' + k).textContent = fmtN(NF[k].get(), NF[k]); });
  document.querySelectorAll('[data-wr]').forEach(b => b.setAttribute('aria-selected', +b.dataset.wr === app.S.wr));
}

/** Your monthly pay as stacked layers, labelled on the right, with a line at 100% of pay. */
function stackSVG(layers, total) {
  const top = 12, bot = 318, H = bot - top, cx = 44, cw = 86, lx = cx + cw + 22;
  const scale = Math.max(100, total), y100 = bot - 100 / scale * H;
  let y = bot, rects = '';
  const labels = [];
  layers.forEach(l => {
    if (l.pc <= 0.05) return;
    const h = l.pc / scale * H; y -= h;
    rects += `<rect x="${cx}" y="${y.toFixed(1)}" width="${cw}" height="${h.toFixed(1)}" style="fill:${l.color};stroke:var(--surface);stroke-width:2"/>`;
    labels.push(Object.assign({ mid: y + h / 2 }, l));
  });
  let band = '';
  if (total > 100.5) band = `<rect x="${cx}" y="${top}" width="${cw}" height="${(y100 - top).toFixed(1)}" style="fill:url(#hatch)"/>`;
  else if (total < 99.5) band = `<rect x="${cx + 1}" y="${y100.toFixed(1)}" width="${cw - 2}" height="${(y - y100).toFixed(1)}" rx="2" style="fill:none;stroke:var(--muted);stroke-width:1.5;stroke-dasharray:4 4"/>`;
  labels.sort((a, b) => a.mid - b.mid);
  const G = 33;
  labels.forEach((l, i) => { l.ly = Math.max(l.mid, i ? labels[i - 1].ly + G : top + 12); });
  for (let i = labels.length - 1; i >= 0; i--) { const lim = i === labels.length - 1 ? bot - 14 : labels[i + 1].ly - G; if (labels[i].ly > lim) labels[i].ly = lim; }
  const txt = labels.map(l => `<path d="M${cx + cw + 2} ${l.mid.toFixed(1)} L${cx + cw + 12} ${l.ly.toFixed(1)} L${lx - 4} ${l.ly.toFixed(1)}" style="fill:none;stroke:var(--muted);stroke-width:1"/>
    <text x="${lx}" y="${(l.ly - 3).toFixed(1)}" style="font:600 13px var(--f-body);fill:var(--ink)">${l.name}</text>
    <text x="${lx}" y="${(l.ly + 13).toFixed(1)}" style="font:500 12px var(--f-num);fill:var(--muted)">${l.sub}</text>`).join('');
  return `<defs><pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" style="fill:var(--bad-bg)"/><line x1="0" y1="0" x2="0" y2="7" style="stroke:var(--bad);stroke-width:3"/></pattern></defs>
    ${rects}${band}<line x1="${cx - 8}" x2="${cx + cw + 6}" y1="${y100.toFixed(1)}" y2="${y100.toFixed(1)}" style="stroke:var(--ink);stroke-width:1.5"/>
    <text x="${cx - 12}" y="${(y100 + 4).toFixed(1)}" text-anchor="end" style="font:600 11px var(--f-num);fill:var(--ink)">Pay</text>${txt}`;
}

/** Investments over time against your FI number: your pays so far (solid) and your plan (dashed). */
function renderFI(P, PLf) {
  const S = app.S, wrap = $('#p-fi'), xl = $('#p-fi-x');
  $('#p-fi-note').textContent = `Today's dollars at ${S.ret}% a year after inflation and a ${S.wr}% withdrawal rate. Super isn't counted.`;
  $('#p-legend').innerHTML = PLf ? '<span><i></i>Your pays so far</span><span><i class="plan"></i>Your plan</span>' : '';
  if (!(P.fiT > 0) || P.pts.length < 2) { wrap.innerHTML = `<p class="muted small">${P.none ? 'Stack your first pay to see the projection.' : 'Add your bills to see the projection.'}</p>`; xl.innerHTML = ''; return; }
  const ends = [P.fi, PLf && PLf.fi].filter(v => v !== null && v !== undefined);
  const hz = ends.length ? Math.min(600, Math.max(24, Math.ceil(Math.max(...ends) * 1.15 / 12) * 12)) : 480;
  const pts = P.pts.slice(0, hz + 1), ppts = PLf ? PLf.pts.slice(0, hz + 1) : [];
  const ymax = Math.max(P.fiT * 1.12, ...pts.map(p => p.inv), ...ppts.map(p => Math.min(p.inv, P.fiT * 1.5))) || 1;
  const X = m => m / hz * 1000, Y = v => 400 - Math.max(0, v) / ymax * 400;
  const path = ps => 'M' + ps.map(p => `${X(p.m).toFixed(1)} ${Y(p.inv).toFixed(1)}`).join(' L');
  const d = path(pts), fy = Y(P.fiT), fr = [0.25, 0.5, 0.75], grids = fr.map(f => Y(P.fiT * f)), ns = 'vector-effect="non-scaling-stroke"';
  let h = `<svg viewBox="0 0 1000 400" preserveAspectRatio="none" aria-hidden="true">
    ${grids.map(g => `<line x1="0" x2="1000" y1="${g.toFixed(1)}" y2="${g.toFixed(1)}" style="stroke:var(--line);stroke-width:1" ${ns}/>`).join('')}
    <line x1="0" x2="1000" y1="400" y2="400" style="stroke:var(--line);stroke-width:1" ${ns}/>
    <path d="${d} L${X(pts.at(-1).m).toFixed(1)} 400 L0 400 Z" style="fill:var(--c-invest);opacity:.15"/>
    ${ppts.length > 1 ? `<path d="${path(ppts)}" style="fill:none;stroke:var(--muted);stroke-width:1.75;stroke-dasharray:5 5" ${ns}/>` : ''}
    <path d="${d}" style="fill:none;stroke:var(--c-invest);stroke-width:2.5;stroke-linejoin:round" ${ns}/>
    <line x1="0" x2="1000" y1="${fy.toFixed(1)}" y2="${fy.toFixed(1)}" style="stroke:var(--ink);stroke-width:1.5;stroke-dasharray:6 5;opacity:.75" ${ns}/></svg>`;
  h += grids.map((g, i) => `<span class="fi-grid" style="top:${(g / 4).toFixed(2)}%">${kmoney(P.fiT * fr[i])}</span>`).join('');
  h += `<span class="fi-label" style="top:${(fy / 4).toFixed(2)}%">FI number ${kmoney(P.fiT)}</span>`;
  if (P.fi && P.fi <= hz) {
    const x = X(P.fi) / 10, yp = (fy / 4).toFixed(2);
    h += `<span class="fi-dot" style="left:${x.toFixed(2)}%;top:${yp}%"></span><span class="fi-dl${x > 80 ? ' right' : ''}" style="left:${x.toFixed(2)}%;top:${yp}%">${monthYear(parseISO(addDays(today(), Math.round(P.fi * DPM))))}</span>`;
  }
  wrap.innerHTML = h;
  const yrs = hz / 12, step = yrs > 30 ? 10 : yrs > 12 ? 5 : yrs > 6 ? 2 : 1;
  let xs = '<span style="left:0">Now</span>';
  for (let y = step; y < yrs - step * 0.4; y += step) xs += `<span style="left:${(y / yrs * 100).toFixed(2)}%;transform:translateX(-50%)">${y}y</span>`;
  xl.innerHTML = xs;
}

export function renderPlan(D) {
  const S = app.S, { P, st, sg } = D, L = P.L, tot = sumPct(S), fixed = L.billsM + L.minsM, rem = Math.max(0, L.remM);
  $('#drop-imports').hidden = !S.moves.some(m => m.src === 'import');
  $('#p-rem').textContent = L.incM > 0 ? `Bills and minimums take ${money(fixed)} a month. You're splitting the other ${money(rem)}.` : 'Set your usual pay under Assumptions.';
  BK.forEach(k => { $('#pm-' + k).innerHTML = `${money(rem * S.pct[k] / Math.max(100, tot))}<small>/mo</small>`; });
  if (L.incM > 0) {
    const f = rem / L.incM;
    const layers = [{ name: 'Bills & minimums', pc: fixed / L.incM * 100, color: 'var(--c-bills)', sub: money(fixed) }]
      .concat(BK.map(k => ({ name: BM[k].name, pc: S.pct[k] * f, color: BM[k].color, sub: `${S.pct[k]}% · ${money(rem * S.pct[k] / Math.max(100, tot))}` })));
    $('#p-stack').innerHTML = stackSVG(layers, layers.reduce((s, l) => s + l.pc, 0));
  } else $('#p-stack').innerHTML = '';
  const pill = $('#p-total'), diff = tot - 100;
  pill.className = 'pill ' + (tot === 0 ? 'warn' : diff > 0 ? 'bad' : diff < 0 ? 'warn' : 'good');
  pill.textContent = tot === 0 ? 'Your split is all 0%, so stacking uses a starter split. Drag the sliders or use the suggestion below.'
    : diff > 0 ? `Over by ${diff}%. That's ${money(rem * diff / 100)} a month you don't have.` : diff < 0 ? `${-diff}% unassigned. Give every dollar a job.` : 'Every dollar has a job. 100% planned.';
  $('#p-balance').hidden = diff === 0 || tot === 0;
  const same = BK.every(k => Math.abs(sg[k] - S.pct[k]) < 2);
  $('#p-suggest').innerHTML = same ? `Your split matches the suggestion for stage ${st.n}: ${st.name.toLowerCase()}.`
    : `<b>Suggested for stage ${st.n}</b>: ${BK.filter(k => sg[k] > 0).map(k => `${BM[k].name} ${sg[k]}%`).join(' · ')}<br>${reason(st)}<button class="btn wide" type="button" data-act="suggest">Use suggested split</button>`;
  $('#p-miles-note').textContent = P.real ? `Based on the ${P.C.n === 1 ? 'pay' : P.C.n + ' pays'} you've entered.` : 'Stack your first pay to see these.';
  const at = m => monthYear(parseISO(addDays(today(), Math.round(m * DPM))));
  const items = [
    { c: 'var(--bad)', t: 'Back above $0', m: P.zero, s: `Net worth now ${money(netWorth(S))}` },
    { c: 'var(--c-debt)', t: 'Debt-free', m: S.debts.length ? P.debtFree : 0, s: S.debts.length ? `${money(debtTotal(S))} to go` : 'No debts entered' },
    { c: 'var(--c-save)', t: 'Emergency fund full', m: P.emFull, s: `${money(P.emT)}, ${S.emMonths} months of costs` },
    { c: 'var(--c-invest)', t: 'Financially independent', m: P.fi, s: `Investments reach ${kmoney(P.fiT)}` },
  ].sort((a, b) => (a.m === null ? 1e9 : a.m) - (b.m === null ? 1e9 : b.m));
  $('#p-miles').innerHTML = items.map(it => {
    const when = it.m === null ? 'Not yet' : it.m === 0 ? 'Done' : at(it.m);
    const rel = it.m === null ? 'not within 50 yrs' : it.m === 0 ? 'already' : 'in ' + dur(Math.max(1, Math.round(it.m)));
    return `<li><i class="chip" style="background:${it.c}"></i><span><b>${it.t}</b><small>${it.s}</small></span><span class="when">${when}<small>${rel}</small></span></li>`;
  }).join('');
  renderFI(P, P.real ? project(S, { plan: true }) : null);
}
