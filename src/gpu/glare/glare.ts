/*
 * Glare round bright lights (stories 2.6 and 2.7): diffraction spikes and an anamorphic streak, one
 * thin instanced quad per ray, added to the scene. See glare.wgsl for the profile and why the rays
 * carry exactly the share of the light they are given.
 *
 *   const glare = createGlareLayer(device, { label, format: tail.scene.format });
 *   glare.setLights(data, count);           // GLARE_FLOATS floats per light
 *   glare.encode(encoder, tail.scene.view, { width, height, spikes: 6, ... }, profiler);
 */
import type { PassProfiler } from '../profiler.ts';
import { createShader, withChunks } from '../shader.ts';
import { createUniformBuffer, defineUniformStruct } from '../uniforms.ts';
import shader from './glare.wgsl';

/** Floats per light: (x, y, unused, unused) in device pixels, then (r, g, b, unused). */
export const GLARE_FLOATS = 8;

const GlareParams = defineUniformStruct('GlareParams', {
  out_size: 'vec2f',
  spikes: 'f32',
  rotation: 'f32',
  chroma: 'vec3f',
  length: 'f32',
  width: 'f32',
  spike_share: 'f32',
  streak_share: 'f32',
  streak_length: 'f32',
});

export interface GlareFrame {
  width: number;
  height: number;
  /** Number of rays; a polygon of n blades gives n for even n and 2n for odd. */
  spikes: number;
  /** Radians. */
  rotation: number;
  /** Decay length of a ray, device pixels. */
  length: number;
  /** Half-width of a ray, device pixels (a Gaussian's sigma). */
  thickness: number;
  /** Share of each light that goes into its rays, 0..1. */
  spikeShare: number;
  /** Share that goes into the horizontal streak, 0..1; its decay length. */
  streakShare?: number;
  streakLength?: number;
  /** Per-channel scale of the lengths: diffraction spreads red furthest. Default (1.15, 1, 0.85). */
  chroma?: readonly [number, number, number];
}

export interface GlareLayer {
  setLights(data: Float32Array, count: number): void;
  encode(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    frame: GlareFrame,
    profiler?: PassProfiler,
  ): void;
  destroy(): void;
}

/** The spike count of a polygonal aperture: each pair of parallel blade edges diffracts one line. */
export function spikesFor(blades: number): number {
  if (blades < 3) return 0;
  return blades % 2 === 0 ? blades : 2 * blades;
}

export function createGlareLayer(
  device: GPUDevice,
  options: { label: string; format?: GPUTextureFormat },
): GlareLayer {
  const { label } = options;
  const format = options.format ?? 'rgba16float';
  const uniforms = createUniformBuffer(device, GlareParams, `${label} glare`);
  const module = createShader(
    device,
    withChunks(shader, { 'glare-params.wgsl': GlareParams.wgsl }),
  );
  const add: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one', operation: 'add' };
  const pipeline = device.createRenderPipeline({
    label: `${label} glare`,
    layout: 'auto',
    vertex: { module, entryPoint: 'glare_vs' },
    fragment: {
      module,
      entryPoint: 'glare_fs',
      targets: [{ format, blend: { color: add, alpha: add } }],
    },
  });
  let capacity = 0;
  let buffer: GPUBuffer | undefined;
  let group: GPUBindGroup | undefined;
  let count = 0;

  function ensure(lights: number) {
    if (lights <= capacity && buffer) return;
    capacity = Math.max(64, 2 ** Math.ceil(Math.log2(Math.max(1, lights))));
    buffer?.destroy();
    buffer = device.createBuffer({
      label: `${label} glare lights`,
      size: capacity * GLARE_FLOATS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer } },
        { binding: 1, resource: { buffer: uniforms.buffer } },
      ],
    });
  }
  ensure(64);

  return {
    setLights(data, lights) {
      ensure(lights);
      count = lights;
      if (lights > 0) device.queue.writeBuffer(buffer!, 0, data, 0, lights * GLARE_FLOATS);
    },
    encode(encoder, target, frame, profiler) {
      uniforms.set({
        out_size: [frame.width, frame.height],
        spikes: frame.spikes,
        rotation: frame.rotation,
        chroma: frame.chroma ? [...frame.chroma] : [1.15, 1, 0.85],
        length: Math.max(frame.length, 0.5),
        width: Math.max(frame.thickness, 0.3),
        spike_share: frame.spikes > 0 ? frame.spikeShare : 0,
        streak_share: frame.streakShare ?? 0,
        streak_length: Math.max(frame.streakLength ?? 1, 0.5),
      });
      uniforms.upload();
      const pass = encoder.beginRenderPass({
        label: `${label} glare`,
        colorAttachments: [{ view: target, loadOp: 'load', storeOp: 'store' }],
        timestampWrites: profiler?.pass('glare'),
      });
      // One thin quad per ray: the spikes, and the streak's two rays when it has a share.
      const rays = (frame.spikes > 0 ? frame.spikes : 0) + ((frame.streakShare ?? 0) > 0 ? 2 : 0);
      if (count > 0 && rays > 0) {
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, group!);
        pass.draw(6, count * rays);
      }
      pass.end();
    },
    destroy() {
      buffer?.destroy();
      uniforms.destroy();
    },
  };
}
