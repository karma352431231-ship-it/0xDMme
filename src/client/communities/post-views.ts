import type { CommunityPost } from '../../shared/community-posts/index.ts';
import { postViewsPage } from '../../shared/community-views/index.ts';
import { communityElement as el } from './elements.ts';
import { communityIcon } from './presentation.ts';

interface Exposure {
  post: CommunityPost;
  label: HTMLElement;
  since: number | null;
}
interface PendingView {
  community: string;
  post: string;
  token: string;
  labels: Set<HTMLElement>;
}
function qualified(state: Exposure): boolean {
  return (
    state.since !== null &&
    performance.now() - state.since >= 1000 &&
    document.visibilityState === 'visible'
  );
}
const prefix = '0xdmme:post-view:v1:';
function browserMark(post: string): string | null {
  try {
    const key = `${prefix}${post}`,
      old = localStorage.getItem(key);
    if (old?.endsWith(':seen')) return null;
    if (old && /^[a-f0-9]{32}$/u.test(old)) return old;
    const token = Array.from(
      crypto.getRandomValues(new Uint8Array(16)),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('');
    localStorage.setItem(key, token);
    return token;
  } catch {
    // Without persistent deduplication, do not silently count every reload.
    return null;
  }
}
function confirmed(item: PendingView): void {
  try {
    if (localStorage.getItem(`${prefix}${item.post}`) === item.token)
      localStorage.setItem(`${prefix}${item.post}`, `${item.token}:seen`);
  } catch {
    /* Server deduplication remains authoritative for the admitted mark. */
  }
}
function labelCount(label: HTMLElement, views: number): void {
  const value = label.querySelector('span');
  if (value) value.textContent = views.toLocaleString('pt-BR');
  label.setAttribute('aria-label', `${views} visualizações estimadas`);
}
/** One observer/timer and bounded batches for public and signed-in post cards. */
class ViewExposure {
  private readonly entries = new Map<HTMLElement, Exposure>();
  private readonly pending = new Map<string, PendingView>();
  private observer: IntersectionObserver | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private retry = 0;
  private sendAt = 0;
  track(
    node: HTMLElement,
    post: CommunityPost,
    label: HTMLElement,
  ): () => void {
    if (this.entries.size >= 256 || typeof IntersectionObserver === 'undefined')
      return () => {};
    if (!this.observer) {
      this.observer = new IntersectionObserver((items) => this.exposed(items), {
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
      });
      document.addEventListener('visibilitychange', () => this.visibility());
    }
    this.entries.set(node, { post, label, since: null });
    this.observer.observe(node);
    return () => {
      this.entries.delete(node);
      this.observer?.unobserve(node);
    };
  }
  private visibility(): void {
    for (const [node, state] of this.entries) {
      state.since = null;
      this.observer?.unobserve(node);
      if (document.visibilityState === 'visible') this.observer?.observe(node);
    }
    this.schedule();
  }
  private exposed(items: IntersectionObserverEntry[]): void {
    for (const item of items) {
      const state = this.entries.get(item.target as HTMLElement);
      if (!state) continue;
      const visible =
        document.visibilityState === 'visible' &&
        item.isIntersecting &&
        item.intersectionRect.height >=
          Math.min(300, item.boundingClientRect.height / 2);
      state.since = visible ? (state.since ?? performance.now()) : null;
    }
    this.schedule();
  }
  private schedule(delay?: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const next = Math.min(
      ...Array.from(this.entries.values(), (state) =>
        state.since === null
          ? Infinity
          : state.since + 1000 - performance.now(),
      ),
    );
    const queued =
      this.pending.size && !this.running
        ? this.sendAt - performance.now()
        : Infinity;
    const wait = Math.min(delay ?? Infinity, next, queued);
    if (!Number.isFinite(wait)) return;
    this.timer = setTimeout(
      () => {
        this.timer = null;
        this.collect();
      },
      Math.max(1, wait),
    );
  }
  private collect(): void {
    for (const [node, state] of this.entries) {
      if (!node.isConnected) {
        this.entries.delete(node);
        this.observer?.unobserve(node);
        continue;
      }
      if (!qualified(state)) continue;
      this.entries.delete(node);
      this.observer?.unobserve(node);
      const token = browserMark(state.post.id);
      if (!token || this.pending.size >= 256) continue;
      const item = this.pending.get(state.post.id) ?? {
        community: state.post.community,
        post: state.post.id,
        token,
        labels: new Set<HTMLElement>(),
      };
      item.labels.add(state.label);
      this.pending.set(state.post.id, item);
    }
    this.schedule();
    void this.send();
  }
  private async send(): Promise<void> {
    if (this.running || !this.pending.size || this.sendAt > performance.now())
      return;
    this.running = true;
    const batch = Array.from(this.pending.values()).slice(0, 24);
    let failed = false;
    try {
      const response = await fetch('/api/communities/views', {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: batch.map(({ community, post, token }) => ({
            community,
            post,
            token,
          })),
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error('Contagem indisponível.');
      this.acknowledge(batch, postViewsPage(await response.json()));
      this.retry = 0;
    } catch {
      failed = true;
      this.rejectBatch(batch);
    } finally {
      this.running = false;
      this.sendAt = performance.now() + (failed ? 3000 : 0);
      this.schedule();
    }
  }
  private acknowledge(
    batch: PendingView[],
    items: { id: string; views: number }[],
  ): void {
    const counts = new Map(items.map((item) => [item.id, item.views]));
    for (const item of batch) {
      this.pending.delete(item.post);
      const views = counts.get(item.post);
      if (views === undefined) continue;
      confirmed(item);
      for (const label of item.labels)
        if (label.isConnected) labelCount(label, views);
    }
  }
  private rejectBatch(batch: PendingView[]): void {
    if (++this.retry < 2) return;
    for (const item of batch) {
      this.pending.delete(item.post);
      for (const label of item.labels)
        label.title =
          'Contagem disponível; esta visualização não pôde ser confirmada.';
    }
    this.retry = 0;
  }
}
const exposure = new ViewExposure();
export function postViews(
  node: HTMLElement,
  post: CommunityPost,
  toolbar: HTMLElement,
): () => void {
  if (post.status !== 'visible') {
    if (post.status === 'deleted') {
      try {
        localStorage.removeItem(`${prefix}${post.id}`);
      } catch {
        /* Storage may be disabled. */
      }
    }
    return () => {};
  }
  const label = el('span', '', 'post-action post-views');
  label.title =
    'Estimativa de navegadores únicos por post, incluindo visitantes sem login.';
  label.append(
    communityIcon('eye'),
    el('span', '—'),
    el('span', 'visualizações', 'post-action-caption'),
  );
  if (post.views !== undefined) labelCount(label, post.views);
  toolbar.append(label);
  return exposure.track(node, post, label);
}
