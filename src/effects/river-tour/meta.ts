import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'river-tour',
  title: 'A tour over the river',
  epic: '3',
  tier: 'B',
  tags: ['fireworks', 'hero', 'japan', 'demo'],
  summary:
    'The display over the river as a guided show: every kind of shell the family draws gets an act of its own, named as it starts (peonies, chrysanthemums, warimono, yae-shin, rings, palms, willows, kamuro, crossettes, glitter, crackle, strobes, shaped shells), then all of them together, then the finale.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    pattern: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A 10-bit AV1 loop of the programme, or the poster.',
    useCases: ['A demo of the family', 'A festival page that explains its fireworks'],
  },
};
