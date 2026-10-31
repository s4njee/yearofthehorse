import { writeFileSync } from 'node:fs';
import { it, vi } from 'vitest';
import { estimateMotion, MOTION_CAPS } from '../src/gpu/safety/motion.ts';
import {
  burnTime,
  burstRadius,
  STAR_CLASSES,
  starTable,
  placeStar,
} from '../src/gpu/shells/star.ts';
import { analyseFlashes, sampleCells, type CellSample } from '../tests/flash.ts';
import { measureMotion } from '../tests/motion.ts';

vi.setConfig({ testTimeout: 1_200_000 });

// Story 2.8: what the safety checks make of a burst.
//
// A. One burst of the star model (a 6-inch shell's stars), drawn as dots on black at 480 x 270
//    (the analysers' frame, standing for a 1920-pixel view), at four sizes and two places, read
//    by the motion estimator a sixth of a second apart at four ages: its zoom and drift, and the
//    share of the view the reading came from.
// B. A salute (a white break with no stars): a disc that flashes for 60 ms, at three sizes and
//    rates of one to five a second, through the flash analyser.
// C. The display effects themselves, at the default and the strong dose: what the motion reading
//    covers.
//
//   npx vitest run --config experiments/vite.config.ts experiments/burst-safety.test.ts
// Writes docs/studies/burst-safety.json.

const W = 480;
const H = 270;
const DT = 1 / 6;

/** A burst of `count` stars of radius `share` of the view's width at full size, centred at (cx, cy). */
function burstFrame(t: number, share: number, cx: number, cy: number, count = 110) {
  const c = STAR_CLASSES.medium;
  const table = starTable(c);
  const scale = (share * W) / burstRadius(table);
  const out = new Float32Array(W * H);
  for (let i = 0; i < count; i++) {
    const n = i + 0.5;
    const z = 1 - (2 * n) / count;
    const r = Math.sqrt(1 - z * z);
    const turn = n * 2.39996;
    const d = [Math.cos(turn) * r, z, Math.sin(turn) * r];
    const flat = Math.hypot(d[0]!, d[2]!);
    const p = placeStar(table, Math.max(flat, 1e-6), d[1]!, t);
    // Seen from the side: the star's horizontal distance, by the share of it across the view.
    const x = cx + (flat > 1e-6 ? (p.x * d[0]!) / flat : 0) * scale;
    const y = cy - p.y * scale;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const px = Math.round(x + dx);
        const py = Math.round(y + dy);
        if (px >= 0 && px < W && py >= 0 && py < H) {
          out[py * W + px] = Math.min(
            1,
            out[py * W + px]! + 0.6 * Math.exp(-(dx * dx + dy * dy) / 1.5),
          );
        }
      }
    }
  }
  return out;
}

/** The burst's own growth: d log(radius) / dt, as zoom doublings a second. */
function trueZoom(t: number) {
  const c = STAR_CLASSES.medium;
  const table = starTable(c);
  const r = (s: number) => placeStar(table, 1, 0, s).x;
  return Math.log2(r(t + DT) / r(t)) / DT;
}

const srgbByte = (l: number) => {
  const c = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
};

it('burst safety', async () => {
  const result: Record<string, unknown> = {
    measuredAt: new Date().toISOString(),
    caps: MOTION_CAPS,
  };

  // A. One burst.
  const bursts: Record<string, unknown>[] = [];
  for (const share of [0.06, 0.12, 0.25, 0.5]) {
    for (const [place, cx, cy] of [
      ['centre', W / 2, H / 2],
      ['corner', W * 0.22, H * 0.3],
    ] as const) {
      for (const t of [0.3, 0.8, 1.5, 2.5]) {
        const r = estimateMotion(
          burstFrame(t, share, cx, cy),
          burstFrame(t + DT, share, cx, cy),
          W,
          H,
          DT,
        );
        bursts.push({
          share,
          place,
          age: t,
          zoom: +r.zoom.toFixed(3),
          drift: +r.drift.toFixed(3),
          blocks: r.blocks,
          area: +r.area.toFixed(3),
          own: +trueZoom(t).toFixed(3),
        });
      }
    }
  }
  result.bursts = bursts;
  console.log('A', JSON.stringify(bursts));

  // B. Salutes.
  const salutes: Record<string, unknown>[] = [];
  const fps = 60;
  for (const share of [0.05, 0.12, 0.25]) {
    for (const rate of [1, 2, 3, 4, 5]) {
      const cells: CellSample[][] = [];
      const rgba = new Uint8Array(W * H * 4);
      for (let frame = 0; frame < fps * 3; frame++) {
        const t = frame / fps;
        const phase = (t * rate) % 1;
        // On for 60 ms, as a salute's flash is, falling off from its centre.
        const on = phase * (1 / rate) < 0.06 ? 1 : 0;
        const radius = share * W;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const d = Math.hypot(x - W * 0.4, y - H * 0.4) / radius;
            const l = 0.004 + on * 0.9 * Math.exp(-d * d * 2);
            const b = srgbByte(l);
            const o = (y * W + x) * 4;
            rgba[o] = rgba[o + 1] = rgba[o + 2] = b;
            rgba[o + 3] = 255;
          }
        }
        cells.push(sampleCells(rgba, W, H, 24, 14));
      }
      const f = analyseFlashes({ cells, cellAreaPx: (W / 24) * (H / 14) * 16, fps });
      salutes.push({
        share,
        rate,
        verdict: f.verdict,
        cell: f.peakCellFlashes,
        areaPx: Math.round(f.flashingAreaPx),
      });
    }
  }
  result.salutes = salutes;
  console.log('B', JSON.stringify(salutes));

  // C. The display effects.
  const effects: Record<string, unknown>[] = [];
  for (const id of ['peony-display', 'willow', 'warimono']) {
    for (const params of [undefined, { dose: 0.7 }, { dose: 0.12 }]) {
      const m = await measureMotion(id, { params, seconds: 4, samples: 8 });
      effects.push({
        id,
        dose: params?.dose ?? 'default',
        zoom: +m.zoom.toFixed(3),
        drift: +m.drift.toFixed(3),
        readings: m.readings.map((r) => ({
          zoom: +r.zoom.toFixed(2),
          blocks: r.blocks,
          area: +r.area.toFixed(3),
        })),
      });
    }
  }
  result.effects = effects;
  console.log('C', JSON.stringify(effects));
  console.log('burn', burnTime(STAR_CLASSES.medium));
  writeFileSync('docs/studies/burst-safety.json', JSON.stringify(result, null, 2) + '\n');
});
