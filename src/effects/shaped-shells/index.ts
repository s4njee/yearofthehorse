import { shaped } from '../../gpu/shells/designs.ts';
import { shapePoints, SHAPES, type ShapeName } from '../../gpu/shells/shapes.ts';
import { createShow, SHOW_PARAMS } from '../../gpu/shells/show.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';

const NAMES = Object.keys(SHAPES) as ShapeName[];
/** Stars in a shaped shell: one at each point of its outline. */
const POINTS = 96;

export const effect = defineEffect({
  meta,
  wideGamut: true,
  params: {
    ...SHOW_PARAMS,
    shape: { type: 'select', default: 'mix', options: ['mix', ...NAMES, 'path'] },
    /** SVG path data for `shape: path`, in any box. */
    path: { type: 'text', default: SHAPES.heart, maxLength: 600 },
    /**
     * How strongly the shells face the viewer: 0 is a real shell, which breaks at whatever
     * angle it tumbled to; 1 always faces, as no real shell can.
     */
    facing: { type: 'number', default: 0, min: 0, max: 1, step: 0.05 },
  },
  presets: {
    hearts: { shape: 'heart' },
    horses: { shape: 'horse' },
    staged: { facing: 0.85 },
    quiet: { dose: 0.12 },
  },

  async create(ctx) {
    const { params } = ctx;
    const shapes = [...NAMES.map((n) => shapePoints(SHAPES[n], POINTS))];
    // The page's own path is the last shape. Read once: a new path needs the effect remounted.
    shapes.push(shapePoints(params.path || SHAPES.heart, POINTS));
    return createShow(ctx, {
      label: 'shaped-shells',
      rate: [5, 14, 24],
      gap: 1.6,
      mix: [0.1, 0.6, 0.3],
      shapes,
      keys: ['shape', 'facing'],
      design(shell, h, _i, values) {
        const index =
          values.shape === 'mix'
            ? Math.floor(h(1) * NAMES.length)
            : values.shape === 'path'
              ? NAMES.length
              : NAMES.indexOf(values.shape as ShapeName);
        return shaped(shell, h, index, values.facing, POINTS);
      },
    });
  },
});
