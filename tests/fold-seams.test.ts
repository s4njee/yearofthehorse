import { describe, expect, it } from 'vitest';
import { createFullscreenPipeline, renderFullscreen } from '../src/gpu/fullscreen.ts';
import { generateMipmaps, mipLevelCount } from '../src/gpu/mipmap.ts';
import { fold, SYMMETRY_GROUPS, type SymmetryGroup, type Vec2 } from '../src/gpu/symmetry/fold.ts';
import foldWgsl from '../src/wgsl/fold.wgsl';
import fullscreen from '../src/wgsl/fullscreen.wgsl';
import { getTestDevice, readTexture } from './gpu.ts';

// Story 4.1's seam problem, measured. A mipmapped checkerboard folded through a group, sampled
// with the GPU's own derivatives of the folded coordinate ("hardware") or with the unfolded ones
// turned by the fold's Jacobian ("unfolded"), each compared with a 4x supersampled reference. The
// error is taken in a band either side of every seam and away from them.

const SIZE = 192;
const SUPER = 4;
const CELLS = 1.6;
const TEX = 256;

async function checker(device: GPUDevice): Promise<GPUTexture> {
  const texture = device.createTexture({
    size: [TEX, TEX],
    format: 'rgba8unorm',
    mipLevelCount: mipLevelCount(TEX, TEX),
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.COPY_DST,
  });
  const data = new Uint8Array(TEX * TEX * 4);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const v = ((x >> 4) + (y >> 4)) & 1 ? 255 : 0;
      data.set([v, v, v, 255], (y * TEX + x) * 4);
    }
  }
  device.queue.writeTexture({ texture }, data, { bytesPerRow: TEX * 4 }, [TEX, TEX]);
  generateMipmaps(device, texture);
  return texture;
}

async function render(
  device: GPUDevice,
  tex: GPUTexture,
  group: number,
  size: number,
  unfolded: boolean,
): Promise<Float32Array> {
  const target = device.createTexture({
    size: [size, size],
    format: 'rgba32float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const sample = unfolded
    ? 'textureSampleGrad(t, s, uv, f.j * dx * 2.0, f.j * dy * 2.0)'
    : 'textureSample(t, s, uv)';
  const pipeline = createFullscreenPipeline(device, {
    fragment: {
      label: `seam test ${unfolded ? 'unfolded' : 'hardware'}`,
      code: `#include "fullscreen.wgsl"
#include "fold.wgsl"
@group(0) @binding(0) var t: texture_2d<f32>;
@group(0) @binding(1) var s: sampler;
@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  let p = (in.uv - 0.5) * ${CELLS} + vec2f(0.013, 0.021);
  let dx = dpdx(p);
  let dy = dpdy(p);
  let f = fold_point(${group}u, p, 6.0);
  let uv = f.p * 2.0;
  return ${sample};
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
  const sampler = device.createSampler({
    addressModeU: 'mirror-repeat',
    addressModeV: 'mirror-repeat',
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
  });
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: tex.createView() },
      { binding: 1, resource: sampler },
    ],
  });
  const encoder = device.createCommandEncoder();
  renderFullscreen(encoder, target.createView(), pipeline, [bind]);
  device.queue.submit([encoder.finish()]);
  const out = new Float32Array((await readTexture(device, target, 16)).buffer);
  target.destroy();
  return out;
}

/** The red channel, box-filtered down by `factor`. */
function downsample(image: Float32Array, size: number, factor: number): Float32Array {
  const small = size / factor;
  const out = new Float32Array(small * small);
  for (let y = 0; y < small; y++) {
    for (let x = 0; x < small; x++) {
      let sum = 0;
      for (let j = 0; j < factor; j++) {
        for (let i = 0; i < factor; i++)
          sum += image[((y * factor + j) * size + x * factor + i) * 4]!;
      }
      out[y * small + x] = sum / (factor * factor);
    }
  }
  return out;
}

/**
 * Whether pixel (x, y)'s neighbourhood straddles a seam: a neighbour's fold is not where this
 * pixel's isometry would put it (a mirror, a turn or a translation wrap between them).
 */
function onSeam(group: SymmetryGroup, x: number, y: number): boolean {
  const at = (px: number, py: number): Vec2 => [
    ((px + 0.5) / SIZE - 0.5) * CELLS + 0.013,
    // Fullscreen uv grows downwards, like the pixel rows.
    ((py + 0.5) / SIZE - 0.5) * CELLS + 0.021,
  ];
  const p = at(x, y);
  const base = fold(group, p, 6);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const q = at(x + dx!, y + dy!);
    const d: Vec2 = [q[0] - p[0], q[1] - p[1]];
    const predicted: Vec2 = [
      base.p[0] + base.j[0] * d[0] + base.j[1] * d[1],
      base.p[1] + base.j[2] * d[0] + base.j[3] * d[1],
    ];
    const other = fold(group, q, 6).p;
    if (Math.hypot(other[0] - predicted[0], other[1] - predicted[1]) > 1e-6) return true;
  }
  return false;
}

interface Errors {
  seam: number;
  elsewhere: number;
}

async function measure(group: SymmetryGroup, unfolded: boolean): Promise<Errors> {
  const device = await getTestDevice();
  const tex = await checker(device);
  const id = SYMMETRY_GROUPS.indexOf(group);
  const reference = downsample(
    await render(device, tex, id, SIZE * SUPER, true),
    SIZE * SUPER,
    SUPER,
  );
  const image = downsample(await render(device, tex, id, SIZE, unfolded), SIZE, 1);
  tex.destroy();
  let seam = 0;
  let seamCount = 0;
  let rest = 0;
  let restCount = 0;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const e = Math.abs(image[y * SIZE + x]! - reference[y * SIZE + x]!);
      if (onSeam(group, x, y)) {
        seam += e;
        seamCount++;
      } else {
        rest += e;
        restCount++;
      }
    }
  }
  return { seam: seam / seamCount, elsewhere: rest / restCount };
}

describe('fold seams', () => {
  // A reflection flips a derivative's sign but keeps its length, so the GPU's own derivatives pick
  // the right mip level on both sides of a mirror: the reflection groups need no help.
  it.each(['pmm', 'p6m', 'dn'] as const)('%s: mirrors leave no seam either way', async (group) => {
    const unfolded = await measure(group, true);
    const hardware = await measure(group, false);
    console.info(
      `${group}: mean error at seams ${unfolded.seam.toFixed(3)} unfolded, ` +
        `${hardware.seam.toFixed(3)} hardware; elsewhere ${unfolded.elsewhere.toFixed(3)}`,
    );
    for (const e of [unfolded, hardware]) expect(e.seam).toBeLessThan(e.elsewhere * 2 + 0.01);
  });

  // Where the folded coordinate jumps (a translation wrap, a turn), the GPU differentiates across
  // the jump and samples the coarsest level: a grey line along every such edge. The Jacobian
  // removes it. The checkerboard is symmetric under p1's and p4's isometries, so there the seam
  // vanishes; it has no six-fold symmetry, so at p6's turns the motif itself jumps, an edge the
  // supersampled reference smooths and a single sample cannot.
  it.each([
    ['p1', true],
    ['p4', true],
    ['p6', false],
  ] as const)(
    '%s: a jump draws a line with hardware gradients, not with unfolded ones',
    async (group, motifSymmetric) => {
      const unfolded = await measure(group, true);
      const hardware = await measure(group, false);
      console.info(
        `${group}: mean error at seams ${unfolded.seam.toFixed(3)} unfolded, ` +
          `${hardware.seam.toFixed(3)} hardware`,
      );
      if (motifSymmetric) expect(unfolded.seam).toBeLessThan(unfolded.elsewhere * 2 + 0.01);
      expect(hardware.seam).toBeGreaterThan(2.5 * unfolded.seam);
    },
  );
});
