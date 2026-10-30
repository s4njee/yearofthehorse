#include "aperture.wgsl"
#include "points-params.wgsl"

// Energy-conserving points of light (story 2.3): one instanced quad per point, just big enough
// for its circle of confusion, adding the point's light to the scene through aperture.wgsl.
//
// A point is two vec4f: (x, y, radius, unused) in device pixels from the top left, with the signed
// circle-of-confusion radius; then (r, g, b, unused), its light. The light is the point's total:
// summed over the pixels it touches, the scene gains exactly (r, g, b), in focus or out of it.
//
// Chromatic aberration (story 2.4), when `axial` or `lateral` is set, draws each channel with its
// own disc, so each channel still keeps its light:
//
//   axial    each colour focuses at its own distance: the focus distance becomes
//            focus * (1 + axial * k) for k = +1, 0, -1 (red, green, blue), which changes a
//            point's radius by -axial * k * (blur at infinity - radius). Out of focus, red and blue
//            discs differ in size and fringe one colour outside, its complement inside.
//   lateral  each colour is magnified differently: the channel's disc moves away from the image
//            centre by lateral * k times the point's distance from it.

struct Point {
  at: vec4f,
  light: vec4f,
}

@group(0) @binding(0) var<storage, read> points: array<Point>;
@group(0) @binding(1) var<uniform> params: PointsParams;

struct PointVarying {
  @builtin(position) position: vec4f,
  /// Offset from the point's centre, device pixels.
  @location(0) offset: vec2f,
  @location(1) @interpolate(flat) radius: f32,
  @location(2) @interpolate(flat) light: vec3f,
  @location(3) @interpolate(flat) field: vec2f,
  /// The point's offset from the image centre, device pixels.
  @location(4) @interpolate(flat) from_centre: vec2f,
}

/// Red, green and blue's step in the aberration.
const CHANNEL_STEP = vec3f(1.0, 0.0, -1.0);

fn channel_radius(radius: f32, k: f32) -> f32 {
  return radius - params.axial * k * (params.blur_at_infinity - radius);
}

@vertex fn points_vs(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> PointVarying {
  let point = points[instance];
  let corners = array(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  // Room for the edge ramp and the pixel the smallest point spreads over, and for the channels'
  // discs when they are drawn apart.
  let centre = 0.5 * params.out_size;
  let largest = max(abs(channel_radius(point.at.z, 1.0)), abs(channel_radius(point.at.z, -1.0)));
  let shift = abs(params.lateral) * length(point.at.xy - centre);
  let half = max(largest, APERTURE_MIN_RADIUS) + 1.5 + shift;
  let offset = corners[vertex] * half;
  let pixel = point.at.xy + offset;
  var out: PointVarying;
  out.position = vec4f(pixel / params.out_size * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  out.offset = offset;
  out.radius = point.at.z;
  out.light = point.light.rgb * params.gain;
  out.field = (point.at.xy - centre) / length(centre);
  out.from_centre = point.at.xy - centre;
  return out;
}

@fragment fn points_fs(in: PointVarying) -> @location(0) vec4f {
  // The pixel's centre relative to the point's: the interpolated offset is already at the centre.
  let a = Aperture(
    params.blades, params.rotation, params.curvature, params.unit_area,
    params.rim, params.rings, params.ring_count, params.vignette, in.field,
    params.obstruction, params.profile_mean, params.use_table, params.table);
  if (params.axial == 0.0 && params.lateral == 0.0) {
    let share = aperture_light(in.offset, in.radius, a);
    if (share <= 0.0) {
      discard;
    }
    return vec4f(in.light * share, 0.0);
  }
  var share = vec3f(0.0);
  for (var c = 0; c < 3; c++) {
    let k = CHANNEL_STEP[c];
    let offset = in.offset - in.from_centre * params.lateral * k;
    share[c] = aperture_light(offset, channel_radius(in.radius, k), a);
  }
  if (max(share.r, max(share.g, share.b)) <= 0.0) {
    discard;
  }
  return vec4f(in.light * share, 0.0);
}
