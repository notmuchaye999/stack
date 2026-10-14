// The rewrite must give the same answers as the prototype. Each check runs one function in the prototype
// (inside a fake browser) and in the new core, on the same saved state, and compares the results.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadPrototype } from './helpers/prototype.js';
import { buildStates } from './helpers/states.js';
import * as B from '../app/src/core/balances.js';
import { today } from '../app/src/core/util.js';

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
