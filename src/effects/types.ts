import type { Gamut } from '../gpu/colour/wide-gamut.ts';
import type { PassProfiler } from '../gpu/profiler.ts';
import type { FrameTime as LoopTime } from '../gpu/types.ts';

export interface FrameTime extends LoopTime {
  /**
   * True when this frame is the one the host will hold: the effect is paused (reduced motion, the
   * motion switch, a thumbnail out of view) and this frame stays on screen until it resumes. A
   * still frame should show the effect's subject at rest: no flare or ambient flash frozen over
   * the scene (Storm Temple's story 6.2).
   */
  still?: boolean;
}

export type Tier = 'A' | 'B' | 'C';

export interface EffectMeta {
  /** URL-safe and unique; matches the effect's directory name. */
  id: string;
  title: string;
  /** Epic number in plan.md, e.g. "4". */
  epic: string;
  tier: Tier;
  tags: readonly string[];
  summary?: string;
  scorecard?: Scorecard;
  /**
   * The page context the effect page opens in (`src/shell/contexts.ts`), when it is not the bare
   * canvas: an effect that lights the page opens on a page. The gallery, posters and tests always
   * use the bare canvas.
   */
  layout?: string;
}

/** The practicality verdict shown beside each effect. Leave a field out until it is known. */
export interface Scorecard {
  /** Needs compute shaders, so there is no WebGL2 fallback path. */
  compute: boolean;
  /** Holds its tier budget on phones. */
  mobile: 'yes' | 'no' | 'untested';
  /** Optional WebGPU features: `required` ones gate the effect, `optional` ones improve it. */
  features?: { required?: readonly GPUFeatureName[]; optional?: readonly GPUFeatureName[] };
  /**
   * How close the effect comes to the WCAG 2.3.1 flash thresholds at its default settings:
   * `none` has no rapid large-area brightness change, `low` flickers but stays well under three
   * flashes a second over a quarter of the view, `high` can exceed that and needs the flicker cap
   * or a warning. `unmeasured` until someone has looked.
   */
  flash?: 'none' | 'low' | 'high' | 'unmeasured';
  /**
   * Presets that go over the flash threshold even though the defaults do not. The controls label
   * them, and `tests/flash.test.ts` fails if a preset measures over the threshold without being
   * named here.
   */
  flashPresets?: readonly string[];
  /**
   * How close the effect comes to the regular-pattern limit at its default settings (story 2.2,
   * `src/gpu/safety/pattern.ts`): `none` has no regular high-contrast pattern, `low` has one
   * under the area limit, `high` covers more than it. Defaults may never be `high`.
   */
  pattern?: 'none' | 'low' | 'high' | 'unmeasured';
  /**
   * Presets over the pattern limit. `tests/pattern.test.ts` fails a preset that measures over it
   * without being named here, and the shell starts it behind the gate (story 2.6).
   */
  patternPresets?: readonly string[];
  /**
   * Presets over the whole-field motion caps (story 2.4, `tests/motion.ts`). Checked by
   * `tests/motion.test.ts`, and started behind the gate.
   */
  motionPresets?: readonly string[];
  /**
   * Whether it reads over a light page: `yes` as it is, `underlay` only with a dark underlay or
   * backplate behind it, `no` when it needs a dark region of its own.
   */
  lightPage?: 'yes' | 'underlay' | 'no' | 'untested';
  /** What a site should show where WebGPU is unavailable. */
  fallback: string;
  useCases: readonly string[];
  /** Gzipped size of the effect's own chunk, in kilobytes. */
  bundleKb?: number;
  /**
   * Measured GPU time per frame, per reference device, from a benchmark run (Epic 13), not from
   * a glance at the HUD. `resolution` is given when it was not measured at 1080p.
   */
  gpuMs?: readonly {
    device: string;
    ms: number;
    resolution?: string;
    /**
     * What kind of GPU it is: `integrated`, `apple-silicon`, `discrete`, `phone`. The A and B
     * budgets are set for an integrated GPU, so a time from a faster class does not settle them.
     */
    deviceClass?: string;
    /**
     * How the time was taken. `marginal` (the default) is the cost of one more frame of the same
     * work, measured on Dawn by `npm run study`. `browser-span` is one frame alone as a browser
     * reports it (`npm run browser-check`): it includes the browser's timing floor and is what a
     * visitor's machine actually does.
     */
    method?: 'marginal' | 'browser-span';
  }[];
}

export type ParamDef =
  | { type: 'number'; default: number; min: number; max: number; step?: number; label?: string }
  | { type: 'boolean'; default: boolean; label?: string }
  /** Linear RGB, each channel 0..1. */
  | { type: 'color'; default: readonly [number, number, number]; label?: string }
  | { type: 'select'; default: string; options: readonly string[]; label?: string }
  /**
   * A gradient palette of OKLCH stops, as `formatPalette` text (`src/gpu/colour/palette.ts`):
   * `L C h` per stop, hue in degrees, stops separated by commas. Edited in the shell's palette
   * editor, carried in links, baked by `createPaletteTexture`.
   */
  | { type: 'palette'; default: string; label?: string }
  /** A short free text, such as a heading to letter (Temple of Time's story 1.6). At most `maxLength` characters. */
  | { type: 'text'; default: string; maxLength?: number; label?: string };

/** One schema drives the control panel, the docs table, and URL state. */
export type ParamSchema = Record<string, ParamDef>;

export type ParamValue<D extends ParamDef> = D extends { type: 'number' }
  ? number
  : D extends { type: 'boolean' }
    ? boolean
    : D extends { type: 'color' }
      ? [number, number, number]
      : string;

export type ParamValues<S extends ParamSchema> = { -readonly [K in keyof S]: ParamValue<S[K]> };

export interface EffectContext<S extends ParamSchema = ParamSchema> {
  device: GPUDevice;
  /**
   * Format of the texture view passed to `frame`. When `hdr` is true this is `rgba16float`;
   * build pipelines for this format rather than assuming bgra8unorm.
   */
  format: GPUTextureFormat;
  /**
   * True when the effect asked for HDR output (`EffectModule.hdr`) and got it: the canvas is
   * `rgba16float` with extended tone mapping, 1.0 is SDR white and larger values are brighter
   * (sRGB-encoded like any srgb canvas, so still call `linear_to_srgb`). Always false for effects
   * that did not ask, and false on SDR displays, in Firefox, and when configuring failed.
   */
  hdr?: boolean;
  /**
   * `p3` when the effect asked for a wide-gamut canvas (`EffectModule.wideGamut`) and got a
   * confirmed `display-p3` one (story 3.3): map colours into P3 (`gamutMapOklchIn`,
   * `safe_colour_in`) and pass this to `createHdrTail`, which converts the scene. `srgb` (or
   * absent) otherwise: map into sRGB, by chroma.
   */
  gamut?: Gamut;
  canvas: HTMLCanvasElement;
  /** Live values. The shell mutates this object; read it every frame rather than copying it. */
  params: ParamValues<S>;
  /**
   * Per-pass GPU timing for the performance HUD. Give each pass
   * `timestampWrites: profiler.pass('label')`; it is undefined when timing is unavailable.
   */
  profiler: PassProfiler;
}

export interface EffectInstance {
  /** Called once before the first frame and again whenever the drawing buffer changes size. */
  resize(width: number, height: number, dpr: number): void;
  /** Encode this frame's passes. The shell owns the encoder and submits it. */
  frame(time: FrameTime, encoder: GPUCommandEncoder, target: GPUTextureView): void;
  /** Release every GPU resource and listener the effect created. */
  destroy(): void;
  /**
   * Optional live numbers for the performance HUD, one row each (e.g. `{ live: 12345 }`). Called
   * after a frame only while the HUD is open; return the same keys every time, and keep it cheap
   * (no GPU read-back: a particle system's `stats` is already read back a few frames late).
   */
  stats?(): Readonly<Record<string, string | number>>;
}

export interface EffectModule<S extends ParamSchema = ParamSchema> {
  meta: EffectMeta;
  params: S;
  /**
   * Opt in to an HDR canvas where the display and browser support one. The host falls back to the
   * normal SDR canvas otherwise; `ctx.hdr` says which one the effect got. Default false.
   */
  hdr?: boolean;
  /**
   * Opt in to a `display-p3` canvas where the display covers P3 and the page allows it (story
   * 3.3). `ctx.gamut` says which the effect got. Not combined with `hdr`: an HDR canvas wins.
   */
  wideGamut?: boolean;
  presets?: Readonly<Record<string, Partial<ParamValues<S>>>>;
  create(ctx: EffectContext<S>): Promise<EffectInstance>;
}

/** Identity helper that infers the param schema so `ctx.params` is typed inside `create`. */
export function defineEffect<const S extends ParamSchema>(
  effect: EffectModule<S>,
): EffectModule<S> {
  return effect;
}

export function defaultParams<S extends ParamSchema>(schema: S): ParamValues<S> {
  const values: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(schema)) {
    values[key] = def.type === 'color' ? [...def.default] : def.default;
  }
  return values as ParamValues<S>;
}
