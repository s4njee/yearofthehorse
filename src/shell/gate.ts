import { gateKey, gateNotice, type GateReason } from '../gpu/safety/gate.ts';
import type { Unmount } from './types.ts';
import './gate.css';

// Story 2.6: the click-to-start notice over a paused effect. The rules are in
// src/gpu/safety/gate.ts; this is the DOM, and the memory of a choice, which lasts for the
// browser session only (sessionStorage), so a visitor who started a strong preset yesterday is
// asked again today.

export function gateAccepted(id: string, preset: string | undefined): boolean {
  try {
    return globalThis.sessionStorage?.getItem(gateKey(id, preset)) === '1';
  } catch {
    return false;
  }
}

function remember(id: string, preset: string | undefined): void {
  try {
    globalThis.sessionStorage?.setItem(gateKey(id, preset), '1');
  } catch {
    // Storage can be blocked; the visitor is then asked again next time.
  }
}

export interface GateOptions {
  id: string;
  preset: string | undefined;
  reasons: readonly GateReason[];
  /** The visitor chose to start it. */
  onStart(): void;
  /** The visitor chose the calm defaults instead. */
  onCalm(): void;
}

const open = new WeakMap<HTMLElement, Unmount>();

/** Closes the notice over `container`, if one is open. Returns true when it closed one. */
export function closeGate(container: HTMLElement): boolean {
  const close = open.get(container);
  close?.();
  return close !== undefined;
}

/**
 * Shows the notice over `container` (positioned), replacing any already there. Nothing starts on
 * its own.
 */
export function showGate(container: HTMLElement, options: GateOptions): Unmount {
  closeGate(container);
  const root = document.createElement('div');
  root.className = 'yh-gate';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'false');
  root.setAttribute('aria-labelledby', 'yh-gate-title');
  const panel = document.createElement('div');
  panel.className = 'yh-gate__panel';
  const title = document.createElement('h2');
  title.className = 'yh-gate__title';
  title.id = 'yh-gate-title';
  title.textContent = 'Paused: a strong setting';
  const text = document.createElement('p');
  text.className = 'yh-gate__text';
  text.textContent = gateNotice(options.reasons);
  const actions = document.createElement('div');
  actions.className = 'yh-gate__actions';
  const start = document.createElement('button');
  start.type = 'button';
  start.className = 'yh-button yh-gate__start';
  start.textContent = 'Start it';
  const calm = document.createElement('button');
  calm.type = 'button';
  calm.className = 'yh-button';
  calm.textContent = 'Use the calm defaults';
  actions.append(start, calm);
  panel.append(title, text, actions);
  root.append(panel);
  container.append(root);

  const close = () => {
    root.remove();
    if (open.get(container) === close) open.delete(container);
  };
  open.set(container, close);
  start.addEventListener('click', () => {
    remember(options.id, options.preset);
    close();
    options.onStart();
  });
  calm.addEventListener('click', () => {
    close();
    options.onCalm();
  });
  return close;
}
