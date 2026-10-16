import { t } from '../../shared/i18n/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import { paintAvatar } from '../appearance/index.ts';
import { showIdentityPhoto } from '../public-identity/index.ts';
import { feedScroller } from './feed-return.ts';

/** Authors of posts newer than the first page last shown; empty when nothing is new. */
export type PeekNewAuthors = (signal: AbortSignal) => Promise<PublicProfile[]>;

const peekInterval = 45_000;
const nearTop = 120;
const hideAfterScroll = 400;

/**
 * X-style "↑ posted" pill (16/10/2026), replacing "Reload from the beginning".
 * It appears once the reader has gone deep into the feed and then returns to
 * the top, taps the active Feed/Discover tab, or when newer posts exist.
 * Pressing it scrolls up and reloads only the feed, never the whole page.
 */
export class FeedRefresh {
  private readonly container: HTMLElement;
  private readonly signal: AbortSignal;
  private readonly refresh: () => Promise<void>;
  private readonly peek: PeekNewAuthors | null;
  private readonly bar: HTMLElement;
  private readonly pill: HTMLButtonElement;
  private readonly faces: HTMLElement;
  private readonly label: HTMLElement;
  private deep = false;
  private shownAt: number | null = null;
  private withPosts = false;
  private peeking = false;
  private queued = false;
  private releases: (() => void)[] = [];

  constructor(options: {
    container: HTMLElement;
    signal: AbortSignal;
    refresh: () => Promise<void>;
    peek: PeekNewAuthors | null;
  }) {
    this.container = options.container;
    this.signal = options.signal;
    this.refresh = options.refresh;
    this.peek = options.peek;
    this.bar = document.createElement('div');
    this.bar.className = 'feed-refresh';
    this.bar.hidden = true;
    this.pill = document.createElement('button');
    this.pill.type = 'button';
    this.pill.className = 'feed-refresh-pill';
    const arrow = document.createElement('span');
    arrow.className = 'feed-refresh-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '↑';
    this.faces = document.createElement('span');
    this.faces.className = 'feed-refresh-faces';
    this.label = document.createElement('span');
    this.pill.append(arrow, this.faces, this.label);
    this.bar.append(this.pill);
    this.container.prepend(this.bar);
    this.pill.addEventListener('click', () => void this.activate());
    document.addEventListener('scroll', () => this.queueScroll(), {
      capture: true,
      passive: true,
      signal: this.signal,
    });
    const timer = setInterval(() => void this.lookForPosts(), peekInterval);
    this.signal.addEventListener(
      'abort',
      () => {
        clearInterval(timer);
        this.releaseFaces();
      },
      { once: true },
    );
  }

  /**
   * The active Feed/Discover tab was pressed again. Deep in the feed it scrolls
   * up and offers the pill; near the top the caller reloads directly.
   */
  tabAgain(): boolean {
    const scroller = feedScroller(this.container);
    if (!this.deep && scroller.scrollTop < scroller.clientHeight / 2)
      return false;
    scroller.scrollTo({ top: 0, behavior: 'smooth' });
    this.show(0);
    return true;
  }

  private queueScroll(): void {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => {
      this.queued = false;
      this.scrolled();
    });
  }

  private scrolled(): void {
    if (!this.container.isConnected) return;
    const scroller = feedScroller(this.container),
      top = scroller.scrollTop;
    if (top > scroller.clientHeight * 1.5) this.deep = true;
    if (this.deep && top < nearTop && this.bar.hidden) this.show(top);
    if (
      !this.withPosts &&
      this.shownAt !== null &&
      top > this.shownAt + hideAfterScroll
    )
      this.hide();
  }

  private show(top: number): void {
    this.shownAt = top;
    if (!this.withPosts) this.label.textContent = t('feed.refresh');
    this.pill.setAttribute('aria-label', t('feed.refresh-label'));
    this.bar.hidden = false;
    void this.lookForPosts(true);
  }

  private hide(): void {
    this.bar.hidden = true;
    this.shownAt = null;
    this.withPosts = false;
    this.releaseFaces();
  }

  private async activate(): Promise<void> {
    this.hide();
    this.deep = false;
    feedScroller(this.container).scrollTo({ top: 0, behavior: 'smooth' });
    await this.refresh();
  }

  /** Bounded: one request per interval, only while the reader is away from the newest posts. */
  private async lookForPosts(now = false): Promise<void> {
    const peek = this.peek;
    if (!peek || !this.mayPeek(now)) return;
    this.peeking = true;
    try {
      const authors = await peek(this.signal);
      if (authors.length && !this.signal.aborted) this.showPosts(authors);
    } catch {
      // A failed check keeps the plain refresh pill; the next interval retries.
    } finally {
      this.peeking = false;
    }
  }

  private mayPeek(now: boolean): boolean {
    if (this.peeking || this.signal.aborted || document.hidden) return false;
    if (!this.container.isConnected) return false;
    return now || this.deep || !this.bar.hidden;
  }

  private showPosts(authors: readonly PublicProfile[]): void {
    this.releaseFaces();
    this.faces.replaceChildren(
      ...authors.slice(0, 3).map((author) => {
        const face = document.createElement('span');
        face.className = 'community-avatar person feed-refresh-face';
        paintAvatar(face, { label: author.handle, seed: author.id });
        this.releases.push(showIdentityPhoto(face, author, this.signal));
        return face;
      }),
    );
    this.withPosts = true;
    this.label.textContent = t('feed.posted');
    this.pill.setAttribute('aria-label', t('feed.posted-label'));
    if (this.bar.hidden) {
      this.shownAt = feedScroller(this.container).scrollTop;
      this.bar.hidden = false;
    }
  }

  private releaseFaces(): void {
    for (const release of this.releases) release();
    this.releases = [];
    this.faces.replaceChildren();
  }
}
