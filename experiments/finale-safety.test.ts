import { writeFileSync } from 'node:fs';
import { it, vi } from 'vitest';
import { measureFlashes } from '../tests/flash.ts';
import { measureMotion } from '../tests/motion.ts';

vi.setConfig({ testTimeout: 3_600_000 });

// Story 3.8: the whole of `display`'s 90-second programme through the flash and motion checks,
// with and without its finale. The normal checks look at a few seconds after the held moment,
// which never reaches a finale at the end of the loop.
//
//   npx vitest run --config experiments/vite.config.ts experiments/finale-safety.test.ts
// Writes docs/studies/finale-safety.json.

it('finale safety', async () => {
  const rows: Record<string, unknown>[] = [];
  for (const preset of ['hanabi', 'finale']) {
    for (const params of [undefined, { dose: 0.7 }]) {
      const f = await measureFlashes('display', { preset, params, seconds: 92, settle: 0.5 });
      const m = await measureMotion('display', { preset, params, seconds: 90, samples: 90 });
      const over = m.readings.filter((r) => Math.abs(r.zoom) > 0.1 || r.drift > 0.05);
      const row = {
        preset,
        dose: params?.dose ?? 'default',
        flash: f.verdict,
        cell: f.peakCellFlashes,
        red: f.peakCellRedFlashes,
        areaPx: Math.round(f.flashingAreaPx),
        zoom: +m.zoom.toFixed(3),
        drift: +m.drift.toFixed(3),
        peakZoom: +m.peak.zoom.toFixed(3),
        readingsOver: over.length,
        largestAreaOver: +Math.max(0, ...over.map((r) => r.area)).toFixed(3),
      };
      console.log(JSON.stringify(row));
      rows.push(row);
    }
  }
  writeFileSync(
    'docs/studies/finale-safety.json',
    JSON.stringify({ measuredAt: new Date().toISOString(), rows }, null, 2) + '\n',
  );
});
