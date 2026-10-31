import { pcg1d, toUnorm } from '../../gpu/hash.ts';
import { createShader } from '../../gpu/shader.ts';
import { crossette, palm, ring, unsteady, warimono, willow } from '../../gpu/shells/designs.ts';
import { createShow, SHOW_PARAMS, type ShowLayers } from '../../gpu/shells/show.ts';
import { PEONY_COLOURS, SHELL_CLASSES, type Shell } from '../../gpu/shells/shell.ts';
import {
  LIGHT_FLOATS,
  packLights,
  packPuffs,
  PUFF_FLOATS,
  SMOKE_DEFAULTS,
} from '../../gpu/smoke/puffs.ts';
import { createRenderTarget } from '../../gpu/targets.ts';
import { defineEffect } from '../types.ts';
import shader from './display.wgsl';
import { meta } from './meta.ts';

const PERIOD = 90;
const MAX_PUFFS = 32;
const MAX_LIGHTS = 12;
/** The smoke's resolution, as a share of the view's. */
const SMOKE_SCALES = { quarter: 0.25, eighth: 0.125, half: 0.5 } as const;
/** The far bank's buildings, metres. */
const BANK = 26;

export const effect = defineEffect({
  meta,
  wideGamut: true,
  params: {
    ...SHOW_PARAMS,
    sky: { type: 'number', default: 420, min: 260, max: 800, step: 10 },
    /** How much smoke each break leaves: 0 is a windy night that clears it at once. */
    smoke: { type: 'number', default: 1, min: 0, max: 2, step: 0.05 },
    /** Wind across the view, metres a second. */
    wind: { type: 'number', default: 2, min: -6, max: 6, step: 0.5 },
    river: { type: 'boolean', default: true },
    /** The last stretch of the programme, with shells as close as the flash rule allows. */
    finale: { type: 'boolean', default: false },
    smokeScale: {
      type: 'select',
      default: 'quarter',
      options: Object.keys(SMOKE_SCALES) as (keyof typeof SMOKE_SCALES)[],
      label: 'smoke resolution',
    },
  },
  presets: {
    hanabi: {},
    finale: { finale: true },
    clear: { smoke: 0 },
    still: { wind: 0.5, smoke: 1.4 },
    photograph: { trails: 'camera', shutter: 2 },
  },

  async create(ctx) {
    const { params } = ctx;
    return createShow(ctx, {
      label: 'display',
      period: PERIOD,
      rate: [6, 20, 34],
      gap: 1.1,
      mix: [0.25, 0.45, 0.3],
      // The bottom of the view is a little below the water, so the river shows.
      ground: -0.22,
      keys: ['finale'],
      design(shell, h) {
        // A display's programme: every kind of shell, as a hanabi taikai mixes them.
        const kind = h(40);
        if (kind < 0.3) return shell;
        if (kind < 0.42) return willow(shell, h(41) < 0.4);
        if (kind < 0.5) return palm(shell, h);
        if (kind < 0.58) return ring(shell, h);
        if (kind < 0.76) return warimono(shell, h, h(42) < 0.5);
        if (kind < 0.86) return crossette(shell, h);
        return unsteady(shell, h, h(43) < 0.6 ? 'glitter' : 'crackle');
      },
      extra(list, period, values) {
        if (!values.finale) return [];
        // A finale over the last 12 seconds: a break every 0.4 s, under three a second.
        const out: Shell[] = [];
        for (let i = 0; i < 30; i++) {
          const u = (k: number) => toUnorm(pcg1d((i * 131 + k * 7919 + 17) >>> 0));
          const info = SHELL_CLASSES[u(1) < 0.6 ? 'medium' : 'small'];
          const breakAt = period - 12.5 + i * 0.4;
          const rise = info.rise;
          out.push({
            launch: breakAt - rise,
            rise,
            x: (u(2) - 0.5) * (list.length ? Math.max(...list.map((s) => Math.abs(s.x))) * 2 : 400),
            height: info.height * (0.85 + 0.3 * u(3)),
            from: 0,
            class: u(1) < 0.6 ? 'medium' : 'small',
            stars: Math.round(info.stars * 0.8),
            colour: u(4) < 0.5 ? 'gold' : PEONY_COLOURS[Math.floor(u(5) * PEONY_COLOURS.length)]!,
            pattern: 'canister',
            trail: u(4) < 0.5 ? 0.5 : 0,
            sparks: u(4) < 0.5 ? 0.5 : 0,
            seed: u(6),
          });
        }
        return out;
      },
      compose: (device, format) => createLayers(device, format, params),
    });
  },
});

function createLayers(
  device: GPUDevice,
  format: GPUTextureFormat,
  params: { smoke: number; wind: number; river: boolean; smokeScale: string },
): ShowLayers {
  const module = createShader(device, shader);
  const viewBuffer = device.createBuffer({
    label: 'display view',
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const puffBuffer = device.createBuffer({
    label: 'display puffs',
    size: MAX_PUFFS * PUFF_FLOATS * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const lightBuffer = device.createBuffer({
    label: 'display lights',
    size: MAX_LIGHTS * LIGHT_FLOATS * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const smoke = createRenderTarget(device, {
    label: 'display smoke',
    format: 'rgba16float',
    width: 1,
    height: 1,
  });
  const smokePipeline = device.createRenderPipeline({
    label: 'display smoke',
    layout: 'auto',
    vertex: { module, entryPoint: 'fullscreen_vs' },
    fragment: { module, entryPoint: 'smoke_fs', targets: [{ format: 'rgba16float' }] },
  });
  const compositePipeline = device.createRenderPipeline({
    label: 'display composite',
    layout: 'auto',
    vertex: { module, entryPoint: 'fullscreen_vs' },
    fragment: { module, entryPoint: 'composite_fs', targets: [{ format }] },
  });
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  const smokeGroup = device.createBindGroup({
    layout: smokePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: viewBuffer } },
      { binding: 1, resource: { buffer: puffBuffer } },
      { binding: 2, resource: { buffer: lightBuffer } },
    ],
  });
  // The composite reads only the view: `auto` layouts leave out what a stage does not use.
  const compositeGroup = device.createBindGroup({
    layout: compositePipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: viewBuffer } }],
  });
  const puffData = new Float32Array(MAX_PUFFS * PUFF_FLOATS);
  const lightData = new Float32Array(MAX_LIGHTS * LIGHT_FLOATS);
  const viewData = new Float32Array(12);
  let width = 1;
  let height = 1;
  let starsView: GPUTextureView | undefined;
  let smokeView: GPUTextureView | undefined;
  let textures: GPUBindGroup | undefined;

  const sizeSmoke = () => {
    const share = SMOKE_SCALES[params.smokeScale as keyof typeof SMOKE_SCALES] ?? 0.25;
    smoke.resize(Math.max(1, Math.round(width * share)), Math.max(1, Math.round(height * share)));
  };

  return {
    resize(w, h) {
      width = w;
      height = h;
      sizeSmoke();
    },
    encode(encoder, stars, scene, frame, profiler) {
      sizeSmoke();
      const puffs =
        params.smoke > 0
          ? packPuffs(
              frame.list,
              frame.now,
              frame.period,
              {
                ...SMOKE_DEFAULTS,
                wind: params.wind,
                amount: SMOKE_DEFAULTS.amount * params.smoke,
              },
              puffData,
            )
          : 0;
      const lights = packLights(frame.active, frame.colours, lightData);
      device.queue.writeBuffer(puffBuffer, 0, puffData);
      device.queue.writeBuffer(lightBuffer, 0, lightData);
      viewData.set([
        width,
        height,
        frame.scale,
        frame.ground,
        puffs,
        lights,
        frame.now,
        BANK,
        params.river ? 0.36 : 0,
        0,
        0,
        0,
      ]);
      device.queue.writeBuffer(viewBuffer, 0, viewData);

      const smokePass = encoder.beginRenderPass({
        label: 'display smoke',
        colorAttachments: [
          { view: smoke.view, loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' },
        ],
        timestampWrites: profiler.pass('smoke'),
      });
      smokePass.setPipeline(smokePipeline);
      smokePass.setBindGroup(0, smokeGroup);
      smokePass.draw(3);
      smokePass.end();

      if (!textures || stars !== starsView || smoke.view !== smokeView) {
        starsView = stars;
        smokeView = smoke.view;
        textures = device.createBindGroup({
          layout: compositePipeline.getBindGroupLayout(1),
          entries: [
            { binding: 0, resource: stars },
            { binding: 1, resource: smoke.view },
            { binding: 2, resource: sampler },
          ],
        });
      }
      const pass = encoder.beginRenderPass({
        label: 'display composite',
        colorAttachments: [
          { view: scene, loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' },
        ],
        timestampWrites: profiler.pass('composite'),
      });
      pass.setPipeline(compositePipeline);
      pass.setBindGroup(0, compositeGroup);
      pass.setBindGroup(1, textures);
      pass.draw(3);
      pass.end();
    },
    destroy() {
      viewBuffer.destroy();
      puffBuffer.destroy();
      lightBuffer.destroy();
      smoke.destroy();
    },
  };
}
