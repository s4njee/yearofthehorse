// palette.wgsl -- palettes (The Hero's Journey's story 3.2). Needs oklab.wgsl and colour-caps.wgsl.
// TypeScript twin: src/gpu/colour/palette.ts; tests/palette.test.ts checks they agree.
//
//   cosine_palette_raw(t, a, b, c, d) -> vec3f   Quílez: a + b cos(2π (c t + d)), sRGB-encoded
//   cosine_palette(t, a, b, c, d) -> vec3f       the same made safe: linear, in gamut, red-capped
//   palette_at(tex, samp, t) -> vec3f            a baked gradient palette (bakePalette), linear;
//                                                give the sampler repeat addressing to cycle
//
// A gradient palette is baked on the CPU into a 256-texel texture with every texel already safe,
// so reading one costs a texture sample. A cosine palette is computed per pixel, and its safety
// costs a gamut map and a red cap (up to 32 conversions): use it per palette entry, or bake it.

fn cosine_palette_raw(t: f32, a: vec3f, b: vec3f, c: vec3f, d: vec3f) -> vec3f {
  return a + b * cos(6.28318530718 * (c * t + d));
}

fn cosine_palette(t: f32, a: vec3f, b: vec3f, c: vec3f, d: vec3f) -> vec3f {
  let encoded = clamp(cosine_palette_raw(t, a, b, c, d), vec3f(0.0), vec3f(1.0));
  let linear = select(
    pow((encoded + vec3f(0.055)) / 1.055, vec3f(2.4)),
    encoded / 12.92,
    encoded <= vec3f(0.04045),
  );
  return oklch_to_linear(safe_colour(linear_to_oklch(linear), 1.0));
}

fn palette_at(tex: texture_2d<f32>, samp: sampler, t: f32) -> vec3f {
  return textureSampleLevel(tex, samp, vec2f(t, 0.5), 0.0).rgb;
}
