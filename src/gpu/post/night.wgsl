#include "fullscreen.wgsl"

// Night vision (story 5.6): the scene as dark-adapted eyes see it, after Thompson, Shirley and
// Ferwerda, "A Spatial Post-Processing Algorithm for Images of Night Scenes" (2002). TypeScript
// twin: night.ts, which the tests check.
//
// Rods see one colour, and see blue better than red (the Purkinje shift). Each pixel's scotopic
// luminance comes from its CIE XYZ, V = Y (1.33 (1 + (Y + Z) / X) - 1.68), scaled so white keeps its
// level. How much the rods take over depends on the absolute luminance, not the pixel value, so the
// scene's paper white is given in cd/m^2 (`white_cd`): about 0.1 under a full moon, 0.003 by
// starlight. Below 0.01 cd/m^2 vision is all rods; above about 4 it is all cones; between, the two
// mix. Rod vision is also coarse: the scotopic part is drawn from a small neighbourhood, wider as
// the light falls.

struct NightParams {
  white_cd: f32,
  acuity: f32,
  _pad: vec2f,
}

@group(0) @binding(0) var<uniform> night: NightParams;
@group(0) @binding(1) var scene_tex: texture_2d<f32>;

/// The rods' tint: a slightly blue grey, as night scenes are painted and photographed.
const NIGHT_BLUE: vec3f = vec3f(1.05, 0.97, 1.27);
/// V of white, so white keeps its luminance.
const NIGHT_V_WHITE: f32 = 2.5731;

fn night_xyz(c: vec3f) -> vec3f {
  return vec3f(
    dot(c, vec3f(0.4124, 0.3576, 0.1805)),
    dot(c, vec3f(0.2126, 0.7152, 0.0722)),
    dot(c, vec3f(0.0193, 0.1192, 0.9505)),
  );
}

fn night_scotopic(c: vec3f) -> f32 {
  let xyz = night_xyz(max(c, vec3f(0.0)));
  if (xyz.x <= 1e-6) {
    return 0.0;
  }
  return max(xyz.y * (1.33 * (1.0 + (xyz.y + xyz.z) / xyz.x) - 1.68), 0.0) / NIGHT_V_WHITE;
}

/// The cones' share at luminance `y` (scene units): 0 below 0.01 cd/m^2, 1 above about 4.
fn night_photopic(y: f32) -> f32 {
  let t = clamp((log2(max(y * night.white_cd, 1e-8)) / 3.3219281 + 2.0) / 2.6, 0.0, 1.0);
  return t * t;
}

@fragment fn night_vision(in: FullscreenVarying) -> @location(0) vec4f {
  let p = vec2i(in.position.xy);
  let here = textureLoad(scene_tex, p, 0);
  let y = dot(here.rgb, vec3f(0.2126, 0.7152, 0.0722));
  let w = night_photopic(y);
  // Coarse rod vision: the scotopic part averaged over four neighbours as well, further as the light falls.
  let r = i32(round(night.acuity * (1.0 - w)));
  let size = vec2i(textureDimensions(scene_tex)) - 1;
  var v = night_scotopic(here.rgb) * 0.5;
  v += night_scotopic(textureLoad(scene_tex, clamp(p + vec2i(r, r), vec2i(0), size), 0).rgb) * 0.125;
  v += night_scotopic(textureLoad(scene_tex, clamp(p + vec2i(-r, r), vec2i(0), size), 0).rgb) * 0.125;
  v += night_scotopic(textureLoad(scene_tex, clamp(p + vec2i(r, -r), vec2i(0), size), 0).rgb) * 0.125;
  v += night_scotopic(textureLoad(scene_tex, clamp(p + vec2i(-r, -r), vec2i(0), size), 0).rgb) * 0.125;
  return vec4f(w * here.rgb + (1.0 - w) * v * NIGHT_BLUE, here.a);
}

@fragment fn night_copy(in: FullscreenVarying) -> @location(0) vec4f {
  return textureLoad(scene_tex, vec2i(in.position.xy), 0);
}
