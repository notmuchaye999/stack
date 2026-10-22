// @ts-check
/* The countdown: how your money moves month by month until you're debt-free, your Buffer is full and your
   investments cover your costs. */
import { BK, DPM, today, daysBetween, addDays } from './util.js';
import { ppy, sumType, billsMonthly, minsMonthly, bufferT, perPay, periodDays, isCard, trackSpend, cardBudget, potTotal,
  savedNow, investedNow, poolBal, debtPlan, order } from './balances.js';
import { instIn, instLeft } from './due.js';
import { stackItems } from './stacks.js';
import { effSpec } from './plans.js';

/** @import { State, Move, MoveType, Split, Inst } from './state.js' */

/** Monthly money, and your plan's phases on your average pay. pct is the last phase: the one you're on at FI. @param {State} S */
export function levels(S) {
  const C0 = cycles(S), incM = C0 ? C0.incM : 0;
  const billsM = billsMonthly(S), minsM = minsMonthly(S), remM = incM - billsM - minsM;
  const ph = effSpec(S).phases(perPay(S, Math.max(0, remM))), pct = ph[ph.length - 1].pct;
  const sc = Math.max(100, BK.reduce((s, k) => s + (pct[k] || 0), 0));
  return { pct, ph, incM, billsM, minsM, remM, sh: /** @param {keyof Split} k */ k => Math.max(0, remM) * (pct[k] || 0) / sc };
}

/**
 * Pay cycles: each pay you enter, up to the next one. The countdown works from these: one pay, then the average of two,
 * three and so on (the last 26).
 * @param {State} S @param {string | null} [ex] leave this entry out @param {number} [extra] pretend this much more was spent this pay
 */
export function cycles(S, ex, extra = 0) {
  /** @type {{ date: string, income: number, stack?: string }[]} */
  const g = [];
  S.moves.filter(m => m.type === 'pay' && m.id !== ex).sort((a, b) => a.date.localeCompare(b.date)).forEach(p => {
    const last = g[g.length - 1];
    if (last && last.date === p.date) { last.income += p.amount; last.stack = last.stack || p.stack; } else g.push({ date: p.date, income: p.amount, stack: p.stack });
  });
  if (!g.length) return null;
  const recent = g.slice(-26), P = periodDays(S), td = today();
  let inc = 0, sp = 0, days = 0;
  recent.forEach((c, i) => {
    const next = recent[i + 1] ? recent[i + 1].date : null, inW = (/** @type {Move} */ m) => m.date >= c.date && (!next || m.date < next);
    const stk = c.stack && S.stacks.find(x => x.id === c.stack);
    // Savings money counts when it goes into Savings, not when the thing is bought, so one big buy doesn't spike a pay.
    let card = sumType(S, 'spend', ex, m => isCard(m) && inW(m));
    const bought = sumType(S, 'spend', ex, m => !!m.buy && inW(m)), pots = stk ? potTotal(stk) : 0;
    // A finished pay with nothing recorded counts as its full card budget, so a forgotten pay can't make FI look closer.
    if (next && stk && !S.moves.some(m => trackSpend(m) && m.id !== ex && inW(m))) card = stackItems(S, stk).budget;
    let s, len;
    if (next) { len = Math.max(1, daysBetween(c.date, next)); s = card + (stk ? pots : bought); }
    else {
      // The pay you're in now: what's gone on the card, or its card budget, whichever is more.
      len = Math.max(P, daysBetween(c.date, td) + 1);
      s = Math.max(card + extra, stk ? stackItems(S, stk).budget : 0) + (stk ? pots : bought);
    }
    inc += c.income; sp += s; days += len;
  });
  const k = P * ppy(S) / 12; // per-day rate -> per pay -> per month, so per-pay figures match what you stacked
  return { n: recent.length, incM: inc / days * k, spendM: sp / days * k };
}
/** Planned spending: the spending share of the pays you've stacked (card budget plus Savings). @param {State} S */
export function planSpendM(S) {
  const ss = [...S.stacks].sort((a, b) => a.date.localeCompare(b.date) || a.t - b.t).slice(-26);
  return ss.length ? ss.reduce((s, k) => s + k.plan.spend, 0) / ss.length * ppy(S) / 12 : null;
}

/**
 * @typedef {{ plan?: boolean, split?: boolean, ex?: string | null, extra?: number, lump?: number, fast?: boolean,
 *   add?: { type: string, amount: number, ref?: string | null } }} ProjectOpts
 *   Spending: real (what you've spent), plan (what your pays planned) or split (the split's own share, as if every pay went like it).
 *   ex: leave an entry out. extra: spend this much more this pay. lump: this much less money today. add: pretend this entry happened.
 *   fast: stop at FI, skip the chart points.
 */
/** Monthly income and costs, plus the FI number and the Buffer's target. @param {State} S @param {ProjectOpts} [o] */
export function costs(S, o = {}) {
  const L = levels(S), C = o.plan || o.split ? null : cycles(S, o.ex, o.extra || 0), ps = o.plan ? planSpendM(S) : null;
  const incM = C ? C.incM : L.incM, spendM = C ? C.spendM : ps !== null ? ps : L.sh('spend') + L.sh('pot'), costM = L.billsM + spendM;
  return { L, C, real: !!C, none: !o.plan && !o.split && !C, incM, spendM, costM, work: incM - L.billsM - L.minsM - spendM,
    fiT: costM * 12 / (S.wr / 100), emT: bufferT(S) };
}

/**
 * @typedef {{ id: string, bal: number, rate: number, min: number, od?: boolean, card?: boolean, free?: boolean, until?: string | null,
 *   focus?: boolean, urgent?: boolean, set?: boolean, freeM?: number, base?: number, src?: { inst?: Inst[] } | null }} SimDebt
 */
/**
 * One period's working money → minimums, extra debt, savings, investing, with rollover. Changes the balances in `debts`.
 * @param {{ debt: number, save: number, invest: number }} sh @param {SimDebt[]} debts @param {number} em @param {number} emT
 */
export function allocate(sh, debts, em, emT) {
  /** @type {{ mins: Record<string, number>, extra: Record<string, number>, save: number, invest: number, em: number }} */
  const out = { mins: {}, extra: {}, save: 0, invest: 0, em: 0 };
  // A minimum bigger than what's left frees the rest, and it goes where the split sends money, like it does on a real pay.
  const ws = sh.debt + sh.save + sh.invest;
  let pool = sh.debt, e = sh.save, inv = sh.invest;
  for (const d of debts) {
    const pay = Math.min(d.bal, d.min), fr = d.min - pay; d.bal -= pay; out.mins[d.id] = pay;
    if (fr > 0) { if (ws > 0) { pool += fr * sh.debt / ws; e += fr * sh.save / ws; inv += fr * sh.invest / ws; } else pool += fr; }
  }
  if (em < emT) { const dep = Math.min(emT - em, e); em += dep; out.save += dep; e -= dep; }
  pool += e;
  for (const d of order(debts)) {
    if (pool <= 0.004) break;
    if (d.bal > 0.004 && !d.set) { const pay = Math.min(d.bal, pool); d.bal -= pay; pool -= pay; out.extra[d.id] = (out.extra[d.id] || 0) + pay; }
  }
  // Debt money with no debt left to pay goes where the rest of your split goes: the buffer in its share while it fills, the rest invested.
  if (em < emT && pool > 0 && sh.save > 0) { const dep = Math.min(emT - em, pool * sh.save / (sh.save + sh.invest)); em += dep; out.save += dep; pool -= dep; }
  debts.forEach(d => { if (d.bal < 0.005) d.bal = 0; });
  out.invest = inv + pool; out.em = em;
  return out;
}

/**
 * Month-by-month projection. Months until each milestone (0 = already there, null = not within 50 years).
 * @param {State} S @param {ProjectOpts} [o]
 */
export function project(S, o = {}) {
  const C = costs(S, o), L = C.L, work = C.work;
  // A plan's phases, each until it's done its job (debt: nothing left to put extra on; buf: Buffer full). On the plan
  // alone (split), each phase's own spending sets what's left to move; otherwise spending is what it is.
  const PH = L.ph.map(p => { const pc = p.pct, ws = pc.debt + pc.save + pc.invest, sc = Math.max(100, BK.reduce((s, k) => s + (pc[k] || 0), 0));
    return { until: p.until, share: ws > 0 ? { debt: pc.debt / ws, save: pc.save / ws, invest: pc.invest / ws } : { debt: 1, save: 0, invest: 0 },
      work: o.split ? C.incM - L.billsM - L.minsM - Math.max(0, L.remM) * ((pc.spend || 0) + (pc.pot || 0)) / sc : work, pot: Math.max(0, L.remM) * (pc.pot || 0) / sc }; });
  let ph = 0;
  /** @type {SimDebt[]} */
  const debts = S.debts.map(d => { const bal = debtPlan(S, d, o.ex); return { id: d.id, bal, rate: d.rate, min: bal > 0.005 ? d.min : 0, od: !!d.od,
    free: !!d.free, until: d.until, focus: !!d.focus, urgent: !!d.urgent, set: !!d.set, card: !!d.card, freeM: !d.free ? 0 : d.until ? daysBetween(today(), d.until) / DPM : Infinity,
    base: bal > 0.005 ? d.min : 0, src: d.inst && d.inst.length ? d : null }; });
  const sched = debts.some(d => d.src), t0 = today();
  let em = savedNow(S, o.ex), inv = investedNow(S, o.ex);
  if (o.lump && o.lump > 0) {
    let l = o.lump;
    for (const d of order(debts)) { if (d.set) continue; const p = Math.min(d.bal, l); d.bal -= p; l -= p; }
    if (em < C.emT) { const p = Math.min(C.emT - em, l); em += p; l -= p; }
    inv += l;
  }
  if (o.add) {
    const a = o.add;
    if (a.type === 'saved') em += a.amount;
    else if (a.type === 'invested') inv += a.amount;
    else if (a.type === 'debt') { const d = debts.find(x => x.id === a.ref) || order(debts).find(x => x.bal > 0); if (d) d.bal = Math.max(0, d.bal - a.amount); }
  }
  const clear = () => debts.every(d => d.bal <= 0.005);
  // pot: Savings as the plan fills it, for cash goals. Net worth leaves it out: it's there to be spent on purchases.
  const pool0 = poolBal(S, o.ex), net = () => em + inv + pool0 - debts.reduce((s, d) => s + d.bal, 0);
  let pot = pool0;
  const R = Object.assign({}, C, { work, pts: [{ m: 0, inv, em, pot, nw: net() }], /** @type {Record<string, number>} */ cleared: {}, late: false,
    /** @type {number | null} */ zero: null, /** @type {number | null} */ debtFree: null, /** @type {number | null} */ emFull: null, /** @type {number | null} */ fi: null });
  R.zero = net() >= 0 ? 0 : null; R.debtFree = clear() ? 0 : null; R.emFull = em >= C.emT - 0.005 ? 0 : null;
  R.fi = C.fiT > 0 && inv >= C.fiT && clear() ? 0 : null;
  if (C.none || C.incM <= 0 || R.fi === 0) return R;
  const r = S.ret / 1200;
  /** @type {SimDebt | null} */
  let short = null;
  for (let m = 1; m <= 600; m++) {
    debts.forEach(d => { if (d.bal > 0 && !(d.free && m <= /** @type {number} */ (d.freeM))) d.bal += d.bal * d.rate / 1200; });
    // A pay-in-4 schedule sets what's due each month: its instalments, plus the usual repayment on what isn't scheduled.
    // Anything past the usual repayment comes out of the month's money like a minimum does.
    while (ph < PH.length - 1 && (PH[ph].until === 'debt' ? debts.every(d => d.set || d.bal <= 0.005) : em >= C.emT - 0.005)) ph++;
    const share = PH[ph].share;
    let wk = PH[ph].work;
    if (sched) {
      const a = addDays(t0, Math.round((m - 1) * DPM)), b = addDays(t0, Math.round(m * DPM));
      debts.forEach(d => { if (!d.src) return; const due = d.bal > 0.005 ? instIn(d.src, a, b) + Math.min(/** @type {number} */ (d.base), Math.max(0, d.bal - instLeft(d.src, a))) : 0; wk -= due - /** @type {number} */ (d.base); d.min = due; });
    }
    let sh = { debt: 0, save: 0, invest: 0 };
    if (wk >= 0) sh = { debt: wk * share.debt, save: wk * share.save, invest: wk * share.invest };
    else {
      // More going out than coming in: the gap becomes debt.
      if (!short) { short = debts.find(d => d.od) || { id: '_short', bal: 0, rate: 0, min: 0, od: true }; if (!debts.includes(short)) debts.push(short); }
      short.bal += -wk;
    }
    // Urgent debts are first in line, like on a real pay: they take the split before buffer and investing.
    const urg = debts.reduce((s, d) => s + (d.urgent && d.bal > 0.005 ? Math.max(0, d.bal - d.min) : 0), 0);
    if (urg > sh.debt + 0.005) { const rest = sh.save + sh.invest, x = Math.min(urg - sh.debt, rest), f = rest > 0 ? (rest - x) / rest : 0; sh.save *= f; sh.invest *= f; sh.debt += x; }
    // What could go on debt this month, so the debt-free point lands inside the month instead of at its end.
    const b0 = new Map(debts.map(d => [d, d.bal]));
    const owedB = debts.reduce((s, d) => s + d.bal, 0), cap = debts.reduce((s, d) => s + (d.bal > 0.005 ? Math.min(d.bal, d.min) : 0), 0) + sh.debt + Math.max(0, sh.save - Math.max(0, C.emT - em));
    const prev = inv, a = allocate(sh, debts, em, C.emT);
    em = a.em; inv = inv * (1 + r) + a.invest; if (wk >= 0) pot += PH[ph].pot;
    // An interest-free debt still owing when its free period ends.
    if (!R.late) debts.forEach(d => { if (d.free && isFinite(/** @type {number} */ (d.freeM)) && /** @type {number} */ (d.freeM) > 0 && m >= /** @type {number} */ (d.freeM) && d.bal > 0.005) R.late = true; });
    if (!o.fast) {
      R.pts.push({ m, inv, em, pot, nw: net() });
      // When each debt clears inside the month: debt money comes in through the month, minimums first, then in order.
      let need = debts.reduce((s, d) => s + Math.min(/** @type {number} */ (b0.get(d)), d.min), 0);
      order(debts).forEach(d => {
        const b = /** @type {number} */ (b0.get(d)); if (b <= 0.005) return;
        if (!d.set) need += Math.max(0, b - d.min);
        // Its own minimum alone, or its turn in the order, whichever gets there first.
        if (R.cleared[d.id] === undefined && d.bal <= 0.005) { const own = d.min > 0 ? b / d.min : Infinity, turn = cap > 0.005 ? need / cap : 1; R.cleared[d.id] = m - 1 + Math.min(1, d.set ? (d.min > 0 ? own : 1) : Math.min(own, turn)); }
      });
    }
    if (R.zero === null && net() >= 0) R.zero = m;
    if (R.debtFree === null && clear()) R.debtFree = m - 1 + (cap > 0.005 ? Math.min(1, owedB / cap) : 1);
    if (R.emFull === null && em >= C.emT - 0.005) R.emFull = m;
    if (R.fi === null && C.fiT > 0 && inv >= C.fiT && clear()) {
      R.fi = Math.max(R.debtFree || 0, prev < C.fiT && inv > prev ? m - 1 + (C.fiT - prev) / (inv - prev) : m);
      if (o.fast) break;
    }
  }
  return R;
}
