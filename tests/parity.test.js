// The rewrite must give the same answers as the prototype. Each check runs one function in the prototype
// (inside a fake browser) and in the new core, on the same saved state, and compares the results.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadPrototype } from './helpers/prototype.js';
import { buildStates } from './helpers/states.js';
import * as C from '../app/src/core/index.js';

const json = v => JSON.parse(JSON.stringify(v ?? null));
const clone = o => JSON.parse(JSON.stringify(o));
let P, states;
beforeAll(() => { P = loadPrototype(); states = buildStates(P); }, 120000);
afterAll(() => P.close());

/** Ids and times made up on the spot (uid(), Date.now()) can't match, so they're swapped for their order of appearance. */
function steady(v) {
  let txt = JSON.stringify(v ?? null), n = 0;
  const seen = new Map();
  txt = txt.replace(/"(id|grp|pair|stack|stk|ref|buy|buyOf|credit)":"([a-z0-9]{1,12})"/g, (_, k, id) => { if (!seen.has(id)) seen.set(id, 'id' + n++); return `"${k}":"${seen.get(id)}"`; });
  for (const [id, r] of seen) txt = txt.split(`"${id}"`).join(`"${r}"`);
  return JSON.parse(txt, (k, x) => k === 't' && typeof x === 'number' ? 0 : x);
}
/** Run a function on both sides, or get { threw: true } from either. */
const tryRun = f => { try { return f(); } catch (e) { return { threw: true }; } };

/** Runs `expr` in the prototype and `fn` in the new code for every test state. */
function same(name, expr, fn, { only, fix = json } = {}) {
  it(name, () => {
    for (const [label, S] of Object.entries(states)) {
      if (only && !only(S)) continue;
      P.setState(S);
      const old = fix(tryRun(() => P.run(expr))), mine = fix(json(tryRun(() => fn(clone(S)))));
      expect(mine, `${name} on "${label}"`).toEqual(old);
    }
  }, 120000);
}
const hasStack = S => S.stacks.length > 0;
const D = (S, i) => S.debts[i];

describe('balances match the prototype', () => {
  same('accounts now', '[payAcctBal(), savedNow(), poolBal(), investedNow(), netWorth(), bankOwed(), owedNW(), debtTotal(), bufferT()]',
    S => [C.payAcctBal(S), C.savedNow(S), C.poolBal(S), C.investedNow(S), C.netWorth(S), C.bankOwed(S), C.owedNW(S), C.debtTotal(S), C.bufferT(S)]);
  same('each debt and credit', 'S.debts.map(d => [rawOwed(d), debtNow(d), debtPlan(d), walletAdj(d), walletLoad(d), cardAvail(d), cardLocked(d), lockOn(d), tagOf(d), oneOff(d), overdue(d), freeNow(d), effRate(d)])',
    S => S.debts.map(d => [C.rawOwed(S, d), C.debtNow(S, d), C.debtPlan(S, d), C.walletAdj(S, d), C.walletLoad(S, d), C.cardAvail(S, d), C.cardLocked(S, d), C.lockOn(d), C.tagOf(d), C.oneOff(S, d), C.overdue(S, d), C.freeNow(d), C.effRate(d)]));
  same('extra-debt order', 'order(S.debts).map(d => d.id)', S => C.order(S.debts).map(d => d.id));
  same('the split in use', '[sumPct(), fallbackPct(), customPct(), billsMonthly(), minsMonthly()]',
    S => [C.sumPct(S), C.fallbackPct(S), C.customPct(S), C.billsMonthly(S), C.minsMonthly(S)]);
  same('every entry, one at a time left out', 'S.moves.map(m => [savedNow(m.id), investedNow(m.id), poolBal(m.id), debtTotal(m.id)])',
    S => S.moves.map(m => [C.savedNow(S, m.id), C.investedNow(S, m.id), C.poolBal(S, m.id), C.debtTotal(S, m.id)]));
});

describe('due dates and bill ticks match the prototype', () => {
  same('bills for the next pay', 'billsFor(today(), addDays(today(), periodDays()))', S => C.billsFor(S, C.today(), C.addDays(C.today(), C.periodDays(S))));
  same('overdue bills', '[lateBills(today()), lateBills(addDays(today(), 20))]', S => [C.lateBills(S, C.today()), C.lateBills(S, C.addDays(C.today(), 20))]);
  same('bills due this pay', 'billsDueNow()', S => C.billsDueNow(S));
  same('each bill\'s tick', 'S.bills.map(b => [billNow(b), billPaidTo(b), billAmt(b)])', S => S.bills.map(b => [C.billNow(S, b), C.billPaidTo(S, b), C.billAmt(S, b)]));
  same('repayments due', 'S.debts.map(d => [repayIn(d, today(), addDays(today(), 14)), repayIn(d, addDays(today(), 14), addDays(today(), 45)), repayBase(d, today(), addDays(today(), 31)), instLeft(d, today())])',
    S => S.debts.map(d => [C.repayIn(S, d, C.today(), C.addDays(C.today(), 14)), C.repayIn(S, d, C.addDays(C.today(), 14), C.addDays(C.today(), 45)), C.repayBase(S, d, C.today(), C.addDays(C.today(), 31)), C.instLeft(d, C.today())]));
  same('ticking and unticking a bill', '(xs => xs.map(x => [tickBill(x.b.id, x.date), tickBill(x.b.id, x.date), tickBill(x.b.id, x.date)]).concat([S.bills, S.moves.filter(m => m.type === "bill")]))(billsDueNow())',
    S => (xs => xs.map(x => [C.tickBill(S, x.b.id, x.date), C.tickBill(S, x.b.id, x.date), C.tickBill(S, x.b.id, x.date)]).concat([S.bills, S.moves.filter(m => m.type === 'bill')]))(C.billsDueNow(S)), { fix: steady });
});

describe('the countdown matches the prototype', () => {
  same('levels', 'levels()', S => C.levels(S));
  same('cycles', '[cycles(), cycles(null, 250), planSpendM()]', S => [C.cycles(S), C.cycles(S, null, 250), C.planSpendM(S)]);
  same('costs', '[costs(), costs({ plan: true }), costs({ split: true })]', S => [C.costs(S), C.costs(S, { plan: true }), C.costs(S, { split: true })]);
  same('project', 'project()', S => C.project(S));
  same('project from the plan and from the split', '[project({ plan: true }), project({ split: true, fast: true })]', S => [C.project(S, { plan: true }), C.project(S, { split: true, fast: true })]);
  same('project with a lump and an extra entry', "[project({ lump: 500, fast: true }).fi, project({ add: { type: 'saved', amount: 300 } }).emFull, project({ add: { type: 'debt', amount: 300 } }).debtFree]",
    S => [C.project(S, { lump: 500, fast: true }).fi, C.project(S, { add: { type: 'saved', amount: 300 } }).emFull, C.project(S, { add: { type: 'debt', amount: 300 } }).debtFree]);
});

describe('how entries move the countdown matches the prototype', () => {
  const setBase = 'BASE_P = project(), METRIC = inDebtNow(BASE_P) ? "debt-free date" : "FI date"';
  same('every entry\'s effect', `(${setBase}, S.moves.map(m => [impactOf(m), overPart(m)]))`, S => { const P_ = C.project(S); return S.moves.map(m => [C.impactOf(S, P_, m), C.overPart(S, m)]); });
  same('what a new entry would do', `(${setBase}, [hypo('spend', 80), hypo('saved', 200), hypo('invested', 500), hypo('debt', 300, S.debts[0] && S.debts[0].id), METRIC])`,
    S => { const P_ = C.project(S); return [C.hypo(S, P_, 'spend', 80), C.hypo(S, P_, 'saved', 200), C.hypo(S, P_, 'invested', 500), C.hypo(S, P_, 'debt', 300, S.debts[0] && S.debts[0].id), C.metricOf(S, P_)]; });
  same('how long, in words', `(${setBase}, [0.4, 3, 13, 15, 40, 200, 800, Infinity, -Infinity, -20].map(d => [spanTxt(Math.abs(d)), impTxt(d), impShort(d)]).concat([null, 0, 0.3, 1, 5, 30, 90].map(whenTxt)))`,
    S => { const m = C.metricOf(S, C.project(S)); return [0.4, 3, 13, 15, 40, 200, 800, Infinity, -Infinity, -20].map(d => [C.spanTxt(S, Math.abs(d)), C.impTxt(S, d), C.impShort(S, d, m)]).concat([null, 0, 0.3, 1, 5, 30, 90].map(x => C.whenTxt(S, x))); });
});

describe('plans match the prototype', () => {
  const specProbe = sp => sp && [sp.pay(1000, 0), sp.pay(1000, 400), sp.pay(200, 2000), sp.pay(0, 0), sp.phases(800), sp.phases(0)];
  same('each plan', `['fi', 'debt', 'bal', 'tight', 'custom', 'yours', 'lean'].map(k => (sp => sp && [sp.pay(1000, 0), sp.pay(1000, 400), sp.pay(200, 2000), sp.pay(0, 0), sp.phases(800), sp.phases(0)])(specOf(k)))`,
    S => ['fi', 'debt', 'bal', 'tight', 'custom', 'yours', 'lean'].map(k => specProbe(C.specOf(S, k))));
  same('names and rules', "[owes(), myPlan(), PLANS.map(k => [ruleOf(k), planName(k)]), spendHist()]", S => [C.owes(S), C.myPlan(S), C.PLANS.map(k => [C.ruleOf(S, k), C.planName(S, k)]), C.spendHist(S)]);
  same('each plan\'s dates', "PLANS.map(k => (sp => sp && runPlan(sp, true))(specOf(k)))", S => C.PLANS.map(k => (sp => sp && C.runPlan(S, sp, true))(C.specOf(S, k))));
  same('the plans for a new pay', "[1400, 2600].map(a => payPlans(a, today()))", S => [1400, 2600].map(a => C.payPlans(S, a, C.today())), { fix: steady });
  same('the plans for a new pay with a custom split', "(PV.custom = { spend: 40, pot: 10, debt: 20, save: 10, invest: 20 }, [payPlans(1800, today()), PV.custom = null][0])",
    S => C.payPlans(S, 1800, C.today(), { spend: 40, pot: 10, debt: 20, save: 10, invest: 20 }), { fix: steady });
  same('a split on a new pay', "evalPlan({ spend: 30, pot: 10, debt: 30, save: 10, invest: 20 }, 1500, today())", S => C.evalPlan(S, { spend: 30, pot: 10, debt: 30, save: 10, invest: 20 }, 1500, C.today()), { fix: steady });
});

describe('stacking a pay matches the prototype', () => {
  same('makeStack for a few amounts and dates', "[300, 1385.2, 2600, 5000].map(a => makeStack(a, addDays(today(), -2))).concat([makeStack(1400, today(), undefined, 80, { spend: 20, pot: 0, debt: 50, save: 10, invest: 20 }, pvMore(today()))])",
    S => [300, 1385.2, 2600, 5000].map(a => C.makeStack(S, a, C.addDays(C.today(), -2))).concat([C.makeStack(S, 1400, C.today(), undefined, 80, { spend: 20, pot: 0, debt: 50, save: 10, invest: 20 }, C.pvMore(S, C.today()))]), { fix: steady });
  same('plan vs what you did, for every stacked pay', 'S.stacks.map(s => stackItems(s))', S => S.stacks.map(s => C.stackItems(S, s)));
  same('this pay, as it stands', 'S.stacks.map(s => payNow(s))',
    S => S.stacks.map(s => (N => Object.assign(N, { done: N.done.map(o => Object.assign(o, { c: `var(--c-${o.c})` })), sugs: N.sugs.map(o => Object.assign(o, { c: `var(--c-${o.c})` })) }))(C.payNow(S, s))));
  same('what the last pay leaves the next', "[today(), addDays(today(), 3)].map(d => [leftover(d), missedOf(d), heldOf(d), pvMore(d)])", S => [C.today(), C.addDays(C.today(), 3)].map(d => [C.leftover(S, d), C.missedOf(S, d), C.heldOf(S, d), C.pvMore(S, d)]));
  same('habits', '[habit(), budgetStreak(), overStreak()]', S => [C.habit(S), C.budgetStreak(S), C.overStreak(S)]);
  same('re-stacking the pay you\'re in', '(restack(), S.stacks)', S => (C.restack(S), S.stacks), { fix: steady });
  same('stacking a pay, on your plan and on another', "[stackPay(1500, today(), 0, null, pvMore(today())), stackPay(900, today(), 0, { k: 'fi', spec: specOf('fi') }, pvMore(today())), S.moves, S.stacks]",
    S => [C.stackPay(S, 1500, C.today(), 0, null, C.pvMore(S, C.today())), C.stackPay(S, 900, C.today(), 0, { k: 'fi', spec: C.specOf(S, 'fi') }, C.pvMore(S, C.today())), S.moves, S.stacks], { fix: steady });
  same('Mark all done', '[S.stacks.map(s => didAll(s.id, s !== latestStack())), S.moves, S.bills]', S => [S.stacks.map(s => C.didAll(S, s.id, s !== C.latestStack(S))), S.moves, S.bills], { fix: steady });
});

describe('accounts and transfers match the prototype', () => {
  same('names', "['pay', 'buffer', 'pool', 'inv', 'card', 'ext'].concat(S.debts.map(d => 'd:' + d.id)).map(k => [nameOf(k), roleOf(k), acctName(k)])",
    S => ['pay', 'buffer', 'pool', 'inv', 'card', 'ext'].concat(S.debts.map(d => 'd:' + d.id)).map(k => [C.nameOf(S, k), C.roleOf(S, k), C.acctName(S, k)]));
  same('purchases as unlocks', '(U => [U, U.items.map(etaTxt)])(unlocks())', S => (U => [U, U.items.map(C.etaTxt)])(C.unlocks(S)));
  const routes = "[['pay', 'buffer'], ['pay', 'card'], ['card', 'd:DEBT'], ['buffer', 'pool'], ['pool', 'inv'], ['inv', 'pay'], ['ext', 'buffer'], ['pay', 'd:DEBT']]";
  same('what a transfer records, and does to net worth', `${routes}.map(([f, t]) => (recs => [recs, nwDelta(recs)])(moveRecs(f, t.replace('DEBT', (S.debts[2] || S.debts[0] || { id: 'x' }).id), 125.5, today(), 'Note')))`,
    S => JSON.parse(routes.replace(/'/g, '"')).map(([f, t]) => (recs => [recs, C.nwDelta(S, recs)])(C.moveRecs(S, f, t.replace('DEBT', (S.debts[2] || S.debts[0] || { id: 'x' }).id), 125.5, C.today(), 'Note'))), { fix: steady, only: S => !!C.walletCard(S) });
  same('where each to-do goes', 'S.stacks.map(s => stackItems(s).todos.map(todoTo))', S => S.stacks.map(s => C.stackItems(S, s).todos.map(i => C.todoTo(S, i))));
  same('buying from Savings, and a pay-in-4 buy', "(() => { const b = S.buys[0]; if (b) buySpend(b, 500, today(), 'Big buy', true); const d = S.debts.find(x => x.in4); if (d) { const m = { id: 'q1', t: 5, date: today(), amount: 300, type: 'spend', credit: d.id, src: 'manual' }; S.moves.push(m); in4Buy(d, m, 75); } return [S.moves, S.debts, S.buys, payStillIn()]; })()",
    S => { const b = S.buys[0]; if (b) C.buySpend(S, b, 500, C.today(), 'Big buy', true); const d = S.debts.find(x => x.in4); if (d) { const m = { id: 'q1', t: 5, date: C.today(), amount: 300, type: 'spend', credit: d.id, src: 'manual' }; S.moves.push(m); C.in4Buy(S, d, m, 75); } return [S.moves, S.debts, S.buys, C.payStillIn(S)]; }, { fix: steady });
});

describe('rank and goals match the prototype', () => {
  it('tiers', () => {
    const vs = [-5432.1, -1000, -999.99, -0.01, 0, 999, 1000, 9999.99, 10000, 12499, 12500, 26000, 49999, 50000, 61000, 9.99e6];
    expect(json(vs.map(C.tierOf))).toEqual(P.run(`${JSON.stringify(vs)}.map(tierOf)`));
    expect([-3, -1, 0, 1, 15, 30].map(i => [C.idxName(i), C.idxStart(i)])).toEqual(P.run('[-3, -1, 0, 1, 15, 30].map(i => [idxName(i), idxStart(i)])'));
    expect(vs.map(v => C.tierStarts(v, 6))).toEqual(P.run(`${JSON.stringify(vs)}.map(v => tierStarts(v, 6))`));
  });
  same('rank now', '[rankNW(), bestNW(), flowsSince(0), S.rank ? flowsSince(S.rank.t) : null]', S => [C.rankNW(S), C.bestNW(S), C.flowsSince(S, 0), S.rank ? C.flowsSince(S, S.rank.t) : null]);
  same('when net worth gets there', '(P => [-500, 0, 1000, 5000, 50000].map(v => etaNW(P, v)))(project())', S => (P_ => [-500, 0, 1000, 5000, 50000].map(v => C.etaNW(P_, v)))(C.project(S)));
  same('pay day: medals, then settling', '(pre => [pre, (stackPay(1400, today()), settleRank(pre)), S.rank, S.best, S.settles])(preSettle())',
    S => (pre => [pre, (C.stackPay(S, 1400, C.today()), C.settleRank(S, pre)), S.rank, S.best, S.settles])(C.preSettle(S)), { fix: steady });
  same('a debt cleared, a goal reached', "(() => { delete S.credOwed; checkRank(); S.debts.forEach(d => { d.balance = 0; d.asOf = { date: today(), t: Date.now() + 9e6 }; }); checkRank(); return [S.credOwed, S.rkOwing, S.goals, S.rank]; })()",
    S => { delete S.credOwed; C.checkRank(S); S.debts.forEach(d => { d.balance = 0; d.asOf = { date: C.today(), t: Date.now() + 9e6 }; }); const r = C.checkRank(S); return [S.credOwed, S.rkOwing, S.goals, S.rank]; }, { fix: steady });
  same('what moved it this pay', 'movedIt(7)', S => C.movedIt(S, 7));
  same('goals', '(S.goals || []).map(g => [goalVal(g), goalName(g), goalRate(g), goalNow(g), whenPays(goalNow(g).pays)])',
    S => (S.goals || []).map(g => [C.goalVal(S, g), C.goalName(g), C.goalRate(S, g), C.goalNow(S, g), C.whenPays(S, C.goalNow(S, g).pays)]));
});

describe('saved data matches the prototype', () => {
  it('blank', () => { expect(C.blank()).toEqual(P.run('blank()')); });
  it('the sample data', () => {
    P.run('(loadSample(), 0)');
    expect(steady(C.sampleState())).toEqual(steady(P.getState()));
  });
  it('the sample data, then a pay day', () => {
    P.run('(loadSample(), 0)');
    const S = C.sampleState(), pay = S => C.stackPay(S, 1400, C.today(), 0, null, C.pvMore(S, C.today()));
    // Its rank was placed after the first pay, so the pays after it count in the tally.
    expect(S.moves.filter(m => m.type === 'pay').sort((a, b) => a.t - b.t).slice(1).every(m => m.t > S.rank.t)).toBe(true);
    const mine = (pre => (pay(S), C.settleRank(S, pre)))(C.preSettle(S));
    expect(steady(mine)).toEqual(steady(P.run('(pre => (stackPay(1400, today(), 0, null, pvMore(today())), settleRank(pre)))(preSettle())')));
  });
  it('bringing old data up to date', () => {
    // Data the way the first version of this app (and older prototypes) saved it: a 4-part split, imported bank lines,
    // stacks without plans or Savings, a card called Card and an Afterpay.
    const t = C.today(), d = n => C.addDays(t, n), old = {
      v: 4, pay: 1385.2, freq: 'fortnight', pct: { spend: 25, debt: 60, save: 10, invest: 5 }, rules: [{ key: 'salary', pos: true, type: 'pay', ref: null }], seen: ['abc'],
      bills: [{ id: 'b1', name: 'Phone', amount: 45, every: 'month', due: d(-40) }, { id: 'b2', name: 'Board', amount: 120, every: 'week' }],
      debts: [{ id: 'd1', name: 'Card', card: true, limit: 1000, balance: 600, rate: 0, min: 0, asOf: { date: d(-30), t: 0 } },
        { id: 'd2', name: 'Afterpay', card: true, limit: 800, balance: 300, rate: 0, min: 325, minAmt: 150, minEvery: 'fortnight', asOf: { date: d(-30), t: 0 } },
        { id: 'd3', name: 'Fine', balance: 200, rate: 0, min: 200, minAmt: 200, due: d(5), asOf: { date: d(-30), t: 0 } }],
      buys: [], startSaved: 300, startInvested: 0, savedAsOf: null, investedAsOf: null, emMonths: 3, ret: 6, wr: 4, sample: false,
      moves: [{ id: 'm1', t: 1, date: d(-10), amount: 1385.2, type: 'pay', note: 'Pay', src: 'import', stack: 's1' },
        { id: 'm2', t: 2, date: d(-9), amount: 45, type: 'bill', note: 'Phone', src: 'import' }, { id: 'm3', t: 3, date: d(-8), amount: 20, type: 'skip', note: 'Refund', src: 'import' },
        { id: 'm4', t: 4, date: d(-8), amount: 60, type: 'spend', note: 'Fuel', src: 'import' }, { id: 'm5', t: 5, date: d(-7), amount: 50, type: 'spend', from: 'buffer', note: 'From buffer', src: 'manual' }],
      stacks: [{ id: 's1', t: 1, date: d(-10), amount: 1385.2, plan: { bills: 525, buys: 0, buyNames: [], spend: 210, debts: { d2: 150 }, save: 100, invest: 20, pots: { x: 40 } }, short: 0, spare: 0, potsDone: true }],
    };
    P.setState(old);
    expect(steady(C.normalize(clone(old)))).toEqual(steady(P.run('(normalize(), S)')));
  });
});
