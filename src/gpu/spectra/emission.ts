import { linearToOklch, luminance, oklchToLinear, type Vec3 } from '../colour/oklab.ts';
import {
  gamutMapOklchIn,
  inGamutOf,
  p3ToSrgb,
  srgbToP3,
  type Gamut,
} from '../colour/wide-gamut.ts';

/*
 * Story 2.2: the colour of a star from the light it emits.
 *
 * A firework star is coloured by the hot molecules and atoms of its metal salt, each emitting in
 * a few bands: strontium's monochloride and monohydroxide in the red, barium's monochloride in
 * the green, copper's monochloride in the blue, sodium's two lines in the yellow. Behind the bands
 * is a continuum: hot solid particles (magnesium oxide, carbon) glowing as a blackbody, which
 * washes the colour towards white. A composition is its bands plus that continuum, and its colour
 * is the spectrum integrated against the CIE 1931 observer, to XYZ and then to linear sRGB
 * primaries (channels may go below zero when it is outside sRGB) and Display P3.
 *
 * The colour matching functions are Wyman, Sloan and Shirley's multi-lobe fit (JCGT 2013), so no
 * table is shipped. Band centres are from the pyrotechnic literature (Shimizu; Conkling and
 * Mocella; Russell), rounded to the nanometre; their widths and strengths are rough, chosen so
 * each species' bands have the weights the spectra in those books show. Everything here runs once
 * per composition on the CPU; shaders get the resulting colours.
 */

export interface Band {
  /** Centre, nanometres. */
  nm: number;
  /** Full width at half maximum, nanometres. */
  fwhm: number;
  /** Relative strength (peak radiance). */
  strength: number;
}

export interface Composition {
  id: string;
  name: string;
  /** What gives the colour. */
  emitter: string;
  bands: readonly Band[];
  /** Blackbody continuum temperature, kelvin. */
  continuumK: number;
  /** Share of the emitted power (380–780 nm) in the continuum, 0 to 1. */
  continuum: number;
  /**
   * A typical star's luminance relative to a strontium red one: rough, from how bright each looks
   * beside the others in a display. Copper blue is the weakest colour a pyrotechnist can make.
   */
  brightness: number;
}

/** Gaussian lobe with different widths either side of its peak. */
function lobe(nm: number, mu: number, left: number, right: number): number {
  const t = (nm - mu) / (nm < mu ? left : right);
  return Math.exp(-0.5 * t * t);
}

/** CIE 1931 2° colour matching functions, Wyman, Sloan and Shirley's multi-lobe fit. */
export function cie1931(nm: number): Vec3 {
  return [
    1.056 * lobe(nm, 599.8, 37.9, 31.0) +
      0.362 * lobe(nm, 442.0, 16.0, 26.7) -
      0.065 * lobe(nm, 501.1, 20.4, 26.2),
    0.821 * lobe(nm, 568.8, 46.9, 40.5) + 0.286 * lobe(nm, 530.9, 16.3, 31.1),
    1.217 * lobe(nm, 437.0, 11.8, 36.0) + 0.681 * lobe(nm, 459.0, 26.0, 13.8),
  ];
}

/** XYZ (D65) to linear sRGB primaries (IEC 61966-2-1). */
export function xyzToLinearSrgb([x, y, z]: Readonly<Vec3>): Vec3 {
  return [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ];
}

/** Planck's law, spectral radiance up to a constant, at `nm` and `kelvin`. */
export function planck(nm: number, kelvin: number): number {
  const m = nm * 1e-9;
  return 1 / (m ** 5 * (Math.exp(0.014387769 / (m * kelvin)) - 1));
}

const STEP = 0.5;
const LO = 380;
const HI = 780;

function integrate(spectrum: (nm: number) => number): { xyz: Vec3; power: number } {
  const xyz: Vec3 = [0, 0, 0];
  let power = 0;
  for (let nm = LO; nm <= HI; nm += STEP) {
    const s = spectrum(nm);
    const [x, y, z] = cie1931(nm);
    xyz[0] += s * x * STEP;
    xyz[1] += s * y * STEP;
    xyz[2] += s * z * STEP;
    power += s * STEP;
  }
  return { xyz, power };
}

/** A composition's spectrum, its bands and continuum in their power shares, up to a constant. */
export function spectrumOf(c: Composition): (nm: number) => number {
  const bands = (nm: number) =>
    c.bands.reduce((sum, b) => {
      const t = (nm - b.nm) / (b.fwhm / 2.3548);
      return sum + b.strength * Math.exp(-0.5 * t * t);
    }, 0);
  const bandPower = integrate(bands).power;
  const bodyPower = integrate((nm) => planck(nm, c.continuumK)).power;
  const wb = bandPower > 0 ? (1 - c.continuum) / bandPower : 0;
  const wc = bodyPower > 0 ? c.continuum / bodyPower : 0;
  return (nm) => wb * bands(nm) + wc * planck(nm, c.continuumK);
}

export interface EmissionColour {
  id: string;
  /** CIE 1931 chromaticity. */
  xy: [number, number];
  /** Linear sRGB primaries at luminance 1; a channel below zero is outside sRGB. */
  linear: Vec3;
  /** The same colour in linear Display P3 primaries. */
  p3: Vec3;
  inSrgb: boolean;
  inP3: boolean;
  /** Mapped into each gamut by chroma at fixed lightness and hue (OKLCH), luminance 1. */
  srgb: Vec3;
  /** In linear sRGB primaries, inside P3. */
  wide: Vec3;
}

/**
 * Into `gamut` as a light: a light's brightness is free, so a colour outside the gamut becomes the
 * most saturated one of its hue the gamut holds (the cusp, over every lightness), at luminance 1.
 * Mapping at fixed lightness, as for a surface, turns copper blue into a pale lavender, because
 * the gamut's blues are all dark.
 */
function mapped(c: Readonly<Vec3>, gamut: Gamut): Vec3 {
  const unit = scaleTo(c, 0.18);
  if (inGamutOf(unit, gamut)) return scaleTo(c, 1);
  const [, chroma, hue] = linearToOklch(unit);
  let best: Vec3 = [0.5, 0, hue];
  for (let L = 0.05; L <= 0.995; L += 0.01) {
    const fit = gamutMapOklchIn([L, chroma, hue], gamut);
    if (fit[1] > best[1]) best = fit;
  }
  // The chroma search stops a hair outside the cube; clear the residue in the gamut's own primaries.
  const rgb = oklchToLinear(best);
  const clean =
    gamut === 'p3'
      ? p3ToSrgb(srgbToP3(rgb).map((v) => Math.max(0, v)) as Vec3)
      : (rgb.map((v) => Math.max(0, v)) as Vec3);
  return scaleTo(clean, 1);
}

function scaleTo(c: Readonly<Vec3>, y: number): Vec3 {
  const l = luminance(c);
  return [(c[0] * y) / l, (c[1] * y) / l, (c[2] * y) / l];
}

export function emissionColour(c: Composition): EmissionColour {
  const { xyz } = integrate(spectrumOf(c));
  const sum = xyz[0] + xyz[1] + xyz[2];
  const linear = scaleTo(xyzToLinearSrgb(xyz), 1);
  const p3: Vec3 = [
    0.8224621 * linear[0] + 0.177538 * linear[1],
    0.0331941 * linear[0] + 0.9668058 * linear[1],
    0.0170827 * linear[0] + 0.0723974 * linear[1] + 0.9105199 * linear[2],
  ];
  return {
    id: c.id,
    xy: [xyz[0] / sum, xyz[1] / sum],
    linear,
    p3,
    inSrgb: inGamutOf(scaleTo(linear, 0.18), 'srgb'),
    inP3: inGamutOf(scaleTo(linear, 0.18), 'p3'),
    srgb: mapped(linear, 'srgb'),
    wide: mapped(linear, 'p3'),
  };
}

/**
 * The colour-giving compositions. Continuum shares are for a well-made star; a star with more
 * magnesium burns brighter and paler (story 2.2's purity sweep).
 */
export const COMPOSITIONS: readonly Composition[] = [
  {
    id: 'strontium',
    name: 'Strontium red',
    emitter: 'SrCl and SrOH',
    bands: [
      { nm: 606, fwhm: 8, strength: 0.35 },
      { nm: 636, fwhm: 6, strength: 1 },
      { nm: 648, fwhm: 6, strength: 0.8 },
      { nm: 662, fwhm: 6, strength: 0.6 },
      { nm: 682, fwhm: 14, strength: 0.7 },
    ],
    continuumK: 2400,
    continuum: 0.15,
    brightness: 1.0,
  },
  {
    id: 'barium',
    name: 'Barium green',
    emitter: 'BaCl',
    bands: [
      { nm: 507, fwhm: 5, strength: 0.6 },
      { nm: 513, fwhm: 5, strength: 1 },
      { nm: 517, fwhm: 5, strength: 0.7 },
      { nm: 524, fwhm: 5, strength: 0.9 },
      { nm: 532, fwhm: 5, strength: 0.6 },
    ],
    continuumK: 2400,
    continuum: 0.2,
    brightness: 0.9,
  },
  {
    id: 'copper',
    name: 'Copper blue',
    emitter: 'CuCl',
    bands: [
      { nm: 428, fwhm: 6, strength: 0.7 },
      { nm: 435, fwhm: 6, strength: 0.9 },
      { nm: 443, fwhm: 6, strength: 1 },
      { nm: 452, fwhm: 6, strength: 0.8 },
      { nm: 476, fwhm: 8, strength: 0.4 },
      { nm: 488, fwhm: 8, strength: 0.3 },
    ],
    // CuCl breaks up above about 1 200 °C, so a blue star burns cool, and its continuum is warm.
    continuumK: 1800,
    continuum: 0.2,
    brightness: 0.35,
  },
  {
    id: 'sodium',
    name: 'Sodium yellow',
    emitter: 'Na (the D lines)',
    bands: [
      { nm: 589.0, fwhm: 1.5, strength: 1 },
      { nm: 589.6, fwhm: 1.5, strength: 0.5 },
    ],
    continuumK: 2400,
    continuum: 0.1,
    brightness: 1.5,
  },
  {
    id: 'calcium',
    name: 'Calcium orange',
    emitter: 'CaCl and CaOH',
    bands: [
      { nm: 554, fwhm: 12, strength: 0.25 },
      { nm: 593, fwhm: 8, strength: 1 },
      { nm: 618, fwhm: 10, strength: 0.7 },
      { nm: 622, fwhm: 12, strength: 0.6 },
    ],
    continuumK: 2400,
    continuum: 0.15,
    brightness: 1.0,
  },
  {
    id: 'violet',
    name: 'Violet (strontium and copper)',
    emitter: 'SrCl and CuCl together',
    bands: [
      { nm: 428, fwhm: 6, strength: 0.6 },
      { nm: 435, fwhm: 6, strength: 0.8 },
      { nm: 443, fwhm: 6, strength: 0.9 },
      { nm: 452, fwhm: 6, strength: 0.7 },
      { nm: 636, fwhm: 6, strength: 0.6 },
      { nm: 648, fwhm: 6, strength: 0.5 },
      { nm: 662, fwhm: 6, strength: 0.4 },
    ],
    continuumK: 1900,
    continuum: 0.15,
    brightness: 0.45,
  },
  {
    id: 'gold',
    name: 'Charcoal gold',
    emitter: 'charcoal and iron sparks, glowing',
    bands: [],
    continuumK: 1900,
    continuum: 1,
    brightness: 0.8,
  },
  {
    id: 'white',
    name: 'Magnesium white',
    emitter: 'MgO and Al2O3 particles, glowing',
    bands: [],
    continuumK: 3300,
    continuum: 1,
    brightness: 1.8,
  },
];

export const compositionById = (id: string): Composition => {
  const c = COMPOSITIONS.find((x) => x.id === id);
  if (!c) throw new Error(`No composition ${id}`);
  return c;
};

/**
 * Each composition's colour for drawing, in linear sRGB primaries at its own brightness: mapped
 * into sRGB, or (on a confirmed Display P3 canvas) into P3, where its channels may go below zero.
 */
export function starColours(gamut: Gamut): Map<string, Vec3> {
  return new Map(
    COMPOSITIONS.map((c) => {
      const e = emissionColour(c);
      const rgb = gamut === 'p3' ? e.wide : e.srgb;
      return [c.id, [rgb[0] * c.brightness, rgb[1] * c.brightness, rgb[2] * c.brightness]];
    }),
  );
}
