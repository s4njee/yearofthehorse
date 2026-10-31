import { describe, expect, it } from 'vitest';
import { flattenPath, shapePoints, SHAPES } from '../src/gpu/shells/shapes.ts';

// Story 3.6: shapes for shaped shells, from SVG path data.

describe('shapes', () => {
  it('flattens lines, curves and arcs, absolute and relative', () => {
    const square = flattenPath('M0 0L10 0l0 10H0Z');
    expect(square).toHaveLength(1);
    expect(square[0]!.at(-1)).toEqual([0, 0]);
    // A half circle by an arc: every point at its radius from the centre.
    const arc = flattenPath('M0 0A5 5 0 0 1 10 0')[0]!;
    for (const [x, y] of arc) expect(Math.hypot(x - 5, y)).toBeCloseTo(5, 3);
    // A cubic ends at its end point.
    expect(flattenPath('M0 0c1 2 3 4 5 6')[0]!.at(-1)).toEqual([5, 6]);
  });

  it('spaces points along every subpath, centred, y up, the farthest at 1', () => {
    for (const d of Object.values(SHAPES)) {
      const p = shapePoints(d, 96);
      expect(p).toHaveLength(192);
      let far = 0;
      for (let i = 0; i < 96; i++) far = Math.max(far, Math.hypot(p[i * 2]!, p[i * 2 + 1]!));
      expect(far).toBeCloseTo(1, 5);
    }
    // The heart is symmetric about its upright axis, and its point is at the bottom.
    const heart = shapePoints(SHAPES.heart, 96);
    const xs = Array.from({ length: 96 }, (_, i) => heart[i * 2]!);
    const ys = Array.from({ length: 96 }, (_, i) => heart[i * 2 + 1]!);
    expect(Math.abs(xs.reduce((a, b) => a + b, 0) / 96)).toBeLessThan(0.03);
    expect(xs[ys.indexOf(Math.min(...ys))]!).toBeCloseTo(0, 1);
  });
});
