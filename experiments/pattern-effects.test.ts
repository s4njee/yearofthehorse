import { it, vi } from 'vitest';
import { loadEffect, listEffects } from '../src/effects/registry.ts';
import { measurePatterns } from '../tests/pattern.ts';

vi.setConfig({ testTimeout: 600_000 });

// Scratch: every effect and preset through the pattern analyser, with the counted regions.
it('sweep', async () => {
  for (const meta of listEffects()) {
    const effect = await loadEffect(meta.id);
    for (const preset of [undefined, ...Object.keys(effect.presets ?? {})]) {
      for (const dose of [undefined, 0.7, 1]) {
        const r = await measurePatterns(meta.id, {
          preset,
          seconds: 2,
          params: dose === undefined ? undefined : { dose },
        });
        const counted = r.regions.filter((g) => g.counted);
        console.log(
          `${meta.id} ${preset ?? '-'} dose=${dose ?? 'preset'}: ${r.verdict} field ${r.area.toFixed(3)} frame ${r.frameArea.toFixed(3)} moving ${r.moving} ` +
            counted
              .slice(0, 3)
              .map(
                (g) =>
                  `${g.domain}${g.scale} a${g.area.toFixed(3)} pairs${g.pairs.toFixed(1)} step${g.step.toFixed(2)} reg${g.regularity.toFixed(2)} n${g.windows}`,
              )
              .join(' | '),
        );
      }
    }
  }
});
