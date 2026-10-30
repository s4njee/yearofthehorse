/*
 * Library host (M3 story 3.3): runs one effect in a caller-owned canvas.
 *
 * Unlike the gallery shell, this does not create DOM, import CSS or know about the Vite
 * registry. The caller owns the canvas, the container the fallback notice lands in, and a
 * loader for the effect module, so an embedder can `import candle from 'yearofthehorse/effects/hello'`
 * and mount it without the gallery.
 */
import {
  defaultParams,
  type EffectInstance,
  type EffectModule,
  type ParamSchema,
  type ParamValues,
} from '../effects/types.ts';
import {
  configureCanvas,
  configureCanvasHdr,
  observeCanvasSize,
  type CanvasSizer,
} from '../gpu/canvas.ts';
import { configureCanvasWide } from '../gpu/colour/wide-gamut.ts';
import type { GpuSession } from '../gpu/device.ts';
import { showFallback } from '../gpu/fallback.ts';
import { createFrameLoop } from '../gpu/loop.ts';
import { createGpuProfiler, type GpuProfiler, type PassTiming } from '../gpu/profiler.ts';
import { trackTextureMemory } from '../gpu/texture-memory.ts';
import { getIntensity, observeMotionEligibility, onMotionChange } from '../shell/motion.ts';

/**
 * Seconds a stop the visitor asked for takes to ease to a halt (story 2.4). A spiral or tunnel
 * that halts at once leaves the still page appearing to move the other way (the motion
 * aftereffect); slowing over a second or more softens it. Reduced motion and leaving the view
 * stop at once.
 */
export const EASE_OUT_SECONDS = 1.2;

/** Loads (or returns) the effect module. Called again on `reload()`, so it may be a live import. */
export type EffectLoader = () => Promise<EffectModule>;

export interface EffectHostOptions {
  /** Where the fallback notice is appended. Defaults to the canvas's parent element. */
  container?: HTMLElement;
  /** Still image shown behind the fallback notice. */
  poster?: string;
  /** Label used for GPU command encoders before the module has loaded. */
  id?: string;
  /** Values to start from instead of the schema defaults. */
  initialParams?: Readonly<Record<string, unknown>>;
  /** Draw one frame and hold it; call `resume()` to animate. */
  paused?: boolean;
  /** Default 2. */
  maxDpr?: number;
  /** Resolution scale, 0..1. Default 1. */
  resolutionScale?: number;
  /** Let an effect that asks for an HDR canvas have one. Off by default. */
  allowHdr?: boolean;
  /** Let an effect that asks for a display-p3 canvas have one (story 3.3). Off by default. */
  allowWideGamut?: boolean;
  /** How fast the effect's time runs: 0.25 plays everything at a quarter speed. Default 1. */
  timeScale?: number;
}

export interface LoadedEffect {
  effect: EffectModule;
  /** Live values: mutate this object to change what the effect draws. */
  params: ParamValues<ParamSchema>;
}

export interface FrameStats {
  cpuMs: number;
  frameMs: number;
  width: number;
  height: number;
  dpr: number;
  passes: readonly PassTiming[];
  gpuMs: number | undefined;
  /** The effect's own live numbers (`EffectInstance.stats`), when it has any. */
  effect?: Readonly<Record<string, string | number>>;
}

export interface EffectHost {
  readonly canvas: HTMLCanvasElement;
  readonly loaded: LoadedEffect | undefined;
  readonly profiler: GpuProfiler | null;
  readonly paused: boolean;
  readonly resolutionScale: number;
  onLoad(listener: (loaded: LoadedEffect) => void): () => void;
  onStats(listener: (stats: FrameStats) => void): () => void;
  requestTiming(): () => void;
  /**
   * Stops and holds a frame. A running effect eases to a halt over `EASE_OUT_SECONDS` unless
   * `ease` is false (the start gate stops before a strong setting is seen).
   */
  pause(options?: { ease?: boolean }): void;
  resume(): void;
  setResolutionScale(scale: number): void;
  /** Rebuild the effect, e.g. after its code changed during development. */
  reload(): void;
  destroy(): void;
}

interface Mounted {
  device: GPUDevice;
  context: GPUCanvasContext;
  instance: EffectInstance;
  format: GPUTextureFormat;
  sizer: CanvasSizer;
  profiler: GpuProfiler;
}

function carryParams(
  schema: ParamSchema,
  previous: Readonly<Record<string, unknown>> | undefined,
): ParamValues<ParamSchema> {
  const next = defaultParams(schema);
  if (!previous) return next;
  for (const key of Object.keys(next)) {
    const old = previous[key];
    if (typeof old === typeof next[key] && Array.isArray(old) === Array.isArray(next[key])) {
      next[key] = old as ParamValues<ParamSchema>[string];
    }
  }
  return next;
}

/** Runs one effect in a canvas the caller owns. */
export function createEffectHost(
  session: GpuSession,
  canvas: HTMLCanvasElement,
  load: EffectLoader,
  options: EffectHostOptions = {},
): EffectHost {
  const container = options.container ?? canvas.parentElement ?? canvas.ownerDocument.body;
  let label = options.id ?? 'effect';

  const loadListeners = new Set<(loaded: LoadedEffect) => void>();
  const statsListeners = new Set<(stats: FrameStats) => void>();
  let mounted: Mounted | undefined;
  let loaded: LoadedEffect | undefined;
  let hideFallback: (() => void) | undefined;
  let size = { width: 0, height: 0, dpr: 1 };
  let resolutionScale = options.resolutionScale ?? 1;
  const timeScale = options.timeScale ?? 1;
  let paused = options.paused ?? false;
  let suspended = false;
  // The effect's own clock, so easing can slow it without a jump.
  let clock = 0;
  // Loop time at which an eased stop began, while one is under way, and the loop's latest time.
  let easingFrom: number | undefined;
  let loopTime = 0;
  let timingRequests = 0;
  let generation = 0;
  let destroyed = false;

  const loop = createFrameLoop((time) => {
    if (!mounted) return;
    const { device, context, instance, sizer, profiler } = mounted;
    const started = performance.now();
    loopTime = time.time;
    sizer.apply();
    profiler.beginFrame();
    const encoder = device.createCommandEncoder({ label: `${label} frame` });
    let rate = 1;
    if (easingFrom !== undefined) {
      const t = Math.min(1, (time.time - easingFrom) / EASE_OUT_SECONDS);
      rate = 1 - t * t * (3 - 2 * t);
      if (t >= 1) easingFrom = undefined;
    }
    const easing = easingFrom !== undefined;
    const delta = time.delta * timeScale * rate;
    clock += delta;
    const still = (paused || suspended) && !easing;
    instance.frame(
      { ...time, time: clock, delta, still },
      encoder,
      context.getCurrentTexture().createView(),
    );
    profiler.endFrame(encoder);
    device.queue.submit([encoder.finish()]);
    profiler.afterSubmit();
    if (still) loop.stop();

    if (statsListeners.size === 0) return;
    const stats: FrameStats = {
      cpuMs: performance.now() - started,
      frameMs: time.delta * 1000,
      ...size,
      passes: profiler.latest,
      gpuMs: profiler.latestFrameMs,
      effect: instance.stats?.(),
    };
    for (const listener of [...statsListeners]) listener(stats);
  });

  function unmount() {
    mounted?.sizer.disconnect();
    mounted?.instance.destroy();
    mounted?.profiler.destroy();
    mounted = undefined;
    hideFallback?.();
    hideFallback = undefined;
    canvas.hidden = false;
  }

  async function mount() {
    const current = ++generation;
    const state = session.state;
    if (!state.ok) {
      unmount();
      canvas.hidden = true;
      hideFallback = showFallback(container, { ...state, posterUrl: options.poster });
      return;
    }

    const { device, format } = state.gpu;
    trackTextureMemory(device);
    const profiler = createGpuProfiler(device);
    let built:
      | {
          context: GPUCanvasContext;
          instance: EffectInstance;
          format: GPUTextureFormat;
        }
      | undefined;
    let params: ParamValues<ParamSchema> | undefined;
    let module: EffectModule | undefined;
    let failure: unknown;
    device.pushErrorScope('validation');
    try {
      const effect = await load();
      module = effect;
      label = effect.meta.id;
      params = carryParams(effect.params, loaded?.params ?? options.initialParams);
      const wide =
        !(effect.hdr && options.allowHdr) && effect.wideGamut && options.allowWideGamut
          ? configureCanvasWide(canvas, device, format)
          : undefined;
      const configured = wide
        ? { context: wide.context, format, hdr: false }
        : effect.hdr && options.allowHdr
          ? configureCanvasHdr(canvas, device, format)
          : { context: configureCanvas(canvas, device, format), format, hdr: false };
      if (wide && !wide.wide) console.info(`[yearofthehorse] sRGB canvas: ${wide.reason}`);
      const { context } = configured;
      if (mounted && mounted.format !== configured.format) unmount();
      const instance = await effect.create({
        device,
        format: configured.format,
        canvas,
        params,
        profiler,
        hdr: configured.hdr,
        gamut: wide?.wide ? 'p3' : 'srgb',
      });
      built = { context, instance, format: configured.format };
    } catch (error) {
      failure = error;
    }
    const gpuError = await device.popErrorScope();
    failure ??= gpuError?.message;
    if (!built || !params || failure !== undefined) {
      built?.instance.destroy();
      profiler.destroy();
      console.error(`[yearofthehorse] could not start effect "${label}":`, failure);
      return;
    }
    const { context, instance, format: builtFormat } = built;
    if (current !== generation || destroyed) {
      instance.destroy();
      profiler.destroy();
      return;
    }

    unmount();
    const sizer = observeCanvasSize(canvas, device, {
      maxDpr: options.maxDpr,
      scale: resolutionScale,
      onPendingResize() {
        if (mounted && !canvas.ownerDocument.hidden && !loop.running) loop.start();
      },
      onResize(width, height, dpr) {
        size = { width, height, dpr };
        instance.resize(width, height, dpr);
      },
    });
    mounted = { device, context, instance, format: builtFormat, sizer, profiler };
    profiler.enabled = timingRequests > 0;
    loaded = { effect: module!, params };
    loop.start();
    for (const listener of [...loadListeners]) listener(loaded);
  }

  const applyIntensity = () => {
    const cap = getIntensity();
    canvas.style.filter = cap < 1 ? `brightness(${cap})` : '';
  };
  applyIntensity();
  const stopIntensity = onMotionChange(applyIntensity);

  // Ease into a stop when someone is watching it happen and asked for it; otherwise stop now.
  const halt = (ease: boolean) => {
    if (ease && loop.running && mounted) easingFrom ??= loopTime;
    else {
      easingFrom = undefined;
      loop.stop();
    }
  };

  const stopMotion = observeMotionEligibility(canvas, (eligible, why) => {
    suspended = !eligible;
    if (suspended || paused) halt(why === 'choice' && !paused);
    else {
      easingFrom = undefined;
      if (mounted) loop.start();
    }
  });

  const unsubscribe = [stopMotion, stopIntensity, session.onChange(() => void mount())];
  void mount();

  return {
    canvas,
    get loaded() {
      return loaded;
    },
    get profiler() {
      return mounted?.profiler ?? null;
    },
    get paused() {
      return paused || suspended;
    },
    get resolutionScale() {
      return resolutionScale;
    },
    onLoad(listener) {
      loadListeners.add(listener);
      if (loaded) listener(loaded);
      return () => loadListeners.delete(listener);
    },
    onStats(listener) {
      statsListeners.add(listener);
      return () => statsListeners.delete(listener);
    },
    requestTiming() {
      let released = false;
      timingRequests++;
      if (mounted) mounted.profiler.enabled = true;
      return () => {
        if (released) return;
        released = true;
        timingRequests--;
        if (mounted) mounted.profiler.enabled = timingRequests > 0;
      };
    },
    pause(options) {
      const wasPlaying = !paused && !suspended;
      paused = true;
      halt(wasPlaying && options?.ease !== false);
    },
    resume() {
      paused = false;
      easingFrom = undefined;
      if (mounted && !suspended) loop.start();
    },
    setResolutionScale(scale) {
      resolutionScale = Math.min(1, Math.max(0.1, scale));
      mounted?.sizer.setScale(resolutionScale);
    },
    reload() {
      void mount();
    },
    destroy() {
      destroyed = true;
      for (const stop of unsubscribe) stop();
      loadListeners.clear();
      statsListeners.clear();
      loop.stop();
      unmount();
    },
  };
}
