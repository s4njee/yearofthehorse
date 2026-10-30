import { describe, expect, it } from 'vitest';
import {
  gamutMapOklch,
  inGamut,
  linearToOklab,
  oklchToLinear,
  type Vec3,
} from '../src/gpu/colour/oklab.ts';
import {
  configureCanvasWide,
  gamutMapOklchIn,
  inGamutOf,
  P3_TO_SRGB,
  p3ToSrgb,
  SRGB_TO_P3,
  srgbToP3,
} from '../src/gpu/colour/wide-gamut.ts';
import { createFullscreenPipeline, renderFullscreen } from '../src/gpu/fullscreen.ts';
import { createColourStage } from '../src/gpu/post/colour-stage.ts';
import { redShare, RED_SAFE_SATURATION } from '../src/gpu/safety/colour-caps.ts';
import capsWgsl from '../src/wgsl/colour-caps.wgsl';
import fullscreen from '../src/wgsl/fullscreen.wgsl';
import gamutWgsl from '../src/wgsl/gamut.wgsl';
import oklab from '../src/wgsl/oklab.wgsl';
import { getTestDevice, readTexture } from './gpu.ts';

// Stories 3.3 and 3.6: the P3 matrices and gamut, the canvas configuration's fallbacks, the
// shader twin, and the tail's colour stage (copy, P3 conversion, bleed and iridescence).

describe('Display P3', () => {
  it('has matrices that invert each other and keep white', () => {
    for (const c of [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [0.3, 0.6, 0.2],
    ] as Vec3[]) {
      p3ToSrgb(srgbToP3(c)).forEach((v, k) => expect(v).toBeCloseTo(c[k]!, 5));
    }
    srgbToP3([1, 1, 1]).forEach((v) => expect(v).toBeCloseTo(1, 4));
    expect(SRGB_TO_P3).toHaveLength(9);
    expect(P3_TO_SRGB).toHaveLength(9);
  });

  it('holds all of sRGB and more', () => {
    for (const c of [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 1, 0],
    ] as Vec3[]) {
      expect(inGamutOf(c, 'p3')).toBe(true);
    }
    const p3Red = p3ToSrgb([1, 0, 0]);
    expect(inGamut(p3Red)).toBe(false);
    expect(inGamutOf(p3Red, 'p3')).toBe(true);
  });

  it('maps by chroma into either gamut, and allows more chroma in P3', () => {
    let wider = 0;
    for (let i = 0; i < 36; i++) {
      const h = (i / 36) * 2 * Math.PI;
      const s = gamutMapOklch([0.65, 0.4, h]);
      const p = gamutMapOklchIn([0.65, 0.4, h], 'p3');
      expect(gamutMapOklchIn([0.65, 0.4, h], 'srgb')[1]).toBeCloseTo(s[1], 6);
      expect(p[0]).toBe(0.65);
      expect(p[1]).toBeGreaterThanOrEqual(s[1] - 1e-6);
      expect(inGamutOf(oklchToLinear(p), 'p3')).toBe(true);
      wider += p[1] / s[1];
    }
    // About a quarter more chroma on average, the plan's figure for P3 against sRGB.
    expect(wider / 36).toBeGreaterThan(1.15);
  });
});

describe('configureCanvasWide', () => {
  const fakeCanvas = (reported: string | undefined, fail = false) => {
    const calls: GPUCanvasConfiguration[] = [];
    const context = {
      configure(config: GPUCanvasConfiguration) {
        if (fail && config.colorSpace === 'display-p3') throw new Error('unsupported');
        calls.push(config);
      },
      getConfiguration: () => ({
        colorSpace: calls.at(-1)?.colorSpace === 'display-p3' ? reported : 'srgb',
      }),
    };
    return { canvas: { getContext: () => context } as unknown as HTMLCanvasElement, calls };
  };
  const device = {} as GPUDevice;

  it('uses display-p3 when the browser confirms it', () => {
    const { canvas, calls } = fakeCanvas('display-p3');
    expect(
      configureCanvasWide(canvas, device, 'bgra8unorm', { displayIsP3: () => true }).wide,
    ).toBe(true);
    expect(calls.at(-1)?.colorSpace).toBe('display-p3');
  });

  it('falls back to sRGB on an sRGB display, a browser that ignores it, or one that throws', () => {
    for (const [reported, fail, display] of [
      ['display-p3', false, false],
      ['srgb', false, true],
      [undefined, true, true],
    ] as const) {
      const { canvas, calls } = fakeCanvas(reported, fail);
      const result = configureCanvasWide(canvas, device, 'bgra8unorm', {
        displayIsP3: () => display,
      });
      expect(result.wide).toBe(false);
      expect(result.reason).toBeTruthy();
      expect(calls.at(-1)?.colorSpace).toBeUndefined();
    }
  });
});

describe('gamut.wgsl', () => {
  it('agrees with wide-gamut.ts', async () => {
    const device = await getTestDevice();
    const inputs: Vec3[] = Array.from({ length: 24 }, (_, i) => [
      0.4 + 0.02 * i,
      0.38,
      (i / 24) * 2 * Math.PI,
    ]);
    const texture = device.createTexture({
      size: [inputs.length, 2],
      format: 'rgba32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const list = inputs.map((c) => `vec3f(${c.map((v) => v.toFixed(6)).join(', ')})`).join(', ');
    const pipeline = createFullscreenPipeline(device, {
      fragment: {
        label: 'gamut test',
        code: `#include "fullscreen.wgsl"
#include "oklab.wgsl"
#include "colour-caps.wgsl"
#include "gamut.wgsl"
@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  let inputs = array(${list});
  let lch = inputs[i32(in.position.x)];
  if (in.position.y < 1.0) { return vec4f(srgb_to_p3(oklch_to_linear(gamut_map_oklch_in(lch, true, 1.0))), 1.0); }
  return vec4f(oklch_to_linear(safe_colour_in(lch, true, 1.0)), 1.0);
}`,
        chunks: {
          ...fullscreen.chunks,
          'fullscreen.wgsl': fullscreen.code,
          'oklab.wgsl': oklab.code,
          'colour-caps.wgsl': capsWgsl.code,
          'gamut.wgsl': gamutWgsl.code,
        },
      },
      format: 'rgba32float',
    });
    const encoder = device.createCommandEncoder();
    renderFullscreen(encoder, texture.createView(), pipeline, []);
    device.queue.submit([encoder.finish()]);
    const values = new Float32Array((await readTexture(device, texture, 16)).buffer);
    texture.destroy();
    const { safeColour } = await import('../src/gpu/safety/colour-caps.ts');
    inputs.forEach((lch, i) => {
      const mapped = srgbToP3(oklchToLinear(gamutMapOklchIn(lch, 'p3')));
      const safe = oklchToLinear(safeColour(lch, 1, 'p3'));
      for (let k = 0; k < 3; k++) {
        expect(values[i * 4 + k]!, `mapped ${i}`).toBeCloseTo(mapped[k]!, 3);
        expect(values[(inputs.length + i) * 4 + k]!, `safe ${i}`).toBeCloseTo(safe[k]!, 3);
      }
    });
  });
});

describe('colour stage', () => {
  const W = 64;
  const H = 32;

  /** Draws `paint(x, y)` (linear RGB) into the stage's input, runs it, returns the output. */
  async function run(
    paint: (x: number, y: number) => Vec3,
    values: { bleed?: number; iridescence?: number },
    gamut: 'srgb' | 'p3' = 'srgb',
  ): Promise<Float32Array> {
    const device = await getTestDevice();
    device.pushErrorScope('validation');
    const stage = createColourStage(device, { format: 'rgba16float', gamut });
    stage.resize(W, H);
    const data = new Float32Array(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) data.set([...paint(x, y), 1], (y * W + x) * 4);
    }
    // Uploaded as half floats, the stage input's format.
    const half = new Uint16Array(data.length);
    const f = new Float32Array(1);
    const u = new Uint32Array(f.buffer);
    for (let i = 0; i < data.length; i++) {
      f[0] = data[i]!;
      const x = u[0]!;
      const e = ((x >>> 23) & 0xff) - 112;
      half[i] =
        ((x >>> 16) & 0x8000) |
        (e <= 0 ? 0 : e >= 31 ? 0x7c00 : (e << 10) | (((x & 0x7fffff) + 0x1000) >>> 13));
    }
    device.queue.writeTexture({ texture: stage.input.texture }, half, { bytesPerRow: W * 8 }, [
      W,
      H,
    ]);
    // The stage writes the chain's scene format, rgba16float, read back as half floats.
    const target = device.createTexture({
      size: [W, H],
      format: 'rgba16float',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.TEXTURE_BINDING,
    });
    const encoder = device.createCommandEncoder();
    stage.encode(encoder, target.createView(), 3, values);
    device.queue.submit([encoder.finish()]);
    const raw = new Uint16Array((await readTexture(device, target, 8)).buffer);
    const invalid = await device.popErrorScope();
    if (invalid) throw new Error(invalid.message);
    target.destroy();
    stage.destroy();
    const floats = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      const h = raw[i]!;
      const e = (h >>> 10) & 0x1f;
      const m = h & 0x3ff;
      const v = e === 0 ? m * 2 ** -24 : (1 + m / 1024) * 2 ** (e - 15);
      floats[i] = h & 0x8000 ? -v : v;
    }
    return floats;
  }

  const pixel = (out: Float32Array, x: number, y: number): Vec3 => {
    const i = (y * W + x) * 4;
    return [out[i]!, out[i + 1]!, out[i + 2]!];
  };
  // Saturated magenta on the left half, mid grey on the right.
  const edge = (x: number): Vec3 => (x < W / 2 ? [0.5, 0.05, 0.45] : [0.2, 0.2, 0.2]);

  it('copies when everything is off', async () => {
    const out = await run(edge, {});
    for (const x of [0, 20, 40, 63])
      pixel(out, x, 10).forEach((v, k) => expect(v).toBeCloseTo(edge(x)[k]!, 2));
  });

  it('converts to P3 primaries on a P3 canvas', async () => {
    const out = await run(edge, {}, 'p3');
    const want = srgbToP3(edge(5));
    pixel(out, 5, 10).forEach((v, k) => expect(v).toBeCloseTo(want[k]!, 2));
  });

  it('bleeds chroma past the edge, and keeps every pixel’s lightness', async () => {
    const out = await run(edge, { bleed: 1 });
    for (const x of [10, 28, 34, 50]) {
      expect(linearToOklab(pixel(out, x, 16))[0]).toBeCloseTo(linearToOklab(edge(x))[0], 2);
    }
    // Just past the edge the grey has taken on the magenta's hue.
    const [, a, b] = linearToOklab(pixel(out, W / 2 + 2, 16));
    expect(Math.hypot(a, b)).toBeGreaterThan(0.02);
    // Far from it, it has not.
    const [, fa, fb] = linearToOklab(pixel(out, W - 1, 16));
    expect(Math.hypot(fa, fb)).toBeLessThan(Math.hypot(a, b));
  });

  it('adds a sheen at fixed lightness, red-capped', async () => {
    const out = await run((x, y) => [0.1 + 0.01 * x, 0.1 + 0.02 * y, 0.3], { iridescence: 1 });
    let moved = 0;
    for (let y = 0; y < H; y += 7) {
      for (let x = 0; x < W; x += 9) {
        const before = linearToOklab([0.1 + 0.01 * x, 0.1 + 0.02 * y, 0.3]);
        const after = pixel(out, x, y);
        expect(linearToOklab(after)[0]).toBeCloseTo(before[0], 2);
        expect(redShare(after)).toBeLessThanOrEqual(RED_SAFE_SATURATION + 0.01);
        moved += Math.hypot(
          linearToOklab(after)[1] - before[1],
          linearToOklab(after)[2] - before[2],
        );
      }
    }
    expect(moved).toBeGreaterThan(0.1);
  });
});
