import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { blank } from '../app/src/core/state.js';

// A fresh copy of the storage module (and a fresh database) for each test.
let store, ls;
beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  ls = {};
  globalThis.localStorage = { getItem: k => ls[k] ?? null, setItem: (k, v) => { ls[k] = String(v); } };
  store = await import('../app/src/storage.js?t=' + Math.random());
});

describe('storage (IndexedDB)', () => {
  it('starts blank, then gets back exactly what was saved', async () => {
    expect(await store.loadState()).toEqual(blank());
    const S = blank(); S.pay = 1385.2; S.bills.push({ id: 'b', name: 'Phone', amount: 45, every: 'month' });
    await store.saveState(S);
    expect(await store.loadState()).toEqual(S);
  });
  it('keeps the same JSON under the key "stack-v4"', async () => {
    const S = blank(); S.pay = 99;
    await store.saveState(S);
    const txt = await new Promise(res => { indexedDB.open('stack').onsuccess = e => { const r = e.target.result.transaction('kv').objectStore('kv').get('stack-v4'); r.onsuccess = () => res(r.result); }; });
    expect(txt).toBe(JSON.stringify(S));
  });
  it('quick saves in a row end with the latest one', async () => {
    const S = blank();
    for (let i = 1; i <= 20; i++) { S.pay = i; store.saveState(S); }
    await store.saveState(S);
    expect((await store.loadState()).pay).toBe(20);
  });
  it('moves a copy left in localStorage across', async () => {
    const S = blank(); S.pay = 777;
    ls['stack-v4'] = JSON.stringify(S);
    expect((await store.loadState()).pay).toBe(777);
  });
});
