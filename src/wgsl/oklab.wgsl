// oklab.wgsl -- OKLab and OKLCH (Ottosson 2020), the space colour operations run in (The Hero's Journey's story 3.1).
// TypeScript twin: src/gpu/colour/oklab.ts; tests/oklab.test.ts checks they agree.
//
//   linear_to_oklab(c) -> vec3f      oklab_to_linear(lab) -> vec3f
//   oklab_to_oklch(lab) -> vec3f     oklch_to_oklab(lch) -> vec3f     lch = (L, C, hue radians)
//   linear_to_oklch(c), oklch_to_linear(lch)
//   gamut_map_oklch(lch, max) -> vec3f   chroma reduced at fixed L and hue until RGB is in 0..max
//   rotate_hue(c, radians), scale_chroma(c, factor)        at fixed OKLCH lightness
//   lightness_for_luminance(y, C, h) -> f32                 the L where (C, h) has luminance y
//   rotate_hue_at_luminance(c, radians)                     keeps relative luminance exactly
//
// Fixed L keeps perceived lightness, not relative luminance: a large area cycling hue should use
// `rotate_hue_at_luminance`, which the flash analyser cannot see as a luminance change.
// Cost: a conversion is two 3x3 products and three cube roots; the gamut map is 16 conversions
// back, the luminance solve 20. Use them per palette entry or at low resolution, not per pixel of
// a full frame where a cheaper path will do.

fn oklab_cbrt(x: f32) -> f32 {
  return sign(x) * pow(abs(x), 1.0 / 3.0);
}

fn linear_to_oklab(c: vec3f) -> vec3f {
  let l = oklab_cbrt(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b);
  let m = oklab_cbrt(0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b);
  let s = oklab_cbrt(0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b);
  return vec3f(
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  );
}

fn oklab_to_linear(lab: vec3f) -> vec3f {
  let l1 = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  let m1 = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  let s1 = lab.x - 0.0894841775 * lab.y - 1.291485548 * lab.z;
  let l = l1 * l1 * l1;
  let m = m1 * m1 * m1;
  let s = s1 * s1 * s1;
  return vec3f(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  );
}

fn oklab_to_oklch(lab: vec3f) -> vec3f {
  return vec3f(lab.x, length(lab.yz), atan2(lab.z, lab.y));
}

fn oklch_to_oklab(lch: vec3f) -> vec3f {
  return vec3f(lch.x, lch.y * cos(lch.z), lch.y * sin(lch.z));
}

fn linear_to_oklch(c: vec3f) -> vec3f {
  return oklab_to_oklch(linear_to_oklab(c));
}

fn oklch_to_linear(lch: vec3f) -> vec3f {
  return oklab_to_linear(oklch_to_oklab(lch));
}

fn oklab_in_gamut(c: vec3f, max_value: f32) -> bool {
  let e = 1e-4;
  return all(c >= vec3f(-e)) && all(c <= vec3f(max_value + e));
}

fn gamut_map_oklch(lch: vec3f, max_value: f32) -> vec3f {
  let top = linear_to_oklab(vec3f(max_value)).x;
  let L = clamp(lch.x, 0.0, top);
  if (oklab_in_gamut(oklch_to_linear(vec3f(L, lch.y, lch.z)), max_value)) {
    return vec3f(L, lch.y, lch.z);
  }
  var lo = 0.0;
  var hi = lch.y;
  for (var i = 0; i < 16; i++) {
    let mid = 0.5 * (lo + hi);
    if (oklab_in_gamut(oklch_to_linear(vec3f(L, mid, lch.z)), max_value)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return vec3f(L, lo, lch.z);
}

fn rotate_hue(c: vec3f, radians: f32) -> vec3f {
  let lch = linear_to_oklch(c);
  return oklch_to_linear(vec3f(lch.x, lch.y, lch.z + radians));
}

fn scale_chroma(c: vec3f, factor: f32) -> vec3f {
  let lch = linear_to_oklch(c);
  return oklch_to_linear(vec3f(lch.x, lch.y * factor, lch.z));
}

fn oklab_luminance(c: vec3f) -> f32 {
  return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}

fn lightness_for_luminance(y: f32, C: f32, h: f32) -> f32 {
  var lo = 0.0;
  var hi = 1.0;
  for (var i = 0; i < 20; i++) {
    let mid = 0.5 * (lo + hi);
    if (oklab_luminance(oklch_to_linear(vec3f(mid, C, h))) < y) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return 0.5 * (lo + hi);
}

fn rotate_hue_at_luminance(c: vec3f, radians: f32) -> vec3f {
  let lch = linear_to_oklch(c);
  let h = lch.z + radians;
  return oklch_to_linear(vec3f(lightness_for_luminance(oklab_luminance(c), lch.y, h), lch.y, h));
}
