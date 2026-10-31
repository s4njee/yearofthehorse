import { shapePoints, SHAPES, type ShapeName } from '../../gpu/shells/shapes.ts';
import { createShow, SHOW_PARAMS } from '../../gpu/shells/show.ts';
import { PEONY_COLOURS } from '../../gpu/shells/shell.ts';
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
        // The shell's plane: its normal uniform on the sphere (a tumbling shell), pulled towards
        // the viewer (+z) by `facing`.
        const z = 2 * h(2) - 1;
        const r = Math.sqrt(1 - z * z);
        const random = [r * Math.cos(2 * Math.PI * h(3)), r * Math.sin(2 * Math.PI * h(3)), z];
        const f = values.facing;
        const n = random.map((c, k) => (1 - f) * c + f * (k === 2 ? 1 : 0));
        const len = Math.hypot(...n) || 1;
        return {
          ...shell,
          pattern: 'shape',
          shape: index,
          normal: [n[0]! / len, n[1]! / len, n[2]! / len],
          stars: POINTS,
          colour: PEONY_COLOURS[Math.floor(h(4) * PEONY_COLOURS.length)]!,
          pistil: undefined,
          trail: 0,
          sparks: 0,
        };
      },
    });
  },
});
