interface PendingRefresh {
  offline: boolean;
  priority: 'interactive' | undefined;
  promise: Promise<void>;
}

/** Share only an unstarted read, never an active or completed authority result. */
export class QueuedVaultRefresh {
  private pending: PendingRefresh | null = null;

  barrier(): void {
    this.pending = null;
  }

  read(
    offline: boolean,
    schedule: (started: () => void) => Promise<void>,
    priority?: 'interactive',
  ): Promise<void> {
    if (this.pending?.offline === offline && this.pending.priority === priority)
      return this.pending.promise;
    let resolve: () => void = () => {};
    let reject: (reason: unknown) => void = () => {};
    const promise = new Promise<void>((accept, fail) => {
      resolve = accept;
      reject = fail;
    });
    const pending = { offline, priority, promise };
    this.pending = pending;
    const started = () => {
      if (this.pending === pending) this.pending = null;
    };
    try {
      void schedule(started).then(
        () => {
          started();
          resolve();
        },
        (error: unknown) => {
          started();
          reject(error);
        },
      );
    } catch (error: unknown) {
      started();
      reject(error);
    }
    return promise;
  }
}
