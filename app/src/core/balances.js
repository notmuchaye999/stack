// @ts-check
/* Where your money stands right now, worked out from what you've entered. Every function takes the saved
   state S first, so nothing hides in a global. */
import { BK, FREQ, DPM, today, parseISO, sortMoves } from './util.js';
import { latestStack, stackItems } from './stacks.js';

/** @import { State, Debt, Move, Buy, AsOf, Every, PayStack, Split } from './state.js' */

/** Pays per year. @param {State} S */
export const ppy = S => FREQ[S.freq].n;
/** An amount paid every week/fortnight/… as a monthly amount. @param {number} amt @param {Every} every */
export const monthly = (amt, every) => amt * FREQ[every].n / 12;
/** @param {State} S */
export const sumPct = S => BK.reduce((s, k) => s + (S.pct[k] || 0), 0);
/** @param {State} S */
export const billsMonthly = S => S.bills.reduce((s, b) => s + monthly(b.amount, b.every), 0);
/** @param {State} S */
export const minsMonthly = S => S.debts.reduce((s, d) => s + (debtNow(S, d) > 0.005 ? d.min : 0), 0);
/** Buffer: months of bills plus debt repayments. A debt counts only up to what's left on it, so one that's nearly paid off
 *  doesn't inflate it. Spending isn't in it, so it doesn't jump around with what you spend. @param {State} S */
export const bufferT = S => billsMonthly(S) * S.emMonths + S.debts.reduce((s, d) => { const o = debtNow(S, d); return o > 0.005 ? s + Math.min(d.min * S.emMonths, o) : s; }, 0);
/** Split used before you've set one: a little extra on debt if there is any, investing at least double the buffer.
 *  @param {State} S @returns {Split} */
export const fallbackPct = S => {
  const debt = S.debts.some(d => !d.set && debtPlan(S, d) > 0.005) ? 10 : 0, r = 70 - debt, save = savedNow(S) < bufferT(S) - 0.005 ? 5 * Math.floor(r / 15) : 0;
  return { spend: 30, pot: 0, debt, save, invest: r - save };
};
/** Custom: your split as you set it, or the starting one until you do. @param {State} S */
export const customPct = S => sumPct(S) > 0 ? S.pct : fallbackPct(S);

/** Did this entry happen after the balance was last set? @param {AsOf | null | undefined} asOf @param {Move} m */
export const after = (asOf, m) => !asOf || m.date > asOf.date || (m.date === asOf.date && m.t > asOf.t);
/** Total of one type of entry. ex leaves one entry out (for "with vs without it"). f filters further.
 *  @param {State} S @param {string} type @param {string | null | undefined} [ex] @param {(m: Move) => boolean} [f] */
export const sumType = (S, type, ex, f) => S.moves.reduce((s, m) => m.type === type && m.id !== ex && (!f || f(m)) ? s + m.amount : s, 0);

/* The Buffer and investments are the balance you set plus everything recorded since. */
/** @param {State} S @param {string | null} [ex] */
export const savedNow = (S, ex) => S.startSaved + sumType(S, 'saved', ex, m => after(S.savedAsOf, m)) - sumType(S, 'spend', ex, m => m.from === 'buffer' && after(S.savedAsOf, m)) - sumType(S, 'xout', ex, m => m.acct === 'buffer' && after(S.savedAsOf, m));
/** Investments: what you put in, plus what the market did (recorded when you update the balance). @param {State} S @param {string | null} [ex] */
export const investedNow = (S, ex) => S.startInvested + sumType(S, 'invested', ex, m => after(S.investedAsOf, m)) + sumType(S, 'mkt', ex, m => after(S.investedAsOf, m)) - sumType(S, 'xout', ex, m => m.acct === 'inv' && after(S.investedAsOf, m));

/* A credit can sit above its limit (in credit), so its raw balance can go below 0. The everyday card is where card money
   gets spent, so those spends land on it as well. */
/** @param {Debt | null | undefined} d */
export const isWallet = d => !!(d && d.card && d.wallet);
/** @param {State} S */
export const walletCard = S => S.debts.find(isWallet);
/** @param {State} S @param {Debt} d @param {string | null} [ex] */
export const rawOwed = (S, d, ex) => d.balance - sumType(S, 'debt', ex, m => m.ref === d.id && after(d.asOf, m)) + sumType(S, 'spend', ex, m => (m.credit === d.id || (isWallet(d) && isCard(m))) && after(d.asOf, m));
/** What your bank says you owe on it. @param {State} S @param {Debt} d @param {string | null} [ex] */
export const debtNow = (S, d, ex) => Math.max(0, rawOwed(S, d, ex));
/** Spends on your card money: not from Savings, the buffer or credit. @param {Move} m */
export const isCard = m => m.type === 'spend' && !m.buy && !m.credit && m.from !== 'buffer' && m.from !== 'pool';
/** Money moved from Savings, the buffer or investments was already yours: it never counts as this pay's money. @type {(string | undefined)[]} */
export const OTHER = ['pool', 'buffer', 'inv'];
/** From somewhere else (ext): new money, not this pay's, so it never counts as moved from the pay. @param {Move} m */
export const ownMove = m => !OTHER.includes(m.from) && m.from !== 'ext';
/* The everyday card as the plan sees it. This pay's card money (and repayments paid from the card) counts as spent once it's
   loaded, so topping up and then spending it doesn't move the debt numbers: loading spending money isn't paying the debt
   off. Only what goes past the plan moves them. Spending and extra payments off the card share this pay's spending money
   (less anything moved past the plan straight from the pay, the way Home shows it). Planned payments off the card
   (Afterpay, say) were planned, so they don't count against it. */
/** @param {State} S @param {Debt} d @param {string | null} [ex] */
export function walletLoad(S, d, ex) {
  const stk = latestStack(S); if (!stk) return { T: 0, B: 0, Sc: 0, cB: 0, X: 0, P: 0 };
  // Card money still on it from the last pay counts as already loaded.
  const I = stackItems(S, stk, ex), B = I.load;
  let T = I.carry, Sc = 0;
  S.moves.forEach(m => {
    if (!I.inP(m)) return;
    if (m.type === 'debt' && m.ref === d.id && ownMove(m)) T += m.amount;
    else if (isCard(m)) Sc += m.amount;
  });
  return { T, B, Sc, cB: cardBudget(stk) - I.overPay, X: I.over - I.overPay, P: I.cardPlan };
}
/** Spending money that went somewhere else (moved off the pay) was never on the card, so it can't add to what the card owes.
 *  @param {State} S @param {Debt} d @param {string | null} [ex] */
export const walletAdj = (S, d, ex) => { if (!isWallet(d)) return 0; const L = walletLoad(S, d, ex); return Math.min(L.T, L.B) - Math.min(L.Sc + L.X, Math.max(0, L.cB)) - L.P; };
/** What the card's own balance and the debt it counts as differ by: money on it for this pay (above 0), or spent before topping up. @param {State} S @param {Debt} d */
export const holdAmt = (S, d) => isWallet(d) ? walletAdj(S, d) : 0;
/** What you owe on it as the plan sees it. @param {State} S @param {Debt} d @param {string | null} [ex] */
export const debtPlan = (S, d, ex) => Math.max(0, rawOwed(S, d, ex) + walletAdj(S, d, ex));
/* Credit: anything with a limit (Card, Afterpay). Back to the limit is the goal; with Lock on, it's last-resort money after that. */
/** @param {State} S */
export const credits = S => S.debts.filter(d => d.card);
/** @param {State} S @param {Debt} d */
export const cardAvail = (S, d) => (d.limit || 0) - rawOwed(S, d);
/** @param {Debt} d */
export const lockOn = d => !!d.card && d.lock !== false;
/** @param {State} S @param {Debt} d */
export const cardLocked = (S, d) => lockOn(d) && rawOwed(S, d) <= 0.005;

/* One keyword per debt. Urgent: a hard deadline, paid in full by its date and first in line. Focus: gets the extra.
   Fixed: scheduled payments only, never extra. Steady: minimums until it's next in line. */
export const TAGS = /** @type {const} */ (['urgent', 'focus', 'fixed', 'steady']);
export const TAGN = { urgent: 'Urgent', focus: 'Focus', fixed: 'Fixed', steady: 'Steady' };
/** @param {Debt} d @returns {typeof TAGS[number]} */
export const tagOf = d => d.urgent ? 'urgent' : d.focus ? 'focus' : d.set ? 'fixed' : 'steady';
/** Only one debt can be Focus. @param {State} S @param {Debt} d @param {string} t */
export function setTag(S, d, t) { if (t === 'focus') S.debts.forEach(x => { if (x !== d) x.focus = false; }); Object.assign(d, { urgent: t === 'urgent', focus: t === 'focus', set: t === 'fixed' }); }

/** @param {State} S @param {string | null} [ex] */
export const debtTotal = (S, ex) => S.debts.reduce((s, d) => s + debtPlan(S, d, ex), 0);
/** What your bank says you owe, all together. @param {State} S */
export const bankOwed = S => S.debts.reduce((s, d) => s + debtNow(S, d), 0);
/** Net worth's debts: a card in credit is money you hold. @param {State} S */
export const owedNW = S => S.debts.reduce((a, d) => a + (d.card ? rawOwed(S, d) : debtNow(S, d)), 0);
/** Net worth: every account, Pay included, less what your bank says you owe. @param {State} S */
export const netWorth = S => payAcctBal(S) + savedNow(S) + poolBal(S) + investedNow(S) - owedNW(S);
/** @param {State} S @param {string | null | undefined} id */
export const debtName = (S, id) => { const d = S.debts.find(x => x.id === id); return d ? d.name : 'Debt'; };

/* Interest-free while paid on time, until an optional end date. */
/** @param {{ free?: boolean, until?: string | null }} d */
export const freeNow = d => !!d.free && (!d.until || d.until > today());
/** The rate that actually applies today. @param {{ free?: boolean, until?: string | null, rate: number }} d */
export const effRate = d => freeNow(d) ? 0 : d.rate;
/* Who gets extra money first: urgent debts, the debt you chose to focus on, then overdrawn accounts and credit, then whatever's
   charging the most interest, then interest-free debts whose free period ends soonest. */
/** @param {{ free?: boolean, until?: string | null }} d */
const untilKey = d => d.free && d.until ? parseISO(d.until).getTime() : Infinity;
/** @template {{ urgent?: boolean, focus?: boolean, od?: boolean, card?: boolean, free?: boolean, until?: string | null, rate: number }} D @param {D[]} ds @returns {D[]} */
export const order = ds => [...ds].sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || (b.focus ? 1 : 0) - (a.focus ? 1 : 0) || ((b.od || b.card) ? 1 : 0) - ((a.od || a.card) ? 1 : 0) || effRate(b) - effRate(a) || untilKey(a) - untilKey(b));

/** Days in one pay period. @param {State} S */
export const periodDays = S => S.freq === 'week' ? 7 : S.freq === 'fortnight' ? 14 : Math.round(DPM);
/** A monthly amount as a per-pay amount. @param {State} S @param {number} v */
export const perPay = (S, v) => v * 12 / ppy(S);
/** A pay's spending money (card budget). @param {PayStack} s */
export const cardBudget = s => s.plan.card ?? s.plan.spend;
/** What a pay put into Savings. @param {PayStack} s */
export const potTotal = s => s.plan.savings ?? Object.values(s.plan.pots || {}).reduce((a, v) => a + v, 0);

/* Savings is one pool for purchases. What you move in fills it; purchases and anything else you take out come off it. */
/** @param {Move} m */
export const poolOut = m => m.type === 'spend' && (!!m.buy || m.from === 'pool');
/** @param {State} S @param {string | null} [ex] */
export const poolBal = (S, ex) => Math.max(0, (S.startPool || 0) + sumType(S, 'pot', ex, m => after(S.poolAsOf, m)) - S.moves.reduce((s, m) => m.id !== ex && poolOut(m) && after(S.poolAsOf, m) ? s + m.amount : s, 0) - sumType(S, 'xout', ex, m => m.acct === 'pool' && after(S.poolAsOf, m)));
/** Spending you logged: on your card or on credit. Savings, the buffer and repayments paid from the card don't count. @param {Move} m */
export const trackSpend = m => m.type === 'spend' && !m.pair && !poolOut(m) && m.from !== 'buffer';
/** Purchases not bought yet, cheapest first. @param {State} S @returns {Buy[]} */
export const openBuys = S => (S.buys || []).filter(b => !b.bought).sort((a, b) => a.cost - b.cost);

/* ---------- the pay account ----------
   What's in it: pays once they're in, less what's moved out of them, bills paid from it and spending straight from it
   (when there's no card), on top of the balance you last set. A pay is in it as soon as it's stacked. */
/** @param {Move} m */
export const outOfPay = m => (m.type === 'debt' || m.type === 'saved' || m.type === 'pot' || m.type === 'invested') && !m.from;
/** The balance you last set, or $0 just before your first pay. @param {State} S @returns {{ start?: number, asOf?: AsOf }} */
export const payAnchor = S => { if (S.payAcct) return S.payAcct; const f = sortMoves(S.moves.filter(m => m.type === 'pay')).pop(); return f ? { start: 0, asOf: { date: f.date, t: f.t - 1 } } : {}; };
/** @param {State} S */
export function payAcctBal(S) {
  const a = payAnchor(S), aft = (/** @type {Move} */ m) => after(a.asOf, m), wc = walletCard(S);
  let v = a.start || 0;
  S.moves.forEach(m => { if ((m.type === 'pay' || m.type === 'topay') && aft(m)) v += m.amount; });
  S.moves.forEach(m => { if (aft(m) && (outOfPay(m) || m.type === 'bill' || (!wc && isCard(m)))) v -= m.amount; });
  return Math.round(v * 100) / 100;
}
