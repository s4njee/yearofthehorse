#include "wind.wgsl"

// clouds.wgsl -- a layer of cumulus drifting with the wind aloft: the sky draws it, and the grass
// is shaded by it (grass-shade.wgsl), from the same noise, so each shadow belongs to a cloud.
//
//   cloud_cover(p, wind_dir, time, speed, scale) -> f32   0 clear to 1 under a cloud's middle,
//                                                          at a ground point (x, z), m

fn cloud_cover(p: vec2f, wind_dir: vec2f, time: f32, speed: f32, scale: f32) -> f32 {
  let q = (p - wind_dir * time * speed) / scale;
  let c = 0.65 * value_noise(q, 41u) + 0.35 * value_noise(q * 2.3 + 7.1, 43u);
  return smoothstep(0.45, 0.68, c);
}
