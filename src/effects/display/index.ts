import { createRiver, finaleShells, RIVER_GROUND, RIVER_PARAMS } from '../../gpu/river/river.ts';
import { anyKind } from '../../gpu/shells/designs.ts';
import { createShow, SHOW_PARAMS } from '../../gpu/shells/show.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';

const PERIOD = 90;

export const effect = defineEffect({
  meta,
  wideGamut: true,
  params: {
    ...SHOW_PARAMS,
    sky: { type: 'number', default: 420, min: 260, max: 800, step: 10 },
    smoke: RIVER_PARAMS.smoke,
    wind: RIVER_PARAMS.wind,
    river: RIVER_PARAMS.river,
    /** The last stretch of the programme, with shells as close as the flash rule allows. */
    finale: { type: 'boolean', default: false },
    smokeScale: RIVER_PARAMS.smokeScale,
  },
  presets: {
    hanabi: {},
    finale: { finale: true },
    clear: { smoke: 0 },
    still: { wind: 0.5, smoke: 1.4 },
    photograph: { trails: 'camera', shutter: 2 },
  },

  async create(ctx) {
    const { params } = ctx;
    return createShow(ctx, {
      label: 'display',
      period: PERIOD,
      rate: [6, 20, 34],
      gap: 1.1,
      mix: [0.25, 0.45, 0.3],
      ground: RIVER_GROUND,
      keys: ['finale'],
      // A display's programme: every kind of shell (src/gpu/shells/designs.ts), drawn over the
      // river (src/gpu/river/river.ts).
      design: (shell, h) => anyKind(shell, h),
      extra: (list, period, values) => (values.finale ? finaleShells(list, period) : []),
      compose: (device, format) => createRiver(device, format, params),
    });
  },
});
