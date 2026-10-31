import { writeFileSync } from 'node:fs';
import { it, vi } from 'vitest';
import { measureFlashes } from '../tests/flash.ts';
import { measureMotion } from '../tests/motion.ts';

vi.setConfig({ testTimeout: 3_600_000 });

// `river-tour`'s whole 120-second programme through the flash and motion checks, as
// finale-safety.test.ts does for `display`: the normal checks look at a few seconds of its first
// act, which never reaches the strobes, the willows or the finale.
//
//   npx vitest run --config experiments/vite.config.ts experiments/tour-safety.test.ts
// Writes docs/studies/tour-safety.json.

it('tour safety', async () => {
  const rows: Record<string, unknown>[] = [];
  for (const params of [undefined, { dose: 0.7 }]) {
    const f = await measureFlashes('river-tour', { params, seconds: 122, settle: 0.5 });
    const m = await measureMotion('river-tour', { params, seconds: 120, samples: 120 });
    const over = m.readings.filter((r) => Math.abs(r.zoom) > 0.1 || r.drift > 0.05);
    const row = {
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
  writeFileSync(
    'docs/studies/tour-safety.json',
    JSON.stringify({ measuredAt: new Date().toISOString(), rows }, null, 2) + '\n',
  );
});
