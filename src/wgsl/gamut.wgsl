// gamut.wgsl -- wide gamut (The Hero's Journey's story 3.3). Needs oklab.wgsl, and colour-caps.wgsl for safe_colour_in.
// TypeScript twin: src/gpu/colour/wide-gamut.ts; tests/wide-gamut.test.ts checks they agree.
//
//   srgb_to_p3(c), p3_to_srgb(c)           linear, CSS Color 4 matrices (D65)
//   in_gamut_of(c, p3, max) -> bool        c in linear sRGB primaries, channels may be negative
//   gamut_map_oklch_in(lch, p3, max)       chroma reduced at fixed L and hue until it fits
//   safe_colour_in(lch, p3, max)           gamut-mapped into sRGB or P3, then red-capped
//
// A wide-gamut effect draws linear sRGB-primaries radiance that may go below zero in a channel,
// where the colour is inside P3; the tail converts the scene to P3 primaries before tonemapping.

fn srgb_to_p3(c: vec3f) -> vec3f {
  return vec3f(
    0.8224621 * c.r + 0.177538 * c.g,
    0.0331941 * c.r + 0.9668058 * c.g,
    0.0170827 * c.r + 0.0723974 * c.g + 0.9105199 * c.b,
  );
}

fn p3_to_srgb(c: vec3f) -> vec3f {
  return vec3f(
    1.2249401 * c.r - 0.2249404 * c.g,
    -0.0420569 * c.r + 1.0420571 * c.g,
    -0.0196376 * c.r - 0.0786361 * c.g + 1.0982735 * c.b,
  );
}

fn in_gamut_of(c: vec3f, p3: bool, max_value: f32) -> bool {
  return oklab_in_gamut(select(c, srgb_to_p3(c), p3), max_value);
}

fn gamut_map_oklch_in(lch: vec3f, p3: bool, max_value: f32) -> vec3f {
  let top = linear_to_oklab(vec3f(max_value)).x;
  let L = clamp(lch.x, 0.0, top);
  if (in_gamut_of(oklch_to_linear(vec3f(L, lch.y, lch.z)), p3, max_value)) {
    return vec3f(L, lch.y, lch.z);
  }
  var lo = 0.0;
  var hi = lch.y;
  for (var i = 0; i < 16; i++) {
    let mid = 0.5 * (lo + hi);
    if (in_gamut_of(oklch_to_linear(vec3f(L, mid, lch.z)), p3, max_value)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return vec3f(L, lo, lch.z);
}

fn safe_colour_in(lch: vec3f, p3: bool, max_value: f32) -> vec3f {
  return cap_red(gamut_map_oklch_in(lch, p3, max_value), RED_SAFE_SATURATION);
}
