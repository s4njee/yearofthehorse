// Copied from Fire Temple (firetemple/src/wgsl/msdf.wgsl) for halation-text (story 6.6). Moon Temple
// has no msdf.wgsl in its include library, so callers add this as a run-time chunk:
//   withChunks(shader, { "msdf.wgsl": msdf.code })   then   #include "msdf.wgsl"
//
// msdf.wgsl -- text from the shared multi-channel signed-distance atlas (src/gpu/ui/atlas.ts: Anton
// A-Z then 0-9, 12 x 3 cells of 32 x 48 px, distance range 4 px). Bind the atlas as
// texture_2d<f32> of LINEAR data with a linear, clamping sampler and pass both in.
//
// Glyph space: `local` is a position in a glyph's CELL, 0..1 across and down (y down), so a cell
// is 2/3 as wide as it is high; src/gpu/ui/atlas.ts `layoutText` gives each glyph's cell offset.
//
//   MSDF_COLUMNS, MSDF_ROWS           12, 3
//   MSDF_ASPECT                       cell width / height: 32 / 48
//   MSDF_RANGE                        the field's range in cell heights (4 / 48): distances are
//                                     exact within MSDF_RANGE / 2 of the outline and saturate beyond
//   msdf_median(v: vec3f) -> f32      the median of three: how an MSDF is read
//   msdf_distance(tex, smp, glyph: u32, local: vec2f) -> f32
//       Signed distance to glyph `glyph`'s outline in CELL HEIGHTS, negative inside. Outside the
//       cell it is at least the distance to the cell, so a caller can loop over glyphs and take the
//       minimum. Saturates at about MSDF_RANGE / 2 away from the outline.
//   msdf_coverage(distance, pixel) -> f32
//       Anti-aliased ink, 0..1, from a distance and the size of one screen pixel in the same units.
//
// Cost: one bilinear fetch and a median per call.

const MSDF_COLUMNS: f32 = 12.0;
const MSDF_ROWS: f32 = 3.0;
const MSDF_ASPECT: f32 = 0.6666667;
const MSDF_RANGE: f32 = 0.0833333;

fn msdf_median(v: vec3f) -> f32 {
  return max(min(v.r, v.g), min(max(v.r, v.g), v.b));
}

fn msdf_distance(tex: texture_2d<f32>, smp: sampler, glyph: u32, local: vec2f) -> f32 {
  // Half a texel in from the cell's border, so the sample never reaches the next glyph.
  let inset = vec2f(0.5 / 32.0, 0.5 / 48.0);
  let inner = clamp(local, inset, vec2f(1.0) - inset);
  let cell = vec2f(f32(glyph % 12u), f32(glyph / 12u));
  let uv = (cell + inner) / vec2f(MSDF_COLUMNS, MSDF_ROWS);
  let field = (0.5 - msdf_median(textureSampleLevel(tex, smp, uv, 0.0).rgb)) * MSDF_RANGE;
  // Beyond the cell the field is clamped; add how far beyond it the point is (cell heights).
  let outside = length((local - inner) * vec2f(MSDF_ASPECT, 1.0));
  return field + outside;
}

fn msdf_coverage(distance: f32, pixel: f32) -> f32 {
  return clamp(0.5 - distance / max(pixel, 1e-6), 0.0, 1.0);
}
