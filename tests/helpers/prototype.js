// Loads the prototype (prototype/stack.html) in a fake browser so tests can run its functions
// and compare the answers with the new code. Values cross over as JSON, so both sides see plain data.
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../../prototype/stack.html', import.meta.url), 'utf8');

export function loadPrototype() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://stack.test/', pretendToBeVisual: true });
  const w = dom.window;
  return {
    window: w,
    /** Run an expression inside the prototype and get its result back as plain data. */
    run: expr => JSON.parse(w.eval(`JSON.stringify((() => (${expr}))()) ?? 'null'`)),
    /** Replace the prototype's state. */
    setState: S => { w.eval(`S = ${JSON.stringify(S)}`); },
    getState: () => JSON.parse(w.eval('JSON.stringify(S)')),
    close: () => w.close(),
  };
}
