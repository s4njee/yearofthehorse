import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'shaped-shells',
  title: 'Shaped shells',
  epic: '3',
  tier: 'A',
  tags: ['fireworks', 'hero'],
  summary:
    'Hearts, stars, smiles and a horse’s head as flat patterns of stars, or the page’s own SVG path, each seen at the angle its shell happened to break at: most come out skewed, as real ones do.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    pattern: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A 10-bit AV1 loop, or the poster.',
    useCases: ['A playful hero for a celebration', 'A brand’s mark in the sky, honestly skewed'],
  },
};
