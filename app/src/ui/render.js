/* Redrawing the screens after anything changes, and moving between tabs. */
import { latestStack, stackItems } from '../core/index.js';
import { app, ui, save } from './store.js';
import { $, closeSheet, toast } from './dom.js';
import { derive } from './advice.js';
import { renderHome } from './home.js';
import { renderSpent } from './spent.js';
import { renderSaved } from './saved.js';
import { renderStack, fillPay } from './stack.js';
import { renderBills } from './bills.js';
import { renderPlan, fillPlanInputs } from './plan.js';

export function renderAll() {
  const D = derive();
  renderHome(D); renderStack(); renderBills(D);
  if (ui.tab === 'spent') renderSpent(D);
  if (ui.tab === 'saved') renderSaved(D);
  if (ui.tab === 'plan') renderPlan(D);
}

/** Save, close the sheet, redraw and say what happened. */
export function commit(msg) { save(); closeSheet(); fillPlanInputs(); renderAll(); toast(msg); }

export function go(tab) {
  if (tab === 'stack') { const s = latestStack(app.S); ui.stackNew = !s || stackItems(app.S, s).complete; }
  ui.tab = tab;
  ['home', 'spent', 'stack', 'saved', 'bills', 'plan'].forEach(t => { $('#tab-' + t).hidden = t !== tab; });
  document.querySelectorAll('.tabbar [data-go]').forEach(b => b.setAttribute('aria-current', b.dataset.go === tab ? 'page' : 'false'));
  if (tab === 'stack' && ui.stackNew) fillPay();
  if (tab === 'plan') fillPlanInputs();
  renderAll(); window.scrollTo(0, 0);
}
