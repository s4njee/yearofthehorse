// What the pages with an effect behind the whole of them share (hanabi.html), from Snow Temple's:
// keeping the hero clear of the toolbar.

/**
 * The toolbar is fixed over the page and wraps to more rows on a narrow window; the hero keeps its
 * height clear (page.css), so the caption above it is never covered. Measured once now, as a hidden
 * tab runs no resize observers, and again whenever the toolbar changes size.
 */
export function reserveToolbar(toolbar: HTMLElement) {
  const measure = () =>
    document.documentElement.style.setProperty('--toolbar-height', `${toolbar.offsetHeight}px`);
  measure();
  new ResizeObserver(measure).observe(toolbar);
}
