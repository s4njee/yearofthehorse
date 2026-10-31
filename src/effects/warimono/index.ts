import { warimono } from '../../gpu/shells/designs.ts';
import { createShow, SHOW_PARAMS } from '../../gpu/shells/show.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';

export const effect = defineEffect({
  meta,
  wideGamut: true,
  params: {
    ...SHOW_PARAMS,
    /** The double-petalled yae-shin, stars that change colour (henka), or both. */
    kind: { type: 'select', default: 'mix', options: ['mix', 'yae', 'henka'] },
  },
  presets: {
    yae: { kind: 'yae' },
    henka: { kind: 'henka' },
    quiet: { dose: 0.12 },
  },

  async create(ctx) {
    return createShow(ctx, {
      label: 'warimono',
      rate: [4, 14, 24],
      gap: 1.6,
      mix: [0.1, 0.5, 0.4],
      keys: ['kind'],
      design: (shell, h, _i, params) =>
        warimono(shell, h, params.kind === 'yae' || (params.kind === 'mix' && h(1) < 0.5)),
    });
  },
});
