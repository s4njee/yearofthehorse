import { createShader } from '../shader.ts';
import {
  packShells,
  packTables,
  SHELL_FLOATS,
  SHELL_INSTANCES,
  TABLE_ROWS,
  TABLE_SAMPLES,
  type Shell,
} from './shell.ts';
import shader from './shells.wgsl';

/*
 * The shell renderer (M1): every star of the shells in the air, in one instanced draw of ribbons
 * added into an HDR target, with no state (shells.wgsl says how). Shared by every fireworks effect
 * past `hello`, so the star model, the trails and the special stars are the same everywhere.
 *
 *   const stars = createShellRenderer(device, { format: tail.scene.format });
 *   stars.update(activeShells(list, now, period), colours, { width, height, scale, ground, ... });
 *   stars.draw(pass);   // inside a render pass on the scene
 */

/** The most shells drawn at once. */
export const MAX_SHELLS = 12;
/** Vertices per instance: K + 1 samples and two caps, each a pair across the ribbon. */
const RIBBON_VERTICES = 2 * (14 + 3);

export interface ShellViewValues {
  width: number;
  height: number;
  /** Pixels a metre. */
  scale: number;
  /** Metres above the ground at the bottom of the view. */
  ground: number;
  brightness: number;
  /** Seconds of camera exposure; 0 (the default) for the eye. */
  shutter?: number;
  /** The eye's persistence, seconds. Default 0.04. */
  eye?: number;
  /** How fast shed sparks fall, metres a second. Default 2. */
  fall?: number;
  /** How fast a spark tail spreads sideways, metres a second. Default 0.6. */
  spread?: number;
}

export interface ShellRendererOptions {
  /** The target's format (an HDR scene: light adds). */
  format: GPUTextureFormat;
  label?: string;
  /** Flat shapes for `pattern: 'shape'` shells (3.6): each a list of x, y pairs, all as long. */
  shapes?: readonly Float32Array[];
}

export interface ShellRenderer {
  /** Packs the shells and the view; returns how many shells will be drawn. */
  update(
    shells: readonly Shell[],
    colours: ReadonlyMap<string, readonly number[]>,
    values: ShellViewValues,
  ): number;
  draw(pass: GPURenderPassEncoder): void;
  destroy(): void;
}

export function createShellRenderer(
  device: GPUDevice,
  options: ShellRendererOptions,
): ShellRenderer {
  const label = options.label ?? 'shells';
  const viewBuffer = device.createBuffer({
    label: `${label} view`,
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const shellBuffer = device.createBuffer({
    label: `${label} records`,
    size: MAX_SHELLS * SHELL_FLOATS * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const tableData = packTables();
  const tables = device.createTexture({
    label: `${label} star tables`,
    size: [TABLE_SAMPLES, TABLE_ROWS],
    format: 'rg32float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture({ texture: tables }, tableData, { bytesPerRow: TABLE_SAMPLES * 8 }, [
    TABLE_SAMPLES,
    TABLE_ROWS,
  ]);
  const shapeList = options.shapes?.length ? options.shapes : [new Float32Array([0, 0])];
  const points = shapeList[0]!.length / 2;
  const shapeData = new Float32Array(points * 2 * shapeList.length);
  shapeList.forEach((s, i) => shapeData.set(s.subarray(0, points * 2), i * points * 2));
  const shapes = device.createTexture({
    label: `${label} shapes`,
    size: [points, shapeList.length],
    format: 'rg32float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture({ texture: shapes }, shapeData, { bytesPerRow: points * 8 }, [
    points,
    shapeList.length,
  ]);

  const module = createShader(device, shader);
  const pipeline = device.createRenderPipeline({
    label,
    layout: 'auto',
    vertex: { module, entryPoint: 'shells_vs' },
    fragment: {
      module,
      entryPoint: 'shells_fs',
      // Light adds: stars are emitters.
      targets: [
        {
          format: options.format,
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one' },
            alpha: { srcFactor: 'one', dstFactor: 'one' },
          },
        },
      ],
    },
    primitive: { topology: 'triangle-strip' },
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: viewBuffer } },
      { binding: 1, resource: { buffer: shellBuffer } },
      { binding: 2, resource: tables.createView() },
      { binding: 3, resource: shapes.createView() },
    ],
  });
  const packed = new Float32Array(MAX_SHELLS * SHELL_FLOATS);
  const viewData = new Float32Array(12);
  let drawn = 0;

  return {
    update(list, colours, v) {
      drawn = packShells(list, colours, packed);
      device.queue.writeBuffer(shellBuffer, 0, packed, 0, Math.max(drawn, 1) * SHELL_FLOATS);
      viewData.set([
        v.width,
        v.height,
        v.scale,
        v.ground,
        drawn,
        v.brightness,
        v.shutter ?? 0,
        v.eye ?? 0.04,
        v.fall ?? 2,
        v.spread ?? 0.6,
        points,
        0,
      ]);
      device.queue.writeBuffer(viewBuffer, 0, viewData);
      return drawn;
    },
    draw(pass) {
      if (!drawn) return;
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(RIBBON_VERTICES, drawn * SHELL_INSTANCES);
    },
    destroy() {
      viewBuffer.destroy();
      shellBuffer.destroy();
      tables.destroy();
      shapes.destroy();
    },
  };
}
