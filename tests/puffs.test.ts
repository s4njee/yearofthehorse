import { describe, expect, it } from 'vitest';
import { programme, SHELL_CLASSES } from '../src/gpu/shells/shell.ts';
import { packLights, packPuffs, PUFF_FLOATS, SMOKE_DEFAULTS } from '../src/gpu/smoke/puffs.ts';
import { starColours } from '../src/gpu/spectra/emission.ts';

// Story 2.6: smoke as stateless puffs.

describe('smoke puffs', () => {
  const list = programme(1, { rate: 24, period: 60, width: 600, gap: 0.9 });

  it('drifts with the wind, spreads and thins as it ages', () => {
    const one = [list[0]!];
    const breakAt = one[0]!.launch + one[0]!.rise;
    const at = (age: number) => {
      const out = new Float32Array(4 * PUFF_FLOATS);
      // A long period, so the shell's puff from the pass before is out of reach.
      expect(packPuffs(one, breakAt + age, 600, SMOKE_DEFAULTS, out)).toBe(1);
      return { x: out[0]!, radius: out[2]!, depth: out[3]! };
    };
    const early = at(3);
    const late = at(30);
    expect(late.x - early.x).toBeCloseTo(SMOKE_DEFAULTS.wind * 27, 5);
    expect(late.radius).toBeGreaterThan(early.radius);
    expect(late.depth).toBeLessThan(early.depth / 2);
  });

  it('is the same puff whenever it is asked for: a pure function of the time', () => {
    const a = new Float32Array(32 * PUFF_FLOATS);
    const b = new Float32Array(32 * PUFF_FLOATS);
    const n = packPuffs(list, 37.5, 60, SMOKE_DEFAULTS, a);
    packPuffs(list, 37.5 + 60, 60, SMOKE_DEFAULTS, b);
    expect(n).toBeGreaterThan(10);
    expect(Array.from(b)).toEqual(Array.from(a));
  });

  it('lights the smoke only from bursts still burning', () => {
    const s = { ...list[0]!, launch: -(list[0]!.rise + 0.8) };
    const out = new Float32Array(16);
    expect(packLights([s], starColours('srgb'), out)).toBe(1);
    const burnt = { ...s, launch: -(s.rise + SHELL_CLASSES[s.class].burn * 2) };
    expect(packLights([burnt], starColours('srgb'), out)).toBe(0);
  });
});
