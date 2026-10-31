import type {
  EffectContext,
  EffectInstance,
  ParamSchema,
  ParamValues,
} from '../../effects/types.ts';
import { createHdrTail, OVERLAY_PARAMS, TAIL_PARAMS } from '../post/index.ts';
import type { PassProfiler } from '../profiler.ts';
import { createRenderTarget } from '../targets.ts';
import { DOSE_PARAMS, dosed, heldDose } from '../safety/dose.ts';
import { starColours } from '../spectra/emission.ts';
import { createShellRenderer, type ShellRenderer } from './render.ts';
import { activeShells, heldTime, programme, type ProgrammeOptions, type Shell } from './shell.ts';

/*
 * A fireworks show as an effect (M1): a looping programme of shells (2.3), drawn by the shell
 * renderer (render.ts) into the HDR tail. Every display effect is one of these with its own
 * shells, so the view, the held frame, the dose and the trails behave the same everywhere.
 */

/** The controls every show has. Spread them, then override a default where an effect differs. */
export const SHOW_PARAMS = {
  ...DOSE_PARAMS,
  /** How much sky the view takes in, metres from the bottom of the view to the top. */
  sky: { type: 'number', default: 360, min: 160, max: 800, step: 10 },
  seed: { type: 'number', default: 1, min: 1, max: 99, step: 1 },
  /** The eye's short streaks, or a camera's exposure (2.5). */
  trails: { type: 'select', default: 'eye', options: ['eye', 'camera'] },
  shutter: { type: 'number', default: 2, min: 0.25, max: 8, step: 0.25, label: 'shutter (s)' },
  ...TAIL_PARAMS,
  ...OVERLAY_PARAMS,
} as const satisfies ParamSchema;

export type ShowValues = ParamValues<typeof SHOW_PARAMS>;

export interface ShowOptions<V extends ShowValues = ShowValues> {
  label: string;
  /** Shells a minute: held, at the default intensity, and at full intensity. */
  rate: readonly [number, number, number];
  /** Seconds before the programme repeats. Default 60. */
  period?: number;
  /** Fewest seconds between breaks. Default 0.9. */
  gap?: number;
  /** Share of each shell size, small to large. */
  mix?: ProgrammeOptions['mix'];
  /** Share of the view's width the firing line takes. Default 0.8. */
  spread?: number;
  /** Makes each plain shell the effect's own. */
  design?: (shell: Shell, h: (k: number) => number, index: number, params: V) => Shell;
  /**
   * The whole programme, written by the effect instead of made by the seed (a tour of the kinds,
   * act by act): given the shells a minute the dose asks for, the period and the firing line's
   * width, metres. `design` is not applied to it.
   */
  script?: (rate: number, period: number, width: number, params: V) => Shell[];
  /**
   * The part of the programme the held moment is chosen from, seconds (a scripted show's first
   * act, so play starts there). Default: all of it.
   */
  hold?: readonly [number, number];
  /** Shells added to the programme the seed made (a finale), given the period. */
  extra?: (list: readonly Shell[], period: number, params: V) => Shell[];
  /** Params the design reads: the programme is remade when they change. */
  keys?: readonly (keyof V & string)[];
  /** Light of a star against paper white, before the dose. Default 2.2. */
  brightness?: number;
  /** Flat shapes for shaped shells (3.6). */
  shapes?: readonly Float32Array[];
  /** The bottom of the view, as a share of `sky` above the ground. Default 0.22. */
  ground?: number;
  /** How fast shed sparks fall, metres a second. */
  fall?: number;
  /**
   * Layers over the stars (smoke, a river: 3.8). With them, the stars are drawn into a target of
   * their own, and `compose` draws the scene from it.
   */
  compose?: (device: GPUDevice, format: GPUTextureFormat) => ShowLayers;
}

/** What a show's layers are told each frame. */
export interface ShowFrame {
  list: readonly Shell[];
  active: readonly Shell[];
  /** Seconds into the programme, and its period. */
  now: number;
  period: number;
  colours: ReadonlyMap<string, readonly number[]>;
  width: number;
  height: number;
  scale: number;
  ground: number;
}

export interface ShowLayers {
  resize(width: number, height: number): void;
  /** Draws the scene into `scene` from the stars in `stars`. */
  encode(
    encoder: GPUCommandEncoder,
    stars: GPUTextureView,
    scene: GPUTextureView,
    frame: ShowFrame,
    profiler: PassProfiler,
  ): void;
  destroy(): void;
}

export async function createShow<V extends ShowValues>(
  ctx: Pick<EffectContext, 'device' | 'format' | 'hdr' | 'gamut' | 'profiler'> & { params: V },
  options: ShowOptions<V>,
): Promise<EffectInstance & { stars: ShellRenderer }> {
  const { device, format, hdr, gamut, params, profiler } = ctx;
  const period = options.period ?? 60;
  const tail = createHdrTail(device, { format, hdr, gamut, label: options.label });
  const stars = createShellRenderer(device, {
    format: tail.scene.format,
    label: `${options.label} stars`,
    shapes: options.shapes,
  });
  const colours = starColours(gamut ?? 'srgb');
  const layers = options.compose?.(device, tail.scene.format);
  const starTarget = layers
    ? createRenderTarget(device, {
        label: `${options.label} stars`,
        format: tail.scene.format,
        width: 1,
        height: 1,
      })
    : undefined;
  let width = 1;
  let height = 1;
  let clock = 0;
  let list: Shell[] = [];
  let listKey = '';
  let held = 0;
  let drawn = 0;

  return {
    stars,
    resize(w, h) {
      width = w;
      height = h;
      tail.resize(w, h);
      starTarget?.resize(w, h);
      layers?.resize(w, h);
    },
    frame(time, encoder, target) {
      const dose = time.still ? heldDose(params.dose) : params.dose;
      // The view starts a little above the ground, as a viewer some way off sees the sky.
      const ground = (options.ground ?? 0.22) * params.sky;
      const scale = height / (params.sky - ground);
      const rate = Math.max(1, Math.round(dosed(dose, ...options.rate)));
      const across = width / scale;
      const extra = (options.keys ?? []).map((k) => String(params[k])).join(':');
      const key = `${rate}:${params.seed}:${Math.round(across)}:${extra}`;
      if (key !== listKey) {
        const line = across * (options.spread ?? 0.8);
        list = options.script
          ? options.script(rate, period, line, params)
          : programme(params.seed, {
              rate,
              period,
              width: line,
              gap: options.gap ?? 0.9,
              mix: options.mix,
              design: options.design && ((s, h, i) => options.design!(s, h, i, params)),
            });
        if (options.extra) list = [...list, ...options.extra(list, period, params)];
        held = heldTime(list, period, options.hold);
        // Play starts from the held moment, so the page opens with shells already open, and a
        // held frame is the frame playing would show first.
        if (!listKey) clock = held;
        listKey = key;
      }
      clock += time.delta;
      const now = time.still ? held : clock;
      const active = activeShells(list, now, period);
      drawn = stars.update(active, colours, {
        width,
        height,
        scale,
        ground,
        brightness: (options.brightness ?? 2.2) * dosed(dose, 0.5, 1, 1.15),
        shutter: params.trails === 'camera' ? params.shutter : 0,
        fall: options.fall,
      });
      const pass = encoder.beginRenderPass({
        label: `${options.label} stars`,
        colorAttachments: [
          {
            view: starTarget ? starTarget.view : tail.scene.view,
            loadOp: 'clear',
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            storeOp: 'store',
          },
        ],
        timestampWrites: profiler.pass('stars'),
      });
      stars.draw(pass);
      pass.end();
      layers?.encode(
        encoder,
        starTarget!.view,
        tail.scene.view,
        { list, active, now, period, colours, width, height, scale, ground },
        profiler,
      );
      tail.encode(encoder, target, time, params, profiler);
    },
    stats() {
      return { shells: drawn };
    },
    destroy() {
      stars.destroy();
      layers?.destroy();
      starTarget?.destroy();
      tail.destroy();
    },
  };
}
