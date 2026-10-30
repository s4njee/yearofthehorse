import { createHdrTail, OVERLAY_PARAMS, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { DOSE_PARAMS, dosed, heldDose } from '../../gpu/safety/dose.ts';
import { createShader, withChunks } from '../../gpu/shader.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import shader from './fireworks.wgsl';
import { meta } from './meta.ts';

const Params = defineUniformStruct('Params', {
  width: 'f32',
  height: 'f32',
  time: 'f32',
  dpr: 'f32',
  shells: 'f32',
  period: 'f32',
  size: 'f32',
  brightness: 'f32',
  held: 'f32',
});

/** The most shells in the air at once. */
const MAX_SHELLS = 4;
/** Instances per shell: the rising comet and 120 stars (matches `STARS` in the shader). */
const STARS = 121;

export const effect = defineEffect({
  meta,
  params: {
    ...DOSE_PARAMS,
    size: { type: 'number', default: 1, min: 0.4, max: 1.6, step: 0.05 },
    pace: { type: 'number', default: 1, min: 0.5, max: 1.5, step: 0.05 },
    ...TAIL_PARAMS,
    ...OVERLAY_PARAMS,
  },
  presets: {
    display: {},
    quiet: { dose: 0.12 },
    grand: { size: 1.4, pace: 0.8 },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'hello' });
    const uniforms = createUniformBuffer(device, Params, 'hello params');
    const module = createShader(device, withChunks(shader, { 'params.wgsl': Params.wgsl }));
    const pipeline = device.createRenderPipeline({
      label: 'hello stars',
      layout: 'auto',
      vertex: { module, entryPoint: 'star_vs' },
      fragment: {
        module,
        entryPoint: 'star_fs',
        // Light adds: stars are emitters, and an overlap is brighter.
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
      entries: [{ binding: 0, resource: { buffer: uniforms.buffer } }],
    });
    let width = 1;
    let height = 1;
    let dpr = 1;
    let clock = 0;

    return {
      resize(w, h, pixelRatio) {
        width = w;
        height = h;
        dpr = pixelRatio;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        clock += time.delta;
        const dose = time.still ? heldDose(params.dose) : params.dose;
        // A burst's radius: about a fifth of the shorter side at the defaults, in pixels.
        const radius = 0.22 * Math.min(width, height * 1.4) * params.size;
        uniforms.set({
          width,
          height,
          time: clock,
          dpr,
          shells: Math.round(dosed(dose, 1, 3, MAX_SHELLS)),
          period: 4.2 / params.pace,
          size: radius * dosed(dose, 0.6, 1, 1.15),
          brightness: dosed(dose, 0.5, 1, 1.15),
          held: time.still ? 1 : 0,
        });
        uniforms.upload();
        const pass = encoder.beginRenderPass({
          label: 'hello stars',
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
        tail.destroy();
      },
    };
  },
});
