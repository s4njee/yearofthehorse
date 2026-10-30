import { oklchToLinear, type Vec3 } from '../colour/oklab.ts';
import { gamutMapOklchIn, type Gamut } from '../colour/wide-gamut.ts';
import { flickerOffset, FLICKER_SAFE_MAX_RATE } from '../flicker.ts';

/*
 * The Hero's Journey's story 2.3: caps on colour change. TypeScript twin of src/wgsl/colour-caps.wgsl.
 *
 * Hue cycling is this family's commonest motion, and WCAG 2.3.1 has two ways for it to flash:
 *
 * - A red flash: a transition involving a saturated red, R / (R + G + B) of 0.8 or more. A hue
 *   that turns through red makes one at every turn, at any lightness. `capRed` takes chroma away
 *   at fixed lightness and hue until the colour's red share is at most `RED_SAFE_SATURATION`,
 *   below WCAG's 0.8, so a colour that has been through it can never take part in a red flash,
 *   however fast or often its hue passes red. That is stronger than a speed limit near red.
 * - A general flash: a change in relative luminance of a tenth of full white. A turn at fixed
 *   OKLCH lightness moves luminance by at most 9.75% anywhere in the sRGB gamut (L 0.85,
 *   chroma 0.3), so hue alone does not flash in sRGB, but with little margin at high lightness
 *   and chroma. Under `HUE_FLASH_CHROMA` the swing is under half the step at every lightness, so
 *   hue may move freely. Above it, or in a wider gamut, turn hue at fixed luminance
 *   (`rotateHueAtLuminance`).
 *
 * On top of that, comfort: a whole field cycling hue faster than `HUE_SAFE_MAX_SPEED` turns a
 * second is unpleasant before it is dangerous, and a hue that wobbles back and forth is band
 * limited like Fire Temple's flicker, at most `FLICKER_SAFE_MAX_RATE` reversals a second.
 * `tests/colour-caps.test.ts` runs the worst allowed settings through the flash analyser.
 */

/** Largest red share R / (R + G + B) an animated colour may have. WCAG's red flash needs 0.8. */
export const RED_SAFE_SATURATION = 0.75;
/** Under this chroma a hue turn at fixed OKLCH lightness moves luminance by under 5% of white. */
export const HUE_FLASH_CHROMA = 0.08;
/** Whole-field hue speed, turns a second. A full turn every two seconds. */
export const HUE_SAFE_MAX_SPEED = 0.5;
/** Largest back-and-forth wobble of hue, in turns either way. */
export const HUE_SAFE_MAX_WOBBLE = 0.125;
/** Bisection steps for `capRed`, as `GAMUT_STEPS` for the gamut map. */
export const RED_STEPS = 16;

/** R / (R + G + B) of a linear colour, negatives as zero; 1/3 for black. */
export function redShare(c: Readonly<Vec3>): number {
  const r = Math.max(0, c[0]);
  const sum = r + Math.max(0, c[1]) + Math.max(0, c[2]);
  return sum > 1e-6 ? r / sum : 1 / 3;
}

/**
 * The OKLCH colour with its chroma reduced, at fixed lightness and hue, until its red share is at
 * most `limit`. Colours already under it are returned unchanged.
 */
export function capRed(lch: Readonly<Vec3>, limit = RED_SAFE_SATURATION): Vec3 {
  if (redShare(oklchToLinear(lch)) <= limit) return [lch[0], lch[1], lch[2]];
  let lo = 0;
  let hi = lch[1];
  for (let i = 0; i < RED_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (redShare(oklchToLinear([lch[0], mid, lch[2]])) <= limit) lo = mid;
    else hi = mid;
  }
  return [lch[0], lo, lch[2]];
}

/**
 * An OKLCH colour that is safe to animate: in the sRGB gamut (or P3's, story 3.3), up to `max`,
 * then red-capped. In P3 the red share is still taken in sRGB primaries, negatives as zero, so a
 * red beyond sRGB counts as fully red and is capped: conservative, since WCAG defines red only
 * for sRGB.
 */
export function safeColour(lch: Readonly<Vec3>, max = 1, gamut: Gamut = 'srgb'): Vec3 {
  return capRed(gamutMapOklchIn(lch, gamut, max));
}

export interface HueMotion {
  /** Turns a second, either way. */
  speed: number;
  /** Back-and-forth wobble, turns either way. */
  wobble: number;
  /** Reversals a second of the wobble. */
  wobbleRate: number;
}

/** The nearest settings inside the caps. NaN becomes 0. Idempotent. */
export function hueMotionClamp(motion: Readonly<HueMotion>): HueMotion {
  const clamp = (v: number, lo: number, hi: number) => (v > lo ? (v < hi ? v : hi) : lo);
  return {
    speed: clamp(motion.speed, -HUE_SAFE_MAX_SPEED, HUE_SAFE_MAX_SPEED),
    wobble: clamp(motion.wobble, 0, HUE_SAFE_MAX_WOBBLE),
    wobbleRate: clamp(motion.wobbleRate, 0, FLICKER_SAFE_MAX_RATE),
  };
}

/**
 * A hue offset in radians at time `t`: a steady turn plus a band-limited wobble, after
 * `hueMotionClamp`. Add it to a base hue; different seeds wobble independently.
 */
export function hueAt(t: number, seed: number, motion: Readonly<HueMotion>): number {
  const m = hueMotionClamp(motion);
  const wobble =
    m.wobble > 0
      ? m.wobble *
        flickerOffset(t, seed, { rate: m.wobbleRate, depth: 0, shimmer: 0, shimmerRate: 0 })[0]
      : 0;
  return 2 * Math.PI * (m.speed * t + wobble);
}
