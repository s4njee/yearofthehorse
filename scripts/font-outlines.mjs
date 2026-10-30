// Temple of Time's story 1.6: reads a TrueType font's outlines for printable ASCII and writes them, flattened to
// line segments, as a TypeScript module the text field (src/gpu/text/) turns into a signed
// distance field on the GPU at load. No font tooling is needed: this reads the tables it uses
// (head, hhea, maxp, hmtx, cmap format 4, loca, glyf with composites) itself.
//
//   node scripts/font-outlines.mjs fonts/Anton-Regular.ttf src/gpu/text/anton.generated.ts ANTON
//
// Kerning (GPOS) is not read: the layout uses advance widths only.

import { readFileSync, writeFileSync } from 'node:fs';

const [, , input, output, name = 'FONT'] = process.argv;
const data = readFileSync(input);
const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
const u16 = (o) => view.getUint16(o);
const i16 = (o) => view.getInt16(o);
const u32 = (o) => view.getUint32(o);

const tables = {};
for (let i = 0, n = u16(4); i < n; i++) {
  const record = 12 + i * 16;
  const tag = String.fromCharCode(...data.subarray(record, record + 4));
  tables[tag] = { offset: u32(record + 8), length: u32(record + 12) };
}
for (const tag of ['head', 'hhea', 'maxp', 'hmtx', 'cmap', 'loca', 'glyf']) {
  if (!tables[tag]) throw new Error(`${input}: no ${tag} table`);
}

const head = tables.head.offset;
const unitsPerEm = u16(head + 18);
const longLoca = i16(head + 50) === 1;
const numGlyphs = u16(tables.maxp.offset + 4);
const hhea = tables.hhea.offset;
const ascender = i16(hhea + 4);
const descender = i16(hhea + 6);
const lineGap = i16(hhea + 8);
const numberOfHMetrics = u16(hhea + 34);

const advance = (glyph) => u16(tables.hmtx.offset + 4 * Math.min(glyph, numberOfHMetrics - 1));

// cmap: the Windows Unicode BMP subtable (3, 1), format 4.
function glyphForCode() {
  const cmap = tables.cmap.offset;
  let sub;
  for (let i = 0, n = u16(cmap + 2); i < n; i++) {
    const r = cmap + 4 + i * 8;
    const platform = u16(r);
    const encoding = u16(r + 2);
    if ((platform === 3 && encoding === 1) || (platform === 0 && sub === undefined)) {
      sub = cmap + u32(r + 4);
    }
  }
  if (sub === undefined || u16(sub) !== 4) throw new Error(`${input}: no format 4 cmap`);
  const segX2 = u16(sub + 6);
  const ends = sub + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;
  return (code) => {
    for (let s = 0; s < segX2 / 2; s++) {
      const end = u16(ends + 2 * s);
      if (code > end) continue;
      const start = u16(starts + 2 * s);
      if (code < start) return 0;
      const delta = i16(deltas + 2 * s);
      const rangeOffset = u16(ranges + 2 * s);
      if (rangeOffset === 0) return (code + delta) & 0xffff;
      const at = ranges + 2 * s + rangeOffset + 2 * (code - start);
      const glyph = u16(at);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  };
}
const glyphOf = glyphForCode();

const locaAt = (glyph) =>
  longLoca ? u32(tables.loca.offset + 4 * glyph) : 2 * u16(tables.loca.offset + 2 * glyph);

/** Contours of a glyph as arrays of { x, y, on } points, composites resolved. */
function contoursOf(glyph, depth = 0) {
  if (glyph >= numGlyphs || depth > 8) return [];
  const start = locaAt(glyph);
  if (locaAt(glyph + 1) === start) return [];
  const g = tables.glyf.offset + start;
  const count = i16(g);
  if (count < 0) {
    // Composite: components placed by offsets, with an optional scale.
    const contours = [];
    let p = g + 10;
    let flags;
    do {
      flags = u16(p);
      const component = u16(p + 2);
      p += 4;
      let dx;
      let dy;
      if (flags & 1) {
        dx = i16(p);
        dy = i16(p + 2);
        p += 4;
      } else {
        dx = view.getInt8(p);
        dy = view.getInt8(p + 1);
        p += 2;
      }
      let a = 1;
      let b = 0;
      let c = 0;
      let d = 1;
      const f2 = (o) => i16(o) / 16384;
      if (flags & 8) {
        a = d = f2(p);
        p += 2;
      } else if (flags & 0x40) {
        a = f2(p);
        d = f2(p + 2);
        p += 4;
      } else if (flags & 0x80) {
        a = f2(p);
        b = f2(p + 2);
        c = f2(p + 4);
        d = f2(p + 6);
        p += 8;
      }
      if (!(flags & 2)) throw new Error(`${input}: point-matched composites are not supported`);
      for (const contour of contoursOf(component, depth + 1)) {
        contours.push(
          contour.map((q) => ({ x: a * q.x + c * q.y + dx, y: b * q.x + d * q.y + dy, on: q.on })),
        );
      }
    } while (flags & 0x20);
    return contours;
  }
  const endPts = Array.from({ length: count }, (_, i) => u16(g + 10 + 2 * i));
  const points = count ? endPts[count - 1] + 1 : 0;
  let p = g + 10 + 2 * count;
  p += 2 + u16(p);
  const flags = [];
  while (flags.length < points) {
    const flag = data[p++];
    flags.push(flag);
    if (flag & 8) for (let r = data[p++]; r > 0; r--) flags.push(flag);
  }
  const coords = (short, same) => {
    const out = [];
    let value = 0;
    for (const flag of flags) {
      if (flag & short) value += flag & same ? data[p++] : -data[p++];
      else if (!(flag & same)) {
        value += i16(p);
        p += 2;
      }
      out.push(value);
    }
    return out;
  };
  const xs = coords(2, 16);
  const ys = coords(4, 32);
  const contours = [];
  let from = 0;
  for (const end of endPts) {
    const contour = [];
    for (let i = from; i <= end; i++)
      contour.push({ x: xs[i], y: ys[i], on: (flags[i] & 1) === 1 });
    contours.push(contour);
    from = end + 1;
  }
  return contours;
}

/**
 * A contour of quadratic splines flattened to a closed polyline, each spline split into as many
 * pieces as keep it within `TOLERANCE` font units of the curve: a quadratic's error with n pieces
 * is at most d / (4 n^2), d the control point's distance from the chord's midpoint.
 */
const TOLERANCE = 1.5;
function flatten(contour) {
  if (contour.length < 2) return [];
  // Insert the implied on-curve point between two off-curve points, and start on-curve.
  const pts = [];
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i];
    const b = contour[(i + 1) % contour.length];
    pts.push(a);
    if (!a.on && !b.on) pts.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, on: true });
  }
  const first = pts.findIndex((q) => q.on);
  const ring = [...pts.slice(first), ...pts.slice(0, first)];
  const lines = [];
  let i = 0;
  while (i < ring.length) {
    const p0 = ring[i];
    const p1 = ring[(i + 1) % ring.length];
    if (p1.on) {
      lines.push([p0.x, p0.y, p1.x, p1.y]);
      i += 1;
      continue;
    }
    const p2 = ring[(i + 2) % ring.length];
    const bend = Math.hypot(p1.x - (p0.x + p2.x) / 2, p1.y - (p0.y + p2.y) / 2);
    const steps = Math.max(1, Math.ceil(Math.sqrt(bend / (4 * TOLERANCE))));
    let px = p0.x;
    let py = p0.y;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
      const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
      lines.push([px, py, x, y]);
      px = x;
      py = y;
    }
    i += 2;
  }
  // As a closed polyline of rounded points: each line ends where the next begins.
  return lines.map((l) => [Math.round(l[0]), Math.round(l[1])]);
}

const glyphs = {};
let total = 0;
for (let code = 32; code < 127; code++) {
  const glyph = glyphOf(code);
  const polylines = contoursOf(glyph)
    .map(flatten)
    .filter((p) => p.length > 1);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of polylines.flat()) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  // Each contour as its point count, then its points: a closed polyline.
  const ints = Int16Array.from(polylines.flatMap((p) => [p.length, ...p.flat()]));
  const segments = polylines.flat();
  total += segments.length;
  glyphs[String.fromCharCode(code)] = {
    advance: advance(glyph),
    bounds: segments.length ? [x0, y0, x1, y1] : [0, 0, 0, 0],
    contours: Buffer.from(ints.buffer).toString('base64'),
  };
}

writeFileSync(
  output,
  `// Generated by scripts/font-outlines.mjs from ${input.split('/').pop()}. Do not edit by hand.
// Licensed under the SIL Open Font License 1.1 (fonts/${input
    .split('/')
    .pop()
    .replace(/-Regular\.ttf$/, '')}-OFL.txt).
import type { FontOutlines } from './font.ts';

export const ${name}: FontOutlines = ${JSON.stringify({ unitsPerEm, ascender, descender, lineGap, glyphs })};
`,
);
console.log(
  `${output}: ${Object.keys(glyphs).length} glyphs, ${total} segments, ${unitsPerEm} units per em`,
);
