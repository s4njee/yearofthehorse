/*
 * The Hero's Journey's story 3.1: OKLab and OKLCH (Björn Ottosson, "A perceptual color space for image processing",
 * 2020), the space every colour operation in this family runs in. TypeScript twin of
 * src/wgsl/oklab.wgsl; tests/oklab.test.ts checks the two agree.
 *
 * Why it matters here: a hue turned in OKLCH keeps its perceived lightness, where one turned in
 * RGB or HSV swings it. But perceived lightness is not relative luminance, which is what the flash
 * analyser measures: at fixed L a saturated blue has far less luminance than a saturated yellow.
 * So there are two hue rotations. `rotateHue` is the perceptual one; `rotateHueAtLuminance` keeps
 * the colour's relative luminance exactly, by re-solving L after the turn, and is the one a
 * cycling colour uses when it fills a large area.
 */

export type Vec3 = [number, number, number];

/** Rec. 709 / sRGB relative luminance of linear RGB. */
export function luminance(c: Readonly<Vec3>): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

const cbrt = (x: number) => Math.sign(x) * Math.abs(x) ** (1 / 3);

/** Linear sRGB to OKLab (L about 0..1, a and b about -0.4..0.4). */
export function linearToOklab(c: Readonly<Vec3>): Vec3 {
  const l = cbrt(0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2]);
  const m = cbrt(0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2]);
  const s = cbrt(0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2]);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToLinear(lab: Readonly<Vec3>): Vec3 {
  const l = (lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2]) ** 3;
  const m = (lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2]) ** 3;
  const s = (lab[0] - 0.0894841775 * lab[1] - 1.291485548 * lab[2]) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** OKLab to OKLCH: lightness, chroma, hue in radians (-π..π). */
export function oklabToOklch(lab: Readonly<Vec3>): Vec3 {
  return [lab[0], Math.hypot(lab[1], lab[2]), Math.atan2(lab[2], lab[1])];
}

export function oklchToOklab(lch: Readonly<Vec3>): Vec3 {
  return [lch[0], lch[1] * Math.cos(lch[2]), lch[1] * Math.sin(lch[2])];
}

export const linearToOklch = (c: Readonly<Vec3>): Vec3 => oklabToOklch(linearToOklab(c));
export const oklchToLinear = (lch: Readonly<Vec3>): Vec3 => oklabToLinear(oklchToOklab(lch));

/** Whether linear RGB is inside the 0..`max` cube, with a little slack for rounding. */
export function inGamut(c: Readonly<Vec3>, max = 1): boolean {
  const e = 1e-4;
  return c.every((x) => x >= -e && x <= max + e);
}

/** Steps of the chroma search; 2^-16 of the chroma, invisible. The WGSL twin uses the same. */
export const GAMUT_STEPS = 16;

/**
 * An OKLCH colour brought into the 0..`max` RGB cube by reducing chroma at fixed lightness and
 * hue, never by clipping channels (which shifts hue and lightness). Lightness is clamped to the
 * cube's range first.
 */
export function gamutMapOklch(lch: Readonly<Vec3>, max = 1): Vec3 {
  const top = linearToOklab([max, max, max])[0];
  const L = Math.min(top, Math.max(0, lch[0]));
  if (inGamut(oklchToLinear([L, lch[1], lch[2]]), max)) return [L, lch[1], lch[2]];
  let lo = 0;
  let hi = lch[1];
  for (let i = 0; i < GAMUT_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinear([L, mid, lch[2]]), max)) lo = mid;
    else hi = mid;
  }
  return [L, lo, lch[2]];
}

/** Linear RGB brought into the cube by `gamutMapOklch`, and clamped for the last rounding. */
export function gamutMap(c: Readonly<Vec3>, max = 1): Vec3 {
  const out = oklchToLinear(gamutMapOklch(linearToOklch(c), max));
  return out.map((x) => Math.min(max, Math.max(0, x))) as Vec3;
}

/** Turns the hue by `radians` at fixed OKLCH lightness and chroma. May leave the gamut. */
export function rotateHue(c: Readonly<Vec3>, radians: number): Vec3 {
  const [L, C, h] = linearToOklch(c);
  return oklchToLinear([L, C, h + radians]);
}

/** Scales OKLCH chroma by `factor` at fixed lightness and hue. May leave the gamut. */
export function scaleChroma(c: Readonly<Vec3>, factor: number): Vec3 {
  const [L, C, h] = linearToOklch(c);
  return oklchToLinear([L, C * factor, h]);
}

/** Steps of the lightness search in `atLuminance`. */
export const LUMINANCE_STEPS = 20;

/**
 * The OKLCH lightness at which chroma `C` and hue `h` have relative luminance `y`: luminance
 * rises with L at fixed C and h, so a bisection finds it. Clamped to 0..1.
 */
export function lightnessForLuminance(y: number, C: number, h: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < LUMINANCE_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (luminance(oklchToLinear([mid, C, h])) < y) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Turns the hue by `radians` keeping the colour's relative luminance: chroma held, lightness
 * re-solved. A large area cycling through this cannot make a luminance flash, only (if it passes
 * through saturated red) a red one, which story 2.3 caps.
 */
export function rotateHueAtLuminance(c: Readonly<Vec3>, radians: number): Vec3 {
  const [, C, h] = linearToOklch(c);
  return oklchToLinear([lightnessForLuminance(luminance(c), C, h + radians), C, h + radians]);
}
