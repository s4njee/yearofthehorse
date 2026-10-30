import { describe, expect, it } from 'vitest';
import { linearToOklch } from '../src/gpu/colour/oklab.ts';
import { inGamutOf, srgbToP3 } from '../src/gpu/colour/wide-gamut.ts';
import {
  cie1931,
  COMPOSITIONS,
  compositionById,
  emissionColour,
  planck,
  spectrumOf,
  xyzToLinearSrgb,
} from '../src/gpu/spectra/emission.ts';

// Story 2.2: star colours from emission spectra.

/** Chromaticity of a spectrum. */
function xy(spectrum: (nm: number) => number): [number, number] {
  let [X, Y, Z] = [0, 0, 0];
  for (let nm = 380; nm <= 780; nm += 0.5) {
    const s = spectrum(nm);
    const [x, y, z] = cie1931(nm);
    X += s * x;
    Y += s * y;
    Z += s * z;
  }
  return [X / (X + Y + Z), Y / (X + Y + Z)];
}

const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return Math.min(d, 2 * Math.PI - d);
};

describe('emission colour', () => {
  it('fits the CIE 1931 observer closely enough', () => {
    // The photopic curve peaks at 555 nm with a value of 1.
    expect(cie1931(555)[1]).toBeCloseTo(1, 1);
    // A 589 nm line sits on the spectral locus near (0.570, 0.430).
    const sodium = xy((nm) => Math.exp(-0.5 * ((nm - 589) / 0.3) ** 2));
    expect(Math.abs(sodium[0] - 0.57)).toBeLessThan(0.01);
    expect(Math.abs(sodium[1] - 0.43)).toBeLessThan(0.01);
    // A 6500 K blackbody is at (0.3135, 0.3237).
    const body = xy((nm) => planck(nm, 6500));
    expect(Math.abs(body[0] - 0.3135)).toBeLessThan(0.006);
    expect(Math.abs(body[1] - 0.3237)).toBeLessThan(0.006);
  });

  it('maps D65 white to equal channels', () => {
    const [r, g, b] = xyzToLinearSrgb([0.95047, 1, 1.08883]);
    for (const c of [r, g, b]) expect(c).toBeCloseTo(1, 3);
  });

  it('puts every star colour inside its gamut, with its hue kept', () => {
    for (const c of COMPOSITIONS) {
      const e = emissionColour(c);
      const at = (v: readonly number[], y: number) =>
        v.map((x) => x * y) as [number, number, number];
      // A light's chromaticity fits when, scaled until its largest channel is 1, it is in the cube.
      const fits = (v: [number, number, number], gamut: 'srgb' | 'p3') => {
        const top = Math.max(...(gamut === 'p3' ? srgbToP3(v) : v));
        return inGamutOf(at(v, 1 / top), gamut, 1.0001);
      };
      expect(fits(e.srgb, 'srgb'), c.id).toBe(true);
      expect(fits(e.wide, 'p3'), c.id).toBe(true);
      const hue = linearToOklch(at(e.linear, 0.18))[2];
      if (linearToOklch(at(e.linear, 0.18))[1] > 0.02) {
        expect(hueGap(hue, linearToOklch(at(e.srgb, 0.18))[2]), c.id).toBeLessThan(0.04);
        expect(hueGap(hue, linearToOklch(at(e.wide, 0.18))[2]), c.id).toBeLessThan(0.04);
      }
    }
  });

  it('finds the strong colours outside sRGB', () => {
    const out = COMPOSITIONS.filter((c) => !emissionColour(c).inSrgb).map((c) => c.id);
    for (const id of ['strontium', 'barium', 'copper', 'sodium']) expect(out).toContain(id);
    expect(emissionColour(compositionById('white')).inSrgb).toBe(true);
  });

  it('washes a star towards white as its continuum grows', () => {
    const base = compositionById('strontium');
    const chroma = (share: number) =>
      linearToOklch(
        emissionColour({ ...base, continuum: share }).srgb.map((v) => v * 0.18) as [
          number,
          number,
          number,
        ],
      )[1];
    const purity = (share: number) => {
      const [x, y] = emissionColour({ ...base, continuum: share }).xy;
      return Math.hypot(x - 0.3127, y - 0.329);
    };
    expect(purity(0.05)).toBeGreaterThan(purity(0.3));
    expect(purity(0.3)).toBeGreaterThan(purity(0.7));
    expect(chroma(0.7)).toBeLessThan(chroma(0.05));
  });

  it('keeps the bands and continuum in their power shares', () => {
    const c = compositionById('barium');
    const spectrum = spectrumOf(c);
    let total = 0;
    for (let nm = 380; nm <= 780; nm += 0.5) total += spectrum(nm) * 0.5;
    expect(total).toBeCloseTo(1, 2);
  });
});
