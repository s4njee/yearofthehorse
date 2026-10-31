#include "fullscreen.wgsl"
#include "hash.wgsl"
#include "noise.wgsl"
#include "fbm.wgsl"

// display (story 3.8): the whole show over a river. Three passes after the stars:
//
// 1. smoke_fs, at a fraction of the view's resolution: the display's smoke (story 2.6) as puffs
//    with no state (src/gpu/smoke/puffs.ts), each given texture by fractal noise in its own frame,
//    and lit from inside by the bursts burning now. It writes the light the smoke scatters towards
//    the viewer (rgb) and its optical depth (a).
// 2. composite_fs: the sky (stars seen through the smoke, plus its glow), a far bank of dark
//    buildings, and the river below reflecting both, rippled and stretched into streaks as water
//    at a grazing angle does.

struct View {
  width: f32,
  height: f32,
  /** Pixels a metre, and metres above the water at the bottom of the view. */
  scale: f32,
  ground: f32,
  puffs: f32,
  lights: f32,
  time: f32,
  /** The far bank's height, metres. */
  bank: f32,
  /** How much of the light above the river reflects. */
  reflectance: f32,
  pad0: f32,
  pad1: f32,
  pad2: f32,
}

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<uniform> puffs: array<vec4f, 64>;
@group(0) @binding(2) var<uniform> lights: array<vec4f, 24>;

/** Scene metres (x across from the centre, y above the water) at a point of the view, uv y down. */
fn metres(uv: vec2f) -> vec2f {
  return vec2f((uv.x - 0.5) * view.width / view.scale, view.ground + (1.0 - uv.y) * view.height / view.scale);
}

@fragment fn smoke_fs(in: FullscreenVarying) -> @location(0) vec4f {
  let p = metres(in.uv);
  var depth = 0.0;
  for (var i = 0u; i < u32(view.puffs); i++) {
    let a = puffs[i * 2u];
    let b = puffs[i * 2u + 1u];
    let q = (p - a.xy) / a.z;
    let r2 = dot(q, q);
    if (r2 > 6.0) {
      continue;
    }
    // Texture in the puff's own frame, turning over slowly as it ages: a pure function of time.
    let n = fbm_3d(vec3f(q * 1.6 + b.x * 37.0, b.y * 0.05), 4, 2.0, 0.5);
    depth += a.w * exp(-1.3 * r2) * clamp(0.55 + 1.3 * n, 0.0, 1.6);
  }
  // Light scattered towards the viewer: each burst lights the smoke around it, falling off with
  // distance past its own size.
  var glow = vec3f(0.0);
  for (var i = 0u; i < u32(view.lights); i++) {
    let a = lights[i * 2u];
    let b = lights[i * 2u + 1u];
    let d = length(p - a.xy) / a.z;
    glow += b.rgb * a.w / (1.0 + d * d * 1.5);
  }
  // A faint city glow from below, so old smoke is not black.
  glow += vec3f(0.012, 0.008, 0.006) * smoothstep(view.bank * 4.0, 0.0, p.y);
  let scattered = glow * (1.0 - exp(-depth)) * 0.18;
  return vec4f(scattered, depth);
}

@group(1) @binding(0) var stars: texture_2d<f32>;
@group(1) @binding(1) var smoke: texture_2d<f32>;
@group(1) @binding(2) var linear: sampler;

/** The far bank's skyline height at metres x: blocks of buildings, metres. */
fn skyline(x: f32) -> f32 {
  let block = floor(x / 9.0);
  let h = hash_2to2(vec2f(block, 7.0));
  return view.bank * (0.35 + 0.65 * h.x * h.x) * select(1.0, 1.9, h.y > 0.93);
}

/** What is seen above the water at uv: the stars through the smoke, its glow, and the far bank. */
fn sky(uv: vec2f) -> vec3f {
  let s = textureSampleLevel(stars, linear, uv, 0.0).rgb;
  let m = textureSampleLevel(smoke, linear, uv, 0.0);
  // About half the smoke is in front of the stars it hides.
  var c = s * exp(-0.6 * m.a) + m.rgb;
  let p = metres(uv);
  let top = skyline(p.x);
  if (p.y < top) {
    // Dark buildings, a few windows lit (rare and dim, so a far bank is not a row of dots), and
    // the bursts' light on their faces.
    let cell = floor(p / vec2f(2.5, 3.0));
    let lit = step(0.975, hash_2to1(cell)) * step(1.5, top - p.y);
    c = vec3f(0.003, 0.003, 0.005) + m.rgb * 0.35 + vec3f(0.03, 0.022, 0.012) * lit;
  }
  return c;
}

@fragment fn composite_fs(in: FullscreenVarying) -> @location(0) vec4f {
  let p = metres(in.uv);
  if (p.y >= 0.0) {
    return vec4f(sky(in.uv), 1.0);
  }
  // The river: a mirror about the water line, rippled, and stretched downwards into streaks, as
  // a rough surface at a grazing angle smears each light along the line to the viewer.
  let below = -p.y * view.scale;
  let water = (view.height - (0.0 - view.ground) * view.scale) / view.height;
  let wobble = (sin(below * 0.31 + view.time * 1.3) + 0.5 * sin(below * 0.83 - view.time * 2.1 + in.uv.x * 40.0))
    * (0.6 + 0.04 * below) / view.width;
  let mirror = vec2f(in.uv.x + wobble, 2.0 * water - in.uv.y);
  let stretch = (2.0 + 0.45 * below) / view.height;
  var c = vec3f(0.0);
  for (var k = 0; k < 5; k++) {
    let uv = vec2f(mirror.x, clamp(mirror.y - f32(k) * stretch, 0.0, water - 0.0005));
    c += sky(uv);
  }
  // Grazing water far off reflects most; nearer, the view looks down into it and it reflects less.
  let fresnel = view.reflectance * mix(1.0, 0.5, smoothstep(water, 1.0, in.uv.y));
  return vec4f(c / 5.0 * fresnel + vec3f(0.002, 0.002, 0.003), 1.0);
}
