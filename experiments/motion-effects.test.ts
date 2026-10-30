import { it, vi } from 'vitest';
import { loadEffect, listEffects } from '../src/effects/registry.ts';
import { measureMotion } from '../tests/motion.ts';

vi.setConfig({ testTimeout: 600_000 });

// Scratch: every effect and preset's whole-field motion, at the preset's dose and at 0.7 and 1.
it('sweep', async () => {
  for (const meta of listEffects()) {
    const effect = await loadEffect(meta.id);
    for (const preset of [undefined, ...Object.keys(effect.presets ?? {})]) {
      for (const dose of [undefined, 0.7, 1]) {
        const r = await measureMotion(meta.id, {
          preset,
          params: dose === undefined ? undefined : { dose },
        });
        console.log(
          `${meta.id} ${preset ?? '-'} dose=${dose ?? 'preset'}: rot ${r.rotation.toFixed(2)}°/s zoom ${r.zoom.toFixed(3)} drift ${r.drift.toFixed(3)} | peak rot ${r.peak.rotation.toFixed(2)} zoom ${r.peak.zoom.toFixed(3)} drift ${r.peak.drift.toFixed(3)} | blocks ${r.readings.map((x) => `${x.inliers}/${x.blocks}`).join(' ')}`,
        );
      }
    }
  }
});
