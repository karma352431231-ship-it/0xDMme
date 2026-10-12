import type {
  DiscoveryPeriod,
  FeedOrder,
} from '../../shared/community-discovery/index.ts';

export interface FeedBookmark {
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
  return event.target.closest<HTMLAnchorElement>('a[href^="#comunidades"]');
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
          offset: card.getBoundingClientRect().top - top,
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
      anchor.getBoundingClientRect().top -
      viewportTop(scroll) -
      saved.anchor.offset;
}
/** One return path in memory. Explicit feed/filter navigation and session changes clear it. */
export class FeedReturn {
  private saved: FeedBookmark | null = null;
  bind(options: ReturnNavigation): void {
    document.addEventListener(
      'click',
      (event) => {
        const link = navigationLink(event);
        if (!link) return;
        this.followLink(link, options);
      },
      { capture: true },
    );
  }
  private followLink(link: HTMLAnchorElement, options: ReturnNavigation): void {
    const params = new URLSearchParams(link.hash.split('?')[1] ?? '');
    if (params.has('post') && options.container()?.contains(link)) {
      const bookmark = options.bookmark();
      if (bookmark) this.capture(bookmark);
      return;
    }
    if (params.has('id') || params.get('return') === 'feed') return;
    this.clear();
    if (link.hash === location.hash && options.bookmark()) void options.reset();
  }
  capture(value: FeedBookmark): void {
    this.saved = value;
  }
  clear(): void {
    this.saved = null;
  }
  target(): string | null {
    return this.saved
      ? `#comunidades?view=${this.saved.view}&return=feed`
      : null;
  }
  take(params: URLSearchParams): FeedBookmark | null {
    if (params.has('id') || params.has('post')) return null;
    const saved = this.saved;
    this.saved = null;
    return saved?.view === (params.get('view') ?? 'feed') ? saved : null;
  }
}
