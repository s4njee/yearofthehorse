// The tail's colour stage (The Hero's Journey's stories 3.3 and 3.6): what an effect draws goes through here, into the
// post chain's scene, before bloom and tonemapping.
//
//   bleed         chroma from a blurred copy, lightness from the sharp one: colour spreads past
//                 the edges of its shape while the edges themselves stay sharp, as in a
//                 chroma-subsampled video frame or a wet watercolour. In OKLab.
//   iridescence   a thin-film sheen: hue and chroma from Light Temple's two-beam film over the
//                 scene's own lightness, the film thicker where the scene is lighter.
//   p3            the result converted to Display P3 primaries, for a display-p3 canvas.
//
// Neither colour operation changes OKLab lightness, so neither can add a luminance flash, and the
// sheen is red-capped (colour-caps.wgsl) as all animated colour is.
#include "fullscreen.wgsl"
#include "oklab.wgsl"
#include "colour-caps.wgsl"
#include "gamut.wgsl"
#include "thinfilm.wgsl"
#include "stage-params.wgsl"

@group(0) @binding(0) var scene_tex: texture_2d<f32>;
@group(0) @binding(1) var blur_tex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var<uniform> stage: StageParams;

@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  let texel = textureLoad(scene_tex, vec2i(in.position.xy), 0);
  var c = texel.rgb;
  let p3 = stage.p3 == 1u;

  if (stage.bleed > 0.0) {
    let lc = linear_to_oklab(c);
    let lb = linear_to_oklab(textureSampleLevel(blur_tex, samp, in.uv, 0.0).rgb);
    // The blurred colour's chroma scaled to this pixel's lightness, so a dark pixel beside a
    // bright colour takes its hue, not its brightness.
    let scale = clamp(lc.x / max(lb.x, 1e-3), 0.0, 1.5);
    let ab = mix(lc.yz, lb.yz * scale, stage.bleed);
    c = oklab_to_linear(vec3f(lc.x, ab));
  }

  if (stage.iridescence > 0.0) {
    let lch = linear_to_oklch(c);
    let drift = sin(in.uv.x * 3.1 + stage.time * 0.07) * cos(in.uv.y * 2.3 - stage.time * 0.05);
    let thickness = 280.0 + 520.0 * clamp(lch.x, 0.0, 1.0) + 90.0 * drift;
    let film = linear_to_oklch(thin_film(0.8, thickness, 1.33));
    let sheen = oklch_to_oklab(vec3f(lch.x, film.y * 0.6, film.z));
    let mixed = oklab_to_oklch(mix(oklch_to_oklab(lch), sheen, stage.iridescence));
    // HDR light keeps its brightness: the gamut is the cube up to the brightest channel.
    let peak = max(1.0, max(c.r, max(c.g, c.b)));
    c = oklch_to_linear(safe_colour_in(mixed, p3, peak));
  }

  if (p3) {
    c = srgb_to_p3(c);
  }
  return vec4f(max(c, vec3f(0.0)), texel.a);
}
