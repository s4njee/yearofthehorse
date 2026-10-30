/*
 * The Hero's Journey's story 4.1: the fold library. TypeScript twin of src/wgsl/fold.wgsl; tests/fold.test.ts checks
 * the groups against their generators and the WGSL against this file.
 *
 * A kaleidoscope is a symmetry group, and drawing one is folding the plane into the group's
 * fundamental domain: every point is moved, by the group's own isometries, to the one copy of it
 * inside the domain, and the motif is drawn there. Every isometry of the plane that tiles it is in
 * one of 17 wallpaper groups (Conway's orbifold names in `ORBIFOLD`), and every finite one is a
 * rosette, cyclic Cn or dihedral Dn. The three mirror triangles that tile the plane are three of
 * the wallpaper groups (`TRIANGLE_KALEIDOSCOPES`).
 *
 * Coordinates are in lattice units. The square groups use the unit square lattice (cm and cmm
 * add the centring (1/2, 1/2)); the hexagonal ones use a = (1, 0), b = (1/2, √3/2). Rosettes are
 * centred on the origin.
 *
 * Each fold also returns its Jacobian `j`, the linear part of the isometry it applied, so that a
 * texture can be sampled with the unfolded derivatives: `textureSampleGrad(t, s, uv, j * dpdx,
 * j * dpdy)`. Measured (tests/fold-seams.test.ts): mirrors need no help, since a reflection keeps
 * a derivative's length and the GPU picks the same mip level either side. Where the folded point
 * jumps (a translation wrap, a turn), the GPU differentiates across the jump and samples the
 * coarsest level, a grey line along the edge: a mean error of 0.22 there against 0.004 with the
 * Jacobian. `n` counts the reflections and rotations applied, for colouring by depth of
 * reflection.
 */

export type Vec2 = [number, number];
/** Row-major 2 × 2: [[j[0], j[1]], [j[2], j[3]]]. */
export type Mat2 = [number, number, number, number];

export const WALLPAPER_GROUPS = [
  'p1',
  'p2',
  'pm',
  'pg',
  'cm',
  'pmm',
  'pmg',
  'pgg',
  'cmm',
  'p4',
  'p4m',
  'p4g',
  'p3',
  'p3m1',
  'p31m',
  'p6',
  'p6m',
] as const;
export type WallpaperGroup = (typeof WALLPAPER_GROUPS)[number];
export const ROSETTE_GROUPS = ['cn', 'dn'] as const;
export type RosetteGroup = (typeof ROSETTE_GROUPS)[number];
export type SymmetryGroup = WallpaperGroup | RosetteGroup;
/** In the order of the WGSL twin's group ids. */
export const SYMMETRY_GROUPS: readonly SymmetryGroup[] = [...WALLPAPER_GROUPS, ...ROSETTE_GROUPS];

/** Conway's orbifold notation: `*` a mirror, a digit a rotation centre, `x` a glide, `o` none. */
export const ORBIFOLD: Readonly<Record<WallpaperGroup, string>> = {
  p1: 'o',
  p2: '2222',
  pm: '**',
  pg: 'xx',
  cm: '*x',
  pmm: '*2222',
  pmg: '22*',
  pgg: '22x',
  cmm: '2*22',
  p4: '442',
  p4m: '*442',
  p4g: '4*2',
  p3: '333',
  p3m1: '*333',
  p31m: '3*3',
  p6: '632',
  p6m: '*632',
};

/** The three triangles of mirrors that tile the plane, as the groups they generate. */
export const TRIANGLE_KALEIDOSCOPES = {
  '60-60-60': 'p3m1',
  '45-45-90': 'p4m',
  '30-60-90': 'p6m',
} as const satisfies Record<string, WallpaperGroup>;

export const HEXAGONAL: ReadonlySet<SymmetryGroup> = new Set(['p3', 'p3m1', 'p31m', 'p6', 'p6m']);

/** Area of one translation cell, in lattice units squared. */
export function cellArea(group: WallpaperGroup): number {
  if (HEXAGONAL.has(group)) return Math.sqrt(3) / 2;
  return group === 'cm' || group === 'cmm' ? 0.5 : 1;
}

/** Copies of the fundamental domain in a translation cell (the point group's order). */
export const DOMAINS_PER_CELL: Readonly<Record<WallpaperGroup, number>> = {
  p1: 1,
  p2: 2,
  pm: 2,
  pg: 2,
  cm: 2,
  pmm: 4,
  pmg: 4,
  pgg: 4,
  cmm: 4,
  p4: 4,
  p4m: 8,
  p4g: 8,
  p3: 3,
  p3m1: 6,
  p31m: 6,
  p6: 6,
  p6m: 12,
};

export interface Fold {
  /** The point moved into the fundamental domain. */
  p: Vec2;
  /** The linear part of the isometry applied. */
  j: Mat2;
  /** Reflections and rotations applied. */
  n: number;
}

const SQRT3 = Math.sqrt(3);

/** The fold in progress: each step applies an isometry x -> m x + t to p and m to j. */
class Folder {
  p: Vec2;
  j: Mat2 = [1, 0, 0, 1];
  n = 0;
  constructor(p: Readonly<Vec2>) {
    this.p = [p[0], p[1]];
  }
  apply(m: Mat2, t: Vec2 = [0, 0]): void {
    const [x, y] = this.p;
    this.p = [m[0] * x + m[1] * y + t[0], m[2] * x + m[3] * y + t[1]];
    const j = this.j;
    this.j = [
      m[0] * j[0] + m[1] * j[2],
      m[0] * j[1] + m[1] * j[3],
      m[2] * j[0] + m[3] * j[2],
      m[2] * j[1] + m[3] * j[3],
    ];
    this.n++;
  }
  /** Into the unit square [0, 1)². Translations change neither j nor n. */
  wrapSquare(): void {
    this.p = [this.p[0] - Math.floor(this.p[0]), this.p[1] - Math.floor(this.p[1])];
  }
  wrapX(): void {
    this.p[0] -= Math.floor(this.p[0]);
  }
  wrapY(): void {
    this.p[1] -= Math.floor(this.p[1]);
  }
  /** Into the hexagonal lattice's Voronoi cell round the origin: the nearest lattice point. */
  wrapHex(): void {
    const [x, y] = this.p;
    const v = (2 * y) / SQRT3;
    const u = x - v / 2;
    let best = Infinity;
    let shift: Vec2 = [0, 0];
    for (const du of [0, 1]) {
      for (const dv of [0, 1]) {
        const lu = Math.floor(u) + du;
        const lv = Math.floor(v) + dv;
        const lx = lu + lv / 2;
        const ly = (lv * SQRT3) / 2;
        const d = (x - lx) ** 2 + (y - ly) ** 2;
        if (d < best) {
          best = d;
          shift = [lx, ly];
        }
      }
    }
    this.p = [x - shift[0], y - shift[1]];
  }
  /** Mirror x = c, keeping x <= c. */
  mirrorX(c: number): void {
    if (this.p[0] > c) this.apply([-1, 0, 0, 1], [2 * c, 0]);
  }
  /** Mirror y = c, keeping y <= c. */
  mirrorY(c: number): void {
    if (this.p[1] > c) this.apply([1, 0, 0, -1], [0, 2 * c]);
  }
  /** Rotate about the origin so the angle falls in [start, start + width), width = 2π / k. */
  sector(start: number, width: number): void {
    const count = Math.round((2 * Math.PI) / width);
    const a = Math.atan2(this.p[1], this.p[0]);
    const turns = (((Math.floor((a - start) / width) % count) + count) % count) % count;
    if (turns === 0) return;
    const r = -turns * width;
    const c = Math.cos(r);
    const s = Math.sin(r);
    this.apply([c, -s, s, c]);
  }
  /** Mirror in the line through the origin at angle `phi`, keeping the side at smaller angle. */
  mirrorAngle(phi: number): void {
    // Normal pointing to the side being folded away (angles just above phi).
    const nx = -Math.sin(phi);
    const ny = Math.cos(phi);
    const d = this.p[0] * nx + this.p[1] * ny;
    if (d <= 0) return;
    const c = Math.cos(2 * phi);
    const s = Math.sin(2 * phi);
    this.apply([c, s, s, -c]);
  }
  result(): Fold {
    return { p: this.p, j: this.j, n: this.n };
  }
}

const ROT_NEG90: Mat2 = [0, 1, -1, 0];

/**
 * Folds `p` into the fundamental domain of `group`. `order` is the rosette's n (Cn, Dn); the
 * wallpaper groups ignore it.
 */
export function fold(group: SymmetryGroup, p: Readonly<Vec2>, order = 6): Fold {
  const f = new Folder(p);
  switch (group) {
    case 'p1':
      f.wrapSquare();
      break;
    case 'p2':
      f.wrapSquare();
      if (f.p[1] >= 0.5) f.apply([-1, 0, 0, -1], [1, 1]);
      break;
    case 'pm':
      f.wrapSquare();
      f.mirrorX(0.5);
      break;
    case 'pg':
      f.wrapSquare();
      if (f.p[0] >= 0.5) {
        f.apply([-1, 0, 0, 1], [1, 0.5]);
        f.wrapY();
      }
      break;
    case 'cm':
      f.wrapSquare();
      if (f.p[1] >= 0.5) {
        f.p = [f.p[0] - 0.5, f.p[1] - 0.5];
        f.wrapX();
      }
      f.mirrorX(0.5);
      break;
    case 'pmm':
      f.wrapSquare();
      f.mirrorX(0.5);
      f.mirrorY(0.5);
      break;
    case 'pmg':
      f.wrapSquare();
      // The glide (x - 1/2, -y) brings x into [0, 1/2); the mirror x = 1/4 halves that.
      if (f.p[0] >= 0.5) {
        f.apply([1, 0, 0, -1], [-0.5, 1]);
        f.wrapY();
      }
      f.mirrorX(0.25);
      break;
    case 'pgg':
      f.wrapSquare();
      if (f.p[0] >= 0.5) {
        f.apply([1, 0, 0, -1], [-0.5, 0.5]);
        f.wrapY();
      }
      if (f.p[1] >= 0.5) f.apply([-1, 0, 0, 1], [0.5, -0.5]);
      break;
    case 'cmm':
      f.wrapSquare();
      if (f.p[1] >= 0.5) {
        f.p = [f.p[0] - 0.5, f.p[1] - 0.5];
        f.wrapX();
      }
      f.mirrorX(0.5);
      if (f.p[1] > 0.25) {
        f.apply([1, 0, 0, -1], [0.5, 0.5]);
        f.wrapX();
        f.mirrorX(0.5);
      }
      break;
    case 'p4':
    case 'p4m':
    case 'p4g': {
      f.wrapSquare();
      // Quarter turns about the 4-fold centre (1/2, 1/2) into [1/2, 1)².
      f.p = [f.p[0] - 0.5, f.p[1] - 0.5];
      for (let i = 0; i < 3 && !(f.p[0] >= 0 && f.p[1] >= 0); i++) f.apply(ROT_NEG90);
      if (group === 'p4m' && f.p[1] > f.p[0]) f.apply([0, 1, 1, 0]);
      if (group === 'p4g' && f.p[0] + f.p[1] > 0.5) f.apply([0, -1, -1, 0], [0.5, 0.5]);
      f.p = [f.p[0] + 0.5, f.p[1] + 0.5];
      break;
    }
    case 'p3':
      f.wrapHex();
      f.sector(0, (2 * Math.PI) / 3);
      break;
    case 'p3m1':
      f.wrapHex();
      f.sector(-Math.PI / 6, (2 * Math.PI) / 3);
      f.mirrorAngle(Math.PI / 6);
      break;
    case 'p31m':
      f.wrapHex();
      f.sector(0, (2 * Math.PI) / 3);
      f.mirrorAngle(Math.PI / 3);
      break;
    case 'p6':
      f.wrapHex();
      f.sector(0, Math.PI / 3);
      break;
    case 'p6m':
      f.wrapHex();
      f.sector(0, Math.PI / 3);
      f.mirrorAngle(Math.PI / 6);
      break;
    case 'cn':
    case 'dn': {
      const n = Math.max(1, Math.round(order));
      f.sector(0, (2 * Math.PI) / n);
      if (group === 'dn') f.mirrorAngle(Math.PI / n);
      break;
    }
  }
  return f.result();
}

/** An isometry x -> m x + t, for the generators the tests check the folds against. */
export interface Isometry {
  m: Mat2;
  t: Vec2;
}

const iso = (m: Mat2, t: Vec2 = [0, 0]): Isometry => ({ m, t });
const rotation = (radians: number): Isometry =>
  iso([Math.cos(radians), -Math.sin(radians), Math.sin(radians), Math.cos(radians)]);

const SQUARE: Isometry[] = [iso([1, 0, 0, 1], [1, 0]), iso([1, 0, 0, 1], [0, 1])];
const HEX: Isometry[] = [iso([1, 0, 0, 1], [1, 0]), iso([1, 0, 0, 1], [0.5, SQRT3 / 2])];
const CENTRING = iso([1, 0, 0, 1], [0.5, 0.5]);
const MIRROR_X = iso([-1, 0, 0, 1]);
const MIRROR_Y = iso([1, 0, 0, -1]);

/**
 * Each group's generators, written from its definition rather than from the fold, so a test can
 * check that the fold is invariant under them: fold(g(p)) = fold(p).
 */
export function generators(group: SymmetryGroup, order = 6): Isometry[] {
  switch (group) {
    case 'p1':
      return SQUARE;
    case 'p2':
      return [...SQUARE, rotation(Math.PI)];
    case 'pm':
      return [...SQUARE, MIRROR_X];
    case 'pg':
      return [...SQUARE, iso([-1, 0, 0, 1], [0, 0.5])];
    case 'cm':
      return [...SQUARE, CENTRING, MIRROR_X];
    case 'pmm':
      return [...SQUARE, MIRROR_X, MIRROR_Y];
    case 'pmg':
      return [...SQUARE, iso([-1, 0, 0, 1], [0.5, 0]), rotation(Math.PI)];
    case 'pgg':
      return [...SQUARE, iso([1, 0, 0, -1], [0.5, 0.5]), iso([-1, 0, 0, 1], [0.5, 0.5])];
    case 'cmm':
      return [...SQUARE, CENTRING, MIRROR_X, MIRROR_Y];
    case 'p4':
      return [...SQUARE, rotation(Math.PI / 2)];
    case 'p4m':
      return [...SQUARE, rotation(Math.PI / 2), MIRROR_X];
    case 'p4g':
      return [...SQUARE, rotation(Math.PI / 2), iso([0, -1, -1, 0], [0.5, 0.5])];
    case 'p3':
      return [...HEX, rotation((2 * Math.PI) / 3)];
    case 'p3m1':
      return [...HEX, rotation((2 * Math.PI) / 3), MIRROR_X];
    case 'p31m':
      return [...HEX, rotation((2 * Math.PI) / 3), MIRROR_Y];
    case 'p6':
      return [...HEX, rotation(Math.PI / 3)];
    case 'p6m':
      return [...HEX, rotation(Math.PI / 3), MIRROR_Y];
    case 'cn':
      return [rotation((2 * Math.PI) / Math.max(1, Math.round(order)))];
    case 'dn':
      return [rotation((2 * Math.PI) / Math.max(1, Math.round(order))), MIRROR_Y];
  }
}

export function applyIsometry(g: Isometry, p: Readonly<Vec2>): Vec2 {
  return [g.m[0] * p[0] + g.m[1] * p[1] + g.t[0], g.m[2] * p[0] + g.m[3] * p[1] + g.t[1]];
}
