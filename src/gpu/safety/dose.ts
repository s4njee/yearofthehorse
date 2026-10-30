import type { ParamSchema } from '../../effects/types.ts';

/*
 * The Hero's Journey's story 2.5: `dose`, the one intensity control every effect has.
 *
 * 0 is still and nearly plain; the default is calm enough to sit behind text; every analyser and
 * cap holds from 0 up to `STRONG_DOSE`, so the slider can be dragged that far unannounced; 1 is
 * the effect fully on. Each effect maps it onto its own amplitudes (warp
 * distance, saturation, symmetry order, trail length, rotation speed, pattern contrast) with
 * `dosed`, so turning one slider turns all of them together. A page can set it through the
 * library like any other parameter.
 *
 * Above `STRONG_DOSE` an effect may go over a cap. A preset that does starts behind the
 * click-to-start notice (story 2.6, `gate.ts`), as does any preset past `STRONG_DOSE`. A held
 * frame draws at `heldDose`, so the frame a paused page shows for minutes is calm.
 * `tests/dose.test.ts` checks every effect has the control at its default.
 */

export const DEFAULT_DOSE = 0.35;
/** Past this a preset may exceed a cap, and must be declared. */
export const STRONG_DOSE = 0.7;

/**
 * Spread into an effect's `params`, as `TAIL_PARAMS` is. Labelled "intensity" here: how many
 * shells, sparks and lights, and how bright and quick they are. The key stays `dose`, so the contract matches the other families.
 */
export const DOSE_PARAMS = {
  dose: { type: 'number', default: DEFAULT_DOSE, min: 0, max: 1, step: 0.01, label: 'intensity' },
} as const satisfies ParamSchema;

/**
 * A parameter at `dose`: `still` at 0, `calm` at the default, `full` at 1, linear between. The
 * default is pinned to `calm`, so an effect's tuned default never moves when its range does.
 */
export function dosed(dose: number, still: number, calm: number, full: number): number {
  const d = Math.min(1, Math.max(0, dose));
  if (d <= DEFAULT_DOSE) return still + (calm - still) * (d / DEFAULT_DOSE);
  return calm + (full - calm) * ((d - DEFAULT_DOSE) / (1 - DEFAULT_DOSE));
}

/**
 * The dose a held frame (`FrameTime.still`) should draw at: never above the default. A paused
 * effect shows one frame for as long as anyone looks, behind the start gate too (story 2.6).
 */
export function heldDose(dose: number): number {
  return Math.min(dose, DEFAULT_DOSE);
}
