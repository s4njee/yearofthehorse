import { createShow, SHOW_PARAMS } from '../../gpu/shells/show.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';

export const effect = defineEffect({
  meta,
  wideGamut: true,
  params: {
    ...SHOW_PARAMS,
    sky: { type: 'number', default: 360, min: 220, max: 800, step: 10 },
  },
  presets: {
    display: {},
    quiet: { dose: 0.12 },
    close: { sky: 270 },
    distant: { sky: 640 },
  },

  async create(ctx) {
    // Shells a minute from the dose: 6 held, 24 at the default, 40 at full.
    return createShow(ctx, { label: 'peony-display', rate: [6, 24, 40] });
  },
});
