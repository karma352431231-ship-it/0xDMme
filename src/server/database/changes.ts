export interface CommittedChange {
  accounts: readonly string[];
  authorization: boolean;
  removed: boolean;
  revoked: readonly string[];
  ended: readonly string[];
}
interface Observer {
  notify: (change: CommittedChange) => void;
  failed: () => void;
}
/** Advisory, in-process events for the single web service. No content or durable queue. */
export class DatabaseChanges {
  private readonly listeners = new Set<Observer>();
  subscribe(observer: Observer): () => void {
    this.listeners.add(observer);
    return () => {
      this.listeners.delete(observer);
    };
  }
  private observer: Observer | null = null;
  observe(observer: Observer): () => void {
    if (this.observer) throw new Error('Observador de alterações já ativo.');
    this.observer = observer;
    return () => {
      if (this.observer === observer) this.observer = null;
    };
  }
  committed(
    accounts: Iterable<string>,
    details: {
      authorization?: boolean;
      removed?: boolean;
      revoked?: readonly string[];
      ended?: readonly string[];
    } = {},
  ): void {
    const unique = [...new Set(accounts)];
    if (!unique.length) return;
    const change = {
      accounts: unique,
      authorization: details.authorization ?? false,
      removed: details.removed ?? false,
      revoked: details.revoked ?? [],
      ended: details.ended ?? [],
    };
    for (const listener of this.listeners) this.deliver(listener, change);
    if (this.observer) this.deliver(this.observer, change);
  }
  private deliver(observer: Observer, change: CommittedChange): void {
    try {
      observer.notify(change);
    } catch {
      // Never report a durable COMMIT as failed because an advisory event failed.
      // Closing channels forces a fresh snapshot instead of leaving a blind stream.
      observer.failed();
    }
  }
}
