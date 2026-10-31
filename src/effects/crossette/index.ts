import { crossette } from '../../gpu/shells/designs.ts';
import { createShow, SHOW_PARAMS } from '../../gpu/shells/show.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';

export const effect = defineEffect({
  meta,
  wideGamut: true,
  params: {
    ...SHOW_PARAMS,
    /** When the stars split, as a share of their burn. */
    split: { type: 'number', default: 0.45, min: 0.2, max: 0.8, step: 0.05 },
  },
  presets: {
    crossettes: {},
    early: { split: 0.25 },
    quiet: { dose: 0.12 },
  },

  async create(ctx) {
    return createShow(ctx, {
      label: 'crossette',
      rate: [5, 16, 28],
      gap: 1.2,
      keys: ['split'],
      design: (shell, h, _i, params) => crossette(shell, h, params.split),
    });
  },
});
