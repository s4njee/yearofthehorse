import { PEONY_COLOURS, type Shell, type Special } from './shell.ts';

/*
 * Shell designs (Epic 3): each turns the plain shell a programme made into a kind of shell, from
 * the shell's own hashes (`h(k)` uniform in [0, 1), different for every shell and every k). The
 * effects use them one kind at a time; the whole display (3.8) mixes them.
 */

type Hash = (k: number) => number;

const pickColour = (u: number, not?: string) => {
  const list = PEONY_COLOURS.filter((c) => c !== not);
  return list[Math.floor(u * list.length)]!;
};

/** A unit vector uniform on the sphere, from two hashes. */
export const onSphere = (a: number, b: number): [number, number, number] => {
  const z = 2 * a - 1;
  const r = Math.sqrt(1 - z * z);
  return [r * Math.cos(2 * Math.PI * b), r * Math.sin(2 * Math.PI * b), z];
};

/** A willow, or a kamuro: a dense crown of shorter tails. Charcoal stars that hang and fall. */
export const willow = (shell: Shell, kamuro: boolean): Shell => ({
  ...shell,
  star: 'willow',
  colour: 'gold',
  pistil: undefined,
  pattern: 'sphere',
  stars: Math.round(shell.stars * (kamuro ? 1.3 : 0.75)),
  trail: kamuro ? 1.6 : 2.6,
  sparks: kamuro ? 1.3 : 1,
});

/** A palm: a thick rising comet (the trunk), then a few big comets that shed gold and droop. */
export const palm = (shell: Shell, h: Hash): Shell => ({
  ...shell,
  star: 'palm',
  pattern: 'palm',
  colour: h(2) < 0.6 ? 'gold' : 'white',
  pistil: undefined,
  stars: 7 + Math.floor(h(3) * 6),
  trail: 1.4,
  sparks: 1.2,
  comet: 1.2,
});

/** A ring: its stars round a circle in a plane at whatever tilt the shell broke at. */
export const ring = (shell: Shell, h: Hash): Shell => ({
  ...shell,
  pattern: 'ring',
  colour: pickColour(h(4)),
  pistil: undefined,
  stars: 40 + Math.floor(h(5) * 20),
  normal: onSphere(h(6), h(7)),
  trail: 0,
  sparks: 0,
});

/**
 * A warimono (3.5): hand-packed in two hemispheres, so it breaks as a near-perfect sphere,
 * densely starred. `yae` is the double-petalled yae-shin; otherwise every star changes colour as
 * it burns (henka).
 */
export const warimono = (shell: Shell, h: Hash, yae: boolean): Shell => {
  const outer = pickColour(h(12));
  const inner = pickColour(h(13), outer);
  const core = pickColour(h(14), inner);
  const base: Shell = { ...shell, pattern: 'sphere', stars: 180, trail: 0, sparks: 0 };
  if (yae) {
    return {
      ...base,
      colour: outer,
      petal: { colour: inner, share: 0.35, speed: 0.68 },
      pistil: { colour: core, share: 0.15, speed: 0.38 },
      // The outer petal changes colour once on its way out, as a yae-shin's often does.
      change: h(15) < 0.5 ? { colour: pickColour(h(16), outer), at: 0.55 } : undefined,
    };
  }
  return {
    ...base,
    colour: outer,
    pistil: { colour: core, share: 0.2, speed: 0.45 },
    change: { colour: inner, at: 0.45 },
  };
};

const CROSSETTE_COLOURS = ['gold', 'white', 'strontium', 'barium', 'calcium'] as const;

/** A crossette (3.4): few, large stars that each split in four, a cross, part way out. */
export const crossette = (shell: Shell, h: Hash, split = 0.45): Shell => ({
  ...shell,
  stars: 24 + Math.floor(h(21) * 20),
  colour: CROSSETTE_COLOURS[Math.floor(h(22) * CROSSETTE_COLOURS.length)]!,
  pistil: undefined,
  special: { kind: 'crossette', param: split },
  trail: 0.5,
  sparks: h(23) < 0.5 ? 0.6 : 0,
});

/** Glitter, crackle or strobe stars (2.7, 3.7). `strobe` is blinks a second. */
export const unsteady = (shell: Shell, h: Hash, kind: Special, strobe = 4): Shell => {
  if (kind === 'strobe') {
    return {
      ...shell,
      colour: 'white',
      pistil: undefined,
      special: { kind, param: strobe * (0.85 + 0.3 * h(31)) },
      trail: 0,
      sparks: 0,
    };
  }
  return {
    ...shell,
    // Glitter and crackle stars are charcoal-gold; their light is in the sparks and pops.
    colour: 'gold',
    pistil: undefined,
    stars: 26 + Math.floor(h(32) * 8),
    special: { kind, param: 0 },
    trail: kind === 'glitter' ? 0.8 : 0,
    sparks: kind === 'glitter' ? 0.4 : 0,
  };
};

/**
 * A shaped shell (3.6): its stars laid out flat as shape `shape` of the show's shapes, so they leave
 * the break in that plane. The plane's normal is uniform on the sphere (a tumbling shell), pulled
 * towards the viewer (+z) by `facing`: 0 is a real shell, 1 always faces, as no real shell can.
 */
export const shaped = (
  shell: Shell,
  h: Hash,
  shape: number,
  facing: number,
  points = 96,
): Shell => {
  const random = onSphere(h(2), h(3));
  const n = random.map((c, k) => (1 - facing) * c + facing * (k === 2 ? 1 : 0));
  const len = Math.hypot(...n) || 1;
  return {
    ...shell,
    pattern: 'shape',
    shape,
    normal: [n[0]! / len, n[1]! / len, n[2]! / len],
    stars: points,
    colour: PEONY_COLOURS[Math.floor(h(4) * PEONY_COLOURS.length)]!,
    pistil: undefined,
    trail: 0,
    sparks: 0,
  };
};

/** Any kind of shell, mixed as a hanabi taikai mixes them (3.8): the programme of `display`. */
export const anyKind = (shell: Shell, h: Hash): Shell => {
  const kind = h(40);
  if (kind < 0.3) return shell;
  if (kind < 0.42) return willow(shell, h(41) < 0.4);
  if (kind < 0.5) return palm(shell, h);
  if (kind < 0.58) return ring(shell, h);
  if (kind < 0.76) return warimono(shell, h, h(42) < 0.5);
  if (kind < 0.86) return crossette(shell, h);
  return unsteady(shell, h, h(43) < 0.6 ? 'glitter' : 'crackle');
};
