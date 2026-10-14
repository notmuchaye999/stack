/* What the app is holding right now: your data (app.S) and which screen/sheet is showing (ui). */
import { blank } from '../core/index.js';
import { saveState } from '../storage.js';

export const app = { S: blank(), /** FI months with everything in, for "with vs without" comparisons */ base: null };
export const ui = { tab: 'home', seg: 'bills', stackNew: false, animated: false, imp: null, open: null };
export const save = () => saveState(app.S);
