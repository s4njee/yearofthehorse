import { describe, expect, it, vi } from 'vitest';
import { listEffects, loadEffect } from '../src/effects/registry.ts';
import { STRONG_DOSE } from '../src/gpu/safety/dose.ts';
import {
  estimateMotion,
  MIN_BLOCKS,
  MOTION_CAPS,
  withinMotionCaps,
} from '../src/gpu/safety/motion.ts';
import { measureMotion, type MotionReport } from './motion.ts';

vi.setConfig({ testTimeout: 600_000 });

// Story 2.4. The estimator against synthetic frames moved by a known amount, then every effect at
// its defaults against the caps, and every preset that goes over them declared.

const W = 480;
const H = 270;

/** A smooth texture: a few sines at unrelated angles, so every block has something to track. */
function texture(x: number, y: number): number {
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const a = i * 2.39996;
    const f = 0.03 + 0.017 * i;
    sum += Math.sin((x * Math.cos(a) + y * Math.sin(a)) * f + i * 1.7);
  }
  return 0.25 + 0.03 * sum;
}

/** The texture seen through a turn (radians, anticlockwise on screen), zoom and drift. */
function moved(turn: number, zoom: number, dx: number, dy: number): Float32Array {
  const out = new Float32Array(W * H);
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Screen to scene: undo the drift, the zoom and the turn about the centre. Screen y is
      // down, so an anticlockwise turn as seen is a clockwise one in these coordinates.
      const qx = (x + 0.5 - W / 2 - dx) / zoom;
      const qy = (y + 0.5 - H / 2 - dy) / zoom;
      out[y * W + x] = texture(c * qx - s * qy, s * qx + c * qy);
    }
  }
  return out;
}

describe('estimateMotion', () => {
  const still = moved(0, 1, 0, 0);
  const dt = 1 / 6;

  it('reads a still frame as still', () => {
    const r = estimateMotion(still, still, W, H, dt);
    expect(Math.abs(r.rotation)).toBeLessThan(0.05);
    expect(Math.abs(r.zoom)).toBeLessThan(0.002);
    expect(r.drift).toBeLessThan(0.001);
    expect(r.blocks).toBeGreaterThan(300);
  });

  it('reports no whole-field motion from a handful of features', () => {
    // Twelve bright dots on black, each moving its own way: too few blocks to be evidence.
    const dots = (t: number) => {
      const out = new Float32Array(W * H);
      for (let i = 0; i < 12; i++) {
        const cx = 40 + ((i * 97) % 400) + t * (i % 3) * 8;
        const cy = 30 + ((i * 53) % 210) - t * ((i + 1) % 4) * 6;
        for (let y = -3; y <= 3; y++) {
          for (let x = -3; x <= 3; x++) {
            const px = Math.round(cx + x);
            const py = Math.round(cy + y);
            if (px >= 0 && px < W && py >= 0 && py < H)
              out[py * W + px] = 0.8 * Math.exp(-(x * x + y * y) / 4);
          }
        }
      }
      return out;
    };
    const r = estimateMotion(dots(0), dots(1), W, H, dt);
    expect(r.blocks).toBeLessThan(MIN_BLOCKS);
    expect([r.rotation, r.zoom, r.drift]).toEqual([0, 0, 0]);
  });

  it.each([
    ['a turn of 5° a second', (5 * Math.PI) / 180 / 6, 1, 0, 0, { rotation: 5 }],
    ['a turn of 12° a second the other way', (-12 * Math.PI) / 180 / 6, 1, 0, 0, { rotation: -12 }],
    ['a zoom of 0.1 doublings a second', 0, 2 ** (0.1 / 6), 0, 0, { zoom: 0.1 }],
    ['a zoom out of 0.3 doublings a second', 0, 2 ** (-0.3 / 6), 0, 0, { zoom: -0.3 }],
    ['a drift of 0.05 widths a second', 0, 1, (0.05 * W) / 6, 0, { drift: 0.05 }],
    [
      'all three together',
      (8 * Math.PI) / 180 / 6,
      2 ** (0.2 / 6),
      3,
      -2,
      { rotation: 8, zoom: 0.2 },
    ],
  ] as const)('recovers %s within 10%', (_name, turn, zoom, dx, dy, expected) => {
    const r = estimateMotion(still, moved(turn, zoom, dx, dy), W, H, dt);
    const close = (value: number, target: number) =>
      expect(Math.abs(value - target)).toBeLessThanOrEqual(0.1 * Math.abs(target) + 0.05);
    close(r.rotation, 'rotation' in expected ? expected.rotation : 0);
    if ('zoom' in expected) close(r.zoom, expected.zoom);
    else expect(Math.abs(r.zoom)).toBeLessThan(0.01);
    if ('drift' in expected) close(r.drift, expected.drift);
  });
});

const describeReport = (report: MotionReport) =>
  JSON.stringify({
    rotation: report.rotation,
    zoom: report.zoom,
    drift: report.drift,
    peak: report.peak,
  });

describe.skipIf(process.env.FLASH_SWEEP === '0')(
  'registered effects against the motion caps',
  () => {
    // At the default, and at the strong end of the slider: a visitor can drag that far unwarned.
    it.each(listEffects().map((meta) => [meta.id]))(
      '%s stays inside the caps up to the strong dose',
      async (id) => {
        for (const dose of [undefined, STRONG_DOSE]) {
          const report = await measureMotion(id, {
            params: dose === undefined ? undefined : { dose },
          });
          expect(
            withinMotionCaps(report),
            `${id} at dose ${dose ?? 'default'}: ${describeReport(report)} against ${JSON.stringify(MOTION_CAPS)}`,
          ).toBe(true);
        }
      },
    );

    it.each(listEffects().map((meta) => [meta.id, meta.scorecard?.motionPresets ?? []] as const))(
      '%s declares every preset that goes over (%j)',
      async (id, declared) => {
        const effect = await loadEffect(id);
        const over: string[] = [];
        for (const preset of Object.keys(effect.presets ?? {})) {
          if (!withinMotionCaps(await measureMotion(id, { preset, seconds: 2, samples: 4 }))) {
            over.push(preset);
          }
        }
        expect(over.filter((preset) => !declared.includes(preset))).toEqual([]);
        for (const preset of declared) expect(Object.keys(effect.presets ?? {})).toContain(preset);
      },
    );
  },
);
