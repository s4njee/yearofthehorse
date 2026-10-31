/*
 * Story 2.1: the star model.
 *
 * A star is a small sphere of composition, burning from the outside in, thrown from the break at
 * the shell's burst speed. The air's drag on it is quadratic at these speeds (a centimetre-sized
 * sphere at tens of metres a second is at a Reynolds number in the tens of thousands, drag
 * coefficient about 0.47), and as it burns its mass falls faster than its cross-section, so the
 * air slows it harder the longer it burns. It never quite stops spreading before it burns out, and
 * it falls at the speed where drag holds its shrinking weight.
 *
 * `integrateStar` is the reference: small steps of that model. `starTable` tabulates one star
 * class's flight once, on the CPU, by launch elevation and time; a shader then places any star of
 * the class at any time from four table reads, with no state (`placeStar`), so stars stay a pure
 * function of time as `hello`'s closed form is. tests/star.test.ts measures both against the
 * reference. Metres, seconds, y up.
 */

export interface StarClass {
  /** Star radius when lit, metres. */
  radius: number;
  /** Density of the composition, kg/m^3. */
  density: number;
  /** How fast the burning surface moves inwards, metres a second. */
  burnRate: number;
  /** Speed at the break, metres a second. */
  speed: number;
  /** Drag coefficient of a sphere. Default 0.47. */
  drag?: number;
}

const AIR = 1.2;
const G = 9.81;

/** Seconds until the star has burnt out. */
export const burnTime = (c: StarClass) => c.radius / c.burnRate;

export interface StarState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * The star's state at each of `times` (ascending, seconds), thrown in direction (dx, dy) (a unit
 * vector, y up) from the origin, by semi-implicit steps of `dt`: one integration for the lot.
 */
export function flight(
  c: StarClass,
  dx: number,
  dy: number,
  times: readonly number[],
  dt = 1e-4,
): StarState[] {
  const cd = c.drag ?? 0.47;
  const s: StarState = { x: 0, y: 0, vx: dx * c.speed, vy: dy * c.speed };
  const out: StarState[] = [];
  let i = 0;
  for (const t of times) {
    const steps = Math.round(t / dt);
    for (; i < steps; i++) {
      const r = Math.max(c.radius - c.burnRate * i * dt, c.radius * 0.02);
      // Drag force over mass: (½ ρ Cd π r²) / (4/3 π r³ ρs) = 3 ρ Cd / (8 r ρs).
      const k = (3 * AIR * cd) / (8 * r * c.density);
      const v = Math.hypot(s.vx, s.vy);
      s.vx -= k * v * s.vx * dt;
      s.vy -= (G + k * v * s.vy) * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    out.push({ ...s });
  }
  return out;
}

/**
 * `flight` by classical Runge-Kutta steps of `dt`, for tables: at 20 ms steps it places stars as
 * close to the reference (0.1 ms steps) as the tables can use, and every kind's table for every speed
 * and angle takes about 35 ms instead of seconds.
 */
export function flightRk4(
  c: StarClass,
  dx: number,
  dy: number,
  times: readonly number[],
  dt = 2e-2,
): StarState[] {
  const cd = c.drag ?? 0.47;
  const accel = (t: number, vx: number, vy: number) => {
    const r = Math.max(c.radius - c.burnRate * t, c.radius * 0.02);
    const k = (3 * AIR * cd) / (8 * r * c.density);
    const v = Math.hypot(vx, vy);
    return [-k * v * vx, -G - k * v * vy] as const;
  };
  let [x, y, vx, vy, t] = [0, 0, dx * c.speed, dy * c.speed, 0];
  const out: StarState[] = [];
  for (const target of times) {
    while (t < target - 1e-12) {
      const h = Math.min(dt, target - t);
      const [a1x, a1y] = accel(t, vx, vy);
      const [a2x, a2y] = accel(t + h / 2, vx + (h / 2) * a1x, vy + (h / 2) * a1y);
      const [a3x, a3y] = accel(t + h / 2, vx + (h / 2) * a2x, vy + (h / 2) * a2y);
      const [a4x, a4y] = accel(t + h, vx + h * a3x, vy + h * a3y);
      x += (h / 6) * (vx + 2 * (vx + (h / 2) * a1x) + 2 * (vx + (h / 2) * a2x) + (vx + h * a3x));
      y += (h / 6) * (vy + 2 * (vy + (h / 2) * a1y) + 2 * (vy + (h / 2) * a2y) + (vy + h * a3y));
      vx += (h / 6) * (a1x + 2 * a2x + 2 * a3x + a4x);
      vy += (h / 6) * (a1y + 2 * a2y + 2 * a3y + a4y);
      t += h;
    }
    out.push({ x, y, vx, vy });
  }
  return out;
}

/** The star's position after `t` seconds, as `flight` gives it. */
export const integrateStar = (c: StarClass, dx: number, dy: number, t: number, dt = 1e-4) =>
  flight(c, dx, dy, [t], dt)[0]!;

/**
 * Launch speeds tabulated, as shares of the kind's own: a pistil, a second petal, a crossette's
 * pieces and a shape's inner stars leave slower than the kind's speed, a canister's fastest a
 * little faster. A slower star is not the same flight seen earlier: gravity and the burn do not
 * scale with speed, and placing one at a scaled time missed by up to 41% of its own travel.
 */
export const TABLE_SPEEDS = [0.1, 0.15, 0.22, 0.32, 0.45, 0.6, 0.8, 1, 1.22, 1.5] as const;

export interface StarTable {
  /** Seconds between time samples. */
  step: number;
  /** Time samples per angle. */
  samples: number;
  /** Launch angles sampled, from straight down to straight up, evenly. */
  angles: number;
  /** Launch speeds sampled, as shares of the kind's speed (`TABLE_SPEEDS`). */
  speeds: readonly number[];
  /**
   * Position in the star's own frame, for each speed, then each angle, then each time (speeds ×
   * angles × samples × 2): the distance along its launch direction, and across it (positive
   * anticlockwise of the direction).
   */
  xy: Float32Array;
}

/**
 * One kind's flight from the break to burn-out, for stars thrown at each of `speeds` and at
 * `angles` elevations (odd, so sideways is one of them) from straight down to straight up (to one
 * side; the other side is its mirror), each sampled `samples` times. Gravity speeds a star thrown
 * downward and slows one thrown upward, so the angle matters: a single sideways flight placed
 * along each direction misses by 5 to 7% of the burst's radius.
 */
export function starTable(
  c: StarClass,
  samples = 48,
  angles = 17,
  speeds: readonly number[] = TABLE_SPEEDS,
): StarTable {
  const key = `${c.radius}:${c.density}:${c.burnRate}:${c.speed}:${c.drag}:${samples}:${angles}:${speeds}`;
  const known = tables.get(key);
  if (known) return known;
  const step = burnTime(c) / (samples - 1);
  const times = Array.from({ length: samples }, (_, i) => i * step);
  const xy = new Float32Array(speeds.length * angles * samples * 2);
  speeds.forEach((share, v) => {
    const thrown = { ...c, speed: c.speed * share };
    for (let a = 0; a < angles; a++) {
      const elevation = -Math.PI / 2 + (Math.PI * a) / (angles - 1);
      const dx = Math.cos(elevation);
      const dy = Math.sin(elevation);
      flightRk4(thrown, dx, dy, times).forEach((s, i) => {
        const o = ((v * angles + a) * samples + i) * 2;
        xy[o] = s.x * dx + s.y * dy;
        xy[o + 1] = -s.x * dy + s.y * dx;
      });
    }
  });
  const table = { step, samples, angles, speeds, xy };
  tables.set(key, table);
  return table;
}

/** Tables already made: every effect on a page shares them. */
const tables = new Map<string, StarTable>();

/** Where `share` falls among the table's speeds: the lower index and the fraction to the next, in log speed. */
export function speedIndex(speeds: readonly number[], share: number) {
  const u = Math.log(Math.max(share, speeds[0]!));
  for (let i = 0; i < speeds.length - 2; i++) {
    if (u < Math.log(speeds[i + 1]!)) {
      return {
        i,
        f: (u - Math.log(speeds[i]!)) / (Math.log(speeds[i + 1]!) - Math.log(speeds[i]!)),
      };
    }
  }
  const i = speeds.length - 2;
  return {
    i,
    f: Math.min(1, (u - Math.log(speeds[i]!)) / (Math.log(speeds[i + 1]!) - Math.log(speeds[i]!))),
  };
}

/**
 * A star of the table's kind thrown in direction (dx, dy) at `share` of the kind's speed, `t`
 * seconds after the break: interpolated in speed, elevation and time, and mirrored for stars
 * thrown to the left. What a shader does.
 */
export function placeStar(table: StarTable, dx: number, dy: number, t: number, share = 1) {
  const elevation = Math.asin(Math.min(1, Math.max(-1, dy)));
  const ua = ((elevation + Math.PI / 2) / Math.PI) * (table.angles - 1);
  const a0 = Math.min(Math.floor(ua), table.angles - 2);
  const fa = ua - a0;
  const ut = Math.min(Math.max(t / table.step, 0), table.samples - 1);
  const i0 = Math.min(Math.floor(ut), table.samples - 2);
  const ft = ut - i0;
  const sp = speedIndex(table.speeds, share);
  const at = (v: number, a: number, i: number, k: number) =>
    table.xy[((v * table.angles + a) * table.samples + i) * 2 + k]!;
  const bilinear = (v: number, k: number) => {
    const lo = at(v, a0, i0, k) + ft * (at(v, a0, i0 + 1, k) - at(v, a0, i0, k));
    const hi = at(v, a0 + 1, i0, k) + ft * (at(v, a0 + 1, i0 + 1, k) - at(v, a0 + 1, i0, k));
    return lo + fa * (hi - lo);
  };
  const lerp = (k: number) =>
    bilinear(sp.i, k) + sp.f * (bilinear(sp.i + 1, k) - bilinear(sp.i, k));
  // Rebuilt along the star's own direction, so interpolating between angles does not cut the
  // chord (which cost 1.9% of the radius at 22.5° steps). A star thrown left is the mirror of one
  // thrown right: its across component turns the other way.
  const side = Math.sign(dx || 1);
  const ex = side * Math.sqrt(Math.max(0, 1 - dy * dy));
  const along = lerp(0);
  const across = lerp(1) * side;
  return { x: ex * along - dy * across, y: dy * along + ex * across };
}

/** The burst's radius: how far a star thrown sideways gets before it burns out. */
export const burstRadius = (table: StarTable) =>
  placeStar(table, 1, 0, (table.samples - 1) * table.step).x;

/** `hello`'s closed form: drag proportional to speed, constant `k`, under gravity `g`. */
export function linearDrag(speed: number, k: number, g: number, dx: number, dy: number, t: number) {
  const e = (1 - Math.exp(-k * t)) / k;
  const terminal = -g / k;
  return { x: dx * speed * e, y: terminal * t + (dy * speed - terminal) * e };
}

/** Star classes by shell size, as starting points to be measured against video (story 1.8). */
export const STAR_CLASSES = {
  /** A 3-inch shell's small stars. */
  small: { radius: 0.006, density: 1700, burnRate: 0.003, speed: 50 },
  /** A 6-inch shell's stars. */
  medium: { radius: 0.01, density: 1700, burnRate: 0.005, speed: 70 },
  /** A 10-inch shell's large, long-burning stars. */
  large: { radius: 0.012, density: 1700, burnRate: 0.004, speed: 80 },
} as const satisfies Record<string, StarClass>;

/**
 * Stars that are not a plain shell's (M1). Rough starting points like the classes above, to be
 * measured against video.
 */
export const OTHER_STARS = {
  /**
   * Willow and kamuro: big charcoal-rich stars, lighter than a colour star, that burn slowly and
   * shed long gold tails. Light stars slow sooner and then hang, which is a willow's look.
   */
  willow: { radius: 0.014, density: 1100, burnRate: 0.0028, speed: 50 },
  /** A palm's few thick comets. */
  palm: { radius: 0.02, density: 1700, burnRate: 0.006, speed: 70 },
  /** A crossette's pieces: a star split in four, each about a quarter of what was left of it. */
  piece: { radius: 0.008, density: 1700, burnRate: 0.006, speed: 40 },
  /** Crackle's microstars: tiny pieces of a star that bursts, gone in a tenth of a second. */
  micro: { radius: 0.002, density: 1700, burnRate: 0.02, speed: 10 },
} as const satisfies Record<string, StarClass>;

/** Every kind of star a shader can place, in the order of their tables. */
export const STAR_KINDS = { ...STAR_CLASSES, ...OTHER_STARS } as const;
export type StarKind = keyof typeof STAR_KINDS;
export const KIND_ORDER = Object.keys(STAR_KINDS) as StarKind[];
