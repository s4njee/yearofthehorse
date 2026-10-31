// The "Hanabi over the river" page (hanabi.html): the tour of the shells (river-tour) fixed behind a
// whole page, the way a festival's site would use it. Ordinary page code: mount the effect, follow
// its programme (the act in the air is one of its live numbers), and wire up the toolbar.

import { createGpuSession } from '../../gpu/device.ts';
import { mountEffect } from '../../shell/host.ts';
import { reserveToolbar } from '../page/page.ts';
// The shared page's layout and plates, in this page's colours (hanabi.css imports it).
import './hanabi.css';

const EFFECT = 'river-tour';

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`hanabi page: #${id} is missing`);
  return node as T;
}

if (import.meta.env.DEV) {
  const { installShaderOverlay } = await import('../../gpu/shader-overlay.ts');
  installShaderOverlay();
}

const stage = byId('stage');
const status = byId('status');
const actName = byId('act-name');
const nowCaption = byId('now-caption');
const pauseButton = byId<HTMLButtonElement>('pause');
const doseSlider = byId<HTMLInputElement>('dose');
const smokeSlider = byId<HTMLInputElement>('smoke');
const windSlider = byId<HTMLInputElement>('wind');
const trailsSelect = byId<HTMLSelectElement>('trails');
const captionsBox = byId<HTMLInputElement>('captions');
const acts = [...document.querySelectorAll<HTMLElement>('.act')];

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * What the page asks of the effect: the toolbar's controls. The page names each act in its own
 * text, so the effect's names in the sky start off.
 */
const settings: Record<string, unknown> = {
  dose: Number(doseSlider.value),
  smoke: Number(smokeSlider.value),
  wind: Number(windSlider.value),
  trails: trailsSelect.value,
  captions: captionsBox.checked,
};

const session = await createGpuSession();
let playing = !reducedMotion;

function set(key: string, value: unknown) {
  settings[key] = value;
  const params = host.loaded?.params;
  if (params) params[key] = value as (typeof params)[string];
}

function render() {
  const ok = session.state.ok;
  document.body.dataset.state = !ok ? 'fallback' : playing ? 'live' : 'paused';
  status.textContent = !ok ? 'WebGPU is unavailable' : `The show is ${playing ? 'on' : 'paused'}`;
  pauseButton.textContent = playing ? 'Pause' : 'Play';
  if (!ok) pauseButton.disabled = true;
}

const host = mountEffect(session, stage, EFFECT, {
  initialParams: settings,
  paused: !playing,
});
host.onLoad(() => {
  pauseButton.disabled = false;
  render();
});
session.onChange(render);
render();

// --- Following the programme -----------------------------------------------------------------------
// The effect reports the act in the air with its live numbers, after each frame drawn. The page
// marks that act in the programme and names it in the toolbar and under the hero.

let shown = '';
host.onStats((stats) => {
  const act = stats.effect?.act;
  if (typeof act !== 'string' || act === shown) return;
  shown = act;
  actName.textContent = act;
  nowCaption.textContent = `NOW — ${act.toUpperCase()}`;
  for (const item of acts) {
    if (item.dataset.act === act) item.setAttribute('aria-current', 'true');
    else item.removeAttribute('aria-current');
  }
});

// --- The toolbar -----------------------------------------------------------------------------------

reserveToolbar(document.querySelector<HTMLElement>('.toolbar')!);

pauseButton.addEventListener('click', () => {
  playing = !playing;
  if (playing) host.resume();
  else host.pause();
  render();
});

doseSlider.addEventListener('input', () => set('dose', Number(doseSlider.value)));
smokeSlider.addEventListener('input', () => set('smoke', Number(smokeSlider.value)));
windSlider.addEventListener('input', () => set('wind', Number(windSlider.value)));
trailsSelect.addEventListener('change', () => set('trails', trailsSelect.value));
captionsBox.addEventListener('change', () => set('captions', captionsBox.checked));

addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  host.destroy();
  session.destroy();
});
