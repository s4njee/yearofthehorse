import { describe, expect, it } from 'vitest';
import { ANTON } from '../src/gpu/text/anton.generated.ts';
import { glyphDistance, glyphSegments, layoutLine } from '../src/gpu/text/font.ts';
import { ATLAS_PX_PER_EM, CELL, createTextField, FAR_PX } from '../src/gpu/text/text-field.ts';
import { getTestDevice, readTexture } from './gpu.ts';

// Temple of Time's story 1.6: the font's outlines, the GPU atlas against a brute-force distance on the CPU, and a
// line drawn into a screen field.

const half = (h: number) => {
  const e = (h >>> 10) & 0x1f;
  const m = h & 0x3ff;
  const v = e === 0 ? m * 2 ** -24 : e === 31 ? Infinity : (1 + m / 1024) * 2 ** (e - 15);
  return h & 0x8000 ? -v : v;
};

describe('font outlines', () => {
  it('has every printable ASCII glyph, closed, with sensible advances', () => {
    for (let code = 33; code < 127; code++) {
      const char = String.fromCharCode(code);
      const glyph = ANTON.glyphs[char]!;
      expect(glyph, char).toBeDefined();
      expect(glyph.advance).toBeGreaterThan(0);
      const s = glyphSegments(glyph);
      expect(s.length % 4).toBe(0);
      // Closed: every segment's end is some segment's start.
      const starts = new Set<string>();
      for (let i = 0; i < s.length; i += 4) starts.add(`${s[i]},${s[i + 1]}`);
      for (let i = 0; i < s.length; i += 4)
        expect(starts.has(`${s[i + 2]},${s[i + 3]}`), char).toBe(true);
    }
  });

  it('puts an O inside its ring and its counter outside', () => {
    const o = ANTON.glyphs.O!;
    const scale = 1 / ANTON.unitsPerEm;
    const midX = ((o.bounds[0] + o.bounds[2]) / 2) * scale;
    const midY = ((o.bounds[1] + o.bounds[3]) / 2) * scale;
    // The counter, the O's middle, is outside the glyph; just inside its left edge is inside.
    expect(glyphDistance(ANTON, 'O', midX, midY)).toBeGreaterThan(0);
    expect(glyphDistance(ANTON, 'O', o.bounds[0] * scale + 0.02, midY)).toBeLessThan(0);
  });

  it('fits every glyph and its spread in an atlas cell', () => {
    for (const [char, glyph] of Object.entries(ANTON.glyphs)) {
      const b = glyph.bounds;
      const need = (Math.max(b[2] - b[0], b[3] - b[1]) / ANTON.unitsPerEm) * ATLAS_PX_PER_EM + 32;
      expect(need, char).toBeLessThanOrEqual(CELL);
    }
  });

  it('lays a line out by advances', () => {
    const line = layoutLine(ANTON, 'AB');
    expect(line.glyphs.map((g) => g.char)).toEqual(['A', 'B']);
    expect(line.glyphs[1]!.x).toBeCloseTo(ANTON.glyphs.A!.advance / ANTON.unitsPerEm, 6);
  });
});

describe('text field on the GPU', () => {
  it('matches the CPU distance inside the atlas', async () => {
    const device = await getTestDevice();
    const field = createTextField(device, ANTON);
    const chars = Object.keys(ANTON.glyphs);
    const width = field.atlas.width;
    const data = new Uint16Array((await readTexture(device, field.atlas, 2)).buffer);
    const scale = 1 / ANTON.unitsPerEm;
    let compared = 0;
    for (const char of ['A', 'O', 'W', 'g', '&']) {
      const index = chars.indexOf(char);
      const cx = (index % 16) * CELL;
      const cy = Math.floor(index / 16) * CELL;
      const b = ANTON.glyphs[char]!.bounds;
      const ox = CELL / 2 - ((b[0] + b[2]) / 2) * scale * ATLAS_PX_PER_EM;
      const oy = CELL / 2 - ((b[1] + b[3]) / 2) * scale * ATLAS_PX_PER_EM;
      for (let ty = 8; ty < CELL; ty += 17) {
        for (let tx = 8; tx < CELL; tx += 17) {
          const px = (tx + 0.5 - ox) / ATLAS_PX_PER_EM;
          const py = (CELL - ty - 0.5 - oy) / ATLAS_PX_PER_EM;
          // The atlas knows distances out to its spread, and no further.
          const far = 16 / ATLAS_PX_PER_EM;
          const exact = glyphDistance(ANTON, char, px, py);
          const want = Math.sign(exact) * Math.min(Math.abs(exact), far);
          const got = half(data[(cy + ty) * width + cx + tx]!);
          expect(got, `${char} at ${tx},${ty}`).toBeCloseTo(want, 3);
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(200);
    field.destroy();
  });

  it('draws a line into a screen field: negative inside the letters, far away from them', async () => {
    const device = await getTestDevice();
    const field = createTextField(device, ANTON);
    const [W, H] = [256, 128];
    const target = device.createTexture({
      size: [W, H],
      format: 'r16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const encoder = device.createCommandEncoder();
    const line = { text: 'I', x: W / 2, y: 100, size: 80 };
    field.draw(encoder, target.createView(), W, H, line);
    device.queue.submit([encoder.finish()]);
    const data = new Uint16Array((await readTexture(device, target, 2)).buffer);
    const at = (x: number, y: number) => half(data[y * W + x]!);
    const [left, top, right] = field.measure(line);
    expect(left).toBeLessThan(W / 2);
    expect(right).toBeGreaterThan(W / 2);
    // The middle of the I's stem is inside; a corner of the target is far outside.
    expect(at(W / 2, 70)).toBeLessThan(0);
    expect(at(2, 2)).toBe(FAR_PX);
    expect(top).toBeLessThan(100);
    target.destroy();
    field.destroy();
  });
});
