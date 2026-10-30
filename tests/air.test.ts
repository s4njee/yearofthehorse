import { describe, expect, it } from 'vitest';
import { createShader } from '../src/gpu/shader.ts';
import { AIR, airMean, airVelocity, type Air } from '../src/gpu/wind/air.ts';
import airWgsl from '../src/wgsl/air.wgsl';
import { getTestDevice } from './gpu.ts';

// Story 2.1: the wind in 3D. The shader (src/wgsl/air.wgsl) blows where its CPU twin does, the mean
// wind grows with height by the log profile, and the wind is correlated near and not far.

const literal = (a: Air) =>
  `Air(vec3f(${a.dir[0]}, 0.0, ${a.dir[1]}), ${[
    a.speed,
    a.height,
    a.roughness,
    a.gust,
    a.scale,
    a.turbulence,
    a.veer,
    a.time,
  ]
    .map((x) => x.toFixed(9))
    .join(', ')})`;

async function gpuVelocities(points: Float32Array, air: Air): Promise<Float32Array> {
  const device = await getTestDevice();
  const count = points.length / 4;
  const input = device.createBuffer({
    size: points.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(input, 0, points);
  const output = device.createBuffer({
    size: points.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const module = createShader(device, {
    label: 'air test',
    code: `#include "air.wgsl"
@group(0) @binding(0) var<storage, read> points: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> out: array<vec4f>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= ${count}u) { return; }
  out[id.x] = vec4f(air_velocity(points[id.x].xyz, ${literal(air)}), 0.0);
}`,
    chunks: { ...airWgsl.chunks, 'air.wgsl': airWgsl.code },
  });
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module, entryPoint: 'main' },
  });
  const group = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: input } },
      { binding: 1, resource: { buffer: output } },
    ],
  });
  const read = device.createBuffer({
    size: points.byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, group);
  pass.dispatchWorkgroups(Math.ceil(count / 64));
  pass.end();
  encoder.copyBufferToBuffer(output, 0, read, 0, points.byteLength);
  device.queue.submit([encoder.finish()]);
  await read.mapAsync(GPUMapMode.READ);
  const result = new Float32Array(read.getMappedRange().slice(0));
  read.unmap();
  for (const b of [input, output, read]) b.destroy();
  return result;
}

const correlation = (a: number[], b: number[]) => {
  const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
  const ma = mean(a);
  const mb = mean(b);
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    ab += (a[i]! - ma) * (b[i]! - mb);
    aa += (a[i]! - ma) ** 2;
    bb += (b[i]! - mb) ** 2;
  }
  return ab / Math.sqrt(aa * bb);
};

describe('the wind in 3D', () => {
  it('blows on the GPU where its CPU twin says', async () => {
    const air: Air = { ...AIR, dir: [0.8, 0.6], time: 17.3 };
    const points = new Float32Array(256 * 4);
    for (let i = 0; i < 256; i++) {
      points[i * 4] = (i % 16) * 3.7 - 20;
      points[i * 4 + 1] = (i % 7) * 1.3;
      points[i * 4 + 2] = Math.floor(i / 16) * 2.9 - 15;
    }
    const gpu = await gpuVelocities(points, air);
    let worst = 0;
    for (let i = 0; i < 256; i++) {
      const cpu = airVelocity(points[i * 4]!, points[i * 4 + 1]!, points[i * 4 + 2]!, air);
      for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(gpu[i * 4 + k]! - cpu[k]!));
    }
    expect(worst).toBeLessThan(2e-4 * air.speed);
  });

  it('grows with height by the log wind profile', () => {
    const air: Air = { ...AIR, gust: 0, turbulence: 0, veer: 0 };
    for (const y of [0.5, 2, 5, 10, 30]) {
      let sum = 0;
      for (let k = 0; k < 200; k++) sum += airVelocity(k * 3.1, y, k * 1.7, { ...air, time: k })[0];
      const expected = (air.speed * Math.log((y + 0.03) / 0.03)) / Math.log(10.03 / 0.03);
      expect(sum / 200).toBeCloseTo(expected, 6);
      expect(airMean(y, air)).toBeCloseTo(expected, 9);
    }
    // And with gusts and turbulence, it still does on average.
    const gusty = (y: number) => {
      let sum = 0;
      for (let k = 0; k < 4000; k++) sum += airVelocity(0, y, 0, { ...AIR, time: k * 0.37 })[0];
      return sum / 4000;
    };
    expect(gusty(10) / gusty(2)).toBeCloseTo(airMean(10, AIR) / airMean(2, AIR), 1);
  });

  it('has the turbulence it is asked for', () => {
    const air: Air = { ...AIR, gust: 0, veer: 0 };
    const across: number[] = [];
    for (let k = 0; k < 20000; k++)
      across.push(airVelocity(0, 3, 0, { ...air, time: k * 0.21 })[2]);
    const rms = Math.sqrt(across.reduce((s, v) => s + v * v, 0) / across.length);
    expect(rms / (air.turbulence * air.speed)).toBeGreaterThan(0.85);
    expect(rms / (air.turbulence * air.speed)).toBeLessThan(1.15);
  });

  it('moves together a metre apart and not tens of metres apart', () => {
    const speed = (x: number) => {
      const s: number[] = [];
      for (let k = 0; k < 3000; k++) {
        const [u, , w] = airVelocity(x, 3, 0, { ...AIR, time: k * 0.1 });
        s.push(Math.hypot(u, w));
      }
      return s;
    };
    // Across the wind, so the two points do not see the same front a moment apart.
    const across = (z: number) => {
      const s: number[] = [];
      for (let k = 0; k < 3000; k++) {
        const [u, , w] = airVelocity(0, 3, z, { ...AIR, time: k * 0.1 });
        s.push(Math.hypot(u, w));
      }
      return s;
    };
    expect(correlation(speed(0), speed(1))).toBeGreaterThan(0.8);
    expect(correlation(across(0), across(1))).toBeGreaterThan(0.8);
    expect(Math.abs(correlation(across(0), across(60)))).toBeLessThan(0.3);
  });
});
