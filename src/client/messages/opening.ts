/** One latest conversation choice, never a queue of stale recipient changes. */
export class ConversationOpening {
  private generation = 0;
  private pending: {
    work: () => Promise<void>;
    done: () => void;
  } | null = null;
  get waiting(): boolean {
    return this.pending !== null;
  }
  request(work: () => Promise<void>): Promise<void> {
    this.clear();
    const current = this.generation;
    return new Promise((done) => {
      this.pending = {
        work: async () => {
          if (current === this.generation) await work();
        },
        done,
      };
    });
  }
  take(): { work: () => Promise<void>; done: () => void } | null {
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
