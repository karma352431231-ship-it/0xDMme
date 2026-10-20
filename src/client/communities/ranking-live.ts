import { RankingConnection } from './ranking-live-connection.ts';
interface Subscriber {
  visible: () => boolean;
  refresh: () => Promise<void>;
  dirty: boolean;
  running: boolean;
}
const subscribers = new Set<Subscriber>();
let stream: RankingConnection | null = null;
let observer: MutationObserver | null = null;
/** One public stream per tab. Hidden panels disconnect; reconnects reconcile a fresh snapshot. */
export function watchRankingUpdates(options: {
  visible: () => boolean;
  refresh: () => Promise<void>;
  signal?: AbortSignal;
  enabled?: boolean;
}): () => void {
  if (
    typeof MutationObserver === 'undefined' ||
    options.signal?.aborted ||
    options.enabled === false
  )
    return () => {};
  const subscriber: Subscriber = { ...options, dirty: false, running: false };
  subscribers.add(subscriber);
  if (subscribers.size === 1) {
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('online', sync);
    window.addEventListener('resize', sync);
    observer = new MutationObserver(sync);
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-page', 'data-right', 'data-collapsed', 'hidden'],
    });
  }
  sync();
  const stop = () => {
    subscribers.delete(subscriber);
    if (!subscribers.size) {
      observer?.disconnect();
      observer = null;
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('online', sync);
      window.removeEventListener('resize', sync);
    }
    sync();
  };
  options.signal?.addEventListener('abort', stop, { once: true });
  return stop;
}
function visible(subscriber: Subscriber): boolean {
  return (
    document.visibilityState !== 'hidden' &&
    subscribers.has(subscriber) &&
    subscriber.visible()
  );
}
function sync(): void {
  const active = [...subscribers].some(visible);
  if (!active) {
    stream?.close();
    stream = null;
    return;
  }
  if (stream) return;
  stream = new RankingConnection(changed);
}
function changed(): void {
  for (const subscriber of subscribers) {
    if (!visible(subscriber)) continue;
    subscriber.dirty = true;
    void drain(subscriber);
  }
}
async function drain(subscriber: Subscriber): Promise<void> {
  if (subscriber.running) return;
  subscriber.running = true;
  try {
    while (subscriber.dirty && visible(subscriber)) {
      subscriber.dirty = false;
      await subscriber.refresh();
    }
  } catch {
    /* The view owns error presentation; a later publication/reconnect retries. */
  } finally {
    subscriber.running = false;
  }
}
