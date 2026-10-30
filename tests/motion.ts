import { luminanceOf } from '../src/gpu/safety/pattern.ts';
import { estimateMotion, type MotionReading } from '../src/gpu/safety/motion.ts';
import { mountHeadless } from './headless.ts';

// Runs a registered effect headlessly and measures its whole-field motion
// (src/gpu/safety/motion.ts) between frames a sixth of a second apart, several times over a run.
// The report is the median of the readings, component by component, so one bad match cannot
// fail an effect, with the largest reading beside it.

export interface MeasureMotionOptions {
  /** Seconds of animation to look at, after `settle`. Default 3. */
  seconds?: number;
  settle?: number;
  /** Readings over the run. Default 6. */
  samples?: number;
  width?: number;
  height?: number;
  preset?: string;
  params?: Readonly<Record<string, unknown>>;
}

export interface MotionReport {
  rotation: number;
  zoom: number;
  drift: number;
  /** The largest magnitude of each component over the readings. */
  peak: { rotation: number; zoom: number; drift: number };
  readings: MotionReading[];
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return sorted.length % 2 ? sorted[Math.floor(mid)]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

export async function measureMotion(
  id: string,
  options: MeasureMotionOptions = {},
): Promise<MotionReport> {
  const width = options.width ?? 480;
  const height = options.height ?? 270;
  const fps = 60;
  const gap = 10;
  const mounted = await mountHeadless(id, {
    width,
    height,
    fps,
    preset: options.preset,
    params: options.params,
  });
  const readings: MotionReading[] = [];
  try {
    await mounted.runTo(options.settle ?? 0.5);
    const samples = options.samples ?? 6;
    const every = Math.max(gap, Math.floor(((options.seconds ?? 3) * fps) / samples));
    for (let i = 0; i < samples; i++) {
      mounted.step(every - gap);
      const a = luminanceOf(await mounted.read(), width, height);
      mounted.step(gap);
      const b = luminanceOf(await mounted.read(), width, height);
      readings.push(estimateMotion(a, b, width, height, gap / fps));
    }
  } finally {
    mounted.destroy();
  }
  const peak = (key: 'rotation' | 'zoom' | 'drift') =>
    Math.max(...readings.map((r) => Math.abs(r[key])));
  return {
    rotation: median(readings.map((r) => r.rotation)),
    zoom: median(readings.map((r) => r.zoom)),
    drift: median(readings.map((r) => r.drift)),
    peak: { rotation: peak('rotation'), zoom: peak('zoom'), drift: peak('drift') },
    readings,
  };
}
