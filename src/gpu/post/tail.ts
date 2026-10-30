import type { FrameTime, ParamSchema } from '../../effects/types.ts';
import type { PassProfiler } from '../profiler.ts';
import type { RenderTarget } from '../targets.ts';
import type { Gamut } from '../colour/wide-gamut.ts';
import { createPostChain, type PostChain, type PostSettings } from './chain.ts';
import { createColourStage, type ColourStage } from './colour-stage.ts';
import { createNightVision, NIGHT_LEVELS, type NightLevel, type NightVision } from './night.ts';
import { ALPHA_MODES, type AlphaMode } from './output.ts';

/*
 * The HDR tail: what every fire effect ends with.
 *
 *   const tail = createHdrTail(device, { format, hdr });
 *   resize(w, h)  { tail.resize(w, h); }
 *   frame(time, encoder, target) {
 *     ...draw linear radiance into tail.scene.view (rgba16float; 1.0 is SDR white, flames are 2..50)
 *     tail.encode(encoder, target, time, params, profiler);
 *   }
 *
 * Fire is light, far brighter than the page around it. Written straight to an 8-bit canvas it
 * clips to flat orange; drawn into a float target, bloomed and tonemapped, the same values read as
 * heat. The tail is that bloom + tonemap + sRGB encode, with the same controls on every effect.
 */

/** Spread into an effect's `params` so every effect exposes the tail the same way. */
export const TAIL_PARAMS = {
  exposure: { type: 'number', default: 1, min: 0, max: 4, step: 0.01 },
  bloom: { type: 'number', default: 0.6, min: 0, max: 2, step: 0.01 },
  bloomThreshold: {
    type: 'number',
    default: 1,
    min: 0,
    max: 8,
    step: 0.05,
    label: 'bloom threshold',
  },
  bloomRadius: { type: 'number', default: 0.7, min: 0, max: 1, step: 0.01, label: 'bloom radius' },
} as const satisfies ParamSchema;

/**
 * Extra controls for an effect that is composited over the page instead of filling its box.
 *
 * The defaults are the outcome of docs/compositing-study.md: `luminance` alpha looks like additive
 * light over a dark page (within a few 8-bit steps), still reads over a light one, and is always a
 * valid premultiplied colour; an underlay of 0.3 is invisible over a dark page and keeps the flame
 * the brightest thing on a light one.
 */
export const OVERLAY_PARAMS = {
  alpha: { type: 'select', default: 'luminance', options: ALPHA_MODES },
  alphaGain: { type: 'number', default: 1, min: 0, max: 4, step: 0.05, label: 'alpha gain' },
  underlay: { type: 'number', default: 0.3, min: 0, max: 1, step: 0.01 },
} as const satisfies ParamSchema;

/**
 * Moon Temple's night vision (its story 5.6, night.ts): the scene as dark-adapted eyes see it,
 * before bloom, for an effect set at night (story 12.5). `moonlit` takes paper white as 0.1 cd/m^2,
 * `starlit` as 0.003: colour drains, blue holds up and red falls away. Spread it to offer it.
 */
export const NIGHT_PARAMS = {
  nightVision: {
    type: 'select',
    default: 'off',
    options: Object.keys(NIGHT_LEVELS) as NightLevel[],
    label: 'night vision',
  },
} as const satisfies ParamSchema;

export interface TailValues {
  exposure: number;
  bloom: number;
  bloomThreshold: number;
  bloomRadius: number;
  /** How far highlights burn to white, 0..1; see `OutputSettings.whiten`. */
  burn?: number;
  /** Present when the effect spread `COLOUR_PARAMS` (colour-stage.ts). */
  bleed?: number;
  iridescence?: number;
  /** Present when the effect spread `OVERLAY_PARAMS`; otherwise the output is opaque. */
  alpha?: string;
  alphaGain?: number;
  underlay?: number;
  /** Present when the effect spread `NIGHT_PARAMS`: a key of NIGHT_LEVELS; anything else is off. */
  nightVision?: string;
}

export interface HdrTailOptions {
  /** Format of the view passed to `frame` (`ctx.format`). */
  format: GPUTextureFormat;
  /** `ctx.hdr`: the canvas is extended-range, so highlights keep rising instead of clipping. */
  hdr?: boolean;
  /** Start the bloom chain at half the scene size (default) or at full size. */
  bloomHalfResolution?: boolean;
  /**
   * `ctx.gamut`: on `p3` the scene is converted to Display P3 primaries for a display-p3 canvas
   * (story 3.3), through the colour stage.
   */
  gamut?: Gamut;
  /** Add the colour stage for `COLOUR_PARAMS` (bleed, iridescence; story 3.6). */
  colour?: boolean;
  label?: string;
}

export interface HdrTail {
  /** Draw linear radiance here. Its `view` changes on resize, so read it every frame. */
  readonly scene: RenderTarget;
  /** The parts, for an effect that needs to drive them directly. */
  readonly chain: PostChain;
  /** Returns true when the scene target was reallocated. */
  resize(width: number, height: number): boolean;
  /** Bloom, tonemap and encode the scene into `target`. `overrides` win over `values`. */
  encode(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    time: FrameTime,
    values: TailValues,
    profiler?: PassProfiler,
    overrides?: PostSettings,
  ): void;
  destroy(): void;
}

const isAlphaMode = (value: string | undefined): value is AlphaMode =>
  (ALPHA_MODES as readonly string[]).includes(value ?? '');

/** The post settings a set of tail values stands for. */
export function tailSettings(values: TailValues, time: FrameTime, hdr = false): PostSettings {
  return {
    bloom:
      values.bloom > 0
        ? {
            intensity: values.bloom,
            threshold: values.bloomThreshold,
            radius: values.bloomRadius,
          }
        : false,
    output: {
      exposure: values.exposure,
      frame: time.frame,
      hdr,
      alpha: isAlphaMode(values.alpha) ? values.alpha : 'opaque',
      alphaGain: values.alphaGain,
      underlay: values.underlay,
      whiten: values.burn,
    },
  };
}

export function createHdrTail(device: GPUDevice, options: HdrTailOptions): HdrTail {
  const chain = createPostChain(device, {
    canvasFormat: options.format,
    width: 1,
    height: 1,
    bloomHalfResolution: options.bloomHalfResolution,
    label: options.label ?? 'tail',
  });
  const hdr = options.hdr === true;
  // The colour stage sits between the effect and the chain, only when it has work to do.
  const stage: ColourStage | undefined =
    options.gamut === 'p3' || options.colour
      ? createColourStage(device, {
          format: chain.scene.format,
          gamut: options.gamut ?? 'srgb',
          label: `${options.label ?? 'tail'} colour`,
        })
      : undefined;

  let night: NightVision | undefined;
  return {
    get scene() {
      return stage ? stage.input : chain.scene;
    },
    chain,
    resize(width, height) {
      const changed = chain.resize(width, height);
      return (stage?.resize(width, height) ?? false) || changed;
    },
    encode(encoder, target, time, values, profiler, overrides) {
      stage?.encode(encoder, chain.scene.view, time.time, values, profiler);
      const whiteCd = NIGHT_LEVELS[values.nightVision as NightLevel] ?? 0;
      if (whiteCd > 0) {
        night ??= createNightVision(device);
        night.encode(encoder, chain.scene, whiteCd, profiler);
      }
      const settings = tailSettings(values, time, hdr);
      // Bloom overrides refine the bloom the values asked for. When the values turned it off
      // (intensity 0), an override brings it back only by naming an intensity of its own.
      const over = overrides?.bloom;
      const bloom =
        over === undefined
          ? settings.bloom
          : over === false
            ? false
            : settings.bloom === false
              ? over.intensity !== undefined && over
              : { ...settings.bloom, ...over };
      chain.encode(
        encoder,
        target,
        { bloom, output: { ...settings.output, ...overrides?.output } },
        profiler,
      );
    },
    destroy() {
      stage?.destroy();
      night?.destroy();
      chain.destroy();
    },
  };
}
