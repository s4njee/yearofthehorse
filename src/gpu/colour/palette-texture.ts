import { bakePalette, parsePalette, namedPalette, type PaletteStop } from './palette.ts';

/** Texels in a baked palette. */
export const PALETTE_TEXELS = 256;

/**
 * A 1D gradient palette as a 256 x 1 `rgba16float` texture, rebaked only when its text changes,
 * so an effect can pass `params.palette` every frame. Sample it with `palette_at` and a sampler
 * with repeat addressing (cyclic) or clamp-to-edge.
 */
export interface PaletteTexture {
  readonly texture: GPUTexture;
  readonly view: GPUTextureView;
  readonly stops: readonly PaletteStop[];
  /** Rebakes if `text` (`formatPalette` form) differs from the last; malformed text is ignored. */
  update(text: string): void;
  /** Rebakes from stops directly, if they differ from the last. */
  bake(stops: readonly PaletteStop[]): void;
  destroy(): void;
}

export function createPaletteTexture(
  device: GPUDevice,
  text: string,
  options: { cyclic?: boolean; label?: string } = {},
): PaletteTexture {
  const texture = device.createTexture({
    label: options.label ?? 'palette',
    size: [PALETTE_TEXELS, 1],
    format: 'rgba16float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  const view = texture.createView();
  let last = '';
  let stops: PaletteStop[] = namedPalette('journey');
  const half = new Uint16Array(PALETTE_TEXELS * 4);

  const bake = (next: readonly PaletteStop[]) => {
    const key = JSON.stringify(next);
    if (key === last) return;
    last = key;
    stops = next.map((s) => [...s] as PaletteStop);
    const texels = bakePalette(stops, PALETTE_TEXELS, options.cyclic ?? true);
    for (let i = 0; i < texels.length; i++) half[i] = toHalf(texels[i]!);
    device.queue.writeTexture({ texture }, half, { bytesPerRow: PALETTE_TEXELS * 8 }, [
      PALETTE_TEXELS,
      1,
    ]);
  };
  const update = (next: string) => {
    const parsed = parsePalette(next);
    if (parsed) bake(parsed);
  };
  update(text);
  if (last === '') bake(stops);

  return {
    texture,
    view,
    get stops() {
      return stops;
    },
    update,
    bake,
    destroy: () => texture.destroy(),
  };
}

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

/** IEEE half from a float, round to nearest; enough for colour in 0..1. */
export function toHalf(value: number): number {
  f32[0] = value;
  const x = u32[0]!;
  const sign = (x >>> 16) & 0x8000;
  const exponent = ((x >>> 23) & 0xff) - 127 + 15;
  const mantissa = x & 0x7fffff;
  if (exponent <= 0) return sign;
  if (exponent >= 31) return sign | 0x7c00;
  return sign | (exponent << 10) | ((mantissa + 0x1000) >>> 13);
}
