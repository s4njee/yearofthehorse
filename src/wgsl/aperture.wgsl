// aperture.wgsl -- the shape a defocused point takes (stories 2.2 and 2.3).
//
// A point of light out of focus is an image of the lens's aperture, scaled to its circle of
// confusion. This chunk gives that image's light at a pixel, normalised so the point's total
// light never changes: not with its size, not with its shape, not as it moves between pixels.
//
//   aperture_light(offset, radius, aperture) -> f32
//     The share of a point's light falling on the pixel `offset` device pixels from its centre,
//     for a signed circle-of-confusion radius `radius` (px; negative in front of focus, which
//     flips the shape). Summed over every pixel it is 1, give or take the clamp on the profile.
//
// The shape is star-shaped about its centre, described by its radius r(theta) at each angle with
// the circumradius 1: a regular polygon of `blades` sides (0 for a circle), rounded towards the
// circle by `curvature`. Any profile p(rho) in rho = |x| / r(theta) has the same mean over the
// shape as over a disc, so the profiles below are built with mean 1 and the shape is normalised
// by its area alone (`unit_area`, worked out on the CPU, see src/gpu/optics/aperture.ts):
//
//   rim    > 0 gives the bright rim of over-corrected spherical aberration (soap-bubble bokeh),
//          < 0 the soft-edged disc of under-correction:   1 + rim * (3 rho^4 - 1)
//   rings  the onion rings of aspherical elements:          rings * cos(2 pi n rho^2), whole n
//
// `vignette` clips the shape with a second disc offset away from the image centre: mechanical
// vignetting, the cat's eye of a fast lens, which swirls round the frame like a Petzval's. It
// removes light, as it does in a lens.
//
// `obstruction` cuts a hole of that share of the radius out of the middle: the secondary mirror of a
// catadioptric lens, whose bokeh is a ring. The hole is the shape scaled down, so the light left is
// the area times 1 - obstruction^2, and the profile's mean over the ring (`profile_mean`, worked out
// on the CPU) replaces its mean over the whole shape.
//
// With `use_table` the radius at each angle comes from `table`, 64 radii at even angles from +x
// towards +y (src/gpu/optics/shapes.ts): any outline star-shaped about its centre, a heart, a star,
// or a polygon baked rather than computed.
//
// Edges are a one-pixel linear ramp on an approximate distance. Steiner's formula gives that
// ramp's integral for a convex shape exactly: area + pi / 12 px^2. Below a radius of about three
// pixels no shape can be seen, so the light is the exact area of the pixel inside a disc instead,
// which conserves the light of a point however small and wherever it sits.

struct Aperture {
  /** Sides of the polygon; 0 for a circle. */
  blades: f32,
  /** Polygon rotation, radians. */
  rotation: f32,
  /** 0 straight blades, 1 a circle. */
  curvature: f32,
  /** Area of the shape with circumradius 1. */
  unit_area: f32,
  rim: f32,
  rings: f32,
  /** Whole number of onion rings. */
  ring_count: f32,
  /** Cat's-eye strength, 0..1. */
  vignette: f32,
  /** Where the point sits, relative to the image centre, in half-diagonals (0 centre, 1 corner). */
  field: vec2f,
  /** The hole in the middle, as a share of the radius; 0 for none. */
  obstruction: f32,
  /** The profile's mean over what is left of the shape. */
  profile_mean: f32,
  /** 1 to take the radius from `table`. */
  use_table: f32,
  table: array<vec4f, 16>,
}

const APERTURE_PI: f32 = 3.14159265358979;

/// The shape's radius at angle `theta`, circumradius 1.
fn aperture_radius(theta: f32, a: Aperture) -> f32 {
  if (a.use_table > 0.5) {
    // A value array can only be indexed by a constant; a copy in a variable can be indexed by any.
    var table = a.table;
    let f = fract(theta / (2.0 * APERTURE_PI)) * 64.0;
    let i = u32(floor(f)) % 64u;
    let j = (i + 1u) % 64u;
    return mix(table[i / 4u][i % 4u], table[j / 4u][j % 4u], fract(f));
  }
  if (a.blades < 3.0) {
    return 1.0;
  }
  let sector = 2.0 * APERTURE_PI / a.blades;
  let t = theta - a.rotation;
  let local = t - sector * floor(t / sector) - 0.5 * sector;
  let polygon = cos(0.5 * sector) / cos(local);
  return mix(polygon, 1.0, a.curvature);
}

/// The profile across the shape, mean 1 over it.
fn aperture_profile(rho: f32, a: Aperture) -> f32 {
  let r2 = rho * rho;
  let rim = 1.0 + a.rim * (3.0 * r2 * r2 - 1.0);
  let rings = a.rings * cos(2.0 * APERTURE_PI * a.ring_count * r2);
  return max(rim + rings, 0.0);
}

/// Antiderivative of sqrt(r^2 - u^2), constant outside [-r, r].
fn _aperture_chord_int(u: f32, r: f32) -> f32 {
  let x = clamp(u, -r, r);
  return 0.5 * (x * sqrt(max(r * r - x * x, 0.0)) + r * r * asin(clamp(x / r, -1.0, 1.0)));
}

/// Antiderivative over x of clamp(y, -h(x), h(x)), h(x) = sqrt(r^2 - x^2), zero outside the disc.
fn _aperture_band_int(u: f32, y: f32, r: f32) -> f32 {
  let s = sign(y);
  if (abs(y) >= r) {
    return s * _aperture_chord_int(u, r);
  }
  let w = sqrt(r * r - y * y);
  let x = clamp(u, -r, r);
  let left = s * _aperture_chord_int(-w, r);
  if (x <= -w) {
    return s * _aperture_chord_int(x, r);
  }
  if (x <= w) {
    return left + y * (x + w);
  }
  return left + 2.0 * w * y + s * (_aperture_chord_int(x, r) - _aperture_chord_int(w, r));
}

/// Exact area of the pixel [x0, x1] x [y0, y1] inside a disc of radius r at the origin.
fn aperture_disc_area(x0: f32, x1: f32, y0: f32, y1: f32, r: f32) -> f32 {
  let top = _aperture_band_int(x1, y1, r) - _aperture_band_int(x0, y1, r);
  let bottom = _aperture_band_int(x1, y0, r) - _aperture_band_int(x0, y0, r);
  return max(top - bottom, 0.0);
}

/// Smallest radius drawn: a point in focus still covers a pixel's worth of area.
const APERTURE_MIN_RADIUS: f32 = 0.5;

fn aperture_light(offset: vec2f, radius: f32, a: Aperture) -> f32 {
  let r = max(abs(radius), APERTURE_MIN_RADIUS);
  // Where the drawn shape takes over from a plain disc. A drawn outline with notches (a star, a
  // heart) needs more pixels before its one-pixel edge conserves light, and cannot be seen as
  // itself any smaller anyway.
  let lo = select(2.5, 6.0, a.use_table > 0.5);
  let hi = select(4.0, 12.0, a.use_table > 0.5);

  // Small: the exact share of a disc inside this pixel.
  var small = 0.0;
  if (r < hi) {
    small = aperture_disc_area(offset.x - 0.5, offset.x + 0.5, offset.y - 0.5, offset.y + 0.5, r) /
      (APERTURE_PI * r * r);
  }
  // Large: the shape, its profile and the cat's eye, with a one-pixel edge.
  var large = 0.0;
  if (r > lo) {
    // In front of focus the image of the aperture is flipped.
    let p = select(offset, -offset, radius < 0.0) / r;
    let edge = aperture_radius(atan2(p.y, p.x), a);
    let rho = length(p) / edge;
    let inside = clamp(0.5 - (rho - 1.0) * edge * r, 0.0, 1.0);
    let clip = p + a.field * a.vignette * 1.2;
    let cat = clamp(0.5 - (length(clip) - 1.0) * r, 0.0, 1.0);
    // The hole's edge is a ramp too. Steiner's term for the outer edge adds pi / 12; the hole's,
    // with the opposite sense, takes it away again, so a ring's light is its area alone.
    let k = a.obstruction;
    let hole = select(1.0, clamp(0.5 + (rho - k) * edge * r, 0.0, 1.0), k > 0.0);
    let area = a.unit_area * r * r * (1.0 - k * k) + select(APERTURE_PI / 12.0, 0.0, k > 0.0);
    large = min(min(inside, cat), hole) * aperture_profile(min(rho, 1.0), a) / (a.profile_mean * area);
  }
  return mix(small, large, smoothstep(lo, hi, r));
}
