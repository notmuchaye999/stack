/* Where Stack keeps your data on this device. One record, key 'stack-v4', holding the same JSON the prototype saved. */
import { KEY, OLD_KEY, blank, fromV4, fromV3 } from './core/index.js';

/** Loads your saved data, or a blank start. */
export async function loadState() {
  try {
    const r = localStorage.getItem(KEY);
    if (r) { const o = fromV4(JSON.parse(r)); if (o) return o; }
    const old = localStorage.getItem(OLD_KEY);
    if (old) { const o = fromV3(JSON.parse(old)); if (o) return o; }
  } catch (e) {}
  return blank();
}

/** Saves your data. */
export function saveState(S) {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
}
