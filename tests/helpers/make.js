// Small builders so tests read like a story: a state, some pays, some spends.
import { blank } from '../../app/src/core/state.js';

let n = 0;
export const mk = (over = {}) => Object.assign(blank(), over);
export const pay = (date, amount, x = {}) => ({ id: 'p' + (++n), t: n, date, amount, type: 'pay', note: 'Pay', src: 'manual', ...x });
export const spend = (date, amount, x = {}) => ({ id: 's' + (++n), t: n, date, amount, type: 'spend', note: 'Card top-up', src: 'manual', ...x });
export const move = (type, date, amount, x = {}) => ({ id: 'm' + (++n), t: n, date, amount, type, note: type, src: 'manual', ...x });
export const debt = (x = {}) => ({ id: 'd' + (++n), name: 'Debt ' + n, balance: 1000, rate: 0, min: 0, asOf: { date: '2026-01-01', t: 0 }, ...x });
export const bill = (name, amount, every = 'month') => ({ id: 'b' + (++n), name, amount, every });
