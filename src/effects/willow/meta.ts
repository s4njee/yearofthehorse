import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'willow',
  title: 'Willow and kamuro',
  epic: '3',
  tier: 'A',
  tags: ['fireworks', 'hero'],
  summary:
    'Gold willows and kamuro: heavy charcoal stars that burn for seconds and shed sparks that hang and fall, so each burst droops like a weeping willow. The slowest, calmest shell, and the one the motion check minds most, so it starts behind the gate.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    pattern: 'none',
    lightPage: 'no',
    // A fresh willow's growth reads as a zoom over the cap whenever the analyser can track it
    // (story 2.8): until the rules judge a burst's looming, it starts behind the gate.
    motionDefaults: true,
    features: { required: [] },
    fallback: 'A 10-bit AV1 loop, or the poster.',
    useCases: ['A slow, calm hero for a celebration', 'A summer festival page'],
  },
};
