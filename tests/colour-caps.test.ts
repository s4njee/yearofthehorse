import { describe, expect, it } from 'vitest';
import {
  gamutMapOklch,
  lightnessForLuminance,
  luminance,
  oklchToLinear,
  type Vec3,
} from '../src/gpu/colour/oklab.ts';
import { createFullscreenPipeline, renderFullscreen } from '../src/gpu/fullscreen.ts';
import {
  capRed,
  HUE_FLASH_CHROMA,
  HUE_SAFE_MAX_SPEED,
  HUE_SAFE_MAX_WOBBLE,
  hueAt,
  redShare,
  RED_SAFE_SATURATION,
  safeColour,
} from '../src/gpu/safety/colour-caps.ts';
import { FLICKER_SAFE_MAX_RATE } from '../src/gpu/flicker.ts';
import capsWgsl from '../src/wgsl/colour-caps.wgsl';
import fullscreen from '../src/wgsl/fullscreen.wgsl';
import oklab from '../src/wgsl/oklab.wgsl';
import { analyseFlashes, type CellSample } from './flash.ts';
import { getTestDevice, readTexture } from './gpu.ts';

// Story 2.3. The red cap holds and is the largest chroma that does; the chroma under which hue
// may turn freely is real; and the worst settings the caps allow, run as a full-screen colour
// through the flash analyser, stay under WCAG 2.3.1, while the same motion uncapped does not.

const sample = (c: Readonly<Vec3>): CellSample => {
  const [r, g, b] = c.map((v) => Math.min(1, Math.max(0, v))) as Vec3;
  const sum = r + g + b;
  return {
    luminance: 0.2126 * r + 0.7152 * g + 0.0722 * b,
    red: Math.max(0, r - g - b) * 320,
    saturation: sum > 1e-4 ? r / sum : 0,
  };
};

/** A full-screen colour over `seconds` at 60 fps, as one cell covering a 1920 x 1080 view. */
const fullScreen = (colourAt: (t: number) => Vec3, seconds = 6) =>
  analyseFlashes({
    cells: Array.from({ length: seconds * 60 }, (_, frame) => [sample(colourAt(frame / 60))]),
    cellAreaPx: 1920 * 1080,
    fps: 60,
  });

const grid = (steps: number) => Array.from({ length: steps }, (_, i) => i / (steps - 1));

describe('capRed', () => {
  it('leaves every colour at or under the red limit, and takes no more chroma than it must', () => {
    for (const L of grid(10).map((v) => 0.05 + 0.9 * v)) {
      for (const C of grid(8).map((v) => v * 0.35)) {
        for (const h of grid(36).map((v) => v * 2 * Math.PI)) {
          const capped = capRed(gamutMapOklch([L, C, h]));
          expect(redShare(oklchToLinear(capped))).toBeLessThanOrEqual(RED_SAFE_SATURATION + 1e-3);
          expect(capped[0]).toBe(L);
          if (capped[1] < gamutMapOklch([L, C, h])[1] - 1e-6) {
            // Capped: a little more chroma would be over the limit.
            const more = oklchToLinear([L, capped[1] * 1.01 + 1e-4, h]);
            expect(redShare(more)).toBeGreaterThan(RED_SAFE_SATURATION - 1e-3);
          }
        }
      }
    }
  });

  it('only touches reds', () => {
    // Green, blue and grey keep their chroma.
    for (const h of [2.4, 4.2]) expect(capRed([0.6, 0.12, h])[1]).toBe(0.12);
    expect(capRed([0.5, 0, 0])[1]).toBe(0);
    expect(capRed([0.55, 0.2, 0.5])[1]).toBeLessThan(0.2);
  });
});

describe('free hue turns under HUE_FLASH_CHROMA', () => {
  // The largest swing of relative luminance over a full turn at fixed L and C, after gamut
  // mapping, over every lightness.
  const worstSwing = (C: number) => {
    let worst = 0;
    for (const L of grid(19).map((v) => 0.05 + 0.9 * v)) {
      const ys = grid(361).map((v) =>
        luminance(oklchToLinear(gamutMapOklch([L, C, v * 2 * Math.PI]))),
      );
      worst = Math.max(worst, Math.max(...ys) - Math.min(...ys));
    }
    return worst;
  };

  it('a full turn at fixed lightness moves luminance by under half the flash step', () => {
    expect(worstSwing(HUE_FLASH_CHROMA)).toBeLessThan(0.05);
  });

  it('at full sRGB chroma the swing nearly reaches the step: the margin the cap buys', () => {
    const full = worstSwing(0.3);
    expect(full).toBeGreaterThan(0.09);
    expect(full).toBeLessThan(0.1);
  });
});

describe('the worst allowed hue motion against WCAG 2.3.1', () => {
  const worst = {
    speed: HUE_SAFE_MAX_SPEED,
    wobble: HUE_SAFE_MAX_WOBBLE,
    wobbleRate: FLICKER_SAFE_MAX_RATE,
  };

  it.each([0.3, 0.5, 0.65, 0.8])('free turns at fixed lightness %f, every seed', (L) => {
    for (let seed = 0; seed < 8; seed++) {
      const report = fullScreen((t) =>
        oklchToLinear(safeColour([L, HUE_FLASH_CHROMA * 0.99, 0.3 + hueAt(t, seed, worst)])),
      );
      expect(report.peakCellRedFlashes, `L ${L}, seed ${seed}`).toBe(0);
      expect(report.verdict, `L ${L}, seed ${seed}: ${JSON.stringify(report)}`).not.toBe('high');
    }
  });

  it.each([0.08, 0.2, 0.4])('strong chroma turned at fixed luminance %f, every seed', (y) => {
    for (let seed = 0; seed < 8; seed++) {
      const report = fullScreen((t) => {
        const h = 0.3 + hueAt(t, seed, worst);
        return oklchToLinear(safeColour([lightnessForLuminance(y, 0.25, h), 0.25, h]));
      });
      expect(report.peakCellRedFlashes, `y ${y}, seed ${seed}`).toBe(0);
      expect(report.verdict, `y ${y}, seed ${seed}`).not.toBe('high');
    }
  });

  it('fails the same field uncapped and four times as fast: the analyser can see it', () => {
    const report = fullScreen((t) =>
      oklchToLinear(gamutMapOklch([0.55, 0.25, 2 * Math.PI * 4 * t])),
    );
    expect(report.peakCellRedFlashes).toBeGreaterThan(3);
    expect(report.verdict).toBe('high');
  });

  it('clamps settings over the caps', () => {
    const fast = hueAt(1, 0, { speed: 5, wobble: 0, wobbleRate: 0 });
    expect(fast).toBeCloseTo(2 * Math.PI * HUE_SAFE_MAX_SPEED, 6);
  });
});

describe('colour-caps.wgsl', () => {
  it('agrees with colour-caps.ts', async () => {
    const device = await getTestDevice();
    const inputs: Vec3[] = [];
    for (const L of [0.3, 0.55, 0.8]) {
      for (const h of grid(16).map((v) => v * 2 * Math.PI)) inputs.push([L, 0.3, h]);
    }
    const texture = device.createTexture({
      size: [inputs.length, 1],
      format: 'rgba32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const list = inputs.map((c) => `vec3f(${c.map((v) => v.toFixed(6)).join(', ')})`).join(', ');
    const pipeline = createFullscreenPipeline(device, {
      fragment: {
        label: 'colour caps test',
        code: `#include "fullscreen.wgsl"
#include "oklab.wgsl"
#include "colour-caps.wgsl"
@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  let inputs = array(${list});
  return vec4f(safe_colour(inputs[i32(in.position.x)], 1.0), 1.0);
}`,
        chunks: {
          ...fullscreen.chunks,
          'fullscreen.wgsl': fullscreen.code,
          'oklab.wgsl': oklab.code,
          'colour-caps.wgsl': capsWgsl.code,
        },
      },
      format: 'rgba32float',
    });
    const encoder = device.createCommandEncoder();
    renderFullscreen(encoder, texture.createView(), pipeline, []);
    device.queue.submit([encoder.finish()]);
    const values = new Float32Array((await readTexture(device, texture, 16)).buffer);
    texture.destroy();
    inputs.forEach((input, i) => {
      const want = safeColour(input);
      for (let k = 0; k < 3; k++)
        expect(values[i * 4 + k]!, `colour ${i}`).toBeCloseTo(want[k]!, 3);
    });
  });
});
