import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'warimono',
  title: 'Warimono',
  epic: '3',
  tier: 'A',
  tags: ['fireworks', 'hero', 'japan'],
  summary:
    'The Japanese round shell: a near-perfect sphere of densely packed stars, the double-petalled yae-shin with a pistil of another colour, and stars that change colour as they burn (henka).',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    pattern: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A 10-bit AV1 loop, or the poster.',
    useCases: ['A summer festival (hanabi taikai) page', 'A hero for a Japanese event'],
  },
};
