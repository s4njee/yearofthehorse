import { analysePattern, luminanceOf, type PatternReport } from '../src/gpu/safety/pattern.ts';
import { mountHeadless } from './headless.ts';

// Runs a registered effect headlessly and puts frames through the pattern analyser
// (src/gpu/safety/pattern.ts), as tests/flash.ts does for flashes. A frame is compared with the
// one a quarter of a second earlier, so a pattern that moves is held to the lower limit. The
// report is the worst frame's.

export interface MeasurePatternOptions {
  /** Seconds of animation to look at, after `settle`. Default 3. */
  seconds?: number;
  /** Seconds to run first. Default 0.5. */
  settle?: number;
  /** Frames analysed per second. Default 2. */
  rate?: number;
  /** Render size. Default 480 x 270, the size the analyser's windows are chosen for. */
  width?: number;
  height?: number;
  preset?: string;
  params?: Readonly<Record<string, unknown>>;
  /** Analyse the frame a paused host holds instead of a run (`tests/still.test.ts`). */
  held?: boolean;
}

const ORDER = { none: 0, low: 1, high: 2 } as const;

/** The worse of two reports: higher verdict, then the larger share of its limit. */
export function worse(a: PatternReport | undefined, b: PatternReport): PatternReport {
  if (!a) return b;
  if (ORDER[b.verdict] !== ORDER[a.verdict]) return ORDER[b.verdict] > ORDER[a.verdict] ? b : a;
  return b.area / b.limit > a.area / a.limit ? b : a;
}

export async function measurePatterns(
  id: string,
  options: MeasurePatternOptions = {},
): Promise<PatternReport> {
  const width = options.width ?? 480;
  const height = options.height ?? 270;
  const fps = 60;
  // The view is taken to be 1920 CSS pixels wide, as tests/flash.ts takes it.
  const displayScale = 1920 / width;
  const mounted = await mountHeadless(id, {
    width,
    height,
    fps,
    preset: options.preset,
    params: options.params,
  });
  try {
    if (options.held) {
      mounted.hold();
      return analysePattern(luminanceOf(await mounted.read(), width, height), width, height, {
        displayScale,
      });
    }
    await mounted.runTo(options.settle ?? 0.5);
    const gap = Math.round(fps / 4);
    const every = Math.max(gap, Math.round(fps / (options.rate ?? 2)));
    const total = Math.round((options.seconds ?? 3) * fps);
    let worst: PatternReport | undefined;
    for (let frame = 0; frame + gap <= total; frame += every) {
      mounted.step(every - gap);
      const before = luminanceOf(await mounted.read(), width, height);
      mounted.step(gap);
      const now = luminanceOf(await mounted.read(), width, height);
      worst = worse(worst, analysePattern(now, width, height, { previous: before, displayScale }));
    }
    return worst!;
  } finally {
    mounted.destroy();
  }
}
