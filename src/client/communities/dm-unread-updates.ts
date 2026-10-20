/** Directory notification reads share the existing account wakeups. */
export class DmUnreadUpdates {
  private generation = 0;
  private active = false;
  private enabled = false;
  private pending = false;
  private running = false;
  private readonly ports: {
    page: (
      after: string | null,
    ) => Promise<{ peers: string[]; next: string | null }>;
    count: (peers: string[]) => Promise<number>;
    prepare?: () => Promise<void>;
    changed: (count: number) => void;
  };
  constructor(ports: DmUnreadUpdates['ports']) {
    this.ports = ports;
  }
  reset(active: boolean): void {
    this.generation++;
    this.active = active;
    this.enabled = false;
    this.pending = false;
    this.ports.changed(0);
  }
  start(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.request();
  }
  invalidate(): void {
    this.generation++;
    this.pending = false;
    this.ports.changed(0);
  }
  request(): void {
    if (
      !this.active ||
      !this.enabled ||
      document.visibilityState !== 'visible' ||
      !navigator.onLine
    )
      return;
    this.pending = true;
    if (!this.running) void this.refresh();
  }
  private async refresh(): Promise<void> {
    this.running = true;
    const generation = this.generation;
    this.pending = false;
    try {
      const count = await this.read(generation);
      if (generation === this.generation) this.ports.changed(count);
    } catch {
      // Unknown authority must not retain another session's notification state.
      if (generation === this.generation) this.ports.changed(0);
    } finally {
      this.running = false;
      if (this.pending) this.request();
    }
  }
  private async read(generation: number): Promise<number> {
    let after: string | null = null,
      total = 0,
      prepared = false;
    for (let page = 0; page < 64; page++) {
      const result = await this.ports.page(after);
      if (generation !== this.generation) return 0;
      const counted = await this.countReceivedPage({
        peers: result.peers,
        generation,
        prepared,
      });
      if (!counted) return 0;
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
    generation: number;
    prepared: boolean;
  }): Promise<{ count: number; prepared: boolean } | null> {
    if (!input.prepared && input.peers.length) {
      await this.ports.prepare?.();
      if (input.generation !== this.generation) return null;
    }
    const count = await this.ports.count(input.peers);
    return input.generation === this.generation
      ? { count, prepared: input.prepared || input.peers.length > 0 }
      : null;
  }
}
