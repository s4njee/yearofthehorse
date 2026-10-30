import { createFullscreenPipeline, renderFullscreen } from './fullscreen.ts';
import type { PassProfiler } from './profiler.ts';
import { createShader, withChunks, type ShaderSource } from './shader.ts';
import { createPingPongTarget } from './targets.ts';
import {
  createUniformBuffer,
  defineUniformStruct,
  type UniformBuffer,
  type UniformFields,
} from './uniforms.ts';
import afterglowShader from './strokes/afterglow.wgsl';
import strokeShader from './strokes/stroke.wgsl';

/*
 * The shared stroke renderer (Storm Temple's story 6.3): thick, joined, HDR lines for bolts, beams, trails and
 * vector displays, as research.md's shared pieces ask for. Shaped to move into the temple core.
 *
 *   const layer = createStrokeLayer(device, { label, blend: 'max', shade, uniforms });
 *   layer.resize(width, height);
 *   layer.setStrokes(data, count);                    // when the strokes change
 *   layer.encode(encoder, { scale: [width, height], decay: 0.8 }, profiler);
 *   ...composite layer.view onto the scene
 *
 * One instance per segment draws a quad around it, padded by the shade's reach, into an
 * accumulation target. What the light looks like is the shade's, a WGSL chunk (see
 * strokes/stroke.wgsl for its three functions); how segments join is the blend:
 *
 *   - `max`: each pixel keeps the brightest segment's value. For a falloff with distance that is
 *     the falloff of the distance to the whole stroke, so joints do not brighten (a lightning bolt).
 *   - `add`: light adds up. With equal energy per step and a profile that telescopes along the
 *     segment, the joints are seamless and brightness follows dwell time (a scope's beam).
 *
 * Persistence comes free: the target keeps last frame's light times `decay` (per channel), and the
 * strokes are blended onto that, which is max(now, before * decay) for `max` and a phosphor's
 * afterglow for `add`. With `decay` zero the target is simply cleared, and there is no extra pass.
 *
 * Records are vec4f-aligned float data:
 *
 *   - `segments`: three vec4f per segment, `(x0, y0, x1, y1)`, then the shade's `a` and `b`.
 *   - `strip`: one vec4f per point of a polyline, `(x, y, z, w)`; segment i runs from point i to
 *     point i + 1, and the shade sees the two points as `a` and `b`.
 *
 * Positions are mapped to device pixels by `pixel = position * scale + offset`.
 */

export type StrokeBlend = 'max' | 'add';
export type StrokeTopology = 'segments' | 'strip';

const StrokeFrame = defineUniformStruct('StrokeFrame', {
  out_size: 'vec2f',
  scale: 'vec2f',
  offset: 'vec2f',
  dpr: 'f32',
});
const AfterglowParams = defineUniformStruct('AfterglowParams', { decay: 'vec4f' });

/** Floats per record. */
export const STROKE_FLOATS: Readonly<Record<StrokeTopology, number>> = { segments: 12, strip: 4 };
const INITIAL_RECORDS = 1024;

export interface StrokeLayerOptions<F extends UniformFields = UniformFields> {
  label: string;
  /** Default `rg16float`, which holds two channels of HDR light. */
  format?: GPUTextureFormat;
  blend: StrokeBlend;
  /** Defines `stroke_level`, `stroke_pad` and `stroke_shade`; see strokes/stroke.wgsl. */
  shade: ShaderSource;
  /** The shade's own uniforms, declared to it as `params`. */
  uniforms?: UniformBuffer<F>;
  /** Default `segments`. */
  topology?: StrokeTopology;
  /** Profiler pass names. Default `strokes` and `afterglow`. */
  passes?: { strokes?: string; afterglow?: string };
}

export interface StrokeFrameSettings {
  /** Maps record positions to device pixels: `position * scale + offset`. Default the canvas size. */
  scale?: readonly [number, number];
  offset?: readonly [number, number];
  dpr?: number;
  /** How much of last frame's light remains, per channel or for all; 0 (the default) for none. */
  decay?: number | readonly [number, number, number, number];
}

export interface StrokeLayer {
  /** The accumulated light after the last `encode`. Changes on every encode: bind it then. */
  readonly view: GPUTextureView;
  readonly format: GPUTextureFormat;
  resize(width: number, height: number): void;
  /** Uploads `count` records from `data` (`STROKE_FLOATS[topology]` floats each). */
  setStrokes(data: Float32Array, count: number): void;
  encode(encoder: GPUCommandEncoder, frame?: StrokeFrameSettings, profiler?: PassProfiler): void;
  destroy(): void;
}

export function createStrokeLayer<F extends UniformFields>(
  device: GPUDevice,
  options: StrokeLayerOptions<F>,
): StrokeLayer {
  const { label, blend, shade, uniforms } = options;
  const format = options.format ?? 'rg16float';
  const topology = options.topology ?? 'segments';
  const floats = STROKE_FLOATS[topology];
  const passes = { strokes: 'strokes', afterglow: 'afterglow', ...options.passes };

  const target = createPingPongTarget(device, {
    label: `${label} light`,
    format,
    width: 4,
    height: 4,
  });
  const frameUniforms = createUniformBuffer(device, StrokeFrame, `${label} frame`);
  const afterglowUniforms = createUniformBuffer(device, AfterglowParams, `${label} afterglow`);

  const module = createShader(
    device,
    withChunks(strokeShader, shade.chunks ?? {}, {
      'stroke-frame.wgsl': StrokeFrame.wgsl,
      'stroke-topology.wgsl': `const STROKE_STRIP = ${topology === 'strip'};`,
      'stroke-bindings.wgsl': uniforms
        ? `${uniforms.struct.wgsl}\n@group(0) @binding(2) var<uniform> params: ${uniforms.struct.name};`
        : '',
      'stroke-shade.wgsl': shade.code,
    }),
  );
  const visibility = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
  const bindGroupLayout = device.createBindGroupLayout({
    label: `${label} strokes`,
    entries: [
      { binding: 0, visibility, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility, buffer: { type: 'uniform' } },
      ...(uniforms ? [{ binding: 2, visibility, buffer: { type: 'uniform' as const } }] : []),
    ],
  });
  const component: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one', operation: blend };
  const pipeline = device.createRenderPipeline({
    label: `${label} strokes`,
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    vertex: { module, entryPoint: 'stroke_vs' },
    fragment: {
      module,
      entryPoint: 'stroke_fs',
      targets: [{ format, blend: { color: component, alpha: component } }],
    },
  });
  const afterglowPipeline = createFullscreenPipeline(device, {
    fragment: withChunks(afterglowShader, { 'afterglow-params.wgsl': AfterglowParams.wgsl }),
    format,
  });

  let capacity = 0;
  let buffer: GPUBuffer | undefined;
  let group: GPUBindGroup | undefined;
  let count = 0;
  let width = 4;
  let height = 4;

  function ensureCapacity(records: number) {
    // A strip of n points needs n records; the buffer never shrinks.
    if (records <= capacity && buffer) return;
    capacity = Math.max(INITIAL_RECORDS, 2 ** Math.ceil(Math.log2(Math.max(1, records))));
    buffer?.destroy();
    buffer = device.createBuffer({
      label: `${label} strokes`,
      size: capacity * floats * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    group = device.createBindGroup({
      label: `${label} strokes`,
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer } },
        { binding: 1, resource: { buffer: frameUniforms.buffer } },
        ...(uniforms ? [{ binding: 2, resource: { buffer: uniforms.buffer } }] : []),
      ],
    });
  }
  ensureCapacity(INITIAL_RECORDS);

  return {
    get view() {
      return target.read.view;
    },
    format,
    resize(w, h) {
      width = w;
      height = h;
      target.resize(w, h);
    },
    setStrokes(data, records) {
      ensureCapacity(records);
      count = records;
      if (records > 0) device.queue.writeBuffer(buffer!, 0, data, 0, records * floats);
    },
    encode(encoder, frame = {}, profiler) {
      const decay = frame.decay ?? 0;
      const decay4 = typeof decay === 'number' ? [decay, decay, decay, decay] : decay;
      frameUniforms.set({
        out_size: [width, height],
        scale: frame.scale ? [...frame.scale] : [width, height],
        offset: frame.offset ? [...frame.offset] : [0, 0],
        dpr: frame.dpr ?? 1,
      });
      frameUniforms.upload();

      const read = target.read;
      const write = target.write;
      const persist = decay4.some((d) => d > 0);
      if (persist) {
        afterglowUniforms.set({ decay: [...decay4] as [number, number, number, number] });
        afterglowUniforms.upload();
        renderFullscreen(
          encoder,
          write.view,
          afterglowPipeline,
          [
            device.createBindGroup({
              layout: afterglowPipeline.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: read.view },
                { binding: 1, resource: { buffer: afterglowUniforms.buffer } },
              ],
            }),
          ],
          { timestampWrites: profiler?.pass(passes.afterglow) },
        );
      }
      const pass = encoder.beginRenderPass({
        label: `${label} strokes`,
        colorAttachments: [
          persist
            ? { view: write.view, loadOp: 'load', storeOp: 'store' }
            : { view: write.view, loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' },
        ],
        timestampWrites: profiler?.pass(passes.strokes),
      });
      const segments = topology === 'strip' ? count - 1 : count;
      if (segments > 0) {
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, group!);
        pass.draw(6, segments);
      }
      pass.end();
      target.swap();
    },
    destroy() {
      buffer?.destroy();
      target.destroy();
      frameUniforms.destroy();
      afterglowUniforms.destroy();
    },
  };
}
