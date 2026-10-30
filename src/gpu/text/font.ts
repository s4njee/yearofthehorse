/*
 * Temple of Time's story 1.6: fonts as outlines, and laying a line of text out with them. The outlines come from
 * scripts/font-outlines.mjs (TrueType quadratics flattened to line segments, in font units); the
 * GPU turns them into a signed distance field (sdf-atlas.ts). Advance widths only: no kerning.
 */

export interface GlyphOutline {
  /** Advance width, font units. */
  advance: number;
  /** [x0, y0, x1, y1] in font units, y up; zeros for an empty glyph. */
  bounds: readonly [number, number, number, number];
  /**
   * Closed polylines as base64 Int16: for each contour its point count, then x, y per point, in
   * font units, y up.
   */
  contours: string;
}

export interface FontOutlines {
  unitsPerEm: number;
  ascender: number;
  descender: number;
  lineGap: number;
  glyphs: Readonly<Record<string, GlyphOutline>>;
}

/**
 * A glyph's outline as line segments x0, y0, x1, y1 (font units), decoded from its base64
 * polylines (works in browsers and Node).
 */
export function glyphSegments(glyph: GlyphOutline): Int16Array {
  const binary = atob(glyph.contours);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ints = new Int16Array(bytes.buffer);
  const out: number[] = [];
  for (let i = 0; i < ints.length;) {
    const n = ints[i++]!;
    for (let k = 0; k < n; k++) {
      const a = i + 2 * k;
      const b = i + 2 * ((k + 1) % n);
      out.push(ints[a]!, ints[a + 1]!, ints[b]!, ints[b + 1]!);
    }
    i += 2 * n;
  }
  return Int16Array.from(out);
}

export interface PlacedGlyph {
  char: string;
  /** Origin of the glyph on the baseline, in em, x right and y up from the line's start. */
  x: number;
}

export interface LineLayout {
  glyphs: PlacedGlyph[];
  /** Width of the line in em, from the first origin to the last advance. */
  width: number;
}

/** Lays one line out by advance widths, `tracking` em added between letters. */
export function layoutLine(font: FontOutlines, text: string, tracking = 0): LineLayout {
  const glyphs: PlacedGlyph[] = [];
  let x = 0;
  for (const char of text) {
    const glyph = font.glyphs[char] ?? font.glyphs['?'];
    if (!glyph) continue;
    glyphs.push({ char: font.glyphs[char] ? char : '?', x });
    x += glyph.advance / font.unitsPerEm + tracking;
  }
  return { glyphs, width: Math.max(0, x - tracking) };
}

/** Signed distance (em; negative inside) from a point in em to a glyph, by brute force. */
export function glyphDistance(font: FontOutlines, char: string, px: number, py: number): number {
  const glyph = font.glyphs[char];
  if (!glyph) return Infinity;
  const s = glyphSegments(glyph);
  const scale = 1 / font.unitsPerEm;
  let best = Infinity;
  let winding = 0;
  for (let i = 0; i < s.length; i += 4) {
    const ax = s[i]! * scale;
    const ay = s[i + 1]! * scale;
    const bx = s[i + 2]! * scale;
    const by = s[i + 3]! * scale;
    const ex = bx - ax;
    const ey = by - ay;
    const t = Math.min(
      1,
      Math.max(0, ((px - ax) * ex + (py - ay) * ey) / (ex * ex + ey * ey || 1)),
    );
    best = Math.min(best, Math.hypot(px - ax - t * ex, py - ay - t * ey));
    // Non-zero winding: a ray to +x crossing the segment upwards or downwards.
    if (ay <= py !== by <= py) {
      const x = ax + ((py - ay) / (by - ay)) * ex;
      if (x > px) winding += by > ay ? 1 : -1;
    }
  }
  return winding !== 0 ? -best : best;
}
