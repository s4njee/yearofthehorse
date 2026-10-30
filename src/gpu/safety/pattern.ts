import { STRONG_DOSE } from './dose.ts';

/*
 * The Hero's Journey's story 2.2: a spatial pattern analyser, beside the temporal flash analyser (tests/flash.ts).
 *
 * Regular patterns of clearly discernible stripes (gratings, checks, dartboards, spirals) can
 * trigger seizures in pattern-sensitive people without anything flashing. The rule is the ITC's
 * guidance note on flashing images and regular patterns, as the 2004 WCAG working draft converted
 * it for screens (docs/safety.md quotes it): a pattern is potentially harmful when it has more
 * than five light–dark pairs of clearly discernible stripes in any orientation and covers more
 * than 40% of any 355 x 268 CSS-pixel rectangle (a 10° field), or more than 25% if it moves,
 * oscillates, flashes or reverses. Stripes are clearly discernible when the darker bars are below
 * 160 cd/m² and differ from the lighter ones by 20 cd/m² or more: in relative luminance, as
 * WCAG's flash thresholds convert the same numbers, darker below 0.8 and a step of 0.1.
 *
 * 1. Windows. The frame is cut into overlapping 32 x 32 windows at three scales (full, half and
 *    quarter resolution), so stripes from a few pixels to a sixth of the frame wide are seen.
 * 2. Regular. Each window is mean-removed, Hann-windowed and Fourier transformed. It is regular
 *    when its two strongest peaks (a peak is a bin and its neighbours, with its mirror image)
 *    hold at least `PATTERN_REGULARITY` of the window's energy. A grating puts nearly all its
 *    energy in one peak and a checkerboard in two; noise, gradients and photographs spread it.
 * 3. Discernible. The window's 5th percentile of luminance is under `PATTERN_DARK` and its 95th
 *    is at least `PATTERN_STEP` above it.
 * 4. Pairs. Neighbouring flagged windows that agree on the stripes' period and direction form a
 *    region. Its extent along the wave direction, divided by the period, is the number of
 *    light–dark pairs; a region of two windows or more counts when it has more than
 *    `PATTERN_PAIRS`.
 * 5. Polar. Spirals, rings, spokes and rosettes are stripes in polar coordinates about a centre.
 *    The frame is also resampled to log-polar coordinates (angle, log radius) about its centre,
 *    a full turn wide, and run through the same steps; its regions are mapped back onto the
 *    frame. Log-polar is conformal, so its samples are square and its windows see the frame
 *    without stretching. Radii where a turn is shorter than the plane is wide are left out:
 *    there it would read the pixel grid itself.
 * 6. Area. The counted pixels' largest share of any one 10° field fails at `PATTERN_AREA`, or at
 *    `PATTERN_MOVING_AREA` when the pattern changed since a second frame.
 *
 * It is not a certified tool. There is no open reference implementation of pattern analysis to
 * compare it with. It sees luminance only, so an isoluminant colour grating passes, and its
 * regularity measure does not tell rows of dots from scattered blobs, so it misses dot lattices,
 * which the guidance counts.
 * Pure functions on arrays, no DOM and no GPU, so it can move into the temple core.
 */

/** Light–dark step of relative luminance at which stripes are discernible (20 of 200 cd/m²). */
export const PATTERN_STEP = 0.1;
/** The darker bars must be below this relative luminance (160 of 200 cd/m²). */
export const PATTERN_DARK = 0.8;
/** The guidance's "more than five light–dark pairs". */
export const PATTERN_PAIRS = 5;
/** Share of a 10° field a counted pattern may cover when still. */
export const PATTERN_AREA = 0.4;
/** The same for a pattern that moves, oscillates, flashes or reverses. */
export const PATTERN_MOVING_AREA = 0.25;
/** The 10° field, in CSS pixels: WCAG's 341 x 256 rounded up as the 2004 draft has it. */
export const PATTERN_FIELD: readonly [number, number] = [355, 268];
/**
 * Share of a window's energy its two strongest peaks need to be regular. Set from synthetic cases
 * alone, before any effect was measured against it: the guidance's stripe patterns read 0.67 and
 * up (gratings 0.82 to 1, a checkerboard 0.70, a dartboard 0.67), two isolated blobs 0.41, white
 * noise 0.09. Dot lattices read 0.42 to 0.55 and are not flagged: a known gap (docs/safety.md).
 */
export const PATTERN_REGULARITY = 0.6;
/** Mean absolute change, relative to the mean, over which a pattern counts as moving. */
export const PATTERN_MOTION = 0.1;

/** Window size in samples. A power of two for the FFT. */
export const PATTERN_WINDOW = 32;
const STRIDE = PATTERN_WINDOW / 2;
/** Cycles per window the peaks are looked for in: from 2 (coarse) to 14 (near Nyquist). */
const MIN_CYCLES = 2;
const MAX_CYCLES = 14;
/** Scales the frame is analysed at. */
const LEVELS = [1, 2, 4] as const;
/** The log-polar resampling: samples a full turn. */
const POLAR_ANGLES = 256;

const srgbToLinear = (byte: number) => {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const LINEAR = Float32Array.from({ length: 256 }, (_, byte) => srgbToLinear(byte));

/** Relative luminance per pixel of an RGBA8 frame, sRGB-encoded as displayed. */
export function luminanceOf(rgba: Uint8Array, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let i = 0; i < out.length; i++) {
    out[i] =
      0.2126 * LINEAR[rgba[i * 4]!]! +
      0.7152 * LINEAR[rgba[i * 4 + 1]!]! +
      0.0722 * LINEAR[rgba[i * 4 + 2]!]!;
  }
  return out;
}

/** In-place radix-2 FFT of one row (length a power of two), stride 1. */
function fft(re: Float64Array, im: Float64Array, offset: number, n: number, step: number): void {
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const a = offset + i * step;
      const b = offset + j * step;
      [re[a], re[b]] = [re[b]!, re[a]!];
      [im[a], im[b]] = [im[b]!, im[a]!];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = (-2 * Math.PI) / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < size / 2; k++) {
        const wr = Math.cos(angle * k);
        const wi = Math.sin(angle * k);
        const a = offset + (start + k) * step;
        const b = offset + (start + k + size / 2) * step;
        const tr = re[b]! * wr - im[b]! * wi;
        const ti = re[b]! * wi + im[b]! * wr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
      }
    }
  }
}

const HANN = Float64Array.from(
  { length: PATTERN_WINDOW },
  (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / PATTERN_WINDOW),
);

export interface WindowReading {
  /** Share of the window's AC energy in its two strongest peaks. */
  regularity: number;
  /** 95th minus 5th percentile of luminance: the light–dark step. */
  step: number;
  /** 5th percentile of luminance: how bright the darker bars are. */
  dark: number;
  /** Michelson contrast from the same percentiles, for reports. */
  contrast: number;
  /** Period of the strongest peak, in window samples. */
  period: number;
  /** Unit wave vector of the strongest peak (x, y). */
  direction: [number, number];
}

/**
 * Reads one N × N window. `sample(x, y)` returns luminance at window coordinates; the caller
 * handles wrapping and scale.
 */
export function readWindow(sample: (x: number, y: number) => number): WindowReading {
  const n = PATTERN_WINDOW;
  const raw = new Float64Array(n * n);
  let mean = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const value = sample(x, y);
      raw[y * n + x] = value;
      mean += value;
    }
  }
  mean /= n * n;
  const sorted = Float64Array.from(raw).sort();
  const low = sorted[Math.floor(0.05 * (n * n - 1))]!;
  const high = sorted[Math.ceil(0.95 * (n * n - 1))]!;
  const contrast = high + low > 1e-6 ? (high - low) / (high + low) : 0;

  const re = new Float64Array(n * n);
  const im = new Float64Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) re[y * n + x] = (raw[y * n + x]! - mean) * HANN[x]! * HANN[y]!;
  }
  for (let y = 0; y < n; y++) fft(re, im, y * n, n, 1);
  for (let x = 0; x < n; x++) fft(re, im, x, n, n);

  const power = new Float64Array(n * n);
  let total = 0;
  for (let i = 0; i < n * n; i++) {
    power[i] = re[i]! * re[i]! + im[i]! * im[i]!;
    total += power[i]!;
  }
  // Signed frequency of bin index i.
  const freq = (i: number) => (i < n / 2 ? i : i - n);
  const bin = (kx: number, ky: number) => (((ky % n) + n) % n) * n + (((kx % n) + n) % n);

  // A peak's energy: the 3 x 3 bins about it and about its mirror image (a real signal's spectrum
  // is symmetric, so a stripe shows at +k and -k). Taken bins are zeroed for the second search.
  const taken = new Uint8Array(n * n);
  const peakEnergy = (kx: number, ky: number) => {
    let sum = 0;
    for (const sign of [1, -1]) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const bx = sign * kx + dx;
          const by = sign * ky + dy;
          const b = bin(bx, by);
          // Not the lowest bins: a single edge or a gradient puts its energy there.
          if (taken[b] || Math.hypot(bx, by) < MIN_CYCLES - 0.5) continue;
          taken[b] = 1;
          sum += power[b]!;
        }
      }
    }
    return sum;
  };
  const strongest = () => {
    let best = -1;
    let at: [number, number] = [0, 0];
    for (let iy = 0; iy < n; iy++) {
      for (let ix = 0; ix < n; ix++) {
        const kx = freq(ix);
        const ky = freq(iy);
        const k = Math.hypot(kx, ky);
        if (k < MIN_CYCLES || k > MAX_CYCLES || taken[iy * n + ix]) continue;
        if (power[iy * n + ix]! > best) {
          best = power[iy * n + ix]!;
          at = [kx, ky];
        }
      }
    }
    return at;
  };
  const first = strongest();
  const e1 = peakEnergy(...first);
  const second = strongest();
  const e2 = peakEnergy(...second);
  const k = Math.hypot(first[0], first[1]);
  return {
    regularity: total > 1e-12 ? (e1 + e2) / total : 0,
    step: high - low,
    dark: low,
    contrast,
    period: k > 0 ? n / k : Infinity,
    direction: k > 0 ? [first[0] / k, first[1] / k] : [1, 0],
  };
}

/** True when a window reading is a regular pattern of clearly discernible stripes. */
export function isPatterned(reading: WindowReading): boolean {
  return (
    reading.regularity >= PATTERN_REGULARITY &&
    reading.step >= PATTERN_STEP &&
    reading.dark < PATTERN_DARK
  );
}

/** A plane of samples to analyse: the frame at one scale, or its polar resampling. */
interface Plane {
  width: number;
  height: number;
  /** Wraps in x (the polar plane's angle). */
  wrapX: boolean;
  at(x: number, y: number): number;
}

interface FlaggedWindow {
  /** Window grid position. */
  gx: number;
  gy: number;
  reading: WindowReading;
}

export interface PatternRegion {
  /**
   * `cartesian` at a scale; `polar` in log-polar windows about the frame centre; `rings`, a
   * band of whole rings whose angular profile repeats (spokes, petals, a rosette).
   */
  domain: 'cartesian' | 'polar' | 'rings';
  scale: number;
  windows: number;
  /** Light–dark pairs across the region along its stripes' direction. */
  pairs: number;
  /** Median light–dark step of its windows. */
  step: number;
  /** Median period, in the domain's samples at full scale. */
  period: number;
  contrast: number;
  regularity: number;
  /** Share of the frame it covers. */
  area: number;
  /** True when it has more than `PATTERN_PAIRS` pairs, so it counts towards the area. */
  counted: boolean;
}

export type PatternVerdict = 'none' | 'low' | 'high';

export interface PatternReport {
  verdict: PatternVerdict;
  /** The largest share of any one 10° field covered by counted regions: what the limit is on. */
  area: number;
  /** Share of the whole frame covered by counted regions. */
  frameArea: number;
  /** True when a second frame was given and the counted pattern changed between the two. */
  moving: boolean;
  /** The area that fails: `PATTERN_AREA`, or `PATTERN_MOVING_AREA` when moving. */
  limit: number;
  regions: PatternRegion[];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * Whether two neighbouring windows see the same stripes: periods within a third of each other,
 * directions within 25° (a wave and its reverse being the same). A grating's windows agree; noise
 * that happens to look regular in one window rarely agrees with the next.
 */
function agree(a: WindowReading, b: WindowReading): boolean {
  const ratio = a.period > b.period ? a.period / b.period : b.period / a.period;
  const cos = Math.abs(a.direction[0] * b.direction[0] + a.direction[1] * b.direction[1]);
  return ratio < 1.34 && cos > Math.cos((25 * Math.PI) / 180);
}

/** Least windows in a region: a lone window is not evidence of a pattern. */
const MIN_WINDOWS = 2;

/** Flags the windows of a plane, groups neighbours into regions and measures each. */
function planeRegions(plane: Plane): { windows: FlaggedWindow[]; groups: FlaggedWindow[][] } {
  const n = PATTERN_WINDOW;
  const columns = plane.wrapX
    ? Math.floor(plane.width / STRIDE)
    : Math.max(0, Math.floor((plane.width - n) / STRIDE) + 1);
  const rows = Math.max(0, Math.floor((plane.height - n) / STRIDE) + 1);
  const flagged = new Map<number, FlaggedWindow>();
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < columns; gx++) {
      const x0 = gx * STRIDE;
      const y0 = gy * STRIDE;
      const reading = readWindow((x, y) => plane.at(x0 + x, y0 + y));
      if (isPatterned(reading)) flagged.set(gy * columns + gx, { gx, gy, reading });
    }
  }
  // Eight-neighbour connected regions on the window grid, wrapping in x where the plane does.
  const groups: FlaggedWindow[][] = [];
  const seen = new Set<number>();
  for (const [key, start] of flagged) {
    if (seen.has(key)) continue;
    const group: FlaggedWindow[] = [];
    const stack = [start];
    seen.add(key);
    while (stack.length > 0) {
      const w = stack.pop()!;
      group.push(w);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          let x = w.gx + dx;
          const y = w.gy + dy;
          if (plane.wrapX) x = (x + columns) % columns;
          if (x < 0 || x >= columns || y < 0 || y >= rows) continue;
          const next = y * columns + x;
          const neighbour = flagged.get(next);
          if (neighbour && !seen.has(next) && agree(w.reading, neighbour.reading)) {
            seen.add(next);
            stack.push(neighbour);
          }
        }
      }
    }
    groups.push(group);
  }
  return { windows: [...flagged.values()], groups };
}

/** The extent of a group of windows along a wave direction, in plane samples. */
function extentAlong(group: FlaggedWindow[], direction: [number, number], plane: Plane): number {
  const xs = [...new Set(group.map((w) => w.gx))].sort((a, b) => a - b);
  const ys = group.map((w) => w.gy);
  let spanX = xs[xs.length - 1]! - xs[0]!;
  if (plane.wrapX) {
    // On a wrapping plane the group covers the circle except its largest gap between columns.
    const columns = Math.floor(plane.width / STRIDE);
    let gap = columns - spanX;
    for (let i = 1; i < xs.length; i++) gap = Math.max(gap, xs[i]! - xs[i - 1]!);
    spanX = columns - gap;
  }
  const width = Math.min(plane.wrapX ? plane.width : Infinity, spanX * STRIDE + PATTERN_WINDOW);
  const height = (Math.max(...ys) - Math.min(...ys)) * STRIDE + PATTERN_WINDOW;
  return Math.abs(direction[0]) * width + Math.abs(direction[1]) * height;
}

/**
 * The samples of a plane a region covers: inside the central STRIDE x STRIDE cell of one of its
 * windows (out to the edge for edge windows, so overlapping windows tile the region without
 * their borders), and where the local light–dark step over half a period either way passes the
 * rule. The second condition keeps a coarse window that only partly holds the pattern from
 * claiming the plain part.
 */
function markPlane(plane: Plane, group: FlaggedWindow[], period: number): Uint8Array {
  const { width: w, height: h } = plane;
  const columns = plane.wrapX
    ? Math.floor(w / STRIDE)
    : Math.floor((w - PATTERN_WINDOW) / STRIDE) + 1;
  const rows = Math.floor((h - PATTERN_WINDOW) / STRIDE) + 1;
  const cells = new Uint8Array(w * h);
  for (const { gx, gy } of group) {
    const x0 = !plane.wrapX && gx === 0 ? 0 : gx * STRIDE + STRIDE / 2;
    const x1 = !plane.wrapX && gx === columns - 1 ? w : gx * STRIDE + STRIDE * 1.5;
    const y0 = gy === 0 ? 0 : gy * STRIDE + STRIDE / 2;
    const y1 = gy === rows - 1 ? h : gy * STRIDE + STRIDE * 1.5;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) cells[y * w + (plane.wrapX ? x % w : x)] = 1;
    }
  }
  // Separable running max and min over a square of side about one period.
  const r = Math.max(1, Math.ceil(period / 2));
  const value = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) value[y * w + x] = plane.at(x, y);
  const pass = (
    input: Float32Array,
    horizontal: boolean,
    pick: (a: number, b: number) => number,
  ) => {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let best = input[y * w + x]!;
        for (let d = -r; d <= r; d++) {
          let sx = x;
          let sy = y;
          if (horizontal) {
            sx = plane.wrapX ? (x + d + w) % w : Math.min(w - 1, Math.max(0, x + d));
          } else {
            sy = Math.min(h - 1, Math.max(0, y + d));
          }
          best = pick(best, input[sy * w + sx]!);
        }
        out[y * w + x] = best;
      }
    }
    return out;
  };
  const high = pass(pass(value, true, Math.max), false, Math.max);
  const low = pass(pass(value, true, Math.min), false, Math.min);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) {
    if (!cells[i]) continue;
    out[i] = high[i]! - low[i]! >= PATTERN_STEP && low[i]! < PATTERN_DARK ? 1 : 0;
  }
  return out;
}

/** Least rows in a band of rings: six log-polar rows are about a sixth of the radius. */
const MIN_RING_ROWS = 6;

interface RingRow {
  j: number;
  k: number;
  regularity: number;
  step: number;
  /** Which of the row's samples are inside a discernible light–dark step, half a period wide. */
  mask: Uint8Array;
}

/**
 * Bands of consecutive log-polar rows whose angular profile is regular: one angular frequency of
 * at least two cycles a turn (with its neighbours, and the next strongest likewise) holds
 * `PATTERN_REGULARITY` of the ring's energy, and the ring's light–dark step is discernible.
 * Neighbouring rows join a band when their frequencies agree within one cycle a turn: a radial
 * pattern repeats the same number of times at every radius, where parallel stripes crossed by a
 * circle do not. Each row is a full turn, so no window is needed: the profile is periodic.
 */
function ringBands(polar: Plane): { k: number; rows: RingRow[] }[] {
  const n = polar.width;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const rows: (RingRow | undefined)[] = [];
  for (let j = 0; j < polar.height; j++) {
    let mean = 0;
    const values = new Float64Array(n);
    for (let i = 0; i < n; i++) mean += values[i] = polar.at(i, j);
    mean /= n;
    const sorted = Float64Array.from(values).sort();
    const low = sorted[Math.floor(0.05 * (n - 1))]!;
    const high = sorted[Math.ceil(0.95 * (n - 1))]!;
    if (high - low < PATTERN_STEP || low >= PATTERN_DARK) {
      rows.push(undefined);
      continue;
    }
    for (let i = 0; i < n; i++) {
      re[i] = values[i]! - mean;
      im[i] = 0;
    }
    fft(re, im, 0, n, 1);
    const power = (k: number) => re[k]! * re[k]! + im[k]! * im[k]!;
    let total = 0;
    for (let k = 1; k < n / 2; k++) total += power(k);
    const taken = new Uint8Array(n / 2);
    const peak = () => {
      let best = 0;
      let at = 0;
      for (let k = 2; k < n / 2; k++) {
        if (!taken[k] && power(k) > best) {
          best = power(k);
          at = k;
        }
      }
      let sum = 0;
      for (let d = -1; d <= 1; d++) {
        const k = at + d;
        if (k >= 1 && k < n / 2 && !taken[k]) {
          taken[k] = 1;
          sum += power(k);
        }
      }
      return { k: at, energy: sum };
    };
    const first = peak();
    const second = peak();
    const regularity = total > 1e-12 ? (first.energy + second.energy) / total : 0;
    if (regularity < PATTERN_REGULARITY) {
      rows.push(undefined);
      continue;
    }
    // Discernible samples: a step over half a period either way, along the ring.
    const half = Math.max(1, Math.ceil(n / first.k / 2));
    const mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let d = -half; d <= half; d++) {
        const v = values[(i + d + n) % n]!;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      mask[i] = hi - lo >= PATTERN_STEP && lo < PATTERN_DARK ? 1 : 0;
    }
    rows.push({ j, k: first.k, regularity, step: high - low, mask });
  }
  const bands: { k: number; rows: RingRow[] }[] = [];
  let current: RingRow[] = [];
  const close = () => {
    if (current.length > 0) bands.push({ k: median(current.map((row) => row.k)), rows: current });
    current = [];
  };
  for (const row of rows) {
    const last = current[current.length - 1];
    if (row && (!last || Math.abs(row.k - last.k) <= 1)) current.push(row);
    else {
      close();
      if (row) current.push(row);
    }
  }
  close();
  return bands;
}

/** The largest share of `mask` inside any `fw` x `fh` window (clipped to the frame). */
function fieldShare(
  mask: Uint8Array,
  width: number,
  height: number,
  fw: number,
  fh: number,
): number {
  const w = Math.min(width, Math.max(1, Math.round(fw)));
  const h = Math.min(height, Math.max(1, Math.round(fh)));
  // Summed-area table.
  const sat = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += mask[y * width + x]!;
      sat[(y + 1) * (width + 1) + x + 1] = sat[y * (width + 1) + x + 1]! + row;
    }
  }
  let best = 0;
  for (let y = 0; y + h <= height; y++) {
    for (let x = 0; x + w <= width; x++) {
      const sum =
        sat[(y + h) * (width + 1) + x + w]! -
        sat[y * (width + 1) + x + w]! -
        sat[(y + h) * (width + 1) + x]! +
        sat[y * (width + 1) + x]!;
      if (sum > best) best = sum;
    }
  }
  return best / (w * h);
}

export interface PatternOptions {
  /** The same view a moment earlier (the test uses a quarter of a second), for the moving limit. */
  previous?: Float32Array;
  /** CSS pixels per frame pixel as the frame is shown. Default 4 (480 x 270 for 1920 x 1080). */
  displayScale?: number;
}

/** Analyses one frame of relative luminance, row by row. */
export function analysePattern(
  luminance: Float32Array,
  width: number,
  height: number,
  options: PatternOptions = {},
): PatternReport {
  const { previous } = options;
  const displayScale = options.displayScale ?? 4;
  const mask = new Uint8Array(width * height);
  const regions: PatternRegion[] = [];

  const describe = (
    group: FlaggedWindow[],
    plane: Plane,
    domain: PatternRegion['domain'],
    scale: number,
  ) => {
    const direction = group[0]!.reading.direction;
    const directions = group.map((w) => w.reading.direction);
    // The most common direction, by summing doubled angles (a wave and its reverse are the same).
    let cx = 0;
    let cy = 0;
    for (const [dx, dy] of directions) {
      const a = 2 * Math.atan2(dy, dx);
      cx += Math.cos(a);
      cy += Math.sin(a);
    }
    const a = Math.atan2(cy, cx) / 2;
    const mean: [number, number] = cx === 0 && cy === 0 ? direction : [Math.cos(a), Math.sin(a)];
    const period = median(group.map((w) => w.reading.period));
    const pairs = extentAlong(group, mean, plane) / period;
    return {
      domain,
      scale,
      windows: group.length,
      pairs,
      period: period * scale,
      step: median(group.map((w) => w.reading.step)),
      contrast: median(group.map((w) => w.reading.contrast)),
      regularity: median(group.map((w) => w.reading.regularity)),
      area: 0,
      counted: pairs > PATTERN_PAIRS && group.length >= MIN_WINDOWS,
    } satisfies PatternRegion;
  };

  // Each frame pixel reads one sample of each plane; a pixel joins the mask when that sample does.
  const join = (planeMask: Uint8Array, toPlane: (x: number, y: number) => number) => {
    let marked = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const sample = toPlane(x, y);
        if (sample < 0 || !planeMask[sample]) continue;
        if (!mask[y * width + x]) marked++;
        mask[y * width + x] = 1;
      }
    }
    return marked / mask.length;
  };

  // Cartesian, at each scale (box-filtered down).
  for (const scale of LEVELS) {
    if (width / scale < PATTERN_WINDOW || height / scale < PATTERN_WINDOW) continue;
    const plane = downsample(luminance, width, height, scale);
    const { groups } = planeRegions(plane);
    for (const group of groups) {
      const region = describe(group, plane, 'cartesian', scale);
      regions.push(region);
      if (!region.counted) continue;
      const planeMask = markPlane(plane, group, region.period / scale);
      region.area = join(planeMask, (x, y) => {
        const px = Math.min(plane.width - 1, Math.floor(x / scale));
        const py = Math.min(plane.height - 1, Math.floor(y / scale));
        return py * plane.width + px;
      });
    }
  }

  // Polar about the centre, at two scales of the polar plane.
  const cx = width / 2;
  const cy = height / 2;
  const rMax = Math.hypot(cx, cy);
  // Inside this radius a full turn is shorter than the polar plane is wide, so it would sample
  // the same pixels several times over and read the pixel grid's staircase as a periodic
  // pattern. The centre is left to the Cartesian windows.
  const rMin = Math.min(rMax / 2, POLAR_ANGLES / (2 * Math.PI));
  const polar = polarPlane(luminance, width, height, cx, cy, rMin, rMax);
  for (const scale of [1, 2] as const) {
    const plane = scale === 1 ? polar : downsamplePlane(polar, 2);
    const { groups } = planeRegions(plane);
    for (const group of groups) {
      const region = describe(group, plane, 'polar', scale);
      regions.push(region);
      if (!region.counted) continue;
      const planeMask = markPlane(plane, group, region.period / scale);
      region.area = join(planeMask, (x, y) => {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const u = Math.floor(((Math.atan2(dy, dx) / (2 * Math.PI) + 1) % 1) * plane.width);
        const r = Math.hypot(dx, dy);
        if (r < rMin) return -1;
        const v = Math.floor(Math.log(r / rMin) / LOG_STEP / (polar.height / plane.height));
        return Math.min(plane.height - 1, v) * plane.width + (u % plane.width);
      });
    }
  }

  // Whole rings: spokes, petals and rosettes repeating fewer times a turn than the log-polar
  // windows can see (a window is an eighth of a turn).
  for (const band of ringBands(polar)) {
    const region: PatternRegion = {
      domain: 'rings',
      scale: 1,
      windows: band.rows.length,
      pairs: band.k,
      period: POLAR_ANGLES / band.k,
      step: median(band.rows.map((row) => row.step)),
      contrast: 0,
      regularity: median(band.rows.map((row) => row.regularity)),
      area: 0,
      counted: band.k > PATTERN_PAIRS && band.rows.length >= MIN_RING_ROWS,
    };
    regions.push(region);
    if (!region.counted) continue;
    const marked = new Uint8Array(polar.width * polar.height);
    for (const row of band.rows) marked.set(row.mask, row.j * polar.width);
    region.area = join(marked, (x, y) => {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const r = Math.hypot(dx, dy);
      if (r < rMin) return -1;
      const u = Math.floor(((Math.atan2(dy, dx) / (2 * Math.PI) + 1) % 1) * polar.width);
      const v = Math.floor(Math.log(r / rMin) / LOG_STEP);
      return Math.min(polar.height - 1, v) * polar.width + (u % polar.width);
    });
  }

  let covered = 0;
  for (const m of mask) covered += m;
  const frameArea = covered / mask.length;
  const area =
    covered > 0
      ? fieldShare(
          mask,
          width,
          height,
          PATTERN_FIELD[0] / displayScale,
          PATTERN_FIELD[1] / displayScale,
        )
      : 0;

  let moving = false;
  if (previous && covered > 0) {
    let change = 0;
    let level = 0;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      change += Math.abs(luminance[i]! - previous[i]!);
      level += luminance[i]!;
    }
    moving = level > 0 && change / level > PATTERN_MOTION;
  }
  const limit = moving ? PATTERN_MOVING_AREA : PATTERN_AREA;
  return {
    verdict: area >= limit ? 'high' : regions.some((r) => r.counted) ? 'low' : 'none',
    area,
    frameArea,
    moving,
    limit,
    regions,
  };
}

/** Box-filters a frame by an integer factor. */
function downsample(lum: Float32Array, width: number, height: number, scale: number): Plane {
  const w = Math.floor(width / scale);
  const h = Math.floor(height / scale);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let j = 0; j < scale; j++) {
        for (let i = 0; i < scale; i++) sum += lum[(y * scale + j) * width + x * scale + i]!;
      }
      out[y * w + x] = sum / (scale * scale);
    }
  }
  return { width: w, height: h, wrapX: false, at: (x, y) => out[y * w + x]! };
}

function downsamplePlane(plane: Plane, scale: number): Plane {
  const w = Math.floor(plane.width / scale);
  const h = Math.floor(plane.height / scale);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let j = 0; j < scale; j++) {
        for (let i = 0; i < scale; i++) sum += plane.at(x * scale + i, y * scale + j);
      }
      out[y * w + x] = sum / (scale * scale);
    }
  }
  return {
    width: w,
    height: h,
    wrapX: plane.wrapX,
    at: (x, y) => out[y * w + (((x % w) + w) % w)]!,
  };
}

/** Log-radius step of the log-polar plane: one angle step, so a sample is as deep as wide. */
const LOG_STEP = (2 * Math.PI) / POLAR_ANGLES;

/**
 * The frame resampled to log-polar coordinates about (cx, cy): angle along x (a full turn,
 * wrapping), log radius along y from `rMin` to `rMax`. The map is conformal, so each sample is a
 * small square of the frame, about 2πr / POLAR_ANGLES pixels on a side; each averages that many
 * pixels each way, so fine detail at large radii does not alias. Rings, spokes and logarithmic
 * spirals all become straight stripes.
 */
function polarPlane(
  lum: Float32Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  rMin: number,
  rMax: number,
): Plane {
  const rows = Math.max(PATTERN_WINDOW, Math.ceil(Math.log(rMax / rMin) / LOG_STEP));
  const out = new Float32Array(POLAR_ANGLES * rows);
  const read = (x: number, y: number) =>
    lum[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))]!;
  const bilinear = (x: number, y: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    return (
      (read(x0, y0) * (1 - fx) + read(x0 + 1, y0) * fx) * (1 - fy) +
      (read(x0, y0 + 1) * (1 - fx) + read(x0 + 1, y0 + 1) * fx) * fy
    );
  };
  for (let j = 0; j < rows; j++) {
    const r = rMin * Math.exp((j + 0.5) * LOG_STEP);
    const n = Math.max(1, Math.ceil(r * LOG_STEP));
    for (let i = 0; i < POLAR_ANGLES; i++) {
      let sum = 0;
      for (let v = 0; v < n; v++) {
        const rr = rMin * Math.exp((j + (v + 0.5) / n) * LOG_STEP);
        for (let u = 0; u < n; u++) {
          const a = (i + (u + 0.5) / n) * LOG_STEP;
          sum += bilinear(cx + rr * Math.cos(a) - 0.5, cy + rr * Math.sin(a) - 0.5);
        }
      }
      out[j * POLAR_ANGLES + i] = sum / (n * n);
    }
  }
  return {
    width: POLAR_ANGLES,
    height: rows,
    wrapX: true,
    at: (x, y) => out[y * POLAR_ANGLES + (((x % POLAR_ANGLES) + POLAR_ANGLES) % POLAR_ANGLES)]!,
  };
}

/**
 * The light–dark step of luminance an effect whose image is a regular pattern by construction
 * (rings, a rosette, a kaleidoscope) may draw at a dose. Up to the strong dose it stays under 90%
 * of `PATTERN_STEP`, so its stripes are never clearly discernible unless the visitor goes past
 * it; then it rises to 0.6, and presets there are declared and gated (story 2.6).
 */
export function patternStepAt(dose: number): number {
  const d = Math.min(1, Math.max(0, dose));
  const below = 0.9 * PATTERN_STEP;
  return d <= STRONG_DOSE
    ? below * (d / STRONG_DOSE)
    : below + (0.6 - below) * ((d - STRONG_DOSE) / (1 - STRONG_DOSE));
}
