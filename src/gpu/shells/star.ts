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
 * The star's position after `t` seconds, thrown in direction (dx, dy) (a unit vector, y up) from
 * the origin, by semi-implicit steps of `dt`.
 */
export function integrateStar(c: StarClass, dx: number, dy: number, t: number, dt = 1e-4) {
  const cd = c.drag ?? 0.47;
  const s: StarState = { x: 0, y: 0, vx: dx * c.speed, vy: dy * c.speed };
  const steps = Math.round(t / dt);
  for (let i = 0; i < steps; i++) {
    const r = Math.max(c.radius - c.burnRate * i * dt, c.radius * 0.02);
    // Drag force over mass: (½ ρ Cd π r²) / (4/3 π r³ ρs) = 3 ρ Cd / (8 r ρs).
    const k = (3 * AIR * cd) / (8 * r * c.density);
    const v = Math.hypot(s.vx, s.vy);
    s.vx -= k * v * s.vx * dt;
    s.vy -= (G + k * v * s.vy) * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
  }
  return s;
}

export interface StarTable {
  /** Seconds between time samples. */
  step: number;
  /** Time samples per angle. */
  samples: number;
  /** Launch angles sampled, from straight down to straight up, evenly. */
  angles: number;
  /**
   * Position in the star's own frame, for each angle then each time (angles × samples × 2): the
   * distance along its launch direction, and across it (positive anticlockwise of the direction).
   */
  xy: Float32Array;
}

/**
 * One class's flight from the break to burn-out, for stars thrown at `angles` elevations (odd, so
 * sideways is one of them) from
 * straight down to straight up (to one side; the other side is its mirror), each sampled
 * `samples` times. Gravity speeds a star thrown downward and slows one thrown upward, so the
 * angle matters: a single sideways flight placed along each direction misses by 5 to 7% of the
 * burst's radius.
 */
export function starTable(c: StarClass, samples = 48, angles = 9): StarTable {
  const step = burnTime(c) / (samples - 1);
  const xy = new Float32Array(angles * samples * 2);
  for (let a = 0; a < angles; a++) {
    const elevation = -Math.PI / 2 + (Math.PI * a) / (angles - 1);
    for (let i = 0; i < samples; i++) {
      const dx = Math.cos(elevation);
      const dy = Math.sin(elevation);
      const s = integrateStar(c, dx, dy, i * step);
      xy[(a * samples + i) * 2] = s.x * dx + s.y * dy;
      xy[(a * samples + i) * 2 + 1] = -s.x * dy + s.y * dx;
    }
  }
  return { step, samples, angles, xy };
}

/**
 * A star of the table's class thrown in direction (dx, dy), `t` seconds after the break:
 * bilinear in elevation and time, mirrored for stars thrown to the left. What a shader does.
 */
export function placeStar(table: StarTable, dx: number, dy: number, t: number) {
  const elevation = Math.asin(Math.min(1, Math.max(-1, dy)));
  const ua = ((elevation + Math.PI / 2) / Math.PI) * (table.angles - 1);
  const a0 = Math.min(Math.floor(ua), table.angles - 2);
  const fa = ua - a0;
  const ut = Math.min(Math.max(t / table.step, 0), table.samples - 1);
  const i0 = Math.min(Math.floor(ut), table.samples - 2);
  const ft = ut - i0;
  const at = (a: number, i: number, k: number) => table.xy[(a * table.samples + i) * 2 + k]!;
  const lerp = (k: number) => {
    const lo = at(a0, i0, k) + ft * (at(a0, i0 + 1, k) - at(a0, i0, k));
    const hi = at(a0 + 1, i0, k) + ft * (at(a0 + 1, i0 + 1, k) - at(a0 + 1, i0, k));
    return lo + fa * (hi - lo);
  };
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
  table.xy[(((table.angles - 1) / 2) * table.samples + table.samples - 1) * 2]!;

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
