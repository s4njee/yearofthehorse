#include "stroke-frame.wgsl"
#include "stroke-topology.wgsl"
#include "stroke-bindings.wgsl"

// The shared stroke renderer's vertex and fragment stages (`src/gpu/strokes.ts`). One instance per
// segment: a quad around it, padded by however far the shade's light reaches, and in the fragment
// stage this pixel's place relative to the segment. What the light looks like is the shade's:
//
//   fn stroke_level(s: Stroke) -> f32                         // <= 0 culls the segment
//   fn stroke_pad(s: Stroke) -> f32                           // device px of quad around it
//   fn stroke_shade(s: Stroke, level: f32, at: StrokePoint) -> vec4f
//
// The layer's blend (max or add) is what joins segments: the maximum of a distance falloff over
// segments is the falloff of the distance to the whole stroke, and a sum of equal-energy steps
// whose profiles telescope along the segment is a seamless beam.

@group(0) @binding(0) var<storage, read> stroke_data: array<vec4f>;
@group(0) @binding(1) var<uniform> stroke_frame: StrokeFrame;

// One segment, its ends in device pixels; `a` and `b` are the record's own data (see strokes.ts).
struct Stroke {
  p0: vec2f,
  p1: vec2f,
  a: vec4f,
  b: vec4f,
}

// Where a pixel lies relative to the segment, in device pixels.
struct StrokePoint {
  // The pixel, minus `p0`.
  offset: vec2f,
  // Distance along the segment from `p0`, unclamped (negative before it, past `length` after).
  along: f32,
  // Signed distance across it, positive to the left of `p0 -> p1` in screen space.
  across: f32,
  length: f32,
  // The nearest point's place on the segment, 0..1.
  t: f32,
  // Distance to the nearest point of the segment.
  distance: f32,
}

fn stroke_to_pixels(p: vec2f) -> vec2f {
  return p * stroke_frame.scale + stroke_frame.offset;
}

fn stroke_fetch(index: u32) -> Stroke {
  var s: Stroke;
  if (STROKE_STRIP) {
    // A polyline: segment i runs from point i to point i + 1, and each point is one vec4f.
    s.a = stroke_data[index];
    s.b = stroke_data[index + 1u];
    s.p0 = stroke_to_pixels(s.a.xy);
    s.p1 = stroke_to_pixels(s.b.xy);
  } else {
    let ends = stroke_data[index * 3u];
    s.p0 = stroke_to_pixels(ends.xy);
    s.p1 = stroke_to_pixels(ends.zw);
    s.a = stroke_data[index * 3u + 1u];
    s.b = stroke_data[index * 3u + 2u];
  }
  return s;
}

// An approximation of the error function, good to about 1e-4 (Abramowitz and Stegun 7.1.26).
fn stroke_erf(x: f32) -> f32 {
  let t = 1.0 / (1.0 + 0.3275911 * abs(x));
  let y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-x * x);
  return sign(x) * y;
}

#include "stroke-shade.wgsl"

struct StrokeVarying {
  @builtin(position) position: vec4f,
  @location(0) @interpolate(flat) p0: vec2f,
  @location(1) @interpolate(flat) p1: vec2f,
  @location(2) @interpolate(flat) a: vec4f,
  @location(3) @interpolate(flat) b: vec4f,
  @location(4) @interpolate(flat) level: f32,
}

@vertex fn stroke_vs(@builtin(vertex_index) corner: u32, @builtin(instance_index) index: u32) -> StrokeVarying {
  let s = stroke_fetch(index);
  var out: StrokeVarying;
  out.p0 = s.p0;
  out.p1 = s.p1;
  out.a = s.a;
  out.b = s.b;
  out.level = stroke_level(s);

  let axis = s.p1 - s.p0;
  let len = length(axis);
  let dir = select(vec2f(1.0, 0.0), axis / len, len > 1e-4);
  let perp = vec2f(-dir.y, dir.x);
  let pad = stroke_pad(s);
  var along = array<f32, 6>(0.0, 1.0, 0.0, 0.0, 1.0, 1.0);
  var across = array<f32, 6>(-1.0, -1.0, 1.0, 1.0, -1.0, 1.0);
  let pos = mix(s.p0 - dir * pad, s.p1 + dir * pad, along[corner]) + perp * pad * across[corner];
  let size = stroke_frame.out_size;
  let ndc = vec2f(pos.x / size.x * 2.0 - 1.0, 1.0 - pos.y / size.y * 2.0);
  // A culled segment is moved off screen, so it rasterises nothing.
  out.position = select(vec4f(ndc, 0.0, 1.0), vec4f(2.0, 2.0, 0.0, 1.0), out.level <= 0.0);
  return out;
}

@fragment fn stroke_fs(in: StrokeVarying) -> @location(0) vec4f {
  var s: Stroke;
  s.p0 = in.p0;
  s.p1 = in.p1;
  s.a = in.a;
  s.b = in.b;
  let axis = in.p1 - in.p0;
  let len2 = max(dot(axis, axis), 1e-6);
  let len = sqrt(dot(axis, axis));
  let dir = select(vec2f(1.0, 0.0), axis / len, len > 1e-4);
  var at: StrokePoint;
  at.offset = in.position.xy - in.p0;
  at.along = dot(at.offset, dir);
  at.across = dot(at.offset, vec2f(-dir.y, dir.x));
  at.length = len;
  at.t = clamp(dot(at.offset, axis) / len2, 0.0, 1.0);
  at.distance = length(in.position.xy - (in.p0 + axis * at.t));
  return stroke_shade(s, in.level, at);
}
