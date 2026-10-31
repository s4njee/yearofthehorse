import { pcg1d, toUnorm } from '../hash.ts';
import { createShader } from '../shader.ts';
import type { ShowLayers } from '../shells/show.ts';
import { PEONY_COLOURS, SHELL_CLASSES, type Shell } from '../shells/shell.ts';
import {
  LIGHT_FLOATS,
  packLights,
  packPuffs,
  PUFF_FLOATS,
  SMOKE_DEFAULTS,
} from '../smoke/puffs.ts';
import { createRenderTarget } from '../targets.ts';
import shader from './river.wgsl';

/*
 * The river a show plays over (story 3.8): the smoke each break leaves, a far bank of dark
 * buildings, and the river reflecting both. `display` and `river-tour` are shows composed with it.
 */

const MAX_PUFFS = 32;
const MAX_LIGHTS = 12;
/** The smoke's resolution, as a share of the view's. */
export const SMOKE_SCALES = { quarter: 0.25, eighth: 0.125, half: 0.5 } as const;
/** The far bank's buildings, metres. */
const BANK = 26;
/** The bottom of the view as a share of the sky: a little below the water, so the river shows. */
export const RIVER_GROUND = -0.22;

/** The river's controls. Spread them into a show's params. */
export const RIVER_PARAMS = {
  /** How much smoke each break leaves: 0 is a windy night that clears it at once. */
  smoke: { type: 'number', default: 1, min: 0, max: 2, step: 0.05 },
  /** Wind across the view, metres a second. */
  wind: { type: 'number', default: 2, min: -6, max: 6, step: 0.5 },
  river: { type: 'boolean', default: true },
  smokeScale: {
    type: 'select',
    default: 'quarter',
    options: Object.keys(SMOKE_SCALES) as (keyof typeof SMOKE_SCALES)[],
    label: 'smoke resolution',
  },
} as const;

export interface RiverValues {
  smoke: number;
  wind: number;
  river: boolean;
  smokeScale: string;
}

/**
 * A finale: thirty breaks 0.4 s apart over the 12 s before `period` ends, as close as the flash
 * rule allows (story 2.8: three a second is the limit for any size), across the width `list` uses.
 */
export function finaleShells(list: readonly Shell[], period: number): Shell[] {
  const out: Shell[] = [];
  const across = list.length ? Math.max(...list.map((s) => Math.abs(s.x))) * 2 : 400;
  for (let i = 0; i < 30; i++) {
    const u = (k: number) => toUnorm(pcg1d((i * 131 + k * 7919 + 17) >>> 0));
    const cls = u(1) < 0.6 ? 'medium' : 'small';
    const info = SHELL_CLASSES[cls];
    const breakAt = period - 12.5 + i * 0.4;
    const gold = u(4) < 0.5;
    out.push({
      launch: breakAt - info.rise,
      rise: info.rise,
      x: (u(2) - 0.5) * across,
      height: info.height * (0.85 + 0.3 * u(3)),
      from: 0,
      class: cls,
      stars: Math.round(info.stars * 0.8),
      colour: gold ? 'gold' : PEONY_COLOURS[Math.floor(u(5) * PEONY_COLOURS.length)]!,
      pattern: 'canister',
      trail: gold ? 0.5 : 0,
      sparks: gold ? 0.5 : 0,
      seed: u(6),
    });
  }
  return out;
}

/** The river's passes, as a show's layers: draws the scene from the show's stars. */
export function createRiver(
  device: GPUDevice,
  format: GPUTextureFormat,
  params: RiverValues,
): ShowLayers {
  const module = createShader(device, shader);
  const viewBuffer = device.createBuffer({
    label: 'river view',
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const puffBuffer = device.createBuffer({
    label: 'river puffs',
    size: MAX_PUFFS * PUFF_FLOATS * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const lightBuffer = device.createBuffer({
    label: 'river lights',
    size: MAX_LIGHTS * LIGHT_FLOATS * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const smoke = createRenderTarget(device, {
    label: 'river smoke',
    format: 'rgba16float',
    width: 1,
    height: 1,
  });
  const smokePipeline = device.createRenderPipeline({
    label: 'river smoke',
    layout: 'auto',
    vertex: { module, entryPoint: 'fullscreen_vs' },
    fragment: { module, entryPoint: 'smoke_fs', targets: [{ format: 'rgba16float' }] },
  });
  const compositePipeline = device.createRenderPipeline({
    label: 'river composite',
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
        label: 'river smoke',
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
        label: 'river composite',
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
