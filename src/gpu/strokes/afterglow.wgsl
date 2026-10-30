#include "fullscreen.wgsl"
#include "afterglow-params.wgsl"

@group(0) @binding(0) var previous: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: AfterglowParams;

// The light kept from last frame, less what has faded since, each channel at its own rate. The
// strokes are then blended onto it, so with max blending this is max(now, before * decay) and
// with additive blending a phosphor's afterglow.
@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  return textureLoad(previous, vec2i(in.position.xy), 0) * params.decay;
}
