import { palm, ring } from '../../gpu/shells/designs.ts';
import { createShow, SHOW_PARAMS } from '../../gpu/shells/show.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';

export const effect = defineEffect({
  meta,
  wideGamut: true,
  params: {
    ...SHOW_PARAMS,
    kind: { type: 'select', default: 'mix', options: ['mix', 'palm', 'ring'] },
  },
  presets: {
    palms: { kind: 'palm' },
    rings: { kind: 'ring' },
    quiet: { dose: 0.12 },
  },

  async create(ctx) {
    return createShow(ctx, {
      label: 'palm-and-ring',
      rate: [5, 16, 28],
      gap: 1.2,
      keys: ['kind'],
      design: (shell, h, _i, params) =>
        params.kind === 'palm' || (params.kind === 'mix' && h(1) < 0.45)
          ? palm(shell, h)
          : ring(shell, h),
    });
  },
});
