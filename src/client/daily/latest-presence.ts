interface Waiter {
  resolve: () => void;
  reject: (error: unknown) => void;
}

/** Presence only needs its latest desired state. While one heartbeat runs, later
 * submissions replace a single pending follow-up, so a burst of tab switches
 * costs at most two account turns and still ends in the final visibility. Every
 * caller learns the outcome of the heartbeat that carried its state. */
export class LatestPresence {
  private running = false;
  private pending: { active: boolean; waiters: Waiter[] } | null = null;
  private readonly send: (active: boolean) => Promise<void>;
  constructor(send: (active: boolean) => Promise<void>) {
    this.send = send;
  }
  submit(active: boolean): Promise<void> {
    if (!this.running) return this.start(active);
    return new Promise((resolve, reject) => {
      this.pending ??= { active, waiters: [] };
      this.pending.active = active;
      this.pending.waiters.push({ resolve, reject });
    });
  }
  private start(active: boolean): Promise<void> {
    this.running = true;
    const sent = this.send(active);
    void sent
      .catch(() => undefined)
      .then(() => {
        this.running = false;
        this.flush();
      });
    return sent;
  }
  private flush(): void {
    const next = this.pending;
    if (!next) return;
    this.pending = null;
    this.start(next.active).then(
      () => {
        for (const waiter of next.waiters) waiter.resolve();
      },
      (error: unknown) => {
        for (const waiter of next.waiters) waiter.reject(error);
      },
    );
  }
}
