import { describe, expect, it, vi } from 'vitest';
import * as smokeEval from './wgsl-eval.ts';

// smoke.wgsl (Fire Temple's story 3.10, ported in Year of the Horse's 1.8), proven with numbers computed
// on the GPU (tests/wgsl-eval.ts). Fire Temple's firelight half of this file is not ported.

vi.setConfig({ testTimeout: 30_000 });

// --- smoke.wgsl ----------------------------------------------------------------------------------

describe('smoke.wgsl', () => {
  // Everything this block needs is local to it, so the two halves of the file stay independent.
  const INCLUDE = '#include "smoke.wgsl"';
  const { gpuF32, rowsOf, lane, scalars } = smokeEval;
  const at = (values: ArrayLike<number>, index: number): number => values[index] ?? Number.NaN;
  const range = (count: number, lo: number, hi: number): number[] =>
    Array.from({ length: count }, (_, i) => lo + ((hi - lo) * i) / (count - 1));
  /** Largest relative difference between two same-length lists. */
  const worstRelative = (actual: readonly number[], expected: readonly number[]): number =>
    actual.reduce(
      (worst, v, i) => Math.max(worst, Math.abs(v - at(expected, i)) / Math.abs(at(expected, i))),
      0,
    );
  /** The largest rise between neighbours of a list that should only fall. */
  const worstRise = (values: readonly number[]): number =>
    values.reduce((worst, v, i) => (i === 0 ? 0 : Math.max(worst, v - at(values, i - 1))), 0);
  /** True when every value is below the one before it. */
  const strictlyFalls = (values: readonly number[]): boolean =>
    values.every((v, i) => i === 0 || v < at(values, i - 1));

  // The albedo and extinction tint at the two ends of the soot scale, as the header states them.
  const PALE = [0.86, 0.88, 0.91];
  const SOOT = [0.17, 0.14, 0.11];

  it('Beer-Lambert transmittance matches exp(-tau) and composes multiplicatively', async () => {
    const a = range(64, 0, 9);
    const b = range(64, 7.5, 0.05);
    const out = await gpuF32(
      `${INCLUDE}
       fn f(x: vec4f) -> vec4f {
         let rgb = smoke_transmittance_rgb(vec3f(x.x, x.y, x.x + x.y));
         return vec4f(
           smoke_transmittance(x.x),
           smoke_transmittance(x.x + x.y) - smoke_transmittance(x.x) * smoke_transmittance(x.y),
           smoke_transmittance(x.x + x.y),
           max(abs(rgb.x - smoke_transmittance(x.x)), abs(rgb.z - smoke_transmittance(x.x + x.y))),
         );
       }`,
      rowsOf(a.map((value, i) => [value, at(b, i)])),
    );
    const single = lane(out, 0).slice(0, a.length);
    expect(
      worstRelative(
        single,
        a.map((tau) => Math.exp(-tau)),
      ),
    ).toBeLessThan(1e-5);
    const both = lane(out, 2).slice(0, a.length);
    expect(
      worstRelative(
        both,
        a.map((tau, i) => Math.exp(-tau - at(b, i))),
      ),
    ).toBeLessThan(1e-5);
    // T(a + b) = T(a) T(b), and the per-channel form is the scalar one three times.
    for (let i = 0; i < a.length; i++) {
      expect(Math.abs(at(out, i * 4 + 1))).toBeLessThan(1e-6);
      expect(at(out, i * 4 + 3)).toBeLessThan(1e-6);
    }

    const [none, negative, slab, clamped, clear, opaque, tinted] = await scalars(INCLUDE, [
      'smoke_transmittance(0.0)',
      'smoke_transmittance(-3.0)',
      'smoke_optical_depth(0.5, 8.0, 0.25)',
      'smoke_optical_depth(-0.5, 8.0, 0.25)',
      'smoke_coverage(vec3f(1.0))',
      'smoke_coverage(vec3f(0.0))',
      // Luminance-weighted: green counts for most of it.
      'smoke_coverage(vec3f(1.0, 0.0, 1.0))',
    ]);
    expect([none, negative, clamped, opaque]).toEqual([1, 1, 0, 1]);
    expect(slab).toBeCloseTo(1, 6);
    expect(clear).toBeCloseTo(0, 6);
    expect(tinted).toBeCloseTo(0.7152, 4);
  });

  it('shadow terms stay in 0..1 and fall monotonically with optical depth', async () => {
    const taus = range(400, 0, 24);
    const out = await gpuF32(
      `${INCLUDE}
       fn f(x: vec4f) -> vec4f {
         return vec4f(
           smoke_shadow_from_depth(x.x),
           smoke_shadow_multi(vec3f(x.x), smoke_albedo(0.0)).y,
           smoke_shadow_multi(vec3f(x.x), smoke_albedo(0.2)).y,
           smoke_shadow_multi(vec3f(x.x), smoke_albedo(1.0)).y,
         );
       }`,
      rowsOf(taus.map((tau) => [tau])),
    );
    const beer = lane(out, 0).slice(0, taus.length);
    for (let m = 0; m < 4; m++) {
      const values = lane(out, m).slice(0, taus.length);
      expect(values[0]).toBe(1);
      expect(values.every((v) => v >= 0 && v <= 1)).toBe(true);
      expect(worstRise(values)).toBeLessThanOrEqual(0);
      // Never darker than plain Beer-Lambert.
      expect(values.every((v, i) => v >= at(beer, i))).toBe(true);
    }
    expect(
      worstRelative(
        beer.slice(0, 200),
        taus.slice(0, 200).map((tau) => Math.exp(-tau)),
      ),
    ).toBeLessThan(1e-5);
    // Black smoke (albedo below 2/3) gets no softening at all; pale smoke stays lit far deeper.
    expect(lane(out, 3).slice(0, taus.length)).toEqual(beer);
    expect(at(lane(out, 2), 50)).toBeGreaterThan(at(beer, 50));
    const pale = lane(out, 1);
    expect(at(pale, 50) / at(beer, 50)).toBeGreaterThan(2.5);
    // The closed form: mix(exp(-tau), exp(-rate tau), a), rate = sqrt(3 (1 - a)), for a = 0.88.
    const rate = Math.sqrt(3 * (1 - at(PALE, 1)));
    const expected = taus.map(
      (tau) => (1 - at(PALE, 1)) * Math.exp(-tau) + at(PALE, 1) * Math.exp(-rate * tau),
    );
    expect(worstRelative(pale.slice(0, 200), expected.slice(0, 200))).toBeLessThan(1e-4);
  });

  it('the marched shadow is exact for a uniform slab and converges for a varying one', async () => {
    // x: tap count. Density 1.7 everywhere (lane 0), and 3 t^2 along the ray (lane 1), whose
    // optical depth over [0, reach] is extinction * reach^3. Lane 2 adds up the tap lengths.
    const counts = [1, 2, 4, 8, 16, 32];
    const out = await gpuF32(
      `${INCLUDE}
       fn f(x: vec4f) -> vec4f {
         let count = i32(x.x);
         let reach = 1.3;
         let extinction = 2.5;
         var uniform_tau = 0.0;
         var varying_tau = 0.0;
         var covered = 0.0;
         var ordered = 1.0;
         var last = 0.0;
         for (var i = 0; i < count; i++) {
           let tap = smoke_shadow_tap(i, count, reach);
           uniform_tau = smoke_shadow_step(uniform_tau, 1.7, extinction, tap.y);
           varying_tau = smoke_shadow_step(varying_tau, 3.0 * tap.x * tap.x, extinction, tap.y);
           covered += tap.y;
           ordered = min(ordered, f32(tap.x > last && tap.y > 0.0));
           last = tap.x;
         }
         return vec4f(uniform_tau, varying_tau, covered, ordered);
       }`,
      rowsOf(counts.map((count) => [count])),
    );
    const exact = 2.5 * 1.3 ** 3;
    const errors = counts.map((_, i) => Math.abs(at(out, i * 4 + 1) - exact) / exact);
    counts.forEach((_, i) => {
      expect(at(out, i * 4)).toBeCloseTo(1.7 * 2.5 * 1.3, 4);
      expect(at(out, i * 4 + 2)).toBeCloseTo(1.3, 5);
      expect(at(out, i * 4 + 3)).toBe(1);
      if (i > 0) expect(at(errors, i)).toBeLessThan(at(errors, i - 1));
    });
    // Four taps are within a few percent, 32 within a tenth of one.
    expect(at(errors, 2)).toBeLessThan(0.06);
    expect(at(errors, 5)).toBeLessThan(1e-3);

    const [shadow, closed] = await scalars(INCLUDE, [
      'smoke_shadow_from_depth(smoke_shadow_step(smoke_shadow_step(0.0, 0.5, 4.0, 0.25), 0.5, 4.0, 0.75))',
      'exp(-2.0)',
    ]);
    expect(shadow).toBeCloseTo(closed ?? Number.NaN, 6);
  });

  it('the gradient shadow is exact for a linear density and reads the slope the right way', async () => {
    // Density rho0 + slope * t along the ray toward the light, kept >= 0 over the reach.
    let seed = 7;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const cases = Array.from({ length: 200 }, () => {
      const reach = 0.2 + random() * 1.5;
      const rho0 = random() * 1.5;
      const slope = -rho0 / reach + random() * 2.5;
      const tap = reach * (0.1 + random() * 0.9);
      return [rho0, rho0 + slope * tap, tap, reach];
    });
    const out = await gpuF32(
      `${INCLUDE}
       fn f(x: vec4f) -> vec4f {
         let tau = smoke_gradient_depth(x.x, x.y, x.z, 3.0, x.w);
         return vec4f(
           tau,
           smoke_shadow_gradient(x.x, x.y, x.z, 3.0, x.w),
           // A uniform medium is a slab of thickness reach.
           smoke_gradient_depth(x.x, x.x, x.z, 3.0, x.w),
           // With the tap halfway it is the midpoint rule (the line stays above zero when 2 b >= a).
           smoke_gradient_depth(x.x, x.x * 0.5 + x.y, 0.5 * x.w, 3.0, x.w),
         );
       }`,
      rowsOf(cases),
    );
    cases.forEach(([rho0 = 0, rho1 = 0, tap = 1, reach = 0], i) => {
      const slope = (rho1 - rho0) / tap;
      const exact = 3 * (rho0 * reach + 0.5 * slope * reach * reach);
      expect(Math.abs(at(out, i * 4) - exact)).toBeLessThan(2e-4 * (1 + exact));
      expect(at(out, i * 4 + 1)).toBeCloseTo(Math.exp(-exact), 4);
      expect(at(out, i * 4 + 1)).toBeGreaterThan(0);
      expect(at(out, i * 4 + 1)).toBeLessThanOrEqual(1);
      expect(at(out, i * 4 + 2)).toBeCloseTo(3 * rho0 * reach, 4);
      expect(at(out, i * 4 + 3)).toBeCloseTo(3 * (rho0 * 0.5 + rho1) * reach, 3);
    });

    // More smoke toward the light always means a darker shadow.
    const toward = range(128, 0, 2);
    const sweep = await gpuF32(
      `${INCLUDE}
       fn f(x: vec4f) -> vec4f {
         return vec4f(smoke_shadow_gradient(0.6, x.x, 0.2, 5.0, 0.5), 0.0, 0.0, 0.0);
       }`,
      rowsOf(toward.map((rho) => [rho])),
    );
    const shadows = lane(sweep, 0).slice(0, toward.length);
    expect(strictlyFalls(shadows)).toBe(true);
    expect(shadows.every((v) => v > 0 && v < 1)).toBe(true);

    const [edge, edgeLong, empty, uniform, thinning] = await scalars(INCLUDE, [
      // Density falling to nothing at the tap: only the wedge up to the tap counts (0.5 * rho * d),
      // however far the reach extends past it.
      'smoke_gradient_depth(0.8, 0.0, 0.25, 4.0, 0.5)',
      'smoke_gradient_depth(0.8, 0.0, 0.25, 4.0, 5.0)',
      // Leaving the smoke with none ahead: fully lit.
      'smoke_shadow_gradient(0.0, 0.0, 0.25, 4.0, 1.0)',
      'smoke_shadow_gradient(0.8, 0.8, 0.25, 4.0, 0.5)',
      'smoke_shadow_gradient(0.8, 0.4, 0.25, 4.0, 0.5)',
    ]);
    expect(edge).toBeCloseTo(0.5 * 0.8 * 0.25 * 4, 5);
    expect(edgeLong).toBeCloseTo(edge ?? Number.NaN, 6);
    expect(empty).toBe(1);
    expect(uniform).toBeCloseTo(Math.exp(-0.8 * 4 * 0.5), 5);
    expect(thinning ?? 0).toBeGreaterThan(uniform ?? 1);
  });

  it('albedo falls from pale to black with soot and splits extinction exactly', async () => {
    const soots = range(65, 0, 1);
    const out = await gpuF32(
      `${INCLUDE}
       fn f(x: vec4f) -> vec4f {
         let albedo = smoke_albedo(x.x);
         let sigma_t = smoke_extinction(0.7, 9.0, x.x);
         let split = smoke_scattering(sigma_t, albedo) + smoke_absorption(sigma_t, albedo) - sigma_t;
         return vec4f(albedo, max(abs(split.x), max(abs(split.y), abs(split.z))));
       }`,
      rowsOf(soots.map((soot) => [soot])),
    );
    for (let channel = 0; channel < 3; channel++) {
      const values = lane(out, channel).slice(0, soots.length);
      expect(values[0]).toBeCloseTo(at(PALE, channel), 5);
      expect(values.at(-1)).toBeCloseTo(at(SOOT, channel), 5);
      expect(values.every((v) => v > 0 && v < 1)).toBe(true);
      expect(strictlyFalls(values)).toBe(true);
    }
    // sigma_s + sigma_a = sigma_t to rounding (sigma_t is about 6 here).
    expect(Math.max(...lane(out, 3).slice(0, soots.length))).toBeLessThan(1e-6);

    const values = await scalars(INCLUDE, [
      'smoke_albedo(-2.0).x',
      'smoke_albedo(5.0).x',
      // Pale smoke scatters blue a little more; soot absorbs blue most.
      'smoke_albedo(0.0).z - smoke_albedo(0.0).x',
      'smoke_albedo(1.0).x - smoke_albedo(1.0).z',
      // The tint leaves green alone and extinguishes blue more than red.
      'smoke_extinction(0.7, 9.0, 0.3).y',
      'smoke_extinction_tint(0.0).z - smoke_extinction_tint(0.0).x',
      'smoke_extinction_tint(1.0).z - smoke_extinction_tint(1.0).x',
      'smoke_extinction(0.7, 9.0, 0.0).x',
      'smoke_scattering(vec3f(4.0), vec3f(0.25)).x',
      'smoke_absorption(vec3f(4.0), vec3f(0.25)).x',
      // Multiple scattering: a / (1 - 0.7 a), the series a + 0.7 a^2 + 0.49 a^3 + ...
      'smoke_multi_albedo(vec3f(0.5)).x',
      'smoke_multi_albedo(smoke_albedo(0.0)).y / smoke_albedo(0.0).y',
      'smoke_multi_albedo(smoke_albedo(1.0)).y / smoke_albedo(1.0).y',
    ]);
    expect(values[0]).toBeCloseTo(at(PALE, 0), 6);
    expect(values[1]).toBeCloseTo(at(SOOT, 0), 6);
    expect(at(values, 2)).toBeGreaterThan(0);
    expect(at(values, 3)).toBeGreaterThan(0);
    expect(values[4]).toBeCloseTo(6.3, 5);
    expect(at(values, 5)).toBeGreaterThan(at(values, 6));
    expect(at(values, 6)).toBeGreaterThan(0);
    expect(values[7]).toBeCloseTo(6.3 * 0.9, 5);
    expect(values[8]).toBeCloseTo(1, 6);
    expect(values[9]).toBeCloseTo(3, 6);
    expect(values[10]).toBeCloseTo(0.5 / 0.65, 5);
    expect(values[11]).toBeCloseTo(1 / (1 - 0.7 * 0.88), 4);
    expect(values[12]).toBeCloseTo(1 / (1 - 0.7 * 0.14), 4);
  });

  it('the fire falloff is finite at the source, decreasing, and inverse-square far away', async () => {
    const radius = 0.3;
    // Geometric spacing from far inside the source to more than 10000 radii out.
    const dists = Array.from({ length: 240 }, (_, i) => 1e-3 * 1.065 ** i);
    const out = await gpuF32(
      `${INCLUDE}
       fn f(x: vec4f) -> vec4f {
         let light = smoke_fire_light(vec3f(20.0, 8.0, 2.0), x.x, ${radius}, vec3f(0.5, 0.25, 1.0));
         return vec4f(smoke_fire_falloff(x.x, ${radius}), light);
       }`,
      rowsOf(dists.map((d) => [d])),
    );
    const falloff = lane(out, 0).slice(0, dists.length);
    // The fraction of the sphere a disc fills, in double precision. Agreeing with it to 1e-4 that
    // far out shows the shader form does not cancel.
    const exact = dists.map((d) => {
      const h = Math.hypot(d, radius);
      return (0.5 * radius * radius) / (h * (h + d));
    });
    expect(worstRelative(falloff, exact)).toBeLessThan(1e-4);
    expect(strictlyFalls(falloff)).toBe(true);
    expect(falloff.every((v) => v > 0 && v <= 0.5)).toBe(true);
    // Far field: r^2 / (4 d^2).
    const last = dists.length - 1;
    expect((at(falloff, last) * at(dists, last) ** 2) / (radius * radius * 0.25)).toBeCloseTo(1, 3);
    // The light is fire * falloff * occlusion, channel by channel.
    for (const i of [0, 60, 120, 200]) {
      expect(at(out, i * 4 + 1)).toBeCloseTo(20 * 0.5 * at(falloff, i), 4);
      expect(at(out, i * 4 + 2)).toBeCloseTo(8 * 0.25 * at(falloff, i), 4);
      expect(at(out, i * 4 + 3)).toBeCloseTo(2 * at(falloff, i), 4);
    }

    const [atSource, doubled, tiny, sky, cover, coverClosed] = await scalars(INCLUDE, [
      `smoke_fire_falloff(0.0, ${radius})`,
      'smoke_fire_falloff(40.0, 0.1) / smoke_fire_falloff(20.0, 0.1)',
      'smoke_fire_falloff(0.0, 0.0)',
      'smoke_sky_light(vec3f(0.2, 0.4, 0.8), vec3f(1.0, 0.5, 0.25)).z',
      'smoke_sky_occlusion(0.5, 8.0, 0.75, smoke_albedo(0.2)).y',
      'smoke_shadow_multi(vec3f(3.0), smoke_albedo(0.2)).y',
    ]);
    expect(atSource).toBeCloseTo(0.5, 6);
    expect(doubled).toBeCloseTo(0.25, 4);
    expect(tiny).toBeCloseTo(0.5, 5);
    // Half the sphere of directions is sky.
    expect(sky).toBeCloseTo(0.1, 6);
    expect(cover).toBeCloseTo(coverClosed ?? Number.NaN, 6);
  });

  it('the phase functions integrate to 1 over the sphere', async () => {
    // Midpoint rule over cos_theta, summed in double precision.
    const count = 4096;
    const mus = Array.from({ length: count }, (_, i) => -1 + (2 * (i + 0.5)) / count);
    const out = await gpuF32(
      `${INCLUDE}
       fn f(x: vec4f) -> vec4f {
         return vec4f(
           smoke_phase(x.x, 0.4),
           smoke_phase(x.x, 0.8),
           smoke_phase_two_lobe(x.x, 0.7, -0.3, 0.6),
           smoke_phase(x.x, 0.0),
         );
       }`,
      rowsOf(mus.map((mu) => [mu])),
    );
    const integrate = (m: number, weight: (mu: number) => number = () => 1) =>
      (2 * Math.PI * 2 * lane(out, m).reduce((sum, v, i) => sum + v * weight(at(mus, i)), 0)) /
      count;
    for (let m = 0; m < 4; m++) {
      expect(integrate(m)).toBeCloseTo(1, 3);
      expect(lane(out, m).every((v) => v > 0)).toBe(true);
    }
    // Mean cosine of the default: 0.75 g + 0.25 (-g / 2) = 0.625 g.
    expect(integrate(0, (mu) => mu)).toBeCloseTo(0.625 * 0.4, 3);
    expect(integrate(2, (mu) => mu)).toBeCloseTo(0.6 * 0.7 - 0.4 * 0.3, 3);
    // g = 0 is the isotropic constant, 1 / (4 PI), in every direction.
    expect(lane(out, 3).every((v) => Math.abs(v * 4 * Math.PI - 1) < 1e-5)).toBe(true);

    const [isotropic, forward, back, lobe, hg, through, away] = await scalars(INCLUDE, [
      'smoke_phase_isotropic()',
      'smoke_phase(1.0, 0.6)',
      'smoke_phase(-1.0, 0.6)',
      'smoke_phase_two_lobe(0.3, 0.5, -0.2, 1.0)',
      'volume_phase_hg(0.3, 0.5)',
      // Looking through the smoke at the light is forward scattering.
      'smoke_cos_theta(vec3f(0.0, 0.0, -1.0), vec3f(0.0, 0.0, -1.0))',
      'smoke_cos_theta(vec3f(0.0, 0.0, 1.0), vec3f(0.0, 0.0, -1.0))',
    ]);
    expect(isotropic).toBeCloseTo(1 / (4 * Math.PI), 7);
    expect(forward ?? 0).toBeGreaterThan(back ?? 1);
    expect(lobe).toBeCloseTo(hg ?? Number.NaN, 7);
    expect([through, away]).toEqual([1, -1]);
  });

  it('a uniform lit slab marched with volume_accumulate matches the closed form', async () => {
    // x: steps, thickness, soot, cos_theta. Returns the marched radiance, and in .w the
    // luminance coverage of what is left.
    const cases = [
      [1, 0.4, 0.1, 0.2],
      [24, 0.4, 0.1, 0.2],
      [7, 1.5, 0.5, -0.6],
      [48, 3, 0.9, 0.9],
      [16, 0.05, 0.3, 0],
    ];
    const density = 0.6;
    const extinction = 5;
    const g = 0.45;
    const direct = [3, 1.2, 0.4];
    const ambient = [0.1, 0.15, 0.3];
    const out = await gpuF32(
      `${INCLUDE}
       fn f(x: vec4f) -> vec4f {
         let steps = i32(x.x);
         let sigma_t = smoke_extinction(${density}, ${extinction}.0, x.z);
         let albedo = smoke_albedo(x.z);
         let source = smoke_in_scatter(
           sigma_t, albedo, vec3f(${direct.join(', ')}), smoke_phase(x.w, ${g}), vec3f(${ambient.join(', ')}));
         var acc = volume_start();
         for (var i = 0; i < steps; i++) {
           acc = volume_accumulate(acc, sigma_t, source, x.y / f32(steps));
         }
         return vec4f(acc.radiance, smoke_coverage(acc.transmittance));
       }`,
      rowsOf(cases),
    );
    const hg = (mu: number, gg: number) =>
      (1 - gg * gg) / (4 * Math.PI * (1 + gg * gg - 2 * gg * mu) ** 1.5);
    cases.forEach(([, thickness = 0, soot = 0, mu = 0], i) => {
      const phase = 0.75 * hg(mu, g) + 0.25 * hg(mu, -0.5 * g);
      const through: number[] = [];
      for (let channel = 0; channel < 3; channel++) {
        const albedo = at(PALE, channel) + (at(SOOT, channel) - at(PALE, channel)) * soot;
        const tint =
          at([0.9, 1, 1.12], channel) +
          (at([0.97, 1, 1.04], channel) - at([0.9, 1, 1.12], channel)) * soot;
        const transmittance = Math.exp(-density * extinction * tint * thickness);
        through.push(transmittance);
        // L * albedo * phase term * (1 - exp(-sigma_t d)), plus the same for the ambient light.
        const expected =
          albedo *
          (at(direct, channel) * 4 * Math.PI * phase + at(ambient, channel)) *
          (1 - transmittance);
        expect(Math.abs(at(out, i * 4 + channel) - expected) / expected).toBeLessThan(2e-4);
      }
      const luminance = 0.2126 * at(through, 0) + 0.7152 * at(through, 1) + 0.0722 * at(through, 2);
      expect(at(out, i * 4 + 3)).toBeCloseTo(1 - luminance, 4);
    });
    // One big step and 24 small ones are the same integral.
    for (let channel = 0; channel < 3; channel++) {
      expect(at(out, channel) / at(out, 4 + channel)).toBeCloseTo(1, 4);
    }
  });
});
