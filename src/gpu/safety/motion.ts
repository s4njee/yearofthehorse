/*
 * The Hero's Journey's story 2.4: whole-field motion, measured from rendered frames.
 *
 * Tunnels, spirals and kaleidoscopes turning or zooming the whole view are the vestibular risk
 * (WCAG 2.3.3; docs/safety.md). This measures the part of the motion between two frames that is
 * one rigid move of the whole field: a turn, a zoom and a drift about the frame's centre.
 *
 * 1. Blocks. Both frames are cut into 16 x 16 blocks. A block with too little texture to track
 *    (luminance standard deviation under `MIN_TEXTURE`) is skipped. With fewer than
 *    `MIN_BLOCKS` left there is no evidence of whole-field motion, and the reading is zero
 *    (Snow Temple: faint snow gave fits from a dozen blocks, and spurious zooms).
 * 2. Flow. Each block is found in the second frame by the smallest sum of squared differences
 *    within `SEARCH` pixels, refined to a fraction of a pixel by a parabola through the
 *    neighbouring costs. A match that is not clearly better than its surroundings is dropped.
 * 3. Fit. The block motions are fitted, by least squares with outliers dropped and refitted, to
 *    v = t + [[k, -w], [w, k]] (p - c): a drift t, a zoom k and a turn w about the centre c.
 *    Motion inside the picture that is not rigid (beads drifting in a kaleidoscope's cell, noise
 *    evolving) does not fit, and mostly averages out.
 *
 * The result is a rate: degrees a second, zoom doublings a second, screen widths a second. Pure
 * functions on luminance arrays, so it can move into the temple core with the pattern analyser.
 */

/** Starting caps for an effect at its default `dose` (docs/safety.md, section 4). */
export const MOTION_CAPS = {
  /** Whole-field rotation, degrees a second. */
  rotation: 5,
  /** Whole-field zoom, doublings (or halvings) a second. */
  zoom: 0.1,
  /** Whole-field drift, screen widths a second. */
  drift: 0.05,
} as const;

const BLOCK = 16;
/** Search radius, pixels. Covers 15° a second at the corner of a 480 x 270 frame 1/6 s apart. */
const SEARCH = 12;
/** Blocks flatter than this (standard deviation of relative luminance) are not tracked. */
const MIN_TEXTURE = 0.01;
/**
 * Fewest tracked blocks that count as evidence of whole-field motion: about a twentieth of a
 * 480 x 270 frame. Fewer, and a rigid fit to a handful of features moving their own ways (faint
 * snow on black leaves a dozen trackable blocks) reports spurious turns and zooms. A sparse field
 * of bright points spread across the view, a starfield, still gives one textured block per point.
 */
export const MIN_BLOCKS = 20;

export interface MotionReading {
  /** Degrees a second, anticlockwise on screen positive. */
  rotation: number;
  /** Zoom doublings a second; negative is zooming out. */
  zoom: number;
  /** Screen widths a second, any direction. */
  drift: number;
  /** Blocks tracked, and how many of them the rigid fit kept. */
  blocks: number;
  inliers: number;
}

interface Flow {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

function blockFlow(
  a: Float32Array,
  b: Float32Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
): Flow | undefined {
  let mean = 0;
  for (let y = 0; y < BLOCK; y++)
    for (let x = 0; x < BLOCK; x++) mean += a[(y0 + y) * width + x0 + x]!;
  mean /= BLOCK * BLOCK;
  let variance = 0;
  for (let y = 0; y < BLOCK; y++) {
    for (let x = 0; x < BLOCK; x++) variance += (a[(y0 + y) * width + x0 + x]! - mean) ** 2;
  }
  variance /= BLOCK * BLOCK;
  if (Math.sqrt(variance) < MIN_TEXTURE) return undefined;

  const size = 2 * SEARCH + 1;
  const cost = new Float64Array(size * size).fill(Infinity);
  let best = Infinity;
  let bx = 0;
  let by = 0;
  for (let dy = -SEARCH; dy <= SEARCH; dy++) {
    if (y0 + dy < 0 || y0 + dy + BLOCK > height) continue;
    for (let dx = -SEARCH; dx <= SEARCH; dx++) {
      if (x0 + dx < 0 || x0 + dx + BLOCK > width) continue;
      let sum = 0;
      for (let y = 0; y < BLOCK; y++) {
        const ra = (y0 + y) * width + x0;
        const rb = (y0 + y + dy) * width + x0 + dx;
        for (let x = 0; x < BLOCK; x++) {
          const d = a[ra + x]! - b[rb + x]!;
          sum += d * d;
        }
      }
      cost[(dy + SEARCH) * size + dx + SEARCH] = sum;
      if (sum < best) {
        best = sum;
        bx = dx;
        by = dy;
      }
    }
  }
  // Distinct: the best match is well under the typical cost. Flat or repeating blocks are not.
  const finite = [...cost].filter(Number.isFinite).sort((p, q) => p - q);
  const typical = finite[Math.floor(finite.length / 2)]!;
  if (!(best < 0.25 * typical)) return undefined;
  // Sub-pixel: a parabola through the costs either side.
  const at = (dx: number, dy: number) => cost[(dy + SEARCH) * size + dx + SEARCH] ?? Infinity;
  const refine = (minus: number, centre: number, plus: number) => {
    const denominator = minus - 2 * centre + plus;
    return Number.isFinite(denominator) && denominator > 1e-12
      ? Math.max(-0.5, Math.min(0.5, (0.5 * (minus - plus)) / denominator))
      : 0;
  };
  const fx = Math.abs(bx) < SEARCH ? refine(at(bx - 1, by), best, at(bx + 1, by)) : 0;
  const fy = Math.abs(by) < SEARCH ? refine(at(bx, by - 1), best, at(bx, by + 1)) : 0;
  return { x: x0 + BLOCK / 2, y: y0 + BLOCK / 2, dx: bx + fx, dy: by + fy };
}

/** Least squares for v = t + [[k, -w], [w, k]] q, with q = p - c. Returns [tx, ty, k, w]. */
function fitSimilarity(flows: readonly Flow[], cx: number, cy: number): number[] {
  // Normal equations for the unknowns (tx, ty, k, w).
  const m = Array.from({ length: 4 }, () => new Float64Array(4));
  const r = new Float64Array(4);
  for (const f of flows) {
    const qx = f.x - cx;
    const qy = f.y - cy;
    // vx = tx + k qx - w qy;  vy = ty + k qy + w qx
    const rows = [
      [1, 0, qx, -qy, f.dx],
      [0, 1, qy, qx, f.dy],
    ];
    for (const row of rows) {
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) m[i]![j]! += row[i]! * row[j]!;
        r[i]! += row[i]! * row[4]!;
      }
    }
  }
  // Gaussian elimination.
  const a = m.map((row, i) => [...row, r[i]!]);
  for (let i = 0; i < 4; i++) {
    let pivot = i;
    for (let j = i + 1; j < 4; j++) if (Math.abs(a[j]![i]!) > Math.abs(a[pivot]![i]!)) pivot = j;
    [a[i], a[pivot]] = [a[pivot]!, a[i]!];
    const p = a[i]![i]!;
    if (Math.abs(p) < 1e-12) return [0, 0, 0, 0];
    for (let j = i; j < 5; j++) a[i]![j]! /= p;
    for (let k = 0; k < 4; k++) {
      if (k === i) continue;
      const factor = a[k]![i]!;
      for (let j = i; j < 5; j++) a[k]![j]! -= factor * a[i]![j]!;
    }
  }
  return a.map((row) => row[4]!);
}

/**
 * The rigid whole-field motion from frame `a` to frame `b`, `seconds` apart, as rates. Both are
 * relative luminance, row by row. Screen y is down, so a positive rotation turns anticlockwise
 * as seen.
 */
export function estimateMotion(
  a: Float32Array,
  b: Float32Array,
  width: number,
  height: number,
  seconds: number,
): MotionReading {
  const flows: Flow[] = [];
  for (let y0 = SEARCH; y0 + BLOCK + SEARCH <= height; y0 += BLOCK) {
    for (let x0 = SEARCH; x0 + BLOCK + SEARCH <= width; x0 += BLOCK) {
      const flow = blockFlow(a, b, width, height, x0, y0);
      if (flow) flows.push(flow);
    }
  }
  const cx = width / 2;
  const cy = height / 2;
  if (flows.length < MIN_BLOCKS) {
    return { rotation: 0, zoom: 0, drift: 0, blocks: flows.length, inliers: 0 };
  }
  let kept = flows;
  let fit = fitSimilarity(kept, cx, cy);
  for (let round = 0; round < 3; round++) {
    const residual = (f: Flow) => {
      const qx = f.x - cx;
      const qy = f.y - cy;
      const vx = fit[0]! + fit[2]! * qx - fit[3]! * qy;
      const vy = fit[1]! + fit[2]! * qy + fit[3]! * qx;
      return Math.hypot(f.dx - vx, f.dy - vy);
    };
    const next = flows.filter((f) => residual(f) < 1);
    if (next.length < 6 || next.length === kept.length) break;
    kept = next;
    fit = fitSimilarity(kept, cx, cy);
  }
  const [tx, ty, k, w] = fit as [number, number, number, number];
  // Screen y points down, so the fitted w turns clockwise as seen; report anticlockwise positive.
  return {
    rotation: (-Math.atan2(w, 1 + k) * 180) / Math.PI / seconds,
    zoom: Math.log2(Math.hypot(1 + k, w)) / seconds,
    drift: Math.hypot(tx, ty) / width / seconds,
    blocks: flows.length,
    inliers: kept.length,
  };
}

/** True when a reading is inside every cap (magnitudes: either direction counts). */
export function withinMotionCaps(
  reading: Pick<MotionReading, 'rotation' | 'zoom' | 'drift'>,
): boolean {
  return (
    Math.abs(reading.rotation) <= MOTION_CAPS.rotation &&
    Math.abs(reading.zoom) <= MOTION_CAPS.zoom &&
    reading.drift <= MOTION_CAPS.drift
  );
}
