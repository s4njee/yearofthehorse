import { describe, expect, it } from 'vitest';
import { listEffects } from '../src/effects/registry.ts';
import type { EffectMeta } from '../src/effects/types.ts';
import { gateKey, gateNotice, gateReasons } from '../src/gpu/safety/gate.ts';

// Story 2.6: which settings start behind the click-to-start notice.

const meta: EffectMeta = {
  id: 'test',
  title: 'Test',
  epic: '2',
  tier: 'A',
  tags: [],
  scorecard: {
    compute: false,
    mobile: 'untested',
    fallback: '',
    useCases: [],
    flashPresets: ['strobe-ish'],
    patternPresets: ['stripes', 'strobe-ish'],
    motionPresets: ['spin'],
  },
};

describe('gateReasons', () => {
  it('gates declared presets, for each reason they are declared under', () => {
    expect(gateReasons(meta, 'stripes', {})).toEqual(['pattern']);
    expect(gateReasons(meta, 'strobe-ish', {})).toEqual(['flash', 'pattern']);
    expect(gateReasons(meta, 'spin', { dose: 0.35 })).toEqual(['motion']);
  });

  it('gates a strong dose, from a preset or a link, and nothing calm', () => {
    expect(gateReasons(meta, undefined, { dose: 0.9 })).toEqual(['dose']);
    expect(gateReasons(meta, 'calm', { dose: 0.7 })).toEqual([]);
    expect(gateReasons(meta, undefined, {})).toEqual([]);
  });

  it('says what to expect, in plain words', () => {
    expect(gateNotice(['motion'])).toMatch(/turns, zooms or drifts/);
    expect(gateNotice(['flash', 'dose'])).toMatch(/three times a second.*; and .*full intensity/);
    expect(gateKey('meadow', undefined)).toBe('yh-gate:meadow:strong-dose');
  });

  it.each(listEffects().map((m) => [m.id, m] as const))(
    '%s gates every preset it declares over a limit',
    (_id, m) => {
      const card = m.scorecard;
      for (const name of [
        ...(card?.flashPresets ?? []),
        ...(card?.patternPresets ?? []),
        ...(card?.motionPresets ?? []),
      ]) {
        expect(gateReasons(m, name, {}).length).toBeGreaterThan(0);
      }
    },
  );
});
