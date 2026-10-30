// Laid-out text into a screen-sized distance field (Temple of Time's story 1.6): one quad per glyph over its
// bounds and the atlas's spread, reading the atlas and writing the signed distance in screen px.
// The target blends with `min`, so overlapping letters merge into one shape.
#include "text-params.wgsl"

struct Placed {
  /** Glyph origin on screen, px (y down), and its atlas cell's bottom-left, texels. */
  origin: vec2f,
  cell: vec2f,
  /** Glyph bounds in em (x0, y0, x1, y1), y up. */
  bounds: vec4f,
  /** Where the glyph origin sits in its cell, px, y up. */
  cell_origin: vec2f,
  _pad: vec2f,
}

@group(0) @binding(0) var<uniform> text: TextParams;
@group(0) @binding(1) var<storage, read> placed: array<Placed>;
@group(0) @binding(2) var atlas_tex: texture_2d<f32>;
@group(0) @binding(3) var atlas_samp: sampler;

struct Varying {
  @builtin(position) position: vec4f,
  /** Em coordinates within the glyph, y up. */
  @location(0) em: vec2f,
  @location(1) @interpolate(flat) cell: vec2f,
  @location(2) @interpolate(flat) cell_origin: vec2f,
}

const CORNERS = array(vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0), vec2f(1.0, 1.0));

@vertex fn quad_vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Varying {
  let g = placed[i];
  let pad = text.spread_em;
  let lo = g.bounds.xy - vec2f(pad);
  let hi = g.bounds.zw + vec2f(pad);
  let em = mix(lo, hi, CORNERS[v]);
  let screen = g.origin + vec2f(em.x, -em.y) * text.px_per_em;
  var out: Varying;
  out.position = vec4f(screen.x / text.width * 2.0 - 1.0, 1.0 - screen.y / text.height * 2.0, 0.0, 1.0);
  out.em = em;
  out.cell = g.cell;
  out.cell_origin = g.cell_origin;
  return out;
}

@fragment fn quad_fs(in: Varying) -> @location(0) vec4f {
  // Atlas texel coordinates: the cell's bottom-left plus the glyph origin plus em in atlas px.
  let local = in.cell_origin + in.em * text.atlas_px_per_em;
  let uv = vec2f(in.cell.x + local.x, in.cell.y - local.y) / text.atlas_size;
  let d = textureSampleLevel(atlas_tex, atlas_samp, uv, 0.0).r;
  return vec4f(d * text.px_per_em, 0.0, 0.0, 1.0);
}
