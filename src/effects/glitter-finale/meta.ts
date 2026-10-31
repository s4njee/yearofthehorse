import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'glitter-finale',
  title: 'Glitter, crackle and strobe',
  epic: '3',
  tier: 'A',
  tags: ['fireworks', 'hero'],
  summary:
    'The stars that are not steady: glitter sheds sparks that each flash once after a delay, crackle bursts into microstars with a pop, strobe blinks. Held under the flash rule, with a full-rate strobe as a gated preset.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    // Measured `low`: the analyser cannot see sparkle (notes.md), so the full-rate strobe the plan
    // asks to gate is declared anyway and starts behind the gate.
    flashPresets: ['full-strobe'],
    pattern: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A 10-bit AV1 loop, or the poster.',
    useCases: ['The end of a show', 'A New Year countdown'],
  },
};
