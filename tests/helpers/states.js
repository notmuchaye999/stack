// Realistic money situations, built with the prototype's own functions (its sample data, transfers, bill ticks,
// pay-in-4 buys…) so the parity tests compare old and new code on exactly the same data.

/** Builds every test state inside the prototype. Each one ends the way a redraw leaves it: the pay you're in re-stacked. */
export function buildStates(P) {
  const out = {};
  P.run('loadSample()');
  const sample = P.getState();
  /** A state made from another one by running some prototype code on it. */
  const from = (base, code = '') => { P.setState(base); P.run(`((() => { ${code}; restack(); })(), 0)`); return P.getState(); };
  /** A state made from nothing. */
  const fresh = code => { P.run(`((() => { S = blank(); REV++; ${code}; restack(); })(), 0)`); return P.getState(); };
  const asOf = n => `{ date: addDays(today(), ${n}), t: 0 }`;

  out.sample = sample;
  out.blank = P.run('blank()');
  // Bills, debts and purchases set, but no pays yet: no countdown.
  out.noPays = from(sample, 'S.moves = []; S.stacks = []; delete S.rank; delete S.best; delete S.credOwed; delete S.rkOwing');
  // Spending way past the card budget in the pay you're in.
  out.overspend = from(sample, "S.moves.push({ id: 'x1', t: Date.now(), date: today(), amount: 900, type: 'spend', note: 'Big night', src: 'manual' })");
  // No everyday card: spending money stays in Pay.
  out.noWallet = from(sample, 'S.debts[0].wallet = false; S.debts[1].viaWallet = false');
  // A pay-in-4 purchase on Afterpay: first payment now, 3 more in the plan.
  out.in4 = from(sample, "const m = { id: 'x2', t: Date.now(), date: today(), amount: 240, type: 'spend', credit: S.debts[1].id, note: 'Shoes', src: 'manual' }; S.moves.push(m); in4Buy(S.debts[1], m, 60)");
  // An urgent one-off (a fine) past its date, and one not due yet.
  out.urgent = from(sample, `S.debts.push({ id: 'fine', name: 'Fine', balance: 300, rate: 0, min: 300, minAmt: 300, minEvery: 'month', due: addDays(today(), -3), od: false, free: false, until: null, urgent: true, asOf: ${asOf(-40)} })`);
  out.urgentSoon = from(sample, `S.debts.push({ id: 'fine', name: 'Fine', balance: 300, rate: 0, min: 300, minAmt: 300, minEvery: 'month', due: addDays(today(), 10), od: false, free: false, until: null, urgent: true, asOf: ${asOf(-40)} })`);
  // A fixed loan (repayments only) with interest.
  out.fixed = from(sample, 'S.debts[2].set = true; S.debts[2].rate = 12');
  // An overdrawn account and a credit card with interest and a due date.
  out.od = from(sample, `S.debts.push({ id: 'od', name: 'Everyday', balance: 640, rate: 0, min: 0, od: true, asOf: ${asOf(-20)} }, { id: 'cc', name: 'Visa', balance: 2400, rate: 19.99, min: 60, minAmt: 60, minEvery: 'month', due: addDays(today(), 9), asOf: ${asOf(-20)} })`);
  // Interest-free until a date that's coming up, with late interest after.
  out.freeEnding = from(sample, `S.debts.push({ id: 'bnpl', name: 'Zip', balance: 1500, rate: 22, min: 50, minAmt: 50, minEvery: 'month', free: true, until: addDays(today(), 45), asOf: ${asOf(-10)} })`);
  // Direct debits, a quarterly bill being saved up, a bill gone overdue.
  out.bills = from(sample, "S.bills.push({ id: 'gym', name: 'Gym', amount: 30, every: 'fortnight', auto: true }, { id: 'water', name: 'Water', amount: 180, every: 'quarter', due: addDays(today(), 40) }, { id: 'power', name: 'Power', amount: 210, every: 'month', due: addDays(today(), -20) }, { id: 'net', name: 'Internet', amount: 75, every: 'month', due: addDays(today(), 2), auto: true }); S.stacks.forEach(s => { delete s.late; })");
  out.ticked = from(out.bills, 'billsDueNow().filter(x => !x.auto).slice(0, 2).forEach(x => tickBill(x.b.id, x.date))');
  // Money moved around: past the plan into the Buffer, a debt paid from the Buffer, Afterpay paid off the card.
  out.parked = from(sample, "S.moves.push(...moveRecs('pay', 'buffer', 300, today(), 'Buffer'))");
  out.fromBuffer = from(sample, "S.moves.push(...moveRecs('buffer', 'd:' + S.debts[2].id, 100, today(), 'Snap-On'))");
  out.cardPays = from(sample, "S.moves.push(...moveRecs('card', 'd:' + S.debts[1].id, 150, today(), 'Afterpay'))");
  out.xout = from(sample, "S.moves.push(...moveRecs('inv', 'pay', 200, today(), 'Cash out'))");
  out.market = from(sample, "S.moves.push({ id: 'mk', t: Date.now(), date: today(), amount: -120, type: 'mkt', note: 'Market down', src: 'manual' }, { id: 'ex1', t: Date.now() + 1, date: today(), amount: 50, type: 'saved', from: 'ext', note: 'Buffer', src: 'manual' })");
  // Savings with a starting balance, a purchase bought from it (and past it), and one that's a rank reward.
  out.pool = from(sample, `S.startPool = 300; S.poolAsOf = ${asOf(-30)}; S.buys[2].at = 3000; buySpend(S.buys[1], 280, today(), 'Tools', true)`);
  // Each plan.
  out.planFI = from(sample, "S.plan = 'fi'");
  out.planDebt = from(sample, "S.plan = 'debt'");
  out.planTight = from(sample, "S.plan = 'tight'");
  // The pay you're in stacked on FI just for this pay.
  out.oneOff = from(sample, "const s = latestStack(), n = makeStack(s.amount, s.date, s.id, s.carry || 0, specOf('fi'), carriedOf(s)); Object.assign(s, { plan: n.plan, short: n.short, spare: n.spare, pk: 'fi', one: true, pct: Object.assign({}, n.pc) })");
  out.weekly = from(sample, "S.freq = 'week'");
  out.monthly = from(sample, "S.freq = 'month'");
  out.goals = from(sample, "S.goals = [{ id: 'g1', amount: 2000, kind: 'saved', by: addDays(today(), 120) }, { id: 'g2', amount: 10000, kind: 'inv', by: null }, { id: 'g3', amount: 100, kind: 'saved', by: null }]");
  // Accounts named the way the bank names them, and Pay's balance set.
  out.names = from(sample, `S.names = { pay: 'Everyday', buffer: 'Rainy day', pool: 'Goals', inv: 'Shares' }; S.payAcct = { start: 812.4, asOf: ${asOf(-2)} }`);
  // Bills bigger than the pay: short.
  out.short = from(sample, "S.bills.push({ id: 'rent', name: 'Rent', amount: 1500, every: 'fortnight' })");
  // The pay ran out 2 days ago and nothing new is stacked: what a new pay would carry in.
  const shift = n => `S.moves.forEach(m => { m.date = addDays(m.date, ${n}); }); S.stacks.forEach(s => { s.date = addDays(s.date, ${n}); }); S.bills.forEach(b => { if (b.due) b.due = addDays(b.due, ${n}); }); if (S.rank) S.rank.date = addDays(S.rank.date, ${n});`;
  out.stale = from(sample, shift(-16));
  out.staleParked = from(out.stale, "S.moves.push(...moveRecs('pay', 'pool', 120, addDays(latestStack().date, 1), 'Savings'))");
  // Made from nothing: a first pay on Debt-free with a rent bill and a car loan.
  out.firstPay = fresh(`S.bills.push({ id: 'b1', name: 'Rent', amount: 400, every: 'week' }, { id: 'b2', name: 'Phone', amount: 50, every: 'month', due: addDays(today(), 12) });
    S.debts.push({ id: 'd1', name: 'Car loan', balance: 8000, rate: 9.5, min: 350, minAmt: 350, minEvery: 'month', due: addDays(today(), 20), asOf: ${asOf(-1)} });
    S.plan = 'debt'; S.walletV = 1; S.tagsV = 1; S.potV = 1; S.billV = 1; S.in4V = 1; S.planV = 1; stackPay(2100, addDays(today(), -3))`);
  // No debts, steady pays and some investing: the FI path.
  out.debtFree = fresh(`S.bills.push({ id: 'b1', name: 'Rent', amount: 1600, every: 'month', due: addDays(today(), 5) }); S.plan = 'debt';
    S.startSaved = 9000; S.savedAsOf = ${asOf(-60)}; S.startInvested = 40000; S.investedAsOf = ${asOf(-60)}; S.walletV = 1; S.tagsV = 1; S.potV = 1; S.billV = 1; S.in4V = 1; S.planV = 1;
    [-42, -28, -14, -1].forEach(o => stackPay(3200, addDays(today(), o)))`);
  out.fiReached = from(out.debtFree, 'S.startInvested = 2e6');
  return out;
}
