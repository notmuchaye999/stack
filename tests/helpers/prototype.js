// Loads the prototype (prototype/stack.html) in a fake browser so tests can run its functions
// and compare the answers with the new code. Values cross over as JSON, so both sides see plain data.
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../../prototype/stack.html', import.meta.url), 'utf8');

export function loadPrototype() {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'https://stack.test/', pretendToBeVisual: true,
    // jsdom has no matchMedia; the prototype asks it whether to animate.
    beforeParse: w => { w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} }); },
  });
  const w = dom.window;
  return {
    window: w,
    /** Run an expression inside the prototype and get its result back as plain data. */
    run: expr => JSON.parse(w.eval(`JSON.stringify((() => (${expr}))()) ?? 'null'`)),
    /** Replace the prototype's state. Worked-out plans it kept are thrown away, as they are on every save. */
    setState: S => { w.eval(`S = ${JSON.stringify(S)}; REV++; MEMO.clear();`); },
    getState: () => JSON.parse(w.eval('JSON.stringify(S)')),
    close: () => w.close(),
  };
}
