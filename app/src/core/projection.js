// @ts-check
/* The countdown: how your money moves month by month until your investments cover your costs. */
import { BK, DPM, IMPACT_TYPES, today, daysBetween } from './util.js';
import { effPct, ppy, monthly, debtNow, savedNow, investedNow, sumType, order, periodDays, openBuys, buyMonths, buyLeft } from './balances.js';

/** @import { State, Move, MoveType } from './state.js' */

/** Your plan in monthly amounts: usual pay, bills, minimums and what's left to split. @param {State} S */
export function levels(S) {
  const pct = effPct(S), incM = S.pay * ppy(S) / 12;
  const billsM = S.bills.reduce((s, b) => s + monthly(b.amount, b.every), 0);
  const minsM = S.debts.reduce((s, d) => s + (debtNow(S, d) > 0.005 ? d.min : 0), 0);
  const remM = incM - billsM - minsM;
  const sc = Math.max(100, BK.reduce((s, k) => s + pct[k], 0));
  return { pct, incM, billsM, minsM, remM, sh: /** @param {keyof typeof pct} k */ k => Math.max(0, remM) * pct[k] / sc };
}

/**
 * Pay cycles: each pay you've entered, up to the next one. The countdown works only from these:
 * one pay, then the average of two, three and so on (the last 26).
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
    const next = recent[i + 1] ? recent[i + 1].date : null;
    let s = sumType(S, 'spend', ex, m => m.date >= c.date && (!next || m.date < next)), len;
    if (next) len = Math.max(1, daysBetween(c.date, next));
    else {
      // The pay you're in now: count what's been spent, or the card budget you set for it, whichever is more.
      const stk = c.stack && S.stacks.find(x => x.id === c.stack);
      len = Math.max(P, daysBetween(c.date, td) + 1);
      s = Math.max(s + extra, stk ? stk.plan.spend : 0);
    }
    inc += c.income; sp += s; days += len;
  });
  const k = P * ppy(S) / 12; // per-day rate -> per pay -> per month, so per-pay figures match what you stacked
  return { n: recent.length, incM: inc / days * k, spendM: sp / days * k };
}

/**
 * Monthly income and costs, from your pays (or from your plan if o.plan), plus the FI and emergency fund targets.
 * @param {State} S @param {{ plan?: boolean, ex?: string | null, extra?: number }} [o]
 */
export function costs(S, o = {}) {
  const L = levels(S), C = o.plan ? null : cycles(S, o.ex, o.extra || 0);
  const incM = C ? C.incM : L.incM, spendM = C ? C.spendM : L.sh('spend'), costM = L.billsM + spendM;
  return { L, C, real: !!C, none: !o.plan && !C, incM, spendM, costM, work: incM - L.billsM - L.minsM - spendM,
    fiT: costM * 12 / (S.wr / 100), emT: costM * S.emMonths };
}

/**
 * @typedef {{ id: string, bal: number, rate: number, min: number, od?: boolean, free?: boolean, until?: string | null, focus?: boolean, freeM?: number }} SimDebt
 */

/**
 * One period's working money → minimums, extra debt, savings, investing, with rollover.
 * Savings fills the emergency fund, then flows to debt. Once debt-free, it goes to the emergency fund, then investing.
 * Changes the balances in `debts` as it pays them.
 * @param {{ debt: number, save: number, invest: number }} sh @param {SimDebt[]} debts @param {number} em @param {number} emT
 */
export function allocate(sh, debts, em, emT) {
  /** @type {{ mins: Record<string, number>, extra: Record<string, number>, save: number, invest: number, em: number }} */
  const out = { mins: {}, extra: {}, save: 0, invest: 0, em: 0 };
  let pool = sh.debt;
  for (const d of debts) { const pay = Math.min(d.bal, d.min); d.bal -= pay; out.mins[d.id] = pay; pool += d.min - pay; }
  let e = sh.save;
  if (em < emT) { const dep = Math.min(emT - em, e); em += dep; out.save += dep; e -= dep; }
  pool += e;
  for (const d of order(debts)) {
    if (pool <= 0.004) break;
    if (d.bal > 0.004) { const pay = Math.min(d.bal, pool); d.bal -= pay; pool -= pay; out.extra[d.id] = (out.extra[d.id] || 0) + pay; }
  }
  if (em < emT && pool > 0) { const dep = Math.min(emT - em, pool); em += dep; out.save += dep; pool -= dep; }
  debts.forEach(d => { if (d.bal < 0.005) d.bal = 0; });
  out.invest = sh.invest + pool; out.em = em;
  return out;
}

/**
 * @typedef {{ plan?: boolean, ex?: string | null, extra?: number, lump?: number, fast?: boolean,
 *   add?: { type: MoveType, amount: number, ref?: string | null } }} ProjectOpts
 *   plan: use your plan instead of your pays. ex: leave an entry out. extra: spend this much more this pay.
 *   lump: this much less money today. add: pretend this entry happened. fast: stop at FI, skip the chart points.
 */

/**
 * Month-by-month projection. Months until each milestone (0 = already there, null = not within 50 years).
 * @param {State} S @param {ProjectOpts} [o]
 */
export function project(S, o = {}) {
  const C = costs(S, o), L = C.L, pc = L.pct, work = C.work;
  const ws = pc.debt + pc.save + pc.invest;
  const share = ws > 0 ? { debt: pc.debt / ws, save: pc.save / ws, invest: pc.invest / ws } : { debt: 1, save: 0, invest: 0 };
  /** @type {SimDebt[]} */
  const debts = S.debts.map(d => { const bal = debtNow(S, d, o.ex); return { id: d.id, bal, rate: d.rate, min: debtNow(S, d) > 0.005 ? d.min : 0, od: !!d.od,
    free: !!d.free, until: d.until, focus: !!d.focus, freeM: !d.free ? 0 : d.until ? daysBetween(today(), d.until) / DPM : Infinity }; });
  const buys = openBuys(S).map(b => ({ m: buyMonths(b), per: buyLeft(S, b) / buyMonths(b) }));
  const drain = (/** @type {number} */ m) => buys.reduce((s, b) => s + (m <= b.m ? b.per : 0), 0);
  let em = savedNow(S, o.ex), inv = investedNow(S, o.ex);
  if (o.lump && o.lump > 0) {
    let l = o.lump;
    for (const d of order(debts)) { const p = Math.min(d.bal, l); d.bal -= p; l -= p; }
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
  const net = () => em + inv - debts.reduce((s, d) => s + d.bal, 0);
  const R = Object.assign({}, C, { work, pts: [{ m: 0, inv }],
    /** @type {number | null} */ zero: null, /** @type {number | null} */ debtFree: null, /** @type {number | null} */ emFull: null, /** @type {number | null} */ fi: null });
  R.zero = net() >= 0 ? 0 : null; R.debtFree = clear() ? 0 : null; R.emFull = em >= C.emT - 0.005 ? 0 : null;
  R.fi = C.fiT > 0 && inv >= C.fiT && clear() ? 0 : null;
  if (C.none || C.incM <= 0 || R.fi === 0) return R;
  const r = S.ret / 1200;
  /** @type {SimDebt | null} */
  let short = null;
  for (let m = 1; m <= 600; m++) {
    debts.forEach(d => { if (d.bal > 0 && !(d.free && m <= (d.freeM ?? 0))) d.bal += d.bal * d.rate / 1200; });
    const wm = work - drain(m);
    let sh = { debt: 0, save: 0, invest: 0 };
    if (wm >= 0) sh = { debt: wm * share.debt, save: wm * share.save, invest: wm * share.invest };
    else {
      // More going out than coming in: the gap becomes debt.
      if (!short) { short = debts.find(d => d.od) || { id: '_short', bal: 0, rate: 0, min: 0, od: true }; if (!debts.includes(short)) debts.push(short); }
      short.bal += -wm;
    }
    const prev = inv, a = allocate(sh, debts, em, C.emT);
    em = a.em; inv = inv * (1 + r) + a.invest;
    if (!o.fast) R.pts.push({ m, inv });
    if (R.zero === null && net() >= 0) R.zero = m;
    if (R.debtFree === null && clear()) R.debtFree = m;
    if (R.emFull === null && em >= C.emT - 0.005) R.emFull = m;
    if (R.fi === null && C.fiT > 0 && inv >= C.fiT && clear()) {
      R.fi = prev < C.fiT && inv > prev ? m - 1 + (C.fiT - prev) / (inv - prev) : m;
      if (o.fast) break;
    }
  }
  return R;
}

/* ---------- how much an entry moved the FI date ---------- */
/** Months to FI, or null. @param {State} S @param {ProjectOpts} o */
export const fiOf = (S, o) => project(S, Object.assign({ fast: true }, o)).fi;
/** Days between two FI dates. ±Infinity when one of them is out of reach. @param {number | null} w @param {number | null} wo */
export const diffDays = (w, wo) => w === null && wo === null ? null : w === null ? Infinity : wo === null ? -Infinity : (w - wo) * DPM;

/**
 * An entry's effect = the countdown with it versus without it. Spends inside a pay's card budget are already counted,
 * so they barely move it. base is the FI result with everything in (project(S).fi).
 * @param {State} S @param {Move} m @param {number | null | undefined} base
 */
export function impactOf(S, m, base) {
  if (!IMPACT_TYPES.includes(m.type) || base === undefined) return null;
  return m.type === 'spend' ? diffDays(base, fiOf(S, { ex: m.id, lump: m.amount })) : diffDays(base, fiOf(S, { ex: m.id }));
}
/**
 * What an entry you're about to record would do to the FI date.
 * @param {State} S @param {MoveType} type @param {number} amount @param {string | null | undefined} ref @param {number | null} base
 */
export function hypo(S, type, amount, ref, base) {
  if (!(amount > 0) || !cycles(S)) return null;
  if (type === 'spend') return diffDays(fiOf(S, { extra: amount }), base);
  return diffDays(fiOf(S, { add: { type, amount, ref } }), base);
}
