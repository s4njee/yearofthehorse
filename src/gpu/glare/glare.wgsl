#include "glare-params.wgsl"

// Glare round bright lights (stories 2.6 and 2.7): diffraction spikes and an anamorphic streak,
// added to the scene. One thin quad per ray, along it: a ray is a few pixels wide and a few decay
// lengths long, so drawing each light as one square round all its rays wasted almost every
// fragment.
//
// A light is two vec4f: (x, y, unused, unused) in device pixels, then (r, g, b, unused), its total
// light. Its spikes take `spike_share` of that light: `spikes` rays at `rotation`, each with profile
// exp(-t^2 / 2w^2) * exp(-s / l) for s along the ray and t across it, whose integral is
// w sqrt(2 pi) l, so the amplitude is set to make the rays carry exactly their share. Diffraction
// spreads longer wavelengths further: each channel's length is `length` times `chroma` (red longer,
// blue shorter). The streak is the same with two opposite rays along x, stretched by an anamorphic
// lens: `streak_share` of the light, `streak_length` long.
//
// Instance k is ray k % rays of light k / rays, where rays = spikes (+ 2 with a streak).

struct Light {
  at: vec4f,
  light: vec4f,
}

@group(0) @binding(0) var<storage, read> lights: array<Light>;
@group(0) @binding(1) var<uniform> params: GlareParams;

struct GlareVarying {
  @builtin(position) position: vec4f,
  /// Along the ray and across it, device pixels.
  @location(0) along: f32,
  @location(1) across: f32,
  /// The light this ray carries, per channel, and its length per channel.
  @location(2) @interpolate(flat) light: vec3f,
  @location(3) @interpolate(flat) length: vec3f,
}

const GLARE_PI: f32 = 3.14159265358979;

fn ray_count() -> u32 {
  return u32(params.spikes) + select(0u, 2u, params.streak_share > 0.0);
}

@vertex fn glare_vs(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> GlareVarying {
  let rays = ray_count();
  let l = lights[instance / rays];
  let r = instance % rays;
  let spikes = u32(params.spikes);
  var dir: vec2f;
  var len: f32;
  var share: f32;
  if (r < spikes) {
    let a = params.rotation + f32(r) * 2.0 * GLARE_PI / f32(spikes);
    dir = vec2f(cos(a), sin(a));
    len = params.length;
    share = params.spike_share / f32(spikes);
  } else {
    dir = select(vec2f(-1.0, 0.0), vec2f(1.0, 0.0), r == spikes);
    len = params.streak_length;
    share = 0.5 * params.streak_share;
  }
  // Long enough for the longest channel to fall to e^-7, wide enough for four sigma either side.
  let reach = 7.0 * len * max(params.chroma.x, max(params.chroma.y, params.chroma.z));
  let half_width = 4.0 * params.width + 1.0;
  let corners = array(vec2f(0.0, -1.0), vec2f(1.0, -1.0), vec2f(0.0, 1.0), vec2f(0.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  let c = corners[vertex];
  let along = c.x * reach;
  let across = c.y * half_width;
  let perp = vec2f(-dir.y, dir.x);
  let pixel = l.at.xy + dir * along + perp * across;
  var out: GlareVarying;
  out.position = vec4f(pixel / params.out_size * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  out.along = along;
  out.across = across;
  out.light = l.light.rgb * share;
  out.length = len * params.chroma;
  return out;
}

@fragment fn glare_fs(in: GlareVarying) -> @location(0) vec4f {
  let w = params.width;
  let profile = exp(-in.across * in.across / (2.0 * w * w)) / (w * sqrt(2.0 * GLARE_PI));
  let along = exp(-max(in.along, 0.0) / in.length) / in.length;
  let light = in.light * profile * along;
  if (max(light.r, max(light.g, light.b)) < 1e-7) {
    discard;
  }
  return vec4f(light, 0.0);
}
