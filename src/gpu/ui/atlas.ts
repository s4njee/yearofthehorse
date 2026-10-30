import { createTextureFromData } from '../texture.ts';
import { ATLAS_GZIP } from './atlas-data.ts';

/*
 * The shared text atlas, copied from Fire Temple (firetemple/src/gpu/ui/atlas.ts, used there by
 * fire-text and the UI fire effects): a multi-channel signed-distance field of Anton's A-Z and
 * 0-9, made for Water Temple (Fire Temple's scripts/ui/README.md rebuilds it). 36 glyphs in 12
 * columns and 3 rows of 32 x 48 pixel cells, each glyph centred in its cell at 36 px per em, with
 * a distance range of 4 pixels. Read it as LINEAR data (rgba8unorm, never -srgb): the median of
 * the three channels is the distance, and msdf.wgsl turns it back into a sharp edge at any size.
 *
 *   const atlas = await createTextAtlas(device);                    // texture + metrics, once
 *   const line = layoutText('LATE SHOW', atlas.metrics);            // glyph placements
 *
 * Fixed display text only: no shaping, kerning or lower case. `layoutText` places glyphs by their
 * own ink widths (measured from the atlas when it is decoded), which is proportional spacing
 * without a font file. Unchanged from Fire Temple apart from this comment.
 */

export const ATLAS_GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const ATLAS_COLUMNS = 12;
export const ATLAS_ROWS = 3;
export const ATLAS_CELL_WIDTH = 32;
export const ATLAS_CELL_HEIGHT = 48;
export const ATLAS_WIDTH = ATLAS_CELL_WIDTH * ATLAS_COLUMNS;
export const ATLAS_HEIGHT = ATLAS_CELL_HEIGHT * ATLAS_ROWS;
/** Distance range of the field, in atlas pixels (so 4/48 of a cell height). */
export const ATLAS_RANGE = 4;

/** Where each glyph's ink is in its cell, in cell heights (a cell is 2/3 of a height wide). */
export interface GlyphMetrics {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface PlacedGlyph {
  /** Index into ATLAS_GLYPHS. */
  glyph: number;
  /** Where the glyph's CELL starts, cell heights from the start of the line. */
  x: number;
}

export interface TextLine {
  glyphs: PlacedGlyph[];
  /** From the first glyph's ink to the last one's, cell heights. */
  width: number;
}

let decoded: Promise<Uint8Array<ArrayBuffer>> | undefined;

export function decodeAtlas(): Promise<Uint8Array<ArrayBuffer>> {
  decoded ??= (async () => {
    const encoded = Uint8Array.from(atob(ATLAS_GZIP), (c) => c.charCodeAt(0));
    const stream = new Blob([encoded]).stream().pipeThrough(new DecompressionStream('gzip'));
    const data = new Uint8Array(await new Response(stream).arrayBuffer());
    if (data.length !== ATLAS_WIDTH * ATLAS_HEIGHT * 4) throw new Error('Corrupt text atlas');
    return data;
  })();
  return decoded;
}

/** The ink bounds of every glyph: texels whose median distance says "inside". */
export function measureGlyphs(data: Uint8Array): GlyphMetrics[] {
  return Array.from(ATLAS_GLYPHS, (_, index) => {
    const cx = (index % ATLAS_COLUMNS) * ATLAS_CELL_WIDTH;
    const cy = Math.floor(index / ATLAS_COLUMNS) * ATLAS_CELL_HEIGHT;
    let left = ATLAS_CELL_WIDTH;
    let right = 0;
    let top = ATLAS_CELL_HEIGHT;
    let bottom = 0;
    for (let y = 0; y < ATLAS_CELL_HEIGHT; y++)
      for (let x = 0; x < ATLAS_CELL_WIDTH; x++) {
        const at = ((cy + y) * ATLAS_WIDTH + cx + x) * 4;
        const r = data[at]!;
        const g = data[at + 1]!;
        const b = data[at + 2]!;
        const median = Math.max(Math.min(r, g), Math.min(Math.max(r, g), b));
        if (median < 128) continue;
        left = Math.min(left, x);
        right = Math.max(right, x + 1);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y + 1);
      }
    const h = ATLAS_CELL_HEIGHT;
    return { left: left / h, right: right / h, top: top / h, bottom: bottom / h };
  });
}

export interface LayoutOptions {
  /** Gap between glyphs' ink, cell heights. Default 0.06. */
  tracking?: number;
  /** Width of a space, cell heights. Default 0.2. */
  space?: number;
}

/**
 * Places `text` on one line. Letters are upper-cased; anything not in the atlas but a space is
 * dropped.
 */
export function layoutText(
  text: string,
  metrics: readonly GlyphMetrics[],
  options: LayoutOptions = {},
): TextLine {
  const tracking = options.tracking ?? 0.06;
  const space = options.space ?? 0.2;
  const glyphs: PlacedGlyph[] = [];
  let pen = 0;
  let last = 0;
  for (const char of text.toUpperCase()) {
    if (char === ' ') {
      if (glyphs.length > 0) pen += space;
      continue;
    }
    const glyph = ATLAS_GLYPHS.indexOf(char);
    const m = metrics[glyph];
    if (glyph < 0 || !m) continue;
    glyphs.push({ glyph, x: pen - m.left });
    last = pen + (m.right - m.left);
    pen = last + tracking;
  }
  return { glyphs, width: last };
}

export interface TextAtlas {
  texture: GPUTexture;
  metrics: GlyphMetrics[];
}

export async function createTextAtlas(device: GPUDevice): Promise<TextAtlas> {
  const data = await decodeAtlas();
  const texture = createTextureFromData(device, {
    label: 'Anton MSDF (linear data)',
    width: ATLAS_WIDTH,
    height: ATLAS_HEIGHT,
    data,
  });
  return { texture, metrics: measureGlyphs(data) };
}
