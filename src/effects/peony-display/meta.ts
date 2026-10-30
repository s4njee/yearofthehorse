import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'peony-display',
  title: 'Peony display',
  epic: '3',
  tier: 'A',
  tags: ['fireworks', 'hero'],
  summary:
    'A drop-in fireworks display behind a hero: peonies, pistils and gold chrysanthemums from a looping programme of shells, every star a burning sphere slowed by the air, placed from a table of its flight, and coloured from its composition’s emission spectrum, in Display P3 where the screen has it.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    pattern: 'none',
    lightPage: 'no',
    motionPresets: ['close'],
    features: { required: [] },
    fallback: 'A 10-bit AV1 loop of the programme, or the poster.',
    useCases: ['A dark hero for a celebration or an event', 'New Year and festival pages'],
  },
};
