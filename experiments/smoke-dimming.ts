import { writeFileSync } from 'node:fs';
import { activeShells, burnOf, programme, type Shell } from '../src/gpu/shells/shell.ts';
import { packPuffs, PUFF_FLOATS, SMOKE_DEFAULTS } from '../src/gpu/smoke/puffs.ts';

// Story 2.6: how much a display's smoke dims the bursts that come after it.
//
// For `display`'s programme (seed 1, its default rate), with and without its finale, the light
// each burning burst loses to the smoke in front of it: exp(-0.6 x optical depth) at the burst's
// centre from the smoke of earlier breaks (its own fresh puff left out), as display.wgsl
// composites it, with the noise at its mean (0.55 of the puff's depth before texture). Averaged over every burst burning in each ten-second stretch of the programme.
// Writes docs/studies/smoke-dimming.json.
//
//   node experiments/smoke-dimming.ts

const PERIOD = 90;
const list = programme(1, { rate: 20, period: PERIOD, width: 700, gap: 1.1 });

function finale(): Shell[] {
  const out: Shell[] = [];
  for (let i = 0; i < 30; i++) {
    const breakAt = PERIOD - 12.5 + i * 0.4;
    out.push({
      launch: breakAt - 3.6,
      rise: 3.6,
      x: ((i * 0.618) % 1) * 700 - 350,
      height: 190,
      from: 0,
      class: 'medium',
      stars: 88,
      colour: 'gold',
      pattern: 'canister',
      trail: 0.5,
      sparks: 0.5,
      seed: (i * 0.371) % 1,
    });
  }
  return out;
}

/** Optical depth at (x, y) from every puff but the burst's own (`own` is its seed). */
function depthAt(puffs: Float32Array, n: number, x: number, y: number, own: number) {
  let depth = 0;
  for (let i = 0; i < n; i++) {
    const o = i * PUFF_FLOATS;
    if (Math.abs(puffs[o + 4]! - own) < 1e-6 && puffs[o + 5]! < 10) continue;
    const qx = (x - puffs[o]!) / puffs[o + 2]!;
    const qy = (y - puffs[o + 1]!) / puffs[o + 2]!;
    depth += puffs[o + 3]! * Math.exp(-1.3 * (qx * qx + qy * qy)) * 0.55;
  }
  return depth;
}

const rows: Record<string, unknown>[] = [];
for (const [name, shells] of [
  ['programme', list],
  ['with finale', [...list, ...finale()]],
] as const) {
  for (const amount of [1, 2]) {
    for (let from = 0; from < PERIOD; from += 10) {
      let sum = 0;
      let count = 0;
      for (let t = from; t < from + 10; t += 0.25) {
        const puffs = new Float32Array(32 * PUFF_FLOATS);
        const n = packPuffs(
          shells,
          t,
          PERIOD,
          { ...SMOKE_DEFAULTS, amount: SMOKE_DEFAULTS.amount * amount },
          puffs,
        );
        for (const s of activeShells(shells, t, PERIOD)) {
          const since = -s.launch - s.rise;
          if (since < 0.3 || since > burnOf(s)) continue;
          sum += Math.exp(-0.6 * depthAt(puffs, n, s.x, s.height, s.seed));
          count++;
        }
      }
      rows.push({
        programme: name,
        smoke: amount,
        from,
        bursts: count,
        kept: count ? +(sum / count).toFixed(3) : null,
      });
    }
  }
}
console.table(rows);
writeFileSync(
  'docs/studies/smoke-dimming.json',
  JSON.stringify({ measuredAt: new Date().toISOString(), rows }, null, 2) + '\n',
);
