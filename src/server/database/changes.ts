export interface CommittedChange {
  accounts: readonly string[];
  authorization: boolean;
  revoked: readonly string[];
  ended: readonly string[];
}
interface Observer {
  notify: (change: CommittedChange) => void;
  failed: () => void;
}
/** Advisory, in-process events for the single web service. No content or durable queue. */
export class DatabaseChanges {
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
      revoked?: readonly string[];
      ended?: readonly string[];
    } = {},
  ): void {
    const unique = [...new Set(accounts)],
      observer = this.observer;
    if (!unique.length || !observer) return;
    try {
      observer.notify({
        accounts: unique,
        authorization: details.authorization ?? false,
        revoked: details.revoked ?? [],
        ended: details.ended ?? [],
      });
    } catch {
      // Never report a durable COMMIT as failed because an advisory event failed.
      // Closing channels forces a fresh snapshot instead of leaving a blind stream.
      observer.failed();
    }
  }
}
