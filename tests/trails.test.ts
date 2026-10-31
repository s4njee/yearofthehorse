import { describe, expect, it } from 'vitest';
import { createShellRenderer, type ShellViewValues } from '../src/gpu/shells/render.ts';
import type { Shell } from '../src/gpu/shells/shell.ts';
import { placeStar, STAR_CLASSES, starTable } from '../src/gpu/shells/star.ts';
import { starColours } from '../src/gpu/spectra/emission.ts';
import { getTestDevice, readTexture } from './gpu.ts';
import { mountHeadless } from './headless.ts';

// Story 2.5: trails recomputed from each star's past path (src/gpu/shells/shells.wgsl).

const W = 640;
const H = 360;
/** A seed that turns the one star of a one-star shell to point across the view (+x). */
const ACROSS = (2 * Math.PI - 0.5 * 2.39996) / 6.283;

const half = (bits: number) => {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x3ff;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 31) return fraction ? NaN : sign * Infinity;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
};

/** One medium star `t` seconds after its break, thrown across the view, drawn alone. */
async function drawStar(t: number, view: Partial<ShellViewValues> = {}) {
  const device = await getTestDevice();
  const target = device.createTexture({
    size: [W, H],
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const stars = createShellRenderer(device, { format: 'rgba16float' });
  const shell: Shell = {
    launch: -(1 + t),
    rise: 1,
    x: -60,
    height: 100,
    from: -60,
    class: 'medium',
    stars: 1,
    colour: 'white',
    pattern: 'sphere',
    trail: 0,
    seed: ACROSS,
  };
  const values: ShellViewValues = {
    width: W,
    height: H,
    scale: 3,
    ground: 40,
    brightness: 1,
    ...view,
  };
  stars.update([shell], starColours('srgb'), values);
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      { view: target.createView(), loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' },
    ],
  });
  stars.draw(pass);
  pass.end();
  device.queue.submit([encoder.finish()]);
  const bytes = await readTexture(device, target, 8);
  const words = new Uint16Array(bytes.buffer);
  const light = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++)
    light[i] = half(words[i * 4]!) + half(words[i * 4 + 1]!) + half(words[i * 4 + 2]!);
  stars.destroy();
  target.destroy();
  let total = 0;
  let left = W;
  let right = -1;
  let peak = 0;
  for (let i = 0; i < light.length; i++) peak = Math.max(peak, light[i]!);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const l = light[y * W + x]!;
      total += l;
      if (l > peak * 0.02) {
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
  }
  return { total, left, right };
}

describe('trails', () => {
  it("keeps a star's light, whether it streaks fast or gathers slowly", async () => {
    // Both moments are inside the star's steady burn, so it gives off the same light per second.
    const fast = await drawStar(0.45);
    const slow = await drawStar(1.2);
    expect(fast.right - fast.left).toBeGreaterThan(1.5 * (slow.right - slow.left));
    expect(Math.abs(fast.total / slow.total - 1)).toBeLessThan(0.1);
  });

  it("draws a camera trail as long as the shutter was open, within a frame's travel", async () => {
    const table = starTable(STAR_CLASSES.medium);
    for (const [t, shutter] of [
      [1.2, 0.5],
      [1.6, 1],
    ] as const) {
      const drawn = await drawStar(t, { shutter });
      const path = (placeStar(table, 1, 0, t).x - placeStar(table, 1, 0, t - shutter).x) * 3;
      const frame = (placeStar(table, 1, 0, t).x - placeStar(table, 1, 0, t - 1 / 60).x) * 3;
      // The drawn streak also has the ribbon's round ends, about its width either side.
      const length = drawn.right - drawn.left - 2 * 3;
      expect(Math.abs(length - path)).toBeLessThan(frame + 3);
    }
  });

  it('shows the same light at 30 and 120 frames a second', async () => {
    const read = async (fps: number) => {
      const mounted = await mountHeadless('peony-display', { width: 320, height: 180, fps });
      // Exactly three seconds of frames: `runTo` can overshoot by one frame at a coarse rate.
      mounted.step(3 * fps);
      const rgba = await mounted.read();
      mounted.destroy();
      return rgba.reduce((sum, v) => sum + v, 0);
    };
    const a = await read(30);
    const b = await read(120);
    expect(a).toBeGreaterThan(0);
    // The output's dither follows the frame count, which differs: that is the only difference.
    expect(Math.abs(a / b - 1)).toBeLessThan(0.006);
  });
});
