// @ts-check
/* Turning numbers and dates into words, Australian style. Plain text only (no HTML), so React Native can use it too. */
import { DPM, parseISO } from './util.js';

const fmt = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
/** Whole dollars with a real minus sign: −$1,240. @param {number} v */
export const money = v => { const r = Math.round(v || 0); return (r < 0 ? '−' : '') + fmt.format(Math.abs(r)); };
/** Short dollars for big numbers: $45k, $1.2m. @param {number} v */
export const kmoney = v => v >= 1e6 ? '$' + (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'm' : v >= 10000 ? '$' + Math.round(v / 1000) + 'k' : money(v);
/** '2026-10-14' → '14 Oct'. @param {string} s */
export const fmtDate = s => parseISO(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
/** @param {Date} d */
export const monthYear = d => d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
/** Months → '2 years 3 months'. @param {number} m */
export const dur = m => { const y = Math.floor(m / 12), mo = m % 12; return [y ? y + (y === 1 ? ' year' : ' years') : '', mo ? mo + (mo === 1 ? ' month' : ' months') : ''].filter(Boolean).join(' ') || 'under a month'; };

/** A number of days as words: '3 days', '5 weeks', '1 year 2 months'. @param {number} a */
export function spanTxt(a) {
  if (a < 1) return 'under a day';
  if (a < 14) { const n = Math.round(a); return n + (n === 1 ? ' day' : ' days'); }
  if (a < 120) return Math.round(a / 7) + ' weeks';
  return dur(Math.round(a / DPM));
}
/** How far an entry moved the FI date, short form: '+3 days', '−2 wks', 'Out of reach'. @param {number} d */
export function impTxt(d) {
  if (d === Infinity) return 'Out of reach';
  if (d === -Infinity) return 'Back in reach';
  const a = Math.abs(d);
  if (a < 1) return '<1 day';
  const s = a < 14 ? Math.round(a) + (Math.round(a) === 1 ? ' day' : ' days') : a < 120 ? Math.round(a / 7) + ' wks' : Math.round(a / DPM) + ' mths';
  return (d > 0 ? '+' : '−') + s;
}
