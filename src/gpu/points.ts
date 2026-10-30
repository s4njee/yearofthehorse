import type { PassProfiler } from './profiler.ts';
import { createShader, withChunks } from './shader.ts';
import { createUniformBuffer, defineUniformStruct, uniformArray } from './uniforms.ts';
import { apertureUniforms, type ApertureSettings } from './optics/aperture.ts';
import pointsShader from './points/points.wgsl';

/*
 * Energy-conserving points of light (story 2.3), research.md's shared "point-source rendering":
 * stars, sparks, fireflies, glints and bokeh. Each point carries its total light and a signed
 * circle-of-confusion radius; it is drawn as the aperture's shape at that size, and the light it
 * adds to the target sums to its own, whatever its size, shape or position between pixels. So a
 * point that drifts never crawls or shimmers, and one that leaves focus spreads its light out
 * rather than gaining it.
 *
 *   const points = createPointLayer(device, { label, format: tail.scene.format });
 *   points.setPoints(data, count);                 // POINT_FLOATS floats per point
 *   points.encode(encoder, tail.scene.view, { width, height, aperture }, profiler);
 *
 * The layer draws additively onto the target as it is (`clear` to start from a colour).
 */

/** Floats per point: (x, y, radius, unused) in device pixels, then (r, g, b, unused). */
export const POINT_FLOATS = 8;
const INITIAL_POINTS = 1024;

const PointsParams = defineUniformStruct('PointsParams', {
  out_size: 'vec2f',
  gain: 'f32',
  axial: 'f32',
  lateral: 'f32',
  blur_at_infinity: 'f32',
  blades: 'f32',
  rotation: 'f32',
  curvature: 'f32',
  unit_area: 'f32',
  rim: 'f32',
  rings: 'f32',
  ring_count: 'f32',
  vignette: 'f32',
  obstruction: 'f32',
  profile_mean: 'f32',
  use_table: 'f32',
  table: uniformArray('vec4f', 16),
});

export interface PointLayerOptions {
  label: string;
  /** The target's format. Default `rgba16float`. */
  format?: GPUTextureFormat;
}

export interface PointFrame {
  /** Target size, device pixels. */
  width: number;
  height: number;
  aperture: ApertureSettings;
  /** Multiplies every point's light. Default 1. */
  gain?: number;
  /** Clear the target to this colour first; default draw onto it as it is. */
  clear?: GPUColor;
  /**
   * Chromatic aberration (story 2.4): `axial` shifts each colour's focus by that share (red farther,
   * blue nearer), `lateral` magnifies each colour by that share about the image centre (red out,
   * blue in). Axial needs the lens's blur at infinity, device pixels. Default none.
   */
  chroma?: { axial: number; lateral: number; blurAtInfinity: number };
}

export interface PointLayer {
  setPoints(data: Float32Array, count: number): void;
  encode(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    frame: PointFrame,
    profiler?: PassProfiler,
  ): void;
  destroy(): void;
}

export function createPointLayer(device: GPUDevice, options: PointLayerOptions): PointLayer {
  const { label } = options;
  const format = options.format ?? 'rgba16float';
  const uniforms = createUniformBuffer(device, PointsParams, `${label} points`);
  const module = createShader(
    device,
    withChunks(pointsShader, { 'points-params.wgsl': PointsParams.wgsl }),
  );
  const add: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one', operation: 'add' };
  const pipeline = device.createRenderPipeline({
    label: `${label} points`,
    layout: 'auto',
    vertex: { module, entryPoint: 'points_vs' },
    fragment: {
      module,
      entryPoint: 'points_fs',
      targets: [{ format, blend: { color: add, alpha: add } }],
    },
  });

  let capacity = 0;
  let buffer: GPUBuffer | undefined;
  let group: GPUBindGroup | undefined;
  let count = 0;
  let apertureKey = '';

  function ensureCapacity(points: number) {
    if (points <= capacity && buffer) return;
    capacity = Math.max(INITIAL_POINTS, 2 ** Math.ceil(Math.log2(Math.max(1, points))));
    buffer?.destroy();
    buffer = device.createBuffer({
      label: `${label} points`,
      size: capacity * POINT_FLOATS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    group = device.createBindGroup({
      label: `${label} points`,
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer } },
        { binding: 1, resource: { buffer: uniforms.buffer } },
      ],
    });
  }
  ensureCapacity(INITIAL_POINTS);
  let shape = apertureUniforms({
    blades: 0,
    rotation: 0,
    curvature: 0,
    rim: 0,
    rings: 0,
    ringCount: 1,
    vignette: 0,
  });

  return {
    setPoints(data, points) {
      ensureCapacity(points);
      count = points;
      if (points > 0) device.queue.writeBuffer(buffer!, 0, data, 0, points * POINT_FLOATS);
    },
    encode(encoder, target, frame, profiler) {
      // The shape's area is a sum over angles: only redone when the aperture changes.
      const key = JSON.stringify(frame.aperture);
      if (key !== apertureKey) {
        apertureKey = key;
        shape = apertureUniforms(frame.aperture);
      }
      uniforms.set({
        out_size: [frame.width, frame.height],
        gain: frame.gain ?? 1,
        axial: frame.chroma?.axial ?? 0,
        lateral: frame.chroma?.lateral ?? 0,
        blur_at_infinity: frame.chroma?.blurAtInfinity ?? 0,
        ...shape,
      });
      uniforms.upload();
      const pass = encoder.beginRenderPass({
        label: `${label} points`,
        colorAttachments: [
          frame.clear
            ? { view: target, loadOp: 'clear', clearValue: frame.clear, storeOp: 'store' }
            : { view: target, loadOp: 'load', storeOp: 'store' },
        ],
        timestampWrites: profiler?.pass('points'),
      });
      if (count > 0) {
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, group!);
        pass.draw(6, count);
      }
      pass.end();
    },
    destroy() {
      buffer?.destroy();
      uniforms.destroy();
    },
  };
}

/** Collects points for `setPoints` frame by frame, growing as needed. */
export class PointList {
  data = new Float32Array(256 * POINT_FLOATS);
  count = 0;

  clear(): void {
    this.count = 0;
  }

  /** A point at (x, y) device pixels with signed radius `radius` and total light (r, g, b). */
  push(x: number, y: number, radius: number, r: number, g: number, b: number): void {
    if ((this.count + 1) * POINT_FLOATS > this.data.length) {
      const grown = new Float32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    this.data.set([x, y, radius, 0, r, g, b, 0], this.count * POINT_FLOATS);
    this.count++;
  }

  upload(layer: PointLayer): void {
    layer.setPoints(this.data, this.count);
  }
}
