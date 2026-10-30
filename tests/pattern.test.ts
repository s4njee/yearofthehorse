import { describe, expect, it, vi } from 'vitest';
import { listEffects, loadEffect } from '../src/effects/registry.ts';
import { STRONG_DOSE } from '../src/gpu/safety/dose.ts';
import {
  analysePattern,
  PATTERN_AREA,
  PATTERN_MOVING_AREA,
  readWindow,
  type PatternReport,
} from '../src/gpu/safety/pattern.ts';
import { measurePatterns } from './pattern.ts';

vi.setConfig({ testTimeout: 600_000 });

// Story 2.2. Known positives from the guidance (gratings, checks, rings, spokes, dartboards and
// spirals of clearly discernible stripes over a large area) and known negatives (noise, a soft
// rosette, too small a light-dark step, too few pairs, too bright to count, too small an area),
// then every effect and preset. Frames are 480 x 270 standing for 1920 x 1080, so a 10° field is
// about 89 x 67 frame pixels.

const W = 480;
const H = 270;

/** A frame from a function of centred coordinates (x right, y down, in pixels from the centre). */
function frame(f: (x: number, y: number) => number): Float32Array {
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) out[y * W + x] = f(x + 0.5 - W / 2, y + 0.5 - H / 2);
  }
  return out;
}

/** Light–dark between `dark` and `light` (relative luminance) from a 0..1 wave. */
const shade = (wave: number, dark = 0.02, light = 0.6) => dark + (light - dark) * wave;
const square = (phase: number) => (((phase % 1) + 1) % 1 < 0.5 ? 1 : 0);
const sine = (phase: number) => 0.5 + 0.5 * Math.cos(2 * Math.PI * phase);

/** Value noise, several octaves: the stand-in for noise fields and photographs. */
function fbm(x: number, y: number): number {
  const hash = (i: number, j: number) => {
    const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const noise = (px: number, py: number) => {
    const i = Math.floor(px);
    const j = Math.floor(py);
    const fx = px - i;
    const fy = py - j;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const a = hash(i, j) * (1 - u) + hash(i + 1, j) * u;
    const b = hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u;
    return a * (1 - v) + b * v;
  };
  let sum = 0;
  let amp = 0.5;
  let scale = 1 / 60;
  for (let o = 0; o < 5; o++) {
    sum += amp * noise(x * scale, y * scale);
    amp *= 0.5;
    scale *= 2;
  }
  return sum / 0.97;
}

/** 1/f noise by spectral synthesis: 300 waves, random directions and phases, no lattice. */
const WAVES = Array.from({ length: 300 }, (_, i) => {
  const r = (k: number) => {
    const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  const f = (1 / 90) * 30 ** r(1);
  const a = r(2) * Math.PI;
  return { fx: f * Math.cos(a), fy: f * Math.sin(a), phase: r(3) * 2 * Math.PI, amp: 1 / (f * 90) };
});
const WAVE_NORM = Math.sqrt(WAVES.reduce((sum, w) => sum + w.amp * w.amp, 0) / 2);
function spectral(x: number, y: number): number {
  let sum = 0;
  for (const w of WAVES) sum += w.amp * Math.cos(2 * Math.PI * (w.fx * x + w.fy * y) + w.phase);
  return Math.min(1, Math.max(0, 0.5 + 0.18 * (sum / WAVE_NORM)));
}

const verdict = (lum: Float32Array, previous?: Float32Array): PatternReport =>
  analysePattern(lum, W, H, { previous });

describe('readWindow', () => {
  it('finds a grating regular, with its period and contrast', () => {
    const r = readWindow((x) => shade(sine(x / 8)));
    expect(r.regularity).toBeGreaterThan(0.9);
    expect(r.period).toBeCloseTo(8, 1);
    expect(r.contrast).toBeGreaterThan(0.9);
    expect(Math.abs(r.direction[0])).toBeCloseTo(1, 3);
  });

  it('finds noise irregular', () => {
    expect(readWindow((x, y) => fbm(x * 4, y * 4)).regularity).toBeLessThan(0.3);
  });
});

describe('pattern analyser: known positives', () => {
  const positives: Record<string, (x: number, y: number) => number> = {
    'square grating, 16 pairs': (x) => shade(square(x / 30)),
    'sine grating, 10 pairs, oblique': (x, y) => shade(sine((x * 0.8 + y * 0.6) / 48)),
    'fine grating, 60 pairs': (x) => shade(square(x / 8)),
    checkerboard: (x, y) => shade(square(x / 40) ^ square(y / 40)),
    'concentric rings': (x, y) => shade(square(Math.hypot(x, y) / 24)),
    'twenty-four spokes': (x, y) => shade(square((Math.atan2(y, x) / (2 * Math.PI)) * 24)),
    'six spokes': (x, y) => shade(square((Math.atan2(y, x) / (2 * Math.PI)) * 6)),
    'eight-petal rosette, hard-edged': (x, y) => {
      const r = Math.hypot(x, y);
      return shade(Number(r < 125 * (0.5 + 0.5 * Math.abs(Math.cos(4 * Math.atan2(y, x))))));
    },
    dartboard: (x, y) =>
      shade(square(Math.hypot(x, y) / 30) ^ square((Math.atan2(y, x) / (2 * Math.PI)) * 16)),
    'archimedean spiral, eight arms': (x, y) =>
      shade(square(Math.hypot(x, y) / 40 + (Math.atan2(y, x) / (2 * Math.PI)) * 8)),
  };
  it.each(Object.entries(positives))('%s fails', (_name, f) => {
    const report = verdict(frame(f));
    expect(report.verdict, JSON.stringify(report.regions.slice(0, 4))).toBe('high');
    expect(report.area).toBeGreaterThanOrEqual(PATTERN_AREA);
  });
});

describe('pattern analyser: known negatives', () => {
  const negatives: Record<string, (x: number, y: number) => number> = {
    'value noise': (x, y) => shade(fbm(x, y)),
    // Value noise is built on a square lattice, so it is periodic at the lattice spacing and is no
    // stand-in for a photograph; this is lattice-free: random-phase waves at many frequencies.
    'spectral noise': (x, y) => shade(spectral(x, y)),
    'soft rosette': (x, y) => {
      const r = Math.hypot(x, y) / H;
      return 0.2 + 0.03 * Math.cos(6 * Math.atan2(y, x)) * Math.exp(-r);
    },
    'smooth gradient': (x) => shade(0.5 + x / W),
    // A step of 0.08: under the guidance's 20 cd/m² (0.1).
    'grating with a small step': (x) => shade(sine(x / 20), 0.3, 0.38),
    // Darker bars above 160 cd/m² (0.8): too bright to count.
    'grating of light bars': (x) => shade(square(x / 20), 0.82, 1),
    'three pairs across the frame': (x) => shade(square(x / 160)),
    'dim grating, a step of 0.048': (x) => shade(square(x / 20), 0.002, 0.05),
    'plain dark': () => 0.01,
    // Five pairs: the guidance's limit is more than five.
    'five spokes': (x, y) => shade(square((Math.atan2(y, x) / (2 * Math.PI)) * 5)),
    // Isolated bright features on black: Michelson contrast is 1, and they are not a pattern.
    'scattered blobs': (x, y) => {
      let on = 0;
      for (let i = 0; i < 40; i++) {
        const bx = ((Math.sin(i * 12.9898) * 43758.5453) % 1) * W * 0.5;
        const by = ((Math.sin(i * 78.233) * 12543.123) % 1) * H * 0.5;
        if (Math.hypot(x - bx, y - by) < 5 + (i % 4) * 3) on = 1;
      }
      return shade(on);
    },
  };
  it.each(Object.entries(negatives))('%s passes as none', (_name, f) => {
    const report = verdict(frame(f));
    expect(report.verdict, JSON.stringify(report.regions.filter((r) => r.counted))).toBe('none');
  });
});

describe('pattern analyser: area and motion', () => {
  // A vertical grating in a centred w x h box of frame pixels, shifted by `shift` pixels.
  const patch = (w: number, h: number, shift = 0) =>
    frame((x, y) =>
      Math.abs(x) < w / 2 && Math.abs(y) < h / 2 ? shade(square((x + shift) / 6)) : 0.02,
    );

  it('rates a still pattern on a third of a 10° field as low', () => {
    const report = verdict(patch(56, 28), patch(56, 28));
    expect(report.moving).toBe(false);
    expect(report.verdict, JSON.stringify(report)).toBe('low');
    expect(report.area).toBeLessThan(PATTERN_AREA);
    expect(report.area).toBeGreaterThan(PATTERN_MOVING_AREA);
  });

  it('holds the same pattern moving to the lower limit', () => {
    const moving = verdict(patch(56, 28), patch(56, 28, 3));
    expect(moving.moving).toBe(true);
    expect(moving.limit).toBe(PATTERN_MOVING_AREA);
    expect(moving.verdict).toBe('high');
  });

  it('fails a pattern that fills a 10° field, though it is a small share of the frame', () => {
    const report = verdict(patch(110, 84));
    expect(report.verdict).toBe('high');
    expect(report.frameArea).toBeLessThan(0.1);
  });
});

// Every effect at its defaults must stay under the limit, and must not claim to be calmer than it
// measures. Presets that go over have to be declared in `scorecard.patternPresets`.
const ORDER = { none: 0, low: 1, high: 2 } as const;

describe.skipIf(process.env.FLASH_SWEEP === '0')(
  'registered effects against the pattern rule',
  () => {
    it.each(listEffects().map((meta) => [meta.id, meta.scorecard?.pattern] as const))(
      '%s is no more patterned than its scorecard says (%s)',
      async (id, declared) => {
        const report = await measurePatterns(id);
        const claimed = declared === undefined || declared === 'unmeasured' ? 'low' : declared;
        expect(claimed, `${id}: the defaults must pass`).not.toBe('high');
        expect(
          ORDER[report.verdict],
          `${id} measured "${report.verdict}": ${JSON.stringify(report)}`,
        ).toBeLessThanOrEqual(ORDER[claimed]);
        // A visitor can drag the slider to the strong end unwarned, so that must pass too.
        const strong = await measurePatterns(id, { params: { dose: STRONG_DOSE }, seconds: 2 });
        expect(strong.verdict, `${id} at dose ${STRONG_DOSE}`).not.toBe('high');
      },
    );

    it.each(listEffects().map((meta) => [meta.id, meta.scorecard?.patternPresets ?? []] as const))(
      '%s declares every preset that goes over (%j)',
      async (id, declared) => {
        const effect = await loadEffect(id);
        const over: string[] = [];
        for (const preset of Object.keys(effect.presets ?? {})) {
          const report = await measurePatterns(id, { preset, seconds: 2 });
          if (report.verdict === 'high') over.push(preset);
        }
        expect(over.filter((preset) => !declared.includes(preset))).toEqual([]);
        for (const preset of declared) expect(Object.keys(effect.presets ?? {})).toContain(preset);
      },
    );
  },
);
