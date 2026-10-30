// colour-caps.wgsl -- caps on colour change (The Hero's Journey's story 2.3). Needs oklab.wgsl.
// TypeScript twin: src/gpu/safety/colour-caps.ts; tests/colour-caps.test.ts checks they agree.
//
//   red_share(c) -> f32            R / (R + G + B) of a linear colour, negatives as zero
//   cap_red(lch, limit) -> vec3f    chroma reduced at fixed L and hue until red_share <= limit
//   safe_colour(lch, max) -> vec3f  gamut-mapped, then red-capped at RED_SAFE_SATURATION
//
// A colour through cap_red can never take part in a WCAG red flash (which needs a red share of
// 0.8), however fast its hue turns. Under HUE_FLASH_CHROMA a hue turn at fixed OKLCH lightness
// moves luminance by under half of WCAG's step (a tenth of full white). Cost: up to 16
// conversions back, like the gamut map.

const RED_SAFE_SATURATION: f32 = 0.75;
const HUE_FLASH_CHROMA: f32 = 0.08;

fn red_share(c: vec3f) -> f32 {
  let p = max(c, vec3f(0.0));
  let sum = p.r + p.g + p.b;
  return select(1.0 / 3.0, p.r / sum, sum > 1e-6);
}

fn cap_red(lch: vec3f, limit: f32) -> vec3f {
  if (red_share(oklch_to_linear(lch)) <= limit) { return lch; }
  var lo = 0.0;
  var hi = lch.y;
  for (var i = 0; i < 16; i++) {
    let mid = 0.5 * (lo + hi);
    if (red_share(oklch_to_linear(vec3f(lch.x, mid, lch.z))) <= limit) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return vec3f(lch.x, lo, lch.z);
}

fn safe_colour(lch: vec3f, max_value: f32) -> vec3f {
  return cap_red(gamut_map_oklch(lch, max_value), RED_SAFE_SATURATION);
}
