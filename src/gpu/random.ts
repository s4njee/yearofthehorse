// Seeded randomness for layouts that must be the same on every load: a field of orbs is a pure
// function of its seed, so a screenshot, a test and a visitor all see the same one.

/** Mulberry32: a small, fast 32-bit generator. Returns a function giving 0..1. */
export function createRandom(seed: number): () => number {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stateless hash of an integer to 0..1. */
export function hash1(n: number): number {
  let x = Math.imul((n | 0) ^ 0x27d4eb2d, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Smooth 1D value noise in -1..1, for writhing arcs and drifting electrodes. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash1(i + seed * 7919);
  const b = hash1(i + 1 + seed * 7919);
  return (a + (b - a) * u) * 2 - 1;
}

/** Fractal sum of `noise1`, normalised back to about -1..1. */
export function fbm1(x: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amplitude = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += noise1(x, seed + o * 13) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    x *= 2.03;
  }
  return sum / norm;
}
