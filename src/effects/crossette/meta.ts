import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'crossette',
  title: 'Crossette',
  epic: '3',
  tier: 'A',
  tags: ['fireworks', 'hero'],
  summary:
    'Stars that split in four part way out, each split a small cross, so the burst branches. Still a pure function of time: each piece starts where its star split, at its velocity then plus a kick.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    pattern: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A 10-bit AV1 loop, or the poster.',
    useCases: ['A hero for a celebration or an event'],
  },
};
