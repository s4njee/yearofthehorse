import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'display',
  title: 'Display over the river',
  epic: '3',
  tier: 'B',
  tags: ['fireworks', 'hero', 'japan'],
  summary:
    'A whole show over a river, after the hanabi taikai on the Sumida: every kind of shell in one programme, the smoke each break leaves drifting in the wind and lit from inside by later bursts, a far bank of dark buildings, and the river reflecting it all in streaks.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    pattern: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A 10-bit AV1 loop of the programme, or the poster.',
    useCases: ['A full-bleed hero for a festival', 'A summer festival page'],
  },
};
