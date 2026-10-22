// @vitest-environment jsdom
// The whole app in a fake browser: every tab, the main sheets, stacking a pay. Nothing may throw, and the screens
// have to say what they should. Also: data saved by the first version of this app still opens.
import { describe, it, expect, beforeAll } from 'vitest';
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// (jsdom swaps in its own URL here, so the path is worked out from the plain string.)
const html = readFileSync(fileURLToPath(import.meta.url.replace(/tests\/app\.test\.js$/, 'app/index.html')), 'utf8');
const errors = [];
const wait = (ms = 0) => new Promise(r => setTimeout(r, ms));
const $ = s => document.querySelector(s);
const tap = async sel => { const el = $(sel); if (!el) throw new Error('nothing to tap: ' + sel); el.click(); await wait(); };
const tab = t => tap(`.tabbar [data-go="${t}"]`);
const text = sel => ($(sel) || { textContent: '' }).textContent.replace(/\s+/g, ' ');

/** The first version of this app saved this shape: a 4-part split, imported bank lines, a stack without plans. */
function oldSave() {
  const iso = d => d.toISOString().slice(0, 10), d = n => iso(new Date(Date.now() + n * 864e5));
  return {
    v: 4, pay: 1385.2, freq: 'fortnight', pct: { spend: 25, debt: 60, save: 10, invest: 5 }, rules: [], seen: [],
    bills: [{ id: 'b1', name: 'Phone', amount: 45, every: 'month', due: d(-40) }],
    debts: [{ id: 'd1', name: 'Credit card', balance: 2400, rate: 19.99, min: 60, asOf: { date: d(-30), t: 0 } }],
    buys: [{ id: 'u1', name: 'Tools', cost: 250, by: d(30) }], startSaved: 300, startInvested: 0, savedAsOf: null, investedAsOf: null, emMonths: 3, ret: 6, wr: 4, sample: false,
    moves: [{ id: 'm1', t: 1, date: d(-5), amount: 1385.2, type: 'pay', note: 'Pay', src: 'import', stack: 's1' }, { id: 'm2', t: 2, date: d(-4), amount: 45, type: 'bill', note: 'Phone', src: 'import' },
      { id: 'm3', t: 3, date: d(-3), amount: 20, type: 'skip', note: 'Refund', src: 'import' }, { id: 'm4', t: 4, date: d(-3), amount: 60, type: 'spend', note: 'Fuel', src: 'import' }],
    stacks: [{ id: 's1', t: 1, date: d(-5), amount: 1385.2, plan: { bills: 45, buys: 125, buyNames: ['Tools'], spend: 300, debts: { d1: 700 }, save: 100, invest: 20 }, short: 0, spare: 0 }],
  };
}

beforeAll(async () => {
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  window.scrollTo = () => {};
  window.addEventListener('error', e => errors.push(e.error || e.message));
  window.addEventListener('unhandledrejection', e => errors.push(e.reason));
  // Data from the old version, already on the phone.
  await new Promise((res, rej) => { const r = indexedDB.open('stack', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(JSON.stringify(oldSave()), 'stack-v4'); t.oncomplete = res; t.onerror = rej; }; r.onerror = rej; });
  document.documentElement.innerHTML = html.replace(/<script[^>]*><\/script>/g, '');
  await import('../app/src/ui/app.js');
  await wait(20);
}, 30000);

describe('the app', () => {
  it('opens data saved by the old version, brought up to date', async () => {
    expect(errors).toEqual([]);
    expect($('#qs').hidden).toBe(true);
    expect(text('#h-rank')).toMatch(/(RANK|DEBT) \d/);
    expect(text('#h-cf')).toContain('Credit card');
    await tab('bills');
    expect(text('#tab-bills')).toContain('Phone');
    await tab('saved');
    expect(text('#sv-accts')).toContain('Tools');
    expect(errors).toEqual([]);
  });
  it('tries the sample data in Test mode, through every tab', async () => {
    await tab('plan'); await tap('[data-act="settings"]'); await tap('[data-act="sample"]');
    expect($('#test-bar').hidden).toBe(false);
    expect(text('#h-pay')).toMatch(/\$[\d,.]+ ?free/);
    await tab('saved'); expect(text('#sv-accts')).toContain('Impact driver');
    await tab('stack'); expect(text('#stk-list')).toContain('Still due');
    await tab('bills'); expect(text('#bd-due')).toContain('Due this pay');
    await tab('plan'); expect($('#p-cards').querySelectorAll('.pl-card').length).toBe(4);
    await tab('home');
    expect(errors).toEqual([]);
  });
  it('opens every sheet', async () => {
    for (const act of ['spent', 'moved', 'goal-add', 'add-debt', 'credit-add', 'pay-debt']) { await tap(`[data-act="${act}"]`); expect($('#sheet').hidden, act).toBe(false); await tap('#sheet [data-act="close"]'); }
    await tap('.boss'); await tap('#sheet [data-act="close"]');
    await tab('saved');
    for (const sel of ['[data-act="acct-pay"]', '[data-act="buffer"]', '[data-act="pool-hist"]', '[data-act="credit"]', '[data-act="invested"]', '[data-act="buy"]', '[data-act="add-buy"]']) { await tap(sel); await tap('#sheet [data-act="close"]'); }
    await tab('bills'); await tap('#bd-list [data-act="bill"]'); await tap('#sheet [data-act="close"]'); await tap('[data-act="add-bill"]'); await tap('#sheet [data-act="close"]');
    await tab('stack'); await tap('[data-act="past-pays"]'); await tap('#sheet [data-act="pay"]'); await tap('#sheet [data-act="close"]');
    await tab('plan'); await tap('[data-act="settings"]'); await tap('[data-act="backup"]'); await tap('#sheet [data-act="close"]');
    await tap('[data-act="settings"]'); await tap('[data-act="restore"]'); await tap('#sheet [data-act="close"]');
    await wait(500);
    expect(errors).toEqual([]);
  });
  it('records a spend, ticks things off, and stacks a new pay', async () => {
    await tab('home'); await tap('[data-act="spent"]');
    for (const k of ['4', '2']) await tap(`#mv-keys [data-k="${k}"]`);
    expect(text('#f-save')).toBe('Record $42');
    await tap('#f-save'); await wait(500);
    expect(text('#toast')).toContain('$42 recorded');
    await tab('stack');
    await tap('#stk-list [data-act="bill-tick"]');
    await tap('#stk-list [data-act="pn-tick"]');
    await tap('[data-act="stack-new"]');
    for (const k of ['1', '5', '0', '0']) await tap(`#pv-stack [data-k="${k}"]`);
    await wait(300);
    expect($('#pv-stack').querySelectorAll('.pv-chip').length).toBe(4);
    await tap('[data-pv="stack"]'); await wait(50);
    expect($('.st-ov')).not.toBeNull(); // pay day results
    await tap('.st-skip'); await tap('.st-go'); await wait(300);
    expect(text('#stk-list')).toContain('Paid');
    expect(errors).toEqual([]);
  });
  it('ends Test mode and throws the sample away', async () => {
    await tap('[data-act="test-end"]'); await tap('[data-act="test-discard"]'); await wait(50);
    expect($('#test-bar').hidden).toBe(true);
    await tab('home');
    expect(text('#h-cf')).toContain('Credit card');
    expect(errors).toEqual([]);
  });
});
