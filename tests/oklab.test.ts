import { describe, expect, it } from 'vitest';
import {
  gamutMap,
  gamutMapOklch,
  inGamut,
  linearToOklab,
  linearToOklch,
  luminance,
  oklabToLinear,
  oklchToLinear,
  rotateHue,
  rotateHueAtLuminance,
  type Vec3,
} from '../src/gpu/colour/oklab.ts';
import { createFullscreenPipeline, renderFullscreen } from '../src/gpu/fullscreen.ts';
import fullscreen from '../src/wgsl/fullscreen.wgsl';
import oklab from '../src/wgsl/oklab.wgsl';
import { getTestDevice, readTexture } from './gpu.ts';

function colours(count: number, seed = 1): Vec3[] {
  let s = seed >>> 0;
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  return Array.from({ length: count }, () => [next(), next(), next()]);
}

/** The spread of relative luminance over a full hue turn, as a share of its mean. */
function luminanceSwing(start: Vec3, turn: (c: Vec3, radians: number) => Vec3): number {
  const ys = Array.from({ length: 72 }, (_, i) => luminance(turn(start, (i / 72) * 2 * Math.PI)));
  const mean = ys.reduce((a, b) => a + b) / ys.length;
  return (Math.max(...ys) - Math.min(...ys)) / mean;
}

describe('OKLab', () => {
  it('round-trips linear sRGB', () => {
    for (const c of colours(500)) {
      const back = oklabToLinear(linearToOklab(c));
      for (let k = 0; k < 3; k++) expect(back[k]).toBeCloseTo(c[k]!, 6);
    }
  });

  it('puts white at L = 1 with no chroma, and black at 0', () => {
    const white = linearToOklab([1, 1, 1]);
    expect(white[0]).toBeCloseTo(1, 4);
    expect(Math.hypot(white[1], white[2])).toBeLessThan(1e-4);
    expect(linearToOklab([0, 0, 0])[0]).toBe(0);
  });

  it('turns hue at fixed lightness, but not at fixed luminance', () => {
    // The finding behind `rotateHueAtLuminance`: perceived lightness held is not luminance held.
    // At L 0.7 every hue is in gamut up to C 0.1; the swing, as a share of the mean, grows with
    // chroma (about 110 % × C). In absolute terms, which is what WCAG's 10% step is, it is far
    // smaller: 3.8% of full white here (tests/colour-caps.test.ts).
    const muted: Vec3 = oklchToLinear([0.7, 0.05, 0]);
    const saturated: Vec3 = oklchToLinear([0.7, 0.1, 0]);
    for (const c of [muted, saturated]) {
      const L = linearToOklch(c)[0];
      for (let i = 0; i < 12; i++)
        expect(linearToOklch(rotateHue(c, i * 0.5))[0]).toBeCloseTo(L, 6);
    }
    expect(luminanceSwing(muted, rotateHue)).toBeGreaterThan(0.05);
    expect(luminanceSwing(saturated, rotateHue)).toBeGreaterThan(0.1);
    const ys = Array.from({ length: 72 }, (_, i) => luminance(rotateHue(saturated, i / 11.46)));
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.04);
  });

  it('keeps relative luminance exactly with rotateHueAtLuminance', () => {
    const saturated: Vec3 = oklchToLinear([0.7, 0.1, 0]);
    expect(luminanceSwing(saturated, rotateHueAtLuminance)).toBeLessThan(1e-4);
  });

  it('maps out-of-gamut colour by chroma alone', () => {
    for (const h of [0, 1, 2, 3, 4, 5]) {
      const lch: Vec3 = [0.65, 0.4, h];
      const mapped = gamutMapOklch(lch);
      expect(mapped[0]).toBe(0.65);
      expect(mapped[2]).toBe(h);
      expect(mapped[1]).toBeLessThan(0.4);
      expect(inGamut(oklchToLinear(mapped))).toBe(true);
      // And the largest chroma that fits: a little more leaves the gamut.
      expect(inGamut(oklchToLinear([mapped[0], mapped[1] + 0.003, h]))).toBe(false);
    }
    const out = gamutMap([1.4, 0.2, -0.1]);
    expect(inGamut(out)).toBe(true);
  });

  it('agrees between WGSL and TypeScript', async () => {
    const device = await getTestDevice();
    const inputs = colours(16, 7);
    const texture = device.createTexture({
      size: [inputs.length, 4],
      format: 'rgba32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const list = inputs.map((c) => `vec3f(${c.map((v) => v.toFixed(6)).join(', ')})`).join(', ');
    const pipeline = createFullscreenPipeline(device, {
      fragment: {
        label: 'oklab test',
        code: `#include "fullscreen.wgsl"
#include "oklab.wgsl"
@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  let inputs = array(${list});
  let p = vec2i(in.position.xy);
  let c = inputs[p.x];
  switch p.y {
    case 0: { return vec4f(linear_to_oklab(c), 1.0); }
    case 1: { return vec4f(rotate_hue(c, 1.3), 1.0); }
    case 2: { return vec4f(rotate_hue_at_luminance(c, 2.1), 1.0); }
    default: { return vec4f(oklch_to_linear(gamut_map_oklch(vec3f(0.6, 0.35, f32(p.x) * 0.4), 1.0)), 1.0); }
  }
}`,
        chunks: {
          ...fullscreen.chunks,
          'fullscreen.wgsl': fullscreen.code,
          'oklab.wgsl': oklab.code,
        },
      },
      format: 'rgba32float',
    });
    const encoder = device.createCommandEncoder();
    renderFullscreen(encoder, texture.createView(), pipeline, []);
    device.queue.submit([encoder.finish()]);
    const values = new Float32Array((await readTexture(device, texture, 16)).buffer);
    texture.destroy();
    const expected = (row: number, x: number): Vec3 => {
      const c = inputs[x]!;
      if (row === 0) return linearToOklab(c);
      if (row === 1) return rotateHue(c, 1.3);
      if (row === 2) return rotateHueAtLuminance(c, 2.1);
      return oklchToLinear(gamutMapOklch([0.6, 0.35, x * 0.4]));
    };
    for (let row = 0; row < 4; row++) {
      for (let x = 0; x < inputs.length; x++) {
        const want = expected(row, x);
        for (let k = 0; k < 3; k++) {
          expect(values[(row * inputs.length + x) * 4 + k]!, `row ${row}, colour ${x}`).toBeCloseTo(
            want[k]!,
            3,
          );
        }
      }
    }
  });
});
