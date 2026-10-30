import { describe, expect, it } from 'vitest';
import { createNightVision, nightColour, photopicShare } from '../src/gpu/post/night.ts';
import { createRenderTarget } from '../src/gpu/targets.ts';
import { getTestDevice, readTexture } from './gpu.ts';

// Moon Temple's story 5.6, brought over for story 12.5: night vision. Cones by day, rods by night,
// and the Purkinje shift between.

function half(bits: number): number {
  const e = (bits >> 10) & 0x1f;
  const f = bits & 0x3ff;
  const sign = bits & 0x8000 ? -1 : 1;
  return sign * (e === 0 ? 2 ** -14 * (f / 1024) : 2 ** (e - 15) * (1 + f / 1024));
}

const lum = ([r, g, b]: readonly number[]) => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;

describe('night vision', () => {
  it('leaves a daylit scene alone', () => {
    expect(photopicShare(1, 100)).toBe(1);
    expect(nightColour([0.8, 0.3, 0.1], 100)).toEqual([0.8, 0.3, 0.1]);
  });

  it('drains colour by starlight and keeps white white', () => {
    const [r, g, b] = nightColour([0.8, 0.3, 0.1], 0.003);
    expect(Math.abs(r - g) / g).toBeLessThan(0.12);
    expect(b).toBeGreaterThan(r);
    expect(lum(nightColour([1, 1, 1], 0.003)) / lum([1, 1, 1])).toBeCloseTo(1, 1);
  });

  it('shifts towards blue: red falls and blue rises (Purkinje)', () => {
    const red = lum(nightColour([1, 0, 0], 0.003)) / lum([1, 0, 0]);
    const blue = lum(nightColour([0, 0, 1], 0.003)) / lum([0, 0, 1]);
    expect(red).toBeLessThan(0.25);
    expect(blue).toBeGreaterThan(2);
  });

  it('the GPU pass matches its twin on flat colours', async () => {
    const device = await getTestDevice();
    const night = createNightVision(device);
    const scene = createRenderTarget(device, {
      label: 'night test',
      format: 'rgba16float',
      width: 16,
      height: 16,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC,
    });
    for (const colour of [
      [0.8, 0.3, 0.1],
      [0.05, 0.2, 0.9],
      [0.02, 0.02, 0.02],
    ]) {
      for (const whiteCd of [0.1, 0.003]) {
        const encoder = device.createCommandEncoder();
        encoder
          .beginRenderPass({
            colorAttachments: [
              { view: scene.view, loadOp: 'clear', storeOp: 'store', clearValue: [...colour, 1] },
            ],
          })
          .end();
        night.encode(encoder, scene, whiteCd);
        device.queue.submit([encoder.finish()]);
        const pixels = Float32Array.from(
          new Uint16Array((await readTexture(device, scene.texture, 8)).buffer),
          half,
        );
        const want = nightColour(colour, whiteCd);
        for (let c = 0; c < 3; c++) expect(pixels[c]!).toBeCloseTo(want[c]!, 2);
      }
    }
    night.destroy();
    scene.destroy();
  });
});
