import { listEffects, loadEffect } from '../effects/registry.ts';
import type { EffectMeta } from '../effects/types.ts';
import { layouts, type MountedLayout } from './contexts.ts';
import { mountEffect, type EffectHost } from './host.ts';
import { lazyMount } from './lazy.ts';
import {
  activePreset,
  decodeParams,
  PARAM_PREFIX,
  PRESET_KEY,
  valuesFromQuery,
} from './params-url.ts';
import { gateReasons } from '../gpu/safety/gate.ts';
import { closeGate, gateAccepted, showGate } from './gate.ts';
import { displaySupportsHdr } from '../gpu/canvas.ts';
import { displaySupportsP3 } from '../gpu/colour/wide-gamut.ts';
import { hrefFor, onQueryChange, readQuery, updateQuery } from './router.ts';
import type { ShellContext, Unmount } from './types.ts';
import './effect-page.css';

const TABS = [
  { id: 'notes', title: 'Notes' },
  { id: 'source', title: 'Source' },
  { id: 'scorecard', title: 'Scorecard' },
] as const;
type TabId = (typeof TABS)[number]['id'];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string): HTMLButtonElement {
  const node = el('button', 'yh-button', label);
  node.type = 'button';
  return node;
}

function intro(meta: EffectMeta): HTMLElement {
  const header = el('header', 'yh-effect__intro');
  const chips = el('div', 'yh-effect__chips');
  const tier = el('span', 'yh-chip', `Tier ${meta.tier}`);
  tier.dataset.tier = meta.tier;
  chips.append(tier, ...meta.tags.map((tag) => el('span', 'yh-chip', tag)));
  header.append(el('h1', 'yh-effect__title', meta.title), chips);
  if (meta.summary) header.append(el('p', 'yh-muted', meta.summary));
  return header;
}

export function mountEffectPage(container: HTMLElement, shell: ShellContext, id: string): Unmount {
  const meta = listEffects().find((candidate) => candidate.id === id)!;
  document.title = `${meta.title} · Year of the Horse`;

  const root = el('div', 'yh-effect');
  const main = el('div', 'yh-effect__main');
  const stage = el('div', 'yh-effect__stage');
  const hudSlot = el('div', 'yh-effect__hud');
  const toolbar = el('div', 'yh-effect__toolbar');
  const tabs = el('div', 'yh-tabs');
  tabs.setAttribute('role', 'tablist');
  const tabPanel = el('div', 'yh-effect__tabpanel');
  tabPanel.setAttribute('role', 'tabpanel');
  const side = el('aside', 'yh-effect__side');
  const controlsSlot = el('div', 'yh-effect__controls');
  side.append(intro(meta), controlsSlot);
  main.append(stage, toolbar, tabs, tabPanel);
  root.append(main, side);
  container.append(root);

  // Toolbar: where the effect is shown, then how it is inspected.
  const layoutGroup = el('div', 'yh-effect__group');
  layoutGroup.setAttribute('role', 'group');
  layoutGroup.setAttribute('aria-label', 'Page context');
  // The context an effect opens in: the bare canvas, unless its meta names another (an effect
  // that lights the page opens on one). The default is the one that leaves the URL clean.
  const defaultLayout = layouts.find((candidate) => candidate.id === meta.layout) ?? layouts[0]!;
  const layoutButtons = layouts.map((layout) => {
    const node = button(layout.title);
    node.addEventListener('click', () =>
      updateQuery({ layout: layout === defaultLayout ? null : layout.id }, { replace: true }),
    );
    layoutGroup.append(node);
    return node;
  });
  // An emissive effect has to be judged over both kinds of page, whatever the site theme is.
  const PAGE_TONES = ['site', 'dark', 'light'] as const;
  const pageButton = button('Page: site');
  pageButton.title = 'Show the effect over a dark or a light page, independent of the site theme.';
  pageButton.addEventListener('click', () => {
    const current = PAGE_TONES.find((tone) => tone === readQuery().get('page')) ?? 'site';
    const next = PAGE_TONES[(PAGE_TONES.indexOf(current) + 1) % PAGE_TONES.length]!;
    updateQuery({ page: next === 'site' ? null : next }, { replace: true });
  });
  const showPageTone = (query: URLSearchParams) => {
    const tone = PAGE_TONES.find((candidate) => candidate === query.get('page')) ?? 'site';
    if (tone === 'site') delete stage.dataset.page;
    else stage.dataset.page = tone;
    pageButton.textContent = `Page: ${tone}`;
  };
  const hudButton = button('Performance');
  hudButton.addEventListener('click', () =>
    updateQuery({ hud: readQuery().has('hud') ? null : '1' }, { replace: true }),
  );
  const fullscreenButton = button('Fullscreen');
  fullscreenButton.addEventListener('click', () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stage.requestFullscreen();
  });
  toolbar.append(
    layoutGroup,
    pageButton,
    el('span', 'yh-effect__spacer'),
    hudButton,
    fullscreenButton,
  );

  const tabButtons = TABS.map((tab) => {
    const node = el('button', 'yh-tab', tab.title);
    node.type = 'button';
    node.setAttribute('role', 'tab');
    node.addEventListener('click', () =>
      updateQuery({ tab: tab === TABS[0] ? null : tab.id }, { replace: true }),
    );
    tabs.append(node);
    return node;
  });

  let host: EffectHost | undefined;
  let layout: (MountedLayout & { id: string }) | undefined;
  let hud: Unmount | undefined;
  let tab: { id: TabId; unmount: Unmount } | undefined;
  let controls: Unmount | undefined;
  let disposed = false;

  function showLayout(query: URLSearchParams) {
    const wanted =
      layouts.find((candidate) => candidate.id === query.get('layout')) ?? defaultLayout;
    layoutButtons.forEach((node, index) =>
      node.setAttribute('aria-pressed', String(layouts[index] === wanted)),
    );
    if (!host || layout?.id === wanted.id) return;
    // The canvas keeps its GPU context when its element moves, so switching context is free.
    host.element.remove();
    layout?.destroy();
    layout = { id: wanted.id, ...wanted.mount(stage) };
    layout.stage.append(host.element);
    stage.append(hudSlot);
  }

  function showHud(query: URLSearchParams) {
    const on = query.has('hud');
    hudButton.setAttribute('aria-pressed', String(on));
    if (!host || on === (hud !== undefined)) return;
    if (on) {
      const mounted = host;
      hud = lazyMount(hudSlot, 'performance', async () =>
        (await import('./hud.ts')).mountHud(hudSlot, mounted, shell),
      );
    } else {
      hud?.();
      hud = undefined;
    }
  }

  function showTab(query: URLSearchParams) {
    const wanted = TABS.find((candidate) => candidate.id === query.get('tab')) ?? TABS[0];
    tabButtons.forEach((node, index) =>
      node.setAttribute('aria-selected', String(TABS[index] === wanted)),
    );
    if (tab?.id === wanted.id) return;
    tab?.unmount();
    tabPanel.replaceChildren();
    const load: Record<TabId, () => Promise<Unmount>> = {
      notes: async () => (await import('./notes.ts')).mountNotes(tabPanel, id),
      source: async () => (await import('./source-viewer.ts')).mountSourceViewer(tabPanel, id),
      scorecard: async () => (await import('./scorecard.ts')).mountScorecard(tabPanel, meta, host),
    };
    tab = { id: wanted.id, unmount: lazyMount(tabPanel, wanted.title, load[wanted.id]) };
  }

  function show(query: URLSearchParams) {
    showPageTone(query);
    showLayout(query);
    showHud(query);
    showTab(query);
  }

  const stopListening = onQueryChange(show);
  show(readQuery());

  // The schema is needed to decode parameter values from the URL before the first frame.
  void loadEffect(id).then((effect) => {
    if (disposed) return;
    const query = readQuery();
    const wantsHdr = query.has('hdr');
    const wantsP3 = query.has('p3');
    // Story 2.6: a link to a strong setting opens paused, behind the click-to-start notice.
    const presets = effect.presets ?? {};
    const initial = valuesFromQuery(effect.params, presets, query);
    const preset =
      activePreset(effect.params, presets, initial) ?? query.get(PRESET_KEY) ?? undefined;
    const reasons = gateReasons(meta, preset, initial);
    const gated = reasons.length > 0 && !gateAccepted(id, preset);
    const mounted = mountEffect(shell.session, stage, id, {
      initialParams: decodeParams(effect.params, query),
      allowHdr: wantsHdr,
      allowWideGamut: wantsP3,
      paused: gated,
    });
    if (gated) {
      showGate(mounted.element, {
        id,
        preset,
        reasons,
        onStart: () => mounted.resume(),
        onCalm: () => {
          const changes: Record<string, null> = { [PRESET_KEY]: null };
          for (const key of readQuery().keys())
            if (key.startsWith(PARAM_PREFIX)) changes[key] = null;
          updateQuery(changes, { replace: true });
          mounted.resume();
        },
      });
    }
    if (effect.hdr) {
      // The canvas format is fixed when the host is created, so the toggle reloads the page.
      const hdrButton = button('HDR canvas');
      hdrButton.setAttribute('aria-pressed', String(wantsHdr));
      if (displaySupportsHdr()) {
        hdrButton.title = 'Extended-range output. Expect a lower frame rate while it is on.';
        hdrButton.addEventListener('click', () =>
          location.assign(hrefFor({ hdr: wantsHdr ? null : '1' })),
        );
      } else {
        hdrButton.disabled = true;
        hdrButton.title = 'This display does not report high dynamic range.';
      }
      fullscreenButton.before(hdrButton);
    }
    if (effect.wideGamut) {
      // As with HDR, the canvas colour space is fixed when the host is created.
      const p3Button = button('P3 colour');
      p3Button.setAttribute('aria-pressed', String(wantsP3));
      if (displaySupportsP3()) {
        p3Button.title = 'A display-p3 canvas: more saturated colour than sRGB can hold.';
        p3Button.addEventListener('click', () =>
          location.assign(hrefFor({ p3: wantsP3 ? null : '1' })),
        );
      } else {
        p3Button.disabled = true;
        p3Button.title = 'This display does not report the P3 gamut.';
      }
      fullscreenButton.before(p3Button);
    }
    host = mounted;
    controls = lazyMount(controlsSlot, 'controls', async () =>
      (await import('./controls.ts')).mountControls(controlsSlot, mounted),
    );
    // A scorecard opened straight from a link mounted before the host existed; give it the host
    // so it can show this device's live reading.
    if (tab?.id === 'scorecard') {
      tab.unmount();
      tab = undefined;
    }
    show(readQuery());
  });

  return () => {
    disposed = true;
    stopListening();
    if (host) closeGate(host.element);
    controls?.();
    hud?.();
    tab?.unmount();
    layout?.destroy();
    host?.destroy();
    root.remove();
    document.title = 'Year of the Horse';
  };
}
