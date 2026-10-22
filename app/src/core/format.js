// @ts-check
/* Turning numbers and dates into words, Australian style. Plain text only (no HTML), so React Native can use it too. */
import { parseISO } from './util.js';

const fmt = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
const fmtC = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Exact to the cent when there are cents, whole dollars when there aren't, with a real minus sign: −$1,240.50.
 *  Balances and entries are always shown as entered. @param {number} v */
export const money = v => { const c = Math.round((v || 0) * 100) / 100; return (c < 0 ? '−' : '') + (Math.abs(c - Math.round(c)) >= 0.005 ? fmtC : fmt).format(Math.abs(c)); };
/** Estimates (averages, targets, per-pay shares of a bill) stay in whole dollars. @param {number} v */
export const money0 = v => money(Math.round(v || 0));
/** Always with cents, like a bank shows a balance. @param {number} v */
export const money2 = v => { const c = Math.round((v || 0) * 100) / 100; return (c < 0 ? '−' : '') + fmtC.format(Math.abs(c)); };
/** With a + when it's up: +$12.00. @param {number} v */
export const signed = v => (Math.round(v * 100) / 100 > 0 ? '+' : '') + money2(v);
/** Short dollars for big numbers: $45k, $1.2m. @param {number} v */
export const kmoney = v => v >= 1e6 ? '$' + (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'm' : v >= 10000 ? '$' + Math.round(v / 1000) + 'k' : money(v);

export const MNAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '2026-10-14' → '14 Oct', with the year when it isn't this year. @param {string} s */
export const fmtDate = s => { const d = parseISO(s); return `${d.getDate()} ${MNAMES[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}`; };
/** 'Oct 2026'. @param {Date} d */
export const monthYear = d => `${MNAMES[d.getMonth()]} ${d.getFullYear()}`;
