import { describe, expect, it } from 'vitest';
import {
  applyIsometry,
  cellArea,
  DOMAINS_PER_CELL,
  fold,
  generators,
  SYMMETRY_GROUPS,
  WALLPAPER_GROUPS,
  type SymmetryGroup,
  type Vec2,
} from '../src/gpu/symmetry/fold.ts';

/** A repeatable stream of points in [lo, hi)². */
function points(count: number, lo: number, hi: number, seed = 1): Vec2[] {
  let s = seed >>> 0;
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  return Array.from({ length: count }, () => [lo + (hi - lo) * next(), lo + (hi - lo) * next()]);
}

const close = (a: Vec2, b: Vec2, e = 1e-7) =>
  Math.abs(a[0] - b[0]) < e && Math.abs(a[1] - b[1]) < e;

describe('symmetry folds', () => {
  it.each(SYMMETRY_GROUPS)('%s is invariant under its generators', (group: SymmetryGroup) => {
    const order = 7;
    let compared = 0;
    let pairs = 0;
    for (const p of points(2000, -3, 3)) {
      const a = fold(group, p, order).p;
      for (const g of generators(group, order)) {
        const b = fold(group, applyIsometry(g, p), order).p;
        pairs++;
        // Points within rounding of a domain edge may land on either copy of that edge.
        if (close(a, b, 1e-6)) compared++;
        else
          expect(
            Math.min(...[a, b].map(edgeDistance(group, order))),
            `${group} at ${p}`,
          ).toBeLessThan(1e-6);
      }
    }
    expect(compared / pairs).toBeGreaterThan(0.99);
  });

  it.each(SYMMETRY_GROUPS)('%s is idempotent', (group) => {
    for (const p of points(1000, -3, 3, 2)) {
      const once = fold(group, p, 5).p;
      expect(close(fold(group, once, 5).p, once, 1e-9), `${group} at ${p}`).toBe(true);
    }
  });

  it.each(WALLPAPER_GROUPS)('%s covers its cell once (domain area = cell / order)', (group) => {
    // The fraction of points a fold leaves where they are is the domain's share of the region.
    const lo = -1;
    const hi = 2;
    const samples = points(200_000, lo, hi, 3);
    const fixed = samples.filter((p) => close(fold(group, p).p, p, 1e-12)).length;
    const area = (fixed / samples.length) * (hi - lo) ** 2;
    const expected = cellArea(group) / DOMAINS_PER_CELL[group];
    expect(area / expected).toBeGreaterThan(0.94);
    expect(area / expected).toBeLessThan(1.06);
  });

  it.each(SYMMETRY_GROUPS)('%s returns the Jacobian of the isometry it applied', (group) => {
    const e = 1e-6;
    let checked = 0;
    for (const p of points(500, -3, 3, 4)) {
      const f = fold(group, p, 5);
      for (const v of [
        [1, 0],
        [0, 1],
      ] as Vec2[]) {
        const moved = fold(group, [p[0] + e * v[0], p[1] + e * v[1]], 5).p;
        const step: Vec2 = [(moved[0] - f.p[0]) / e, (moved[1] - f.p[1]) / e];
        const predicted: Vec2 = [f.j[0] * v[0] + f.j[1] * v[1], f.j[2] * v[0] + f.j[3] * v[1]];
        // Across a seam the step jumps; everywhere else it is the Jacobian.
        if (Math.hypot(step[0], step[1]) > 1.5) continue;
        expect(close(step, predicted, 1e-4), `${group} at ${p}`).toBe(true);
        checked++;
      }
      // An isometry: j is orthogonal.
      expect(Math.abs(f.j[0] * f.j[3] - f.j[1] * f.j[2])).toBeCloseTo(1, 9);
    }
    expect(checked).toBeGreaterThan(900);
  });
});

/** Distance of a folded point from its domain's edges, by probing a little each way. */
function edgeDistance(group: SymmetryGroup, order: number) {
  return (q: Vec2): number => {
    const e = 1e-6;
    for (const d of [
      [e, 0],
      [-e, 0],
      [0, e],
      [0, -e],
    ] as Vec2[]) {
      const moved: Vec2 = [q[0] + d[0], q[1] + d[1]];
      if (!close(fold(group, moved, order).p, moved, 1e-9)) return 0;
    }
    return 1;
  };
}
