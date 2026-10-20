interface PendingOpening {
  work: () => Promise<void>;
  reuse: () => boolean;
  done: () => void;
}

/** One latest conversation choice, never a queue of stale recipient changes. */
export class ConversationOpening {
  private generation = 0;
  private pending: PendingOpening | null = null;
  get waiting(): boolean {
    return this.pending !== null;
  }
  request(work: () => Promise<void>, reuse?: () => boolean): Promise<void> {
    this.clear();
    const current = this.generation;
    return new Promise((done) => {
      this.pending = {
        work: async () => {
          if (current === this.generation) await work();
        },
        reuse: () => current === this.generation && (reuse?.() ?? false),
        done,
      };
    });
  }
  take(): PendingOpening | null {
    const pending = this.pending;
    this.pending = null;
    return pending;
  }
  clear(): void {
    this.generation++;
    this.pending?.done();
    this.pending = null;
  }
}
