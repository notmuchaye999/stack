// The rewrite must give the same answers as the prototype. Each check runs one function in the prototype
// (inside a fake browser) and in the new core, on the same saved state, and compares the results.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadPrototype } from './helpers/prototype.js';
import { buildStates } from './helpers/states.js';
import * as B from '../app/src/core/balances.js';
import { today } from '../app/src/core/util.js';
import * as P_util from '../app/src/core/util.js';
import * as P_ from '../app/src/core/projection.js';
import * as St from '../app/src/core/stages.js';
import * as K from '../app/src/core/stacks.js';
import * as CSV from '../app/src/core/csv.js';
import * as Cat from '../app/src/core/categorize.js';
import { sampleState, sampleCSV } from '../app/src/core/sample.js';
import { readFileSync } from 'node:fs';

const json = v => JSON.parse(JSON.stringify(v ?? null));
let P, states;
beforeAll(() => { P = loadPrototype(); states = buildStates(P); });
afterAll(() => P.close());

/** Runs `expr` in the prototype and `fn` in the new code for every test state. */
function same(name, expr, fn) {
  it(name, () => {
    for (const [label, S] of Object.entries(states)) {
      P.setState(S);
      const old = P.run(expr), mine = json(fn(JSON.parse(JSON.stringify(S))));
      expect(mine, `${name} on "${label}"`).toEqual(old);
    }
  });
}

describe('balances match the prototype', () => {
  same('savedNow / investedNow / netWorth', '[savedNow(), investedNow(), debtTotal(), netWorth()]',
    S => [B.savedNow(S), B.investedNow(S), B.debtTotal(S), B.netWorth(S)]);
  same('each debt now', 'S.debts.map(d => debtNow(d))', S => S.debts.map(d => B.debtNow(S, d)));
  same('extra-debt order', 'order(S.debts).map(d => d.id)', S => B.order(S.debts).map(d => d.id));
  same('split in use', 'effPct()', S => B.effPct(S));
  same('planned buys', 'openBuys().map(b => [b.id, buyLeft(b), buyPerPay(b, today())]).concat([buysM()])',
    S => B.openBuys(S).map(b => [b.id, B.buyLeft(S, b), B.buyPerPay(S, b, today())]).concat([B.buysM(S)]));
});

describe('the countdown matches the prototype', () => {
  same('levels', 'levels()', S => P_.levels(S));
  same('cycles', '[cycles(), cycles(null, 250)]', S => [P_.cycles(S), P_.cycles(S, null, 250)]);
  same('costs', '[costs(), costs({ plan: true })]', S => [P_.costs(S), P_.costs(S, { plan: true })]);
  same('project', 'project()', S => P_.project(S));
  same('project from the plan', 'project({ plan: true })', S => P_.project(S, { plan: true }));
  same('every entry\'s effect on the FI date', 'S.moves.map(m => impactOf(m, project().fi))',
    S => S.moves.map(m => P_.impactOf(S, m, P_.project(S).fi)));
  same('what a new entry would do', "(BASE = project().fi, [hypo('spend', 80), hypo('saved', 200), hypo('invested', 500), hypo('debt', 300, S.debts[0] && S.debts[0].id)])",
    S => { const b = P_.project(S).fi; return [P_.hypo(S, 'spend', 80, null, b), P_.hypo(S, 'saved', 200, null, b), P_.hypo(S, 'invested', 500, null, b), P_.hypo(S, 'debt', 300, S.debts[0] && S.debts[0].id, b)]; });
});

describe('stages and the suggested split match the prototype', () => {
  same('stageInfo', '(st => Object.assign(st, { color: st.color.replace("var(--c-", "").replace(")", "") }))(stageInfo(project()))',
    S => { const { tone: t, ...st } = St.stageInfo(S, P_.project(S)); return Object.assign(st, { color: t }); });
  same('suggest', 'suggest(stageInfo(project()))', S => St.suggest(S, St.stageInfo(S, P_.project(S))));
  same('suggest for every stage', '[1,2,3,4,5].map(n => suggest({ n }))', S => [1, 2, 3, 4, 5].map(n => St.suggest(S, { n })));
});

describe('stacking a pay matches the prototype', () => {
  const noIds = s => s && Object.assign({}, s, { id: 'x', t: 0 });
  same('makeStack for a few amounts and dates',
    "[300, 1385.2, 2600, 5000].map(a => (s => Object.assign(s, { id: 'x', t: 0 }))(makeStack(a, addDays(today(), -2))))",
    S => [300, 1385.2, 2600, 5000].map(a => noIds(K.makeStack(S, a, P_util.addDays(P_util.today(), -2)))));
  same('plan vs what you did, for every stacked pay',
    'S.stacks.map(s => (({ todos, spent, doneN, complete }) => ({ todos, spent, doneN, complete }))(stackItems(s)))',
    S => S.stacks.map(s => (({ todos, spent, doneN, complete }) => ({ todos, spent, doneN, complete }))(K.stackItems(S, s))));
});

describe('reading CSV statements matches the prototype', () => {
  it('every bank fixture and the sample statement', () => {
    const texts = ['commbank', 'westpac', 'nab', 'ing'].map(b => readFileSync(new URL(`./fixtures/${b}.csv`, import.meta.url), 'utf8'));
    texts.push(P.run('sampleCSV()'));
    for (const t of texts) expect(CSV.readStatement(t)).toEqual(P.run(`readStatement(${JSON.stringify(t)})`));
  });
});

describe('statement import matches the prototype', () => {
  const texts = () => ['commbank', 'westpac', 'nab', 'ing'].map(b => readFileSync(new URL(`./fixtures/${b}.csv`, import.meta.url), 'utf8')).concat([P.run('sampleCSV()')]);
  it('labels, dedupe and the review rows', () => {
    for (const [label, S] of Object.entries(states)) for (const t of texts()) {
      P.setState(S);
      const old = P.run(`prepImport(readStatement(${JSON.stringify(t)}))`);
      expect(Cat.prepImport(JSON.parse(JSON.stringify(S)), CSV.readStatement(t)), label).toEqual(old);
    }
  });
  it('the sample statement and sample data', () => {
    expect(sampleCSV()).toBe(P.run('sampleCSV()'));
    // Ids are random, so swap them for their order of appearance before comparing.
    const strip = S => {
      let txt = JSON.stringify(S), n = 0;
      const ids = [...S.bills, ...S.debts, ...S.buys, ...S.stacks, ...S.moves].map(x => x.id);
      for (const id of ids) txt = txt.split(`"${id}"`).join(`"id${n++}"`);
      const o = JSON.parse(txt); o.stacks.forEach(s => { s.t = 0; }); return o;
    };
    P.run('(loadSample(), 0)');
    expect(strip(sampleState())).toEqual(strip(P.getState()));
  });
});
