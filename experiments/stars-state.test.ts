import { writeFileSync } from 'node:fs';
import { it, vi } from 'vitest';
import { packTables, SHELL_CLASSES, TABLE_ANGLES, TABLE_SAMPLES } from '../src/gpu/shells/shell.ts';
import { createBenchDevice } from '../tests/bench.ts';

vi.setConfig({ testTimeout: 600_000 });

// Story 2.4: stateless stars against stateful ones, on the same stars.
//
// - Stateless: the vertex shader places each star from its class's flight table (story 2.1) at
//   the shell's age, as peony-display does. Nothing is stored per star.
// - Stateful: a compute pass steps each star's position and velocity one frame (quadratic drag
//   on a burning sphere, as `integrateStar`), and the vertex shader reads the positions. 32 bytes
//   a star, and the run can no longer be paused, resized or scrubbed without care.
//
// Both draw a streak per star into a 1920 x 1080 rgba16float target with additive blending.
// Shells of 128 stars, spread over the view. Writes docs/studies/stars-state.md.
//
//   npx vitest run --config experiments/vite.config.ts experiments/stars-state.test.ts

const WIDTH = 1920;
const HEIGHT = 1080;
const PER_SHELL = 128;

const COMMON = /* wgsl */ `
struct P { count: u32, time: f32, scale: f32, dt: f32 }
@group(0) @binding(0) var<uniform> p: P;

fn h3(n: u32) -> vec3f {
  var v = vec3u(n * 1664525u + 1013904223u, n * 22695477u + 1u, n * 1103515245u + 12345u);
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> vec3u(16u);
  return vec3f(v & vec3u(0xffffu)) / 65535.0;
}

fn direction(i: u32) -> vec3f {
  let n = f32(i % ${PER_SHELL}u) + 0.5;
  let z = 1.0 - 2.0 * n / ${PER_SHELL}.0;
  let turn = n * 2.39996;
  let r = sqrt(max(0.0, 1.0 - z * z));
  return vec3f(cos(turn) * r, z, sin(turn) * r);
}

fn burst(i: u32) -> vec2f {
  let h = h3(i / ${PER_SHELL}u);
  return vec2f((h.x - 0.5) * 400.0, 80.0 + h.y * 180.0);
}

fn age(i: u32) -> f32 {
  return fract(p.time / 2.0 + h3(i / ${PER_SHELL}u + 7u).z) * 2.0;
}

struct V { @builtin(position) pos: vec4f, @location(0) a: f32 }

fn quad(head: vec2f, tail: vec2f, v: u32) -> V {
  let toClip = vec2f(p.scale / f32(${WIDTH}) * 2.0, p.scale / f32(${HEIGHT}) * 2.0);
  let a = head * toClip - vec2f(0.0, 1.0);
  let b = tail * toClip - vec2f(0.0, 1.0);
  let px = vec2f(${WIDTH}.0, ${HEIGHT}.0) * 0.5;
  let axis = (a - b) * px;
  let len = length(axis);
  let dir = select(vec2f(0.0, 1.0), axis / max(len, 1e-4), len > 1e-3);
  let nrm = vec2f(-dir.y, dir.x);
  let c = vec2f(select(-1.0, 1.0, (v & 1u) == 1u), select(-1.0, 1.0, v >= 2u));
  let at = mix(b, a, 0.5 + 0.5 * c.y) * px + (dir * c.y + nrm * c.x) * 2.5;
  var out: V;
  out.pos = vec4f(at / px, 0.0, 1.0);
  out.a = 0.5 + 0.5 * c.y;
  return out;
}

@fragment fn fs(in: V) -> @location(0) vec4f {
  return vec4f(vec3f(0.02, 0.01, 0.005) * in.a, 0.0);
}
`;

const STATELESS = /* wgsl */ `
${COMMON}
@group(0) @binding(1) var<storage, read> tables: array<vec2f>;

fn place(d: vec3f, t: f32) -> vec2f {
  let step = ${SHELL_CLASSES.medium.burn / (TABLE_SAMPLES - 1)};
  let dy = clamp(d.y, -1.0, 1.0);
  let level = sqrt(max(0.0, 1.0 - dy * dy));
  let ua = (asin(dy) + 1.5707963) / 3.14159265 * ${TABLE_ANGLES - 1}.0;
  let a0 = min(u32(ua), ${TABLE_ANGLES - 2}u);
  let fa = ua - f32(a0);
  let ut = clamp(t / step, 0.0, ${TABLE_SAMPLES - 1}.0);
  let i0 = min(u32(ut), ${TABLE_SAMPLES - 2}u);
  let ft = ut - f32(i0);
  let base = ${TABLE_ANGLES * TABLE_SAMPLES}u;
  let lo = mix(tables[base + a0 * ${TABLE_SAMPLES}u + i0], tables[base + a0 * ${TABLE_SAMPLES}u + i0 + 1u], ft);
  let hi = mix(tables[base + (a0 + 1u) * ${TABLE_SAMPLES}u + i0], tables[base + (a0 + 1u) * ${TABLE_SAMPLES}u + i0 + 1u], ft);
  let f = mix(lo, hi, fa);
  let flat = select(vec2f(1.0, 0.0), d.xz / level, level > 1e-4);
  return vec2f(flat.x * (level * f.x - dy * f.y), dy * f.x + level * f.y);
}

@vertex fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> V {
  let d = direction(i);
  let t = age(i);
  return quad(burst(i) + place(d, t), burst(i) + place(d, max(t - 0.06, 0.0)), v);
}
`;

const STATEFUL = /* wgsl */ `
${COMMON}
struct Star { pos: vec2f, vel: vec2f, prev: vec2f, radius: f32, pad: f32 }
@group(0) @binding(1) var<storage, read_write> stars: array<Star>;

@compute @workgroup_size(64) fn step(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= p.count) { return; }
  var s = stars[i];
  let t = age(i);
  if (t < p.dt) {
    // A new break: restart this star at the shell.
    let d = direction(i);
    s.pos = burst(i);
    s.prev = s.pos;
    s.vel = d.xy * ${SHELL_CLASSES.medium.star.speed};
    s.radius = ${SHELL_CLASSES.medium.star.radius};
  }
  s.prev = s.pos;
  let r = max(s.radius, 0.0002);
  let k = 3.0 * 1.2 * 0.47 / (8.0 * r * ${SHELL_CLASSES.medium.star.density}.0);
  let speed = length(s.vel);
  s.vel += (vec2f(0.0, -9.81) - k * speed * s.vel) * p.dt;
  s.pos += s.vel * p.dt;
  s.radius -= ${SHELL_CLASSES.medium.star.burnRate} * p.dt;
  stars[i] = s;
}

@group(0) @binding(2) var<storage, read> drawn: array<Star>;

@vertex fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> V {
  let s = drawn[i];
  return quad(s.pos, s.prev, v);
}
`;

it('stateless against stateful stars', async () => {
  const bench = await createBenchDevice();
  const { device } = bench;
  const target = device.createTexture({
    size: [WIDTH, HEIGHT],
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const view = target.createView();
  const uniform = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const tables = packTables();
  const tableBuffer = device.createBuffer({
    size: tables.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(tableBuffer, 0, tables);
  const blend: GPUBlendState = {
    color: { srcFactor: 'one', dstFactor: 'one' },
    alpha: { srcFactor: 'one', dstFactor: 'one' },
  };
  const render = (code: string) => {
    const module = device.createShaderModule({ code });
    return device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba16float', blend }] },
      primitive: { topology: 'triangle-strip' },
    });
  };
  const stateless = render(STATELESS);
  const statefulModule = device.createShaderModule({ code: STATEFUL });
  const stepPipe = device.createComputePipeline({
    layout: 'auto',
    compute: { module: statefulModule, entryPoint: 'step' },
  });
  const statefulDraw = render(STATEFUL);

  const rows: string[] = [];
  for (const count of [10_000, 50_000, 200_000]) {
    device.queue.writeBuffer(uniform, 0, new Float32Array([0, 1.3, 2.6, 1 / 60]));
    device.queue.writeBuffer(uniform, 0, new Uint32Array([count]));
    const starBuffer = device.createBuffer({ size: count * 32, usage: GPUBufferUsage.STORAGE });
    const groupless = device.createBindGroup({
      layout: stateless.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniform } },
        { binding: 1, resource: { buffer: tableBuffer } },
      ],
    });
    const groupStep = device.createBindGroup({
      layout: stepPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniform } },
        { binding: 1, resource: { buffer: starBuffer } },
      ],
    });
    const groupDraw = device.createBindGroup({
      layout: statefulDraw.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniform } },
        { binding: 2, resource: { buffer: starBuffer } },
      ],
    });
    const draw = (
      encoder: GPUCommandEncoder,
      pipeline: GPURenderPipeline,
      group: GPUBindGroup,
      label: string,
    ) => {
      const pass = encoder.beginRenderPass({
        colorAttachments: [{ view, loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }],
        timestampWrites: bench.profiler.pass(label),
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, group);
      pass.draw(4, count);
      pass.end();
    };
    const a = await bench.measure((encoder) => draw(encoder, stateless, groupless, 'stateless'));
    const b = await bench.measure((encoder) => {
      const pass = encoder.beginComputePass({ timestampWrites: bench.profiler.pass('step') });
      pass.setPipeline(stepPipe);
      pass.setBindGroup(0, groupStep);
      pass.dispatchWorkgroups(Math.ceil(count / 64));
      pass.end();
      draw(encoder, statefulDraw, groupDraw, 'stateful');
    });
    rows.push(
      `| ${count.toLocaleString('en-GB')} | ${a.slopeMs.toFixed(2)} | ${b.slopeMs.toFixed(2)} | 0 | ${((count * 32) / 1024 / 1024).toFixed(1)} MB |`,
    );
    console.log(count, a.slopeMs.toFixed(3), b.slopeMs.toFixed(3));
    starBuffer.destroy();
  }
  bench.destroy();
  writeFileSync(
    'docs/studies/stars-state.json',
    JSON.stringify({ measuredAt: new Date().toISOString(), rows }, null, 2) + '\n',
  );
  console.log(rows.join('\n'));
});
