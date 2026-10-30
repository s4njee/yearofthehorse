import { describe, expect, it } from 'vitest';
import { inGamut, linearToOklch, type Vec3 } from '../src/gpu/colour/oklab.ts';
import {
  bakePalette,
  cosinePalette,
  limitPaletteStep,
  paletteStep,
  formatPalette,
  namedPalette,
  PALETTE_NAMES,
  paletteFlashes,
  parsePalette,
  safePaletteSpeed,
  samplePalette,
  type CosinePalette,
} from '../src/gpu/colour/palette.ts';
import { createPaletteTexture, PALETTE_TEXELS } from '../src/gpu/colour/palette-texture.ts';
import { createFullscreenPipeline, renderFullscreen } from '../src/gpu/fullscreen.ts';
import {
  HUE_SAFE_MAX_SPEED,
  RED_SAFE_SATURATION,
  redShare,
} from '../src/gpu/safety/colour-caps.ts';
import { decodeParams, encodeParams } from '../src/shell/params-url.ts';
import capsWgsl from '../src/wgsl/colour-caps.wgsl';
import fullscreen from '../src/wgsl/fullscreen.wgsl';
import oklab from '../src/wgsl/oklab.wgsl';
import paletteWgsl from '../src/wgsl/palette.wgsl';
import { analyseFlashes, type CellSample } from './flash.ts';
import { getTestDevice, readTexture } from './gpu.ts';

// Story 3.2: palettes. The text form round-trips and rejects nonsense; every colour a palette
// gives is in gamut and red-capped; the flash count is right; and every named palette cycled over
// the whole view at the speed it is allowed stays under WCAG 2.3.1.

const DEG = Math.PI / 180;
const QUILEZ: CosinePalette = {
  a: [0.5, 0.5, 0.5],
  b: [0.5, 0.5, 0.5],
  c: [1, 1, 1],
  d: [0, 0.33, 0.67],
};

describe('palette text', () => {
  it('round-trips, with hues in degrees', () => {
    const stops = namedPalette('journey');
    const text = formatPalette(stops);
    expect(text).toBe('0.42 0.14 300,0.6 0.18 345,0.78 0.13 70,0.55 0.12 250');
    const back = parsePalette(text)!;
    back.forEach((stop, i) => stop.forEach((v, k) => expect(v).toBeCloseTo(stops[i]![k]!, 6)));
  });

  it('rejects malformed text', () => {
    for (const bad of [
      '',
      '0.5 0.1 30',
      'a b c,0.5 0.1 20',
      '1.5 0.1 0,0.5 0.1 0',
      '0.5 0.1,0.5 0.1 2',
    ]) {
      expect(parsePalette(bad), bad).toBeUndefined();
    }
  });

  it('goes through the URL as a parameter, normalised', () => {
    const schema = {
      palette: { type: 'palette', default: formatPalette(namedPalette('journey')) },
    } as const;
    const entries = encodeParams(schema, { palette: '0.5 0.1 30 , 0.7 0.12 200.04' });
    expect(entries['p.palette']).toBe('0.5 0.1 30,0.7 0.12 200');
    const query = new URLSearchParams(entries);
    expect(decodeParams(schema, query)).toEqual({ palette: '0.5 0.1 30,0.7 0.12 200' });
    expect(decodeParams(schema, new URLSearchParams({ 'p.palette': 'nonsense' }))).toEqual({});
  });
});

describe('palette colour', () => {
  it.each(PALETTE_NAMES)('%s is in gamut and red-capped at every texel', (name) => {
    const texels = bakePalette(namedPalette(name));
    for (let i = 0; i < texels.length; i += 4) {
      const c: Vec3 = [texels[i]!, texels[i + 1]!, texels[i + 2]!];
      expect(inGamut(c), `${name} texel ${i / 4}`).toBe(true);
      expect(redShare(c)).toBeLessThanOrEqual(RED_SAFE_SATURATION + 1e-3);
    }
  });

  it('makes a cosine palette safe too', () => {
    for (let i = 0; i <= 100; i++) {
      const c = cosinePalette(QUILEZ, i / 100);
      expect(inGamut(c)).toBe(true);
      expect(redShare(c)).toBeLessThanOrEqual(RED_SAFE_SATURATION + 1e-3);
    }
  });

  it('interpolates in OKLab and wraps a cyclic palette', () => {
    const stops = namedPalette('spectrum');
    const start = samplePalette(stops, 0);
    const wrapped = samplePalette(stops, 1);
    start.forEach((v, k) => expect(wrapped[k]).toBeCloseTo(v, 6));
    // Between two stops of one lightness, OKLab keeps that lightness (here through grey).
    const halfway = linearToOklch(
      samplePalette(
        [
          [0.6, 0.1, 0.4],
          [0.6, 0.1, 0.4 + 180 * DEG],
        ],
        0.25,
      ),
    );
    expect(halfway[0]).toBeCloseTo(0.6, 4);
  });
});

describe('palette flashes', () => {
  it('counts one flash for each dark-light pair a cycle passes', () => {
    expect(paletteFlashes(namedPalette('spectrum'))).toBe(0);
    expect(safePaletteSpeed(namedPalette('spectrum'))).toBe(Infinity);
    const alternating: Vec3[] = [
      [0.3, 0, 0],
      [0.85, 0, 0],
      [0.3, 0, 0],
      [0.85, 0, 0],
    ];
    expect(paletteFlashes(alternating)).toBe(2);
    expect(safePaletteSpeed(alternating)).toBe(1);
  });

  const sample = (c: Readonly<Vec3>): CellSample => {
    const sum = c[0] + c[1] + c[2];
    return {
      luminance: 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2],
      red: Math.max(0, c[0] - c[1] - c[2]) * 320,
      saturation: sum > 1e-4 ? c[0] / sum : 0,
    };
  };

  it.each(PALETTE_NAMES)('%s, cycled over the whole view as fast as allowed, passes', (name) => {
    const stops = namedPalette(name);
    const speed = Math.min(HUE_SAFE_MAX_SPEED, safePaletteSpeed(stops));
    const report = analyseFlashes({
      cells: Array.from({ length: 6 * 60 }, (_, frame) => [
        sample(samplePalette(stops, (frame / 60) * speed)),
      ]),
      cellAreaPx: 1920 * 1080,
      fps: 60,
    });
    expect(report.peakCellRedFlashes).toBe(0);
    expect(report.verdict, JSON.stringify(report)).not.toBe('high');
  });
});

describe('palette luminance step', () => {
  it.each(PALETTE_NAMES)('%s narrows to any step asked for, at fixed chroma and hue', (name) => {
    const stops = namedPalette(name);
    for (const target of [0.02, 0.05, 0.09]) {
      const narrowed = limitPaletteStep(stops, target);
      expect(paletteStep(narrowed)).toBeLessThanOrEqual(target + 1e-3);
      narrowed.forEach((stop, i) => {
        expect(stop[1]).toBe(stops[i]![1]);
        expect(stop[2]).toBe(stops[i]![2]);
      });
    }
  });

  it('leaves a palette alone that is already under the limit', () => {
    const stops = namedPalette('spectrum');
    expect(limitPaletteStep(stops, 0.9)).toEqual(stops);
  });
});

describe('palette.wgsl', () => {
  it('agrees with palette.ts, for cosine palettes and baked ones', async () => {
    const device = await getTestDevice();
    const stops = namedPalette('candy');
    const baked = createPaletteTexture(device, formatPalette(stops));
    const columns = 32;
    const texture = device.createTexture({
      size: [columns, 2],
      format: 'rgba32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const v = (x: Readonly<Vec3>) => `vec3f(${x.join(', ')})`;
    const pipeline = createFullscreenPipeline(device, {
      fragment: {
        label: 'palette test',
        code: `#include "fullscreen.wgsl"
#include "oklab.wgsl"
#include "colour-caps.wgsl"
#include "palette.wgsl"
@group(0) @binding(0) var palette: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  let t = (floor(in.position.x) + 0.5) / ${columns}.0;
  if (in.position.y < 1.0) {
    return vec4f(cosine_palette(t, ${v(QUILEZ.a)}, ${v(QUILEZ.b)}, ${v(QUILEZ.c)}, ${v(QUILEZ.d)}), 1.0);
  }
  return vec4f(palette_at(palette, samp, t), 1.0);
}`,
        chunks: {
          ...fullscreen.chunks,
          'fullscreen.wgsl': fullscreen.code,
          'oklab.wgsl': oklab.code,
          'colour-caps.wgsl': capsWgsl.code,
          'palette.wgsl': paletteWgsl.code,
        },
      },
      format: 'rgba32float',
    });
    const sampler = device.createSampler({ magFilter: 'linear', addressModeU: 'repeat' });
    const group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: baked.view },
        { binding: 1, resource: sampler },
      ],
    });
    const encoder = device.createCommandEncoder();
    renderFullscreen(encoder, texture.createView(), pipeline, [group]);
    device.queue.submit([encoder.finish()]);
    const values = new Float32Array((await readTexture(device, texture, 16)).buffer);
    texture.destroy();
    baked.destroy();
    for (let x = 0; x < columns; x++) {
      const t = (x + 0.5) / columns;
      const cosine = cosinePalette(QUILEZ, t);
      const gradient = samplePalette(stops, t);
      for (let k = 0; k < 3; k++) {
        expect(values[x * 4 + k]!, `cosine at ${t}`).toBeCloseTo(cosine[k]!, 3);
        // A baked palette is 256 half-float texels, linearly filtered: within a few thousandths.
        expect(
          Math.abs(values[(columns + x) * 4 + k]! - gradient[k]!),
          `baked at ${t}`,
        ).toBeLessThan(4 / PALETTE_TEXELS);
      }
    }
  });
});

describe('pattern step by dose', () => {
  it('stays under the discernible step up to the strong dose, then rises', async () => {
    const { patternStepAt: stepAt, PATTERN_STEP } = await import('../src/gpu/safety/pattern.ts');
    const { STRONG_DOSE } = await import('../src/gpu/safety/dose.ts');
    let last = -1;
    for (let d = 0; d <= 1.0001; d += 0.05) {
      const c = stepAt(d);
      expect(c).toBeGreaterThanOrEqual(last);
      if (d <= STRONG_DOSE + 1e-9) expect(c).toBeLessThan(PATTERN_STEP);
      last = c;
    }
    expect(stepAt(1)).toBeCloseTo(0.6, 6);
  });
});
