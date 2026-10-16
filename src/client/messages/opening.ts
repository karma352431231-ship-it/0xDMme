/** One latest conversation choice, never a queue of stale recipient changes. */
export class ConversationOpening {
  private pending: {
    work: () => Promise<void>;
    done: () => void;
  } | null = null;
  get waiting(): boolean {
    return this.pending !== null;
  }
  request(work: () => Promise<void>): Promise<void> {
    this.clear();
    return new Promise((done) => {
      this.pending = { work, done };
    });
  }
  take(): { work: () => Promise<void>; done: () => void } | null {
    const pending = this.pending;
    this.pending = null;
    return pending;
  }
  clear(): void {
    this.pending?.done();
    this.pending = null;
  }
}
