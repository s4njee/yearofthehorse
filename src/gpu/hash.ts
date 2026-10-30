// Twins of src/wgsl/hash.wgsl's integer hashes, bit for bit, so a CPU model can make the same
// random choices as a shader (the grass field's placement, story 2.2). u32 arithmetic is done with
// Math.imul and `>>> 0`.

const u32 = (x: number) => x >>> 0;

export function pcg1d(v: number): number {
  const state = u32(Math.imul(u32(v), 747796405) + 2891336453);
  const word = u32(Math.imul(u32((state >>> ((state >>> 28) + 4)) ^ state), 277803737));
  return u32((word >>> 22) ^ word);
}

export function pcg2d(x: number, y: number): [number, number] {
  let a = u32(Math.imul(u32(x), 1664525) + 1013904223);
  let b = u32(Math.imul(u32(y), 1664525) + 1013904223);
  a = u32(a + Math.imul(b, 1664525));
  b = u32(b + Math.imul(a, 1664525));
  a = u32(a ^ (a >>> 16));
  b = u32(b ^ (b >>> 16));
  a = u32(a + Math.imul(b, 1664525));
  b = u32(b + Math.imul(a, 1664525));
  a = u32(a ^ (a >>> 16));
  b = u32(b ^ (b >>> 16));
  return [a, b];
}

export function pcg3d(x: number, y: number, z: number): [number, number, number] {
  let a = u32(Math.imul(u32(x), 1664525) + 1013904223);
  let b = u32(Math.imul(u32(y), 1664525) + 1013904223);
  let c = u32(Math.imul(u32(z), 1664525) + 1013904223);
  a = u32(a + Math.imul(b, c));
  b = u32(b + Math.imul(c, a));
  c = u32(c + Math.imul(a, b));
  a = u32(a ^ (a >>> 16));
  b = u32(b ^ (b >>> 16));
  c = u32(c ^ (c >>> 16));
  a = u32(a + Math.imul(b, c));
  b = u32(b + Math.imul(c, a));
  c = u32(c + Math.imul(a, b));
  return [a, b, c];
}

/** `to_unorm_1d`: the top 24 bits as a float in [0, 1). */
export function toUnorm(h: number): number {
  return (h >>> 8) / 16777216;
}

/** `ihash_2to1` on an integer cell (negative cells are fine, as in WGSL's bitcast). */
export function ihash2to1(x: number, y: number): number {
  return toUnorm(pcg2d(x, y)[0]);
}
