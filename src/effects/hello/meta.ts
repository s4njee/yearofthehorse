import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'hello',
  title: 'Hello',
  epic: '1',
  tier: 'A',
  tags: ['scaffold', 'fireworks'],
  summary:
    'The smallest effect: shells rising and breaking into peonies and gold chrysanthemums, every star on a closed-form path under drag and gravity, coloured by its metal salt, one instanced draw through the HDR tail. Every later effect starts from this shape.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    pattern: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'The poster.',
    useCases: ['The template for new effects'],
  },
};
