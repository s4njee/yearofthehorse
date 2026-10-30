import { createFullscreenPipeline, renderFullscreen } from '../fullscreen.ts';
import { createShader, withChunks } from '../shader.ts';
import { createUniformBuffer, defineUniformStruct } from '../uniforms.ts';
import { glyphSegments, layoutLine, type FontOutlines } from './font.ts';
import atlasShader from './sdf-atlas.wgsl';
import quadShader from './glyph-quads.wgsl';

/*
 * Temple of Time's story 1.6: a font as a signed distance field, and a line of text drawn into one.
 *
 *   const field = createTextField(device, ANTON);   // the atlas, computed on the GPU once
 *   field.draw(encoder, target, { text: 'TIME', x, y, size });   // into an r16float target
 *
 * The atlas holds, for every printable ASCII glyph, the exact signed distance (em, negative
 * inside) to the glyph's outline, out to `SPREAD_PX` texels beyond it: computed from the outline
 * segments by brute force in a fragment pass, so there is no font tool and no image asset, and it
 * is the same in a browser and on Dawn. It is a single-channel field, not Chlumský's multi-channel
 * one: at heading sizes, where this family uses it, the corners it rounds are a fraction of a
 * pixel. `draw` writes the distance in screen px into a target cleared to `FAR_PX`, with `min`
 * blending, so letters that overlap merge.
 */

/** Atlas texels per em, and its cells: room for the em box and the spread on each side. */
export const ATLAS_PX_PER_EM = 96;
export const SPREAD_PX = 16;
export const CELL = 160;
const COLUMNS = 16;
/** What the target is cleared to: farther from the text than anything drawn reaches. */
export const FAR_PX = 1e4;

const AtlasParams = defineUniformStruct('AtlasParams', {
  cell: 'f32',
  columns: 'f32',
  glyphs: 'f32',
  px_per_em: 'f32',
  far: 'f32',
});

const TextParams = defineUniformStruct('TextParams', {
  width: 'f32',
  height: 'f32',
  px_per_em: 'f32',
  spread_em: 'f32',
  atlas_px_per_em: 'f32',
  atlas_size: 'vec2f',
});

export interface TextLine {
  text: string;
  /** Where the line goes, px from the target's top-left: x of `align`, y of the baseline. */
  x: number;
  y: number;
  /** Em size in px. */
  size: number;
  /** Extra em between letters. */
  tracking?: number;
  align?: 'left' | 'centre' | 'right';
}

export interface TextField {
  readonly atlas: GPUTexture;
  readonly font: FontOutlines;
  /** The line's box on screen, px: left, top, right, bottom (ascender to descender). */
  measure(line: TextLine): [number, number, number, number];
  /** Draws `line` into `target` (an r16float view of `width` x `height`), clearing it first. */
  draw(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    width: number,
    height: number,
    line: TextLine,
  ): void;
  destroy(): void;
}

export function createTextField(device: GPUDevice, font: FontOutlines): TextField {
  const chars = Object.keys(font.glyphs);
  const rows = Math.ceil(chars.length / COLUMNS);
  const size: [number, number] = [COLUMNS * CELL, rows * CELL];
  const atlas = device.createTexture({
    label: 'text atlas',
    size,
    format: 'r16float',
    usage:
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC,
  });

  // Each glyph's origin in its cell, so its own bounds are centred in it.
  const scale = 1 / font.unitsPerEm;
  const ascender = font.ascender * scale;
  const descender = font.descender * scale;
  const cellOrigin = (char: string): [number, number] => {
    const g = font.glyphs[char]!;
    const x = CELL / 2 - ((g.bounds[0] + g.bounds[2]) / 2) * scale * ATLAS_PX_PER_EM;
    const y = CELL / 2 - ((g.bounds[1] + g.bounds[3]) / 2) * scale * ATLAS_PX_PER_EM;
    return [x, y];
  };

  const cellData = new ArrayBuffer(chars.length * 16);
  const cellU32 = new Uint32Array(cellData);
  const cellF32 = new Float32Array(cellData);
  const segmentList: number[] = [];
  chars.forEach((char, index) => {
    const s = glyphSegments(font.glyphs[char]!);
    cellU32[index * 4] = segmentList.length / 4;
    cellU32[index * 4 + 1] = s.length / 4;
    const [ox, oy] = cellOrigin(char);
    cellF32[index * 4 + 2] = ox;
    cellF32[index * 4 + 3] = oy;
    for (const v of s) segmentList.push(v * scale);
  });
  const cells = device.createBuffer({
    label: 'text atlas cells',
    size: Math.max(16, cellData.byteLength),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(cells, 0, cellData);
  const segments = device.createBuffer({
    label: 'text atlas segments',
    size: Math.max(16, segmentList.length * 4),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(segments, 0, Float32Array.from(segmentList));
  const atlasUniforms = createUniformBuffer(device, AtlasParams, 'text atlas params');
  atlasUniforms.set({
    cell: CELL,
    columns: COLUMNS,
    glyphs: chars.length,
    px_per_em: ATLAS_PX_PER_EM,
    far: SPREAD_PX / ATLAS_PX_PER_EM,
  });
  atlasUniforms.upload();
  const atlasPipeline = createFullscreenPipeline(device, {
    fragment: withChunks(atlasShader, { 'atlas-params.wgsl': AtlasParams.wgsl }),
    format: 'r16float',
  });
  const atlasGroup = device.createBindGroup({
    layout: atlasPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: atlasUniforms.buffer } },
      { binding: 1, resource: { buffer: cells } },
      { binding: 2, resource: { buffer: segments } },
    ],
  });
  {
    const encoder = device.createCommandEncoder({ label: 'text atlas' });
    renderFullscreen(encoder, atlas.createView(), atlasPipeline, [atlasGroup]);
    device.queue.submit([encoder.finish()]);
  }

  // Drawing lines.
  const textUniforms = createUniformBuffer(device, TextParams, 'text params');
  const module = createShader(
    device,
    withChunks(quadShader, { 'text-params.wgsl': TextParams.wgsl }),
  );
  const minimum: GPUBlendComponent = { operation: 'min', srcFactor: 'one', dstFactor: 'one' };
  const quadPipeline = device.createRenderPipeline({
    label: 'text quads',
    layout: 'auto',
    vertex: { module, entryPoint: 'quad_vs' },
    fragment: {
      module,
      entryPoint: 'quad_fs',
      targets: [{ format: 'r16float', blend: { color: minimum, alpha: minimum } }],
    },
    primitive: { topology: 'triangle-strip' },
  });
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  let placedBuffer: GPUBuffer | undefined;
  let placedGroup: GPUBindGroup | undefined;
  let capacity = 0;

  const placeLine = (line: TextLine) => {
    const layout = layoutLine(font, line.text, line.tracking ?? 0);
    const start =
      line.align === 'right'
        ? line.x - layout.width * line.size
        : line.align === 'left'
          ? line.x
          : line.x - (layout.width * line.size) / 2;
    return { layout, start };
  };

  return {
    atlas,
    font,
    measure(line) {
      const { layout, start } = placeLine(line);
      return [
        start,
        line.y - ascender * line.size,
        start + layout.width * line.size,
        line.y - descender * line.size,
      ];
    },
    draw(encoder, target, width, height, line) {
      const { layout, start } = placeLine(line);
      const visible = layout.glyphs.filter((g) => font.glyphs[g.char]!.bounds[2] !== 0);
      if (visible.length > capacity) {
        placedBuffer?.destroy();
        capacity = Math.max(16, visible.length * 2);
        placedBuffer = device.createBuffer({
          label: 'text placed glyphs',
          size: capacity * 48,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        placedGroup = device.createBindGroup({
          layout: quadPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: textUniforms.buffer } },
            { binding: 1, resource: { buffer: placedBuffer } },
            { binding: 2, resource: atlas.createView() },
            { binding: 3, resource: sampler },
          ],
        });
      }
      const data = new Float32Array(visible.length * 12);
      visible.forEach((g, i) => {
        const index = chars.indexOf(g.char);
        const cx = (index % COLUMNS) * CELL;
        const cy = (Math.floor(index / COLUMNS) + 1) * CELL;
        const b = font.glyphs[g.char]!.bounds;
        const [ox, oy] = cellOrigin(g.char);
        data.set(
          [
            start + g.x * line.size,
            line.y,
            cx,
            cy,
            b[0] * scale,
            b[1] * scale,
            b[2] * scale,
            b[3] * scale,
            ox,
            oy,
            0,
            0,
          ],
          i * 12,
        );
      });
      if (placedBuffer) device.queue.writeBuffer(placedBuffer, 0, data);
      textUniforms.set({
        width,
        height,
        px_per_em: line.size,
        spread_em: SPREAD_PX / ATLAS_PX_PER_EM,
        atlas_px_per_em: ATLAS_PX_PER_EM,
        atlas_size: size,
      });
      textUniforms.upload();
      const pass = encoder.beginRenderPass({
        label: 'text field',
        colorAttachments: [
          {
            view: target,
            loadOp: 'clear',
            clearValue: { r: FAR_PX, g: 0, b: 0, a: 1 },
            storeOp: 'store',
          },
        ],
      });
      if (placedGroup && visible.length > 0) {
        pass.setPipeline(quadPipeline);
        pass.setBindGroup(0, placedGroup);
        pass.draw(4, visible.length);
      }
      pass.end();
    },
    destroy() {
      atlas.destroy();
      cells.destroy();
      segments.destroy();
      placedBuffer?.destroy();
      atlasUniforms.destroy();
      textUniforms.destroy();
    },
  };
}
