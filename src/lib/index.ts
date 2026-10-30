import type { EffectModule } from '../effects/types.ts';
import { createGpuSession, type GpuSession } from '../gpu/device.ts';
import { createEffectHost, type EffectHost, type EffectHostOptions } from './host.ts';

export { createGpuSession, type GpuSession, type GpuSessionOptions } from '../gpu/device.ts';

export {
  adaptQuality,
  qualityLadder,
  EFFECT_RUNGS,
  SHARED_RUNGS,
  type AdaptiveOptions,
  type QualityGovernor,
  type QualityRung,
} from './quality.ts';
export {
  createEffectHost,
  type EffectHost,
  type EffectHostOptions,
  type EffectLoader,
  type FrameStats,
  type LoadedEffect,
} from './host.ts';
export {
  defaultParams,
  defineEffect,
  type EffectContext,
  type EffectInstance,
  type EffectMeta,
  type EffectModule,
  type ParamSchema,
  type ParamValues,
  type Scorecard,
} from '../effects/types.ts';

let shared: Promise<GpuSession> | undefined;

/** The GPU session `mount(canvas, effect)` uses: made on first use, shared by every effect. */
export function sharedSession(): Promise<GpuSession> {
  shared ??= createGpuSession();
  return shared;
}

/**
 * Mount an already-imported effect module on a canvas the caller owns (story 7.1):
 *
 *   import { mount } from 'yearofthehorse';
 *   import { effect } from 'yearofthehorse/effects/hello';
 *   const host = await mount(canvas, effect, { initialParams: { dose: 0.5 } });
 *
 * With a session first, it mounts on that session and returns at once; without one, it waits for
 * the shared session. Without WebGPU the host shows its fallback (the poster, if given) and the
 * returned host still works: `params` changes and `destroy()` are safe.
 */
export function mount(
  canvas: HTMLCanvasElement,
  effect: EffectModule,
  options?: EffectHostOptions,
): Promise<EffectHost>;
export function mount(
  session: GpuSession,
  canvas: HTMLCanvasElement,
  effect: EffectModule,
  options?: EffectHostOptions,
): EffectHost;
export function mount(
  first: GpuSession | HTMLCanvasElement,
  second: HTMLCanvasElement | EffectModule,
  third?: EffectModule | EffectHostOptions,
  fourth: EffectHostOptions = {},
): EffectHost | Promise<EffectHost> {
  const host = (
    session: GpuSession,
    canvas: HTMLCanvasElement,
    effect: EffectModule,
    options: EffectHostOptions,
  ) => createEffectHost(session, canvas, async () => effect, { id: effect.meta.id, ...options });
  if ('getContext' in first) {
    const effect = second as EffectModule;
    return sharedSession().then((session) =>
      host(session, first, effect, (third ?? {}) as EffectHostOptions),
    );
  }
  return host(first, second as HTMLCanvasElement, third as EffectModule, fourth);
}
