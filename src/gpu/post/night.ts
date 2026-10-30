/*
 * Moon Temple's night vision (its story 5.6), brought over for story 12.5: the scene as dark-adapted eyes see it, a pass the tail runs before bloom
 * when an effect's `nightVision` is not `off`. See night.wgsl for the model; `nightColour` is its
 * twin for the tests.
 */
import { createFullscreenPipeline, renderFullscreen } from '../fullscreen.ts';
import type { PassProfiler } from '../profiler.ts';
import { createRenderTarget, type RenderTarget } from '../targets.ts';
import shader from './night.wgsl';

/** What paper white stands for, cd/m^2, by setting. */
export const NIGHT_LEVELS = { off: 0, moonlit: 0.1, starlit: 0.003 } as const;
export type NightLevel = keyof typeof NIGHT_LEVELS;

const BLUE = [1.05, 0.97, 1.27] as const;
const V_WHITE = 2.5731;

function scotopic([r, g, b]: readonly number[]): number {
  const x = 0.4124 * r! + 0.3576 * g! + 0.1805 * b!;
  const y = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  const z = 0.0193 * r! + 0.1192 * g! + 0.9505 * b!;
  if (x <= 1e-6) return 0;
  return Math.max(y * (1.33 * (1 + (y + z) / x) - 1.68), 0) / V_WHITE;
}

/** The cones' share at luminance `y` (scene units) when paper white is `whiteCd` cd/m^2. */
export function photopicShare(y: number, whiteCd: number): number {
  const t = Math.min(1, Math.max(0, (Math.log10(Math.max(y * whiteCd, 1e-8)) + 2) / 2.6));
  return t * t;
}

/** One linear colour as night vision shows it (no acuity loss). */
export function nightColour(rgb: readonly number[], whiteCd: number): [number, number, number] {
  const y = 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
  const w = photopicShare(y, whiteCd);
  const v = scotopic(rgb);
  return [0, 1, 2].map((c) => w * rgb[c]! + (1 - w) * v * BLUE[c]!) as [number, number, number];
}

export interface NightVision {
  /** Turns `scene` into what dark-adapted eyes see, in place (through a scratch target). */
  encode(
    encoder: GPUCommandEncoder,
    scene: RenderTarget,
    whiteCd: number,
    profiler?: PassProfiler,
  ): void;
  destroy(): void;
}

export function createNightVision(device: GPUDevice): NightVision {
  const uniforms = device.createBuffer({
    label: 'night vision',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  let pipelines: { night: GPURenderPipeline; copy: GPURenderPipeline } | undefined;
  let scratch: RenderTarget | undefined;
  return {
    encode(encoder, scene, whiteCd, profiler) {
      const format = scene.format;
      pipelines ??= {
        night: createFullscreenPipeline(device, {
          fragment: shader,
          entryPoint: 'night_vision',
          format,
        }),
        copy: createFullscreenPipeline(device, {
          fragment: shader,
          entryPoint: 'night_copy',
          format,
        }),
      };
      const { width, height } = scene.texture;
      scratch ??= createRenderTarget(device, { label: 'night vision', format, width, height });
      scratch.resize(width, height);
      // Rod acuity: about a pixel and a half of blur at 1080p in full scotopic vision.
      device.queue.writeBuffer(
        uniforms,
        0,
        new Float32Array([whiteCd, 1.5 * (height / 1080), 0, 0]),
      );
      // The copy reads no uniforms, so its automatic layout has only the texture.
      const group = (pipeline: GPURenderPipeline, source: GPUTextureView, withUniforms: boolean) =>
        device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            ...(withUniforms ? [{ binding: 0, resource: { buffer: uniforms } }] : []),
            { binding: 1, resource: source },
          ],
        });
      renderFullscreen(
        encoder,
        scratch.view,
        pipelines.night,
        [group(pipelines.night, scene.view, true)],
        {
          timestampWrites: profiler?.pass('night vision'),
        },
      );
      renderFullscreen(encoder, scene.view, pipelines.copy, [
        group(pipelines.copy, scratch.view, false),
      ]);
    },
    destroy() {
      uniforms.destroy();
      scratch?.destroy();
    },
  };
}
