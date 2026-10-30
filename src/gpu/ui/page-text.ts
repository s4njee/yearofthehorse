/*
 * The page's own type, re-drawn where it sits (story 6.6, halation-text).
 *
 *   const text = trackPageText(canvas);
 *   // each frame, before drawing:
 *   const found = text.update();          // undefined: no headline on the page (or no DOM)
 *   if (found?.changed) text.draw(offscreen);   // white glyphs on transparent, canvas pixels
 *
 * A canvas cannot read the page's pixels, but it can read where a heading is, what it says and
 * which font it is set in. That is enough to draw the same glyphs again, at the same place and
 * size, into a 2D canvas the size of the WebGPU canvas, and to upload that as a coverage mask.
 * The page keeps the real text (selection, search, screen readers); the canvas draws light on it.
 *
 * WHY NOT THE MSDF ATLAS. The shared atlas (atlas.ts) holds Anton's capitals and digits only. A
 * headline in the page's face, in mixed case, cannot be rebuilt from it, and a different face
 * drawn over the real words leaves the real ones showing round its edges. Canvas 2D `fillText`
 * uses the browser's own shaping and the page's own (already loaded) web fonts, so its glyphs
 * land on the DOM's. The atlas remains the fallback where there is no page (tests, posters).
 *
 * HOW IT LINES UP. Each word is measured where the browser laid it out, with a Range over the text
 * node (`getClientRects`), so wrapping, alignment and justification come from the page and never
 * have to be recomputed. A text Range's box is the font's content area, so the baseline is its top
 * plus the font's ascent (`fontBoundingBoxAscent`). Font, letter spacing and text-transform come
 * from the computed style of the text's parent.
 *
 * WHICH ELEMENT. The first match of `selector` under the canvas's `data-yh-obstacle-root` (the
 * mock pages set one) or the document: by default an element marked `data-yh-headline`, else the
 * mock hero's headline, else the first `h1`.
 *
 * COST. Per frame, two `getBoundingClientRect` calls and a string compare. On a change (resize,
 * scroll, new text, every `styleEvery` frames for the font), one Range per word and one
 * `fillText` per word, then the caller's upload. Not measured yet.
 *
 * WITHOUT A DOM (tests, workers, a canvas stub) `update` returns undefined and never throws.
 */

export const HEADLINE_ATTRIBUTE = 'data-yh-headline';
export const HEADLINE_SELECTOR = `[${HEADLINE_ATTRIBUTE}], .yh-context__headline, h1`;

export interface PageTextOptions {
  /** Which element to re-draw. Default `HEADLINE_SELECTOR`. */
  selector?: string;
  /** Look for the element again every this many updates. Default 60. */
  requeryEvery?: number;
  /** Re-read the computed font every this many updates. Default 30. */
  styleEvery?: number;
}

export interface PageTextFrame {
  /** The text or its geometry differs from the last update (or this is the first). */
  readonly changed: boolean;
  /** The element's box in canvas uv (0..1, top-left origin). */
  readonly box: { x: number; y: number; width: number; height: number };
  /** The font size in canvas pixels. */
  readonly fontPx: number;
  /** Words found in the canvas. */
  readonly words: number;
}

export interface PageTextTracker {
  update(): PageTextFrame | undefined;
  /** The headline in white on transparent, in canvas pixels, into `target` (resized to fit). */
  draw(target: OffscreenCanvas | HTMLCanvasElement, width: number, height: number): void;
  readonly element: Element | undefined;
  destroy(): void;
}

interface Word {
  text: string;
  /** CSS pixels relative to the canvas's top-left. */
  left: number;
  top: number;
  font: string;
  spacing: string;
}

function hasDom(canvas: unknown): canvas is HTMLCanvasElement {
  const node = canvas as Partial<HTMLCanvasElement> | null;
  return (
    typeof document !== 'undefined' &&
    typeof globalThis.getComputedStyle === 'function' &&
    typeof node === 'object' &&
    node !== null &&
    typeof node.getBoundingClientRect === 'function' &&
    typeof node.closest === 'function'
  );
}

function transform(text: string, how: string): string {
  if (how === 'uppercase') return text.toUpperCase();
  if (how === 'lowercase') return text.toLowerCase();
  return text;
}

function fontOf(style: CSSStyleDeclaration): string {
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}

export function trackPageText(
  canvas: HTMLCanvasElement,
  options: PageTextOptions = {},
): PageTextTracker {
  if (!hasDom(canvas)) {
    return { update: () => undefined, draw() {}, element: undefined, destroy() {} };
  }
  const selector = options.selector ?? HEADLINE_SELECTOR;
  const requeryEvery = Math.max(1, Math.round(options.requeryEvery ?? 60));
  const styleEvery = Math.max(1, Math.round(options.styleEvery ?? 30));

  let element: Element | undefined;
  let sinceQuery = requeryEvery;
  let sinceStyle = styleEvery;
  let styleKey = '';
  let key = '';
  let words: Word[] = [];
  let fontCss = 16;
  let destroyed = false;

  function query() {
    const root = canvas.closest('[data-yh-obstacle-root]') ?? canvas.ownerDocument;
    element = root.querySelector(selector) ?? undefined;
    sinceQuery = 0;
  }

  /** Every word's box, relative to the canvas, with the font it is set in. */
  function measure(from: Element, canvasBox: DOMRect): Word[] {
    const found: Word[] = [];
    const doc = canvas.ownerDocument;
    const range = doc.createRange();
    const walker = doc.createTreeWalker(from, NodeFilter.SHOW_TEXT);
    const styles = new Map<Element, CSSStyleDeclaration>();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent) continue;
      let style = styles.get(parent);
      if (!style) {
        style = globalThis.getComputedStyle(parent);
        styles.set(parent, style);
      }
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      const data = node.textContent ?? '';
      for (const match of data.matchAll(/\S+/g)) {
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const box = range.getClientRects()[0];
        if (!box || box.width <= 0) continue;
        found.push({
          text: transform(match[0], style.textTransform),
          left: box.left - canvasBox.left,
          top: box.top - canvasBox.top,
          font: fontOf(style),
          spacing: style.letterSpacing === 'normal' ? '0px' : style.letterSpacing,
        });
      }
    }
    range.detach();
    return found;
  }

  return {
    get element() {
      return element;
    },
    update() {
      if (destroyed) return undefined;
      if (!element?.isConnected || ++sinceQuery >= requeryEvery) query();
      if (!element) return undefined;
      const canvasBox = canvas.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      if (canvasBox.width <= 0 || canvasBox.height <= 0 || box.width <= 0) return undefined;
      // A heading elsewhere on the page (the site's own title above a thumbnail) is not this one.
      const overlaps =
        box.right > canvasBox.left &&
        box.left < canvasBox.right &&
        box.bottom > canvasBox.top &&
        box.top < canvasBox.bottom;
      if (!overlaps) return undefined;
      if (++sinceStyle >= styleEvery || styleKey === '') {
        const style = globalThis.getComputedStyle(element);
        styleKey = `${fontOf(style)}|${style.letterSpacing}|${style.textTransform}|${style.visibility}`;
        fontCss = parseFloat(style.fontSize) || 16;
        sinceStyle = 0;
      }
      const next = [
        canvasBox.left,
        canvasBox.top,
        canvasBox.width,
        canvasBox.height,
        box.left,
        box.top,
        box.width,
        box.height,
        canvas.width,
        canvas.height,
        styleKey,
        element.textContent ?? '',
      ].join('|');
      const changed = next !== key;
      if (changed) {
        key = next;
        words = measure(element, canvasBox);
      }
      return {
        changed,
        box: {
          x: (box.left - canvasBox.left) / canvasBox.width,
          y: (box.top - canvasBox.top) / canvasBox.height,
          width: box.width / canvasBox.width,
          height: box.height / canvasBox.height,
        },
        fontPx: (fontCss * canvas.height) / canvasBox.height,
        words: words.length,
      };
    },
    draw(target, width, height) {
      if (target.width !== width) target.width = width;
      if (target.height !== height) target.height = height;
      const ctx = target.getContext('2d') as
        OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
      if (!ctx) return;
      const box = canvas.getBoundingClientRect();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.setTransform(width / box.width, 0, 0, height / box.height, 0, 0);
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'alphabetic';
      for (const word of words) {
        ctx.font = word.font;
        ctx.letterSpacing = word.spacing;
        const ascent = ctx.measureText(word.text).fontBoundingBoxAscent;
        ctx.fillText(word.text, word.left, word.top + ascent);
      }
    },
    destroy() {
      destroyed = true;
      element = undefined;
      words = [];
    },
  };
}
