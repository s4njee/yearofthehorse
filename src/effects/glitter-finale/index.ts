import { unsteady } from '../../gpu/shells/designs.ts';
import { createShow, SHOW_PARAMS } from '../../gpu/shells/show.ts';
import type { Special } from '../../gpu/shells/shell.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';

const KINDS = ['glitter', 'crackle', 'strobe'] as const satisfies readonly Special[];

export const effect = defineEffect({
  meta,
  wideGamut: true,
  params: {
    ...SHOW_PARAMS,
    kind: { type: 'select', default: 'mix', options: ['mix', ...KINDS] },
    /** Blinks a second of a strobe star. Real strobes blink at 5 to 15. */
    strobe: { type: 'number', default: 4, min: 1, max: 15, step: 0.5, label: 'strobe (Hz)' },
  },
  presets: {
    glitter: { kind: 'glitter' },
    crackle: { kind: 'crackle' },
    strobe: { kind: 'strobe' },
    'full-strobe': { kind: 'strobe', strobe: 12, dose: 0.7 },
  },

  async create(ctx) {
    return createShow(ctx, {
      label: 'glitter-finale',
      rate: [5, 14, 26],
      gap: 1.2,
      keys: ['kind', 'strobe'],
      design: (shell, h, _i, params) =>
        unsteady(
          shell,
          h,
          params.kind === 'mix'
            ? KINDS[Math.floor(h(1) * KINDS.length)]!
            : (params.kind as Special),
          params.strobe,
        ),
    });
  },
});
