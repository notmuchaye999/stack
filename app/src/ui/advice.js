/* The words behind the numbers: why a split is suggested, and the suggestions list on Home. */
import { BK, money, fmtDate, today, daysBetween, sumPct, debtNow, periodDays, perPay, project, stageInfo, suggest, INVESTING_TIP } from '../core/index.js';
import { app } from './store.js';
import { esc, BM } from './dom.js';

export function reason(st) {
  if (st.n === 1) return `Your ${esc(st.top.name)} is overdrawn. Getting it back to $0 stops the fees and gives you a real starting line. Investing keeps a small slice, taken from Spending.`;
  if (st.n === 2) return 'With no buffer, any surprise bill turns into debt, so savings starts building toward $1,000. Investing still gets more than savings.';
  if (st.n === 3) return `Your ${esc(st.top.name)} charges ${st.top.rate}%. Paying it off is a guaranteed ${st.top.rate}% return, more than investing can promise. Investing's slice comes out of Spending, not the debt.`;
  if (st.n === 4) return 'High-interest debt is handled. Investing takes the bigger share while the emergency fund fills in the background.';
  return "The buffer's full and debt's handled. Everything spare goes to investments.";
}

export function tips(P, PL, st, sg) {
  const S = app.S, t = [], tot = sumPct(S), L = P.L;
  if (S.moves.some(m => m.src === 'import') && (!S.savedAsOf || !S.investedAsOf)) t.push({ title: 'Check your savings and investment balances', body: "Right now they're Stack's guess from your statement, and a statement only shows one account. Set them to what your bank shows.", act: 'balances', label: 'Set balances' });
  if (L.incM > 0 && L.remM < 0) t.push({ title: 'Bills and minimums are more than your pay', body: `They need ${money(-L.remM)} a month more than you earn. Cutting or renegotiating a bill is the quickest fix.` });
  else if (P.real && P.work < 0) t.push({ title: "You're spending more than you earn", body: `Going by your last ${P.C.n === 1 ? 'pay' : P.C.n + ' pays'}, you're ${money(-perPay(S, P.work))} short each pay after bills, minimums and spending. That gap ends up as debt.` });
  S.debts.forEach(d => {
    const left = debtNow(S, d);
    if (!d.free || !d.until || left <= 0.5) return;
    const pays = Math.floor(daysBetween(today(), d.until) / periodDays(S)), need = left / Math.max(1, pays), minPer = perPay(S, d.min);
    if (pays <= 0) t.push({ title: `${esc(d.name)} is charging interest now`, body: `Its interest-free period ended ${fmtDate(d.until)}. Update the rate or the date under Bills, Debts.` });
    else if (need > minPer + 1) t.push({ title: `Clear ${esc(d.name)} before ${fmtDate(d.until)}`, body: `It's interest-free until then, but minimums alone won't clear it. ${money(need)} a pay for the next ${pays} pays and it's gone before interest starts.` });
  });
  if (tot === 0 && S.pay > 0) t.push({ title: 'Using a starter split', body: `Pick your own split in Plan, or use the one suggested for stage ${st.n}. ${reason(st)}`, act: 'suggest', label: 'Use suggested split' });
  else if (tot > 0 && tot !== 100) t.push({ title: `Your split adds to ${tot}%`, body: tot > 100 ? "That plans money you don't have." : 'Part of each pay has no job yet.', act: 'balance', label: 'Balance to 100%' });
  if (L.incM > 0 && tot > 0 && BK.some(k => Math.abs(sg[k] - S.pct[k]) >= 2)) t.push({ title: `Suggested split for stage ${st.n}`, body: `${reason(st)} Suggested: ${BK.filter(k => sg[k] > 0).map(k => `${BM[k].name} ${sg[k]}%`).join(', ')}.`, act: 'suggest', label: 'Use suggested split' });
  if (P.real && P.spendM > PL.spendM * 1.1 + 20) { t.push({ title: `Spending ${money(perPay(S, P.spendM - PL.spendM))} a pay over your card budget`, body: `You're averaging ${money(perPay(S, P.spendM))} a pay on spending against ${money(perPay(S, PL.spendM))} planned. That gap is what's holding your countdown back.` }); }
  if (L.incM > 0 && L.billsM / L.incM > 0.5) t.push({ title: `Bills take ${Math.round(L.billsM / L.incM * 100)}% of your pay`, body: "Over half your pay is gone before you've spent a dollar. One cheaper plan or cancelled subscription moves the countdown." });
  if (st.n >= 4) t.push(Object.assign({}, INVESTING_TIP));
  return t;
}

/** Everything the screens need from the maths, worked out once per render. */
export function derive() {
  const S = app.S, P = project(S), PL = project(S, { plan: true, fast: true }), st = stageInfo(S, P), sg = suggest(S, st);
  app.base = P.fi;
  return { P, PL, st, sg, T: tips(P, PL, st, sg) };
}
