import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'palm-and-ring',
  title: 'Palms and rings',
  epic: '3',
  tier: 'A',
  tags: ['fireworks', 'hero'],
  summary:
    'Palms, a thick rising trunk and a few big comets shedding gold, and rings, stars round a circle in a plane at whatever tilt the shell broke at, so each is seen as an ellipse.',
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
