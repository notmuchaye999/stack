// @ts-check
/* Where your money stands right now, worked out from what you've entered. Every function takes the saved
   state S first, so nothing hides in a global. */
import { BK, FREQ, DPM, today, parseISO, daysBetween } from './util.js';

/** @import { State, Debt, Move, Buy, AsOf, Every } from './state.js' */

/** Pays per year. @param {State} S */
export const ppy = S => FREQ[S.freq].n;
/** An amount paid every week/fortnight/… as a monthly amount. @param {number} amt @param {Every} every */
export const monthly = (amt, every) => amt * FREQ[every].n / 12;
/** @param {State} S */
export const sumPct = S => BK.reduce((s, k) => s + S.pct[k], 0);
/** The split used until you set your own. @param {State} S */
export const startSplit = S => S.debts.some(d => d.balance > 0) ? { spend: 30, debt: 50, save: 20, invest: 0 } : { spend: 30, debt: 0, save: 40, invest: 30 };
/** Your split, or the starter split if yours is all 0%. @param {State} S */
export const effPct = S => sumPct(S) > 0 ? S.pct : startSplit(S);

/** Did this entry happen after the balance was last set? @param {AsOf | null | undefined} asOf @param {Move} m */
export const after = (asOf, m) => !asOf || m.date > asOf.date || (m.date === asOf.date && m.t > asOf.t);
/** Total of one type of entry. ex leaves one entry out (for "with vs without it"). f filters further.
 *  @param {State} S @param {string} type @param {string | null | undefined} [ex] @param {(m: Move) => boolean} [f] */
export const sumType = (S, type, ex, f) => S.moves.reduce((s, m) => m.type === type && m.id !== ex && (!f || f(m)) ? s + m.amount : s, 0);

/* Savings and investments are the balance you set plus everything recorded since.
   Debts are the balance you entered minus payments recorded after it. */
/** @param {State} S @param {string | null} [ex] */
export const savedNow = (S, ex) => S.startSaved + sumType(S, 'saved', ex, m => after(S.savedAsOf, m));
/** @param {State} S @param {string | null} [ex] */
export const investedNow = (S, ex) => S.startInvested + sumType(S, 'invested', ex, m => after(S.investedAsOf, m));
/** @param {State} S @param {Debt} d @param {string | null} [ex] */
export const debtNow = (S, d, ex) => Math.max(0, d.balance - sumType(S, 'debt', ex, m => m.ref === d.id && after(d.asOf, m)));
/** @param {State} S @param {string | null} [ex] */
export const debtTotal = (S, ex) => S.debts.reduce((s, d) => s + debtNow(S, d, ex), 0);
/** @param {State} S */
export const netWorth = S => savedNow(S) + investedNow(S) - debtTotal(S);
/** @param {State} S @param {string | null | undefined} id */
export const debtName = (S, id) => { const d = S.debts.find(x => x.id === id); return d ? d.name : 'Debt'; };

/* Interest-free while paid on time, until an optional end date. */
/** @param {{ free?: boolean, until?: string | null }} d */
export const freeNow = d => !!d.free && (!d.until || d.until > today());
/** The rate that actually applies today. @param {{ free?: boolean, until?: string | null, rate: number }} d */
export const effRate = d => freeNow(d) ? 0 : d.rate;

/* Who gets extra money first: the debt you chose to focus on, then overdrawn accounts, then whatever's charging the most interest,
   then interest-free debts whose free period ends soonest. */
/** @param {{ free?: boolean, until?: string | null }} d */
const untilKey = d => d.free && d.until ? parseISO(d.until).getTime() : Infinity;
/** @template {{ focus?: boolean, od?: boolean, free?: boolean, until?: string | null, rate: number }} D @param {D[]} ds @returns {D[]} */
export const order = ds => [...ds].sort((a, b) => (b.focus ? 1 : 0) - (a.focus ? 1 : 0) || (b.od ? 1 : 0) - (a.od ? 1 : 0) || effRate(b) - effRate(a) || untilKey(a) - untilKey(b));

/** Days in one pay period. @param {State} S */
export const periodDays = S => S.freq === 'week' ? 7 : S.freq === 'fortnight' ? 14 : Math.round(DPM);
/** A monthly amount as a per-pay amount. @param {State} S @param {number} v */
export const perPay = (S, v) => v * 12 / ppy(S);

/* Planned buys: car parts, tools. Money is put aside each pay until the date you want it by. */
/** @param {State} S @param {Buy} b */
export const buyLeft = (S, b) => Math.max(0, b.cost - sumType(S, 'spend', null, m => m.buy === b.id));
/** @param {State} S */
export const openBuys = S => (S.buys || []).filter(b => !b.bought && buyLeft(S, b) > 0.5);
/** @param {Buy} b */
export const buyMonths = b => Math.max(1, Math.ceil(daysBetween(today(), b.by) / DPM));
/** @param {State} S */
export const buysM = S => openBuys(S).reduce((s, b) => s + buyLeft(S, b) / buyMonths(b), 0);
/** @param {State} S @param {Buy} b @param {string} date */
export const buyPerPay = (S, b, date) => buyLeft(S, b) / Math.max(1, Math.floor(daysBetween(date, b.by) / periodDays(S)));
