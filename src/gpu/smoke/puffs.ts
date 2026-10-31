import { burnOf, starOf, type Shell } from '../shells/shell.ts';
import { burstRadius, STAR_KINDS, starTable, type StarKind } from '../shells/star.ts';

/*
 * Story 2.6: the smoke a display leaves, as puffs with no state.
 *
 * Each break leaves a puff: the burst charge's smoke and the smoke its stars leave along their
 * paths, filling the burst as the stars spread. The puff then drifts with the wind, rises a little
 * as it cools and spreads, and thins over a minute or so. Every puff is a pure function of its
 * shell and the time, as the stars are, so a display with smoke can still be paused, resized,
 * held and scrubbed. The shader adds texture (fractal noise in the puff's own frame) and lights
 * the smoke from the bursts burning in it.
 *
 * This replaces the plan's first idea, Fire Temple's 2D fluid: a fluid keeps state, so its held
 * frame and a scrubbed display would need a minute of simulation to reach, and on a still night a
 * display's smoke mostly drifts and spreads, which a puff does.
 */

export interface SmokeOptions {
  /** Wind across the view, metres a second (positive to the right). */
  wind: number;
  /** Seconds for a puff to thin to a third. */
  life: number;
  /** How much smoke a break leaves, as optical depth at the centre of a fresh puff. */
  amount: number;
}

export const SMOKE_DEFAULTS: SmokeOptions = { wind: 2, life: 45, amount: 0.9 };

const radii = new Map<StarKind, number>();
/** A star kind's burst radius, metres. */
export function radiusOf(kind: StarKind): number {
  let r = radii.get(kind);
  if (r === undefined) {
    r = burstRadius(starTable(STAR_KINDS[kind]));
    radii.set(kind, r);
  }
  return r;
}

/** Floats per puff (two vec4s) and per light (two vec4s). */
export const PUFF_FLOATS = 8;
export const LIGHT_FLOATS = 8;

/**
 * The puffs of the shells that broke in the last `options.life * 2.5` seconds, at `time`, for a
 * programme repeating every `period`, packed for the shader: centre, radius, optical depth, then
 * a seed and the puff's age. Returns how many were packed.
 */
export function packPuffs(
  list: readonly Shell[],
  time: number,
  period: number,
  options: SmokeOptions,
  out: Float32Array,
): number {
  const t = ((time % period) + period) % period;
  const reach = options.life * 2.5;
  const puffs: { age: number; values: number[] }[] = [];
  for (const s of list) {
    for (const shift of [-2 * period, -period, 0, period]) {
      const age = t - (s.launch + s.rise + shift);
      if (age < 0 || age > reach) continue;
      const burn = burnOf(s);
      const full = radiusOf(starOf(s));
      // The puff fills the burst as the stars spread, then spreads on, slowly.
      const grown = Math.sqrt(Math.min(1, age / burn));
      const radius = full * (0.25 + 0.5 * grown) + 1.5 * Math.sqrt(age);
      // The smoke is the same; spread over a wider puff it is thinner, and it thins as it goes.
      const mass = options.amount * (0.5 + s.stars / 200);
      const depth = ((mass * (full * 0.75) ** 2) / radius ** 2) * Math.exp(-age / options.life);
      puffs.push({
        age,
        values: [
          s.x + options.wind * age,
          s.height + 0.4 * age,
          radius,
          depth * Math.min(1, age / 0.3),
          s.seed,
          age,
          0,
          0,
        ],
      });
    }
  }
  // The freshest first, so a full table drops the faintest.
  puffs.sort((a, b) => a.age - b.age);
  const n = Math.min(puffs.length, Math.floor(out.length / PUFF_FLOATS));
  for (let i = 0; i < n; i++) out.set(puffs[i]!.values, i * PUFF_FLOATS);
  return n;
}

/**
 * The bursts lighting the smoke at `time`: shells in the air with stars burning. Each is a light
 * at the burst's centre, as wide as the burst is then, as bright as its stars, in their colour.
 */
export function packLights(
  active: readonly Shell[],
  colours: ReadonlyMap<string, readonly number[]>,
  out: Float32Array,
): number {
  let n = 0;
  for (const s of active) {
    if (n * LIGHT_FLOATS >= out.length) break;
    const since = -s.launch - s.rise;
    const burn = burnOf(s);
    if (since < 0 || since > burn) continue;
    const c = colours.get(s.colour) ?? [1, 1, 1];
    const envelope =
      Math.min(1, since / 0.2) * (1 - Math.max(0, (since - 0.75 * burn) / (0.25 * burn)));
    const radius = radiusOf(starOf(s)) * (0.3 + 0.7 * Math.sqrt(Math.min(1, since / burn)));
    out.set(
      [s.x, s.height, radius, envelope * (s.stars / 100), c[0]!, c[1]!, c[2]!, 0],
      n * LIGHT_FLOATS,
    );
    n++;
  }
  return n;
}
