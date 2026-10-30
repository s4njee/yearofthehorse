import { describe, expect, it } from 'vitest';
import { createFullscreenPipeline, renderFullscreen } from '../src/gpu/fullscreen.ts';
import {
  countFlashes,
  flickerClamp,
  flickerIntensity,
  FLICKER_FLASH_LIMIT,
} from '../src/gpu/flicker.ts';
import flicker from '../src/wgsl/flicker.wgsl';
import fullscreen from '../src/wgsl/fullscreen.wgsl';
import { getTestDevice, readTexture } from './gpu.ts';

// Story 2.9: Fire Temple's flicker, ported for twinkling points. Fire Temple's own tests cover the
// construction in depth; these check the port: the caps hold, the worst safe settings stay under
// the WCAG 2.3.1 limit over many seeds, and the WGSL twin gives the TypeScript's numbers.

const WORST = flickerClamp({ rate: 1e6, depth: 1e6, shimmer: 1e6, shimmerRate: 1e6 });

describe('flicker for points', () => {
  it('clamps to the safe range', () => {
    expect(WORST).toEqual({ rate: 4, depth: 0.96, shimmer: 0.04, shimmerRate: 24 });
  });

  it('never flashes more than three times a second at the worst safe settings', () => {
    const hz = 240;
    for (let seed = 0; seed < 200; seed++) {
      const samples = Float64Array.from({ length: hz * 20 }, (_, i) =>
        flickerIntensity(i / hz, seed, WORST),
      );
      expect(countFlashes(samples, hz).maxFlashes, `seed ${seed}`).toBeLessThanOrEqual(
        FLICKER_FLASH_LIMIT,
      );
    }
  });

  it('agrees between WGSL and TypeScript', async () => {
    const device = await getTestDevice();
    const times = [0, 0.37, 1.9, 12.25, 300.5, 1023.9];
    const seeds = [0, 1, 7, 1234];
    const texture = device.createTexture({
      size: [times.length, seeds.length],
      format: 'rgba32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const pipeline = createFullscreenPipeline(device, {
      fragment: {
        label: 'flicker test',
        code: `#include "fullscreen.wgsl"
#include "flicker.wgsl"
@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  let times = array(${times.map((t) => t.toFixed(4)).join(', ')});
  let seeds = array(${seeds.map((s) => `${s}u`).join(', ')});
  let p = vec2i(in.position.xy);
  return vec4f(flicker_intensity(times[p.x], seeds[p.y], flicker_default()), 0.0, 0.0, 1.0);
}`,
        chunks: {
          ...fullscreen.chunks,
          ...flicker.chunks,
          'fullscreen.wgsl': fullscreen.code,
          'flicker.wgsl': flicker.code,
        },
      },
      format: 'rgba32float',
    });
    const encoder = device.createCommandEncoder();
    renderFullscreen(encoder, texture.createView(), pipeline, []);
    device.queue.submit([encoder.finish()]);
    const values = new Float32Array((await readTexture(device, texture, 16)).buffer);
    texture.destroy();
    for (const [y, seed] of seeds.entries()) {
      for (const [x, t] of times.entries()) {
        expect(values[(y * times.length + x) * 4]!, `t ${t}, seed ${seed}`).toBeCloseTo(
          flickerIntensity(t, seed),
          4,
        );
      }
    }
  });
});
