import type { ParamSchema } from '../../effects/types.ts';
import type { Gamut } from '../colour/wide-gamut.ts';
import { createFullscreenPipeline, renderFullscreen } from '../fullscreen.ts';
import { createBlur } from '../passes/blur.ts';
import { downsample } from '../passes/downsample.ts';
import type { PassProfiler } from '../profiler.ts';
import { withChunks } from '../shader.ts';
import { createRenderTarget, type RenderTarget } from '../targets.ts';
import { createUniformBuffer, defineUniformStruct } from '../uniforms.ts';
import shader from './colour-stage.wgsl';

/*
 * The tail's colour stage (stories 3.3 and 3.6). The effect draws into `input`; `encode` writes
 * the chain's scene from it with colour bleed, iridescence and the conversion to Display P3, as
 * asked. With all three off it is one copy pass. See colour-stage.wgsl.
 *
 * Bleed blurs a quarter-resolution copy (two 13-tap downsamples, then a separable Gaussian), so
 * its cost hardly depends on the radius.
 */

/** Spread into an effect's params to offer the colour options. Both off by default. */
export const COLOUR_PARAMS = {
  bleed: { type: 'number', default: 0, min: 0, max: 1, step: 0.01, label: 'colour bleed' },
  iridescence: { type: 'number', default: 0, min: 0, max: 1, step: 0.01 },
} as const satisfies ParamSchema;

/** Largest bleed radius, in quarter-resolution pixels (so four times that at full size). */
export const BLEED_RADIUS = 12;

const StageParams = defineUniformStruct('StageParams', {
  bleed: 'f32',
  iridescence: 'f32',
  time: 'f32',
  p3: 'u32',
});

export interface ColourStageValues {
  bleed?: number;
  iridescence?: number;
}

export interface ColourStage {
  /** Draw linear radiance here (sRGB primaries; may go below zero in P3). Read it every frame. */
  readonly input: RenderTarget;
  resize(width: number, height: number): boolean;
  encode(
    encoder: GPUCommandEncoder,
    output: GPUTextureView,
    time: number,
    values: ColourStageValues,
    profiler?: PassProfiler,
  ): void;
  destroy(): void;
}

export function createColourStage(
  device: GPUDevice,
  options: { format: GPUTextureFormat; gamut: Gamut; label?: string },
): ColourStage {
  const label = options.label ?? 'colour stage';
  const input = createRenderTarget(device, {
    label: `${label} input`,
    format: options.format,
    width: 1,
    height: 1,
    // COPY_DST too, so an image can be uploaded straight into it (and the tests can).
    usage:
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST,
  });
  const target = (name: string) =>
    createRenderTarget(device, {
      label: `${label} ${name}`,
      format: 'rgba16float',
      width: 1,
      height: 1,
    });
  const half = target('half');
  const quarter = target('quarter');
  const blurred = target('blurred');
  const blur = createBlur(device, {
    label: `${label} blur`,
    format: 'rgba16float',
    width: 1,
    height: 1,
  });
  const uniforms = createUniformBuffer(device, StageParams, `${label} params`);
  const pipeline = createFullscreenPipeline(device, {
    fragment: withChunks(shader, { 'stage-params.wgsl': StageParams.wgsl }),
    format: options.format,
  });
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  let group: GPUBindGroup | undefined;
  const rebind = () =>
    (group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: input.view },
        { binding: 1, resource: blurred.view },
        { binding: 2, resource: sampler },
        { binding: 3, resource: { buffer: uniforms.buffer } },
      ],
    }));
  rebind();

  return {
    input,
    resize(width, height) {
      const changed = input.resize(width, height);
      const w = Math.max(1, Math.ceil(width / 2));
      const h = Math.max(1, Math.ceil(height / 2));
      half.resize(w, h);
      const qw = Math.max(1, Math.ceil(w / 2));
      const qh = Math.max(1, Math.ceil(h / 2));
      quarter.resize(qw, qh);
      blurred.resize(qw, qh);
      blur.resize(qw, qh);
      if (changed) rebind();
      return changed;
    },
    encode(encoder, output, time, values, profiler) {
      const bleed = Math.min(1, Math.max(0, values.bleed ?? 0));
      if (bleed > 0) {
        downsample(device, encoder, input.view, half);
        downsample(device, encoder, half.view, quarter);
        blur.encode(encoder, quarter.view, blurred.view, {
          radius: Math.max(1, Math.round(bleed * BLEED_RADIUS)),
        });
      }
      uniforms.set({
        bleed,
        iridescence: Math.min(1, Math.max(0, values.iridescence ?? 0)),
        time,
        p3: options.gamut === 'p3' ? 1 : 0,
      });
      uniforms.upload();
      renderFullscreen(encoder, output, pipeline, [group!], {
        timestampWrites: profiler?.pass('colour'),
      });
    },
    destroy() {
      for (const t of [input, half, quarter, blurred]) t.destroy();
      blur.destroy();
      uniforms.destroy();
    },
  };
}
