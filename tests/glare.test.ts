import { describe, expect, it } from 'vitest';
import { createGlareLayer, GLARE_FLOATS, spikesFor } from '../src/gpu/glare/glare.ts';
import { getTestDevice, readTexture } from './gpu.ts';

// Stories 2.6 and 2.7: spikes and a streak carry exactly the share of a light they are given, in
// every channel, though red's rays are longer than blue's.

const SIZE = 256;

function half(bits: number): number {
  const e = (bits >> 10) & 0x1f;
  const f = bits & 0x3ff;
  return e === 0 ? 2 ** -14 * (f / 1024) : 2 ** (e - 15) * (1 + f / 1024);
}

async function render(
  frame: Partial<Parameters<ReturnType<typeof createGlareLayer>['encode']>[2]>,
) {
  const device = await getTestDevice();
  const layer = createGlareLayer(device, { label: 'test' });
  const texture = device.createTexture({
    size: [SIZE, SIZE],
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const data = new Float32Array(GLARE_FLOATS);
  data.set([SIZE / 2 + 0.3, SIZE / 2 + 0.6, 0, 0, 1, 1, 1, 0]);
  layer.setLights(data, 1);
  const encoder = device.createCommandEncoder();
  encoder
    .beginRenderPass({
      colorAttachments: [
        { view: texture.createView(), loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' },
      ],
    })
    .end();
  layer.encode(encoder, texture.createView(), {
    width: SIZE,
    height: SIZE,
    spikes: 6,
    rotation: 0.2,
    length: 12,
    thickness: 1,
    spikeShare: 1,
    ...frame,
  });
  device.queue.submit([encoder.finish()]);
  const raw = new Uint16Array((await readTexture(device, texture, 8)).buffer);
  const totals = [0, 0, 0];
  for (let i = 0; i < SIZE * SIZE; i++) {
    for (let c = 0; c < 3; c++) totals[c] = totals[c]! + half(raw[i * 4 + c]!);
  }
  texture.destroy();
  layer.destroy();
  return totals;
}

describe('glare', () => {
  it('gives polygonal apertures their spike counts', () => {
    expect(spikesFor(0)).toBe(0);
    expect(spikesFor(5)).toBe(10);
    expect(spikesFor(6)).toBe(6);
    expect(spikesFor(7)).toBe(14);
  });

  it.each([
    ['six spikes', { spikes: 6, spikeShare: 1 }],
    ['ten thin spikes', { spikes: 10, spikeShare: 1, thickness: 0.6, length: 20 }],
    ['spikes and a streak', { spikes: 6, spikeShare: 0.5, streakShare: 0.5, streakLength: 20 }],
  ] as const)('carries exactly its share of the light: %s', async (_name, frame) => {
    const totals = await render(frame);
    for (let c = 0; c < 3; c++) {
      expect(totals[c]!, `channel ${c}`).toBeGreaterThan(0.97);
      expect(totals[c]!, `channel ${c}`).toBeLessThan(1.02);
    }
  });
});
