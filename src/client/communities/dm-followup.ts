/** Keep only the latest painted window's optional work. An old request can
 * finish without blocking the next verified render or scheduling more work. */
export class DmFollowup {
  private pending: (() => Promise<void>) | null = null;
  private running = false;
  request(work: () => Promise<void>, replace = true): void {
    if (!replace && this.pending) return;
    this.pending = work;
    if (!this.running) void this.run();
  }
  clear(): void {
    this.pending = null;
  }
  private async run(): Promise<void> {
    this.running = true;
    try {
      while (this.pending) {
        const work = this.pending;
        this.pending = null;
        await work();
      }
    } finally {
      this.running = false;
    }
  }
}
