import type {
  EngagementObservation,
  EngagementVisitor,
} from '../../shared/engagement-metrics/index.ts';

/** Volatile bounded observations; a failed collector never blocks the app. */
export class PublicObservationQueue {
  private pending: EngagementObservation[] = [];
  private pendingVisitor: EngagementVisitor | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: AbortController | null = null;
  private closed = false;
  private failures = 0;
  private readonly send: typeof fetch;

  constructor(send: typeof fetch = fetch) {
    this.send = send;
  }
  observe(item: EngagementObservation): void {
    if (this.closed || this.pending.length >= 64) return;
    this.pending.push(item);
    this.schedule(100);
  }
  visitor(marker: string): void {
    if (this.closed) return;
    this.pendingVisitor = { id: crypto.randomUUID(), marker };
    this.schedule(100);
  }
  private schedule(wait: number): void {
    if (
      this.timer ||
      this.running ||
      this.closed ||
      (!this.pending.length && !this.pendingVisitor)
    )
      return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, wait);
  }
  private async flush(): Promise<void> {
    const batch = this.pending.slice(0, 24);
    const visitor = this.pendingVisitor;
    this.running = new AbortController();
    try {
      if (batch.length)
        await this.request('/api/engagement/observations', { items: batch });
      if (visitor) await this.request('/api/engagement/visitors', visitor);
      this.pending.splice(0, batch.length);
      if (this.pendingVisitor === visitor) this.pendingVisitor = null;
      this.failures = 0;
    } catch {
      if (++this.failures >= 2) {
        this.pending.splice(0, batch.length);
        if (this.pendingVisitor === visitor) this.pendingVisitor = null;
        this.failures = 0;
      }
    } finally {
      this.running = null;
      this.schedule(3000);
    }
  }
  private async request(url: string, body: unknown): Promise<void> {
    const response = await this.send(url, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.any([
        this.running!.signal,
        AbortSignal.timeout(5000),
      ]),
    });
    if (!response.ok) throw new Error('Public collection unavailable.');
  }
  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.running?.abort();
    this.pending = [];
    this.pendingVisitor = null;
  }
}
