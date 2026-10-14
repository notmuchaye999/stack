/* Quick actions on your split. */
import { sumPct } from '../core/index.js';
import { app, save } from './store.js';
import { toast } from './dom.js';
import { derive } from './advice.js';
import { renderAll } from './render.js';
import { fillSplit } from './plan.js';

/** Make the split add up to 100%: spare goes to investing; any excess comes off investing, then savings, debt, spending. */
export function balance() {
  const S = app.S;
  let diff = 100 - sumPct(S);
  if (diff > 0) S.pct.invest += diff;
  else for (const k of ['invest', 'save', 'debt', 'spend']) { const take = Math.min(S.pct[k], -diff); S.pct[k] -= take; diff += take; if (diff >= 0) break; }
  save(); fillSplit(); renderAll(); toast('Split balanced to 100%');
}
export function useSuggest() { app.S.pct = Object.assign({}, derive().sg); save(); fillSplit(); renderAll(); toast('Suggested split applied'); }
