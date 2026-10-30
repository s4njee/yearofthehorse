import {
  formatPalette,
  MAX_STOPS,
  namedPalette,
  PALETTE_NAMES,
  parsePalette,
  safePaletteSpeed,
  type PaletteStop,
} from '../gpu/colour/palette.ts';
import { oklchToOklab, oklabToOklch } from '../gpu/colour/oklab.ts';
import { HUE_SAFE_MAX_SPEED } from '../gpu/safety/colour-caps.ts';
import './palette-editor.css';

// Story 3.2: the shell's palette editor, for `palette` parameters. A gradient preview (drawn by
// the browser in OKLab from the same OKLCH stops, so it matches before the red cap), one row of
// lightness, chroma and hue sliders per stop, and a choice of the named palettes. The value is
// `formatPalette` text, so it goes into links like any other parameter.

const DEG = Math.PI / 180;

export interface PaletteEditor {
  readonly element: HTMLElement;
  /** Shows `text` (after a preset, reset or history navigation). */
  refresh(text: string): void;
}

function slider(label: string, min: number, max: number, step: number): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.setAttribute('aria-label', label);
  return input;
}

const css = ([L, C, h]: PaletteStop) =>
  `oklch(${(L * 100).toFixed(1)}% ${C.toFixed(3)} ${((h / DEG + 360) % 360).toFixed(1)})`;

export function mountPaletteEditor(
  label: string,
  initial: string,
  changed: (text: string) => void,
): PaletteEditor {
  const root = document.createElement('div');
  root.className = 'yh-palette';
  const head = document.createElement('div');
  head.className = 'yh-palette__head';
  const title = document.createElement('span');
  title.className = 'yh-label';
  title.textContent = label;
  const named = document.createElement('select');
  named.className = 'yh-controls__select';
  named.setAttribute('aria-label', `${label}: load a named palette`);
  named.append(new Option('Load…', ''), ...PALETTE_NAMES.map((name) => new Option(name, name)));
  head.append(title, named);
  const preview = document.createElement('div');
  preview.className = 'yh-palette__preview';
  preview.setAttribute('role', 'img');
  const rows = document.createElement('div');
  rows.className = 'yh-palette__rows';
  const foot = document.createElement('div');
  foot.className = 'yh-palette__foot';
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'yh-button';
  add.textContent = 'Add stop';
  const note = document.createElement('span');
  note.className = 'yh-muted yh-palette__note';
  foot.append(add, note);
  root.append(head, preview, rows, foot);

  let stops: PaletteStop[] = parsePalette(initial) ?? namedPalette('journey');

  const render = () => {
    preview.style.background = `linear-gradient(to right in oklab, ${[...stops, stops[0]!].map(css).join(', ')})`;
    preview.setAttribute('aria-label', `${label}: ${stops.length} stops`);
    // The tighter of the palette's own flash limit and the hue cap is what an effect may use.
    const speed = safePaletteSpeed(stops);
    note.textContent =
      speed >= HUE_SAFE_MAX_SPEED
        ? `Its lightness allows any speed; the hue cap of ${HUE_SAFE_MAX_SPEED} turns a second applies.`
        : `Its lightness flashes limit cycling over a large area to ${speed.toFixed(2)} turns a second.`;
    rows.replaceChildren(
      ...stops.map((stop, index) => {
        const row = document.createElement('div');
        row.className = 'yh-palette__row';
        const swatch = document.createElement('span');
        swatch.className = 'yh-palette__swatch';
        swatch.style.background = css(stop);
        const L = slider(`Stop ${index + 1} lightness`, 0, 1, 0.01);
        L.value = String(stop[0]);
        const C = slider(`Stop ${index + 1} chroma`, 0, 0.37, 0.005);
        C.value = String(stop[1]);
        const h = slider(`Stop ${index + 1} hue`, 0, 360, 1);
        h.value = String(Math.round((((stop[2] / DEG) % 360) + 360) % 360));
        const update = () => {
          stops[index] = [Number(L.value), Number(C.value), Number(h.value) * DEG];
          swatch.style.background = css(stops[index]!);
          preview.style.background = `linear-gradient(to right in oklab, ${[...stops, stops[0]!].map(css).join(', ')})`;
          changed(formatPalette(stops));
        };
        for (const input of [L, C, h]) input.addEventListener('input', update);
        // Re-render on release only, so the note follows without rebuilding mid-drag.
        for (const input of [L, C, h]) input.addEventListener('change', render);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'yh-button yh-palette__remove';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `Remove stop ${index + 1}`);
        remove.disabled = stops.length <= 2;
        remove.addEventListener('click', () => {
          stops.splice(index, 1);
          render();
          changed(formatPalette(stops));
        });
        row.append(swatch, L, C, h, remove);
        return row;
      }),
    );
    add.disabled = stops.length >= MAX_STOPS;
  };

  add.addEventListener('click', () => {
    // Halfway (in OKLab) between the last stop and the first.
    const a = oklchToOklab(stops[stops.length - 1]!);
    const b = oklchToOklab(stops[0]!);
    stops.push(oklabToOklch([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]));
    render();
    changed(formatPalette(stops));
  });
  named.addEventListener('change', () => {
    if (!named.value) return;
    stops = namedPalette(named.value);
    named.value = '';
    render();
    changed(formatPalette(stops));
  });

  render();
  return {
    element: root,
    refresh(text) {
      if (text === formatPalette(stops)) return;
      stops = parsePalette(text) ?? stops;
      render();
    },
  };
}
