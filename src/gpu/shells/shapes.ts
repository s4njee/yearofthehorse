/*
 * Story 3.6: shapes for shaped shells. A shaped shell's stars are laid out in the shell as a flat
 * pattern (a heart of stars pasted on a disc), so they leave the break in that plane at speeds in
 * proportion to their distance from the centre. Here a shape is an SVG path's outline, sampled at
 * evenly spaced points, centred, y up, and scaled so the farthest point is 1.
 */

/** A few shapes, as SVG path data in a 100 × 100 box. */
export const SHAPES = {
  heart:
    'M50 30C50 25 45 15 30 15C10 15 10 37.5 10 37.5C10 55 30 70 50 85C70 70 90 55 90 37.5C90 37.5 90 15 70 15C55 15 50 25 50 30Z',
  star: 'M50 5L61 38L95 38L67 58L78 92L50 71L22 92L33 58L5 38L39 38Z',
  smile: 'M50 8A42 42 0 1 1 49.9 8ZM35 35L35 45M65 35L65 45M28 60C38 76 62 76 72 60',
  // A horse's head and neck in profile, facing left: the year's emblem.
  horse:
    'M70 6L63 26C50 25 38 30 30 40C22 50 14 60 10 70C8 76 12 82 20 82L30 80C36 74 42 72 46 74C52 80 58 92 62 98L92 98C88 80 86 60 80 40C78 30 76 20 70 6ZM40 44L42 46',
} as const;
export type ShapeName = keyof typeof SHAPES;

type Point = readonly [number, number];

/** Parses SVG path data into polylines, one per subpath, with curves and arcs flattened. */
export function flattenPath(d: string, steps = 16): Point[][] {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const lines: Point[][] = [];
  let line: Point[] = [];
  let i = 0;
  let command = '';
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let lastControl: Point | undefined;
  const num = () => Number(tokens[i++]);
  const push = (px: number, py: number) => {
    line.push([px, py]);
    x = px;
    y = py;
  };
  const cubic = (c1: Point, c2: Point, end: Point) => {
    const [x0, y0] = [x, y];
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const u = 1 - t;
      push(
        u * u * u * x0 + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * end[0],
        u * u * u * y0 + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * end[1],
      );
    }
    lastControl = c2;
  };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i]!)) command = tokens[i++]!;
    const relative = command === command.toLowerCase();
    const ox = relative ? x : 0;
    const oy = relative ? y : 0;
    switch (command.toUpperCase()) {
      case 'M': {
        if (line.length > 1) lines.push(line);
        line = [];
        const px = num() + ox;
        const py = num() + oy;
        push(px, py);
        startX = px;
        startY = py;
        // Further pairs after a moveto are linetos.
        command = relative ? 'l' : 'L';
        break;
      }
      case 'L':
        push(num() + ox, num() + oy);
        break;
      case 'H':
        push(num() + ox, y);
        break;
      case 'V':
        push(x, num() + oy);
        break;
      case 'C': {
        const c1: Point = [num() + ox, num() + oy];
        const c2: Point = [num() + ox, num() + oy];
        cubic(c1, c2, [num() + ox, num() + oy]);
        break;
      }
      case 'S': {
        const c1: Point = lastControl ? [2 * x - lastControl[0], 2 * y - lastControl[1]] : [x, y];
        const c2: Point = [num() + ox, num() + oy];
        cubic(c1, c2, [num() + ox, num() + oy]);
        break;
      }
      case 'Q': {
        const q: Point = [num() + ox, num() + oy];
        const end: Point = [num() + ox, num() + oy];
        cubic(
          [x + (2 / 3) * (q[0] - x), y + (2 / 3) * (q[1] - y)],
          [end[0] + (2 / 3) * (q[0] - end[0]), end[1] + (2 / 3) * (q[1] - end[1])],
          end,
        );
        break;
      }
      case 'A': {
        // An arc, flattened through its centre (SVG's endpoint parameterisation).
        const rx0 = Math.abs(num());
        const ry0 = Math.abs(num());
        const phi = (num() * Math.PI) / 180;
        const large = num() !== 0;
        const sweep = num() !== 0;
        const ex = num() + ox;
        const ey = num() + oy;
        arc(x, y, rx0, ry0, phi, large, sweep, ex, ey, steps * 2).forEach(([px, py]) =>
          push(px, py),
        );
        break;
      }
      case 'Z':
        push(startX, startY);
        break;
      default:
        i++;
    }
    if (command.toUpperCase() !== 'C' && command.toUpperCase() !== 'S') lastControl = undefined;
  }
  if (line.length > 1) lines.push(line);
  return lines;
}

function arc(
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  phi: number,
  large: boolean,
  sweep: boolean,
  x2: number,
  y2: number,
  steps: number,
): Point[] {
  if (rx === 0 || ry === 0) return [[x2, y2]];
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const xp = cos * dx + sin * dy;
  const yp = -sin * dx + cos * dy;
  const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const den = rx * rx * yp * yp + ry * ry * xp * xp;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (k * rx * yp) / ry;
  const cyp = (-k * ry * xp) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = angle(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = angle((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const out: Point[] = [];
  for (let s = 1; s <= steps; s++) {
    const t = t1 + (dt * s) / steps;
    out.push([
      cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
      cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
    ]);
  }
  return out;
}

/**
 * `count` points evenly spaced along a path's outline (every subpath, by its share of the length),
 * centred on the box's middle, y up, scaled so the farthest is 1. As x, y pairs.
 */
export function shapePoints(d: string, count = 96): Float32Array {
  const lines = flattenPath(d);
  const lengths = lines.map((l) =>
    l.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - l[i]![0], p[1] - l[i]![1]), 0),
  );
  const total = lengths.reduce((a, b) => a + b, 0) || 1;
  const points: Point[] = [];
  lines.forEach((l, li) => {
    // A short subpath (an eye) still gets a star or two.
    const n =
      li === lines.length - 1
        ? count - points.length
        : Math.max(1, Math.round((count * lengths[li]!) / total));
    const step = lengths[li]! / n;
    let at = step / 2;
    let walked = 0;
    for (let i = 1; i < l.length && points.length < count; i++) {
      const [ax, ay] = l[i - 1]!;
      const [bx, by] = l[i]!;
      const seg = Math.hypot(bx - ax, by - ay);
      while (at <= walked + seg && points.length < count) {
        const t = seg > 0 ? (at - walked) / seg : 0;
        points.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
        at += step;
      }
      walked += seg;
    }
  });
  while (points.length < count) points.push(points[points.length - 1] ?? [50, 50]);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const far = Math.max(...points.map((p) => Math.hypot(p[0] - cx, p[1] - cy))) || 1;
  const out = new Float32Array(count * 2);
  points.slice(0, count).forEach((p, i) => {
    out[i * 2] = (p[0] - cx) / far;
    out[i * 2 + 1] = -(p[1] - cy) / far;
  });
  return out;
}
