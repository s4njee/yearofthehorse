#include "hash.wgsl"
#include "params.wgsl"

// Hello: shells rising and breaking into stars, one instanced draw of short streaks into the HDR
// scene, added. Every star is a pure function of its index and the time, so there is no state and
// a held frame is exactly reproducible. A star leaves the break at the shell's speed in its own
// direction and is slowed by the air and pulled down by gravity: with drag proportional to speed
// its path has a closed form, so it needs no integration. Its colour is the emission of the metal
// salt it carries, and it burns out in its own time, so a burst does not go dark all at once.

@group(0) @binding(0) var<uniform> params: Params;

struct Varying {
  @builtin(position) position: vec4f,
  @location(0) along: f32,
  @location(1) across: f32,
  @location(2) @interpolate(flat) colour: vec3f,
}

/** Instances per shell: the rising comet, then its stars. */
const STARS: u32 = 121u;
/** Seconds from launch to the break. */
const RISE: f32 = 1.1;
/** A star's mean burn, seconds. */
const BURN: f32 = 2.2;

// Linear emission colours of the star compositions, by the metal that colours them: strontium's
// red, barium's green, copper's blue, sodium's yellow, strontium and copper's violet, and the
// orange-gold of burning charcoal and iron (a blackbody near 1 900 K), which is not a line at all.
const SALTS = array<vec3f, 6>(
  vec3f(1.0, 0.09, 0.05),
  vec3f(0.28, 1.0, 0.16),
  vec3f(0.16, 0.34, 1.0),
  vec3f(1.0, 0.66, 0.16),
  vec3f(0.62, 0.16, 0.92),
  vec3f(1.0, 0.42, 0.09),
);

/** Position after `t` seconds from `p0` at `v0`, under gravity `g` (pixels, y down) and drag `k`. */
fn ballistic(p0: vec2f, v0: vec2f, g: f32, k: f32, t: f32) -> vec2f {
  // a = g - k v, so v tends to the terminal g / k and p = p0 + vt t + (v0 - vt)(1 - e^-kt) / k.
  let terminal = vec2f(0.0, g / k);
  return p0 + terminal * t + (v0 - terminal) * (1.0 - exp(-k * t)) / k;
}

/** A point off-screen, for an instance with nothing to draw. */
fn nothing() -> Varying {
  var out: Varying;
  out.position = vec4f(2.0, 2.0, 0.0, 1.0);
  return out;
}

@vertex fn star_vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Varying {
  let slot = i / STARS;
  let star = i % STARS;
  if (f32(slot) >= params.shells) {
    return nothing();
  }
  // Each slot launches once a period, the slots spread evenly through it with a little jitter,
  // so breaks are spaced and never land together.
  let period = params.period;
  let offset = (f32(slot) + 0.25 * hash_1to1(f32(slot) * 3.1)) * period / params.shells;
  var cycle = floor((params.time - offset) / period);
  var local = params.time - offset - cycle * period;
  if (params.held > 0.5) {
    // The held frame: each shell open at its own age, none at its break.
    cycle = 0.0;
    local = RISE + 0.7 + 0.55 * f32(slot);
  }
  let shell = hash_2to3(vec2f(f32(slot), cycle));
  let more = hash_2to3(vec2f(f32(slot) + 17.0, cycle));
  let size = params.size * mix(0.7, 1.15, shell.z);
  let burst = vec2f(
    mix(0.12, 0.88, shell.x) * params.width,
    mix(0.2, 0.42, shell.y) * params.height,
  );
  // Peony: coloured stars that burn short and clean. Chrysanthemum (one shell in three): charcoal
  // stars that leave long gold tails and droop more as they slow.
  let chrysanthemum = more.x < 0.33;
  let colour = select(SALTS[u32(more.y * 5.0) % 5u], SALTS[5], chrysanthemum);
  // Stars fall at the speed where the air's drag holds their weight: gravity / drag, about a
  // sixth of the burst's radius a second, as real stars of a few grams do. Faster reads as
  // the whole sky sliding down (the motion check's drift).
  let drag = select(3.0, 3.6, chrysanthemum);
  let gravity = select(0.15, 0.22, chrysanthemum) * size * drag;
  let trail = select(0.12, 0.75, chrysanthemum);

  var head: vec2f;
  var tail: vec2f;
  var light: f32;
  // A star's apparent size is part of the scene, so it scales with the burst. Thinner than a
  // pixel, it is drawn a pixel wide with its light kept: a small canvas does not get fat stripes.
  let ideal = size * 0.006;
  var width = max(ideal, 1.0);
  var coverage = min(ideal, 1.0);
  if (star == 0u) {
    // The comet: the shell rising from below the view, slowing to its break.
    if (local >= RISE) {
      return nothing();
    }
    let ground = vec2f(burst.x + (more.z - 0.5) * 0.1 * params.width, params.height + 20.0);
    let u = local / RISE;
    let uTail = max(local - 0.12, 0.0) / RISE;
    head = mix(ground, burst, 1.0 - (1.0 - u) * (1.0 - u));
    tail = mix(ground, burst, 1.0 - (1.0 - uTail) * (1.0 - uTail));
    light = 0.5 * smoothstep(0.0, 0.2, local);
    width = max(ideal * 0.75, 1.0);
    coverage = min(ideal * 0.75, 1.0);
  } else {
    let age = local - RISE;
    // Each star burns its own time, so the burst thins out rather than switching off.
    let h = hash_2to3(vec2f(f32(i), cycle));
    let burn = BURN * mix(0.75, 1.25, h.x) * select(1.0, 1.4, chrysanthemum);
    if (age < 0.0 || age > burn) {
      return nothing();
    }
    // Directions spread over a sphere (a Fibonacci spiral, turned per shell) and seen from the
    // side: a shell's stars leave in three dimensions, so the burst is a filled disc with its
    // edge brightest, not a ring.
    let n = f32(star - 1u) + 0.5;
    let z = 1.0 - 2.0 * n / f32(STARS - 1u);
    let turn = n * 2.39996 + 6.283 * shell.z;
    let r = sqrt(max(0.0, 1.0 - z * z));
    let speed = size * drag * mix(0.92, 1.08, h.y);
    let v0 = vec2f(cos(turn), sin(turn)) * r * speed;
    head = ballistic(burst, v0, gravity, drag, age);
    tail = ballistic(burst, v0, gravity, drag, max(age - trail, 0.0));
    // Lit over a quarter of a second, so the break is not a step; fading over its last third.
    light = smoothstep(0.0, 0.25, age) * (1.0 - smoothstep(0.65 * burn, burn, age));
  }

  // A capsule around the streak from tail to head.
  let axis = head - tail;
  let len = length(axis);
  let dir = select(vec2f(0.0, 1.0), axis / max(len, 1e-4), len > 1e-3);
  let normal = vec2f(-dir.y, dir.x);
  let corner = vec2f(select(-1.0, 1.0, (v & 1u) == 1u), select(-1.0, 1.0, v >= 2u));
  // Along: 0 at the tail, 1 at the head, measured in widths past each end.
  let at = mix(tail, head, 0.5 + 0.5 * corner.y) + dir * corner.y * width * 1.5 + normal * corner.x * width * 1.5;
  var out: Varying;
  out.position = vec4f(at.x / params.width * 2.0 - 1.0, 1.0 - at.y / params.height * 2.0, 0.0, 1.0);
  out.along = 0.5 + 0.5 * corner.y;
  out.across = corner.x * 1.5;
  // The head's brightness is the star's: a longer tail adds a dimmer trace behind it, as a long
  // exposure would, without brightening the star.
  out.colour = colour * light * coverage * params.brightness * 2.2;
  return out;
}

@fragment fn star_fs(in: Varying) -> @location(0) vec4f {
  // Brightest at the head, fading to the tail; a soft round profile across.
  let core = exp(-2.0 * in.across * in.across);
  let fall = mix(0.08, 1.0, in.along * in.along);
  return vec4f(in.colour * core * fall, 0.0);
}
