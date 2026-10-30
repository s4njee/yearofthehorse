import { it, vi } from 'vitest';
import { listEffects, loadEffect } from '../src/effects/registry.ts';
import { measureFlashes } from '../tests/flash.ts';
import { measureMotion } from '../tests/motion.ts';
import { measurePatterns } from '../tests/pattern.ts';

vi.setConfig({ testTimeout: 1_200_000 });

// Scratch: flash, pattern and motion for every effect (or SWEEP_EFFECTS), every preset, and at
// the strong dose, so a scorecard can be filled in from measurements.
it('sweep', async () => {
  const ids = process.env.SWEEP_EFFECTS?.split(',') ?? listEffects().map((m) => m.id);
  for (const id of ids) {
    const effect = await loadEffect(id);
    for (const preset of [undefined, ...Object.keys(effect.presets ?? {})]) {
      for (const params of [undefined, { dose: 0.7 }]) {
        if (preset && params) continue;
        const f = await measureFlashes(id, { preset, params, seconds: 3, settle: 0.5 });
        const p = await measurePatterns(id, { preset, params, seconds: 2 });
        const m = await measureMotion(id, { preset, params, seconds: 2, samples: 4 });
        console.log(
          `${id} ${preset ?? '-'}${params ? ' dose 0.7' : ''}: flash ${f.verdict} (cell ${f.peakCellFlashes}, red ${f.peakCellRedFlashes}, frame ${f.frameFlashes}, range ${f.frameLuminanceRange.toFixed(3)}) | pattern ${p.verdict} ${p.area.toFixed(3)} | motion rot ${m.rotation.toFixed(2)} zoom ${m.zoom.toFixed(3)} drift ${m.drift.toFixed(3)} (peak drift ${m.peak.drift.toFixed(3)}, inliers ${m.readings.map((r) => `${r.inliers}/${r.blocks}`).join(' ')})`,
        );
      }
    }
  }
});
