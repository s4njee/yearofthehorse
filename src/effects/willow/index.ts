import { willow } from '../../gpu/shells/designs.ts';
import { createShow, SHOW_PARAMS } from '../../gpu/shells/show.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';

export const effect = defineEffect({
  meta,
  wideGamut: true,
  params: {
    ...SHOW_PARAMS,
    sky: { type: 'number', default: 340, min: 220, max: 800, step: 10 },
    /** A willow's long drooping tails, a kamuro's denser crown, or both. */
    kind: { type: 'select', default: 'mix', options: ['mix', 'willow', 'kamuro'] },
    // No camera exposure: a long exposure of willows is a grating of parallel arcs (pattern
    // `high`, see notes.md), so the eye's trails are the only ones offered.
    trails: { type: 'select', default: 'eye', options: ['eye'] },
  },
  presets: {
    willow: { kind: 'willow' },
    kamuro: { kind: 'kamuro' },
    quiet: { dose: 0.12 },
  },

  async create(ctx) {
    return createShow(ctx, {
      label: 'willow',
      // Willows are slow: each hangs for seconds, and a show gives them room.
      rate: [4, 12, 16],
      gap: 2,
      mix: [0.2, 0.5, 0.3],
      keys: ['kind'],
      design: (shell, h, _i, params) =>
        willow(shell, params.kind === 'kamuro' || (params.kind === 'mix' && h(1) < 0.4)),
    });
  },
});
