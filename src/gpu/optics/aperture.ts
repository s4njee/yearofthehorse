/*
 * Aperture settings (story 2.2) and the CPU side of src/wgsl/aperture.wgsl: the shape's area,
 * which the shader divides by so a point's light is the same whatever its shape.
 */
import type { ParamSchema } from '../../effects/types.ts';
import {
  APERTURE_TABLE_SIZE,
  heart,
  polarTable,
  regularPolygon,
  star,
  tableArea,
} from './shapes.ts';

export interface ApertureSettings {
  /** Sides of the polygon; 0 for a circle. */
  blades: number;
  /** Rotation, degrees. */
  rotation: number;
  /** 0 straight blades, 1 a circle. */
  curvature: number;
  /** Bright rim (> 0, soap bubble) or soft edge (< 0). -0.5..1. */
  rim: number;
  /** Onion-ring strength, 0..0.3. */
  rings: number;
  /** Whole number of onion rings. */
  ringCount: number;
  /** Cat's-eye strength, 0..1. */
  vignette: number;
  /** The hole of a mirror lens, as a share of the radius, 0..0.7. Default none. */
  obstruction?: number;
  /** `blades` (the polygon above), or an outline with no formula. Default `blades`. */
  shape?: string;
  /** Draw the polygon from a baked radius table instead of computing it (the 2.2 comparison). */
  baked?: boolean;
}

/** Outlines with no formula, by name: drawn from a radius table. */
export const APERTURE_SHAPES = ['blades', 'heart', 'star'] as const;

/** The controls every bokeh effect shares. Spread into an effect's params. */
export const APERTURE_PARAMS = {
  blades: { type: 'number', default: 0, min: 0, max: 9, step: 1, label: 'blades (0 round)' },
  rotation: { type: 'number', default: 0, min: 0, max: 90, step: 1, label: 'blade rotation (°)' },
  curvature: { type: 'number', default: 0.2, min: 0, max: 1, step: 0.01, label: 'blade curve' },
  rim: { type: 'number', default: 0.15, min: -0.5, max: 1, step: 0.01, label: 'rim' },
  rings: { type: 'number', default: 0, min: 0, max: 0.3, step: 0.01, label: 'onion rings' },
  ringCount: { type: 'number', default: 4, min: 1, max: 8, step: 1, label: 'ring count' },
  vignette: { type: 'number', default: 0.3, min: 0, max: 1, step: 0.01, label: "cat's eye" },
  obstruction: {
    type: 'number',
    default: 0,
    min: 0,
    max: 0.7,
    step: 0.01,
    label: 'mirror lens hole',
  },
  shape: { type: 'select', default: 'blades', options: APERTURE_SHAPES, label: 'aperture shape' },
  baked: { type: 'boolean', default: false, label: 'bake the shape (table)' },
} as const satisfies ParamSchema;

/** The shape's radius at angle `theta`, circumradius 1, as the shader has it. */
export function apertureRadius(
  theta: number,
  blades: number,
  rotation: number,
  curvature: number,
): number {
  if (blades < 3) return 1;
  const sector = (2 * Math.PI) / blades;
  const t = theta - rotation;
  const local = t - sector * Math.floor(t / sector) - 0.5 * sector;
  return (Math.cos(0.5 * sector) / Math.cos(local)) * (1 - curvature) + curvature;
}

/** Area of the shape with circumradius 1: half the integral of r(theta)^2. */
export function apertureArea(blades: number, rotation: number, curvature: number): number {
  if (blades < 3) return Math.PI;
  const steps = 720;
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const r = apertureRadius(((i + 0.5) / steps) * 2 * Math.PI, blades, rotation, curvature);
    sum += r * r;
  }
  return 0.5 * sum * ((2 * Math.PI) / steps);
}

/** The profile's mean over a ring from `k` to 1 of the radius (the whole shape when k is 0). */
export function profileMean(rim: number, rings: number, ringCount: number, k: number): number {
  const k2 = k * k;
  const span = 1 - k2;
  // Over the area, t = rho^2 is uniform on [k^2, 1].
  const rimMean = rim * ((1 - k2 ** 3) / span - 1);
  const ringMean =
    (-rings * Math.sin(2 * Math.PI * ringCount * k2)) / (2 * Math.PI * ringCount * span);
  return 1 + rimMean + ringMean;
}

const tables = new Map<string, Float32Array>();
function shapeTable(shape: string, blades: number, rotation: number): Float32Array {
  const key = `${shape}|${blades}|${rotation}`;
  let table = tables.get(key);
  if (!table) {
    table =
      shape === 'heart'
        ? polarTable(heart())
        : shape === 'star'
          ? polarTable(star())
          : polarTable(regularPolygon(Math.max(3, blades), rotation));
    tables.set(key, table);
  }
  return table;
}

/** The `Aperture` struct's fields, for a uniform buffer. `field` is set per point by the shader. */
export function apertureUniforms(a: ApertureSettings) {
  const blades = Math.round(a.blades) < 3 ? 0 : Math.round(a.blades);
  const rotation = (a.rotation * Math.PI) / 180;
  const ringCount = Math.max(1, Math.round(a.ringCount));
  const k = Math.min(0.7, Math.max(0, a.obstruction ?? 0));
  const shape = a.shape ?? 'blades';
  // A named outline, or a polygon baked on request (straight blades only: curvature is a formula).
  const useTable = shape !== 'blades' || (a.baked === true && blades > 0);
  const table = useTable
    ? shapeTable(shape, blades, rotation)
    : new Float32Array(APERTURE_TABLE_SIZE);
  return {
    blades,
    rotation,
    curvature: a.curvature,
    unit_area: useTable ? tableArea(table) : apertureArea(blades, rotation, a.curvature),
    rim: a.rim,
    rings: a.rings,
    ring_count: ringCount,
    vignette: a.vignette,
    obstruction: k,
    profile_mean: profileMean(a.rim, a.rings, ringCount, k),
    use_table: useTable ? 1 : 0,
    table,
  };
}
