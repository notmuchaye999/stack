/* Home: your rank and countdown, this pay's money, then Cash flow. */
import { DPM, today, addDays, daysBetween, clamp, money, money0, kmoney, fmtDate, monthYear, perPay, periodDays, debtNow,
  repayIn, billsFor, latestStack, stackItems, overStreak, payNow, myPlan, specOf, effSpec, runPlan, inDebtNow, dateIn,
  spanTxt, whenTxt, PLAN_N, nameOf, rankNW, tierOf, bestNW, openBuys, idxStart, idxName, etaNW, order, bankOwed, cardAvail,
  cardLocked, bufferT, savedNow, investedNow, goalNow, goalName, whenPays, movedIt, netWorth, signed, instDates } from '../core/index.js';
import { app } from './store.js';
import { $, esc, CHEV, SPENT_IC, MOVED_IC, TROPHY, LOCK, LOCKI } from './dom.js';
import { tierColor, periodWord } from './rank.js';

function paceLine(P, PL, inDebt) {
  const S = app.S, k = inDebt ? 'debtFree' : 'fi', a = P[k], b = PL[k], what = inDebt ? 'Debt-free' : 'FI';
  if (P.work < 0) return `<button class="pace warn" type="button" data-go="stack"><b>${money0(-perPay(S, P.work))} short each pay.</b> More going out than coming in. ›</button>`;
  if (a === null || b === null) return '';
  const dd = (a - b) * DPM, over = perPay(S, P.spendM - PL.spendM), streak = overStreak(S);
  if (streak >= 3 && dd >= 7) return `<button class="pace warn" type="button" data-go="stack">Over budget ${streak} pays running. ${what} ${monthYear(dateIn(a))}, not ${monthYear(dateIn(b))}. ›</button>`;
  if (Math.abs(dd) < 7) { const lt = latestStack(S); return !lt || stackItems(S, lt).complete ? '<p class="pace good">On plan.</p>' : ''; }
  return dd > 0 ? `<button class="pace warn" type="button" data-go="stack">${spanTxt(S, dd)} behind plan.${over >= 0.5 ? ` ${money0(over)} a pay over budget.` : ''} ›</button>`
    : `<p class="pace good">${spanTxt(S, -dd)} ahead of plan.</p>`;
}
/* A nudge when Tight gets you there 2 weeks or more sooner than your plan does. */
function nudgeLine(D) {
  const S = app.S, my = myPlan(S); if (D.P.none || my === 'tight' || my === 'fi') return '';
  const T = specOf(S, 'tight'); if (!T) return '';
  const k = inDebtNow(S, D.P) ? 'debtFree' : 'fi', t = runPlan(S, T), y = runPlan(S, effSpec(S));
  if (t[k] === null) return '';
  const gain = y[k] === null ? Infinity : (y[k] - t[k]) * DPM;
  if (gain < 14) return '';
  return `<button class="pace nudge" type="button" data-go="plan">Tight plan: ${k === 'fi' ? 'FI' : 'debt-free'} ${gain === Infinity ? 'back in reach' : spanTxt(S, gain) + ' sooner'} ›</button>`;
}

export function renderHome(D) {
  const S = app.S, { P, PL } = D;
  // The countdown: debt-free while you owe anything, then FI. Only from pays you've stacked.
  let lead = '<p class="rk-cd">Countdown starts with your first pay</p>', status = '';
  if (!P.none) {
    const inDebt = inDebtNow(S, P), m = inDebt ? P.debtFree : P.fi, what = inDebt ? 'Debt-free' : 'FI', pace = paceLine(P, PL, inDebt), nudge = nudgeLine(D);
    status = pace.includes('pace warn') ? pace : nudge || pace;
    lead = !inDebt && !(P.fiT > 0) ? ''
      : m === null ? `<p class="rk-cd">${what}: <b class="neg">${P.work < 0 ? 'more going out than coming in' : 'not at this pace'}</b></p>`
      : m === 0 ? (inDebt ? '' : '<p class="rk-cd">FI: <b>your investments cover your costs</b></p>')
      : `<p class="rk-cd">${what} in <b>${whenTxt(S, m)}</b> · ${monthYear(dateIn(m))}</p>`;
  }
  const CF = cashFlow(lead + status);
  $('#h-rank').innerHTML = CF.hero;
  $('#h-cf').innerHTML = CF.body;
  const stk = latestStack(S);
  if (!stk) {
    if (!S.bills.length && !S.debts.length && !S.moves.length) {
      $('#h-pay').innerHTML = '<p class="card-h">This pay</p><p class="hint">Each pay, Stack splits it into bills, spending, Savings, debt, Buffer and investing, then gives you a to-do list. Every dollar you save, invest or pay off raises your rank.</p><p class="go-hint">Press <b>Stack</b> below to start.</p>';
    } else {
      // Before the first pay: what the next pay period needs, so you know what a pay has to cover.
      const t = today(), end = addDays(t, periodDays(S));
      const bills = Math.ceil(billsFor(S, t, end).reduce((s, b) => s + b.v, 0) - 0.001);
      const reps = Math.round(S.debts.reduce((s, d) => s + Math.min(debtNow(S, d), repayIn(S, d, t, end)), 0));
      $('#h-pay').innerHTML = `<div class="card-head"><p class="card-h">Next ${periodDays(S)} days</p><span class="muted small" style="margin:0">to ${fmtDate(addDays(end, -1))}</span></div>
        <p class="left-big">${money(bills + reps)}<small>due</small></p>
        <p class="muted small">Bills ${money(bills)} · Repayments ${money(reps)}</p>
        <p class="go-hint">Press <b>Stack</b> below to stack your first pay.</p>`;
    }
    return;
  }
  const N = payNow(S, stk), late = N.dues.filter(x => x.late).length, sh = N.short > 0.005, v = sh ? N.short : N.free, pay = esc(nameOf(S, 'pay'));
  // The full list lives on Stack. Home says what's free and what's still due, and takes you there.
  const todo = N.dues.length ? `<button class="htodo h-todo s-${late ? 'late' : 'todo'}" type="button" data-go="stack"><span class="grow">Still due${late ? ` · ${late} overdue` : ''}</span><span class="num">${money(N.due)}</span>${CHEV}</button>`
    : N.sugs.length ? `<button class="htodo h-todo s-todo" type="button" data-go="stack"><span class="grow">Nothing due · ${N.sugs.length} suggested</span>${CHEV}</button>` : '<p class="streak">Nothing due</p>';
  const stale = daysBetween(stk.date, today()) >= periodDays(S), pn = stk.one ? ' · ' + PLAN_N[stk.pk] : '';
  $('#h-pay').innerHTML = `${stale ? `<button class="pace warn" type="button" data-go="stack" style="margin:0 0 12px">Pay day was ${fmtDate(addDays(stk.date, periodDays(S)))}. Stack your new pay ›</button>` : ''}<div class="card-head"><p class="card-h">${stale ? 'Last pay' : 'This pay'}</p><span class="muted small" style="margin:0">${fmtDate(stk.date)} · ${money(stk.amount)}${pn}</span></div>
    <p class="left-big${sh ? ' neg' : ''}" style="margin:2px 0 0"><span data-tw="left" data-v="${v}">${money(v)}</span><small>${sh ? 'short' : 'free'}</small></p>
    <p class="muted small">${sh ? `${pay} can't cover what's still due` : 'after what\'s still due'} · ${pay} ${money(N.cash)}${N.spent > 0.005 ? ` · ${money(N.spent)} spent` : ''}</p>
    <div class="duo h-acts"><button class="btn primary" type="button" data-act="spent">${SPENT_IC}Spent</button><button class="btn" type="button" data-act="moved">${MOVED_IC}Moved</button></div>${todo}`;
}

/* ---------- your rank and cash flow ----------
   Your rank and high score, then Cash flow: the ranks ahead as tiles to swipe through (the one you're on fills up as you
   climb, a purchase pinned to a rank sits on its tile), the debts to clear with what's left on each as a health bar, the
   big milestones and your goals. Once a pay is in, each shows about when it lands at your pace. */
/** Pay-in-4 payments still to come on a debt. */
export const schedTxt = d => { const xs = (d.inst || []).flatMap(x => instDates(x).filter(t => t >= today()).map(() => x.amt)); return !xs.length ? '' : xs.every(a => a === xs[0]) ? `${xs.length} × ${money(xs[0])} scheduled` : `${xs.length} payments scheduled`; };
function cashFlow(status = '') {
  const S = app.S, P = app.P, live = !!P && !P.none, nw = rankNW(S), t = tierOf(nw), c = tierColor(t), nx = tierOf(t.hi);
  const best = S.best ? { nw: Math.max(S.best.nw, nw), date: nw > S.best.nw ? today() : S.best.date } : { nw, date: today() };
  const when = m => m === undefined ? '' : m === null ? 'Not at this pace' : m === 0 ? 'Done' : `about ${whenTxt(S, m)}`;
  // The ranks ahead, from where you are to RANK 10 at least, and far enough to show every reward.
  const bestV = bestNW(S), rewards = openBuys(S).filter(b => b.at != null && bestV < b.at - 0.005);
  const last = Math.max(10, t.idx + 6, ...rewards.map(b => tierOf(b.at).idx));
  let tiles = '';
  for (let i = t.idx; i <= last; i++) {
    const v = idxStart(i), ti = tierOf(v), now = i === t.idx, zero = i === 0, rw = rewards.filter(b => tierOf(b.at).idx === i);
    const eta = now || !live ? '' : when(etaNW(P, v)).replace(/^about /, '');
    tiles += `<div class="cf-tile${now ? ' now' : ''}${zero ? ' zero' : ''}${rw.length ? ' gift' : ''}" style="--t:${tierColor(ti)}">`
      + (now ? `<span class="cf-fill" style="height:${(clamp((nw - t.lo) / (t.hi - t.lo)) * 100).toFixed(1)}%"></span><span class="cf-pin">You</span>` : bestV >= v - 0.005 ? '<span class="cf-pin was">Reached</span>' : LOCK)
      + `<b class="cf-n">${zero ? '$0' : ti.n}</b><span class="cf-k">${zero ? 'BREAK EVEN' : ti.kind === 'debt' ? 'DEBT' : 'RANK'}</span>`
      + `<span class="cf-v">${now ? `${money0(t.hi - nw)} to go` : zero ? 'out of the red' : money0(v)}</span>${eta ? `<span class="cf-when">${eta}</span>` : ''}`
      + (rw.length ? `<span class="cf-gift">${rw.map(b => esc(b.name)).join(', ')}</span>` : '') + '</div>';
  }
  const lo = t.lo, span = Math.max(1, idxStart(last) - lo), at = clamp((nw - lo) / span), z = lo < 0 ? -lo / span : null;
  const rail = `<div class="cf-rail" style="--t:${c}"><i style="width:${(at * 100).toFixed(2)}%"></i>${z !== null ? `<b style="left:${(z * 100).toFixed(2)}%"></b>` : ''}<em style="left:${(at * 100).toFixed(2)}%"></em></div>`
    + `<div class="cf-rail-l"><span>${t.name}</span>${z !== null && z > 0.16 && z < 0.84 ? `<span class="z" style="left:${(z * 100).toFixed(2)}%">$0</span>` : ''}<span>${idxName(last)}</span></div>`;
  // Debts, in the order the plan pays them, at what your bank shows. What's left is the health bar: of the limit for cards, of what it started at for the rest.
  const ds = order(S.debts).filter(d => debtNow(S, d) > 0.005), first = ds.find(d => !d.set), owing = bankOwed(S);
  const debts = ds.map(d => {
    const ow = debtNow(S, d), scale = d.card ? Math.max(d.limit || 0, ow) : Math.max(d.balance || 0, debtNow(S, d), ow), f = scale > 0 ? clamp(ow / scale) : 1;
    const full = Math.floor(f * 20 + 1e-9), part = f * 20 - full;
    const hp = Array.from({ length: 20 }, (_, k) => k < full ? '<i class="on"></i>' : k === full && part > 0.05 ? `<i class="part" style="--p:${Math.round(part * 100)}%"></i>` : '<i></i>').join('');
    const left = d.card ? `of its ${money0(d.limit)} limit` : ow < scale - 0.5 ? `${money0(scale - ow)} paid off` : 'nothing paid off yet';
    const right = live ? when(P.cleared && P.cleared[d.id] !== undefined ? P.cleared[d.id] : null) : schedTxt(d) || 'Add a pay to see when';
    return `<button class="boss${d === first ? ' first' : ''}" type="button" data-act="${d.card ? 'credit' : 'debt-view'}" data-id="${d.id}"><span class="boss-t"><b>${esc(d.name)}${d === first ? '<small>Next up</small>' : ''}</b><strong class="num">${money(ow)}</strong></span><span class="hp">${hp}</span><span class="boss-f"><span>${left}</span><span>${right}</span></span></button>`;
  }).join('');
  const emT = bufferT(S), sv = savedNow(S), inv = investedNow(S), fiT = P ? P.fiT : 0;
  const ms = [
    ['Debt-free', 'var(--c-debt)', owing > 0.005 ? `${money0(owing)} to go` : 'Done', owing > 0.005 && live ? P.debtFree : undefined],
    ['Buffer full', 'var(--c-save)', !(emT > 0.5) ? 'Add bills to set it' : sv >= emT - 0.5 ? 'Done' : `${money0(sv)} of ${money0(emT)}`, emT > 0.5 && sv < emT - 0.5 && live ? P.emFull : undefined],
    ['FI', 'var(--c-invest)', fiT > 0 ? `${money0(inv)} of ${kmoney(fiT)}` : 'After your first pay', fiT > 0 && live && P.fi !== 0 ? P.fi : undefined],
  ].map(([n, col, v, m]) => `<div style="--c:${col}"><b>${n}</b><span>${v}</span>${m !== undefined ? `<span class="ms-when">${when(m)}</span>` : ''}</div>`).join('');
  const noPays = !S.moves.some(m => m.type === 'pay');
  const goals = (S.goals || []).map(g => {
    const G = goalNow(S, g), pace = G.pace ? `by ${fmtDate(g.by)}: ${G.pace.ok ? 'on track' : `${money0(G.pace.short)} a pay short`}` : '';
    const eta = G.done ? 'Done' : noPays ? 'Add a pay to see when' : G.pays === null ? 'Not at this pace' : `about ${whenPays(S, G.pays)}`;
    return `<button class="goal-c" type="button" data-act="goal" data-id="${g.id}"><span class="goal-t"><b>${goalName(g)}</b><span>${money0(G.v)} of ${money0(g.amount)}</span></span><span class="gbar"><i style="width:${(clamp(G.v / g.amount) * 100).toFixed(1)}%"></i></span><small>${[g.kind === 'inv' ? '' : 'Buffer + Savings', eta, pace].filter(Boolean).join(' · ')}</small></button>`;
  }).join('');
  const mv = movedIt(S, 7).map(r => `<div class="mv-row"><span class="g"><b>${esc(r.title)}</b><small>${esc(r.sub)}</small></span><span class="num ${r.d > 0.5 ? 'pos' : r.d < -0.5 ? 'neg' : 'muted'}">${r.d > 0.5 ? '+' : r.d < -0.5 ? '−' : ''}${money(Math.abs(r.d))}</span></div>`).join('');
  // Debts to clear: every debt and credit still owing, then the cleared ones, then what you can do with them.
  const cleared = order(S.debts).filter(d => debtNow(S, d) <= 0.005).map(d => `<button class="row" type="button" data-act="${d.card ? 'credit' : 'debt-view'}" data-id="${d.id}"><span class="grow"><b>${esc(d.name)}</b><span class="muted small" style="margin:0">${d.card ? `${money(cardAvail(S, d))} of ${money(d.limit)} available${cardLocked(S, d) ? ' · Locked' : ''}` : 'Paid off'}</span></span>${CHEV}</button>`).join('');
  const dsec = `<div class="cf-h"><h3>Debts to clear</h3><span>${owing > 0.005 ? `${money(owing)} owing` : 'All clear'}</span></div>${debts}${cleared ? `<div class="grouped" style="margin-bottom:10px">${cleared}</div>` : ''}`
    + `${owing > 0.005 ? '<button class="btn primary wide" type="button" data-act="pay-debt" style="margin:0 0 10px">Record a payment</button>' : ''}<div class="duo"><button class="btn" type="button" data-act="add-debt">Add a debt</button><button class="btn" type="button" data-act="credit-add">Add a credit</button></div>`;
  const ltR = latestStack(S), ndR = S.rank && ltR ? addDays(ltR.date, periodDays(S)) : null, so = S.rank ? Math.round((netWorth(S) - S.rank.nw) * 100) / 100 : 0;
  const lockRow = ndR ? `<div class="rk-lock">${LOCKI}<span>Settles ${fmtDate(ndR)}</span><span>This ${periodWord()} so far <b class="${so < -0.005 ? 'neg' : ''}">${signed(so)}</b></span></div>` : '';
  const hero = `<div class="rk-hero" style="--t:${c}"><div class="rk-who"><p class="rk-name">${t.name}</p><p class="rk-nw"><b data-tw="nw" data-v="${nw}">${money(nw)}</b><small>net worth</small></p></div>
      <div class="rk-bar"><i data-bw="rk" style="width:${(clamp((nw - t.lo) / (t.hi - t.lo)) * 100).toFixed(1)}%"></i></div>
      <div class="rk-row"><span>${money0(t.lo)}</span><span><b data-tw="tonext" data-v="${t.hi - nw}">${money0(t.hi - nw)}</b> to ${nx.name}</span></div>
      ${lockRow}${status}<div class="rk-hs">${TROPHY}<span>High score <b>${money(best.nw)}</b> · ${fmtDate(best.date)}</span>${(S.settles || []).length ? '<button class="link sm rk-replay" type="button" data-act="settle-last">Last pay day ›</button>' : ''}</div></div>`;
  const body = `<div class="cf-h"><h3>Cash flow</h3><span>every ${money0(t.hi - t.lo)} is a rank</span></div>
    <div class="cf-strip">${tiles}</div>${rail}
    ${dsec}
    <div class="cf-h"><h3>Milestones</h3></div><div class="ms3">${ms}</div>
    <div class="cf-h"><h3>Goals</h3></div>${goals}<button class="cf-add" type="button" data-act="goal-add">Add a goal</button>
    ${mv ? `<div class="cf-h"><h3>What moved it this pay</h3></div><div class="grouped">${mv}</div>` : ''}`;
  return { hero, body };
}
