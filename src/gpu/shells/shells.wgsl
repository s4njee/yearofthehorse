#include "hash.wgsl"

// The shell renderer (M1): every star of every shell in the air, one instanced draw added into
// the HDR scene, with no state. Each instance is a shell's rising comet, one of its stars, or one
// of a star's pieces (a crossette's quarters, crackle's microstars, glitter's sparks), and each is
// drawn as a ribbon along its own past path, recomputed every frame (story 2.5):
//
// - the eye: the light a star gave off over the last tenth of a second or so, fading with the
//   persistence of vision (weight exp(-tau / eye) / eye at tau seconds ago);
// - the camera: an exposure, every moment of the last `shutter` seconds weighted alike;
// - spark tails: the charcoal sparks a star shed along its path, each falling slowly and fading,
//   so a willow's tail droops below the path the star took.
//
// A ribbon carries light per unit length as the star dwelt there: the weight times the seconds
// per pixel of path. A moving star's light is spread along its streak and a slow one's gathers,
// and the whole streak holds the light the star gave off, whatever the frame rate.
//
// Flight comes from 2.1's tables (a burning star under quadratic drag and gravity, by launch
// elevation, launch speed and time) in an rg32float texture, one row per star kind, speed and
// angle, so a pistil, a petal or a crossette's piece flies as its own speed does. The scene is in metres,
// seen from the side (x across, y up, z towards the viewer), from `ground` metres up.

struct ShellView {
  width: f32,
  height: f32,
  /** Pixels a metre. */
  scale: f32,
  /** Metres above the ground at the bottom of the view. */
  ground: f32,
  shells: f32,
  brightness: f32,
  /** Seconds of exposure; 0 for the eye. */
  shutter: f32,
  /** The eye's persistence, seconds. */
  eye: f32,
  /** How fast a shed spark falls, metres a second, and how fast a tail spreads sideways. */
  fall: f32,
  spread: f32,
  /** Points in each shape (3.6). */
  shapePoints: f32,
  pad: f32,
}

@group(0) @binding(0) var<uniform> view: ShellView;
// Uniforms, not storage: compatibility mode has no storage buffers in the vertex stage (1.6).
@group(0) @binding(1) var<uniform> shells: array<vec4f, 120>;
@group(0) @binding(2) var tables: texture_2d<f32>;
@group(0) @binding(3) var shapes: texture_2d<f32>;

struct Varying {
  @builtin(position) position: vec4f,
  @location(0) across: f32,
  @location(1) colour: vec3f,
}

const RECORD: u32 = 10u;
const INSTANCES: u32 = 241u;
const SAMPLES: u32 = 48u;
const ANGLES: u32 = 17u;
/** Launch speeds tabulated (TABLE_SPEEDS in star.ts). */
const SPEEDS: u32 = 10u;
/** Ribbon segments: K + 1 samples along the past path, and a cap at each end. */
const K: u32 = 14u;
const PI: f32 = 3.14159265;
/** Table rows of the kinds a renderer places pieces with (KIND_ORDER in star.ts). */
const KIND_PIECE: u32 = 5u;
const KIND_MICRO: u32 = 6u;
/** The piece kind's launch speed (OTHER_STARS), metres a second. */
const PIECE_SPEED: f32 = 40.0;
/** Their burn times, seconds: radius over burn rate. */
const PIECE_BURN: f32 = 1.3333333;
const MICRO_BURN: f32 = 0.1;

fn nothing() -> Varying {
  var out: Varying;
  out.position = vec4f(2.0, 2.0, 0.0, 1.0);
  return out;
}

fn table(kind: u32, v: u32, a: u32, i: u32) -> vec2f {
  return textureLoad(tables, vec2u(i, (kind * SPEEDS + v) * ANGLES + a), 0).xy;
}

/** One tabulated speed's flight at an elevation and time, interpolated. */
fn flightAt(kind: u32, v: u32, a0: u32, fa: f32, i0: u32, ft: f32) -> vec2f {
  let lo = mix(table(kind, v, a0, i0), table(kind, v, a0, i0 + 1u), ft);
  let hi = mix(table(kind, v, a0 + 1u, i0), table(kind, v, a0 + 1u, i0 + 1u), ft);
  return mix(lo, hi, fa);
}

/**
 * A star of `kind` thrown in unit direction `d` at `share` of its kind's speed, `t` seconds after
 * it left, in metres: interpolated in log speed, elevation and time (star.ts's `placeStar`).
 */
fn place(kind: u32, burn: f32, d: vec3f, t: f32, share: f32) -> vec3f {
  let step = burn / f32(SAMPLES - 1u);
  let dy = clamp(d.y, -1.0, 1.0);
  let level = sqrt(max(0.0, 1.0 - dy * dy));
  let ua = (asin(dy) + 0.5 * PI) / PI * f32(ANGLES - 1u);
  let a0 = min(u32(ua), ANGLES - 2u);
  let fa = ua - f32(a0);
  let ut = clamp(t / step, 0.0, f32(SAMPLES - 1u));
  let i0 = min(u32(ut), SAMPLES - 2u);
  let ft = ut - f32(i0);
  // The tabulated speeds (TABLE_SPEEDS), as logs.
  var logs = array<f32, 10>(-2.302585, -1.897120, -1.514128, -1.139434, -0.798508, -0.510826, -0.223144, 0.000000, 0.198851, 0.405465);
  let u = log(max(share, 0.1));
  var v = 0u;
  for (var k = 1u; k < SPEEDS - 1u; k++) {
    if (u >= logs[k]) {
      v = k;
    }
  }
  let fv = clamp((u - logs[v]) / (logs[v + 1u] - logs[v]), 0.0, 1.0);
  // Along and across the star's own launch direction, rebuilt in its vertical plane.
  let frame = mix(flightAt(kind, v, a0, fa, i0, ft), flightAt(kind, v + 1u, a0, fa, i0, ft), fv);
  let out = level * frame.x - dy * frame.y;
  let up = dy * frame.x + level * frame.y;
  let flat = select(vec2f(1.0, 0.0), d.xz / level, level > 1e-4);
  return vec3f(flat.x * out, up, flat.y * out);
}

/** Two unit vectors spanning the plane with normal `n`. */
fn basis(n: vec3f) -> mat2x3f {
  let helper = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(n.y) > 0.9);
  let u = normalize(cross(n, helper));
  return mat2x3f(u, cross(n, u));
}

/** Everything a star's path needs, read once per vertex. */
struct Star {
  burst: vec3f,
  kind: u32,
  burn: f32,
  /** Its own burn, seconds. */
  own: f32,
  dir: vec3f,
  /** Its speed as a share of its kind's. */
  speed: f32,
  colour: vec3f,
  /** The colour it changes to, and when (seconds after the break; past `own` for none). */
  later: vec3f,
  changeAt: f32,
  /** Light: brighter for the near side of the burst. */
  light: f32,
  sparks: f32,
  sparkColour: vec3f,
  trail: f32,
  special: u32,
  param: f32,
  /** A per-star hash. */
  h: vec3f,
}

fn starOf(slot: u32, index: u32) -> Star {
  let base = slot * RECORD;
  let r0 = shells[base];
  let r1 = shells[base + 1u];
  let r2 = shells[base + 2u];
  let r3 = shells[base + 3u];
  let r4 = shells[base + 4u];
  let r5 = shells[base + 5u];
  let r6 = shells[base + 6u];
  let r7 = shells[base + 7u];
  let r8 = shells[base + 8u];
  let r9 = shells[base + 9u];
  let count = r1.w;
  let pattern = u32(r3.y);
  let seed = r3.z;
  var s: Star;
  s.burst = vec3f(r0.z, r0.w, 0.0);
  s.kind = u32(r3.w);
  s.burn = r4.y;
  s.h = hash_2to3(vec2f(f32(index), seed * 1000.0));
  // Each star burns its own time: its size varies, and a smaller star burns out sooner.
  s.own = s.burn * mix(0.85, 1.15, s.h.x);
  s.trail = r3.x;
  s.sparks = r8.w;
  s.sparkColour = r8.rgb;
  s.special = u32(r7.x);
  s.param = r7.y;
  // Layers, from the core out: the pistil, the second petal, then the outer petal. Each is its
  // own spiral over the sphere, so a layer's stars are spread all round it, not in a cap.
  let pistilEnd = u32(r2.w * count);
  let petalEnd = u32((r2.w + r5.w) * count);
  let share = index < pistilEnd;
  let petal = !share && index < petalEnd;
  let first = select(select(petalEnd, pistilEnd, petal), 0u, share);
  let last = select(select(u32(count), petalEnd, petal), pistilEnd, share);
  let n = f32(index - first) + 0.5;
  let layer = f32(max(last - first, 1u));
  let normal = r9.xyz;
  var d: vec3f;
  var speed = 1.0;
  if (pattern == 2u) {
    // A ring: stars evenly round a circle in a tilted plane, which the eye sees as an ellipse.
    let b = basis(normal);
    let a = 2.0 * PI * n / layer + 6.283 * seed;
    d = cos(a) * b[0] + sin(a) * b[1];
    d = normalize(d + (s.h - 0.5) * 0.03);
  } else if (pattern == 4u) {
    // A flat shape: stars laid out as its points in a plane, each thrown in proportion to its
    // distance from the centre (3.6).
    let points = u32(view.shapePoints);
    let p = textureLoad(shapes, vec2u(index % points, u32(r7.w)), 0).xy;
    let b = basis(normal);
    let r = length(p);
    d = select(normal, normalize(p.x * b[0] + p.y * b[1]), r > 1e-4);
    speed = max(r, 0.05);
  } else {
    // Directions spread over a sphere (a Fibonacci spiral, turned per shell). A canister shell's
    // stars leave less evenly than a warimono's; a palm's few comets leave anyhow.
    let z = 1.0 - 2.0 * n / layer;
    let turn = n * 2.39996 + 6.283 * seed;
    let r = sqrt(max(0.0, 1.0 - z * z));
    d = vec3f(cos(turn) * r, z, sin(turn) * r);
    let scatter = select(select(0.04, 0.22, pattern == 1u), 0.5, pattern == 3u);
    d = normalize(d + (s.h - 0.5) * scatter);
    speed = mix(1.0 - scatter * 0.5, 1.0 + scatter * 0.5, s.h.y);
  }
  s.dir = d;
  s.speed = speed * select(select(1.0, r7.z, petal), r4.z, share);
  s.colour = select(select(r1.rgb, r5.rgb, petal), r2.rgb, share);
  s.later = s.colour;
  s.changeAt = 1e9;
  if (r6.w > 0.0 && !share) {
    s.later = r6.rgb;
    s.changeAt = r6.w * s.own;
  }
  // Stars on the far side of the burst are a little dimmer: smoke and distance.
  s.light = mix(0.75, 1.0, 0.5 + 0.5 * d.z);
  return s;
}

/** Where a star is `t` seconds after the break. */
fn starAt(s: Star, t: f32) -> vec3f {
  return s.burst + place(s.kind, s.burn, s.dir, max(t, 0.0), s.speed);
}

/** A star's own light at `t` seconds after the break, and its colour then. */
fn starLight(s: Star, t: f32, end: f32) -> vec4f {
  if (t < 0.0 || t > end) {
    return vec4f(0.0);
  }
  // Lit over a fifth of a second, so the break is not a step; fading over its last quarter.
  var light = smoothstep(0.0, 0.2, t) * (1.0 - smoothstep(0.75 * s.own, s.own, t)) * s.light;
  if (s.special == 4u) {
    // A strobe: on for a quarter of each cycle, at its own phase. Soft edges of 8 ms.
    let phase = fract(t * s.param + s.h.z);
    light *= smoothstep(0.0, 0.03, phase) * (1.0 - smoothstep(0.22, 0.25, phase)) * 3.0;
  }
  let change = smoothstep(s.changeAt - 0.06, s.changeAt + 0.06, t);
  return vec4f(mix(s.colour, s.later, change), light);
}

/** A sample on an instance's past path: where it was, the light it gave then, and the colour. */
struct Sample {
  at: vec3f,
  /** Light per second of the star itself, and of its spark tail. */
  star: f32,
  sparks: f32,
  colour: vec3f,
}

/** The weight of light given off `tau` seconds ago in what is seen now. */
fn seen(tau: f32) -> f32 {
  if (view.shutter > 0.0) {
    return select(0.0, 1.0 / view.eye, tau <= view.shutter);
  }
  return exp(-tau / view.eye) / view.eye;
}

/** Instance kinds. */
const COMET: u32 = 0u;
const STAR: u32 = 1u;
const PIECE: u32 = 2u;
const MICRO: u32 = 3u;
const SPARK: u32 = 4u;

struct Instance {
  kind: u32,
  slot: u32,
  star: Star,
  /** Which piece of its star (1 and up). */
  piece: u32,
  /** Seconds since the break (the comet: since launch). */
  t: f32,
  /** How far back the ribbon reaches, seconds. */
  reach: f32,
}

/** A crossette's split, crackle's burst and glitter's sheds, in seconds after the break. */
fn splitAt(s: Star) -> f32 {
  if (s.special == 1u) {
    return s.param * s.own * mix(0.95, 1.05, s.h.y);
  }
  return s.own * mix(0.55, 0.92, s.h.z);
}

/** A star's velocity at `t`, metres a second, by a central difference. */
fn velocityAt(s: Star, t: f32) -> vec3f {
  return (starAt(s, t + 0.004) - starAt(s, t - 0.004)) / 0.008;
}

fn sample(inst: Instance, tau: f32) -> Sample {
  var out: Sample;
  let t = inst.t - tau;
  let s = inst.star;
  if (inst.kind == COMET) {
    // The shell climbing from its mortar, slowing to its break.
    let r0 = shells[inst.slot * RECORD];
    let r4 = shells[inst.slot * RECORD + 4u];
    let rise = r0.y;
    let u = clamp(t / rise, 0.0, 1.0);
    let mortar = vec3f(r4.x, 0.0, 0.0);
    out.at = mix(mortar, s.burst, 1.0 - (1.0 - u) * (1.0 - u));
    let alive = t >= 0.0 && t <= rise;
    // A palm's comet trails sparks like its stars; the others a faint glow.
    let tail = r4.w;
    out.star = select(0.0, 0.35 * smoothstep(0.0, 0.3, t), alive);
    out.sparks = select(0.0, select(0.0, 0.6 * pow(1.0 - tau / max(tail, 1e-3), 2.0), tail > 0.3 && tau < tail), t >= 0.0 && t <= rise);
    out.at.y -= view.fall * tau * select(0.0, 1.0, tail > 0.3);
    out.colour = vec3f(1.0, 0.55, 0.2);
    return out;
  }
  if (inst.kind == STAR) {
    let end = select(s.own, splitAt(s), s.special == 1u || s.special == 2u);
    let l = starLight(s, t, end);
    out.at = starAt(s, t);
    out.star = l.w;
    out.colour = l.rgb;
    // Shed sparks fall and spread; the tail is what was shed `tau` ago, seen now.
    out.sparks = select(0.0, s.sparks * l.w * pow(1.0 - tau / max(s.trail, 1e-3), 2.0), tau < s.trail);
    out.at.y -= view.fall * tau * select(0.0, 1.0, s.sparks > 0.0);
    if (s.special == 3u) {
      // A glitter star itself glows dimly; its light is in its sparks.
      out.star *= 0.25;
    }
    return out;
  }
  let split = splitAt(s);
  let k = f32(inst.piece);
  let ph = hash_2to3(vec2f(k, s.h.x * 977.0));
  if (inst.kind == PIECE) {
    // A crossette's quarter: thrown from where the star split, at its velocity then plus a kick
    // across it, in a cross, flown as a piece-kind star at its own speed.
    let v = velocityAt(s, split);
    let b = basis(normalize(v + vec3f(0.0, 0.0, 1e-4)));
    let a = 0.5 * PI * (k - 1.0) + 6.283 * s.h.y;
    let u = v + (cos(a) * b[0] + sin(a) * b[1]) * 30.0;
    let own = 0.9 * PIECE_BURN * mix(0.85, 1.15, ph.x);
    let since = t - split;
    out.at = starAt(s, split) + place(KIND_PIECE, PIECE_BURN, normalize(u), max(since, 0.0), length(u) / PIECE_SPEED);
    let alive = since >= 0.0 && since <= own;
    out.star = select(0.0, s.light * (1.0 - smoothstep(0.7 * own, own, since)) * mix(1.6, 1.0, smoothstep(0.0, 0.05, since)), alive);
    out.colour = s.later;
    out.sparks = 0.0;
    return out;
  }
  if (inst.kind == MICRO) {
    // Crackle: the star bursts, and each microstar flies off briefly, very bright, then is gone.
    let at = split + (ph.x - 0.5) * 0.06;
    let own = mix(0.06, 0.14, ph.y);
    let d = normalize(ph - 0.5 + vec3f(0.0, 0.0, 1e-3));
    let since = t - at;
    out.at = starAt(s, at) + place(KIND_MICRO, MICRO_BURN, d, max(since, 0.0), mix(0.6, 1.2, ph.z));
    out.star = select(0.0, 4.0 * s.light * (1.0 - since / own), since >= 0.0 && since <= own);
    out.colour = vec3f(1.0, 0.92, 0.78);
    out.sparks = 0.0;
    return out;
  }
  // Glitter: a spark shed along the path, falling slowly, flashing once after a delay.
  let shed = s.own * (k - 0.5 + 0.8 * (ph.x - 0.5)) / 8.0;
  let delay = mix(0.18, 0.45, ph.y);
  let since = t - shed;
  out.at = starAt(s, shed) + vec3f(0.0, -view.fall * max(since, 0.0), 0.0);
  let flash = exp(-pow((since - delay) / 0.022, 2.0));
  let glow = 0.04 * (1.0 - smoothstep(0.0, delay, since));
  out.star = select(0.0, s.light * (6.0 * flash + glow), since >= 0.0 && since <= delay + 0.08);
  out.colour = mix(s.sparkColour, vec3f(1.0, 0.95, 0.85), flash);
  out.sparks = 0.0;
  return out;
}

/** Scene metres (x across from the centre, y above the ground) to pixels, y down. */
fn toPixels(p: vec3f) -> vec2f {
  return vec2f(view.width * 0.5 + p.x * view.scale, view.height - (p.y - view.ground) * view.scale);
}

/** Seconds back along the ribbon of sample `k` of `K`, crowded towards the head. */
fn tauOf(k: u32, reach: f32) -> f32 {
  let u = f32(k) / f32(K);
  return reach * u * u;
}

@vertex fn shells_vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Varying {
  let slot = i / INSTANCES;
  let local = i % INSTANCES;
  if (f32(slot) >= view.shells) {
    return nothing();
  }
  let r0 = shells[slot * RECORD];
  let r1 = shells[slot * RECORD + 1u];
  let r3 = shells[slot * RECORD + 3u];
  let r8 = shells[slot * RECORD + 8u];
  let r9 = shells[slot * RECORD + 9u];
  var inst: Instance;
  inst.slot = slot;
  let age = r0.x;
  let rise = r0.y;
  let pieces = u32(r9.w);
  let sparkTail = select(0.0, r3.x, r8.w > 0.0);
  let eyeReach = select(4.0 * view.eye, view.shutter, view.shutter > 0.0);
  if (local == 0u) {
    inst.kind = COMET;
    inst.star = starOf(slot, 0u);
    inst.t = age;
    inst.reach = max(eyeReach, shells[slot * RECORD + 4u].w);
    if (age < 0.0 || age > rise + inst.reach) {
      return nothing();
    }
  } else {
    let index = (local - 1u) / pieces;
    inst.piece = (local - 1u) % pieces;
    if (f32(index) >= r1.w) {
      return nothing();
    }
    inst.star = starOf(slot, index);
    inst.t = age - rise;
    let special = inst.star.special;
    inst.kind = STAR;
    inst.reach = max(eyeReach, sparkTail);
    if (inst.piece > 0u) {
      inst.kind = select(select(SPARK, MICRO, special == 2u), PIECE, special == 1u);
      inst.reach = eyeReach;
    }
    if (inst.t < 0.0 || inst.t > inst.star.own * 1.4 + inst.reach + 0.6) {
      return nothing();
    }
  }

  // The whole past path: every sample's place, and the light it gave off as it is seen now.
  var at: array<vec2f, 15>;
  var energy: array<vec3f, 15>;
  var spreadAt: array<f32, 15>;
  let ideal = 0.7 * view.scale;
  let coverage = min(ideal, 1.0);
  let base = max(ideal, 1.0);
  for (var n = 0u; n <= K; n++) {
    let tau = tauOf(n, inst.reach);
    // Trapezoid weights: the seconds of path each sample stands for.
    let dTau = 0.5 * (tauOf(min(n + 1u, K), inst.reach) - tauOf(max(n, 1u) - 1u, inst.reach));
    let p = sample(inst, tau);
    at[n] = toPixels(p.at);
    // Shed sparks hang where they were shed and are seen as they are, not through persistence.
    energy[n] = (p.star * seen(tau) * p.colour + p.sparks * (0.25 / view.eye) * inst.star.sparkColour) * dTau;
    // Spark tails spread as they age.
    spreadAt[n] = view.spread * view.scale * tau * select(0.0, 1.0, p.sparks > 0.0);
  }

  // This vertex: j = 0 and K + 2 are the caps, j = 1..K + 1 the samples 0..K.
  let j = v / 2u;
  let k = u32(clamp(i32(j) - 1, 0, i32(K)));
  let kPrev = max(k, 1u) - 1u;
  let kNext = min(k + 1u, K);
  let here = at[k];
  let width = base + spreadAt[k];
  // Light per unit length here: every sample within a kernel's reach of this one, so a star that
  // barely moves gathers all its light in one spot and a fast one spreads it along its streak.
  // The kernel is a triangle as wide as the ribbon, or as the gap between samples where that is
  // wider, so sparse samples still join up.
  let gap = length(at[kNext] - at[kPrev]) / f32(max(kNext - kPrev, 1u));
  let h = max(width, gap);
  var density = vec3f(0.0);
  for (var n = 0u; n <= K; n++) {
    density += energy[n] * max(0.0, 1.0 - length(at[n] - here) / h) / h;
  }
  // Per pixel across the ribbon's profile, which integrates to 1.25 of its width.
  var colour = density / (1.25 * width) * coverage * view.brightness;

  var dir = at[kPrev] - at[kNext];
  if (length(dir) < 1e-3) {
    dir = vec2f(0.0, -1.0);
  }
  dir = normalize(dir);
  var corner = here;
  if (j == 0u) {
    corner = here + dir * width * 1.5;
    colour = vec3f(0.0);
  } else if (j == K + 2u) {
    corner = here - dir * width * 1.5;
    colour = vec3f(0.0);
  }
  let normal = vec2f(-dir.y, dir.x);
  let side = select(-1.0, 1.0, (v & 1u) == 1u);
  corner += normal * side * width * 1.5;
  var out: Varying;
  out.position = vec4f(corner.x / view.width * 2.0 - 1.0, 1.0 - corner.y / view.height * 2.0, 0.0, 1.0);
  out.across = side * 1.5;
  out.colour = colour;
  return out;
}

@fragment fn shells_fs(in: Varying) -> @location(0) vec4f {
  return vec4f(in.colour * exp(-2.0 * in.across * in.across), 0.0);
}
