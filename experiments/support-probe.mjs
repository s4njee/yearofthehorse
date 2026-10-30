// Story 1.6: what this family leans on beyond Fire Temple's and Wind Temple's support matrices,
// probed in headless Chrome on this machine's GPU from the dev server (WebGPU needs a secure
// context). Writes docs/studies/support-probe.json.
//
//   node experiments/support-probe.mjs [--base http://localhost:5520]

import { writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../scripts/chrome.mjs';

const args = process.argv.slice(2);
const base = (
  args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://localhost:5520'
).replace(/\/$/, '');

const PROBE = `(async () => {
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    const features = ['float32-filterable', 'float32-blendable', 'timestamp-query', 'shader-f16', 'rg11b10ufloat-renderable'];
    const has = Object.fromEntries(features.map((f) => [f, adapter.features.has(f)]));
    const limits = {};
    for (const key of ['maxStorageBuffersInVertexStage', 'maxStorageBuffersPerShaderStage', 'maxStorageBufferBindingSize', 'maxBufferSize'])
      limits[key] = adapter.limits[key];
    const device = await adapter.requestDevice();
    const errors = [];
    device.onuncapturederror = (e) => errors.push(e.error.message);
    const media = {
      p3: matchMedia('(color-gamut: p3)').matches,
      rec2020: matchMedia('(color-gamut: rec2020)').matches,
      hdr: matchMedia('(dynamic-range: high)').matches,
    };

    // 1. The wide canvases: display-p3, and an rgba16float canvas with extended tone mapping.
    const canvas = (config) => {
      const c = document.createElement('canvas');
      c.width = c.height = 16;
      const ctx = c.getContext('webgpu');
      try {
        ctx.configure({ device, alphaMode: 'premultiplied', ...config });
        const got = ctx.getConfiguration?.();
        return { ok: true, colorSpace: got?.colorSpace, toneMapping: got?.toneMapping?.mode, format: got?.format };
      } catch (error) {
        return { ok: false, error: String(error) };
      }
    };
    const canvases = {
      p3: canvas({ format: navigator.gpu.getPreferredCanvasFormat(), colorSpace: 'display-p3' }),
      extended: canvas({ format: 'rgba16float', toneMapping: { mode: 'extended' } }),
      extendedP3: canvas({ format: 'rgba16float', colorSpace: 'display-p3', toneMapping: { mode: 'extended' } }),
    };

    // 2. A storage buffer read in the vertex stage, as peony-display reads its shells and tables.
    const vertexStorage = await (async () => {
      device.pushErrorScope('validation');
      const module = device.createShaderModule({ code: \`
        @group(0) @binding(0) var<storage, read> data: array<vec4f>;
        @vertex fn vs(@builtin(vertex_index) v: u32) -> @builtin(position) vec4f { return data[v]; }
        @fragment fn fs() -> @location(0) vec4f { return vec4f(1.0); }\` });
      device.createRenderPipeline({ layout: 'auto', vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba16float' }] } });
      const error = await device.popErrorScope();
      return error ? { ok: false, error: error.message } : { ok: true };
    })();

    // 3. An indirect draw whose instance count a compute pass wrote, as emitters will draw their
    // live stars, counted by drawing into a 1x1 target with additive blending.
    const indirect = await (async () => {
      device.pushErrorScope('validation');
      const argsBuffer = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT });
      const write = device.createShaderModule({ code: \`
        @group(0) @binding(0) var<storage, read_write> a: array<u32, 4>;
        @compute @workgroup_size(1) fn main() { a[0] = 3u; a[1] = 300u; a[2] = 0u; a[3] = 0u; }\` });
      const writer = device.createComputePipeline({ layout: 'auto', compute: { module: write, entryPoint: 'main' } });
      const draw = device.createShaderModule({ code: \`
        @vertex fn vs(@builtin(vertex_index) v: u32) -> @builtin(position) vec4f {
          let p = array(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
          return vec4f(p[v], 0.0, 1.0);
        }
        @fragment fn fs() -> @location(0) vec4f { return vec4f(1.0, 0.0, 0.0, 1.0); }\` });
      const pipe = device.createRenderPipeline({ layout: 'auto', vertex: { module: draw, entryPoint: 'vs' },
        fragment: { module: draw, entryPoint: 'fs', targets: [{ format: 'r32float', blend: undefined }] } });
      const target = device.createTexture({ size: [1, 1], format: 'rgba32float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
      const count = device.createTexture({ size: [1, 1], format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
      const addPipe = device.createRenderPipeline({ layout: 'auto', vertex: { module: draw, entryPoint: 'vs' },
        fragment: { module: draw, entryPoint: 'fs', targets: [{ format: 'rgba16float', blend: { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } } }] } });
      const e = device.createCommandEncoder();
      const c = e.beginComputePass();
      c.setPipeline(writer);
      c.setBindGroup(0, device.createBindGroup({ layout: writer.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: argsBuffer } }] }));
      c.dispatchWorkgroups(1);
      c.end();
      const r = e.beginRenderPass({ colorAttachments: [{ view: count.createView(), loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }] });
      r.setPipeline(addPipe);
      r.drawIndirect(argsBuffer, 0);
      r.end();
      const read = device.createBuffer({ size: 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      e.copyTextureToBuffer({ texture: count }, { buffer: read, bytesPerRow: 256 }, [1, 1]);
      device.queue.submit([e.finish()]);
      await read.mapAsync(GPUMapMode.READ);
      const half = new Uint16Array(read.getMappedRange().slice(0, 8))[0];
      read.unmap();
      const exp = (half >> 10) & 31;
      const value = (1 + (half & 1023) / 1024) * 2 ** (exp - 15);
      const error = await device.popErrorScope();
      void pipe; void target;
      return error ? { ok: false, error: error.message } : { ok: true, drawn: value };
    })();

    await device.queue.onSubmittedWorkDone();
    return { userAgent: navigator.userAgent, adapter: adapter.info, features: has, limits, media, canvases, vertexStorage, indirect, errors };
  } catch (error) {
    return { failed: String(error && error.stack || error) };
  }
})()`;

const chrome = await launchChrome();
try {
  await chrome.page('Page.navigate', { url: `${base}/` });
  await sleep(2000);
  const result = await chrome.evaluate(PROBE);
  const out = { measuredAt: new Date().toISOString(), ...result };
  writeFileSync('docs/studies/support-probe.json', JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify(out, null, 2));
} finally {
  chrome.close();
}
