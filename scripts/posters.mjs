// Captures the fallback poster of each effect (story 1.5): the image a visitor without WebGPU sees.
//
//   npm run posters -- [effect ...] [--base http://localhost:5520] [--size 960x540] [--force]
//
// Start the site first (`npm run dev`). For each effect, loads its page in a headless Chrome with
// reduced motion asked for, so the host draws the frame it holds for such a visitor (the subject at
// rest, never a frozen flare), makes the stage the whole viewport, and saves it as
// src/effects/<id>/poster.webp, encoded by Chrome itself. With no effect named it does every effect
// that has no poster yet (`--force` redoes them all).
//
// Fire Temple renders its posters on Dawn and encodes them with cwebp; this one uses the browser a
// visitor would, and needs nothing installed beyond Chrome.

import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FULLSCREEN_STAGE, launchChrome, sleep, waitForEffect } from './chrome.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const valueFlags = new Set(['--base', '--size']);
const named = args.filter(
  (arg, index) => !arg.startsWith('--') && !valueFlags.has(args[index - 1]),
);
const force = args.includes('--force');
const base = option('base', 'http://localhost:5520').replace(/\/$/, '');
const [width, height] = option('size', '960x540').split('x').map(Number);

const root = 'src/effects';
const all = readdirSync(root).filter((name) => existsSync(join(root, name, 'index.ts')));
const ids =
  named.length > 0
    ? named
    : all.filter((id) => force || !existsSync(join(root, id, 'poster.webp')));
if (ids.length === 0) {
  console.log('posters: every effect already has one (use --force to redo).');
  process.exit(0);
}

const chrome = await launchChrome();
let failed = 0;
try {
  await chrome.page('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await chrome.page('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  for (const id of ids) {
    chrome.errors.length = 0;
    // An effect whose page opens in a context (meta.layout) is captured on that mock page: a glint
    // on a button or a lit headline needs the page it lights. For one that only sits behind a page
    // (lamp-in-fog's backdrop), capture it with its layout set aside.
    await chrome.page('Page.navigate', { url: `${base}/?effect=${id}` });
    const { state } = await waitForEffect(chrome);
    if (state !== 'running') {
      console.error(`posters: ${id} did not start (${state})`);
      failed++;
      continue;
    }
    await chrome.evaluate(FULLSCREEN_STAGE);
    // Long enough for the resize to reach the canvas and the held frame to be drawn again.
    await sleep(2500);
    if (chrome.errors.length > 0) {
      console.error(`posters: ${id} logged an error: ${chrome.errors[0]}`);
      failed++;
      continue;
    }
    const { data } = await chrome.page('Page.captureScreenshot', {
      format: 'webp',
      quality: 78,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    const out = join(root, id, 'poster.webp');
    writeFileSync(out, Buffer.from(data, 'base64'));
    console.log(`${out}  ${(statSync(out).size / 1024).toFixed(1)} kB`);
  }
} finally {
  chrome.close();
}
process.exit(failed > 0 ? 1 : 0);
