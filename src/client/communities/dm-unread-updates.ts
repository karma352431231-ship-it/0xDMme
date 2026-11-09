import { DmContinuations } from './dm-continuation.ts';
import { expectedInterruption } from '../synchronization-work/index.ts';
type UnreadWork = 'receive' | 'project';
/** Directory notification reads share the existing account wakeups. */
export class DmUnreadUpdates {
  private readonly continuation = new DmContinuations({
    available: () => !this.running && this.available(),
    run: () => {
      const retry = this.retry;
      this.retry = null;
      if (retry) this.request(retry);
    },
  });
  private generation = 0;
  private active = false;
  private enabled = false;
  private pending: UnreadWork | null = null;
  private retry: UnreadWork | null = null;
  private running = false;
  private readonly ports: {
    page: (
      after: string | null,
    ) => Promise<{ peers: string[]; next: string | null }>;
    count: (peers: string[]) => Promise<number>;
    prepare?: () => Promise<void>;
    receives: () => boolean;
    changed: (count: number) => void;
  };
  constructor(ports: DmUnreadUpdates['ports']) {
    this.ports = ports;
  }
  reset(active: boolean): void {
    this.continuation.clear();
    this.generation++;
    this.active = active;
    this.enabled = false;
    this.pending = null;
    this.retry = null;
    this.ports.changed(0);
  }
  start(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.request();
  }
  invalidate(): void {
    this.continuation.clear();
    this.generation++;
    this.pending = null;
    this.retry = null;
    this.ports.changed(0);
  }
  request(update: UnreadWork = 'receive'): void {
    const receives = this.ports.receives();
    if (!this.available() || (update === 'receive' && !receives)) return;
    if (this.pending !== 'receive' || !receives) this.pending = update;
    if (!this.running) void this.refresh();
  }
  private available(): boolean {
    return (
      this.active &&
      this.enabled &&
      document.visibilityState === 'visible' &&
      navigator.onLine
    );
  }
  private async refresh(): Promise<void> {
    const generation = this.generation,
      work = this.pending;
    this.pending = null;
    if (!work || !this.current(generation, work)) return;
    this.running = true;
    try {
      const count = await this.read(generation, work);
      if (count !== null && this.current(generation, work)) {
        this.continuation.clear();
        this.retry = null;
        this.ports.changed(count);
      }
    } catch (error: unknown) {
      if (!this.current(generation, work)) return;
      if (expectedInterruption(error)) {
        this.retry = work;
        this.continuation.request();
      } else {
        // Unknown authority must not retain another session's notification state.
        this.ports.changed(0);
      }
    } finally {
      this.running = false;
      const pending = this.pending;
      this.pending = null;
      if (pending) this.request(pending);
      this.continuation.resume();
    }
  }
  private current(generation: number, work: UnreadWork): boolean {
    return (
      generation === this.generation &&
      (work === 'project' || this.ports.receives())
    );
  }
  private async read(
    generation: number,
    work: UnreadWork,
  ): Promise<number | null> {
    let after: string | null = null,
      total = 0,
      prepared = work === 'project';
    for (let page = 0; page < 64; page++) {
      const result = await this.ports.page(after);
      if (!this.current(generation, work)) return null;
      const counted = await this.countReceivedPage({
        peers: result.peers,
        current: () => this.current(generation, work),
        prepared,
      });
      if (!counted) return null;
      prepared = counted.prepared;
      total += counted.count;
      if (!result.next || total >= 100) return Math.min(100, total);
      if (result.next === after) throw new Error('Invalid DM page.');
      after = result.next;
    }
    throw new Error('Continue syncing DM history.');
  }
  /** Receive once for the account before projecting paginated notifications. */
  private async countReceivedPage(input: {
    peers: string[];
    current: () => boolean;
    prepared: boolean;
  }): Promise<{ count: number; prepared: boolean } | null> {
    if (!input.prepared && input.peers.length) {
      await this.ports.prepare?.();
      if (!input.current()) return null;
    }
    const count = await this.ports.count(input.peers);
    return input.current()
      ? { count, prepared: input.prepared || input.peers.length > 0 }
      : null;
  }
}
