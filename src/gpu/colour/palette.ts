import { safeColour } from '../safety/colour-caps.ts';
import { FLICKER_FLASH_DARK, FLICKER_FLASH_DELTA } from '../flicker.ts';
import {
  lightnessForLuminance,
  linearToOklch,
  luminance,
  oklabToOklch,
  oklchToOklab,
  oklchToLinear,
  type Vec3,
} from './oklab.ts';

/*
 * The Hero's Journey's story 3.2: palettes. TypeScript twin of src/wgsl/palette.wgsl.
 *
 * Two kinds:
 *
 * - Cosine palettes (Quílez): colour(t) = a + b cos(2π (c t + d)), per RGB channel. Four vectors
 *   make a whole smooth palette, cheap enough per pixel. They are defined in RGB, so they are
 *   brought into gamut and red-capped through OKLCH before use (`cosinePalette`).
 * - Gradient palettes: OKLCH stops, evenly spaced, interpolated in OKLab and red-capped. This is
 *   the kind the shell's palette editor edits, and the URL carries (`formatPalette`).
 *
 * Every colour that leaves here is through `safeColour`, so a palette can be cycled at any speed
 * without a red flash. Cycling still moves lightness: `paletteFlashes` counts the general flashes
 * one cycle of a palette makes over a large area, and `safePaletteSpeed` the fastest cycle that
 * keeps it under WCAG 2.3.1 with a margin.
 */

/** OKLCH: lightness 0..1, chroma, hue in radians. */
export type PaletteStop = Vec3;

export interface CosinePalette {
  a: Vec3;
  b: Vec3;
  c: Vec3;
  d: Vec3;
}

/** Quílez's cosine palette at `t`, raw: may leave the gamut, and is not red-capped. */
export function cosineRaw(p: Readonly<CosinePalette>, t: number): Vec3 {
  return [0, 1, 2].map(
    (i) => p.a[i]! + p.b[i]! * Math.cos(2 * Math.PI * (p.c[i]! * t + p.d[i]!)),
  ) as Vec3;
}

/** A cosine palette read as sRGB-encoded colour (as Quílez's are), made safe: linear RGB out. */
export function cosinePalette(p: Readonly<CosinePalette>, t: number): Vec3 {
  const encoded = cosineRaw(p, t).map((v) => Math.min(1, Math.max(0, v)));
  const linear = encoded.map((v) =>
    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  ) as Vec3;
  return oklchToLinear(safeColour(linearToOklch(linear)));
}

/**
 * A gradient palette at `t`: stops evenly spaced over 0..1 (the last back to the first when
 * `cyclic`), interpolated in OKLab, then made safe. Linear RGB out.
 */
export function samplePalette(stops: readonly PaletteStop[], t: number, cyclic = true): Vec3 {
  if (stops.length === 0) return [0, 0, 0];
  if (stops.length === 1) return oklchToLinear(safeColour(stops[0]!));
  const segments = cyclic ? stops.length : stops.length - 1;
  const u = cyclic ? (((t % 1) + 1) % 1) * segments : Math.min(1, Math.max(0, t)) * segments;
  const i = Math.min(segments - 1, Math.floor(u));
  const f = u - i;
  const a = oklchToOklab(stops[i]!);
  const b = oklchToOklab(stops[(i + 1) % stops.length]!);
  const lab: Vec3 = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  return oklchToLinear(safeColour(oklabToOklch(lab)));
}

/** Samples a palette into `count` linear RGBA texels (alpha 1), for a 1D palette texture. */
export function bakePalette(
  stops: readonly PaletteStop[],
  count = 256,
  cyclic = true,
): Float32Array {
  const out = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    // Texel centres, so linear filtering with repeat addressing wraps a cyclic palette smoothly.
    const c = samplePalette(stops, (i + 0.5) / count, cyclic);
    out.set([c[0], c[1], c[2], 1], i * 4);
  }
  return out;
}

const DEG = Math.PI / 180;

/** Named palettes: OKLCH stops, hues in degrees here for reading. */
const NAMED: Record<string, [number, number, number][]> = {
  // Violet to magenta to amber: The Hero's Journey's own.
  journey: [
    [0.42, 0.14, 300],
    [0.6, 0.18, 345],
    [0.78, 0.13, 70],
    [0.55, 0.12, 250],
  ],
  // Deep greens and teals, a pale fungal cream.
  mycelium: [
    [0.35, 0.07, 160],
    [0.62, 0.1, 185],
    [0.88, 0.05, 95],
    [0.5, 0.09, 140],
  ],
  // The aurora's greens over violet.
  aurora: [
    [0.3, 0.1, 290],
    [0.72, 0.16, 150],
    [0.55, 0.12, 200],
    [0.4, 0.13, 320],
  ],
  // Saturated and light: sweets, the hardest on the red cap.
  candy: [
    [0.72, 0.17, 0],
    [0.82, 0.14, 95],
    [0.75, 0.13, 200],
    [0.7, 0.16, 310],
  ],
  // A full turn of hue at one lightness: the classic hue cycle, without its brightness change.
  spectrum: [
    [0.7, 0.13, 30],
    [0.7, 0.13, 120],
    [0.7, 0.13, 210],
    [0.7, 0.13, 300],
  ],
};

export const PALETTE_NAMES = Object.keys(NAMED) as readonly string[];

export function namedPalette(name: string): PaletteStop[] {
  return (NAMED[name] ?? NAMED.journey!).map(([L, C, h]) => [L, C, h * DEG]);
}

/**
 * URL and editor text for a palette: `L C h` per stop, hue in degrees, stops separated by
 * commas, e.g. `0.42 0.14 300,0.6 0.18 345`. Short enough for a link.
 */
export function formatPalette(stops: readonly PaletteStop[]): string {
  const r = (v: number, digits: number) => String(Number(v.toFixed(digits)));
  return stops
    .map(([L, C, h]) => `${r(L, 3)} ${r(C, 3)} ${r((((h / DEG) % 360) + 360) % 360, 1)}`)
    .join(',');
}

/** Most stops a palette may have. */
export const MAX_STOPS = 8;

/** Parses `formatPalette` text, or returns undefined if it is malformed or out of range. */
export function parsePalette(text: string): PaletteStop[] | undefined {
  const parts = text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2 || parts.length > MAX_STOPS) return undefined;
  const stops: PaletteStop[] = [];
  for (const part of parts) {
    const numbers = part.split(/\s+/).map(Number);
    if (numbers.length !== 3 || numbers.some((v) => !Number.isFinite(v))) return undefined;
    const [L, C, h] = numbers as [number, number, number];
    if (L < 0 || L > 1 || C < 0 || C > 0.4) return undefined;
    stops.push([L, C, h * DEG]);
  }
  return stops;
}

/**
 * General flashes (pairs of opposing 10% luminance changes, darker end under 0.8) that one cycle
 * of a palette makes, as seen by a point the palette slides past. Counted over two cycles and
 * halved, so a flash across the wrap is not missed.
 */
export function paletteFlashes(stops: readonly PaletteStop[], cyclic = true): number {
  const samples = 512;
  const ys: number[] = [];
  for (let i = 0; i < 2 * samples; i++)
    ys.push(luminance(samplePalette(stops, i / samples, cyclic)));
  let transitions = 0;
  let anchor = ys[0]!;
  let direction = 0;
  for (const y of ys) {
    if ((direction > 0 && y > anchor) || (direction < 0 && y < anchor)) {
      anchor = y;
      continue;
    }
    if (Math.abs(y - anchor) >= FLICKER_FLASH_DELTA && Math.min(y, anchor) < FLICKER_FLASH_DARK) {
      direction = Math.sign(y - anchor);
      transitions++;
      anchor = y;
    }
  }
  return transitions / 2 / 2;
}

/**
 * The fastest cycle, in palette turns a second, that keeps a large area cycling through this
 * palette at or under two flashes a second: a margin of one under WCAG's three.
 */
export function safePaletteSpeed(stops: readonly PaletteStop[], cyclic = true): number {
  const flashes = paletteFlashes(stops, cyclic);
  return flashes > 0 ? 2 / flashes : Infinity;
}

/** The light–dark step of relative luminance over a palette's baked texels: max minus min. */
export function paletteStep(stops: readonly PaletteStop[], cyclic = true): number {
  const texels = bakePalette(stops, 64, cyclic);
  let low = Infinity;
  let high = -Infinity;
  for (let i = 0; i < texels.length; i += 4) {
    const y = luminance([texels[i]!, texels[i + 1]!, texels[i + 2]!]);
    low = Math.min(low, y);
    high = Math.max(high, y);
  }
  return high - low;
}

/**
 * The palette with its stops' luminances drawn towards their mean, each stop keeping its chroma
 * and hue and taking the lightness that gives its new luminance (`lightnessForLuminance`; a
 * narrowed lightness alone would not do, since equal lightness is not equal luminance), until the
 * baked palette's light–dark step is at most `step`. Interpolation between stops leaves a small
 * floor (under 0.01 for the named palettes) that no narrowing removes. A palette already under
 * `step` is returned unchanged. This is how an effect keeps any palette, including one edited by
 * hand, from drawing clearly discernible stripes (story 2.2: a step of 0.1).
 */
export function limitPaletteStep(
  stops: readonly PaletteStop[],
  step: number,
  cyclic = true,
): PaletteStop[] {
  const ys = stops.map((stop) => luminance(oklchToLinear(safeColour(stop))));
  const mean = ys.reduce((sum, y) => sum + y, 0) / Math.max(1, ys.length);
  const scaled = (k: number): PaletteStop[] =>
    stops.map(([, C, h], i) => [lightnessForLuminance(mean + k * (ys[i]! - mean), C, h), C, h]);
  if (paletteStep(stops, cyclic) <= step) return stops.map((s) => [...s] as PaletteStop);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (paletteStep(scaled(mid), cyclic) <= step) lo = mid;
    else hi = mid;
  }
  return scaled(lo);
}
