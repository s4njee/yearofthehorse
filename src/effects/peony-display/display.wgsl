#include "hash.wgsl"
#include "params.wgsl"

// peony-display: the shells in the air now, one instanced draw of streaks added into the HDR
// scene. Each instance is a shell's rising comet or one of its stars, placed with no state: a
// star's position is read from its class's flight table (story 2.1: a burning star under
// quadratic drag and gravity, tabulated by launch elevation and time), along its own direction.
// Colours come from the compositions' spectra (story 2.2). The scene is in metres, seen from the
// side, from a little above the ground (`ground`, metres, at the bottom of the view).

@group(0) @binding(0) var<uniform> params: Params;
// Uniform buffers, not storage: compatibility mode has no storage buffers in the vertex stage by
// default (story 1.6), and eight shells (640 bytes) and three tables (10 kB) fit.
@group(0) @binding(1) var<uniform> shells: array<vec4f, 40>;
@group(0) @binding(2) var<uniform> tables: array<vec4f, 648>;

struct Varying {
  @builtin(position) position: vec4f,
  @location(0) along: f32,
  @location(1) across: f32,
  @location(2) @interpolate(flat) colour: vec3f,
}

/** Instances per shell: the comet, then up to this many stars less one. */
const STARS: u32 = 161u;
const SAMPLES: u32 = 48u;
const ANGLES: u32 = 9u;
const PI: f32 = 3.14159265;

fn nothing() -> Varying {
  var out: Varying;
  out.position = vec4f(2.0, 2.0, 0.0, 1.0);
  return out;
}

fn table(cls: u32, a: u32, i: u32) -> vec2f {
  // Two samples to a vec4.
  let k = (cls * ANGLES + a) * SAMPLES + i;
  let pair = tables[k / 2u];
  return select(pair.xy, pair.zw, (k & 1u) == 1u);
}

/** A star thrown in unit direction `d` (y up), `t` seconds after the break, in metres. */
fn place(cls: u32, step: f32, d: vec3f, t: f32) -> vec3f {
  let dy = clamp(d.y, -1.0, 1.0);
  let level = sqrt(max(0.0, 1.0 - dy * dy));
  let ua = (asin(dy) + 0.5 * PI) / PI * f32(ANGLES - 1u);
  let a0 = min(u32(ua), ANGLES - 2u);
  let fa = ua - f32(a0);
  let ut = clamp(t / step, 0.0, f32(SAMPLES - 1u));
  let i0 = min(u32(ut), SAMPLES - 2u);
  let ft = ut - f32(i0);
  let lo = mix(table(cls, a0, i0), table(cls, a0, i0 + 1u), ft);
  let hi = mix(table(cls, a0 + 1u, i0), table(cls, a0 + 1u, i0 + 1u), ft);
  // Along and across the star's own launch direction, rebuilt in its vertical plane.
  let frame = mix(lo, hi, fa);
  let out = level * frame.x - dy * frame.y;
  let up = dy * frame.x + level * frame.y;
  let flat = select(vec2f(1.0, 0.0), d.xz / level, level > 1e-4);
  return vec3f(flat.x * out, up, flat.y * out);
}

/** Scene metres (x across from the centre, y above the ground) to clip space. */
fn clip(p: vec2f) -> vec2f {
  let px = vec2f(params.width * 0.5 + p.x * params.scale, params.height - (p.y - params.ground) * params.scale);
  return vec2f(px.x / params.width * 2.0 - 1.0, 1.0 - px.y / params.height * 2.0);
}

@vertex fn star_vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Varying {
  let slot = i / STARS;
  let star = i % STARS;
  if (f32(slot) >= params.shells) {
    return nothing();
  }
  let r0 = shells[slot * 5u];
  let r1 = shells[slot * 5u + 1u];
  let r2 = shells[slot * 5u + 2u];
  let r3 = shells[slot * 5u + 3u];
  let r4 = shells[slot * 5u + 4u];
  let age = r0.x;
  let rise = r0.y;
  let burst = vec2f(r0.z, r0.w);
  let count = u32(r1.w);
  let trail = r3.x;
  let canister = r3.y > 0.5;
  let seed = r3.z;
  let cls = u32(r3.w);
  let burn = r4.y;
  let step = r4.w;

  var head: vec2f;
  var tail: vec2f;
  var light: f32;
  var colour: vec3f;
  // A streak's width in pixels, from its size in the scene: thinner than a pixel, it is drawn a
  // pixel wide with its light kept.
  let ideal = 0.7 * params.scale;
  var width = max(ideal, 1.0);
  let coverage = min(ideal, 1.0);
  if (star == 0u) {
    // The comet: the shell climbing from its mortar, slowing to its break.
    if (age >= rise || age < 0.0) {
      return nothing();
    }
    let ground = vec2f(r4.x, 0.0);
    let u = age / rise;
    let uTail = max(age - 0.15, 0.0) / rise;
    head = mix(ground, burst, 1.0 - (1.0 - u) * (1.0 - u));
    tail = mix(ground, burst, 1.0 - (1.0 - uTail) * (1.0 - uTail));
    light = 0.35 * smoothstep(0.0, 0.3, age);
    colour = vec3f(1.0, 0.55, 0.2);
  } else {
    if (star > count) {
      return nothing();
    }
    let t = age - rise;
    let h = hash_2to3(vec2f(f32(star), seed * 1000.0));
    // Each star burns its own time: its size varies, and a smaller star burns out sooner.
    let own = burn * mix(0.85, 1.15, h.x);
    if (t < 0.0 || t > own) {
      return nothing();
    }
    // Directions spread over a sphere (a Fibonacci spiral, turned per shell). A canister shell's
    // stars leave less evenly and at less even speeds than a warimono's.
    let n = f32(star - 1u) + 0.5;
    let z = 1.0 - 2.0 * n / f32(count);
    let turn = n * 2.39996 + 6.283 * seed;
    let r = sqrt(max(0.0, 1.0 - z * z));
    var d = vec3f(cos(turn) * r, z, sin(turn) * r);
    let scatter = select(0.04, 0.22, canister);
    d = normalize(d + (h - 0.5) * scatter);
    // The pistil is the stars thrown slower from the shell's core, in its own colour.
    let pistil = f32(star - 1u) < r2.w * f32(count);
    let speed = select(1.0, r4.z, pistil) * mix(1.0 - scatter * 0.5, 1.0 + scatter * 0.5, h.y);
    colour = select(r1.rgb, r2.rgb, pistil);
    // A slower star is the same class seen earlier in its flight: placed at the time at which a
    // full-speed star would have gone as far, to first order.
    let p = place(cls, step, d, t * speed);
    let q = place(cls, step, d, max(t - trail - 0.02, 0.0) * speed);
    head = burst + p.xy;
    tail = burst + q.xy;
    // Lit over a fifth of a second, so the break is not a step; fading over its last quarter.
    light = smoothstep(0.0, 0.2, t) * (1.0 - smoothstep(0.75 * own, own, t));
    // Stars on the far side of the burst are a little dimmer: smoke and distance.
    light *= mix(0.75, 1.0, 0.5 + 0.5 * d.z);
  }

  let a = clip(head);
  let b = clip(tail);
  let toPx = vec2f(params.width, params.height) * 0.5;
  let axis = (a - b) * toPx;
  let len = length(axis);
  let dir = select(vec2f(0.0, 1.0), axis / max(len, 1e-4), len > 1e-3);
  let normal = vec2f(-dir.y, dir.x);
  let corner = vec2f(select(-1.0, 1.0, (v & 1u) == 1u), select(-1.0, 1.0, v >= 2u));
  let atPx = mix(b, a, 0.5 + 0.5 * corner.y) * toPx + (dir * corner.y + normal * corner.x) * width * 1.5;
  var out: Varying;
  out.position = vec4f(atPx / toPx, 0.0, 1.0);
  out.along = 0.5 + 0.5 * corner.y;
  out.across = corner.x * 1.5;
  out.colour = colour * light * coverage * params.brightness;
  return out;
}

@fragment fn star_fs(in: Varying) -> @location(0) vec4f {
  let core = exp(-2.0 * in.across * in.across);
  let fall = mix(0.06, 1.0, in.along * in.along);
  return vec4f(in.colour * core * fall, 0.0);
}
