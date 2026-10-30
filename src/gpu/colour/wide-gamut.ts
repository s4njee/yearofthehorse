import { inGamut, linearToOklab, oklchToLinear, type Vec3 } from './oklab.ts';

/*
 * The Hero's Journey's story 3.3: wide gamut, opt-in. TypeScript twin of src/wgsl/gamut.wgsl.
 *
 * Effects keep drawing linear sRGB-primaries radiance, as every temple does, but in a wide-gamut
 * effect a colour may leave the sRGB cube (a channel below zero) as long as it is inside Display
 * P3. The tail converts the scene to linear P3 primaries before tonemapping (`createHdrTail` with
 * `gamut: 'p3'`), and the canvas is configured `colorSpace: 'display-p3'`, which uses the sRGB
 * transfer curve, so the output pass encodes it unchanged. On an sRGB display, or wherever the
 * page did not ask, the same effect maps its colours into sRGB by chroma (story 3.1), never by
 * clipping channels. `EffectContext.gamut` says which the effect got.
 *
 * Matrices from CSS Color 4 (both D65).
 */

export type Gamut = 'srgb' | 'p3';

/** Linear sRGB to linear Display P3, row-major. */
export const SRGB_TO_P3 = [
  0.8224621, 0.177538, 0.0, 0.0331941, 0.9668058, 0.0, 0.0170827, 0.0723974, 0.9105199,
] as const;
/** Linear Display P3 to linear sRGB, row-major. */
export const P3_TO_SRGB = [
  1.2249401, -0.2249404, 0.0, -0.0420569, 1.0420571, 0.0, -0.0196376, -0.0786361, 1.0982735,
] as const;

const apply = (m: readonly number[], c: Readonly<Vec3>): Vec3 => [
  m[0]! * c[0] + m[1]! * c[1] + m[2]! * c[2],
  m[3]! * c[0] + m[4]! * c[1] + m[5]! * c[2],
  m[6]! * c[0] + m[7]! * c[1] + m[8]! * c[2],
];

export const srgbToP3 = (c: Readonly<Vec3>): Vec3 => apply(SRGB_TO_P3, c);
export const p3ToSrgb = (c: Readonly<Vec3>): Vec3 => apply(P3_TO_SRGB, c);

/** Whether a linear sRGB-primaries colour (channels may be negative) is inside `gamut`'s cube. */
export function inGamutOf(c: Readonly<Vec3>, gamut: Gamut, max = 1): boolean {
  return inGamut(gamut === 'p3' ? srgbToP3(c) : c, max);
}

/**
 * Like `gamutMapOklch`, into either gamut: chroma reduced at fixed lightness and hue until the
 * colour fits. 16 bisection steps.
 */
export function gamutMapOklchIn(lch: Readonly<Vec3>, gamut: Gamut, max = 1): Vec3 {
  const top = linearToOklab([max, max, max])[0];
  const L = Math.min(top, Math.max(0, lch[0]));
  if (inGamutOf(oklchToLinear([L, lch[1], lch[2]]), gamut, max)) return [L, lch[1], lch[2]];
  let lo = 0;
  let hi = lch[1];
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (inGamutOf(oklchToLinear([L, mid, lch[2]]), gamut, max)) lo = mid;
    else hi = mid;
  }
  return [L, lo, lch[2]];
}

/** `(color-gamut: p3)`: the display covers about P3, as the browser sees it. */
export function displaySupportsP3(): boolean {
  return globalThis.matchMedia?.('(color-gamut: p3)').matches ?? false;
}

export interface WideCanvasConfig {
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  /** True when the browser confirmed a `display-p3` configuration. */
  wide: boolean;
  /** Why sRGB was used instead; undefined when `wide`. */
  reason?: string;
}

/**
 * Configures the canvas `colorSpace: 'display-p3'` (premultiplied, as every temple canvas is),
 * confirmed by reading the configuration back; otherwise configures it as plain sRGB. Never
 * throws for lack of support.
 */
export function configureCanvasWide(
  canvas: HTMLCanvasElement,
  device: GPUDevice,
  format: GPUTextureFormat,
  options: { displayIsP3?: () => boolean } = {},
): WideCanvasConfig {
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('No WebGPU context on this canvas');
  const base = { device, format, alphaMode: 'premultiplied' as const };
  if (!(options.displayIsP3 ?? displaySupportsP3)()) {
    context.configure(base);
    return { context, format, wide: false, reason: 'The display does not report the P3 gamut.' };
  }
  try {
    context.configure({ ...base, colorSpace: 'display-p3' });
    const reported = context.getConfiguration?.()?.colorSpace;
    if (reported === 'display-p3') return { context, format, wide: true };
    context.configure(base);
    return {
      context,
      format,
      wide: false,
      reason: `The browser reported ${reported ?? 'no colour space'}.`,
    };
  } catch (error) {
    context.configure(base);
    return { context, format, wide: false, reason: String(error) };
  }
}
