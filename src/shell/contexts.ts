// Page contexts an effect can be shown in. The first one is the default.
//
// The mock pages are "someone else's website". They use the shell's tokens and nothing else, so
// each one exists as a dark page and a light page: by default they follow the site theme, and
// the effect page's "Page" control flips the stage on its own (`data-page`, see theme.css),
// because an emissive effect has to be looked at over both. Everything on them is placeholder
// and inert (see `chrome`).

import { OBSTACLE_ATTRIBUTE, OBSTACLE_ROOT_ATTRIBUTE, TARGET_ATTRIBUTE } from '../gpu/dom-rects.ts';
import './contexts.css';

export interface MountedLayout {
  /** The element the effect's canvas goes into. */
  stage: HTMLElement;
  destroy(): void;
}

export interface ContextLayout {
  /** Used in the URL: `?layout=<id>`. */
  id: string;
  title: string;
  /** Builds the layout inside `container`, which is positioned and has a fixed height. */
  mount(container: HTMLElement): MountedLayout;
}

/** How much of the page colour the Backdrop veil lays over the effect, in percent. */
const BACKDROP_VEIL = 62;

/** A translucent version of a theme token, e.g. `scrim('--yh-bg', 60)`. */
export function scrim(token: `--yh-${string}`, strength: number): string {
  const percent = Math.round(Math.min(100, Math.max(0, strength)));
  return `color-mix(in srgb, var(${token}) ${percent}%, transparent)`;
}

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

function list<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  texts: readonly string[],
): HTMLElementTagNameMap[K][] {
  return texts.map((text) => el(tag, className, text));
}

/**
 * Mock page content. `inert` takes it out of the tab order, the accessibility tree, and hit
 * testing, so a screen reader user does not meet fake navigation and pointer input falls
 * through to the canvas underneath. Controls are plain spans for the same reason.
 */
function chrome(className: string, ...children: Node[]): HTMLElement {
  const node = el('div', `yh-context__chrome ${className}`);
  node.inert = true;
  node.append(...children);
  return node;
}

/**
 * Marks mock content as solid for effects that read the page's layout through
 * src/gpu/dom-rects.ts (fire that climbs a card, light that it shadows). Only the marker is
 * added; nothing about how the element looks or behaves changes.
 */
function obstacle<T extends HTMLElement>(node: T): T {
  node.setAttribute(OBSTACLE_ATTRIBUTE, '');
  return node;
}

/**
 * Marks mock content as a target (src/gpu/dom-rects.ts, `TARGET_ATTRIBUTE`): the small things on
 * a page an effect can aim at or gather around, as opposed to the large boxes of `obstacle`.
 */
function target<T extends HTMLElement>(node: T): T {
  node.setAttribute(TARGET_ATTRIBUTE, '');
  return node;
}

function button(label: string, primary = false): HTMLElement {
  return target(el('span', primary ? 'yh-button yh-button--primary' : 'yh-button', label));
}

/** Outermost element of a mock page. The stage inside it is the only live part. */
function page(id: string, description: string, scrolls: boolean): HTMLElement {
  const root = el('div', `yh-context yh-context__page yh-context--${id}`);
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', `Preview: ${description}. The page content is placeholder.`);
  // Scopes the search for obstacles to this mock page.
  root.setAttribute(OBSTACLE_ROOT_ATTRIBUTE, '');
  // A scrolling page must be reachable by keyboard.
  if (scrolls) root.tabIndex = 0;
  return root;
}

function defineLayout(
  id: string,
  title: string,
  description: string,
  scrolls: boolean,
  build: (root: HTMLElement) => HTMLElement,
): ContextLayout {
  return {
    id,
    title,
    mount(container) {
      const root = page(id, description, scrolls);
      const stage = build(root);
      container.append(root);
      return { stage, destroy: () => root.remove() };
    },
  };
}

function stageElement(): HTMLElement {
  return el('div', 'yh-context__stage');
}

const bare: ContextLayout = {
  id: 'bare',
  title: 'Canvas',
  mount(container) {
    const stage = el('div', 'yh-context yh-context--bare');
    container.append(stage);
    return { stage, destroy: () => stage.remove() };
  },
};

const hero = defineLayout(
  'hero',
  'Hero',
  'effect as the background of a landing hero',
  false,
  (root) => {
    const stage = stageElement();
    const nav = obstacle(el('div', 'yh-context__nav'));
    const links = el('div', 'yh-context__nav-links');
    links.append(
      ...list('span', 'yh-context__nav-link', ['Product', 'Pricing', 'Docs']).map(target),
      button('Sign in'),
    );
    nav.append(target(el('span', 'yh-context__brand', 'Your Product')), links);

    const actions = el('div', 'yh-context__actions');
    actions.append(button('Start free', true), button('Read the docs'));
    const copy = obstacle(el('div', 'yh-context__plate yh-context__hero-copy'));
    copy.append(
      el('span', 'yh-label', 'Now in beta'),
      el('h2', 'yh-context__headline', 'Run every deploy without holding your breath'),
      el(
        'p',
        'yh-context__lede yh-muted',
        'Staged rollouts, instant rollback and a calm dashboard for the whole team.',
      ),
      actions,
    );
    const body = el('div', 'yh-context__hero-body');
    body.append(copy);

    root.append(stage, chrome('yh-context__hero-chrome', nav, body));
    return stage;
  },
);

const cards = defineLayout(
  'cards',
  'Cards',
  'a card grid with the effect behind one card',
  true,
  (root) => {
    const stage = stageElement();
    const card = (label: string, title: string, text: string) => {
      const node = target(obstacle(el('div', 'yh-panel yh-context__card')));
      node.inert = true;
      node.append(
        el('span', 'yh-label', label),
        el('h3', 'yh-context__card-title', title),
        el('p', 'yh-muted', text),
      );
      return node;
    };

    const feature = el('div', 'yh-panel yh-context__card yh-context__card--feature');
    const plate = obstacle(el('div', 'yh-context__plate'));
    plate.append(
      el('span', 'yh-label', 'Featured'),
      el('h3', 'yh-context__card-title', 'Live status at a glance'),
      el('p', 'yh-muted', 'See every service and region on one calm screen.'),
    );
    plate.inert = true;
    feature.append(stage, plate);

    const grid = el('div', 'yh-context__grid');
    grid.append(
      card(
        'Alerts',
        'Fewer, better pages',
        'Group related alerts so on-call sees one problem, not twenty.',
      ),
      feature,
      card('Access', 'Roles that fit', 'Give each team the permissions it needs and nothing more.'),
      card(
        'Audit',
        'Every change, recorded',
        'A searchable history of who changed what, and when.',
      ),
      card(
        'Billing',
        'Costs you can predict',
        'Usage forecasts and budgets that warn you before the invoice.',
      ),
    );

    // Only the pieces around the live stage are inert; the card holding it is not.
    const section = el('div', 'yh-context__section');
    section.append(
      obstacle(
        chrome(
          'yh-context__heading',
          el('span', 'yh-label', 'Platform'),
          el('h2', 'yh-context__section-title', 'Everything your team needs in one workspace'),
        ),
      ),
      grid,
    );
    root.append(section);
    return stage;
  },
);

const band = defineLayout(
  'band',
  'Band',
  'a section break with the effect as a full-width band',
  true,
  (root) => {
    const stage = stageElement();
    stage.classList.add('yh-context__band');

    const above = el('section', 'yh-context__section yh-context__above');
    above.append(
      el('span', 'yh-label', 'Reliability'),
      el('h2', 'yh-context__section-title', 'Stay steady when traffic is not'),
      el(
        'p',
        'yh-muted',
        'Autoscaling and queueing absorb a spike before your customers ever notice it.',
      ),
    );

    const columns = el('div', 'yh-context__columns');
    const column = (heading: string, items: readonly string[]) => {
      const node = el('div', 'yh-context__column');
      node.append(el('span', 'yh-label', heading), ...list('span', 'yh-context__link', items));
      return node;
    };
    columns.append(
      column('Product', ['Overview', 'Pricing', 'Changelog']),
      column('Company', ['About', 'Careers', 'Contact']),
      column('Resources', ['Docs', 'Guides', 'Status']),
    );
    const below = el('footer', 'yh-context__section yh-context__below');
    below.append(
      columns,
      el('p', 'yh-muted yh-context__small', '2026 Your Product. All rights reserved.'),
    );

    // The band is live, so it sits outside the inert chrome; the sections around it are not.
    root.append(
      chrome('yh-context__band-above', above),
      stage,
      chrome('yh-context__band-below', below),
    );
    return stage;
  },
);

const backdrop = defineLayout(
  'backdrop',
  'Backdrop',
  'an article with the effect fixed behind the text',
  true,
  (root) => {
    const stage = stageElement();
    const veil = el('div', 'yh-context__veil');
    veil.style.background = scrim('--yh-bg', BACKDROP_VEIL);

    const article = obstacle(el('article', 'yh-context__plate yh-prose yh-context__article'));
    article.append(
      el('span', 'yh-label', 'Engineering notes'),
      el('h2', '', 'What we learned from a year of quiet pages'),
      el(
        'p',
        '',
        'For most of last year our on-call rotation was boring, and that was no accident. We stopped counting alerts and started counting the nights nobody was woken.',
      ),
      el(
        'p',
        '',
        'The biggest win was deleting things. Every alert had to name a person who would act on it and a step they would take. Anything that failed that test was removed.',
      ),
      el('h3', '', 'Make the common path obvious'),
      el(
        'p',
        '',
        'Runbooks used to be long documents that nobody read at three in the morning. We replaced them with a short checklist at the top of each alert, and the long version moved below it.',
      ),
      el(
        'p',
        '',
        'The checklist is reviewed after every incident. If a step was skipped or confusing, it is rewritten before the retrospective is closed.',
      ),
      el('h3', '', 'Measure what people feel'),
      el(
        'p',
        '',
        'Dashboards full of averages hid the slow requests that customers noticed. We moved to percentiles and put the worst five minutes of each week on a wall everyone could see.',
      ),
      el(
        'p',
        '',
        'None of this is clever. It is a habit of looking at the same few numbers together and fixing the boring thing first.',
      ),
    );

    root.append(stage, veil, chrome('yh-context__article-chrome', article));
    return stage;
  },
);

export const layouts: readonly ContextLayout[] = [bare, hero, cards, band, backdrop];
