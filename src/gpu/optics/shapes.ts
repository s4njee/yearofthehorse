/*
 * Custom aperture shapes (story 2.2): any outline that is star-shaped about its centre, as a table of
 * its radius at evenly spaced angles. That is the form src/wgsl/aperture.wgsl works in already (a
 * radius per angle, with the light normalised by the shape's area), so a heart or a star draws
 * through the same energy-conserving path as a polygon.
 *
 * Angles follow the image: x to the right, y down, measured from +x towards +y.
 */

/** Entries in a radius table; the shader holds it as 16 vec4f. */
export const APERTURE_TABLE_SIZE = 64;

export type Point2 = readonly [number, number];

/**
 * The radius table of a closed polygon (a traced outline: list its corners in order), about its
 * centroid of area, scaled so its furthest point is at radius 1. The polygon must be star-shaped
 * about that centre: every ray from it must leave the polygon once.
 */
export function polarTable(polygon: readonly Point2[], size = APERTURE_TABLE_SIZE): Float32Array {
  // Centroid of area (the shoelace formula), so the shape sits where its light is.
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x0, y0] = polygon[i]!;
    const [x1, y1] = polygon[(i + 1) % polygon.length]!;
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  cx /= 3 * area;
  cy /= 3 * area;
  const table = new Float32Array(size);
  for (let k = 0; k < size; k++) {
    const theta = (k / size) * 2 * Math.PI;
    const dx = Math.cos(theta);
    const dy = Math.sin(theta);
    // The furthest crossing of the ray with an edge.
    let reach = 0;
    for (let i = 0; i < polygon.length; i++) {
      const [ax, ay] = polygon[i]!;
      const [bx, by] = polygon[(i + 1) % polygon.length]!;
      const ex = bx - ax;
      const ey = by - ay;
      const denominator = dx * ey - dy * ex;
      if (Math.abs(denominator) < 1e-12) continue;
      const ox = ax - cx;
      const oy = ay - cy;
      const t = (ox * ey - oy * ex) / denominator;
      const s = (ox * dy - oy * dx) / denominator;
      if (t > 0 && s >= 0 && s <= 1) reach = Math.max(reach, t);
    }
    table[k] = reach;
  }
  const peak = Math.max(...table);
  for (let k = 0; k < size; k++) table[k] = table[k]! / peak;
  return table;
}

/** A regular polygon of `blades` sides at `rotation` radians, as corners; circumradius 1. */
export function regularPolygon(blades: number, rotation: number): Point2[] {
  return Array.from({ length: blades }, (_, i) => {
    const a = rotation + (i / blades) * 2 * Math.PI;
    return [Math.cos(a), Math.sin(a)] as const;
  });
}

/** A heart, point down, from the classic parametric curve, 256 corners. */
export function heart(): Point2[] {
  return Array.from({ length: 256 }, (_, i) => {
    const t = (i / 256) * 2 * Math.PI;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    // y is up in the curve and down in the image.
    return [x, -y] as const;
  });
}

/** A star of `points` points, inner radius `inner` of the outer, one point straight up. */
export function star(points = 5, inner = 0.45): Point2[] {
  return Array.from({ length: points * 2 }, (_, i) => {
    const a = -Math.PI / 2 + (i / (points * 2)) * 2 * Math.PI;
    const r = i % 2 === 0 ? 1 : inner;
    return [r * Math.cos(a), r * Math.sin(a)] as const;
  });
}

/** The table's radius at `theta`, linearly interpolated, as the shader reads it. */
export function tableRadius(table: ArrayLike<number>, theta: number): number {
  const size = table.length;
  const f = ((((theta / (2 * Math.PI)) % 1) + 1) % 1) * size;
  const i = Math.floor(f);
  const t = f - i;
  return table[i % size]! * (1 - t) + table[(i + 1) % size]! * t;
}

/** Area of the shape a table describes (circumradius 1): half the integral of r(theta)^2. */
export function tableArea(table: ArrayLike<number>): number {
  const steps = 2048;
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const r = tableRadius(table, ((i + 0.5) / steps) * 2 * Math.PI);
    sum += r * r;
  }
  return 0.5 * sum * ((2 * Math.PI) / steps);
}
