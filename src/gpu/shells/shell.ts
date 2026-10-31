import { pcg1d, toUnorm } from '../hash.ts';
import {
  burnTime,
  KIND_ORDER,
  STAR_CLASSES,
  STAR_KINDS,
  starTable,
  TABLE_SPEEDS,
  type StarClass,
  type StarKind,
} from './star.ts';

/*
 * Story 2.3: shells as records.
 *
 * A shell is a small record: when it is launched and when it breaks, where, which class of star
 * it carries and how many, what they are made of (2.2's compositions), whether it has a pistil
 * (an inner burst of another colour), how its stars were packed, and how long their trails are.
 * A display is a list of shells: a programme, which a page or a script can write, or which
 * `programme` makes from a seed. Everything after is a pure function of the programme and the
 * time, so a display can be paused, resized, held and scrubbed by scroll.
 */

export type ShellClass = keyof typeof STAR_CLASSES;
export const CLASS_ORDER: readonly ShellClass[] = ['small', 'medium', 'large'];

/**
 * How the stars were packed: a Japanese warimono's sphere, a Western canister's rougher one, a ring
 * in a tilted plane, a palm's few comets, or a flat shape (3.6).
 */
export type Pattern = 'sphere' | 'canister' | 'ring' | 'palm' | 'shape';
const PATTERN_IDS: Record<Pattern, number> = { sphere: 0, canister: 1, ring: 2, palm: 3, shape: 4 };

/**
 * Stars that do more than fly and burn, all still a pure function of the time (M1): a crossette's
 * star splits in four; a crackle star bursts into microstars with a pop; a glitter star sheds
 * sparks that flash after a delay; a strobe star blinks.
 */
export type Special = 'crossette' | 'crackle' | 'glitter' | 'strobe';
const SPECIAL_IDS: Record<Special, number> = { crossette: 1, crackle: 2, glitter: 3, strobe: 4 };
/** Instances each star takes: itself, then its pieces, microstars or sparks. */
export const PIECES: Record<Special | 'none', number> = {
  none: 1,
  crossette: 5,
  crackle: 7,
  glitter: 9,
  strobe: 1,
};

export interface Shell {
  /** Seconds from the start of the programme to the launch. */
  launch: number;
  /** Seconds from launch to the break. */
  rise: number;
  /** Where it breaks: metres across from the centre of the view, and above the ground. */
  x: number;
  height: number;
  /** Where it was fired from, metres across. */
  from: number;
  class: ShellClass;
  /** The kind of star it carries; the class's own unless given (a willow's charcoal stars). */
  star?: StarKind;
  stars: number;
  /** Composition id (src/gpu/spectra/emission.ts). */
  colour: string;
  /** An inner burst: its colour, its share of the stars, and its speed as a share of the shell's. */
  pistil?: { colour: string; share: number; speed: number };
  /** A second petal inside the first (the double-petalled yae-shin, 3.5), as a pistil is. */
  petal?: { colour: string; share: number; speed: number };
  /** The stars change colour this share of the way through their burn (henka, 3.5). */
  change?: { colour: string; at: number };
  pattern: Pattern;
  /** For a ring or a shape: the normal of its plane (x across, y up, z towards the viewer). */
  normal?: readonly [number, number, number];
  /** For a shape: its index in the renderer's shape table. */
  shape?: number;
  special?: { kind: Special; param: number };
  /** Seconds of trail each star leaves; 0 for a peony's clean stars. */
  trail: number;
  /** Light of the spark tail the stars shed (charcoal, as gold), as a share of a star's; 0 for none. */
  sparks?: number;
  /** Seconds of the rising comet's tail; a palm's is long and thick. */
  comet?: number;
  /** Per-shell randomness: the turn of its star pattern, and its stars' scatter. */
  seed: number;
}

/** The kind of star a shell carries. */
export const starOf = (s: Shell): StarKind => s.star ?? s.class;
/** Seconds a shell's stars burn. */
export const burnOf = (s: Shell) => burnTime(STAR_KINDS[starOf(s)]);

export interface ShellClassInfo {
  star: StarClass;
  /** Seconds the stars burn. */
  burn: number;
  /** Break height, metres, and seconds of rise: a bigger shell is fired higher. */
  height: number;
  rise: number;
  /** Stars in a full shell of this class. */
  stars: number;
}

/** Rough starting points for each class, to be measured against video (story 1.8). */
export const SHELL_CLASSES: Record<ShellClass, ShellClassInfo> = {
  small: {
    star: STAR_CLASSES.small,
    burn: burnTime(STAR_CLASSES.small),
    height: 110,
    rise: 2.6,
    stars: 70,
  },
  medium: {
    star: STAR_CLASSES.medium,
    burn: burnTime(STAR_CLASSES.medium),
    height: 190,
    rise: 3.6,
    stars: 110,
  },
  large: {
    star: STAR_CLASSES.large,
    burn: burnTime(STAR_CLASSES.large),
    height: 280,
    rise: 4.6,
    stars: 150,
  },
};

/** Seconds a shell is in view: its rise, its burn, its longest trail and the stars' spread. */
export const shellSpan = (s: Shell) => s.rise + burnOf(s) * 1.15 + s.trail + 0.5;

export interface ProgrammeOptions {
  /** Shells a minute. */
  rate: number;
  /** Seconds before the programme repeats. */
  period: number;
  /** Width of the firing line, metres. */
  width: number;
  /** Fewest seconds between two breaks. */
  gap: number;
  /** Share of each class, small to large. */
  mix?: readonly [number, number, number];
  /**
   * Turns the plain shell the programme made into the effect's own (a willow, a ring), from its
   * own hashes: `h(k)` is uniform in [0, 1) for each k, different for every shell.
   */
  design?: (shell: Shell, h: (k: number) => number, index: number) => Shell;
}

export const PEONY_COLOURS = [
  'strontium',
  'barium',
  'copper',
  'calcium',
  'violet',
  'white',
] as const;

/**
 * A looping programme made from a seed: breaks spaced at least `gap` apart, peonies in the salt
 * colours, one shell in three a gold chrysanthemum, one in four with a pistil. Breaks are placed
 * first and launches worked back from them, so the spacing holds where the eye sees it.
 */
export function programme(seed: number, options: ProgrammeOptions): Shell[] {
  const count = Math.max(1, Math.round((options.rate * options.period) / 60));
  const mix = options.mix ?? [0.35, 0.45, 0.2];
  const shells: Shell[] = [];
  const slot = options.period / count;
  for (let i = 0; i < count; i++) {
    const h = (k: number) => toUnorm(pcg1d((seed * 977 + i * 31 + k) >>> 0));
    const pick = h(1);
    const cls: ShellClass = pick < mix[0] ? 'small' : pick < mix[0] + mix[1] ? 'medium' : 'large';
    const info = SHELL_CLASSES[cls];
    // A break somewhere in its slot, but never closer than `gap` to the previous one.
    const jitter = Math.max(0, slot - options.gap);
    const breakAt = i * slot + h(2) * jitter;
    const chrysanthemum = h(3) < 0.33;
    const colour = chrysanthemum ? 'gold' : PEONY_COLOURS[Math.floor(h(4) * PEONY_COLOURS.length)]!;
    const pistilColour = PEONY_COLOURS[Math.floor(h(5) * PEONY_COLOURS.length)]!;
    const x = (h(6) - 0.5) * options.width;
    const rise = info.rise * (0.92 + 0.16 * h(7));
    const shell: Shell = {
      launch: breakAt - rise,
      rise,
      x,
      height: info.height * (0.9 + 0.2 * h(8)),
      from: x + (h(9) - 0.5) * 20,
      class: cls,
      stars: Math.round(info.stars * (0.85 + 0.3 * h(10))),
      colour,
      pistil:
        !chrysanthemum && h(11) < 0.25 && pistilColour !== colour
          ? { colour: pistilColour, share: 0.3, speed: 0.45 }
          : undefined,
      pattern: h(12) < 0.5 ? 'sphere' : 'canister',
      trail: chrysanthemum ? 0.55 : 0,
      sparks: chrysanthemum ? 0.5 : 0,
      seed: h(13),
    };
    shells.push(options.design ? options.design(shell, (k) => h(100 + k), i) : shell);
  }
  return shells;
}

/**
 * The shells in the air at `time`, for a programme that repeats every `period` seconds (a shell
 * from the end of one pass still burning at the start of the next is included), with their
 * launch moved to this pass.
 */
export function activeShells(list: readonly Shell[], time: number, period: number): Shell[] {
  const t = ((time % period) + period) % period;
  const out: Shell[] = [];
  for (const s of list) {
    for (const shift of [-period, 0, period]) {
      const launch = s.launch + shift;
      if (t >= launch && t <= launch + shellSpan(s)) out.push({ ...s, launch: launch - t });
    }
  }
  // `launch` is now relative to the present: minus the shell's age.
  return out;
}

/**
 * A calm moment to hold: no shell within half a second of its break, and as many shells open
 * (between a half and three quarters of their burn) as the programme usually has, rounded down,
 * so the held frame is never brighter than the display plays. `within` limits the search to part
 * of the programme (a scripted show's first act), seconds.
 */
export function heldTime(
  list: readonly Shell[],
  period: number,
  within: readonly [number, number] = [0, period],
): number {
  const moments: { t: number; open: number; breaking: boolean }[] = [];
  for (let t = within[0]; t < within[1]; t += 0.05) {
    let open = 0;
    let breaking = false;
    for (const s of activeShells(list, t, period)) {
      const age = -s.launch - s.rise;
      if (age > -0.5 && age < 0.5) breaking = true;
      if (age > 0.5 && age < 0.75 * burnOf(s)) open++;
    }
    moments.push({ t, open, breaking });
  }
  const usual = Math.max(
    1,
    Math.floor(moments.reduce((sum, m) => sum + m.open, 0) / moments.length),
  );
  const calm = moments.filter((m) => !m.breaking);
  const pick = calm.find((m) => m.open === usual) ?? calm.find((m) => m.open > 0) ?? moments[0]!;
  return pick.t;
}

/** Floats per shell in the GPU's record: ten vec4s (the layout is read in shells.wgsl). */
export const SHELL_FLOATS = 40;

/** Most instances a shell draws: its comet, then its stars and their pieces. */
export const SHELL_INSTANCES = 241;

/** Stars a shell can draw, given what each one takes. */
export const starsDrawn = (s: Shell) =>
  Math.min(s.stars, Math.floor((SHELL_INSTANCES - 1) / PIECES[s.special?.kind ?? 'none']));

/**
 * Packs active shells for the shader. `colours` gives each composition's linear colour (2.2's
 * `starColours`), and `age` is seconds since launch.
 */
export function packShells(
  shells: readonly Shell[],
  colours: ReadonlyMap<string, readonly number[]>,
  out: Float32Array,
): number {
  const n = Math.min(shells.length, Math.floor(out.length / SHELL_FLOATS));
  const gold = colours.get('gold')!;
  for (let i = 0; i < n; i++) {
    const s = shells[i]!;
    const o = i * SHELL_FLOATS;
    const c = colours.get(s.colour)!;
    const p = s.pistil ? colours.get(s.pistil.colour)! : c;
    const q = s.petal ? colours.get(s.petal.colour)! : c;
    const k = s.change ? colours.get(s.change.colour)! : c;
    const normal = s.normal ?? [0, 0, 1];
    const pieces = PIECES[s.special?.kind ?? 'none'];
    out.set(
      [
        // Age since launch, rise, break x, break height.
        -s.launch,
        s.rise,
        s.x,
        s.height,
        // Colour, stars drawn.
        c[0]!,
        c[1]!,
        c[2]!,
        starsDrawn(s),
        // Pistil colour, its share of the stars.
        p[0]!,
        p[1]!,
        p[2]!,
        s.pistil?.share ?? 0,
        // Trail seconds, pattern, seed, star kind.
        s.trail,
        PATTERN_IDS[s.pattern],
        s.seed,
        KIND_ORDER.indexOf(starOf(s)),
        // Launch x, burn seconds, pistil speed, the comet's tail.
        s.from,
        burnOf(s),
        s.pistil?.speed ?? 1,
        s.comet ?? 0.15,
        // Second petal colour and share.
        q[0]!,
        q[1]!,
        q[2]!,
        s.petal?.share ?? 0,
        // Colour change and when.
        k[0]!,
        k[1]!,
        k[2]!,
        s.change?.at ?? 0,
        // Special, its parameter, second petal speed, shape.
        s.special ? SPECIAL_IDS[s.special.kind] : 0,
        s.special?.param ?? 0,
        s.petal?.speed ?? 1,
        s.shape ?? 0,
        // Spark tail colour and light.
        gold[0]!,
        gold[1]!,
        gold[2]!,
        s.sparks ?? 0,
        // Plane normal, pieces per star.
        normal[0],
        normal[1],
        normal[2],
        pieces,
      ],
      o,
    );
  }
  return n;
}

export const TABLE_SAMPLES = 48;
export const TABLE_ANGLES = 17;

/** Rows of the table texture: one per kind, launch speed and angle. */
export const TABLE_ROWS = KIND_ORDER.length * TABLE_SPEEDS.length * TABLE_ANGLES;

/**
 * Every kind's star table (`KIND_ORDER`), as an rg32float texture's rows: one row per kind, launch
 * speed and angle, `TABLE_SAMPLES` texels across. A texture, not a uniform buffer: compatibility
 * mode binds at most 16 kB of uniforms, and the tables are 450 kB.
 */
export function packTables(): Float32Array {
  const per = TABLE_SAMPLES * TABLE_ANGLES * TABLE_SPEEDS.length * 2;
  const out = new Float32Array(per * KIND_ORDER.length);
  KIND_ORDER.forEach((kind, i) => {
    out.set(starTable(STAR_KINDS[kind], TABLE_SAMPLES, TABLE_ANGLES).xy, i * per);
  });
  return out;
}
