// Story 2.2: the table of star colours in docs/studies/emission-colour.md.
//
//   node experiments/emission-table.ts

import { writeFileSync } from 'node:fs';
import { srgbToP3 } from '../src/gpu/colour/wide-gamut.ts';
import { COMPOSITIONS, emissionColour } from '../src/gpu/spectra/emission.ts';

const encode = (v: number) => {
  const c = Math.min(1, Math.max(0, v));
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
};
/** A light's colour as CSS: scaled until its largest channel is 1, then encoded. */
const css = (rgb: readonly number[], p3: boolean) => {
  const v = p3 ? srgbToP3(rgb as [number, number, number]) : rgb;
  const top = Math.max(...v);
  const e = v.map((x) => encode(x / top));
  return p3
    ? `color(display-p3 ${e.map((x) => x.toFixed(3)).join(' ')})`
    : `#${e
        .map((x) =>
          Math.round(x * 255)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')}`;
};

const rows = COMPOSITIONS.map((c) => {
  const e = emissionColour(c);
  const bands = c.bands.length ? c.bands.map((b) => b.nm).join(', ') + ' nm' : '—';
  return `| ${c.name} | ${c.emitter} | ${bands} | ${(c.continuum * 100).toFixed(0)}% at ${c.continuumK} K | ${e.xy[0].toFixed(3)}, ${e.xy[1].toFixed(3)} | ${e.inSrgb ? 'yes' : 'no'} | ${e.inP3 ? 'yes' : 'no'} | \`${css(e.srgb, false)}\` | \`${css(e.wide, true)}\` |`;
});

const md = `# Star colours from emission spectra

Story 2.2. Each composition's spectrum (its bands as Gaussians, plus a blackbody continuum carrying the given share of the power) integrated against the CIE 1931 2° observer (Wyman, Sloan and Shirley's fit), then mapped into sRGB and Display P3 as a light: a colour outside the gamut becomes the most saturated colour of its hue the gamut holds. Made by \`node experiments/emission-table.ts\` from \`src/gpu/spectra/emission.ts\`; checked by \`tests/spectra.test.ts\`.

Band centres are from the pyrotechnic literature, rounded; widths and strengths are rough. The swatches are the mapped colours at full brightness, as CSS.

| Composition | Emitter | Bands | Continuum | x, y | In sRGB | In P3 | sRGB | Display P3 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n')}

## What the numbers say

- **Every strong firework colour is outside sRGB.** Strontium red, barium green, copper blue, sodium yellow, calcium orange and the violet all fall outside it. On an sRGB canvas each is shown as the most saturated colour of its hue that sRGB has, which is always duller than the real one.
- **Display P3 holds the red and the gold, not the green or the blue.** Strontium red (x 0.661) and charcoal gold fit inside P3, so a P3 canvas shows them as they are. Barium green and copper blue are outside P3 too: the green is far beyond P3's green primary, and the blue is nearly on the spectral locus.
- **The continuum is the purity.** A blackbody behind the bands pulls every colour towards white. A star with more magnesium in it burns brighter and paler, which is the trade a pyrotechnist makes; the \`continuum\` share is that trade.
- **Gold and white are not colours a salt gives.** They are glowing particles: charcoal and iron at about 1 900 K for gold, magnesium and aluminium oxides at over 3 000 K for white.
- **A light maps by its cusp, not at its lightness.** The shared gamut mapping, made for surfaces, keeps lightness and reduces chroma, and turned copper blue into a pale lavender, because every blue the gamut holds is dark. A light's brightness is free, so it maps to the cusp of its hue.
`;
writeFileSync('docs/studies/emission-colour.md', md);
console.log('wrote docs/studies/emission-colour.md');
