import { pcg3d, toUnorm } from '../hash.ts';

// Twin of src/wgsl/air.wgsl (story 2.1): the wind in 3D, for tests and CPU models.

export interface Air {
  /** The way the wind blows, a horizontal unit vector (x, z). */
  dir: readonly [number, number];
  /** Mean speed at the reference height, m/s. */
  speed: number;
  /** The reference height, m. */
  height: number;
  /** The ground's roughness length, m. */
  roughness: number;
  /** Extra speed at a gust's peak, as a fraction of the mean. */
  gust: number;
  /** A gust's size along the wind, m. */
  scale: number;
  /** Turbulence intensity: rms fluctuation over the reference speed. */
  turbulence: number;
  /** The most the wind veers either side, radians. */
  veer: number;
  time: number;
}

/** A calm, open-country default: 4 m/s at 10 m over grass. */
export const AIR: Air = {
  dir: [1, 0],
  speed: 4,
  height: 10,
  roughness: 0.03,
  gust: 0.6,
  scale: 14,
  turbulence: 0.12,
  veer: 0.25,
  time: 0,
};

const smoothstep = (lo: number, hi: number, x: number) => {
  const t = Math.min(Math.max((x - lo) / (hi - lo), 0), 1);
  return t * t * (3 - 2 * t);
};

const lattice = (x: number, y: number, z: number, seed: number) =>
  toUnorm(pcg3d(x >>> 0, y >>> 0, ((z >>> 0) ^ Math.imul(seed, 2654435769)) >>> 0)[0]);

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function airNoise(px: number, py: number, pz: number, seed: number): number {
  const cx = Math.floor(px);
  const cy = Math.floor(py);
  const cz = Math.floor(pz);
  const fade = (f: number) => f * f * (3 - 2 * f);
  const ux = fade(px - cx);
  const uy = fade(py - cy);
  const uz = fade(pz - cz);
  const l = (dx: number, dy: number, dz: number) => lattice(cx + dx, cy + dy, cz + dz, seed);
  const a = mix(l(0, 0, 0), l(1, 0, 0), ux);
  const b = mix(l(0, 1, 0), l(1, 1, 0), ux);
  const c = mix(l(0, 0, 1), l(1, 0, 1), ux);
  const d = mix(l(0, 1, 1), l(1, 1, 1), ux);
  return mix(mix(a, b, uy), mix(c, d, uy), uz);
}

export function airMean(y: number, air: Air): number {
  const z0 = Math.max(air.roughness, 1e-4);
  const z = Math.max(y, 0);
  return (air.speed * Math.log((z + z0) / z0)) / Math.log((air.height + z0) / z0);
}

function frame(x: number, y: number, z: number, air: Air): [number, number, number] {
  const [dx, dz] = air.dir;
  return [x * dx + z * dz - air.speed * air.time, -x * dz + z * dx, y];
}

export function airGust(x: number, y: number, z: number, air: Air): number {
  const [a, b, c] = frame(x, y, z, air);
  return smoothstep(0.3, 0.85, airNoise(a / air.scale, b / (1.7 * air.scale), c / air.scale, 11));
}

/** The wind at (x, y, z), m/s. */
export function airVelocity(x: number, y: number, z: number, air: Air): [number, number, number] {
  const [a, b, c] = frame(x, y, z, air);
  const g = smoothstep(
    0.3,
    0.85,
    airNoise(a / air.scale, b / (1.7 * air.scale), c / air.scale, 11),
  );
  const u = airMean(y, air) * (1 + air.gust * g);
  const s3 = 3.1 * air.scale;
  const turn = (airNoise(x / s3, y / s3, z / s3 + 0.013 * air.time, 23) - 0.5) * 2 * air.veer;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const dx = air.dir[0] * cos - air.dir[1] * sin;
  const dz = air.dir[0] * sin + air.dir[1] * cos;
  const t = 0.3 * air.scale;
  const k = 5.4 * air.turbulence * air.speed;
  const wx = airNoise(a / t, b / t, c / t, 31) - 0.5;
  const wy = 0.5 * airNoise(a / t, b / t, c / t, 37) + 0.25 - 0.5;
  const wz = airNoise(a / t, b / t, c / t, 41) - 0.5;
  return [dx * u + wx * k, wy * k, dz * u + wz * k];
}
