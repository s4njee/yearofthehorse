#include "fullscreen.wgsl"

// river-tour's caption: the act's name, drawn as a signed distance in screen px by the text field
// (src/gpu/text/text-field.ts), written over the scene in a warm white, premultiplied.

struct Caption {
  alpha: f32,
  pad0: f32,
  pad1: f32,
  pad2: f32,
}

@group(0) @binding(0) var<uniform> caption: Caption;
@group(0) @binding(1) var field: texture_2d<f32>;

@fragment fn caption_fs(in: FullscreenVarying) -> @location(0) vec4f {
  let d = textureLoad(field, vec2i(in.position.xy), 0).r;
  // A pixel-wide edge, and a faint shadow a few px out so the letters hold over a bright burst.
  let ink = clamp(0.5 - d, 0.0, 1.0) * caption.alpha;
  let shadow = (1.0 - smoothstep(0.0, 6.0, d)) * 0.5 * caption.alpha;
  let cover = max(ink, shadow);
  return vec4f(vec3f(1.0, 0.9, 0.76) * 0.75 * ink, cover);
}
