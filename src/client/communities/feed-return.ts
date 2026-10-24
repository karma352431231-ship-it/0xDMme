import { appRoute } from '../../shared/app-routes/index.ts';
import { appAddress } from '../app-navigation/index.ts';
import {
  discoveryPeriod,
  exploreFilter,
  feedOrder,
} from '../../shared/community-discovery/index.ts';
import type {
  DiscoveryPeriod,
  ExploreFilter,
  FeedOrder,
} from '../../shared/community-discovery/index.ts';
import { layoutLength } from '../display-scale/index.ts';

export interface FeedBookmark {
  search?: string;
  view: string;
  order: FeedOrder;
  period: DiscoveryPeriod;
  after: string | null;
  top: number;
  anchor: { id: string; offset: number } | null;
}
interface ReturnNavigation {
  container: () => HTMLElement | null;
  bookmark: () => FeedBookmark | null;
  reset: () => Promise<void>;
  /** A profile opened from the feed: keep the page for an exact return. */
  keep: (bookmark: FeedBookmark) => void;
}
function navigationLink(event: MouseEvent): HTMLAnchorElement | null {
  if (
    !(event.target instanceof Element) ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return null;
  return event.target.closest<HTMLAnchorElement>(
    'a[href^="/communities"], a[href^="/split/communities"], a[href^="#communities"], a[href^="#comunidades"], a[href^="/users"], a[href^="#users"], a[href^="#publico"]',
  );
}
function linkRouteParams(link: HTMLAnchorElement): URLSearchParams {
  return (
    appRoute(link.getAttribute('href') ?? '')?.params ?? new URLSearchParams()
  );
}
function isCommunityDestination(params: URLSearchParams): boolean {
  return (
    params.has('id') || params.has('slug') || params.get('return') === 'feed'
  );
}
export function feedScroller(container: HTMLElement): HTMLElement {
  let node: HTMLElement | null = container;
  while (node) {
    if (/(auto|scroll)/u.test(getComputedStyle(node).overflowY)) return node;
    node = node.parentElement;
  }
  return document.scrollingElement as HTMLElement;
}
export function feedPosition(
  container: HTMLElement,
): Pick<FeedBookmark, 'top' | 'anchor'> {
  const scroll = feedScroller(container),
    top = viewportTop(scroll);
  const card = [
    ...container.querySelectorAll<HTMLElement>('[data-post-id]'),
  ].find((row) => row.getBoundingClientRect().bottom > top);
  return {
    top: scroll.scrollTop,
    anchor: card
      ? {
          id: card.dataset['postId']!,
          offset: layoutLength(card.getBoundingClientRect().top - top, scroll),
        }
      : null,
  };
}
function viewportTop(scroll: HTMLElement): number {
  return scroll === document.scrollingElement
    ? 0
    : scroll.getBoundingClientRect().top;
}
/** Read fresh data on return. Anchor compensation also handles changed cards above it. */
export function restoreFeedPosition(
  container: HTMLElement,
  saved: FeedBookmark,
  signal?: AbortSignal,
): void {
  compensateAnchor(container, saved);
  if (!signal || signal.aborted) return;
  // Late image layout is compensated only until interaction, departure or timeout.
  const lifetime = new AbortController();
  const observer = new ResizeObserver(() => compensateAnchor(container, saved));
  const stop = () => {
    observer.disconnect();
    lifetime.abort();
    clearTimeout(timer);
    signal.removeEventListener('abort', stop);
  };
  const timer = setTimeout(stop, 15_000);
  for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown'])
    document.addEventListener(event, stop, {
      once: true,
      passive: true,
      signal: lifetime.signal,
    });
  signal.addEventListener('abort', stop, { once: true });
  observer.observe(container);
}
function compensateAnchor(container: HTMLElement, saved: FeedBookmark): void {
  const scroll = feedScroller(container);
  scroll.scrollTop = saved.top;
  const anchor = [
    ...container.querySelectorAll<HTMLElement>('[data-post-id]'),
  ].find((row) => row.dataset['postId'] === saved.anchor?.id);
  if (anchor && saved.anchor)
    scroll.scrollTop +=
      layoutLength(
        anchor.getBoundingClientRect().top - viewportTop(scroll),
        scroll,
      ) - saved.anchor.offset;
}
/** One return path in memory. Explicit feed/filter navigation and session changes clear it. */
const keepWindow = 2000;
function pauseMedia(node: Node): void {
  if (
    !('querySelectorAll' in node) ||
    typeof node.querySelectorAll !== 'function'
  )
    return;
  for (const media of (node as ParentNode).querySelectorAll<HTMLMediaElement>(
    'video, audio',
  ))
    media.pause();
}
const heldLifetime = 10 * 60_000;
function sameFeed(a: FeedBookmark, b: FeedBookmark): boolean {
  return (
    a.view === b.view &&
    a.order === b.order &&
    a.period === b.period &&
    (a.search ?? '') === (b.search ?? '')
  );
}
/**
 * The feed page left for a public profile, kept exactly as it was on screen
 * (owner decision of 19/10/2026, option A). Only the last page, only in this
 * tab, for at most ten minutes. Its owner keeps the page's state untouched
 * while it is held and receives it back on the matching return, or tears it
 * down through `release`. Media stops while the page is off screen.
 */
export class FeedPark {
  private requested: {
    bookmark: FeedBookmark;
    at: number;
    visit: boolean;
  } | null = null;
  private held: {
    nodes: Node[];
    bookmark: FeedBookmark;
    signedIn: boolean;
    release: () => void;
    timer: ReturnType<typeof setTimeout> | null;
  } | null = null;
  /** A profile link in the feed was followed; the next departure keeps the page. */
  request(bookmark: FeedBookmark, visit = false): void {
    // The route also pauses after a profile click. Preserve that more specific
    // return's original deadline instead of promoting it to a whole-visit hold.
    if (visit && this.requested && Date.now() - this.requested.at <= keepWindow)
      return;
    this.requested = { bookmark, at: Date.now(), visit };
  }
  get holding(): boolean {
    return this.held !== null;
  }
  /** On departure: true when the page was kept, so its owner must not tear it down. */
  hold(input: {
    nodes: () => Node[];
    signedIn: boolean;
    release: () => void;
  }): boolean {
    const requested = this.requested;
    this.requested = null;
    if (!requested || Date.now() - requested.at > keepWindow) return false;
    this.release();
    const nodes = input.nodes();
    for (const node of nodes) {
      pauseMedia(node);
      node.parentNode?.removeChild(node);
    }
    this.held = {
      nodes,
      signedIn: input.signedIn,
      release: input.release,
      bookmark: requested.bookmark,
      // App-tab navigation retains one bounded page for this visit. Profile
      // return alone keeps its existing ten-minute lifetime.
      timer: requested.visit
        ? null
        : setTimeout(() => this.release(), heldLifetime),
    };
    return true;
  }
  /**
   * Puts the kept page into `container` when the return asks for the same
   * feed and session; otherwise releases it. Returns the saved position.
   */
  resume(
    container: HTMLElement,
    bookmark: FeedBookmark | null,
    signedIn: boolean,
  ): FeedBookmark | null {
    const held = this.held;
    if (!held) return null;
    this.held = null;
    if (held.timer) clearTimeout(held.timer);
    if (
      !bookmark ||
      !sameFeed(held.bookmark, bookmark) ||
      held.signedIn !== signedIn
    ) {
      held.release();
      return null;
    }
    container.append(...held.nodes);
    return held.bookmark;
  }
  release(): void {
    const held = this.held;
    this.held = null;
    this.requested = null;
    if (!held) return;
    if (held.timer) clearTimeout(held.timer);
    held.release();
  }
}

export class FeedReturn {
  private saved: FeedBookmark | null = null;
  bind(options: ReturnNavigation): void {
    document.addEventListener(
      'click',
      (event) => {
        const link = navigationLink(event);
        if (!link) return;
        if (appRoute(link.getAttribute('href') ?? '')?.page === 'users')
          this.followProfile(link, options);
        else this.followLink(link, options);
      },
      { capture: true },
    );
  }
  private followLink(link: HTMLAnchorElement, options: ReturnNavigation): void {
    const params = linkRouteParams(link);
    if (params.has('post') && options.container()?.contains(link)) {
      const bookmark = options.bookmark();
      if (bookmark) this.capture(bookmark);
      return;
    }
    if (isCommunityDestination(params)) return;
    this.clear();
    if (
      (link.getAttribute('href') ?? '') === appAddress() &&
      options.bookmark()
    )
      void options.reset();
  }
  /** Profiles reached from the feed return to it; other profile links keep the way back. */
  private followProfile(
    link: HTMLAnchorElement,
    options: ReturnNavigation,
  ): void {
    if (!options.container()?.contains(link)) return;
    const bookmark = options.bookmark();
    if (!bookmark) return;
    this.capture(bookmark);
    options.keep(bookmark);
  }
  capture(value: FeedBookmark): void {
    this.saved = value;
  }
  clear(): void {
    this.saved = null;
  }
  target(): string | null {
    return this.saved
      ? `#communities?view=${this.saved.view}&return=feed`
      : null;
  }
  take(params: URLSearchParams): FeedBookmark | null {
    if (params.has('id') || params.has('slug') || params.has('post'))
      return null;
    const saved = this.saved;
    this.saved = null;
    return saved?.view === (params.get('view') ?? 'feed') ? saved : null;
  }
}

/**
 * The order and period last chosen in each feed view, kept on this device
 * until the person picks others (owner request, 19/10/2026). Only the three
 * enumerated choices are stored: no account, post or community data. Missing,
 * unreadable or invalid values fall back to the view's defaults, and a return
 * bookmark still restores the exact list it came from.
 */
export interface FeedChoice {
  order?: FeedOrder;
  explore?: ExploreFilter['order'];
  period?: DiscoveryPeriod;
}
type ChoiceStorage = Pick<Storage, 'getItem' | 'setItem'>;
const choiceKey = '0xdmme:feed-choices';
const choiceViews = ['feed', 'following', 'explore'] as const;
type ChoiceView = (typeof choiceViews)[number];
function choiceView(view: string): ChoiceView | null {
  return choiceViews.find((name) => name === view) ?? null;
}
function deviceStorage(): ChoiceStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
function storedChoices(storage: ChoiceStorage): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(storage.getItem(choiceKey) ?? '{}');
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
function validChoice(view: ChoiceView, value: unknown): FeedChoice {
  if (!value || typeof value !== 'object') return {};
  const data = value as Record<string, unknown>;
  try {
    if (view === 'explore') {
      const filter = exploreFilter({
        order: data['explore'],
        period: data['period'],
      });
      return { explore: filter.order, period: filter.period };
    }
    return {
      order: feedOrder(data['order']),
      period: discoveryPeriod(data['period']),
    };
  } catch {
    return {};
  }
}
export function rememberedFeedChoice(
  view: string,
  storage = deviceStorage(),
): FeedChoice {
  const name = choiceView(view);
  if (!name || !storage) return {};
  return validChoice(name, storedChoices(storage)[name]);
}
/** A storage failure keeps the choice for this visit only; nothing else depends on it. */
export function rememberFeedChoice(
  view: string,
  choice: FeedChoice,
  storage = deviceStorage(),
): void {
  const name = choiceView(view);
  if (!name || !storage) return;
  const entry = validChoice(name, choice);
  if (!entry.period) return;
  // Rewrite only the known views, so stale or foreign keys never accumulate.
  const stored = storedChoices(storage);
  const kept = Object.fromEntries(
    choiceViews
      .map((key) => [key, validChoice(key, stored[key])] as const)
      .filter(([, value]) => value.period),
  );
  try {
    storage.setItem(choiceKey, JSON.stringify({ ...kept, [name]: entry }));
  } catch {
    // Private browsing or a full quota: the in-memory choice still applies.
  }
}
