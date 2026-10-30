import type { EffectMeta } from '../../effects/types.ts';
import { STRONG_DOSE } from './dose.ts';

/*
 * The Hero's Journey's story 2.6: which settings start behind the click-to-start notice, and what it says.
 *
 * A visitor should choose an intense image, not land on one. A preset starts paused behind the
 * notice when its scorecard declares it over a limit (flashes, a regular pattern, whole-field
 * motion), or when it sets `dose` past the strong end. The rule is about settings someone else
 * chose: a link, or a preset whose look the visitor has not seen. Dragging the `dose` slider is
 * the visitor's own choice and is not gated; every analyser and cap holds up to `STRONG_DOSE`
 * anyway, so the slider cannot go over a limit unannounced until it passes that point.
 * Pure, so the shell, the library and the tests agree on it.
 */

export type GateReason = 'flash' | 'pattern' | 'motion' | 'dose';

/** Why these settings are gated, in a fixed order; empty when they are not. */
export function gateReasons(
  meta: EffectMeta,
  preset: string | undefined,
  values: Readonly<Record<string, unknown>>,
): GateReason[] {
  const card = meta.scorecard;
  const named = (list: readonly string[] | undefined) =>
    preset !== undefined && (list ?? []).includes(preset);
  const reasons: GateReason[] = [];
  if (named(card?.flashPresets)) reasons.push('flash');
  if (named(card?.patternPresets)) reasons.push('pattern');
  if (named(card?.motionPresets)) reasons.push('motion');
  if (typeof values.dose === 'number' && values.dose > STRONG_DOSE) reasons.push('dose');
  return reasons;
}

const EXPECT: Record<GateReason, string> = {
  flash: 'it flashes more than three times a second over a large area',
  pattern: 'it fills much of the view with a high-contrast regular pattern',
  motion: 'the whole view turns, zooms or drifts faster than this site’s usual limits',
  dose: 'it is set to full intensity: saturated colour and faster movement',
};

/** The notice's text: what to expect, in plain words. */
export function gateNotice(reasons: readonly GateReason[]): string {
  const parts = reasons.map((reason) => EXPECT[reason]);
  const list =
    parts.length <= 1
      ? (parts[0] ?? '')
      : `${parts.slice(0, -1).join('; ')}; and ${parts[parts.length - 1]}`;
  return `This setting is stronger than the rest of the site: ${list}. It stays paused until you start it.`;
}

/** The key a choice is remembered under: one effect, one preset (or the strong dose). */
export function gateKey(id: string, preset: string | undefined): string {
  return `yh-gate:${id}:${preset ?? 'strong-dose'}`;
}
