// The glyph atlas's signed distance field (Temple of Time's story 1.6). One texel per invocation of a fullscreen
// pass over the atlas: find the texel's glyph from its cell, then the exact distance to that
// glyph's line segments, negative inside by the non-zero winding rule. In em; r16float.
#include "fullscreen.wgsl"
#include "atlas-params.wgsl"

struct GlyphCell {
  /** First segment and segment count, in `segments`. */
  first: u32,
  count: u32,
  /** Where the glyph's origin sits in its cell, px from the cell's bottom-left, y up. */
  origin: vec2f,
}

@group(0) @binding(0) var<uniform> atlas: AtlasParams;
@group(0) @binding(1) var<storage, read> cells: array<GlyphCell>;
@group(0) @binding(2) var<storage, read> segments: array<vec4f>;

@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  let texel = floor(in.position.xy);
  let cell = vec2u(texel / atlas.cell);
  let index = cell.y * u32(atlas.columns) + cell.x;
  if (index >= u32(atlas.glyphs)) {
    return vec4f(atlas.far, 0.0, 0.0, 1.0);
  }
  let info = cells[index];
  // Texel centre within its cell, y up from the cell's bottom, then em from the glyph origin.
  let local = vec2f(texel.x - f32(cell.x) * atlas.cell + 0.5, (f32(cell.y) + 1.0) * atlas.cell - texel.y - 0.5);
  let p = (local - info.origin) / atlas.px_per_em;
  var best = atlas.far;
  var winding = 0;
  for (var i = info.first; i < info.first + info.count; i++) {
    let s = segments[i];
    let a = s.xy;
    let e = s.zw - s.xy;
    let t = clamp(dot(p - a, e) / max(dot(e, e), 1e-12), 0.0, 1.0);
    best = min(best, length(p - a - t * e));
    if ((a.y <= p.y) != (s.w <= p.y)) {
      let x = a.x + (p.y - a.y) / (s.w - a.y) * e.x;
      if (x > p.x) {
        winding += select(-1, 1, s.w > a.y);
      }
    }
  }
  return vec4f(select(best, -best, winding != 0), 0.0, 0.0, 1.0);
}
