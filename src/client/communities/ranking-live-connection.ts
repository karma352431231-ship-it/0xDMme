import { WakeupFrames } from '../message-live/index.ts';
/** Public stream: no cookies, signed payloads, cache or cross-origin redirect. */
export class RankingConnection {
  private readonly changed: () => void;
  private stopped = false;
  private controller: AbortController | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  constructor(changed: () => void) {
    this.changed = changed;
    this.connect();
  }
  private connect(): void {
    if (this.stopped) return;
    const controller = new AbortController();
    this.controller = controller;
    void this.consume(controller)
      .catch(() => {
        // Retain the last verified list; reconnecting always reads a fresh generation.
      })
      .finally(() => {
        if (this.stopped) return;
        this.retry = setTimeout(
          () => {
            this.retry = null;
            this.connect();
          },
          Math.min(30000, 1000 * 2 ** Math.min(this.attempts++, 5)),
        );
      });
  }
  private async consume(controller: AbortController): Promise<void> {
    let watchdog = setTimeout(() => controller.abort(), 45000);
    const reset = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => controller.abort(), 45000);
    };
    try {
      const response = await fetch('/api/communities/ranking-events', {
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
        headers: { Accept: 'text/event-stream' },
      });
      if (
        !response.ok ||
        !response.headers
          .get('content-type')
          ?.startsWith('text/event-stream') ||
        !response.body
      )
        throw new Error('Live updates unavailable.');
      await this.read(response.body, reset, controller.signal);
    } finally {
      clearTimeout(watchdog);
      controller.abort();
    }
  }
  private async read(
    body: ReadableStream<Uint8Array>,
    reset: () => void,
    signal: AbortSignal,
  ): Promise<void> {
    const reader = body.getReader(),
      parser = new WakeupFrames();
    try {
      while (!signal.aborted) {
        const chunk = await reader.read();
        if (chunk.done) return;
        reset();
        this.accept(chunk.value, parser, signal);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  private accept(
    bytes: Uint8Array,
    parser: WakeupFrames,
    signal: AbortSignal,
  ): void {
    for (let offset = 0; offset < bytes.length; offset += 4096) {
      const events = parser.accept(bytes.subarray(offset, offset + 4096));
      if (events.some((event) => event !== 'ready' && event !== 'changed'))
        throw new Error('Invalid update notice.');
      if (events.length && !signal.aborted) {
        this.attempts = 0;
        this.changed();
      }
    }
  }
  close(): void {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    this.controller?.abort();
  }
}
