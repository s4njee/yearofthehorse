import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Story 7.3: text over bright moving bokeh. Text that sits over an effect in the page contexts
// always sits on a plate (src/shell/contexts.css): the surface colour at 90%, or the article's 82%
// over the Backdrop veil's 62% of the page colour. So the worst an effect can do to it is put its
// brightest pixel (for light text) or its darkest (for dark text) under the plate, and that can be
// worked out for every effect at once: the browser blends the plate over the canvas in sRGB, and
// luminance rises with every channel, so black and white are the extremes on an SDR canvas. An
// HDR canvas (`?hdr`) can go past white, up to the tail's headroom of 3.

const theme = readFileSync('src/shell/theme.css', 'utf8');
const contexts = readFileSync('src/shell/contexts.css', 'utf8');
const layouts = readFileSync('src/shell/contexts.ts', 'utf8');

type Rgb = [number, number, number];

/** A `--yh-` token's light and dark values from theme.css's `light-dark()`. */
function token(name: string): { light: Rgb; dark: Rgb } {
  const match = new RegExp(
    `--yh-${name}:\\s*light-dark\\((#[0-9a-f]{6}),\\s*(#[0-9a-f]{6})\\)`,
  ).exec(theme);
  if (!match) throw new Error(`--yh-${name} not found`);
  const rgb = (hex: string): Rgb =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as Rgb;
  return { light: rgb(match[1]!), dark: rgb(match[2]!) };
}

function luminance([r, g, b]: Rgb): number {
  // Extended sRGB: values past 1 are an HDR canvas's brighter-than-white.
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const mix = (top: Rgb, bottom: Rgb, share: number): Rgb =>
  top.map((v, i) => share * v + (1 - share) * bottom[i]!) as Rgb;

const platePercent = Number(
  /yh-context__plate\s*\{[^}]*?var\(--yh-surface\)\s*(\d+)%/.exec(contexts)?.[1],
);
const articlePercent = Number(
  /yh-context__article\s*\{[^}]*?var\(--yh-surface\)\s*(\d+)%/.exec(contexts)?.[1],
);
const veilPercent = Number(/BACKDROP_VEIL = (\d+)/.exec(layouts)?.[1]);

/** sRGB-encoded value of an HDR canvas at `headroom` times SDR white. */
const encodedWhite = (headroom: number) => 1.055 * Math.pow(headroom, 1 / 2.4) - 0.055;

const SCRATCH = process.env.CONTRAST_REPORT;

describe('text contrast over any effect', () => {
  it('reads the plates from the shell', () => {
    expect(platePercent).toBe(90);
    expect(articlePercent).toBeGreaterThan(50);
    expect(veilPercent).toBeGreaterThan(0);
  });

  const styles = [
    { name: 'text', token: 'text', needs: 4.5 },
    { name: 'muted text', token: 'text-muted', needs: 4.5 },
    { name: 'accent (labels, large)', token: 'accent', needs: 3 },
  ];

  for (const mode of ['dark', 'light'] as const) {
    it(`keeps AA on every plate over any SDR effect, ${mode} theme`, async () => {
      const surface = token('surface')[mode];
      const bg = token('bg')[mode];
      const plates = [
        { name: 'plate', over: (e: Rgb) => mix(surface, e, platePercent / 100) },
        {
          name: 'article over veil',
          over: (e: Rgb) => mix(surface, mix(bg, e, veilPercent / 100), articlePercent / 100),
        },
      ];
      const lines: string[] = [];
      for (const style of styles) {
        const colour = token(style.token)[mode];
        for (const plate of plates) {
          const worst = Math.min(
            contrast(colour, plate.over([0, 0, 0])),
            contrast(colour, plate.over([1, 1, 1])),
          );
          const hdr = contrast(
            colour,
            plate.over([encodedWhite(3), encodedWhite(3), encodedWhite(3)]),
          );
          lines.push(
            `${mode} | ${style.name} | ${plate.name} | ${worst.toFixed(2)} | ${hdr.toFixed(2)}`,
          );
          expect(worst, `${style.name} on ${plate.name}`).toBeGreaterThanOrEqual(style.needs);
        }
      }
      if (SCRATCH) (await import('node:fs')).appendFileSync(SCRATCH, `${lines.join('\n')}\n`);
    });
  }
});
