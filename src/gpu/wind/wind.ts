import { pcg3d, toUnorm } from '../hash.ts';

// Twin of src/wgsl/wind.wgsl (story 2.4): the ground wind, for tests and CPU models.

export interface Wind {
  /** The way the wind blows over the ground (x, z), a unit vector. */
  dir: readonly [number, number];
  /** Steady lean of a tip, as a fraction of the blade's height. */
  lean: number;
  /** Extra lean at a gust's peak. */
  gust: number;
  /** How fast a gust front travels, m/s. */
  speed: number;
  /** A gust's size along the wind, m. */
  scale: number;
  /** A blade's own sway, as a fraction of its height. */
  flutter: number;
  time: number;
}

const smoothstep = (lo: number, hi: number, x: number) => {
  const t = Math.min(Math.max((x - lo) / (hi - lo), 0), 1);
  return t * t * (3 - 2 * t);
};

const lattice = (x: number, y: number, seed: number) => toUnorm(pcg3d(x, y, seed)[0]);

export function valueNoise(px: number, py: number, seed: number): number {
  const cx = Math.floor(px);
  const cy = Math.floor(py);
  const fx = px - cx;
  const fy = py - cy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = lattice(cx, cy, seed);
  const b = lattice(cx + 1, cy, seed);
  const c = lattice(cx, cy + 1, seed);
  const d = lattice(cx + 1, cy + 1, seed);
  const top = a + (b - a) * ux;
  const bottom = c + (d - c) * ux;
  return top + (bottom - top) * uy;
}

export function gustiness(px: number, pz: number, w: Wind): number {
  const [dx, dz] = w.dir;
  const along = px * dx + pz * dz;
  const across = -px * dz + pz * dx;
  const g = valueNoise((along - w.speed * w.time) / w.scale, across / (1.7 * w.scale), 11);
  return smoothstep(0.3, 0.85, g);
}

/** The tip's offset on the ground (x, z), as a fraction of the blade's height. */
export function groundWind(
  px: number,
  pz: number,
  w: Wind,
  freq: number,
  phase: number,
): [number, number] {
  const g = gustiness(px, pz, w);
  const veer =
    (valueNoise(px / (3.1 * w.scale), pz / (3.1 * w.scale) + 0.013 * w.time, 23) - 0.5) * 0.8;
  const c = Math.cos(veer);
  const s = Math.sin(veer);
  const dx = w.dir[0] * c - w.dir[1] * s;
  const dz = w.dir[0] * s + w.dir[1] * c;
  const spin = 2 * Math.PI * freq * w.time;
  const lean = w.lean + w.gust * g + w.flutter * (0.4 + g) * Math.sin(spin + phase);
  const side = 0.35 * w.flutter * (0.4 + g) * Math.cos(0.71 * spin + 1.3 * phase);
  return [dx * lean - dz * side, dz * lean + dx * side];
}
