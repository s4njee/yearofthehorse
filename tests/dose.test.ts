import { describe, expect, it } from 'vitest';
import { loaders } from '../src/effects/registry.generated.ts';
import { DEFAULT_DOSE, dosed, heldDose, STRONG_DOSE } from '../src/gpu/safety/dose.ts';
import { gateReasons } from '../src/gpu/safety/gate.ts';

// Story 2.5: every effect has the one shared intensity control, at the shared default.

describe('dose', () => {
  it('maps still, calm and full onto 0, the default and 1', () => {
    expect(dosed(0, 2, 5, 11)).toBe(2);
    expect(dosed(DEFAULT_DOSE, 2, 5, 11)).toBe(5);
    expect(dosed(1, 2, 5, 11)).toBe(11);
    expect(dosed(-1, 2, 5, 11)).toBe(2);
    expect(dosed(2, 2, 5, 11)).toBe(11);
    expect(heldDose(0.9)).toBe(DEFAULT_DOSE);
    expect(heldDose(0.1)).toBe(0.1);
    // Monotonic when the three are.
    let last = -Infinity;
    for (let d = 0; d <= 1; d += 0.01) {
      const v = dosed(d, 0, 0.3, 1);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });

  it.each(Object.keys(loaders))('%s has the dose control at the shared default', async (id) => {
    const module = await loaders[id]!();
    const dose = module.params.dose;
    expect(dose, `${id} spreads DOSE_PARAMS`).toEqual({
      type: 'number',
      default: DEFAULT_DOSE,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'intensity',
    });
    // A preset past the strong dose starts behind the gate (story 2.6).
    for (const [name, preset] of Object.entries(module.presets ?? {})) {
      const value = (preset as { dose?: number }).dose ?? DEFAULT_DOSE;
      if (value > STRONG_DOSE) {
        expect(gateReasons(module.meta, name, { dose: value }), `${id} "${name}"`).toContain(
          'dose',
        );
      }
    }
  });
});
