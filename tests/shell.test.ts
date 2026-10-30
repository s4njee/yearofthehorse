import { describe, expect, it } from 'vitest';
import {
  activeShells,
  heldTime,
  packShells,
  packTables,
  programme,
  SHELL_CLASSES,
  SHELL_FLOATS,
  shellSpan,
  TABLE_ANGLES,
  TABLE_SAMPLES,
} from '../src/gpu/shells/shell.ts';
import { starColours } from '../src/gpu/spectra/emission.ts';

// Story 2.3: shells as records, and a display as a programme of them.

const OPTIONS = { rate: 24, period: 60, width: 600, gap: 0.9 };

describe('shells', () => {
  it('spaces every break at least the gap apart, across the loop too', () => {
    const list = programme(1, OPTIONS);
    expect(list.length).toBe(24);
    const breaks = list.map((s) => s.launch + s.rise).sort((a, b) => a - b);
    for (let i = 1; i < breaks.length; i++) {
      expect(breaks[i]! - breaks[i - 1]!).toBeGreaterThanOrEqual(OPTIONS.gap - 1e-9);
    }
    expect(breaks[0]! + OPTIONS.period - breaks.at(-1)!).toBeGreaterThanOrEqual(OPTIONS.gap - 1e-9);
  });

  it('finds the shells in the air, including the last pass still burning at the seam', () => {
    const list = programme(2, OPTIONS);
    const last = list.reduce((a, b) => (a.launch + shellSpan(a) > b.launch + shellSpan(b) ? a : b));
    const endsAt = last.launch + shellSpan(last);
    if (endsAt > OPTIONS.period) {
      const t = endsAt - OPTIONS.period - 0.1;
      const ids = activeShells(list, t, OPTIONS.period).map((s) => s.seed);
      expect(ids).toContain(last.seed);
    }
    for (let t = 0; t < OPTIONS.period; t += 0.7) {
      for (const s of activeShells(list, t, OPTIONS.period)) {
        // Relative to now: launched in the past, still within its span.
        expect(-s.launch).toBeGreaterThanOrEqual(0);
        expect(-s.launch).toBeLessThanOrEqual(shellSpan(s) + 1e-9);
      }
    }
  });

  it('holds a moment with no shell at its break and something open', () => {
    for (const seed of [1, 2, 3]) {
      const list = programme(seed, OPTIONS);
      const t = heldTime(list, OPTIONS.period);
      const active = activeShells(list, t, OPTIONS.period);
      let open = 0;
      for (const s of active) {
        const age = -s.launch - s.rise;
        expect(Math.abs(age)).toBeGreaterThanOrEqual(0.5);
        if (age > 0.5 && age < 0.75 * SHELL_CLASSES[s.class].burn) open++;
      }
      expect(open).toBeGreaterThan(0);
    }
  });

  it('packs records and tables in the layout the shader reads', () => {
    const list = programme(3, OPTIONS).slice(0, 3);
    const out = new Float32Array(8 * SHELL_FLOATS);
    expect(packShells(list, starColours('srgb'), out)).toBe(3);
    expect(out[1]).toBeCloseTo(list[0]!.rise, 5);
    expect(out[7]).toBe(list[0]!.stars);
    expect(packTables().length).toBe(3 * TABLE_ANGLES * TABLE_SAMPLES * 2);
  });
});
