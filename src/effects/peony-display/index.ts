import { createHdrTail, OVERLAY_PARAMS, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { DOSE_PARAMS, dosed, heldDose } from '../../gpu/safety/dose.ts';
import { createShader, withChunks } from '../../gpu/shader.ts';
import {
  activeShells,
  heldTime,
  packShells,
  packTables,
  programme,
  SHELL_FLOATS,
  type Shell,
} from '../../gpu/shells/shell.ts';
import { starColours } from '../../gpu/spectra/emission.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import shader from './display.wgsl';
import { meta } from './meta.ts';

const Params = defineUniformStruct('Params', {
  width: 'f32',
  height: 'f32',
  scale: 'f32',
  ground: 'f32',
  shells: 'f32',
  brightness: 'f32',
});

/** The most shells drawn at once. */
const MAX_SHELLS = 8;
/** Instances per shell (matches `STARS` in the shader): the comet and up to 160 stars. */
const STARS = 161;
/** Seconds before the programme repeats. */
const PERIOD = 60;

export const effect = defineEffect({
  meta,
  wideGamut: true,
  params: {
    ...DOSE_PARAMS,
    /** How much sky the view takes in, metres from the ground to the top. */
    sky: { type: 'number', default: 360, min: 220, max: 800, step: 10 },
    seed: { type: 'number', default: 1, min: 1, max: 99, step: 1 },
    ...TAIL_PARAMS,
    ...OVERLAY_PARAMS,
  },
  presets: {
    display: {},
    quiet: { dose: 0.12 },
    close: { sky: 270 },
    distant: { sky: 640 },
  },

  async create({ device, format, hdr, gamut, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, gamut, label: 'peony-display' });
    const uniforms = createUniformBuffer(device, Params, 'peony-display params');
    const shellBuffer = device.createBuffer({
      label: 'peony-display shells',
      size: MAX_SHELLS * SHELL_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const tableData = packTables();
    const tableBuffer = device.createBuffer({
      label: 'peony-display star tables',
      size: tableData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(tableBuffer, 0, tableData);
    const colours = starColours(gamut ?? 'srgb');
    const module = createShader(device, withChunks(shader, { 'params.wgsl': Params.wgsl }));
    const pipeline = device.createRenderPipeline({
      label: 'peony-display stars',
      layout: 'auto',
      vertex: { module, entryPoint: 'star_vs' },
      fragment: {
        module,
        entryPoint: 'star_fs',
        // Light adds: stars are emitters.
        targets: [
          {
            format: tail.scene.format,
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
        { binding: 0, resource: { buffer: uniforms.buffer } },
        { binding: 1, resource: { buffer: shellBuffer } },
        { binding: 2, resource: { buffer: tableBuffer } },
      ],
    });
    const packed = new Float32Array(MAX_SHELLS * SHELL_FLOATS);
    let width = 1;
    let height = 1;
    let clock = 0;
    let list: Shell[] = [];
    let listKey = '';
    let held = 0;

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        const dose = time.still ? heldDose(params.dose) : params.dose;
        // The view starts a little above the ground, as a viewer some way off sees the sky.
        const ground = 0.22 * params.sky;
        const scale = height / (params.sky - ground);
        // The programme: shells a minute from the dose, across the width of the view.
        const rate = Math.round(dosed(dose, 6, 24, 40));
        const across = width / scale;
        const key = `${rate}:${params.seed}:${Math.round(across)}`;
        if (key !== listKey) {
          list = programme(params.seed, { rate, period: PERIOD, width: across * 0.8, gap: 0.9 });
          held = heldTime(list, PERIOD);
          // Play starts from the held moment, so the page opens with shells already open, and a
          // held frame is the frame playing would show first.
          if (!listKey) clock = held;
          listKey = key;
        }
        clock += time.delta;
        const now = time.still ? held : clock;
        const n = packShells(activeShells(list, now, PERIOD), colours, packed);
        device.queue.writeBuffer(shellBuffer, 0, packed, 0, n * SHELL_FLOATS);
        uniforms.set({
          width,
          height,
          scale,
          ground,
          shells: n,
          brightness: 2.2 * dosed(dose, 0.5, 1, 1.15),
        });
        uniforms.upload();
        const pass = encoder.beginRenderPass({
          label: 'peony-display stars',
          colorAttachments: [
            {
              view: tail.scene.view,
              loadOp: 'clear',
              clearValue: { r: 0, g: 0, b: 0, a: 0 },
              storeOp: 'store',
            },
          ],
          timestampWrites: profiler.pass('stars'),
        });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(4, MAX_SHELLS * STARS);
        pass.end();
        tail.encode(encoder, target, time, params, profiler);
      },
      destroy() {
        uniforms.destroy();
        shellBuffer.destroy();
        tableBuffer.destroy();
        tail.destroy();
      },
    };
  },
});
