/* What the app is holding right now: your data (app.S), what the screens compare entries against (the projections
   from the last redraw), Test mode, and which screen is showing. */
import { blank, touch } from '../core/index.js';
import { saveState } from '../storage.js';

export const app = {
  S: blank(),
  /** The countdown with everything in (P) and on your plan (PL), and what entries are measured on, from the last redraw. */
  P: null, PL: null, metric: 'FI date',
  /** Your real data, kept aside while Test mode is on. */
  TEST: null,
  /** Your data as it was when the open sheet first opened, for Undo. */
  SNAP: null,
};
export const ui = { tab: 'home', stackNew: false, imp: null, qs: 0, sc: {} };

/** Saving: on this phone, straight away. In Test mode nothing saves. */
export function save() {
  touch();
  if (app.TEST) return;
  saveState(app.S);
}
