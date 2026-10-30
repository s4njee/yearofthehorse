import { describe, expect, it } from 'vitest';
import { createFullscreenPipeline, renderFullscreen } from '../src/gpu/fullscreen.ts';
import type { ShaderSource } from '../src/gpu/shader.ts';
import { createStrokeLayer, type StrokeBlend, type StrokeLayer } from '../src/gpu/strokes.ts';
import { createUniformBuffer, defineUniformStruct } from '../src/gpu/uniforms.ts';
import fullscreen from '../src/wgsl/fullscreen.wgsl';
import { expectValid, getTestDevice, readTexture } from './gpu.ts';

const WIDTH = 128;
const HEIGHT = 64;

/** The layer's light, red channel, as floats (one per pixel). */
async function readLight(device: GPUDevice, layer: StrokeLayer): Promise<Float32Array> {
  const texture = device.createTexture({
    size: [WIDTH, HEIGHT],
    format: 'rgba32float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const pipeline = createFullscreenPipeline(device, {
    fragment: {
      label: 'copy light',
      code: `#include "fullscreen.wgsl"
@group(0) @binding(0) var light: texture_2d<f32>;
@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  return textureLoad(light, vec2i(in.position.xy), 0);
}`,
      chunks: { ...fullscreen.chunks, 'fullscreen.wgsl': fullscreen.code },
    },
    format: 'rgba32float',
  });
  const encoder = device.createCommandEncoder();
  renderFullscreen(encoder, texture.createView(), pipeline, [
    device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: layer.view }],
    }),
  ]);
  device.queue.submit([encoder.finish()]);
  const rgba = new Float32Array((await readTexture(device, texture, 16)).buffer);
  texture.destroy();
  return Float32Array.from({ length: WIDTH * HEIGHT }, (_, i) => rgba[i * 4]!);
}

const sum = (values: Float32Array) => values.reduce((total, v) => total + v, 0);

// A moving Gaussian spot, as The Bazaar's vector scope draws its beam: each step's light
// integrates to its energy (`a.z`), and consecutive steps join without a seam.
const BeamParams = defineUniformStruct('BeamParams', { sigma: 'f32' });
const beamShade: ShaderSource = {
  label: 'beam-shade.wgsl',
  code: `
fn stroke_level(s: Stroke) -> f32 { return s.a.z; }
fn stroke_pad(s: Stroke) -> f32 { return params.sigma * 4.0; }
fn stroke_shade(s: Stroke, level: f32, at: StrokePoint) -> vec4f {
  let sigma = params.sigma;
  let k = 1.0 / (sigma * 1.4142136);
  let along = 0.5 * (stroke_erf((at.length - at.along) * k) - stroke_erf(-at.along * k));
  let across = exp(-at.across * at.across / (2.0 * sigma * sigma)) / (sigma * 2.5066283);
  let light = level * along * across / at.length;
  return vec4f(light, 0.0, 0.0, 0.0);
}`,
};

// A Gaussian falloff with distance to the segment, peak 1, as a glow is.
const glowShade: ShaderSource = {
  label: 'glow-shade.wgsl',
  code: `
fn stroke_level(s: Stroke) -> f32 { return 1.0; }
fn stroke_pad(s: Stroke) -> f32 { return 12.0; }
fn stroke_shade(s: Stroke, level: f32, at: StrokePoint) -> vec4f {
  return vec4f(exp(-at.distance * at.distance / 8.0), 0.0, 0.0, 0.0);
}`,
};

describe('stroke layer', () => {
  it('draws a polyline beam that conserves energy and has no seams at its joints', async () => {
    const device = await getTestDevice();
    const uniforms = createUniformBuffer(device, BeamParams, 'beam');
    uniforms.set({ sigma: 2 });
    uniforms.upload();
    const layer = await expectValid(device, () =>
      createStrokeLayer(device, {
        label: 'beam',
        blend: 'add',
        topology: 'strip',
        format: 'rgba16float',
        shade: beamShade,
        uniforms,
      }),
    );
    layer.resize(WIDTH, HEIGHT);
    // 45 points 2 px apart along a pixel row, one unit of energy per step.
    const points = 45;
    const data = new Float32Array(points * 4);
    for (let i = 0; i < points; i++) data.set([20 + i * 2, 32.5, 1, 0], i * 4);
    layer.setStrokes(data, points);
    const encoder = device.createCommandEncoder();
    // Positions are already in pixels.
    await expectValid(device, () => layer.encode(encoder, { scale: [1, 1] }));
    device.queue.submit([encoder.finish()]);
    const light = await readLight(device, layer);

    expect(sum(light)).toBeCloseTo(points - 1, 0);
    // Along the middle of the beam, away from its ends, the brightness is flat: no beads.
    const row = Array.from({ length: 41 }, (_, i) => light[32 * WIDTH + 44 + i]!);
    const mean = row.reduce((a, b) => a + b) / row.length;
    for (const value of row) expect(Math.abs(value - mean) / mean).toBeLessThan(0.01);

    // Next frame, no strokes and half the light kept: the afterglow alone, halved.
    layer.setStrokes(data, 0);
    const next = device.createCommandEncoder();
    layer.encode(next, { scale: [1, 1], decay: 0.5 });
    device.queue.submit([next.finish()]);
    expect(sum(await readLight(device, layer)) / sum(light)).toBeCloseTo(0.5, 2);
    layer.destroy();
    uniforms.destroy();
  });

  it.each([
    ['max', 1],
    ['add', 2],
  ] as const)('joins two segments at a corner with %s blending (peak %d)', async (blend, peak) => {
    const device = await getTestDevice();
    const layer = createStrokeLayer(device, {
      label: 'glow',
      blend: blend as StrokeBlend,
      format: 'rgba16float',
      shade: glowShade,
    });
    layer.resize(WIDTH, HEIGHT);
    // An L in uv, meeting at the centre of pixel (64, 32): positions are scaled by the canvas.
    const corner = [64.5 / WIDTH, 32.5 / HEIGHT];
    const data = new Float32Array([
      ...[corner[0]! - 0.2, corner[1]!, corner[0]!, corner[1]!, 0, 0, 0, 0, 0, 0, 0, 0],
      ...[corner[0]!, corner[1]!, corner[0]!, corner[1]! - 0.4, 0, 0, 0, 0, 0, 0, 0, 0],
    ]);
    layer.setStrokes(data, 2);
    const encoder = device.createCommandEncoder();
    layer.encode(encoder);
    device.queue.submit([encoder.finish()]);
    const light = await readLight(device, layer);
    expect(light[32 * WIDTH + 64]).toBeCloseTo(peak, 2);
    // Along one arm, away from the joint, either blend sees a single segment.
    expect(light[32 * WIDTH + 50]).toBeCloseTo(1, 2);
    layer.destroy();
  });
});
