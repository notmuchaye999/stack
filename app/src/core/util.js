// @ts-check
/* Shared constants and date helpers. Nothing in src/core touches the page (no document, window or storage),
   so the same files run in the browser, in Node tests and, later, in the React Native app. */

/** The four parts of a pay's split, in display order. */
export const BK = /** @type {const} */ (['spend', 'debt', 'save', 'invest']);

/** How often something happens, and how many times a year. */
export const FREQ = {
  week: { n: 52, label: 'Weekly', per: 'a week' }, fortnight: { n: 26, label: 'Fortnightly', per: 'a fortnight' },
  month: { n: 12, label: 'Monthly', per: 'a month' }, quarter: { n: 4, label: 'Quarterly', per: 'a quarter' },
  year: { n: 1, label: 'Yearly', per: 'a year' },
};

/** Every label an entry can have. */
export const TYPES = /** @type {const} */ (['pay', 'spend', 'bill', 'debt', 'saved', 'invested', 'skip']);
/** Entries that show how they moved the FI date. */
export const IMPACT_TYPES = ['spend', 'saved', 'invested', 'debt'];

/** Average days in a month. */
export const DPM = 365.25 / 12;

export const uid = () => Math.random().toString(36).slice(2, 10);
/** @param {number} v */
export const clamp = v => Math.min(1, Math.max(0, v || 0));
/** @param {number} n */
export const pad2 = n => String(n).padStart(2, '0');

/* Dates are plain 'YYYY-MM-DD' strings in local time. */
/** @param {Date} d */
export const iso = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const today = () => iso(new Date());
/** @param {string} s */
export const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
/** @param {string} s @param {number} n */
export const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
/** @param {string} a @param {string} b */
export const daysBetween = (a, b) => Math.round((+parseISO(b) - +parseISO(a)) / 864e5);
/** A moment in time, used to say "this balance was correct as of …". */
export const now = () => ({ date: today(), t: Date.now() });
