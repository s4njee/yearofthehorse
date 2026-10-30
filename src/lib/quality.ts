/*
 * Adaptive quality (story 7.2): a ladder of cheaper settings per effect, walked down while the GPU
 * is over budget and back up once it has room, and past the last rung, the effect's CSS version.
 *
 *   const host = await mount(canvas, effect);
 *   const quality = adaptQuality(host, { budgetMs: 4, onFallback: () => showCssVersion() });
 *
 * Each effect's own rungs come first, in the order of what they save for what they cost the look
 * (fewer echoes before a lower-resolution history, story 11.2), then the rungs every effect
 * shares: three-quarter resolution, no bloom, half resolution. A rung only names the parameters
 * it changes; stepping back up restores them as the page left them.
 */
import type { EffectHost, FrameStats } from './host.ts';

export interface QualityRung {
  /** Shown in logs and the gallery's HUD. */
  label: string;
  /** Parameter values for this rung, over the page's own. Rungs below keep the ones above. */
  params?: Readonly<Record<string, unknown>>;
  /** Resolution scale for this rung (the host's `setResolutionScale`). */
  resolutionScale?: number;
}

/**
 * The effect's own rungs, cheapest last. An effect missing here has only the shared ones.
 */
export const EFFECT_RUNGS: Readonly<Record<string, readonly QualityRung[]>> = {};

/** The rungs every effect shares, after its own. */
export const SHARED_RUNGS: readonly QualityRung[] = [
  { label: 'three-quarter resolution', resolutionScale: 0.75 },
  { label: 'no bloom', resolutionScale: 0.75, params: { bloom: 0 } },
  { label: 'half resolution', resolutionScale: 0.5, params: { bloom: 0 } },
];

export function qualityLadder(id: string): QualityRung[] {
  const own = EFFECT_RUNGS[id] ?? [];
  // A shared rung keeps whatever the effect's last rung set.
  const carried = own.at(-1)?.params ?? {};
  return [
    { label: 'full' },
    ...own,
    ...SHARED_RUNGS.map((rung) => ({ ...rung, params: { ...carried, ...rung.params } })),
  ];
}

export interface AdaptiveOptions {
  /** GPU milliseconds a frame the effect may use (Tier A is 4, Tier B 8 on an integrated GPU). */
  budgetMs: number;
  /** Frames over budget, in a row, before stepping down. Default 30 (half a second). */
  downAfter?: number;
  /** Frames under 60% of the budget, in a row, before stepping back up. Default 300 (five seconds). */
  upAfter?: number;
  /** Rungs to use instead of the effect's ladder. */
  rungs?: readonly QualityRung[];
  /** Called on every step, with the rung now in use. */
  onChange?: (rung: QualityRung, index: number) => void;
  /** Called once when even the last rung is over budget: show the CSS version, pause the effect. */
  onFallback?: () => void;
}

export interface QualityGovernor {
  /** The rung in use; 0 is full quality. */
  readonly index: number;
  readonly rung: QualityRung;
  /** Feeds one frame's GPU time by hand (used by tests; the host's stats do it otherwise). */
  observe(gpuMs: number): void;
  destroy(): void;
}

/** The part of the host the governor drives. */
export type QualityHost = Pick<EffectHost, 'loaded' | 'setResolutionScale' | 'onStats'> &
  Partial<Pick<EffectHost, 'requestTiming' | 'resolutionScale'>>;

export function adaptQuality(host: QualityHost, options: AdaptiveOptions): QualityGovernor {
  const downAfter = options.downAfter ?? 30;
  const upAfter = options.upAfter ?? 300;
  const id = host.loaded?.effect.meta.id ?? '';
  const rungs = options.rungs ?? qualityLadder(id);
  const baseScale = host.resolutionScale ?? 1;
  /** The page's values for every parameter a rung changes, to restore on the way up. */
  const saved = new Map<string, unknown>();
  let index = 0;
  let over = 0;
  let under = 0;
  let fellBack = false;

  function apply(next: number) {
    index = next;
    const rung = rungs[index]!;
    const params = host.loaded?.params as Record<string, unknown> | undefined;
    if (params) {
      for (const key of saved.keys()) {
        if (!(rung.params && key in rung.params)) params[key] = saved.get(key);
      }
      for (const [key, value] of Object.entries(rung.params ?? {})) {
        if (!saved.has(key)) saved.set(key, params[key]);
        params[key] = value;
      }
    }
    host.setResolutionScale(baseScale * (rung.resolutionScale ?? 1));
    options.onChange?.(rung, index);
  }

  function observe(gpuMs: number) {
    if (fellBack || !Number.isFinite(gpuMs)) return;
    if (gpuMs > options.budgetMs) {
      over++;
      under = 0;
    } else {
      over = 0;
      under = gpuMs < 0.6 * options.budgetMs ? under + 1 : 0;
    }
    if (over >= downAfter) {
      over = 0;
      if (index + 1 < rungs.length) apply(index + 1);
      else {
        fellBack = true;
        options.onFallback?.();
      }
    } else if (under >= upAfter && index > 0) {
      under = 0;
      apply(index - 1);
    }
  }

  const stopTiming = host.requestTiming?.();
  const stopStats = host.onStats((stats: FrameStats) => {
    if (stats.gpuMs !== undefined) observe(stats.gpuMs);
  });

  return {
    get index() {
      return index;
    },
    get rung() {
      return rungs[index]!;
    },
    observe,
    destroy() {
      stopStats();
      stopTiming?.();
      if (index > 0) apply(0);
    },
  };
}
