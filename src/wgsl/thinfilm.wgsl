// Thin-film interference (The Hero's Journey's story 3.6): the colours of a soap film or an oil slick, from light
// reflected off the film's two faces adding in or out of step.
//
// `thin_film` is Light Temple's two-beam chunk (lighttemple/src/shaders/optics.wgsl), as copied
// into Moon Temple's thinfilm.wgsl: the tint of a film over a reflective base at three fixed
// wavelengths, cheap and good for a sheen. Moon Temple's full Airy sum is not needed here.

const THIN_FILM_PI: f32 = 3.14159265358979;

/// Reflectance tint of a thin film (thickness in nm, index `ior`) over a reflective base, seen at
/// cos(theta) = `cos_v`, at 650, 532 and 450 nm, with the half-wave flip.
fn thin_film(cos_v: f32, thickness: f32, ior: f32) -> vec3f {
  let sin_t2 = (1.0 - cos_v * cos_v) / (ior * ior);
  let cos_t = sqrt(max(1.0 - sin_t2, 0.0));
  let opd = 2.0 * ior * thickness * cos_t;
  let lambda = vec3f(650.0, 532.0, 450.0);
  let phase = 2.0 * THIN_FILM_PI * opd / lambda + THIN_FILM_PI;
  return 0.5 + 0.5 * cos(phase);
}
