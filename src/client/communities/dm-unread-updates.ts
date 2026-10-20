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
      total = 0;
    for (let page = 0; page < 64; page++) {
      const result = await this.ports.page(after);
      if (generation !== this.generation) return 0;
      total += await this.ports.count(result.peers);
      if (generation !== this.generation) return 0;
      if (!result.next || total >= 100) return Math.min(100, total);
      if (result.next === after) throw new Error('Invalid DM page.');
      after = result.next;
    }
    throw new Error('Continue syncing DM history.');
  }
}
