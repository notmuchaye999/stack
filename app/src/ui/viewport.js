/* Belt and braces for the tab bar and sheets staying put. The page itself never scrolls (Stack scrolls inside #scroll), but
   the iPhone still moves it to show a text box above the keyboard, and can leave it there, or out of line with the screen,
   after the keyboard closes. This puts the page back, and if the part you can see has still drifted from where things
   are pinned, moves them to match (--vv-t at the top, --vv-b at the bottom; styles.css uses both). While you're typing,
   or zoomed in, it leaves the iPhone's own behaviour alone. */

const TEXTY = /^(?:range|radio|checkbox|button|submit|reset|file|color|image|hidden)$/;
/** @param {Element | null} el */
export const typingIn = el => !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || /** @type {HTMLElement} */ (el).isContentEditable || (el.tagName === 'INPUT' && !TEXTY.test(/** @type {HTMLInputElement} */ (el).type)));

/** How far to move things pinned to the top and to the bottom of the screen, in px.
 * @param {{ offsetTop: number, height: number, scale: number } | null | undefined} vv @param {number} innerH @param {boolean} typing */
export function viewportShift(vv, innerH, typing) {
  if (!vv || typing || Math.abs(vv.scale - 1) > 0.01) return { top: 0, bottom: 0 };
  const near0 = n => Math.abs(n) < 2 ? 0 : Math.round(n);
  return { top: near0(vv.offsetTop), bottom: near0(vv.offsetTop + vv.height - innerH) };
}

export function watchViewport() {
  const vv = window.visualViewport, root = document.documentElement;
  if (!vv) return;
  let raf = 0, last = '';
  const apply = () => {
    raf = 0;
    const s = viewportShift(vv, window.innerHeight, typingIn(document.activeElement)), key = s.top + ',' + s.bottom;
    if (key === last) return; last = key;
    if (s.top) root.style.setProperty('--vv-t', s.top + 'px'); else root.style.removeProperty('--vv-t');
    if (s.bottom) root.style.setProperty('--vv-b', s.bottom + 'px'); else root.style.removeProperty('--vv-b');
  };
  // Back to the top of the page whenever nobody's typing: that's the only place it belongs.
  const home = () => { if (!typingIn(document.activeElement) && (window.scrollY || window.scrollX)) window.scrollTo(0, 0); };
  const soon = () => { home(); if (!raf) raf = requestAnimationFrame(apply); };
  vv.addEventListener('resize', soon); vv.addEventListener('scroll', soon); window.addEventListener('scroll', soon, { passive: true });
  document.addEventListener('focusin', soon);
  // The keyboard takes a moment to go away.
  document.addEventListener('focusout', () => setTimeout(soon, 350));
  window.addEventListener('pageshow', soon);
  soon();
}
