import { createRiver, finaleShells, RIVER_GROUND, RIVER_PARAMS } from '../../gpu/river/river.ts';
import {
  anyKind,
  crossette,
  palm,
  ring,
  shaped,
  unsteady,
  warimono,
  willow,
} from '../../gpu/shells/designs.ts';
import { shapePoints, SHAPES, type ShapeName } from '../../gpu/shells/shapes.ts';
import { PEONY_COLOURS, programme, type Shell } from '../../gpu/shells/shell.ts';
import { createShow, SHOW_PARAMS, type ShowLayers } from '../../gpu/shells/show.ts';
import { createShader } from '../../gpu/shader.ts';
import { createRenderTarget } from '../../gpu/targets.ts';
import { ANTON } from '../../gpu/text/anton.generated.ts';
import { createTextField } from '../../gpu/text/text-field.ts';
import { defineEffect } from '../types.ts';
import shader from './caption.wgsl';
import { meta } from './meta.ts';

type Hash = (k: number) => number;

interface Act {
  /** The caption. */
  name: string;
  seconds: number;
  /** Shells as a share of the show's rate. Default 1. */
  rate?: number;
  design: (shell: Shell, h: Hash, index: number, facing: number) => Shell;
}

const SHAPE_NAMES = Object.keys(SHAPES) as ShapeName[];
const otherColour = (u: number, not: string) => {
  const list = PEONY_COLOURS.filter((c) => c !== not);
  return list[Math.floor(u * list.length)]!;
};

/**
 * The programme, act by act: each kind of shell the family draws, a few at a time, then all of
 * them together. The finale follows (`finaleShells`).
 */
export const ACTS: readonly Act[] = [
  {
    name: 'Peony',
    seconds: 7,
    design: (shell, h) => {
      const colour = PEONY_COLOURS[Math.floor(h(50) * PEONY_COLOURS.length)]!;
      return {
        ...shell,
        colour,
        pistil: { colour: otherColour(h(51), colour), share: 0.3, speed: 0.45 },
        trail: 0,
        sparks: 0,
      };
    },
  },
  {
    name: 'Chrysanthemum',
    seconds: 7,
    design: (shell) => ({ ...shell, colour: 'gold', pistil: undefined, trail: 0.55, sparks: 0.5 }),
  },
  { name: 'Warimono', seconds: 7, design: (shell, h) => warimono(shell, h, false) },
  { name: 'Yae-shin', seconds: 7, design: (shell, h) => warimono(shell, h, true) },
  { name: 'Ring', seconds: 7, design: (shell, h) => ring(shell, h) },
  { name: 'Palm', seconds: 7, design: (shell, h) => palm(shell, h) },
  { name: 'Willow', seconds: 7, rate: 0.8, design: (shell) => willow(shell, false) },
  { name: 'Kamuro', seconds: 7, rate: 0.8, design: (shell) => willow(shell, true) },
  { name: 'Crossette', seconds: 7, design: (shell, h) => crossette(shell, h) },
  { name: 'Glitter', seconds: 7, design: (shell, h) => unsteady(shell, h, 'glitter') },
  { name: 'Crackle', seconds: 7, design: (shell, h) => unsteady(shell, h, 'crackle') },
  { name: 'Strobe', seconds: 7, design: (shell, h) => unsteady(shell, h, 'strobe') },
  {
    name: 'Shaped shells',
    seconds: 7,
    // One of each shape in turn, so the act shows them all.
    design: (shell, h, i, facing) => shaped(shell, h, i % SHAPE_NAMES.length, facing),
  },
  { name: 'All together', seconds: 14, rate: 1.3, design: (shell, h) => anyKind(shell, h) },
];

/** Quiet sky before the first act, seconds: the last loop's finale clears. */
const LEAD = 2.5;
const PERIOD = 120;
const MIX = [0.25, 0.45, 0.3] as const;

/** Where each act starts, seconds into the programme; the finale's last. */
export const ACT_STARTS: readonly number[] = ACTS.reduce<number[]>(
  (starts, _act, i) => [...starts, (starts[i - 1] ?? LEAD) + (i ? ACTS[i - 1]!.seconds : 0)],
  [],
);
const FINALE_START = PERIOD - 12.5;

/** The caption showing at `now`, and how visible it is. */
export function captionAt(now: number): { name: string; alpha: number } {
  const t = ((now % PERIOD) + PERIOD) % PERIOD;
  const starts = [...ACT_STARTS, FINALE_START];
  const names = [...ACTS.map((a) => a.name), 'Finale'];
  for (let i = starts.length - 1; i >= 0; i--) {
    const age = t - starts[i]!;
    if (age < 0) continue;
    const fadeIn = Math.min(1, age / 0.6);
    const fadeOut = 1 - Math.min(1, Math.max(0, (age - 4.5) / 1.5));
    return { name: names[i]!, alpha: fadeIn * fadeOut };
  }
  return { name: names[0]!, alpha: 0 };
}

/** The act playing at `now`: the last to have started, or the finale. */
export function actAt(now: number): string {
  const t = ((now % PERIOD) + PERIOD) % PERIOD;
  if (t >= FINALE_START) return 'Finale';
  let name = ACTS[0]!.name;
  ACTS.forEach((act, i) => {
    if (t >= ACT_STARTS[i]!) name = act.name;
  });
  return name;
}

export const effect = defineEffect({
  meta,
  wideGamut: true,
  params: {
    ...SHOW_PARAMS,
    sky: { type: 'number', default: 420, min: 260, max: 800, step: 10 },
    ...RIVER_PARAMS,
    /** Name each act as it starts. */
    captions: { type: 'boolean', default: true },
    /**
     * How strongly the shaped shells face the viewer: 0 is a real shell, at whatever angle it
     * tumbled to. Staged a little by default, so the tour shows the shapes.
     */
    facing: { type: 'number', default: 0.6, min: 0, max: 1, step: 0.05 },
  },
  presets: {
    tour: {},
    plain: { captions: false },
    clear: { smoke: 0 },
    photograph: { trails: 'camera', shutter: 2 },
  },

  async create(ctx) {
    const { params } = ctx;
    // Seconds into the programme, as last drawn: the act it is in is a live number for the page.
    const clock = { now: 0 };
    const show = await createShow(ctx, {
      label: 'river-tour',
      period: PERIOD,
      rate: [16, 34, 48],
      ground: RIVER_GROUND,
      shapes: SHAPE_NAMES.map((n) => shapePoints(SHAPES[n], 96)),
      keys: ['facing'],
      // The held moment, and where play starts: in the first act.
      hold: [ACT_STARTS[0]!, ACT_STARTS[0]! + ACTS[0]!.seconds],
      script(rate, period, width, values) {
        const list: Shell[] = [];
        ACTS.forEach((act, a) => {
          const shells = programme(values.seed * 37 + a, {
            rate: rate * (act.rate ?? 1),
            period: act.seconds,
            width,
            gap: 1.1,
            mix: MIX,
            design: (shell, h, i) => act.design(shell, h, i, values.facing),
          });
          for (const s of shells) list.push({ ...s, launch: s.launch + ACT_STARTS[a]! });
        });
        return [...list, ...finaleShells(list, period)];
      },
      compose: (device, format) =>
        withCaptions(device, format, createRiver(device, format, params), params, clock),
    });
    return {
      ...show,
      stats: () => ({ ...show.stats?.(), act: actAt(clock.now) }),
    };
  },
});

/** The river's layers, with each act's name written over the sky as it starts. */
function withCaptions(
  device: GPUDevice,
  format: GPUTextureFormat,
  river: ShowLayers,
  params: { captions: boolean },
  clock: { now: number },
): ShowLayers {
  const field = createTextField(device, ANTON);
  const text = createRenderTarget(device, {
    label: 'river-tour caption',
    format: 'r16float',
    width: 1,
    height: 1,
  });
  const module = createShader(device, shader);
  const pipeline = device.createRenderPipeline({
    label: 'river-tour caption',
    layout: 'auto',
    vertex: { module, entryPoint: 'fullscreen_vs' },
    fragment: {
      module,
      entryPoint: 'caption_fs',
      targets: [
        {
          format,
          // Premultiplied: the caption over the scene.
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
          },
        },
      ],
    },
  });
  const uniforms = device.createBuffer({
    label: 'river-tour caption',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const data = new Float32Array(4);
  let width = 1;
  let height = 1;
  let drawn = '';
  let group: GPUBindGroup | undefined;
  let groupView: GPUTextureView | undefined;

  return {
    resize(w, h) {
      width = w;
      height = h;
      text.resize(w, h);
      river.resize(w, h);
    },
    encode(encoder, stars, scene, frame, profiler) {
      river.encode(encoder, stars, scene, frame, profiler);
      clock.now = frame.now;
      const caption = captionAt(frame.now);
      if (!params.captions || caption.alpha <= 0) return;
      const size = Math.max(14, Math.round(height * 0.055));
      const key = `${caption.name}:${width}:${height}`;
      if (key !== drawn) {
        field.draw(encoder, text.view, width, height, {
          text: caption.name.toUpperCase(),
          x: Math.round(width * 0.045),
          y: Math.round(height * 0.06) + size,
          size,
          tracking: 0.06,
          align: 'left',
        });
        drawn = key;
      }
      if (!group || groupView !== text.view) {
        groupView = text.view;
        group = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: uniforms } },
            { binding: 1, resource: text.view },
          ],
        });
      }
      data.set([caption.alpha, 0, 0, 0]);
      device.queue.writeBuffer(uniforms, 0, data);
      const pass = encoder.beginRenderPass({
        label: 'river-tour caption',
        colorAttachments: [{ view: scene, loadOp: 'load', storeOp: 'store' }],
        timestampWrites: profiler.pass('caption'),
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, group);
      pass.draw(3);
      pass.end();
    },
    destroy() {
      river.destroy();
      field.destroy();
      text.destroy();
      uniforms.destroy();
    },
  };
}
