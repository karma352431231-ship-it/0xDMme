import { LiveUpdates, scopedLiveEvent } from '../message-live/index.ts';
import type { LiveEvent } from '../message-live/index.ts';

/** Generic hints trigger current signed reads, never carry notification data. */
export class ActivityUpdates {
  private active = false;
  private pending = false;
  private running: Promise<void> | null = null;
  private lifetime = new AbortController();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly read: () => Promise<void>;
  private readonly failed: (error: unknown) => void;
  private readonly updates: LiveUpdates;
  constructor(options: {
    read: () => Promise<void>;
    failed: (error: unknown) => void;
  }) {
    this.read = options.read;
    this.failed = options.failed;
    this.updates = new LiveUpdates({
      available: () => this.available(),
      run: () => {
        void this.refresh().catch(this.failed);
      },
    });
  }
  private available(): boolean {
    return this.active && !document.hidden && navigator.onLine;
  }
  start(): void {
    if (this.active) return;
    this.active = true;
    this.lifetime = new AbortController();
    const options = { signal: this.lifetime.signal };
    document.addEventListener(
      'visibilitychange',
      () => this.request(),
      options,
    );
    window.addEventListener('online', () => this.request(), options);
    window.addEventListener('focus', () => this.request(), options);
    navigator.serviceWorker?.addEventListener(
      'message',
      (event: MessageEvent<unknown>) => {
        const data = event.data;
        if (
          typeof data === 'object' &&
          data !== null &&
          'type' in data &&
          data.type === 'ACTIVITY_CHANGED'
        )
          this.request();
      },
      options,
    );
    this.request();
    this.schedule();
  }
  stop(): void {
    this.active = false;
    this.pending = false;
    this.lifetime.abort();
    this.updates.clear();
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
  event(event: LiveEvent): void {
    const hint = scopedLiveEvent(event, ['activity', 'contacts', 'vault']);
    if (hint && ['ready', 'changed', 'removed', 'authorization'].includes(hint))
      this.request();
  }
  request(): void {
    if (this.active) this.updates.request();
  }
  refresh(): Promise<void> {
    if (this.running) {
      this.pending = true;
      return this.running;
    }
    this.running = this.drain().finally(() => {
      this.running = null;
    });
    return this.running;
  }
  private async drain(): Promise<void> {
    do {
      this.pending = false;
      await this.read();
    } while (this.pending && this.available());
  }
  private schedule(): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.active) return;
      this.request();
      this.schedule();
    }, 30_000);
  }
}
