/* Where Stack keeps your data on this device: IndexedDB, one record under the key 'stack-v4' holding the same
   JSON text the prototype saves. Nothing ever leaves the phone. What comes back is brought up to date by normalize().
   Saves are queued: if you drag a slider, only the latest version gets written once the previous write finishes. */
import { KEY, blank, fromSaved } from './core/index.js';

const DB_NAME = 'stack', STORE = 'kv';
let dbP = null, problem = () => {};

/** Called once if IndexedDB can't be used, so the app can say so. Data then goes to localStorage instead. */
export const onStorageProblem = fn => { problem = fn; };

function db() {
  if (!dbP) dbP = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbP;
}
const tx = async (mode, fn) => {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode), r = fn(t.objectStore(STORE));
    t.oncomplete = () => res(r.result);
    t.onerror = t.onabort = () => rej(t.error);
  });
};
const idbGet = key => tx('readonly', s => s.get(key));
const idbPut = (key, val) => tx('readwrite', s => s.put(val, key));

const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const parse = txt => { try { return JSON.parse(txt); } catch (e) { return null; } };

/** Your saved data, or a blank start. A copy left in localStorage (by an older version) is moved across once. */
export async function loadState() {
  let txt = null, idbOk = true;
  try { txt = await idbGet(KEY); } catch (e) { idbOk = false; problem(); }
  if (txt) { const o = fromSaved(parse(txt)); if (o) return o; }
  const local = fromSaved(parse(lsGet(KEY)));
  if (local) { if (idbOk) saveState(local); return local; }
  return blank();
}

let pending = null, writing = null;
/** Saves your data (in the background). */
export function saveState(S) {
  pending = JSON.stringify(S);
  if (!writing) writing = flush();
  return writing;
}
async function flush() {
  while (pending !== null) {
    const txt = pending; pending = null;
    try { await idbPut(KEY, txt); }
    catch (e) { problem(); try { localStorage.setItem(KEY, txt); } catch (e2) {} }
  }
  writing = null;
}

/** Ask the browser not to clear Stack's storage when the phone is low on space. */
export function askToKeep() { try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {} }
