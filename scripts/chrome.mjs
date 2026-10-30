// A headless Chrome driven over the DevTools protocol, with no dependencies: Node's own WebSocket.
// Shared by scripts/browser-check.mjs and scripts/posters.mjs (from Fire Temple's browser check).
//
//   const chrome = await launchChrome();
//   await chrome.page('Page.navigate', { url });
//   const value = await chrome.evaluate('document.title');
//   chrome.errors;   // console errors and uncaught exceptions since the last reset
//   chrome.browser('Tracing.start', {...});   // browser-wide commands, such as tracing
//   chrome.on((message) => ...);              // every event, from every session
//   chrome.close();

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

export const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function launchChrome(chromePath = DEFAULT_CHROME) {
  const profile = mkdtempSync(join(tmpdir(), 'yearofthehorse-chrome-'));
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--hide-scrollbars',
      '--enable-unsafe-webgpu',
      '--window-size=1280,900',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );

  const endpoint = await new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(`Chrome did not start:\n${stderr}`)), 20_000);
    chrome.stderr.on('data', (chunk) => {
      stderr += chunk;
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(stderr);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });

  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  const listeners = new Set();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined) {
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) waiter?.reject(new Error(message.error.message));
      else waiter?.resolve(message.result);
    } else for (const listener of listeners) listener(message);
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);
  await page('Page.enable');
  await page('Runtime.enable');
  await page('Log.enable');

  const session = {
    page,
    browser: (method, params) => send(method, params),
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    errors: [],
    async evaluate(expression) {
      const result = await page('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      return result.result?.value;
    },
    close() {
      socket.close();
      chrome.kill('SIGKILL');
      rmSync(profile, { recursive: true, force: true });
    },
  };
  listeners.add((message) => {
    if (message.sessionId !== sessionId) return;
    if (message.method === 'Runtime.exceptionThrown') {
      session.errors.push(
        message.params.exceptionDetails.exception?.description ?? 'uncaught exception',
      );
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      session.errors.push(
        message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '),
      );
    } else if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      session.errors.push(message.params.entry.text);
    }
  });
  return session;
}

/** Waits for the effect page's canvas to get a real drawing buffer, or for the fallback notice. */
export async function waitForEffect(chrome, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await sleep(200);
    const now = await chrome
      .evaluate(
        `(() => {
          if (document.querySelector('.yh-fallback')) return 'fallback';
          const canvas = document.querySelector('.yh-host__canvas');
          return canvas && canvas.width > 1 && canvas.height > 1 ? 'running' : 'loading';
        })()`,
      )
      .catch(() => 'loading');
    if (now !== 'loading') return { state: now, loadMs: Date.now() - started };
  }
  return { state: 'timeout', loadMs: Date.now() - started };
}

/** Makes the effect page's stage exactly the viewport, so the canvas is the viewport's size. */
export const FULLSCREEN_STAGE = `(() => {
  const stage = document.querySelector('.yh-effect__stage');
  if (stage) Object.assign(stage.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '100', border: '0', borderRadius: '0' });
})()`;

// --- A minimal PNG reader (8-bit RGB or RGBA, as Chrome writes them) ------------------------------

export function decodePng(buffer) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 4;
  const data = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      channels = body[9] === 2 ? 3 : 4;
    } else if (type === 'IDAT') data.push(body);
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      pixels[y * stride + x] = (row[x] + predictor) & 0xff;
    }
  }
  return { width, height, channels, pixels };
}
