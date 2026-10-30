#include "hash.wgsl"

// wind.wgsl -- wind over the ground, for grass (story 2.4). Twin of src/gpu/wind/wind.ts.
//
// Stateless: a pure function of the ground point and the time, so it stores nothing per blade.
//
// - Gust fronts. A value noise carried along the wind at the gust speed. The waves seen crossing
//   a field are blades bent together by one gust, so the gust is smooth in space and neighbours
//   lean together.
// - A steady lean under the gusts, and a slow veer, so gusts come from a little either side.
// - Flutter. Each blade's own sway, at its natural frequency (short stiff blades faster), larger
//   in a gust. Its phase is the blade's own, so neighbours flutter apart while they lean together.
//
//   ground_wind(p, wind, freq, phase) -> vec2f   the tip's offset on the ground (x, z), as a
//                                                 fraction of the blade's height
//   gustiness(p, wind) -> f32                     0 calm to 1 at a gust's peak
//   value_noise(p, seed) -> f32                   smooth noise in [0, 1], on a unit lattice

struct Wind {
  /** The way the wind blows over the ground (x, z), a unit vector. */
  dir: vec2f,
  /** Steady lean of a tip, as a fraction of the blade's height. */
  lean: f32,
  /** Extra lean at a gust's peak. */
  gust: f32,
  /** How fast a gust front travels, m/s. */
  speed: f32,
  /** A gust's size along the wind, m. */
  scale: f32,
  /** A blade's own sway, as a fraction of its height. */
  flutter: f32,
  time: f32,
}

fn wind_lattice(c: vec2i, seed: u32) -> f32 {
  return to_unorm_1d(pcg_3d(vec3u(bitcast<vec2u>(c), seed)).x);
}

fn value_noise(p: vec2f, seed: u32) -> f32 {
  let cell = floor(p);
  let i = vec2i(cell);
  let f = p - cell;
  let u = f * f * (3.0 - 2.0 * f);
  let a = wind_lattice(i, seed);
  let b = wind_lattice(i + vec2i(1, 0), seed);
  let c = wind_lattice(i + vec2i(0, 1), seed);
  let d = wind_lattice(i + vec2i(1, 1), seed);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn gustiness(p: vec2f, w: Wind) -> f32 {
  let along = dot(p, w.dir);
  let across = dot(p, vec2f(-w.dir.y, w.dir.x));
  let g = value_noise(vec2f((along - w.speed * w.time) / w.scale, across / (1.7 * w.scale)), 11u);
  return smoothstep(0.3, 0.85, g);
}

fn ground_wind(p: vec2f, w: Wind, freq: f32, phase: f32) -> vec2f {
  let g = gustiness(p, w);
  let veer = (value_noise(p / (3.1 * w.scale) + vec2f(0.0, 0.013 * w.time), 23u) - 0.5) * 0.8;
  let dir = vec2f(w.dir.x * cos(veer) - w.dir.y * sin(veer), w.dir.x * sin(veer) + w.dir.y * cos(veer));
  let spin = 6.2831853 * freq * w.time;
  let lean = w.lean + w.gust * g + w.flutter * (0.4 + g) * sin(spin + phase);
  let side = 0.35 * w.flutter * (0.4 + g) * cos(0.71 * spin + 1.3 * phase);
  return dir * lean + vec2f(-dir.y, dir.x) * side;
}
