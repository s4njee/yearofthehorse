#include "hash.wgsl"

// air.wgsl -- the wind in 3D (Wind Temple's story 2.1). Twin of src/gpu/wind/air.ts.
//
// Earth Temple's ground wind (its 2.4), widened from a lean on the ground to a velocity in the
// air, for smoke, lanterns and things in flight. Stateless: a pure function of the point and the
// time, so it stores nothing and survives a pause, a resize and a held frame.
//
// - The mean wind grows with height by the log wind profile: u(z) = U ln((z + z0) / z0) /
//   ln((H + z0) / z0), U at the reference height H over ground of roughness z0, ground at y = 0.
// - Gust fronts. A 3D value noise carried along the wind at its own speed (Taylor's frozen
//   turbulence), stretched across the wind, so a gust is a slab that sweeps over and things near
//   each other feel it together.
// - Turbulence. Smaller-scale noise in all three components, also carried along, at an intensity
//   (rms over mean) set by `turbulence`; the vertical part is half the others, as near the ground.
// - A slow veer, so the wind comes from a little either side.
//
//   air_velocity(p, air) -> vec3f   m/s at p (m)
//   air_mean(y, air) -> f32         the mean speed at height y (m)
//   air_gust(p, air) -> f32         0 calm to 1 at a gust's peak

struct Air {
  /** The way the wind blows, a horizontal unit vector. */
  dir: vec3f,
  /** Mean speed at the reference height, m/s. */
  speed: f32,
  /** The reference height, m. */
  height: f32,
  /** The ground's roughness length, m. */
  roughness: f32,
  /** Extra speed at a gust's peak, as a fraction of the mean. */
  gust: f32,
  /** A gust's size along the wind, m. */
  scale: f32,
  /** Turbulence intensity: rms fluctuation over the reference speed. */
  turbulence: f32,
  /** The most the wind veers either side, radians. */
  veer: f32,
  time: f32,
}

fn air_lattice(c: vec3i, seed: u32) -> f32 {
  let u = bitcast<vec3u>(c);
  return to_unorm_1d(pcg_3d(vec3u(u.x, u.y, u.z ^ (seed * 2654435769u))).x);
}

fn air_noise(p: vec3f, seed: u32) -> f32 {
  let cell = floor(p);
  let i = vec3i(cell);
  let f = p - cell;
  let u = f * f * (3.0 - 2.0 * f);
  let a = mix(air_lattice(i, seed), air_lattice(i + vec3i(1, 0, 0), seed), u.x);
  let b = mix(air_lattice(i + vec3i(0, 1, 0), seed), air_lattice(i + vec3i(1, 1, 0), seed), u.x);
  let c = mix(air_lattice(i + vec3i(0, 0, 1), seed), air_lattice(i + vec3i(1, 0, 1), seed), u.x);
  let d = mix(air_lattice(i + vec3i(0, 1, 1), seed), air_lattice(i + vec3i(1, 1, 1), seed), u.x);
  return mix(mix(a, b, u.y), mix(c, d, u.y), u.z);
}

fn air_mean(y: f32, air: Air) -> f32 {
  let z0 = max(air.roughness, 1e-4);
  let z = max(y, 0.0);
  return air.speed * log((z + z0) / z0) / log((air.height + z0) / z0);
}

/** The wind's frame at p: along, across and up, carried along at the mean speed. */
fn air_frame(p: vec3f, air: Air) -> vec3f {
  let across = vec3f(-air.dir.z, 0.0, air.dir.x);
  return vec3f(dot(p, air.dir) - air.speed * air.time, dot(p, across), p.y);
}

fn air_gust(p: vec3f, air: Air) -> f32 {
  let q = air_frame(p, air) / (air.scale * vec3f(1.0, 1.7, 1.0));
  return smoothstep(0.3, 0.85, air_noise(q, 11u));
}

fn air_velocity(p: vec3f, air: Air) -> vec3f {
  let q = air_frame(p, air);
  let g = smoothstep(0.3, 0.85, air_noise(q / (air.scale * vec3f(1.0, 1.7, 1.0)), 11u));
  let u = air_mean(p.y, air) * (1.0 + air.gust * g);
  let turn = (air_noise(p / (3.1 * air.scale) + vec3f(0.0, 0.0, 0.013 * air.time), 23u) - 0.5) * 2.0 * air.veer;
  let c = cos(turn);
  let s = sin(turn);
  let dir = vec3f(air.dir.x * c - air.dir.z * s, 0.0, air.dir.x * s + air.dir.z * c);
  // Fluctuations of unit rms: this value noise, less its mean, has an rms of 0.185 (measured), so
  // it is scaled by 5.4.
  let t = q / (0.3 * air.scale);
  let wobble = vec3f(air_noise(t, 31u), 0.5 * air_noise(t, 37u) + 0.25, air_noise(t, 41u)) - 0.5;
  return dir * u + wobble * 5.4 * air.turbulence * air.speed;
}
