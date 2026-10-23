// @vitest-environment jsdom
// The tab bar, sheets and rank bar stay on the visible screen when the iPhone leaves the page shifted after typing.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { viewportShift, typingIn, watchViewport } from '../app/src/ui/viewport.js';

const vv = (offsetTop, height, scale = 1) => ({ offsetTop, height, scale });

describe('viewportShift', () => {
  it('moves nothing when the screen and the page line up', () => {
    expect(viewportShift(vv(0, 852), 852, false)).toEqual({ top: 0, bottom: 0 });
    expect(viewportShift(vv(0.6, 852), 852, false)).toEqual({ top: 0, bottom: 0 }); // rounding noise
    expect(viewportShift(null, 852, false)).toEqual({ top: 0, bottom: 0 });
  });
  it('follows the screen when the page is left shifted after the keyboard closes', () => {
    expect(viewportShift(vv(274, 852), 852, false)).toEqual({ top: 274, bottom: 274 });
  });
  it('fills the screen when the page is left shorter than it', () => {
    expect(viewportShift(vv(0, 852), 560, false)).toEqual({ top: 0, bottom: 292 });
  });
  it("leaves the iPhone's own behaviour alone while typing or zoomed in", () => {
    expect(viewportShift(vv(274, 560), 852, true)).toEqual({ top: 0, bottom: 0 });
    expect(viewportShift(vv(274, 426, 2), 852, false)).toEqual({ top: 0, bottom: 0 });
  });
});

describe('typingIn', () => {
  const el = html => { const d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; };
  it('counts text fields, not switches, sliders or buttons', () => {
    expect(typingIn(el('<input>'))).toBe(true);
    expect(typingIn(el('<input type="date">'))).toBe(true);
    expect(typingIn(el('<textarea></textarea>'))).toBe(true);
    expect(typingIn(el('<select></select>'))).toBe(true);
    expect(typingIn(el('<input type="checkbox">'))).toBe(false);
    expect(typingIn(el('<input type="range">'))).toBe(false);
    expect(typingIn(el('<button></button>'))).toBe(false);
    expect(typingIn(null)).toBe(false);
  });
});

describe('watchViewport', () => {
  it('sets and clears --vv-t and --vv-b as the visible screen moves', () => {
    const fake = Object.assign(new EventTarget(), vv(0, window.innerHeight));
    const frames = [];
    Object.defineProperty(window, 'visualViewport', { value: fake, configurable: true });
    window.requestAnimationFrame = f => { frames.push(f); return frames.length; };
    const flush = () => { while (frames.length) frames.shift()(0); };
    const root = document.documentElement.style;

    watchViewport(); flush();
    expect(root.getPropertyValue('--vv-t')).toBe('');
    fake.offsetTop = 274; fake.dispatchEvent(new Event('scroll')); flush();
    expect(root.getPropertyValue('--vv-t')).toBe('274px');
    expect(root.getPropertyValue('--vv-b')).toBe('274px');
    fake.offsetTop = 0; fake.dispatchEvent(new Event('resize')); flush();
    expect(root.getPropertyValue('--vv-t')).toBe('');
    expect(root.getPropertyValue('--vv-b')).toBe('');
  });
});

describe('the page scrolls inside #scroll, never the window', () => {
  // (jsdom swaps in its own URL here, so the path is worked out from the plain string.)
  const app = fileURLToPath(import.meta.url.replace(/tests\/viewport\.test\.js$/, 'app/'));
  it('has the scroller, and the screens never scroll the window', () => {
    expect(readFileSync(app + 'index.html', 'utf8')).toMatch(/<main class="scroll" id="scroll"><div class="app">/);
    expect(readFileSync(app + 'styles.css', 'utf8')).toContain('html,body{height:100%;overflow:hidden;overscroll-behavior:none}');
    for (const f of readdirSync(app + 'src/ui').filter(f => f !== 'viewport.js')) {
      expect(readFileSync(app + 'src/ui/' + f, 'utf8'), f).not.toMatch(/window\.scroll(To|By|Y)|[^.\w]scrollY/);
    }
  });
});
