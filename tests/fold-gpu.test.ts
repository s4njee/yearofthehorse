import { describe, expect, it } from 'vitest';
import { createFullscreenPipeline, renderFullscreen } from '../src/gpu/fullscreen.ts';
import { fold, SYMMETRY_GROUPS, type Vec2 } from '../src/gpu/symmetry/fold.ts';
import foldWgsl from '../src/wgsl/fold.wgsl';
import fullscreen from '../src/wgsl/fullscreen.wgsl';
import { getTestDevice, readTexture } from './gpu.ts';

const W = 64;
const H = 32;
const ORDER = 7;

/** The point a test pixel folds: a grid over [-3, 3)² with an irrational offset. */
const pointAt = (x: number, y: number): Vec2 => [
  -3 + (6 * (x + 0.3183)) / W,
  -3 + (6 * (y + 0.618)) / H,
];

async function runGpu(group: number, output: 'p' | 'j'): Promise<Float32Array> {
  const device = await getTestDevice();
  const texture = device.createTexture({
    size: [W, H],
    format: 'rgba32float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const result =
    output === 'p'
      ? 'vec4f(f.p, f32(f.n), 0.0)'
      : 'vec4f(f.j[0][0], f.j[1][0], f.j[0][1], f.j[1][1])';
  const pipeline = createFullscreenPipeline(device, {
    fragment: {
      label: 'fold test',
      code: `#include "fullscreen.wgsl"
#include "fold.wgsl"
@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  let px = floor(in.position.xy);
  let p = vec2f(-3.0 + 6.0 * (px.x + 0.3183) / ${W}.0, -3.0 + 6.0 * (px.y + 0.6180) / ${H}.0);
  let f = fold_point(${group}u, p, ${ORDER}.0);
  return ${result};
}`,
      chunks: {
        ...fullscreen.chunks,
        ...foldWgsl.chunks,
        'fullscreen.wgsl': fullscreen.code,
        'fold.wgsl': foldWgsl.code,
      },
    },
    format: 'rgba32float',
  });
  const encoder = device.createCommandEncoder();
  renderFullscreen(encoder, texture.createView(), pipeline, []);
  device.queue.submit([encoder.finish()]);
  const values = new Float32Array((await readTexture(device, texture, 16)).buffer);
  texture.destroy();
  return values;
}

/** True when `p` is within `e` of a seam: a small step one way or another changes its fold. */
function nearSeam(group: (typeof SYMMETRY_GROUPS)[number], p: Vec2, e = 1e-4): boolean {
  const base = fold(group, p, ORDER);
  return (
    [
      [e, 0],
      [-e, 0],
      [0, e],
      [0, -e],
    ] as Vec2[]
  ).some((d) => {
    const q = fold(group, [p[0] + d[0], p[1] + d[1]], ORDER);
    return Math.hypot(q.p[0] - base.p[0], q.p[1] - base.p[1]) > 4 * e || q.n !== base.n;
  });
}

describe('fold.wgsl', () => {
  it.each(SYMMETRY_GROUPS.map((group, id) => [group, id] as const))(
    '%s agrees with fold.ts',
    async (group, id) => {
      const points = await runGpu(id, 'p');
      const jacobians = await runGpu(id, 'j');
      let compared = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const p = pointAt(x, y);
          if (nearSeam(group, p)) continue;
          const f = fold(group, p, ORDER);
          const i = (y * W + x) * 4;
          const at = `${group} at ${p.map((v) => v.toFixed(4)).join(', ')}`;
          expect(points[i]!, at).toBeCloseTo(f.p[0], 4);
          expect(points[i + 1]!, at).toBeCloseTo(f.p[1], 4);
          expect(points[i + 2]!, at).toBe(f.n);
          for (let k = 0; k < 4; k++) expect(jacobians[i + k]!, at).toBeCloseTo(f.j[k]!, 4);
          compared++;
        }
      }
      expect(compared).toBeGreaterThan(0.9 * W * H);
    },
  );
});
